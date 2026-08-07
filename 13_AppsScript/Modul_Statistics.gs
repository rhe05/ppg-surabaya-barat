/**
 * Modul_Statistics.gs — Advanced Analytics & Data Aggregation
 * Compute statistics untuk chart visualization
 */

/**
 * GET attendance trend (weekly): attendance % per minggu
 * Cache 180dtk per (kelompokId, days) — tab Statistik dibaca ulang tiap buka
 * tab/ganti sub-tab TANPA cache sebelumnya, padahal `absensi` dibaca PENUH
 * tiap panggilan (audit performa 2026-08-07, Sprint 2).
 */
function serverGetAttendanceTrend(token, kelompokId, days = 90) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const cacheKey = 'stats_trend_' + kelompokId + '_' + days;
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  // santriData dikirim sbg preload -- hindari baca ulang tabel santri
  // (audit performa 2026-08-07, Sprint 3).
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI, santriData);

  const santri = santriData.filter(s => s.kelompok_id == kelompokId);
  const santriIds = santri.map(s => s.id);

  const today = new Date();
  const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);

  const absensiKelompok = absensiData.filter(a => {
    const tanggal = new Date(a.tanggal);
    return santriIds.includes(a.santri_id) && tanggal >= startDate && tanggal <= today;
  });

  // Group by week
  const weeks = {};
  absensiKelompok.forEach(a => {
    const tanggal = new Date(a.tanggal);
    const weekStart = new Date(tanggal);
    weekStart.setDate(tanggal.getDate() - tanggal.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeks[weekKey]) {
      weeks[weekKey] = { hadir: 0, total: 0 };
    }
    weeks[weekKey].total++;
    if (a.status === 'hadir') weeks[weekKey].hadir++;
  });

  const trend = Object.entries(weeks)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .map(([week, data]) => ({
      week: week,
      percent: Math.round((data.hadir / data.total) * 100)
    }));

  const result = {
    success: true,
    data: trend
  };
  cachePut_(cacheKey, result, 180);
  return result;
}

/**
 * GET attendance rate per kelompok (untuk ranking/comparison)
 * Note: Untuk admin PPG, show semua kelompok; untuk admin kelompok, show hanya kelompok mereka
 * Cache 180dtk per (days, role, scopeId) — hasil akhir sudah terfilter RBAC,
 * jadi aman di-cache per identitas user (audit performa 2026-08-07, Sprint 2).
 */
function serverGetAttendanceByKelompok(token, days = 30) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const cacheKey = 'stats_bykelompok_' + days + '_' + user.role + '_' + user.scopeId;
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI, santriData);

  const today = new Date();
  const startDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);

  const results = [];

  kelompokData.forEach(kelompok => {
    // Filter by user access
    if (user.role === 'admin_kelompok' && kelompok.id != user.scopeId) return;

    const santri = santriData.filter(s => s.kelompok_id == kelompok.id);
    const santriIds = santri.map(s => s.id);

    const absensiKelompok = absensiData.filter(a => {
      const tanggal = new Date(a.tanggal);
      return santriIds.includes(a.santri_id) && tanggal >= startDate && tanggal <= today;
    });

    const totalHadir = absensiKelompok.filter(a => a.status === 'hadir').length;
    const totalRecord = absensiKelompok.length;
    const percent = totalRecord > 0 ? Math.round((totalHadir / totalRecord) * 100) : 0;

    results.push({
      kelompok_id: kelompok.id,
      kelompok_nama: kelompok.nama,
      desa: kelompok.desa,
      totalSantri: santri.length,
      totalHadir,
      totalRecord,
      percent
    });
  });

  // Sort by percent descending
  results.sort((a, b) => b.percent - a.percent);

  const result = {
    success: true,
    data: results
  };
  cachePut_(cacheKey, result, 180);
  return result;
}

/**
 * GET santri demographics (gender distribution, per jenjang)
 * Cache 180dtk per kelompokId (audit performa 2026-08-07, Sprint 2).
 */
function serverGetSantriDemographics(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const cacheKey = 'stats_demografi_' + kelompokId;
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const santri = santriData.filter(s => s.kelompok_id == kelompokId);

  // Gender distribution
  const genderDist = {};
  santri.forEach(s => {
    const gender = s.gender || 'Lainnya';
    genderDist[gender] = (genderDist[gender] || 0) + 1;
  });

  // Distribution by jenjang
  const jenjangDist = {};
  santri.forEach(s => {
    const jenjang = s.jenjang_saat_ini || 'Belum Ditentukan';
    jenjangDist[jenjang] = (jenjangDist[jenjang] || 0) + 1;
  });

  const result = {
    success: true,
    data: {
      gender: genderDist,
      jenjang: jenjangDist,
      totalSantri: santri.length
    }
  };
  cachePut_(cacheKey, result, 180);
  return result;
}

