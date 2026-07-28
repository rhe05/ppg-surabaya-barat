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

/**
 * Ambil SELURUH pohon Kurikulum (Prota -> Promes -> Probul) utk 1 kelompok+
 * tahun dalam SATU panggilan -- dipakai tab "Semester" (laporan lengkap per
 * Kelas: tiap materi, tiap Semester, tabel Bulan 1-6). Sengaja 1 panggilan
 * (bukan serverGetProta lalu serverGetPromes/serverGetProbulByPromes per
 * baris) supaya tidak N+1 round-trip ke server utk laporan yg nampilin
 * semua materi sekaligus (pelajaran dari ERROR_LOG #18-23).
 *
 * Cache TTL sengaja pendek (60 detik, bukan 3600 spt cache Prota/Promes
 * lain) -- ini view laporan read-only yg dibaca lintas 3 sheet sekaligus,
 * menambah cacheDrop_ ke 9 fungsi mutasi Prota/Promes/Probul yang sudah ada
 * cuma utk laporan ini tidak sepadan; staleness maks 60 detik cukup aman.
 */
function serverGetKurikulumFullTree(token, kelompokId, tahun) {
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Akses ditolak' };
  }

  try {
    const cacheKey = 'kurikulum_fulltree_' + kelompokId + '_' + tahun;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const allProta = readSheetAsObjects('kurikulum_prota').filter(r =>
      String(r.kelompok_id) === String(kelompokId) &&
      parseInt(r.tahun || 0) === parseInt(tahun || 0)
    );

    const promesByProta_ = {};
    readSheetAsObjects('kurikulum_promes').forEach(function (p) {
      if (!promesByProta_[p.prota_id]) promesByProta_[p.prota_id] = [];
      promesByProta_[p.prota_id].push(p);
    });

    const probulByPromes_ = {};
    readSheetAsObjects('kurikulum_probul').forEach(function (b) {
      if (!probulByPromes_[b.promes_id]) probulByPromes_[b.promes_id] = [];
      probulByPromes_[b.promes_id].push(b);
    });

    const tree = allProta.map(function (prota) {
      const promesList = (promesByProta_[prota.id] || [])
        .slice()
        .sort(function (a, b) { return parseInt(a.semester || 0) - parseInt(b.semester || 0); })
        .map(function (promes) {
          const probulList = (probulByPromes_[promes.id] || [])
            .slice()
            .sort(function (a, b) { return parseInt(a.bulan || 0) - parseInt(b.bulan || 0); });
          const promesCopy = {};
          Object.keys(promes).forEach(function (k) { promesCopy[k] = promes[k]; });
          promesCopy.probul = probulList;
          return promesCopy;
        });
      const protaCopy = {};
      Object.keys(prota).forEach(function (k) { protaCopy[k] = prota[k]; });
      protaCopy.promes = promesList;
      return protaCopy;
    });

    cachePut_(cacheKey, tree, 60);
    return { success: true, data: tree };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

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

/**
 * Ambil semua Probul (target bulanan) milik 1 Promes, terurut bulan 1-6 —
 * dipakai tabel "Target Per Bulan" inline di rincian Semester (Kurikulum
 * Tahunan), berbeda dari serverGetProbul() yang scope-nya per BULAN lintas
 * kelompok (dipakai tab "Bulanan").
 */
function serverGetProbulByPromes(token, promesId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    const promes = readSheetAsObjects('kurikulum_promes').find(r => String(r.id) === String(promesId));
    if (!promes) return { success: false, error: 'Promes tidak ditemukan' };

    if (!validateUserAccess(token, 'kelompok', promes.kelompok_id)) {
      return { success: false, error: 'Akses ditolak' };
    }

    const cacheKey = 'kurikulum_probul_bypromes_' + promesId;
    let data = cacheGet_(cacheKey);
    if (data) return { success: true, data: data };

    const allRows = readSheetAsObjects('kurikulum_probul');
    const filtered = allRows
      .filter(r => String(r.promes_id) === String(promesId))
      .sort((a, b) => parseInt(a.bulan || 0) - parseInt(b.bulan || 0));

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
      cacheDrop_('kurikulum_probul_bypromes_' + promesId);
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
      cacheDrop_('kurikulum_probul_bypromes_' + row.promes_id);

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
      cacheDrop_('kurikulum_probul_bypromes_' + row.promes_id);

      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Set (upsert) target Bulan 1-6 sekaligus utk 1 Promes — dipakai modal "Edit
 * Target Bulanan" di tab Semester (laporan): admin pilih Kelas -> Semester ->
 * Materi, isi 6 kolom Bulan, simpan sekali jalan (bukan 6x panggilan
 * serverAddProbul/serverUpdateProbul terpisah). Baris yang sudah ada
 * di-UPDATE, yang belum ada di-INSERT, kolom yang dikosongkan (target='')
 * DIBIARKAN (tidak dihapus) supaya tidak ada penghapusan tak sengaja lewat
 * form ini — pakai tombol Hapus di tab Bulanan kalau memang mau menghapus.
 *
 * @param {Object} bulanTargets — { "1": "Hal 1-9", "2": "...", ..., "6": "Evaluasi" }
 */
function serverSetProbulBulan(token, promesId, bulanTargets) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Akses ditolak' };

  try {
    return withScriptLock_(function() {
      const promes = readSheetAsObjects('kurikulum_promes').find(r => String(r.id) === String(promesId));
      if (!promes) return { success: false, error: 'Promes tidak ditemukan' };

      if (!validateUserAccess(token, 'kelompok', promes.kelompok_id)) {
        return { success: false, error: 'Akses ditolak' };
      }

      const prota = readSheetAsObjects('kurikulum_prota').find(r => String(r.id) === String(promes.prota_id));
      // ⚠️ kurikulum_promes TIDAK punya kolom 'tahun' sendiri (bug lama di
      // serverAddProbul memakai `promes.tahun` yang selalu undefined) — ambil
      // dari Prota induknya, itu sumber kebenaran yang benar.
      const tahun = (prota && prota.tahun) || new Date().getFullYear();
      const kategori = (prota && prota.kategori) || '';

      const existingProbul = readSheetAsObjects('kurikulum_probul').filter(r => String(r.promes_id) === String(promesId));
      const now = new Date().toISOString();

      for (let bulan = 1; bulan <= 6; bulan++) {
        const target = String((bulanTargets && (bulanTargets[bulan] || bulanTargets[String(bulan)])) || '').trim();
        const existing = existingProbul.find(function (r) { return parseInt(r.bulan) === bulan; });

        if (existing) {
          if (target) {
            updateRowByQuery('kurikulum_probul', { id: existing.id }, { target: target, updated_at: now });
          }
        } else if (target) {
          const id = 'probul_' + promesId + '_' + bulan;
          appendRowToSheet('kurikulum_probul', [id, promes.kelompok_id, promesId, tahun, bulan, kategori, target, '', user.id, now, now]);
        }
      }

      cacheDrop_('kurikulum_probul_bypromes_' + promesId);
      cacheDrop_('kurikulum_fulltree_' + promes.kelompok_id + '_' + tahun);
      for (let b = 1; b <= 6; b++) {
        cacheDrop_('kurikulum_probul_' + promes.kelompok_id + '_' + tahun + '_' + b);
      }

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
