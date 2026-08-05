/**
 * Modul_Monitoring.gs — Monitoring kehadiran generus per jenjang & kelas ngaji.
 * Layar Kehadiran (Modul_MaintainAbsensi.gs) cuma MENAMPILKAN data absensi.
 * Modul ini MENGOLAH data itu jadi rata-rata kehadiran per kelas_ngaji, lalu
 * per jenjang (rata-rata dari rata-rata kelas, bukan rata-rata gabungan semua
 * santri — supaya kelas kecil tidak "tenggelam" oleh kelas besar).
 *
 * ⚠️ PERF (2026-07-30): fungsi Kehadiran Generus (`serverGetKehadiranGenerusKategori`/
 * `Matrix`/`DetailList`, dipakai tab Operasional & Laporan) baca guru/jadwal_kbm/
 * santri/absensi lewat `iaReadKelompokTablesParallel_`/`iaReadKelompokTable_`/
 * `iaReadAbsensiKelompokRange_` (Modul_InputAbsen.gs) — SCOPED ke satu kelompok saja
 * (Firestore langsung utk Kelp Petemon via `FIRESTORE_KELOMPOK_TABLES_`, Sheets
 * terfilter utk kelompok lain). JANGAN kembalikan ke `readSheetAsObjects()`
 * generik di fungsi-fungsi ini — itu scan SELURUH sheet semua kelompok dulu baru
 * dibuang, boros baca & boros kuota Firestore. `serverGetMonitoringGenerus` di
 * bawah SENGAJA tidak diubah (tab Monitoring terpisah, di luar fokus ini).
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
  const monthEnd = bulanTerakhirStr_(year, month);

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

/**
 * GET % kehadiran generus per KATEGORI JADWAL KBM (Cabe Rawit/Pra Remaja SMP/
 * Remaja SMA/Muda-Mudi) — dipakai kartu "Kehadiran Generus" di tab
 * Operasional Kelp. BEDA dari serverGetMonitoringGenerus di atas: kelas
 * dikelompokkan lewat `jadwal_kbm.kategori` (kelas yang "sudah di-setting di
 * Jadwal KBM"), BUKAN `santri.jenjang_saat_ini` — supaya hasilnya konsisten
 * dengan pengelompokan kelas yang guru pakai sehari-hari lewat Input Absen.
 * Santri yang `kelas_ngaji`-nya tidak cocok kelas manapun di Jadwal KBM tidak
 * ikut dihitung (belum bisa ditentukan kategorinya).
 */
function serverGetKehadiranGenerusKategori(token, kelompokId, year, month) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Baca guru/jadwal_kbm/santri KELOMPOK INI SAJA (Firestore langsung utk
  // Kelp Petemon, Sheets terfilter utk kelompok lain) — HINDARI
  // readSheetAsObjects() generik yg scan SELURUH sheet semua kelompok lalu
  // buang sisanya (boros baca + boros kuota Firestore, lihat catatan perf
  // di Modul_InputAbsen.gs / iaReadKelompokTablesParallel_).
  const tables = iaReadKelompokTablesParallel_(['guru', 'jadwal_kbm', 'santri'], kelompokId);

  const guruMap = {};
  tables.guru.forEach(function (g) { guruMap[g.id] = g.nama; });

  // kelas (lowercase) -> {kategori, kelasAsli, ruangan, jamMulai, jamSelesai, namaGuru}
  const kelasInfoMap = {};
  tables.jadwal_kbm
    .filter(function (j) { return (j.status || 'Aktif') === 'Aktif' && String(j.kelas || '').trim() !== ''; })
    .forEach(function (j) {
      const key = String(j.kelas).trim().toLowerCase();
      if (!kelasInfoMap[key]) {
        kelasInfoMap[key] = {
          kategori: j.kategori || '', kelasAsli: String(j.kelas).trim(),
          ruangan: j.ruangan || '', jamMulai: j.jam_mulai || '', jamSelesai: j.jam_selesai || '',
          namaGuru: guruMap[j.guru_id] || '',
        };
      }
    });

  const santriList = tables.santri;
  const santriIds = santriList.map(function (s) { return String(s.id); });

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = bulanTerakhirStr_(year, month);
  const monthAbsensi = iaReadAbsensiKelompokRange_(kelompokId, santriIds, monthStart, monthEnd);
  const statsBySantri = {};
  monthAbsensi.forEach(function (a) {
    const id = String(a.santri_id);
    if (!statsBySantri[id]) statsBySantri[id] = { hadir: 0, total: 0 };
    statsBySantri[id].total++;
    if (a.status === 'hadir') statsBySantri[id].hadir++;
  });

  const result = KATEGORI_JADWAL_.map(function (kategoriKey) {
    const kelasKeys = Object.keys(kelasInfoMap).filter(function (k) { return kelasInfoMap[k].kategori === kategoriKey; });

    const kelasList = kelasKeys.map(function (key) {
      const meta = kelasInfoMap[key];
      const anggota = santriList.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === key; });
      const pctList = [];
      anggota.forEach(function (s) {
        const st = statsBySantri[String(s.id)];
        if (st && st.total > 0) pctList.push((st.hadir / st.total) * 100);
      });
      const adaData = pctList.length > 0;
      const avgPct = adaData ? Math.round(pctList.reduce(function (a, b) { return a + b; }, 0) / pctList.length) : null;
      const kat = adaData ? kategoriKehadiran_(avgPct) : null;
      return {
        kelas: meta.kelasAsli, ruangan: meta.ruangan, jamMulai: meta.jamMulai, jamSelesai: meta.jamSelesai,
        namaGuru: meta.namaGuru, jumlahSantri: anggota.length, adaData: adaData, avgPct: avgPct,
        label: adaData ? kat.label : 'Belum ada data', warna: adaData ? kat.warna : 'abu',
      };
    });

    kelasList.sort(function (a, b) {
      if (a.adaData && b.adaData) return a.avgPct - b.avgPct;
      if (a.adaData) return -1;
      if (b.adaData) return 1;
      return 0;
    });

    const kelasDenganData = kelasList.filter(function (k) { return k.adaData; });
    const avgKategori = kelasDenganData.length > 0
      ? Math.round(kelasDenganData.reduce(function (sum, k) { return sum + k.avgPct; }, 0) / kelasDenganData.length)
      : null;
    const katInfo = avgKategori !== null ? kategoriKehadiran_(avgKategori) : null;

    return {
      kategori: kategoriKey,
      avgPct: avgKategori,
      kategoriLabel: avgKategori !== null ? katInfo.label : 'Belum ada data',
      warna: avgKategori !== null ? katInfo.warna : 'abu',
      jumlahKelas: kelasList.length,
      jumlahSantri: kelasList.reduce(function (sum, k) { return sum + k.jumlahSantri; }, 0),
      kelasList: kelasList,
    };
  });

  return { success: true, data: result, tahun: year, bulan: month };
}

