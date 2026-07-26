/**
 * Modul_MaintainPengurus.gs — CRUD Data Pengurus (jabatan kepengurusan Kelompok:
 * Pembina/Wk Pembina Generus, PJP, Kepsek, Pembina Pra Remaja/Remaja, Ketua Muda-Mudi).
 * Server-side functions dipanggil dari Index.html (bagian "Data Pengurus" di Data Master).
 *
 * Model: satu jabatan cuma dijabat SATU orang per Kelompok pada satu waktu (bukan
 * riwayat berlapis seperti Siklus Generus) — "+ Pengurus" jadi UPSERT: kalau
 * jabatan itu sudah ada pengurusnya di Kelompok ini, namanya diganti (bukan
 * baris baru). Nama pengurus BEBAS diketik (bukan ambil dari Data Master
 * Guru/Generus existing) karena pengurus tidak selalu tercatat di kedua tabel itu.
 *
 * RBAC: Admin Kelompok/Desa hanya bisa akses Kelompok yang jadi scope mereka. Admin PPG akses semua.
 */

const JABATAN_PENGURUS_ = [
  'Pembina Generus Kelp',
  'Wk Pembina Generus Kelp',
  'PJP Kelp',
  'Kepsek',
  'Pembina Pra Remaja',
  'Pembina Remaja',
  'Ketua Muda-Mudi',
  'Sekertaris Generus',
  'Koord Tahfidz',
  'Bendahara',
];

/** Dapukan yang boleh dijabat LEBIH DARI SATU orang sekaligus (mis. beberapa Wk
    Pembina) — jadi selalu ditambah baris baru, TIDAK di-upsert seperti dapukan lain. */
const MULTI_HOLDER_JABATAN_ = ['Wk Pembina Generus Kelp'];

/**
 * GET daftar pengurus untuk satu Kelompok.
 */
function serverGetPengurusList(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  let data = readSheetAsObjects(SHEET_NAMES.PENGURUS_KELP);
  data = data.filter(p => p.kelompok_id == kelompokId).map(p => ({
    id: p.id,
    kelompok_id: p.kelompok_id,
    jabatan: p.jabatan ? String(p.jabatan) : '',
    nama: p.nama ? String(p.nama) : '',
    mulai_dapukan: p.mulai_dapukan ? String(p.mulai_dapukan) : '',
    keterangan: p.keterangan ? String(p.keterangan) : '',
  }));

  return { success: true, data: data };
}

/**
 * Simpan pengurus. Dua mode:
 * - EDIT (data.id terisi): update baris ITU SAJA by id — tidak pernah salah
 *   sasaran ke baris lain meski dapukannya sama (penting utk dapukan
 *   multi-orang seperti Wk Pembina Generus Kelp).
 * - TAMBAH (data.id kosong): dapukan single-holder di-UPSERT (kalau sudah ada
 *   pengurusnya, namanya diganti); dapukan multi-holder (MULTI_HOLDER_JABATAN_)
 *   SELALU jadi baris baru.
 * Input: {id?, kelompok_id, jabatan, nama, mulai_dapukan?, keterangan?}
 */
function serverSavePengurus(token, data) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!data.kelompok_id || !data.jabatan || !String(data.nama || '').trim()) {
    return { success: false, error: 'Dapukan dan nama pengurus wajib diisi.' };
  }

  if (JABATAN_PENGURUS_.indexOf(data.jabatan) === -1) {
    return { success: false, error: 'Dapukan tidak valid.' };
  }

  if (!validateUserAccess(token, 'kelompok', data.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  try {
    return withScriptLock_(function () {
      const now = new Date().toISOString().split('T')[0];
      const allPengurus = readSheetAsObjects(SHEET_NAMES.PENGURUS_KELP);

      const updateExisting = function (row) {
        updateRowByQuery(SHEET_NAMES.PENGURUS_KELP, { id: row.id }, {
          nama: data.nama.trim(),
          mulai_dapukan: data.mulai_dapukan || '',
          keterangan: data.keterangan || '',
          diubah_oleh: user.id,
          diubah_pada: now,
        });
        logAudit(SHEET_NAMES.PENGURUS_KELP, row.id, 'update', user.id, `${data.jabatan} -> ${data.nama}`);
        return { success: true, message: 'Pengurus berhasil diperbarui.', id: row.id };
      };

      if (data.id) {
        const existingById = allPengurus.find(p => p.id == data.id && p.kelompok_id == data.kelompok_id);
        if (!existingById) return { success: false, error: 'Data pengurus tidak ditemukan.' };
        return updateExisting(existingById);
      }

      const isMultiHolder = MULTI_HOLDER_JABATAN_.indexOf(data.jabatan) !== -1;
      const existing = !isMultiHolder && allPengurus.find(p => p.kelompok_id == data.kelompok_id && p.jabatan === data.jabatan);
      if (existing) return updateExisting(existing);

      const id = generateId(SHEET_NAMES.PENGURUS_KELP);
      appendRowToSheet(SHEET_NAMES.PENGURUS_KELP, [
        id,
        data.kelompok_id,
        data.jabatan,
        data.nama.trim(),
        data.mulai_dapukan || '',
        data.keterangan || '',
        user.id,
        now,
        '',
        '',
      ]);
      logAudit(SHEET_NAMES.PENGURUS_KELP, id, 'create', user.id, `${data.jabatan} -> ${data.nama}`);
      return { success: true, message: 'Pengurus berhasil ditambahkan.', id: id };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menyimpan: ' + e.message };
  }
}

/**
 * DELETE (kosongkan) jabatan pengurus.
 */
function serverDeletePengurus(token, pengurusId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const pengurus = readSheetAsObjects(SHEET_NAMES.PENGURUS_KELP).find(p => p.id == pengurusId);
  if (!pengurus) return { success: false, error: 'Data pengurus tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', pengurus.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke data ini.' };
  }

  try {
    return withScriptLock_(function () {
      deleteRowByQuery(SHEET_NAMES.PENGURUS_KELP, { id: pengurus.id });
      logAudit(SHEET_NAMES.PENGURUS_KELP, pengurusId, 'delete', user.id, 'deleted');
      return { success: true, message: 'Pengurus berhasil dihapus.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menghapus: ' + e.message };
  }
}
