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
      const absenRecord = absensiMonth.find(a => a.santri_id == s.id && a.tanggal === dateStr);
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
