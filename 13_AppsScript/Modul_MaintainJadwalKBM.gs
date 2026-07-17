/**
 * Modul_MaintainJadwalKBM.gs — CRUD Jadwal KBM (jadwal rutin mingguan per Kelompok)
 * Server-side functions dipanggil dari Index.html (bagian "Jadwal KBM" di Dashboard Kelompok).
 *
 * RBAC: Admin Kelompok/Desa hanya bisa akses Kelompok yang jadi scope mereka. Admin PPG akses semua.
 */

const HARI_URUTAN = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/**
 * GET jadwal KBM untuk satu Kelompok, terurut Senin → Minggu lalu jam_mulai.
 */
function serverGetJadwalKBM(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  let jadwal = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM);
  jadwal = jadwal.filter(j => j.kelompok_id == kelompokId);

  jadwal.sort((a, b) => {
    const dayDiff = HARI_URUTAN.indexOf(a.hari) - HARI_URUTAN.indexOf(b.hari);
    if (dayDiff !== 0) return dayDiff;
    return String(a.jam_mulai || '').localeCompare(String(b.jam_mulai || ''));
  });

  return { success: true, data: jadwal };
}

/**
 * CREATE jadwal KBM baru.
 * Input: {kelompok_id, hari, jam_mulai, jam_selesai, keterangan}
 */
function serverCreateJadwalKBM(token, jadwalData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!jadwalData.kelompok_id || !jadwalData.hari || !jadwalData.jam_mulai || !jadwalData.jam_selesai) {
    return { success: false, error: 'Hari, jam mulai, dan jam selesai wajib diisi.' };
  }

  if (!HARI_URUTAN.includes(jadwalData.hari)) {
    return { success: false, error: 'Hari tidak valid.' };
  }

  if (!validateUserAccess(token, 'kelompok', jadwalData.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  try {
    return withScriptLock_(function () {
      const id = generateId(SHEET_NAMES.JADWAL_KBM);
      const now = new Date().toISOString().split('T')[0];
      const sheet = getSheetByName(SHEET_NAMES.JADWAL_KBM);

      sheet.appendRow([
        id,
        jadwalData.kelompok_id,
        jadwalData.hari,
        jadwalData.jam_mulai,
        jadwalData.jam_selesai,
        jadwalData.keterangan || '',
        user.id,
        now,
      ]);

      logAudit(SHEET_NAMES.JADWAL_KBM, id, 'create', user.id, `Jadwal: ${jadwalData.hari} ${jadwalData.jam_mulai}-${jadwalData.jam_selesai}`);
      return { success: true, message: 'Jadwal KBM berhasil ditambahkan.', id };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menyimpan: ' + e.message };
  }
}

/**
 * UPDATE jadwal KBM.
 */
function serverUpdateJadwalKBM(token, jadwalId, updates) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const jadwal = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM).find(j => j.id == jadwalId);
  if (!jadwal) return { success: false, error: 'Jadwal tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', jadwal.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke jadwal ini.' };
  }

  if (updates.hari && !HARI_URUTAN.includes(updates.hari)) {
    return { success: false, error: 'Hari tidak valid.' };
  }

  try {
    return withScriptLock_(function () {
      updateRowByQuery(SHEET_NAMES.JADWAL_KBM, { id: jadwal.id }, {
        hari: updates.hari !== undefined ? updates.hari : jadwal.hari,
        jam_mulai: updates.jam_mulai !== undefined ? updates.jam_mulai : jadwal.jam_mulai,
        jam_selesai: updates.jam_selesai !== undefined ? updates.jam_selesai : jadwal.jam_selesai,
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
 * DELETE jadwal KBM.
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
