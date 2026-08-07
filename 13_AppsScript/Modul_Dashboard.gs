/**
 * Modul_Dashboard.gs — Queries agregasi Dashboard PPG
 * Level: PPG (seluruh 5 Desa, 18 Kelompok)
 *
 * Dipanggil dari Index.html saat load dashboard screen.
 */

/**
 * GET seluruh data Dashboard PPG dalam 1 panggilan (KPI + breakdown per Desa +
 * Santri Teladan) — GABUNGAN dari 3 fungsi terpisah sebelumnya
 * (serverGetDashboardKPIs/serverGetDashboardDesaBreakdown/
 * serverGetDashboardSantriTeladan), yang tiap-tiap manggil readSheetAsObjects
 * SENDIRI-SENDIRI utk tabel yang sama (mis. absensi dibaca penuh 3×).
 * Digabung supaya tiap tabel sumber cuma dibaca 1× per load Dashboard —
 * turun dari 14 pemanggilan readSheetAsObjects jadi 7, dan dari 3 network
 * round-trip (google.script.run) jadi 1.
 *
 * ⚠️ Sekalian membenahi bug lama: 2 fungsi asal (KPIs, DesaBreakdown) TIDAK
 * PERNAH mengembalikan field `success` (satu return objek polos, satu return
 * array polos), padahal frontend cek `if (result.success)` — akibatnya KPI
 * card & tabel Ringkasan Per Desa di Dashboard utama selalu kosong. Baru
 * ketahuan saat menggabung fungsi ini (bukan disengaja dicari).
 *
 * Cache 90dtk (data PPG-wide, sama utk semua admin_ppg — 1 kunci global):
 * layar paling sering dibuka, TTL pendek dipilih drpd invalidasi eksplisit
 * di tiap titik mutasi absensi/santri/guru/munaqosah/akhlaq (banyak file,
 * risiko ada yg terlewat) — 90dtk cukup basi utk tidak kerasa "nyangkut",
 * cukup kecil utk hemat baca berkali-kali dlm sesi yg sama (audit performa
 * 2026-08-07, Sprint 1). `forceFresh` (dipakai tombol Refresh global,
 * window.hardRefresh_ -> SCREEN_LOADERS_.screenDashboard, Sprint 2) menembus
 * cache -- pola sama `serverGetSantriList`/`serverGetGuruList`.
 */