/**
 * GET daftar absensi mentah (per santri per tanggal) bulan berjalan — buat
 * tabel "Detail Kehadiran" (toggle) & Ekspor di kartu Kehadiran Generus.
 * @returns {Object} { success, data: [{nama, kelas, tanggal, status}] }
 */
function serverGetKehadiranGenerusDetailList(token, kelompokId, year, month) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santriMap = {};
  iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId).forEach(function (s) {
    santriMap[String(s.id)] = { nama: s.nama, kelas: String(s.kelas_ngaji || '').trim() || 'Belum diisi' };
  });
  const santriIds = Object.keys(santriMap);

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = bulanTerakhirStr_(year, month);
  const monthAbsensi = iaReadAbsensiKelompokRange_(kelompokId, santriIds, monthStart, monthEnd);

  const data = monthAbsensi.map(function (a) {
    const s = santriMap[String(a.santri_id)];
    return { nama: s.nama, kelas: s.kelas, tanggal: tanggalKeString_(a.tanggal), status: a.status };
  });

  data.sort(function (a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? 1 : -1;
    return a.nama.localeCompare(b.nama);
  });

  return { success: true, data: data };
}

/**
 * GET matrix kehadiran (santri × hari efektif) untuk tabel "Detail Kehadiran"
 * premium (toggle di kartu Kehadiran Generus). Kolom dibatasi hari efektif
 * Senin-Jumat saja (Sabtu/Minggu libur, ~20 kolom/bulan).
 * @returns {Object} { success, dates: ['YYYY-MM-DD', ...] (weekday only),
 *   data: [{id, nama, kelas, statusByDate: {tanggal: status}}] }
 */
function serverGetKehadiranGenerusMatrix(token, kelompokId, year, month) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santriList = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId);
  const santriIds = santriList.map(function (s) { return String(s.id); });

  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Minggu, 6=Sabtu
    if (dow !== 0 && dow !== 6) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }

  const monthStart = dates.length > 0 ? dates[0] : `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = dates.length > 0 ? dates[dates.length - 1] : monthStart;
  const monthAbsensi = iaReadAbsensiKelompokRange_(kelompokId, santriIds, monthStart, monthEnd);

  const statusMap = {};
  monthAbsensi.forEach(function (a) {
    const id = String(a.santri_id);
    if (!statusMap[id]) statusMap[id] = {};
    statusMap[id][tanggalKeString_(a.tanggal)] = a.status;
  });

  const rows = santriList.map(function (s) {
    return {
      id: s.id,
      nama: s.nama,
      kelas: String(s.kelas_ngaji || '').trim() || 'Belum diisi',
      statusByDate: statusMap[String(s.id)] || {},
    };
  });

  rows.sort(function (a, b) {
    if (a.kelas !== b.kelas) return a.kelas.localeCompare(b.kelas);
    return a.nama.localeCompare(b.nama);
  });

  return { success: true, dates: dates, data: rows };
}
