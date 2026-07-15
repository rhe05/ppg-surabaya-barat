/**
 * Modul_Dashboard.gs — Queries agregasi Dashboard PPG
 * Level: PPG (seluruh 5 Desa, 18 Kelompok)
 *
 * Dipanggil dari Index.html saat load dashboard screen.
 */

/**
 * GET KPI utama dashboard (4 card):
 * - totalSantri (sum semua santri di kelompok aktif)
 * - totalGuru (sum semua guru di kelompok aktif)
 * - kelompokAktif (count kelompok dengan status=aktif)
 * - kehadiranMingguan (% kehadiran minggu ini per desa, average)
 */
function serverGetDashboardKPIs() {
  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const guruData = readSheetAsObjects(SHEET_NAMES.GURU);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);

  // Filter kelompok aktif saja
  const kelompokAktif = kelompokData.filter(k => k.status_aktif === 'aktif');
  const kelompokAktifIds = kelompokAktif.map(k => k.id);

  // Total santri di kelompok aktif
  const totalSantri = santriData.filter(s => kelompokAktifIds.includes(s.kelompok_id)).length;

  // Total guru di kelompok aktif
  const totalGuru = guruData.filter(g => kelompokAktifIds.includes(g.kelompok_id)).length;

  // Count kelompok aktif
  const countKelompokAktif = kelompokAktif.length;

  // Kehadiran minggu ini (last 7 days): hitung % santri aktif yang hadir
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const absensiMingguan = absensiData.filter(a => {
    const tanggal = new Date(a.tanggal);
    return tanggal >= sevenDaysAgo && tanggal <= today;
  });

  let totalAbsensiRecord = 0;
  let totalHadir = 0;

  absensiMingguan.forEach(a => {
    const santri = santriData.find(s => s.id === a.santri_id);
    if (santri && kelompokAktifIds.includes(santri.kelompok_id)) {
      totalAbsensiRecord++;
      if (a.status === 'hadir') totalHadir++;
    }
  });

  const kehadiranPersen = totalAbsensiRecord > 0 ? Math.round((totalHadir / totalAbsensiRecord) * 100) : 0;

  return {
    totalSantri: totalSantri,
    totalGuru: totalGuru,
    kelompokAktif: countKelompokAktif,
    kehadiranPersenMingguan: kehadiranPersen,
  };
}

/**
 * GET breakdown per Desa (5 baris):
 * [{desa_nama, kelompokAktif, totalSantri, totalGuru, kehadiranPersen}, ...]
 * Sorted: aktif dulu, kemudian status.
 */
function serverGetDashboardDesaBreakdown() {
  const desaData = readSheetAsObjects(SHEET_NAMES.DESA);
  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const guruData = readSheetAsObjects(SHEET_NAMES.GURU);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);

  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

  const absensiMingguan = absensiData.filter(a => {
    const tanggal = new Date(a.tanggal);
    return tanggal >= sevenDaysAgo && tanggal <= today;
  });

  const breakdown = desaData.map(desa => {
    // Kelompok di Desa ini
    const kelompokDesa = kelompokData.filter(k => k.desa_id === desa.id);
    const kelompokAktifCount = kelompokDesa.filter(k => k.status_aktif === 'aktif').length;
    const kelompokAktifIds = kelompokDesa.filter(k => k.status_aktif === 'aktif').map(k => k.id);

    // Total santri & guru di kelompok aktif
    const totalSantriDesa = santriData.filter(s => kelompokAktifIds.includes(s.kelompok_id)).length;
    const totalGuruDesa = guruData.filter(g => kelompokAktifIds.includes(g.kelompok_id)).length;

    // Kehadiran minggu ini di Desa ini
    let totalAbsensiDesa = 0;
    let totalHadirDesa = 0;

    absensiMingguan.forEach(a => {
      const santri = santriData.find(s => s.id === a.santri_id);
      if (santri && kelompokAktifIds.includes(santri.kelompok_id)) {
        totalAbsensiDesa++;
        if (a.status === 'hadir') totalHadirDesa++;
      }
    });

    const kehadiranDesa = totalAbsensiDesa > 0 ? Math.round((totalHadirDesa / totalAbsensiDesa) * 100) : 0;

    return {
      desa_nama: desa.nama,
      kelompok_aktif: kelompokAktifCount,
      kelompok_total: kelompokDesa.length,
      total_santri: totalSantriDesa,
      total_guru: totalGuruDesa,
      kehadiran_persen: kehadiranDesa,
    };
  });

  // Sort: kelompok aktif dulu (descending), lalu nama Desa
  return breakdown.sort((a, b) => b.kelompok_aktif - a.kelompok_aktif);
}

/**
 * GET kehadiran 7 hari terakhir (untuk bar chart):
 * Return { labels: ['Mon', 'Tue', ...], datasets: [{desa_nama, data: [%,%,...]}, ...] }
 *
 * Simplified: hanya Desa yang ada kelompok aktif (Petemon, Purwodadi) untuk clarity visual.
 */
function serverGetKehadiranChart7Hari() {
  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);
  const desaData = readSheetAsObjects(SHEET_NAMES.DESA);

  // Ambil Desa yang punya kelompok aktif
  const desaAktif = desaData.filter(d => {
    const kelompokDesa = kelompokData.filter(k => k.desa_id === d.id);
    return kelompokDesa.some(k => k.status_aktif === 'aktif');
  });

  // Generate 7 hari terakhir (mulai 6 hari lalu sampai hari ini)
  const dates = [];
  const labels = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(date);
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
    const dayNum = date.getDate();
    labels.push(`${dayName} ${dayNum}`);
  }

  // Hitung kehadiran per hari per Desa
  const datasets = desaAktif.map(desa => {
    const kelompokDesa = kelompokData.filter(k => k.desa_id === desa.id && k.status_aktif === 'aktif');
    const kelompokAktifIds = kelompokDesa.map(k => k.id);

    const data = dates.map(date => {
      const dateStr = date.toISOString().split('T')[0];
      const absensiHari = absensiData.filter(a => a.tanggal === dateStr);

      let totalAhari = 0;
      let totalHadirHari = 0;

      absensiHari.forEach(a => {
        const santri = santriData.find(s => s.id === a.santri_id);
        if (santri && kelompokAktifIds.includes(santri.kelompok_id)) {
          totalAhari++;
          if (a.status === 'hadir') totalHadirHari++;
        }
      });

      return totalAhari > 0 ? Math.round((totalHadirHari / totalAhari) * 100) : 0;
    });

    return {
      desa_nama: desa.nama,
      data: data,
    };
  });

  return {
    labels: labels,
    datasets: datasets,
  };
}
