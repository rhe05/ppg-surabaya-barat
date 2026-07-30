/**
 * Modul_Laporan.gs — Export & Report functions
 * CSV/Excel export untuk Santri, Guru, Absensi
 */

/**
 * Export Santri data to CSV format
 */
function serverExportSantri(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const santri = santriData.filter(s => s.kelompok_id == kelompokId);

  // Generate CSV
  let csv = 'No,Nama,NIS,Gender,Tanggal Lahir,Jenjang,Status\n';
  santri.forEach((row, idx) => {
    csv += `${idx + 1},"${row.nama}",${row.nis},${row.gender},${row.tanggal_lahir},${row.jenjang_saat_ini},${row.status || 'aktif'}\n`;
  });

  return {
    success: true,
    data: csv,
    filename: `Santri_${new Date().toISOString().split('T')[0]}.csv`
  };
}

/**
 * Export Guru data to CSV format
 */
function serverExportGuru(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const guruData = readSheetAsObjects(SHEET_NAMES.GURU);
  const guru = guruData.filter(g => g.kelompok_id == kelompokId);

  // Generate CSV
  let csv = 'No,Nama,NIP,Gender,Spesialisasi,Status\n';
  guru.forEach((row, idx) => {
    csv += `${idx + 1},"${row.nama}",${row.nip || '-'},${row.gender},${row.spesialisasi || '-'},${row.status || 'aktif'}\n`;
  });

  return {
    success: true,
    data: csv,
    filename: `Guru_${new Date().toISOString().split('T')[0]}.csv`
  };
}

/**
 * Export Absensi bulanan (attendance matrix: santri x tanggal)
 */
function serverExportAbsensiMonthly(token, kelompokId, year, month) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);

  const santri = santriData.filter(s => s.kelompok_id == kelompokId);
  const santriIds = santri.map(s => s.id);

  // Filter absensi untuk bulan ini
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);

  const absensiMonth = absensiData.filter(a => {
    const tanggal = new Date(a.tanggal);
    return santriIds.includes(a.santri_id) &&
           tanggal >= startDate &&
           tanggal <= endDate;
  });

  // Build matrix
  const daysInMonth = endDate.getDate();
  const dateHeaders = Array.from({ length: daysInMonth }, (_, i) => i + 1).join(',');

  let csv = `Absensi ${new Date(year, month - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}\n`;
  csv += `Nama Santri,${dateHeaders},Total Hadir,Total Absen,%\n`;

  santri.forEach(s => {
    let row = `"${s.nama}"`;
    let totalHadir = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = new Date(year, month - 1, day).toISOString().split('T')[0];
      const absenRecord = absensiMonth.find(a => a.santri_id == s.id && tanggalKeString_(a.tanggal) === dateStr);
      const status = absenRecord ? (absenRecord.status === 'hadir' ? '✓' : 'X') : '-';
      if (absenRecord && absenRecord.status === 'hadir') totalHadir++;
      row += `,${status}`;
    }

    const totalRecord = santriIds.includes(s.id) ?
      absensiMonth.filter(a => a.santri_id == s.id).length : 0;
    const totalAbsen = totalRecord - totalHadir;
    const percent = totalRecord > 0 ? Math.round((totalHadir / totalRecord) * 100) : 0;

    row += `,${totalHadir},${totalAbsen},${percent}%`;
    csv += row + '\n';
  });

  return {
    success: true,
    data: csv,
    filename: `Absensi_${year}-${String(month).padStart(2, '0')}.csv`
  };
}

/**
 * Get Absensi ringkasan per kelompok (untuk dashboard laporan)
 */
function serverGetAbsensiSummary(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);

  const santri = santriData.filter(s => s.kelompok_id == kelompokId);
  const santriIds = santri.map(s => s.id);

  const absensiKelompok = absensiData.filter(a => santriIds.includes(a.santri_id));

  // Summary: bulan ini (dari hari pertama bulan ini hingga hari ini)
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const absensiThisMonth = absensiKelompok.filter(a => {
    const tanggal = new Date(a.tanggal);
    return tanggal >= monthStart && tanggal <= today;
  });

  const totalRecord = absensiThisMonth.length;
  const totalHadir = absensiThisMonth.filter(a => a.status === 'hadir').length;
  const totalAbsen = totalRecord - totalHadir;
  const percent = totalRecord > 0 ? Math.round((totalHadir / totalRecord) * 100) : 0;

  return {
    success: true,
    data: {
      kelompokId,
      totalSantri: santri.length,
      totalAbsensiRecord: totalRecord,
      totalHadir,
      totalAbsen,
      persenKehadiran: percent
    }
  };
}

