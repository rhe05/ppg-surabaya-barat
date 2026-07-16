/**
 * Modul_MaintainMunaqosah.gs — CRUD Penilaian (Evaluasi Santri)
 * Server-side functions untuk entry penilaian santri per periode.
 *
 * RBAC:
 * - admin_ppg: Akses semua penilaian
 * - admin_desa/kelompok: Akses penilaian di desa/kelompok mereka
 * - guru: View-only access
 */

/**
 * GET daftar periode munaqosah yang aktif + tertutup.
 * Return: [{id, semester, status, estimasi_buka_kembali}]
 */
function serverGetPeriodeMunaqosah(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const periodeData = readSheetAsObjects(SHEET_NAMES.PERIODE_MUNAQOSAH);
  const result = periodeData.map(p => ({
    id: p.id,
    semester: p.semester,
    status: p.status,
    estimasi_buka_kembali: p.estimasi_buka_kembali,
  }));

  return { success: true, data: result };
}

/**
 * GET daftar penilaian dengan filter.
 * Filters: periodeId, kelompokId, desaId, bulan, tahun, status
 * Return: [{santri_id, nama, kelas, nilai, status, dinilai_pada, kelompok_nama}]
 */
function serverGetMunaqosahList(token, periodeId, filters = {}) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC: Tentukan scope akses
  let accessibleKelompokIds = [];
  if (user.role === 'admin_ppg') {
    // Semua kelompok
    accessibleKelompokIds = readSheetAsObjects(SHEET_NAMES.KELOMPOK).map(k => k.id);
  } else if (user.role === 'admin_desa') {
    // Kelompok di desa user
    accessibleKelompokIds = readSheetAsObjects(SHEET_NAMES.KELOMPOK)
      .filter(k => k.desa_id == user.scope_id)
      .map(k => k.id);
  } else if (user.role === 'admin_kelompok') {
    // Kelompok user saja
    accessibleKelompokIds = [user.scope_id];
  } else {
    // guru: view-only
    accessibleKelompokIds = readSheetAsObjects(SHEET_NAMES.KELOMPOK).map(k => k.id);
  }

  // Ambil data
  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH)
    .filter(m => m.periode_id == periodeId);

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
  const desaData = readSheetAsObjects(SHEET_NAMES.DESA);

  // Filter berdasarkan RBAC
  const santriByKelompok = {};
  santriData.forEach(s => {
    if (accessibleKelompokIds.includes(Number(s.kelompok_id))) {
      santriByKelompok[s.id] = s;
    }
  });

  // Tambahan filter dari parameters
  let result = munaqosahData.filter(m => {
    if (!santriByKelompok[m.santri_id]) return false;
    if (filters.kelompokId && santriByKelompok[m.santri_id].kelompok_id != filters.kelompokId) return false;
    if (filters.status && m.status !== filters.status) return false;
    return true;
  });

  // Join dengan santri data
  result = result.map(m => {
    const santri = santriByKelompok[m.santri_id];
    const kelompok = kelompokData.find(k => k.id == santri.kelompok_id);
    const desa = desaData.find(d => d.id == kelompok.desa_id);

    return {
      id: m.id,
      santri_id: m.santri_id,
      nama: santri.nama,
      kelas: m.kelas || santri.jenjang_saat_ini,
      wilayah: desa ? desa.nama : '',
      kelompok_id: santri.kelompok_id,
      kelompok_nama: kelompok.nama,
      nilai: m.nilai || '-',
      status: m.status,
      tanggal: m.tanggal || '-',
      dinilai_pada: m.dinilai_pada || '-',
    };
  });

  // Sort by nama
  result.sort((a, b) => a.nama.localeCompare(b.nama));

  return { success: true, data: result, total: result.length };
}

/**
 * GET detail penilaian satu santri.
 */
function serverGetMunaqosahDetail(token, munaqosahId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH)
    .find(m => m.id == munaqosahId);

  if (!munaqosahData) {
    return { success: false, error: 'Data penilaian tidak ditemukan.' };
  }

  // RBAC check
  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == munaqosahData.santri_id);
  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses.' };
  }

  return { success: true, data: munaqosahData };
}

/**
 * CREATE penilaian baru untuk santri.
 * Input: {santri_id, periode_id, tanggal, nilai, catatan}
 * Auto-populate: kelas (dari santri.jenjang_saat_ini), wilayah (via join)
 */
