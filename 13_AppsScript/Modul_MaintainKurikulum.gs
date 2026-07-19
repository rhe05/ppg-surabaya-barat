/**
 * Modul_MaintainKurikulum.gs — CRUD untuk Kurikulum (Prota/Promes/Probul + Pencapaian Santri)
 *
 * Sheets:
 * - kurikulum_prota: Program Tahunan
 * - kurikulum_promes: Program Semester
 * - kurikulum_probul: Program Bulanan
 * - kurikulum_pencapaian_santri: Tracking progress santri per materi
 *
 * Pattern: lock + cache + RBAC (same as Modul_MaintainJadwalKBM.gs)
 */

/* ═══════════════════════════════════════════════════════════════════════════════
   PROTA (Program Tahunan) CRUD
   ═════════════════════════════════════════════════════════════════════════════════ */

function serverGetProta(token, kelompokId, tahun) {
  const user = getCurrentUser_(token);
  if (!user || !validateUserAccess_(user, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  try {
    const cacheKey = 'kurikulum_prota_' + kelompokId + '_' + tahun;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_prota');
    if (!sheet) return { success: true, data: [] };

    const allRows = readSheetAsObjects_(sheet);
    const filtered = allRows.filter(r =>
      String(r.kelompok_id).trim() === String(kelompokId).trim() &&
      parseInt(r.tahun || 0) === parseInt(tahun || 0)
    );

    cachePut_(cacheKey, filtered, 3600);
    return { success: true, data: filtered };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverAddProta(token, kelompokId, tahun, kategori, target, deskripsi) {
  const user = getCurrentUser_(token);
  if (!user || !validateUserAccess_(user, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  if (!tahun || !kategori || !target) {
    return { success: false, error: 'Tahun, kategori, dan target harus diisi' };
  }

  try {
    return withScriptLock_(function() {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_prota');
      const id = 'prota_' + kelompokId + '_' + tahun + '_' + kategori.replace(/\s+/g, '_');
      const now = new Date().toISOString();

      sheet.appendRow([id, kelompokId, tahun, kategori, target, deskripsi || '', user.id, now, now]);

      cacheDrop_('kurikulum_prota_' + kelompokId + '_' + tahun);
      return { success: true, id: id };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverUpdateProta(token, protaId, target, deskripsi) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_prota');
      const row = findRowByQuery_(sheet, 'id', protaId, 'exact');
      if (!row) return { success: false, error: 'Prota tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      row.target = target || row.target;
      row.deskripsi = deskripsi !== undefined ? deskripsi : row.deskripsi;
      row.updated_at = new Date().toISOString();

      updateRowByQuery_(sheet, 'id', protaId, row);
      cacheDrop_('kurikulum_prota_' + row.kelompok_id + '_' + row.tahun);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverDeleteProta(token, protaId) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_prota');
      const row = findRowByQuery_(sheet, 'id', protaId, 'exact');
      if (!row) return { success: false, error: 'Prota tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      deleteRowByQuery_(sheet, 'id', protaId);
      cacheDrop_('kurikulum_prota_' + row.kelompok_id + '_' + row.tahun);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PROMES (Program Semester) CRUD
   ═════════════════════════════════════════════════════════════════════════════════ */

function serverGetPromes(token, protaId) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_prota');
    const prota = findRowByQuery_(sheet, 'id', protaId, 'exact');
    if (!prota) return { success: false, error: 'Prota tidak ditemukan' };

    if (!validateUserAccess_(user, 'kelompok', prota.kelompok_id)) {
      return { success: false, error: 'Akses ditolak' };
    }

    const cacheKey = 'kurikulum_promes_' + protaId;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const promesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_promes');
    if (!promesSheet) return { success: true, data: [] };

    const allRows = readSheetAsObjects_(promesSheet);
    const filtered = allRows.filter(r => String(r.prota_id).trim() === String(protaId).trim());

    cachePut_(cacheKey, filtered, 3600);
    return { success: true, data: filtered };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverAddPromes(token, protaId, semester, target, deskripsi) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  if (!semester || !target) {
    return { success: false, error: 'Semester dan target harus diisi' };
  }

  try {
    return withScriptLock_(function() {
      const protaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_prota');
      const prota = findRowByQuery_(protaSheet, 'id', protaId, 'exact');
      if (!prota) return { success: false, error: 'Prota tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', prota.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_promes');
      const id = 'promes_' + protaId + '_' + semester;
      const now = new Date().toISOString();

      sheet.appendRow([id, prota.kelompok_id, protaId, semester, target, deskripsi || '', user.id, now, now]);

      cacheDrop_('kurikulum_promes_' + protaId);
      return { success: true, id: id };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverUpdatePromes(token, promesId, target, deskripsi) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_promes');
      const row = findRowByQuery_(sheet, 'id', promesId, 'exact');
      if (!row) return { success: false, error: 'Promes tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      row.target = target || row.target;
      row.deskripsi = deskripsi !== undefined ? deskripsi : row.deskripsi;
      row.updated_at = new Date().toISOString();

      updateRowByQuery_(sheet, 'id', promesId, row);
      cacheDrop_('kurikulum_promes_' + row.prota_id);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverDeletePromes(token, promesId) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_promes');
      const row = findRowByQuery_(sheet, 'id', promesId, 'exact');
      if (!row) return { success: false, error: 'Promes tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      deleteRowByQuery_(sheet, 'id', promesId);
      cacheDrop_('kurikulum_promes_' + row.prota_id);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PROBUL (Program Bulanan) CRUD
   ═════════════════════════════════════════════════════════════════════════════════ */

function serverGetProbul(token, kelompokId, tahun, bulan) {
  const user = getCurrentUser_(token);
  if (!user || !validateUserAccess_(user, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  try {
    const cacheKey = 'kurikulum_probul_' + kelompokId + '_' + tahun + '_' + bulan;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_probul');
    if (!sheet) return { success: true, data: [] };

    const allRows = readSheetAsObjects_(sheet);
    const filtered = allRows.filter(r =>
      String(r.kelompok_id).trim() === String(kelompokId).trim() &&
      parseInt(r.tahun || 0) === parseInt(tahun || 0) &&
      parseInt(r.bulan || 0) === parseInt(bulan || 0)
    );

    cachePut_(cacheKey, filtered, 3600);
    return { success: true, data: filtered };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverAddProbul(token, promesId, bulan, kategori, target, deskripsi) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  if (!bulan || !kategori || !target) {
    return { success: false, error: 'Bulan, kategori, dan target harus diisi' };
  }

  try {
    return withScriptLock_(function() {
      const promesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_promes');
      const promes = findRowByQuery_(promesSheet, 'id', promesId, 'exact');
      if (!promes) return { success: false, error: 'Promes tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', promes.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_probul');
      const id = 'probul_' + promesId + '_' + bulan;
      const now = new Date().toISOString();

      sheet.appendRow([id, promes.kelompok_id, promesId, promes.tahun || new Date().getFullYear(), bulan, kategori, target, deskripsi || '', user.id, now, now]);

      cacheDrop_('kurikulum_probul_' + promes.kelompok_id + '_' + (promes.tahun || new Date().getFullYear()) + '_' + bulan);
      return { success: true, id: id };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverUpdateProbul(token, probulId, target, deskripsi) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_probul');
      const row = findRowByQuery_(sheet, 'id', probulId, 'exact');
      if (!row) return { success: false, error: 'Probul tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      row.target = target || row.target;
      row.deskripsi = deskripsi !== undefined ? deskripsi : row.deskripsi;
      row.updated_at = new Date().toISOString();

      updateRowByQuery_(sheet, 'id', probulId, row);
      cacheDrop_('kurikulum_probul_' + row.kelompok_id + '_' + row.tahun + '_' + row.bulan);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverDeleteProbul(token, probulId) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_probul');
      const row = findRowByQuery_(sheet, 'id', probulId, 'exact');
      if (!row) return { success: false, error: 'Probul tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      deleteRowByQuery_(sheet, 'id', probulId);
      cacheDrop_('kurikulum_probul_' + row.kelompok_id + '_' + row.tahun + '_' + row.bulan);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PENCAPAIAN SANTRI (Progress Tracking) CRUD
   ═════════════════════════════════════════════════════════════════════════════════ */

function serverGetPencapaianSantri(token, kelompokId, probulId) {
  const user = getCurrentUser_(token);
  if (!user || !validateUserAccess_(user, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  try {
    const cacheKey = 'kurikulum_pencapaian_' + probulId;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_pencapaian_santri');
    if (!sheet) return { success: true, data: [] };

    const allRows = readSheetAsObjects_(sheet);
    const filtered = allRows.filter(r =>
      String(r.kelompok_id).trim() === String(kelompokId).trim() &&
      String(r.probul_id).trim() === String(probulId).trim()
    );

    cachePut_(cacheKey, filtered, 3600);
    return { success: true, data: filtered };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverUpdatePencapaianSantri(token, pencapaianId, status, catatan) {
  const user = getCurrentUser_(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    return { success: false, error: 'Status harus: pending, in_progress, atau completed' };
  }

  try {
    return withScriptLock_(function() {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_pencapaian_santri');
      const row = findRowByQuery_(sheet, 'id', pencapaianId, 'exact');
      if (!row) return { success: false, error: 'Pencapaian tidak ditemukan' };

      if (!validateUserAccess_(user, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      row.status = status;
      row.catatan_guru = catatan || row.catatan_guru || '';
      row.tanggal_update = new Date().toISOString();
      row.updated_by = user.id;

      updateRowByQuery_(sheet, 'id', pencapaianId, row);
      cacheDrop_('kurikulum_pencapaian_' + row.probul_id);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}
