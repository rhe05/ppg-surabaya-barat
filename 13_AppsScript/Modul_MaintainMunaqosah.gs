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

/**
 * GENERATE soal report (HTML) untuk di-download/print as PDF.
 * Return: HTML string yang bisa dibuka di tab baru
 */
function serverGenerateSoalReport(token, periodeId, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Get data
  const munaqosahData = readSheetAsObjects(SHEET_NAMES.MUNAQOSAH)
    .filter(m => m.periode_id == periodeId);

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const periodeData = readSheetAsObjects(SHEET_NAMES.PERIODE_MUNAQOSAH)
    .find(p => p.id == periodeId);

  if (!periodeData) {
    return { success: false, error: 'Periode tidak ditemukan.' };
  }

  // Build HTML report
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID');

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Laporan Soal Ujian - Periode ${periodeData.semester}</title>
      <style>
        * { margin: 0; padding: 0; }
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          background: #f5f5f5;
          padding: 20px;
        }
        .print-area {
          background: white;
          max-width: 21cm;
          margin: 0 auto;
          padding: 40px;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          border-bottom: 3px solid #333;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        .header h1 {
          font-size: 24px;
          margin-bottom: 5px;
          color: #000;
        }
        .header p {
          font-size: 13px;
          color: #666;
        }
        .info-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
          font-size: 13px;
        }
        .info-item {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 10px;
        }
        .info-item strong {
          font-weight: bold;
        }
        .soal-list {
          margin-top: 20px;
        }
        .soal-item {
          page-break-inside: avoid;
          margin-bottom: 15px;
          padding: 15px;
          border-left: 4px solid #007bff;
          background: #f9f9f9;
        }
        .soal-item .no {
          font-weight: bold;
          color: #007bff;
          display: inline-block;
          width: 30px;
        }
        .soal-item .nama {
          font-weight: bold;
        }
        .soal-item .nilai {
          color: #28a745;
          font-weight: bold;
        }
        .soal-item .status {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 11px;
          margin-left: 10px;
        }
        .status-dinilai {
          background: #d4edda;
          color: #155724;
        }
        .status-belum {
          background: #f8d7da;
          color: #721c24;
        }
        .summary {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 2px solid #ddd;
          font-size: 13px;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-top: 15px;
        }
        .summary-item {
          text-align: center;
          padding: 15px;
          background: #f0f0f0;
          border-radius: 4px;
        }
        .summary-item .value {
          font-size: 24px;
          font-weight: bold;
          color: #007bff;
        }
        .summary-item .label {
          font-size: 12px;
          color: #666;
          margin-top: 5px;
        }
        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 11px;
          color: #999;
          text-align: center;
        }
        @media print {
          body { background: white; padding: 0; }
          .print-area { box-shadow: none; padding: 0; }
          .print-area { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="print-area">
        <div class="header">
          <h1>📋 Laporan Soal Ujian</h1>
          <p>Rekapitulasi Data Penilaian Santri</p>
        </div>

        <div class="info-section">
          <div class="info-item">
            <strong>Periode:</strong>
            <span>${periodeData.semester}</span>
          </div>
          <div class="info-item">
            <strong>Tanggal:</strong>
            <span>${dateStr}</span>
          </div>
        </div>

        <div class="soal-list">
          <h3 style="margin-bottom: 15px;">Daftar Soal Ujian:</h3>
  `;

  // Add soal items
  let no = 1;
  let dinilai = 0;
  let totalNilai = 0;

  munaqosahData.forEach(soal => {
    const santri = santriData.find(s => s.id == soal.santri_id);
    if (!santri) return;

    const isDinilai = soal.status === 'dinilai';
    if (isDinilai) {
      dinilai++;
      totalNilai += Number(soal.nilai || 0);
    }

    html += `
      <div class="soal-item">
        <span class="no">${no}.</span>
        <span class="nama">${santri.nama}</span>
        <span class="nilai">${soal.nilai || '-'}</span>
        <span class="status ${isDinilai ? 'status-dinilai' : 'status-belum'}">
          ${isDinilai ? '✓ Dinilai' : '○ Belum Dinilai'}
        </span>
      </div>
    `;
    no++;
  });

  const avgNilai = dinilai > 0 ? (totalNilai / dinilai).toFixed(2) : 0;
  const totalSoal = munaqosahData.length;

  html += `
        </div>

        <div class="summary">
          <h3>Ringkasan Statistik:</h3>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="value">${totalSoal}</div>
              <div class="label">Total Soal</div>
            </div>
            <div class="summary-item">
              <div class="value">${dinilai}</div>
              <div class="label">Sudah Dinilai</div>
            </div>
            <div class="summary-item">
              <div class="value">${totalSoal - dinilai}</div>
              <div class="label">Belum Dinilai</div>
            </div>
            <div class="summary-item">
              <div class="value">${avgNilai}</div>
              <div class="label">Rata-rata Nilai</div>
            </div>
          </div>
        </div>

        <div class="footer">
          <p>Laporan ini di-generate otomatis oleh Sistem Manajemen TPQ PPG Surabaya Barat</p>
          <p>Cetak/Export sebagai PDF: Tekan Ctrl+P atau gunakan menu Print</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return {
    success: true,
    html: html,
    title: `Laporan_Soal_${periodeData.semester.replace(/\s+/g, '_')}_${now.toISOString().split('T')[0]}`,
  };
}
