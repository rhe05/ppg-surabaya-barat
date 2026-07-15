/**
 * Modul_MaintainSantri.gs — CRUD Data Santri
 * Server-side functions dipanggil dari Index.html (screen Data Santri).
 *
 * RBAC: Admin Kelompok hanya bisa akses Kelompok mereka sendiri.
 */

/**
 * GET santri per Kelompok (dengan search/filter).
 * Dipanggil saat load screen Data Santri.
 */
function serverGetSantriList(token, kelompokId, searchQuery = '') {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC: validasi akses ke kelompok ini
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  let santri = readSheetAsObjects(SHEET_NAMES.SANTRI);
  santri = santri.filter(s => s.kelompok_id == kelompokId);

  // Search by nama
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    santri = santri.filter(s => String(s.nama).toLowerCase().includes(q));
  }

  return { success: true, data: santri };
}

/**
 * ADD santri baru.
 */
function serverAddSantri(token, kelompokId, santriData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Validasi input
  if (!santriData.nama || !santriData.nis || !santriData.gender || !santriData.tanggal_lahir || !santriData.jenjang_saat_ini) {
    return { success: false, error: 'Semua field wajib diisi.' };
  }

  const id = generateId(SHEET_NAMES.SANTRI);
  const santriSheet = getSheetByName(SHEET_NAMES.SANTRI);

  santriSheet.appendRow([
    id,
    kelompokId,
    santriData.nama.trim(),
    santriData.nis.trim(),
    santriData.gender,
    santriData.tanggal_lahir,
    santriData.jenjang_saat_ini,
  ]);

  logAudit('santri', id, 'create', user.id, JSON.stringify(santriData));
  return { success: true, message: 'Santri berhasil ditambahkan.', id: id };
}

/**
 * UPDATE santri.
 */
function serverUpdateSantri(token, santriId, santriData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == santriId);
  if (!santri) return { success: false, error: 'Santri tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Santri ini.' };
  }

  const updates = {
    nama: santriData.nama?.trim() || santri.nama,
    nis: santriData.nis?.trim() || santri.nis,
    gender: santriData.gender || santri.gender,
    tanggal_lahir: santriData.tanggal_lahir || santri.tanggal_lahir,
    jenjang_saat_ini: santriData.jenjang_saat_ini || santri.jenjang_saat_ini,
  };

  updateRowByQuery(SHEET_NAMES.SANTRI, { id: santriId }, updates);
  logAudit('santri', santriId, 'update', user.id, JSON.stringify(updates));
  return { success: true, message: 'Santri berhasil diperbarui.' };
}

/**
 * DELETE santri.
 */
function serverDeleteSantri(token, santriId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == santriId);
  if (!santri) return { success: false, error: 'Santri tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Santri ini.' };
  }

  deleteRowByQuery(SHEET_NAMES.SANTRI, { id: santriId });
  logAudit('santri', santriId, 'delete', user.id, 'deleted');
  return { success: true, message: 'Santri berhasil dihapus.' };
}

/**
 * Helper: log audit trail.
 */
function logAudit(tableName, recordId, action, userId, detail) {
  const auditSheet = getSheetByName(SHEET_NAMES.AUDIT_LOG);
  const id = generateId(SHEET_NAMES.AUDIT_LOG);
  const timestamp = new Date().toISOString();

  auditSheet.appendRow([id, tableName, recordId, action, userId, timestamp, detail]);
}
