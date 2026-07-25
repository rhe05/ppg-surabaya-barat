/**
 * Modul_MaintainSiklusGenerus.gs — CRUD Siklus Generus (riwayat fase generus setelah
 * lulus/keluar dari jenjang pengajian aktif: Kerja/Kuliah/Pindah/Mondok/Tugas/Tidak Aktif).
 * Server-side functions dipanggil dari Index.html (bagian "Siklus Generus" di Data Master).
 *
 * Model: satu baris = satu catatan siklus, terikat ke santri_id yang SUDAH ADA di Data
 * Master (bukan bikin generus baru) — sesuai pola "pilih santri existing" di Jadwal KBM.
 * Satu generus bisa punya banyak catatan siklus (riwayat dari waktu ke waktu).
 *
 * RBAC: Admin Kelompok/Desa hanya bisa akses Kelompok yang jadi scope mereka. Admin PPG akses semua.
 */

const JENIS_SIKLUS_GENERUS_ = ['Kerja', 'Kuliah', 'Pindah', 'Mondok', 'Tugas', 'Tidak Aktif'];

/**
 * GET daftar siklus generus untuk satu Kelompok, terurut tanggal terbaru dulu.
 */
function serverGetSiklusGenerusList(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  let data = readSheetAsObjects(SHEET_NAMES.SIKLUS_GENERUS);
  data = data.filter(s => s.kelompok_id == kelompokId).map(s => ({
    id: s.id,
    kelompok_id: s.kelompok_id,
    santri_id: s.santri_id,
    nama: s.nama ? String(s.nama) : '',
    jenis_siklus: s.jenis_siklus ? String(s.jenis_siklus) : '',
    tanggal: s.tanggal ? String(s.tanggal) : '',
    lokasi: s.lokasi ? String(s.lokasi) : '',
    instansi: s.instansi ? String(s.instansi) : '',
    keterangan: s.keterangan ? String(s.keterangan) : '',
  }));

  data.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));

  return { success: true, data: data };
}

/**
 * CREATE catatan siklus generus baru.
 * Input: {kelompok_id, santri_id, jenis_siklus, tanggal, lokasi?, instansi?, keterangan?}
 */
function serverCreateSiklusGenerus(token, data) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!data.kelompok_id || !data.santri_id || !data.jenis_siklus || !data.tanggal) {
    return { success: false, error: 'Generus, jenis siklus, dan tanggal wajib diisi.' };
  }

  if (JENIS_SIKLUS_GENERUS_.indexOf(data.jenis_siklus) === -1) {
    return { success: false, error: 'Jenis siklus tidak valid.' };
  }

  if (!validateUserAccess(token, 'kelompok', data.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == data.santri_id && s.kelompok_id == data.kelompok_id);
  if (!santri) {
    return { success: false, error: 'Generus tidak ditemukan di Kelompok ini.' };
  }

  try {
    return withScriptLock_(function () {
      const now = new Date().toISOString().split('T')[0];
      const id = generateId(SHEET_NAMES.SIKLUS_GENERUS);

      appendRowToSheet(SHEET_NAMES.SIKLUS_GENERUS, [
        id,
        data.kelompok_id,
        data.santri_id,
        santri.nama,
        data.jenis_siklus,
        data.tanggal,
        data.lokasi || '',
        data.instansi || '',
        data.keterangan || '',
        user.id,
        now,
      ]);

      logAudit(SHEET_NAMES.SIKLUS_GENERUS, id, 'create', user.id, `${santri.nama} -> ${data.jenis_siklus}`);
      return { success: true, message: 'Siklus generus berhasil ditambahkan.', id: id, nama: santri.nama };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menyimpan: ' + e.message };
  }
}

/**
 * UPDATE catatan siklus generus.
 */
function serverUpdateSiklusGenerus(token, siklusId, updates) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const siklus = readSheetAsObjects(SHEET_NAMES.SIKLUS_GENERUS).find(s => s.id == siklusId);
  if (!siklus) return { success: false, error: 'Catatan siklus tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', siklus.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke catatan ini.' };
  }

  if (updates.jenis_siklus !== undefined && JENIS_SIKLUS_GENERUS_.indexOf(updates.jenis_siklus) === -1) {
    return { success: false, error: 'Jenis siklus tidak valid.' };
  }

  let namaBaru = siklus.nama;
  if (updates.santri_id !== undefined && updates.santri_id != siklus.santri_id) {
    const santri = readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == updates.santri_id && s.kelompok_id == siklus.kelompok_id);
    if (!santri) return { success: false, error: 'Generus tidak ditemukan di Kelompok ini.' };
    namaBaru = santri.nama;
  }

  try {
    return withScriptLock_(function () {
      const newFields = {
        santri_id: updates.santri_id !== undefined ? updates.santri_id : siklus.santri_id,
        nama: namaBaru,
        jenis_siklus: updates.jenis_siklus !== undefined ? updates.jenis_siklus : siklus.jenis_siklus,
        tanggal: updates.tanggal !== undefined ? updates.tanggal : siklus.tanggal,
        lokasi: updates.lokasi !== undefined ? updates.lokasi : siklus.lokasi,
        instansi: updates.instansi !== undefined ? updates.instansi : siklus.instansi,
        keterangan: updates.keterangan !== undefined ? updates.keterangan : siklus.keterangan,
      };

      updateRowByQuery(SHEET_NAMES.SIKLUS_GENERUS, { id: siklus.id }, newFields);
      logAudit(SHEET_NAMES.SIKLUS_GENERUS, siklusId, 'update', user.id, JSON.stringify(updates));
      return { success: true, message: 'Siklus generus berhasil diperbarui.', nama: namaBaru };
    });
  } catch (e) {
    return { success: false, error: 'Gagal memperbarui: ' + e.message };
  }
}

/**
 * DELETE catatan siklus generus.
 */
function serverDeleteSiklusGenerus(token, siklusId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const siklus = readSheetAsObjects(SHEET_NAMES.SIKLUS_GENERUS).find(s => s.id == siklusId);
  if (!siklus) return { success: false, error: 'Catatan siklus tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', siklus.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke catatan ini.' };
  }

  try {
    return withScriptLock_(function () {
      deleteRowByQuery(SHEET_NAMES.SIKLUS_GENERUS, { id: siklus.id });
      logAudit(SHEET_NAMES.SIKLUS_GENERUS, siklusId, 'delete', user.id, 'deleted');
      return { success: true, message: 'Siklus generus berhasil dihapus.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menghapus: ' + e.message };
  }
}
