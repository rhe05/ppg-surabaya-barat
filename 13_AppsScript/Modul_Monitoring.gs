/**
 * Modul_Monitoring.gs — Monitoring kehadiran generus per jenjang & kelas ngaji.
 * Layar Kehadiran (Modul_MaintainAbsensi.gs) cuma MENAMPILKAN data absensi.
 * Modul ini MENGOLAH data itu jadi rata-rata kehadiran per kelas_ngaji, lalu
 * per jenjang (rata-rata dari rata-rata kelas, bukan rata-rata gabungan semua
 * santri — supaya kelas kecil tidak "tenggelam" oleh kelas besar).
 */

const MONITORING_JENJANG_LIST_ = ['Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja'];
const MONITORING_JENJANG_LABEL_ = {
  'Cabe Rawit': 'Cabe Rawit',
  'Pra Remaja': 'Pra Remaja',
  'Remaja SMA': 'Remaja SMA',
  'Remaja': 'Remaja Pra Nikah',
};

/**
 * Kategori & warna kehadiran berdasar ambang batas tetap (disepakati user):
 * 90-100% Sangat Baik (hijau tua), 80-89% Baik (hijau muda),
 * 70-79% Perlu Perhatian (kuning), <70% Prioritas Pembinaan (merah).
 */
function kategoriKehadiran_(pct) {
  if (pct >= 90) return { label: 'Sangat Baik', warna: 'hijau-tua' };
  if (pct >= 80) return { label: 'Baik', warna: 'hijau-muda' };
  if (pct >= 70) return { label: 'Perlu Perhatian', warna: 'kuning' };
  return { label: 'Prioritas Pembinaan', warna: 'merah' };
}

/**
 * GET rata-rata kehadiran generus per jenjang & kelas ngaji, bulan tertentu.
 * @returns {Object} { success, data: [{ jenjang, label, avgPct, kategoriLabel,
 *   warna, jumlahKelas, jumlahSantri, kelasList: [{kelas, jumlahSantri, adaData,
 *   avgPct, label, warna}] }] }
 */
function serverGetMonitoringGenerus(token, kelompokId, year, month) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santriList = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(s => s.kelompok_id == kelompokId);
  const santriIds = santriList.map(s => String(s.id));

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];

  // ERROR_LOG.md #8: kolom tanggal di sheet Absensi diam-diam jadi objek Date,
  // WAJIB dinormalkan lewat tanggalKeString_() sebelum dibandingkan sbg string.
  const monthAbsensi = readSheetAsObjects(SHEET_NAMES.ABSENSI).filter(function (a) {
    const tgl = tanggalKeString_(a.tanggal);
    return tgl >= monthStart && tgl <= monthEnd && santriIds.indexOf(String(a.santri_id)) !== -1;
  });

  // % kehadiran per santri (hadir / total record bulan itu).
  const statsBySantri = {};
  monthAbsensi.forEach(function (a) {
    const id = String(a.santri_id);
    if (!statsBySantri[id]) statsBySantri[id] = { hadir: 0, total: 0 };
    statsBySantri[id].total++;
    if (a.status === 'hadir') statsBySantri[id].hadir++;
  });

  const jenjangResult = MONITORING_JENJANG_LIST_.map(function (jenjangKey) {
    const santriJenjang = santriList.filter(s => s.jenjang_saat_ini === jenjangKey);

    // Kelompokkan per kelas_ngaji (teks bebas, di-trim; kosong -> 'Belum diisi').
    const kelasMap = {};
    santriJenjang.forEach(function (s) {
      const kelasNama = String(s.kelas_ngaji || '').trim() || 'Belum diisi';
      if (!kelasMap[kelasNama]) kelasMap[kelasNama] = [];
      kelasMap[kelasNama].push(s);
    });

    const kelasList = Object.keys(kelasMap).map(function (kelasNama) {
      const anggota = kelasMap[kelasNama];
      const pctList = [];
      anggota.forEach(function (s) {
        const st = statsBySantri[String(s.id)];
        if (st && st.total > 0) pctList.push((st.hadir / st.total) * 100);
      });
      const adaData = pctList.length > 0;
      const avgPct = adaData ? Math.round(pctList.reduce(function (a, b) { return a + b; }, 0) / pctList.length) : null;
      const kat = adaData ? kategoriKehadiran_(avgPct) : null;
      return {
        kelas: kelasNama,
        jumlahSantri: anggota.length,
        adaData: adaData,
        avgPct: avgPct,
        label: adaData ? kat.label : 'Belum ada data',
        warna: adaData ? kat.warna : 'abu',
      };
    });

    // Urutkan: yang ada data dulu (dari % terendah, biar prioritas pembinaan
    // nongol duluan), lalu yang belum ada data di paling bawah.
    kelasList.sort(function (a, b) {
      if (a.adaData && b.adaData) return a.avgPct - b.avgPct;
      if (a.adaData) return -1;
      if (b.adaData) return 1;
      return 0;
    });

    const kelasDenganData = kelasList.filter(function (k) { return k.adaData; });
    const avgJenjang = kelasDenganData.length > 0
      ? Math.round(kelasDenganData.reduce(function (sum, k) { return sum + k.avgPct; }, 0) / kelasDenganData.length)
      : null;
    const katJenjang = avgJenjang !== null ? kategoriKehadiran_(avgJenjang) : null;

    return {
      jenjang: jenjangKey,
      label: MONITORING_JENJANG_LABEL_[jenjangKey],
      avgPct: avgJenjang,
      kategoriLabel: avgJenjang !== null ? katJenjang.label : 'Belum ada data',
      warna: avgJenjang !== null ? katJenjang.warna : 'abu',
      jumlahKelas: kelasList.length,
      jumlahSantri: santriJenjang.length,
      kelasList: kelasList,
    };
  });

  return { success: true, data: jenjangResult, tahun: year, bulan: month };
}
