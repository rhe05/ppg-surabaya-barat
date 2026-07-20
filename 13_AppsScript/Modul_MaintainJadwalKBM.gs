/**
 * Modul_MaintainJadwalKBM.gs — CRUD Jadwal KBM (jadwal umum per kategori jenjang, per Kelompok).
 * Server-side functions dipanggil dari Index.html (bagian "Jadwal KBM" di Dashboard Kelompok).
 *
 * Model: satu baris = satu sesi (kategori + guru + jam + ruangan + kelas) — jadwal UMUM
 * tanpa tanggal. Penetapan tanggal dilakukan nanti di fitur Pengumuman. Kolom lama
 * hari/tanggal tetap ada di sheet (tidak dihapus) tapi diisi kosong untuk entri baru.
 *
 * RBAC: Admin Kelompok/Desa hanya bisa akses Kelompok yang jadi scope mereka. Admin PPG akses semua.
 */

/**
 * Kategori jenjang pengajian (urutan ini juga urutan tampil di UI).
 * Jadwal KBM adalah JADWAL UMUM per kategori — tidak terikat tanggal;
 * penetapan tanggal dilakukan nanti lewat fitur Pengumuman.
 */
const KATEGORI_JADWAL_ = ['Cabe Rawit', 'Pra Remaja SMP', 'Remaja SMA', 'Muda-Mudi'];

/** Urutan hari baku (Senin dulu) — dipakai menyusun 'hari_aktif' & tampilan ringkasannya. */
const HARI_URUTAN_JKH_ = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/**
 * Google Sheets DIAM-DIAM mengubah teks '15:45' yang kita tulis menjadi objek
 * Date di dalam sel. Saat dibaca kembali nilainya jadi Date, bukan string —
 * dan objek Date gagal dikirim ke klien lewat google.script.run (respons tidak
 * sampai sama sekali → UI berhenti di "Memuat...", lihat ERROR_LOG.md #7).
 * Helper ini menormalkan balik ke 'HH:mm' memakai zona waktu spreadsheet,
 * sehingga konversi Sheets ter-reverse persis. Nilai string dilewatkan apa adanya.
 */
function jamKeString_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'HH:mm');
  }
  return v ? String(v) : '';
}

/**
 * GET jadwal KBM untuk satu Kelompok, terurut kategori (urutan KATEGORI_JADWAL_) → jam_mulai,
 * dengan nama guru ikut disertakan.
 */
function serverGetJadwalKBM(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  let jadwal = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM);
  jadwal = jadwal.filter(j => j.kelompok_id == kelompokId);

  const guruList = readSheetAsObjects(SHEET_NAMES.GURU);

  // Bangun objek balikan secara eksplisit: hanya string/angka, supaya tidak ada
  // objek Date (dari sel jam/dibuat_pada) yang ikut terkirim ke klien (ERROR_LOG.md #7).
  jadwal = jadwal.map(j => {
    const guru = guruList.find(g => g.id == j.guru_id);
    return {
      id: j.id,
      kelompok_id: j.kelompok_id,
      kategori: j.kategori ? String(j.kategori) : '',
      jam_mulai: jamKeString_(j.jam_mulai),
      jam_selesai: jamKeString_(j.jam_selesai),
      kelas: j.kelas ? String(j.kelas) : '',
      ruangan: j.ruangan ? String(j.ruangan) : '',
      keterangan: j.keterangan ? String(j.keterangan) : '',
      guru_id: j.guru_id,
      guru_nama: guru ? guru.nama : '(guru tidak ditemukan)',
    };
  });

  jadwal.sort((a, b) => {
    const katDiff = KATEGORI_JADWAL_.indexOf(a.kategori) - KATEGORI_JADWAL_.indexOf(b.kategori);
    if (katDiff !== 0) return katDiff;
    return a.jam_mulai.localeCompare(b.jam_mulai);
  });

  return { success: true, data: jadwal };
}