/**
 * GET Laporan Perkembangan Santri per Guru (tab Laporan, Kelp Petemon) —
 * Section A: Kehadiran. Santri milik guru ditentukan lewat kelas yang
 * dipegang guru di Jadwal KBM aktif (guru_id -> kelas -> santri.kelas_ngaji),
 * BUKAN kolom guru_id langsung di santri (santri tidak punya kolom itu).
 * Status per-santri: 'Hadir' jika %hadir >= 80, lalu 'Izin' jika ada hari
 * izin, lalu 'Alfa' jika ada hari alfa, sisanya 'Sakit' (atau 'Belum Ada
 * Data' jika belum ada rekap absensi bulan itu).
 * @returns {Object} { success, data: { guru, kelompok, periode, metrics:
 *   {totalSantri, totalHadir, totalIzin, totalAlfa, totalSakit, hadirPercent},
 *   santriDetail: [{nama, hariAktif, hadir, izin, alfa, sakit, persenHadir, status}] } }
 */
function serverGetLaporanPerkembanganSantri(token, kelompokId, guruId, year, month) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const guru = readSheetAsObjects(SHEET_NAMES.GURU).find(function (g) { return String(g.id) === String(guruId); });
  if (!guru) return { success: false, error: 'Guru tidak ditemukan.' };

  const kelompok = readSheetAsObjects(SHEET_NAMES.KELOMPOK).find(function (k) { return String(k.id) === String(kelompokId); });

  const kelasGuru = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM)
    .filter(function (j) {
      return j.kelompok_id == kelompokId && String(j.guru_id) === String(guruId)
        && (j.status || 'Aktif') === 'Aktif' && String(j.kelas || '').trim() !== '';
    })
    .map(function (j) { return String(j.kelas).trim().toLowerCase(); });

  const santriList = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(function (s) {
    return s.kelompok_id == kelompokId && kelasGuru.indexOf(String(s.kelas_ngaji || '').trim().toLowerCase()) !== -1;
  });
  const santriIds = santriList.map(function (s) { return String(s.id); });

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0];
  const monthAbsensi = readSheetAsObjects(SHEET_NAMES.ABSENSI).filter(function (a) {
    const tgl = tanggalKeString_(a.tanggal);
    return tgl >= monthStart && tgl <= monthEnd && santriIds.indexOf(String(a.santri_id)) !== -1;
  });

  const statsBySantri = {};
  monthAbsensi.forEach(function (a) {
    const id = String(a.santri_id);
    if (!statsBySantri[id]) statsBySantri[id] = { hadir: 0, izin: 0, alfa: 0, sakit: 0, total: 0 };
    const st = statsBySantri[id];
    st.total++;
    if (a.status === 'hadir') st.hadir++;
    else if (a.status === 'izin') st.izin++;
    else if (a.status === 'alpa') st.alfa++;
    else if (a.status === 'sakit') st.sakit++;
  });

  let sumHadirPersen = 0;
  let countAdaData = 0;
  let totalIzinSantri = 0, totalAlfaSantri = 0, totalSakitSantri = 0, totalHadirSantri = 0;

  const santriDetail = santriList.map(function (s) {
    const st = statsBySantri[String(s.id)] || { hadir: 0, izin: 0, alfa: 0, sakit: 0, total: 0 };
    const persenHadir = st.total > 0 ? Math.round((st.hadir / st.total) * 100) : null;

    let status;
    if (st.total === 0) status = 'Belum Ada Data';
    else if (persenHadir >= 80) status = 'Hadir';
    else if (st.izin > 0) status = 'Izin';
    else if (st.alfa > 0) status = 'Alfa';
    else status = 'Sakit';

    if (persenHadir !== null) { sumHadirPersen += persenHadir; countAdaData++; }
    if (status === 'Hadir') totalHadirSantri++;
    else if (status === 'Izin') totalIzinSantri++;
    else if (status === 'Alfa') totalAlfaSantri++;
    else if (status === 'Sakit') totalSakitSantri++;

    return {
      nama: s.nama, hariAktif: st.total, hadir: st.hadir, izin: st.izin, alfa: st.alfa, sakit: st.sakit,
      persenHadir: persenHadir, status: status,
    };
  });

  const bulanNama = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][month - 1];
  const hadirPercent = countAdaData > 0 ? Math.round(sumHadirPersen / countAdaData) : 0;
  const totalSantri = santriList.length;

  return {
    success: true,
    data: {
      guru: guru.nama,
      kelompok: kelompok ? kelompok.nama : '',
      periode: bulanNama + ' ' + year,
      metrics: {
        totalSantri: totalSantri,
        totalHadir: totalHadirSantri,
        totalIzin: totalIzinSantri,
        totalAlfa: totalAlfaSantri,
        totalSakit: totalSakitSantri,
        hadirPercent: hadirPercent,
      },
      santriDetail: santriDetail,
    },
  };
}

/**
 * Utility: Trigger browser download
 * Call from client-side JavaScript
 */
function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
