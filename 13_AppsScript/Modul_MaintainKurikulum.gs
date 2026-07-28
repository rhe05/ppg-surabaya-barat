/**
 * Modul_MaintainKurikulum.gs — CRUD untuk Kurikulum (Prota/Promes/Probul + Pencapaian Santri)
 *
 * Sheets:
 * - kurikulum_prota: Program Tahunan (per kelompok+tahun+kategori, opsional per kelas)
 * - kurikulum_promes: Program Semester
 * - kurikulum_probul: Program Bulanan
 * - kurikulum_pencapaian_santri: Tracking progress santri per materi
 *
 * Pattern: lock + cache + RBAC (sama seperti Modul_MaintainJadwalKBM.gs)
 */

/* ═══════════════════════════════════════════════════════════════════════════════
   PROTA (Program Tahunan) CRUD
   ═════════════════════════════════════════════════════════════════════════════════ */

function serverGetProta(token, kelompokId, tahun, kelas) {
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  try {
    const cacheKey = 'kurikulum_prota_' + kelompokId + '_' + tahun + '_' + (kelas || 'all');
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const allRows = readSheetAsObjects('kurikulum_prota');
    const filtered = allRows.filter(r =>
      String(r.kelompok_id) === String(kelompokId) &&
      parseInt(r.tahun || 0) === parseInt(tahun || 0) &&
      (!kelas || String(r.kelas || '') === String(kelas))
    );

    cachePut_(cacheKey, filtered, 3600);
    return { success: true, data: filtered };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverAddProta(token, kelompokId, tahun, kategori, kelas, target, deskripsi) {
  const user = getCurrentUser(token);
  if (!user || !validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  if (!tahun || !kategori || !target) {
    return { success: false, error: 'Tahun, kategori, dan target harus diisi' };
  }

  try {
    return withScriptLock_(function() {
      const kategoriSlug = String(kategori).trim().replace(/\s+/g, '_').toLowerCase();
      const id = 'prota_' + kelompokId + '_' + tahun + '_' + kategoriSlug + (kelas ? '_kelas' + kelas : '');
      const now = new Date().toISOString();

      appendRowToSheet('kurikulum_prota', [id, kelompokId, tahun, kategori, target, deskripsi || '', user.id, now, now, kelas || '']);

      cacheDrop_('kurikulum_prota_' + kelompokId + '_' + tahun + '_' + (kelas || 'all'));
      cacheDrop_('kurikulum_prota_' + kelompokId + '_' + tahun + '_all');
      return { success: true, id: id };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverUpdateProta(token, protaId, target, deskripsi) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const row = readSheetAsObjects('kurikulum_prota').find(r => String(r.id) === String(protaId));
      if (!row) return { success: false, error: 'Prota tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      updateRowByQuery('kurikulum_prota', { id: protaId }, {
        target: target || row.target,
        deskripsi: deskripsi !== undefined ? deskripsi : row.deskripsi,
        updated_at: new Date().toISOString()
      });
      cacheDrop_('kurikulum_prota_' + row.kelompok_id + '_' + row.tahun + '_' + (row.kelas || 'all'));
      cacheDrop_('kurikulum_prota_' + row.kelompok_id + '_' + row.tahun + '_all');

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverDeleteProta(token, protaId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const row = readSheetAsObjects('kurikulum_prota').find(r => String(r.id) === String(protaId));
      if (!row) return { success: false, error: 'Prota tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      deleteRowByQuery('kurikulum_prota', { id: protaId });
      cacheDrop_('kurikulum_prota_' + row.kelompok_id + '_' + row.tahun + '_' + (row.kelas || 'all'));
      cacheDrop_('kurikulum_prota_' + row.kelompok_id + '_' + row.tahun + '_all');

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
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    const prota = readSheetAsObjects('kurikulum_prota').find(r => String(r.id) === String(protaId));
    if (!prota) return { success: false, error: 'Prota tidak ditemukan' };

    if (!validateUserAccess(token, 'kelompok', prota.kelompok_id)) {
      return { success: false, error: 'Akses ditolak' };
    }

    const cacheKey = 'kurikulum_promes_' + protaId;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const allRows = readSheetAsObjects('kurikulum_promes');
    const filtered = allRows.filter(r => String(r.prota_id) === String(protaId));

    cachePut_(cacheKey, filtered, 3600);
    return { success: true, data: filtered };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverAddPromes(token, protaId, semester, target, deskripsi) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  if (!semester || !target) {
    return { success: false, error: 'Semester dan target harus diisi' };
  }

  try {
    return withScriptLock_(function() {
      const prota = readSheetAsObjects('kurikulum_prota').find(r => String(r.id) === String(protaId));
      if (!prota) return { success: false, error: 'Prota tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', prota.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      const id = 'promes_' + protaId + '_' + semester;
      const now = new Date().toISOString();

      appendRowToSheet('kurikulum_promes', [id, prota.kelompok_id, protaId, semester, target, deskripsi || '', user.id, now, now]);

      cacheDrop_('kurikulum_promes_' + protaId);
      return { success: true, id: id };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverUpdatePromes(token, promesId, target, deskripsi) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const row = readSheetAsObjects('kurikulum_promes').find(r => String(r.id) === String(promesId));
      if (!row) return { success: false, error: 'Promes tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      updateRowByQuery('kurikulum_promes', { id: promesId }, {
        target: target || row.target,
        deskripsi: deskripsi !== undefined ? deskripsi : row.deskripsi,
        updated_at: new Date().toISOString()
      });
      cacheDrop_('kurikulum_promes_' + row.prota_id);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverDeletePromes(token, promesId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const row = readSheetAsObjects('kurikulum_promes').find(r => String(r.id) === String(promesId));
      if (!row) return { success: false, error: 'Promes tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      deleteRowByQuery('kurikulum_promes', { id: promesId });
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
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  try {
    const cacheKey = 'kurikulum_probul_' + kelompokId + '_' + tahun + '_' + bulan;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const allRows = readSheetAsObjects('kurikulum_probul');
    const filtered = allRows.filter(r =>
      String(r.kelompok_id) === String(kelompokId) &&
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
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  if (!bulan || !kategori || !target) {
    return { success: false, error: 'Bulan, kategori, dan target harus diisi' };
  }

  try {
    return withScriptLock_(function() {
      const promes = readSheetAsObjects('kurikulum_promes').find(r => String(r.id) === String(promesId));
      if (!promes) return { success: false, error: 'Promes tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', promes.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      const id = 'probul_' + promesId + '_' + bulan;
      const now = new Date().toISOString();
      const tahun = promes.tahun || new Date().getFullYear();

      appendRowToSheet('kurikulum_probul', [id, promes.kelompok_id, promesId, tahun, bulan, kategori, target, deskripsi || '', user.id, now, now]);

      cacheDrop_('kurikulum_probul_' + promes.kelompok_id + '_' + tahun + '_' + bulan);
      return { success: true, id: id };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverUpdateProbul(token, probulId, target, deskripsi) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const row = readSheetAsObjects('kurikulum_probul').find(r => String(r.id) === String(probulId));
      if (!row) return { success: false, error: 'Probul tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      updateRowByQuery('kurikulum_probul', { id: probulId }, {
        target: target || row.target,
        deskripsi: deskripsi !== undefined ? deskripsi : row.deskripsi,
        updated_at: new Date().toISOString()
      });
      cacheDrop_('kurikulum_probul_' + row.kelompok_id + '_' + row.tahun + '_' + row.bulan);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverDeleteProbul(token, probulId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const row = readSheetAsObjects('kurikulum_probul').find(r => String(r.id) === String(probulId));
      if (!row) return { success: false, error: 'Probul tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      deleteRowByQuery('kurikulum_probul', { id: probulId });
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
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  try {
    const cacheKey = 'kurikulum_pencapaian_' + probulId;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const allRows = readSheetAsObjects('kurikulum_pencapaian_santri');
    const filtered = allRows.filter(r =>
      String(r.kelompok_id) === String(kelompokId) &&
      String(r.probul_id) === String(probulId)
    );

    cachePut_(cacheKey, filtered, 3600);
    return { success: true, data: filtered };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function serverUpdatePencapaianSantri(token, pencapaianId, status, catatan) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  if (['pending', 'in_progress', 'completed'].indexOf(status) === -1) {
    return { success: false, error: 'Status harus: pending, in_progress, atau completed' };
  }

  try {
    return withScriptLock_(function() {
      const row = readSheetAsObjects('kurikulum_pencapaian_santri').find(r => String(r.id) === String(pencapaianId));
      if (!row) return { success: false, error: 'Pencapaian tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', row.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      updateRowByQuery('kurikulum_pencapaian_santri', { id: pencapaianId }, {
        status: status,
        catatan_guru: catatan || row.catatan_guru || '',
        tanggal_update: new Date().toISOString(),
        updated_by: user.id
      });
      cacheDrop_('kurikulum_pencapaian_' + row.probul_id);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}