function serverGetDashboardBundle(forceFresh) {
  const cached = forceFresh ? null : cacheGet_('dashboard_bundle');
  if (cached) return cached;

  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const guruData = readSheetAsObjects(SHEET_NAMES.GURU);
  // santriData dikirim sbg preload -- hindari readSheetAsObjects(ABSENSI)
  // baca ulang SELURUH tabel santri lagi cuma utk peta join (audit performa
  // 2026-08-07, Sprint 3).
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI, santriData);
  const desaData = readSheetAsObjects(SHEET_NAMES.DESA);
  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH);
  const akhlaqData = readSheetAsObjects(SHEET_NAMES.KURIKULUM_AKHLAQ);

  // Lookup O(1) (Map by id) — sebelumnya `santriData.find(...)`/`kelompokData.find(...)`
  // di dalam .forEach()/.map() = O(n×m) (±280rb operasi per load Dashboard
  // pada data production sekarang). Hasil akhir IDENTIK, murni algoritma.
  // santriById: kode asli pakai `===` (strict) -> key APA ADANYA (s.id).
  // kelompokById: kode asli pakai `==` (LONGGAR, `k.id == santri.kelompok_id`)
  // -> key di-String()-kan supaya toleran beda tipe number/string spt semula,
  // JANGAN dibuat strict atau nama kelompok bisa jadi 'Unknown' kalau tipe
  // id beda antara sheet kelompok & santri.
  const santriById = new Map(santriData.map(s => [s.id, s]));
  const kelompokById = new Map(kelompokData.map(k => [String(k.id), k]));

  const kelompokAktif = kelompokData.filter(k => k.status_aktif === 'aktif');
  const kelompokAktifIds = kelompokAktif.map(k => k.id);

  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  const absensiMingguan = absensiData.filter(a => {
    const tanggal = new Date(a.tanggal);
    return tanggal >= sevenDaysAgo && tanggal <= today;
  });

  // ═══ KPI utama (4 card) ═══
  const totalSantri = santriData.filter(s => kelompokAktifIds.includes(s.kelompok_id)).length;
  const totalGuru = guruData.filter(g => kelompokAktifIds.includes(g.kelompok_id)).length;

  let totalAbsensiRecord = 0;
  let totalHadir = 0;
  absensiMingguan.forEach(a => {
    const santri = santriById.get(a.santri_id);
    if (santri && kelompokAktifIds.includes(santri.kelompok_id)) {
      totalAbsensiRecord++;
      if (a.status === 'hadir') totalHadir++;
    }
  });
  const kehadiranPersen = totalAbsensiRecord > 0 ? Math.round((totalHadir / totalAbsensiRecord) * 100) : 0;

  // ═══ Breakdown per Desa (5 baris) ═══
  const desaBreakdown = desaData.map(desa => {
    const kelompokDesa = kelompokData.filter(k => k.desa_id === desa.id);
    const kelompokAktifDesaIds = kelompokDesa.filter(k => k.status_aktif === 'aktif').map(k => k.id);

    const totalSantriDesa = santriData.filter(s => kelompokAktifDesaIds.includes(s.kelompok_id)).length;
    const totalGuruDesa = guruData.filter(g => kelompokAktifDesaIds.includes(g.kelompok_id)).length;

    let totalAbsensiDesa = 0;
    let totalHadirDesa = 0;
    absensiMingguan.forEach(a => {
      const santri = santriById.get(a.santri_id);
      if (santri && kelompokAktifDesaIds.includes(santri.kelompok_id)) {
        totalAbsensiDesa++;
        if (a.status === 'hadir') totalHadirDesa++;
      }
    });
    const kehadiranDesa = totalAbsensiDesa > 0 ? Math.round((totalHadirDesa / totalAbsensiDesa) * 100) : 0;

    return {
      desa_nama: desa.nama,
      kelompok_aktif: kelompokAktifDesaIds.length,
      kelompok_total: kelompokDesa.length,
      total_santri: totalSantriDesa,
      total_guru: totalGuruDesa,
      kehadiran_persen: kehadiranDesa,
    };
  }).sort((a, b) => b.kelompok_aktif - a.kelompok_aktif);

  // ═══ Santri Teladan (Nilai >= 90 AND Akhlaq >= 90 AND Kehadiran >= 95%) ═══
  const santriAktif = santriData.filter(s => kelompokAktifIds.includes(s.kelompok_id));
  const santriTeladan = santriAktif.map(santri => {
    const nilaiRecords = munaqosahData.filter(m => m.santri_id == santri.id && m.status === 'dinilai');
    const nilai = nilaiRecords.length > 0 ? Math.max(...nilaiRecords.map(n => Number(n.nilai))) : 0;

    const akhlaqRecords = akhlaqData.filter(a => a.santri_id == santri.id);
    const akhlaq = akhlaqRecords.length > 0 ? Math.max(...akhlaqRecords.map(a => Number(a.nilai_akhlaq || 0))) : 0;

    const absensiSantri = absensiData.filter(a => a.santri_id == santri.id);
    const hadirCount = absensiSantri.filter(a => a.status === 'hadir').length;
    const kehadiranPersenSantri = absensiSantri.length > 0 ? Math.round((hadirCount / absensiSantri.length) * 100) : 0;

    const kelompok = kelompokById.get(String(santri.kelompok_id));

    return {
      santri_id: santri.id,
      nama: santri.nama,
      kelas: santri.jenjang_saat_ini,
      nilai: nilai,
      akhlaq: akhlaq,
      kehadiran_persen: kehadiranPersenSantri,
      kelompok_nama: kelompok ? kelompok.nama : 'Unknown',
      status: nilai >= 90 && akhlaq >= 90 && kehadiranPersenSantri >= 95 ? 'teladan' : 'not_qualified',
    };
  }).filter(r => r.status === 'teladan').sort((a, b) => b.nilai - a.nilai);

  const result = {
    success: true,
    kpi: {
      totalSantri: totalSantri,
      totalGuru: totalGuru,
      kelompokAktif: kelompokAktif.length,
      kehadiranPersenMingguan: kehadiranPersen,
    },
    desaBreakdown: desaBreakdown,
    santriTeladan: santriTeladan,
  };

  cachePut_('dashboard_bundle', result, 90);
  return result;
}

