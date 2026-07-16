/**
 * Modul_MaintainPengumuman.gs — CRUD Pengumuman per Kelompok
 * Server-side functions dipanggil dari Index.html (bagian "Pengumuman" di Dashboard Kelompok).
 *
 * RBAC: Admin Kelompok/Desa hanya bisa akses Kelompok yang jadi scope mereka. Admin PPG akses semua.
 */

/**
 * GET daftar pengumuman untuk satu Kelompok, terbaru dulu.
 */
function serverGetPengumuman(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  let pengumuman = readSheetAsObjects(SHEET_NAMES.PENGUMUMAN);
  pengumuman = pengumuman.filter(p => p.kelompok_id == kelompokId);
  pengumuman.sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));

  return { success: true, data: pengumuman };
}

/**
 * CREATE pengumuman baru.
 * Input: {kelompok_id, judul, isi, tanggal}
 */
function serverCreatePengumuman(token, pengumumanData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!pengumumanData.kelompok_id || !pengumumanData.judul || !pengumumanData.isi) {
    return { success: false, error: 'Judul dan isi pengumuman wajib diisi.' };
  }

  if (!validateUserAccess(token, 'kelompok', pengumumanData.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const id = generateId(SHEET_NAMES.PENGUMUMAN);
  const now = new Date().toISOString().split('T')[0];
  const tanggal = pengumumanData.tanggal || now;
  const sheet = getSheetByName(SHEET_NAMES.PENGUMUMAN);

  sheet.appendRow([
    id,
    pengumumanData.kelompok_id,
    pengumumanData.judul.trim(),
    pengumumanData.isi.trim(),
    tanggal,
    user.id,
    now,
  ]);

  logAudit(SHEET_NAMES.PENGUMUMAN, id, 'create', user.id, `Pengumuman: ${pengumumanData.judul}`);
  return { success: true, message: 'Pengumuman berhasil ditambahkan.', id };
}

/**
 * UPDATE pengumuman.
 */
function serverUpdatePengumuman(token, pengumumanId, updates) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const pengumuman = readSheetAsObjects(SHEET_NAMES.PENGUMUMAN).find(p => p.id == pengumumanId);
  if (!pengumuman) return { success: false, error: 'Pengumuman tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', pengumuman.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke pengumuman ini.' };
  }

  updateRowByQuery(SHEET_NAMES.PENGUMUMAN, { id: pengumumanId }, {
    judul: updates.judul !== undefined ? updates.judul.trim() : pengumuman.judul,
    isi: updates.isi !== undefined ? updates.isi.trim() : pengumuman.isi,
    tanggal: updates.tanggal !== undefined ? updates.tanggal : pengumuman.tanggal,
  });

  logAudit(SHEET_NAMES.PENGUMUMAN, pengumumanId, 'update', user.id, JSON.stringify(updates));
  return { success: true, message: 'Pengumuman berhasil diperbarui.' };
}

/**
 * DELETE pengumuman.
 */
function serverDeletePengumuman(token, pengumumanId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const pengumuman = readSheetAsObjects(SHEET_NAMES.PENGUMUMAN).find(p => p.id == pengumumanId);
  if (!pengumuman) return { success: false, error: 'Pengumuman tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', pengumuman.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke pengumuman ini.' };
  }

  deleteRowByQuery(SHEET_NAMES.PENGUMUMAN, { id: pengumumanId });
  logAudit(SHEET_NAMES.PENGUMUMAN, pengumumanId, 'delete', user.id, 'deleted');
  return { success: true, message: 'Pengumuman berhasil dihapus.' };
}