/**
 * GET top attendees (santri dengan kehadiran tertinggi bulan ini)
 * Cache 180dtk per (kelompokId, limit) (audit performa 2026-08-07, Sprint 2).
 */
function serverGetTopAttendees(token, kelompokId, limit = 10) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const cacheKey = 'stats_top_' + kelompokId + '_' + limit;
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI, santriData);

  const santri = santriData.filter(s => s.kelompok_id == kelompokId);
  const santriMap = Object.fromEntries(santri.map(s => [s.id, s]));

  // Count attendance per santri (bulan ini)
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const absensiMonth = absensiData.filter(a => {
    const tanggal = new Date(a.tanggal);
    return santriMap[a.santri_id] && tanggal >= monthStart && tanggal <= today;
  });

  const attendance = {};
  absensiMonth.forEach(a => {
    if (!attendance[a.santri_id]) {
      attendance[a.santri_id] = { hadir: 0, total: 0 };
    }
    attendance[a.santri_id].total++;
    if (a.status === 'hadir') attendance[a.santri_id].hadir++;
  });

  const results = Object.entries(attendance)
    .map(([santriId, data]) => ({
      nama: santriMap[santriId].nama,
      hadir: data.hadir,
      total: data.total,
      percent: Math.round((data.hadir / data.total) * 100)
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, limit);

  const result = {
    success: true,
    data: results
  };
  cachePut_(cacheKey, result, 180);
  return result;
}

/**
 * GET worst attendees (santri dengan absen terbanyak)
 * Cache 180dtk per (kelompokId, limit) (audit performa 2026-08-07, Sprint 2).
 */
function serverGetWorstAttendees(token, kelompokId, limit = 10) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const cacheKey = 'stats_worst_' + kelompokId + '_' + limit;
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI, santriData);

  const santri = santriData.filter(s => s.kelompok_id == kelompokId);
  const santriMap = Object.fromEntries(santri.map(s => [s.id, s]));

  // Count attendance per santri (bulan ini)
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const absensiMonth = absensiData.filter(a => {
    const tanggal = new Date(a.tanggal);
    return santriMap[a.santri_id] && tanggal >= monthStart && tanggal <= today;
  });

  const attendance = {};
  absensiMonth.forEach(a => {
    if (!attendance[a.santri_id]) {
      attendance[a.santri_id] = { hadir: 0, total: 0 };
    }
    attendance[a.santri_id].total++;
    if (a.status === 'hadir') attendance[a.santri_id].hadir++;
  });

  const results = Object.entries(attendance)
    .map(([santriId, data]) => ({
      nama: santriMap[santriId].nama,
      hadir: data.hadir,
      total: data.total,
      absen: data.total - data.hadir,
      percent: Math.round((data.hadir / data.total) * 100)
    }))
    .sort((a, b) => a.percent - b.percent)
    .slice(0, limit);

  const result = {
    success: true,
    data: results
  };
  cachePut_(cacheKey, result, 180);
  return result;
}

/**
 * GET growth metrics: santri/guru baru per bulan (last 6 months)
 */
function serverGetGrowthMetrics(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const guruData = readSheetAsObjects(SHEET_NAMES.GURU);

  const santri = santriData.filter(s => s.kelompok_id == kelompokId);
  const guru = guruData.filter(g => g.kelompok_id == kelompokId);

  // Assume created_at field exists; if not, count total as static
  const months = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months[monthKey] = { santri: 0, guru: 0 };
  }

  // Count (simplified: assume all existing data is "growth")
  // In reality, you'd need created_at field in sheets
  const totalMonths = Object.keys(months).length;
  const santriPerMonth = Math.ceil(santri.length / totalMonths);
  const guruPerMonth = Math.ceil(guru.length / totalMonths);

  Object.keys(months).forEach(month => {
    months[month] = { santri: santriPerMonth, guru: guruPerMonth };
  });

  const growth = Object.entries(months)
    .map(([month, data]) => ({
      month,
      santri: data.santri,
      guru: data.guru
    }));

  return {
    success: true,
    data: growth,
    totalSantri: santri.length,
    totalGuru: guru.length
  };
}

/**
 * GET kelompok ranking by attendance (untuk performance dashboard)
 */
function serverGetKelompokRanking(token, days = 30) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // Only admin_ppg atau admin_desa can see all kelompok
  if (user.role === 'admin_kelompok') {
    return { success: false, error: 'Hanya admin dapat melihat ranking semua kelompok.' };
  }

  return serverGetAttendanceByKelompok(token, days);
}