/**
 * GET kehadiran 7 hari terakhir (untuk bar chart):
 * Return { labels: ['Mon', 'Tue', ...], datasets: [{desa_nama, data: [%,%,...]}, ...] }
 *
 * Simplified: hanya Desa yang ada kelompok aktif (Petemon, Purwodadi) untuk clarity visual.
 * ⚠️ Tidak dipanggil dari frontend manapun saat ini (dead code) — dibiarkan
 * apa adanya, di luar cakupan penggabungan Dashboard di atas.
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
      const absensiHari = absensiData.filter(a => tanggalKeString_(a.tanggal) === dateStr);

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

/**
 * GET Santri Teladan untuk Dashboard dengan full criteria:
 * Nilai (Munaqosah) >= 90 AND Akhlaq (Kurikulum) >= 90 AND Kehadiran >= 95%
 * Return: [{nama, kelas, nilai, akhlaq, kehadiran_persen, kelompok_nama}] sorted by nilai DESC
 */
function serverGetDashboardSantriTeladan() {
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH);
  const akhlaqData = readSheetAsObjects(SHEET_NAMES.KURIKULUM_AKHLAQ);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);
  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);

  // Filter kelompok aktif saja
  const kelompokAktif = kelompokData.filter(k => k.status_aktif === 'aktif').map(k => k.id);
  const santriAktif = santriData.filter(s => kelompokAktif.includes(s.kelompok_id));

  const result = santriAktif.map(santri => {
    // Get latest nilai from munaqosah (any periode, get max value)
    const nilaiRecords = munaqosahData.filter(m => m.santri_id == santri.id && m.status === 'dinilai');
    const nilai = nilaiRecords.length > 0 ? Math.max(...nilaiRecords.map(n => Number(n.nilai))) : 0;

    // Get latest akhlaq from kurikulum_akhlaq
    const akhlaqRecords = akhlaqData.filter(a => a.santri_id == santri.id);
    const akhlaq = akhlaqRecords.length > 0 ? Math.max(...akhlaqRecords.map(a => Number(a.nilai_akhlaq || 0))) : 0;

    // Calculate kehadiran % (semua waktu atau bulan ini)
    const absensiSantri = absensiData.filter(a => a.santri_id == santri.id);
    const hadirCount = absensiSantri.filter(a => a.status === 'hadir').length;
    const kehadiranPersen = absensiSantri.length > 0 ? Math.round((hadirCount / absensiSantri.length) * 100) : 0;

    // Get kelompok info
    const kelompok = kelompokData.find(k => k.id == santri.kelompok_id);

    return {
      santri_id: santri.id,
      nama: santri.nama,
      kelas: santri.jenjang_saat_ini,
      nilai: nilai,
      akhlaq: akhlaq,
      kehadiran_persen: kehadiranPersen,
      kelompok_nama: kelompok ? kelompok.nama : 'Unknown',
      status: nilai >= 90 && akhlaq >= 90 && kehadiranPersen >= 95 ? 'teladan' : 'not_qualified',
    };
  });

  // Filter santri teladan dan sort by nilai DESC
  const teladanOnly = result.filter(r => r.status === 'teladan').sort((a, b) => b.nilai - a.nilai);

  return {
    success: true,
    data: teladanOnly,
    total: teladanOnly.length,
  };
}

/**
 * GET struktur sidebar Desa > Kelompok langsung dari sheet (bukan hardcode).
 * Kelompok berstatus 'aktif' → bisa diklik; selain itu → disabled ("Segera hadir").
 * Desa tanpa kelompok aktif ikut tampil tapi tidak bisa dibuka.
 * Return: {success, data: [{id, nama, adaAktif, kelompok: [{id, nama, aktif}]}]}
 */
function serverGetSidebarTree() {
  try {
    const cached = cacheGet_('sidebar_tree');
    if (cached) return cached;

    const desaData = readSheetAsObjects(SHEET_NAMES.DESA);
    const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);

    const data = desaData.map(function (desa) {
      const anak = kelompokData
        .filter(function (k) { return k.desa_id === desa.id; })
        .map(function (k) {
          return { id: k.id, nama: k.nama, aktif: k.status_aktif === 'aktif' };
        });
      return {
        id: desa.id,
        nama: desa.nama,
        adaAktif: anak.some(function (k) { return k.aktif; }),
        kelompok: anak,
      };
    });

    const result = { success: true, data: data };
    cachePut_('sidebar_tree', result, 600);
    return result;
  } catch (e) {
    return { success: false, error: e.message };
  }
}