function serverCreateMunaqosah(token, munaqosahData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // Validasi data
  if (!munaqosahData.santri_id || !munaqosahData.periode_id) {
    return { success: false, error: 'santri_id dan periode_id harus diisi.' };
  }
  if (munaqosahData.nilai == null || munaqosahData.nilai < 0 || munaqosahData.nilai > 100) {
    return { success: false, error: 'Nilai harus antara 0-100.' };
  }

  // Ambil santri data
  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI)
    .find(s => s.id == munaqosahData.santri_id);
  if (!santri) {
    return { success: false, error: 'Santri tidak ditemukan.' };
  }

  // RBAC check
  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok santri ini.' };
  }

  // Check duplicate: unique(santri_id, periode_id)
  const existing = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH).find(m =>
    m.santri_id == munaqosahData.santri_id && m.periode_id == munaqosahData.periode_id
  );
  if (existing) {
    return { success: false, error: 'Penilaian untuk santri dan periode ini sudah ada.' };
  }

  // Ambil wilayah via join
  const kelompok = readSheetAsObjects(SHEET_NAMES.KELOMPOK)
    .find(k => k.id == santri.kelompok_id);
  const desa = readSheetAsObjects(SHEET_NAMES.DESA)
    .find(d => d.id == kelompok.desa_id);

  // Insert
  const id = generateId(SHEET_NAMES.MUNAQOSAH);
  const now = new Date().toISOString().split('T')[0];
  const munaqosahSheet = getSheetByName(SHEET_NAMES.MUNAQOSAH);

  munaqosahSheet.appendRow([
    id,
    munaqosahData.santri_id,
    munaqosahData.periode_id,
    munaqosahData.tanggal || now,
    munaqosahData.kelas || santri.jenjang_saat_ini,
    desa ? desa.nama : '',
    munaqosahData.nilai,
    'dinilai',
    munaqosahData.catatan || '',
    user.id,
    now,
  ]);

  logAudit(SHEET_NAMES.MUNAQOSAH, id, 'create', user.id, `Penilaian santri ${santri.nama}: ${munaqosahData.nilai}`);

  return { success: true, message: 'Penilaian berhasil disimpan.', id };
}

/**
 * UPDATE penilaian (nilai, catatan).
 * Tidak bisa update dinilai_oleh/dinilai_pada (audit trail).
 */
function serverUpdateMunaqosah(token, munaqosahId, updates) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH)
    .find(m => m.id == munaqosahId);
  if (!munaqosahData) {
    return { success: false, error: 'Data penilaian tidak ditemukan.' };
  }

  // RBAC check
  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI)
    .find(s => s.id == munaqosahData.santri_id);
  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses.' };
  }

  // Validasi nilai jika ada update
  if (updates.nilai != null && (updates.nilai < 0 || updates.nilai > 100)) {
    return { success: false, error: 'Nilai harus antara 0-100.' };
  }

  // Update di sheet
  const before = JSON.stringify(munaqosahData);

  updateRowByQuery(SHEET_NAMES.MUNAQOSAH, { id: munaqosahId }, {
    nilai: updates.nilai !== undefined ? updates.nilai : munaqosahData.nilai,
    catatan: updates.catatan !== undefined ? updates.catatan : munaqosahData.catatan,
    status: updates.status !== undefined ? updates.status : munaqosahData.status,
  });

  const after = JSON.stringify({
    ...munaqosahData,
    nilai: updates.nilai !== undefined ? updates.nilai : munaqosahData.nilai,
    catatan: updates.catatan !== undefined ? updates.catatan : munaqosahData.catatan,
  });

  logAudit(SHEET_NAMES.MUNAQOSAH, munaqosahId, 'update', user.id, `Perubahan: ${before} → ${after}`);

  return { success: true, message: 'Penilaian berhasil diperbarui.' };
}

/**
 * DELETE penilaian (soft delete dengan audit trail).
 */
