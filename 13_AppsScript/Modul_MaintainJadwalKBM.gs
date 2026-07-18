/**
 * Modul_MaintainJadwalKBM.gs — CRUD Jadwal KBM (sesi mengajar per tanggal, per Kelompok).
 * Server-side functions dipanggil dari Index.html (bagian "Jadwal KBM" di Dashboard Kelompok).
 *
 * Model: satu baris = satu sesi (tanggal + guru + jam + ruangan + kelas), sesuai format
 * pengumuman WA guru sehari-hari — bukan jadwal rutin mingguan. 'hari' dihitung otomatis
 * dari 'tanggal' (bukan input user) supaya tetap konsisten & tidak bisa berbeda dengan tanggalnya.
 *
 * RBAC: Admin Kelompok/Desa hanya bisa akses Kelompok yang jadi scope mereka. Admin PPG akses semua.
 */

const HARI_NAMA_ = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** 'yyyy-MM-dd' → nama hari Indonesia. Dipakai server saat create/update, bukan input user. */
function hariDariTanggal_(tanggalStr) {
  const d = new Date(tanggalStr + 'T00:00:00');
  return isNaN(d.getTime()) ? '' : HARI_NAMA_[d.getDay()];
}

/**
 * GET jadwal KBM untuk satu Kelompok, terurut tanggal → jam_mulai, dengan nama guru ikut disertakan.
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
  jadwal = jadwal.map(j => {
    const guru = guruList.find(g => g.id == j.guru_id);
    return Object.assign({}, j, { guru_nama: guru ? guru.nama : '(guru tidak ditemukan)' });
  });

  jadwal.sort((a, b) => {
    const tglDiff = String(a.tanggal || '').localeCompare(String(b.tanggal || ''));
    if (tglDiff !== 0) return tglDiff;
    return String(a.jam_mulai || '').localeCompare(String(b.jam_mulai || ''));
  });

  return { success: true, data: jadwal };
}

/**
 * CREATE sesi jadwal KBM baru.
 * Input: {kelompok_id, tanggal, guru_id, kelas, jam_mulai, jam_selesai, ruangan, keterangan?}
 */
function serverCreateJadwalKBM(token, jadwalData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!jadwalData.kelompok_id || !jadwalData.tanggal || !jadwalData.guru_id || !jadwalData.kelas
    || !jadwalData.jam_mulai || !jadwalData.jam_selesai || !jadwalData.ruangan) {
    return { success: false, error: 'Tanggal, guru, kelas, jam mulai, jam selesai, dan ruangan wajib diisi.' };
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
      const sheet = getSheetByName(SHEET_NAMES.JADWAL_KBM);

      sheet.appendRow([
        id,
        jadwalData.kelompok_id,
        hariDariTanggal_(jadwalData.tanggal),
        jadwalData.jam_mulai,
        jadwalData.jam_selesai,
        jadwalData.keterangan || '',
        user.id,
        now,
        jadwalData.tanggal,
        jadwalData.guru_id,
        jadwalData.kelas.trim(),
        jadwalData.ruangan.trim(),
      ]);

      logAudit(SHEET_NAMES.JADWAL_KBM, id, 'create', user.id, `Sesi: ${jadwalData.tanggal} ${jadwalData.jam_mulai}-${jadwalData.jam_selesai} kls ${jadwalData.kelas}`);
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

  const tanggalBaru = updates.tanggal !== undefined ? updates.tanggal : jadwal.tanggal;

  try {
    return withScriptLock_(function () {
      updateRowByQuery(SHEET_NAMES.JADWAL_KBM, { id: jadwal.id }, {
        tanggal: tanggalBaru,
        hari: hariDariTanggal_(tanggalBaru),
        guru_id: updates.guru_id !== undefined ? updates.guru_id : jadwal.guru_id,
        kelas: updates.kelas !== undefined ? String(updates.kelas).trim() : jadwal.kelas,
        jam_mulai: updates.jam_mulai !== undefined ? updates.jam_mulai : jadwal.jam_mulai,
        jam_selesai: updates.jam_selesai !== undefined ? updates.jam_selesai : jadwal.jam_selesai,
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
