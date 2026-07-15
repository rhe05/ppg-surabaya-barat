/**
 * Modul_MaintainGuru.gs — CRUD Data Guru
 * Server-side functions dipanggil dari Index.html (screen Data Guru).
 *
 * RBAC: Admin Kelompok hanya bisa akses Kelompok mereka sendiri.
 */

/**
 * GET guru per Kelompok (dengan search).
 */
function serverGetGuruList(token, kelompokId, searchQuery = '') {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  let guru = readSheetAsObjects(SHEET_NAMES.GURU);
  guru = guru.filter(g => g.kelompok_id == kelompokId);

  // Search by nama
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    guru = guru.filter(g => String(g.nama).toLowerCase().includes(q));
  }

  return { success: true, data: guru };
}

/**
 * ADD guru baru.
 */
function serverAddGuru(token, kelompokId, guruData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  if (!guruData.nama || !guruData.kategori) {
    return { success: false, error: 'Nama dan Kategori wajib diisi.' };
  }

  const id = generateId(SHEET_NAMES.GURU);
  const guruSheet = getSheetByName(SHEET_NAMES.GURU);

  guruSheet.appendRow([
    id,
    kelompokId,
    guruData.nama.trim(),
    guruData.kategori,
  ]);

  logAudit('guru', id, 'create', user.id, JSON.stringify(guruData));
  return { success: true, message: 'Guru berhasil ditambahkan.', id: id };
}

/**
 * UPDATE guru.
 */
function serverUpdateGuru(token, guruId, guruData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const guru = readSheetAsObjects(SHEET_NAMES.GURU).find(g => g.id == guruId);
  if (!guru) return { success: false, error: 'Guru tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', guru.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Guru ini.' };
  }

  const updates = {
    nama: guruData.nama?.trim() || guru.nama,
    kategori: guruData.kategori || guru.kategori,
  };

  updateRowByQuery(SHEET_NAMES.GURU, { id: guruId }, updates);
  logAudit('guru', guruId, 'update', user.id, JSON.stringify(updates));
  return { success: true, message: 'Guru berhasil diperbarui.' };
}

/**
 * DELETE guru.
 */
function serverDeleteGuru(token, guruId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const guru = readSheetAsObjects(SHEET_NAMES.GURU).find(g => g.id == guruId);
  if (!guru) return { success: false, error: 'Guru tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', guru.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Guru ini.' };
  }

  deleteRowByQuery(SHEET_NAMES.GURU, { id: guruId });
  logAudit('guru', guruId, 'delete', user.id, 'deleted');
  return { success: true, message: 'Guru berhasil dihapus.' };
}