function serverDeleteMunaqosah(token, munaqosahId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH)
    .find(m => m.id == munaqosahId);
  if (!munaqosahData) {
    return { success: false, error: 'Data penilaian tidak ditemukan.' };
  }

  // RBAC: only admin_ppg atau penilai (dinilai_oleh)
  if (user.role !== 'admin_ppg' && user.id != munaqosahData.dinilai_oleh) {
    return { success: false, error: 'Hanya admin atau penilai yang bisa menghapus.' };
  }

  deleteRowByQuery(SHEET_NAMES.MUNAQOSAH, { id: munaqosahId });
  logAudit(SHEET_NAMES.MUNAQOSAH, munaqosahId, 'delete', user.id, 'Penilaian dihapus');

  return { success: true, message: 'Penilaian berhasil dihapus.' };
}

/**
 * GET santri teladan (nilai >= minScore, default 90).
 * Return: [{santri_id, nama, nilai, kelas, kelompok_nama}] sorted by nilai DESC
 */
function serverGetSantriTeladan(token, periodeId, minScore = 90) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC: Tentukan scope akses
  let accessibleKelompokIds = [];
  if (user.role === 'admin_ppg') {
    accessibleKelompokIds = readSheetAsObjects(SHEET_NAMES.KELOMPOK).map(k => k.id);
  } else if (user.role === 'admin_desa') {
    accessibleKelompokIds = readSheetAsObjects(SHEET_NAMES.KELOMPOK)
      .filter(k => k.desa_id == user.scope_id)
      .map(k => k.id);
  } else if (user.role === 'admin_kelompok') {
    accessibleKelompokIds = [user.scope_id];
  } else {
    accessibleKelompokIds = readSheetAsObjects(SHEET_NAMES.KELOMPOK).map(k => k.id);
  }

  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH)
    .filter(m => m.periode_id == periodeId && m.nilai >= minScore);

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);

  const result = munaqosahData
    .filter(m => {
      const santri = santriData.find(s => s.id == m.santri_id);
      return santri && accessibleKelompokIds.includes(Number(santri.kelompok_id));
    })
    .map(m => {
      const santri = santriData.find(s => s.id == m.santri_id);
      const kelompok = kelompokData.find(k => k.id == santri.kelompok_id);
      return {
        santri_id: m.santri_id,
        nama: santri.nama,
        nilai: m.nilai,
        kelas: m.kelas || santri.jenjang_saat_ini,
        kelompok_nama: kelompok.nama,
      };
    })
    .sort((a, b) => b.nilai - a.nilai);

  return { success: true, data: result, total: result.length };
}

/**
 * GET statistik munaqosah untuk chart/reporting.
 * Return: {sudah_dinilai, belum_dinilai, avg_nilai, distribution_by_kelas}
 */
function serverGetMunaqosahStats(token, periodeId, filters = {}) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC: Tentukan scope akses
  let accessibleKelompokIds = [];
  if (user.role === 'admin_ppg') {
    accessibleKelompokIds = readSheetAsObjects(SHEET_NAMES.KELOMPOK).map(k => k.id);
  } else if (user.role === 'admin_desa') {
    accessibleKelompokIds = readSheetAsObjects(SHEET_NAMES.KELOMPOK)
      .filter(k => k.desa_id == user.scope_id)
      .map(k => k.id);
  } else if (user.role === 'admin_kelompok') {
    accessibleKelompokIds = [user.scope_id];
  }

  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH)
    .filter(m => m.periode_id == periodeId);

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);

  // Filter by accessible kelompok
  const filteredMunaqosah = munaqosahData.filter(m => {
    const santri = santriData.find(s => s.id == m.santri_id);
    return santri && accessibleKelompokIds.includes(Number(santri.kelompok_id));
  });

  // Hitung statistik
  const sudahDinilai = filteredMunaqosah.filter(m => m.status === 'dinilai').length;
  const belumDinilai = filteredMunaqosah.filter(m => m.status !== 'dinilai').length;
  const nilai = filteredMunaqosah.map(m => Number(m.nilai || 0));
  const avgNilai = nilai.length > 0 ? Math.round(nilai.reduce((a, b) => a + b, 0) / nilai.length * 100) / 100 : 0;

  // Distribution by kelas
  const distribution = {};
  filteredMunaqosah.forEach(m => {
    const kelas = m.kelas || 'Unknown';
    distribution[kelas] = (distribution[kelas] || 0) + 1;
  });

  return {
    success: true,
    data: {
      sudah_dinilai: sudahDinilai,
      belum_dinilai: belumDinilai,
      total: sudahDinilai + belumDinilai,
      avg_nilai: avgNilai,
      distribution_by_kelas: distribution,
    },
  };
}