/**
 * CREATE sesi jadwal KBM baru (jadwal umum, tanpa tanggal).
 * Input: {kelompok_id, kategori, guru_id, kelas, jam_mulai, jam_selesai, ruangan, keterangan?}
 */
function serverCreateJadwalKBM(token, jadwalData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!jadwalData.kelompok_id || !jadwalData.kategori || !jadwalData.guru_id || !jadwalData.kelas
    || !jadwalData.jam_mulai || !jadwalData.jam_selesai || !jadwalData.ruangan) {
    return { success: false, error: 'Kategori, guru, kelas, jam mulai, jam selesai, dan ruangan wajib diisi.' };
  }

  if (KATEGORI_JADWAL_.indexOf(jadwalData.kategori) === -1) {
    return { success: false, error: 'Kategori tidak valid.' };
  }

  if (!validateUserAccess(token, 'kelompok', jadwalData.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const guruAda = readSheetAsObjects(SHEET_NAMES.GURU).some(g => g.id == jadwalData.guru_id && g.kelompok_id == jadwalData.kelompok_id);
  if (!guruAda) {
    return { success: false, error: 'Guru tidak ditemukan di Kelompok ini.' };
  }

  try {
    return withScriptLock_(function () {
      const id = generateId(SHEET_NAMES.JADWAL_KBM);
      const now = new Date().toISOString().split('T')[0];

      // Kolom hari & tanggal sengaja kosong: jadwal ini umum, tanggal ditetapkan
      // nanti di fitur Pengumuman.
      appendRowToSheet(SHEET_NAMES.JADWAL_KBM, [
        id,
        jadwalData.kelompok_id,
        '',
        jadwalData.jam_mulai,
        jadwalData.jam_selesai,
        jadwalData.keterangan || '',
        user.id,
        now,
        '',
        jadwalData.guru_id,
        jadwalData.kelas.trim(),
        jadwalData.ruangan.trim(),
        jadwalData.kategori,
      ]);

      logAudit(SHEET_NAMES.JADWAL_KBM, id, 'create', user.id, `Sesi: ${jadwalData.kategori} ${jadwalData.jam_mulai}-${jadwalData.jam_selesai} kls ${jadwalData.kelas}`);
      return { success: true, message: 'Jadwal KBM berhasil ditambahkan.', id };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menyimpan: ' + e.message };
  }
}

/**
 * UPDATE sesi jadwal KBM.
 */
function serverUpdateJadwalKBM(token, jadwalId, updates) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const jadwal = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM).find(j => j.id == jadwalId);
  if (!jadwal) return { success: false, error: 'Jadwal tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', jadwal.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke jadwal ini.' };
  }

  if (updates.guru_id !== undefined) {
    const guruAda = readSheetAsObjects(SHEET_NAMES.GURU).some(g => g.id == updates.guru_id && g.kelompok_id == jadwal.kelompok_id);
    if (!guruAda) return { success: false, error: 'Guru tidak ditemukan di Kelompok ini.' };
  }

  if (updates.kategori !== undefined && KATEGORI_JADWAL_.indexOf(updates.kategori) === -1) {
    return { success: false, error: 'Kategori tidak valid.' };
  }

  try {
    return withScriptLock_(function () {
      // Nilai jam lama dinormalkan dulu — sel jam bisa berupa objek Date bawaan Sheets.
      updateRowByQuery(SHEET_NAMES.JADWAL_KBM, { id: jadwal.id }, {
        kategori: updates.kategori !== undefined ? updates.kategori : (jadwal.kategori || ''),
        guru_id: updates.guru_id !== undefined ? updates.guru_id : jadwal.guru_id,
        kelas: updates.kelas !== undefined ? String(updates.kelas).trim() : jadwal.kelas,
        jam_mulai: updates.jam_mulai !== undefined ? updates.jam_mulai : jamKeString_(jadwal.jam_mulai),
        jam_selesai: updates.jam_selesai !== undefined ? updates.jam_selesai : jamKeString_(jadwal.jam_selesai),
        ruangan: updates.ruangan !== undefined ? String(updates.ruangan).trim() : jadwal.ruangan,
        keterangan: updates.keterangan !== undefined ? updates.keterangan : jadwal.keterangan,
      });

      logAudit(SHEET_NAMES.JADWAL_KBM, jadwalId, 'update', user.id, JSON.stringify(updates));
      return { success: true, message: 'Jadwal KBM berhasil diperbarui.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal memperbarui: ' + e.message };
  }
}

/**
 * DELETE sesi jadwal KBM.
 */
function serverDeleteJadwalKBM(token, jadwalId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const jadwal = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM).find(j => j.id == jadwalId);
  if (!jadwal) return { success: false, error: 'Jadwal tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', jadwal.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke jadwal ini.' };
  }

  try {
    return withScriptLock_(function () {
      deleteRowByQuery(SHEET_NAMES.JADWAL_KBM, { id: jadwal.id });
      logAudit(SHEET_NAMES.JADWAL_KBM, jadwalId, 'delete', user.id, 'deleted');
      return { success: true, message: 'Jadwal KBM berhasil dihapus.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menghapus: ' + e.message };
  }
}

/**
 * GET hari aktif per kategori untuk satu Kelompok (dipakai kartu ringkasan
 * "Senin - Jumat (5x Seminggu)" di bawah tiap kategori Jadwal KBM).
 * Return: { success, data: { '<kategori>': ['Senin', 'Selasa', ...], ... } }
 */
function serverGetJadwalKategoriHari(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const rows = readSheetAsObjects(SHEET_NAMES.JADWAL_KATEGORI_HARI).filter(r => r.kelompok_id == kelompokId);
  const data = {};
  rows.forEach(r => {
    data[r.kategori] = String(r.hari_aktif || '').split(',').map(h => h.trim()).filter(Boolean);
  });

  return { success: true, data: data };
}

/**
 * SET hari aktif untuk satu kategori di satu Kelompok (upsert — satu baris per kelompok+kategori).
 * Input: kelompokId, kategori, hariAktif (array nama hari, mis. ['Senin','Selasa'])
 */
function serverSaveJadwalKategoriHari(token, kelompokId, kategori, hariAktif) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (KATEGORI_JADWAL_.indexOf(kategori) === -1) {
    return { success: false, error: 'Kategori tidak valid.' };
  }

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const hariValid = (hariAktif || []).filter(h => HARI_URUTAN_JKH_.indexOf(h) !== -1);
  const hariAktifStr = HARI_URUTAN_JKH_.filter(h => hariValid.indexOf(h) !== -1).join(',');

  try {
    return withScriptLock_(function () {
      const existing = readSheetAsObjects(SHEET_NAMES.JADWAL_KATEGORI_HARI)
        .find(r => r.kelompok_id == kelompokId && r.kategori === kategori);
      const now = new Date().toISOString().split('T')[0];

      if (existing) {
        updateRowByQuery(SHEET_NAMES.JADWAL_KATEGORI_HARI, { id: existing.id }, {
          hari_aktif: hariAktifStr,
          diubah_oleh: user.id,
          diubah_pada: now,
        });
        logAudit(SHEET_NAMES.JADWAL_KATEGORI_HARI, existing.id, 'update', user.id, `${kategori}: ${hariAktifStr}`);
      } else {
        const id = generateId(SHEET_NAMES.JADWAL_KATEGORI_HARI);
        appendRowToSheet(SHEET_NAMES.JADWAL_KATEGORI_HARI, [id, kelompokId, kategori, hariAktifStr, user.id, now]);
        logAudit(SHEET_NAMES.JADWAL_KATEGORI_HARI, id, 'create', user.id, `${kategori}: ${hariAktifStr}`);
      }

      return { success: true, message: 'Hari aktif berhasil disimpan.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menyimpan: ' + e.message };
  }
}
