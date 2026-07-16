/**
 * Modul_MaintainPustakUnduhan.gs — Pusat Unduhan (File Repository)
 * Server-side functions untuk manajemen file/dokumen
 * Kategori: Modul, Soal, Dokumen, Pedoman, Lainnya
 *
 * RBAC:
 * - admin_ppg: Upload/manage semua file
 * - admin_desa/kelompok: Upload/manage file untuk kelompok mereka
 * - guru: View-only access
 */

/**
 * GET daftar file dengan filter kategori dan search.
 * Return: [{id, kategori, nama_file, deskripsi, url, ukuran_kb, pembuat, tanggal_upload}]
 */
function serverGetFilesList(token, kategori = '', searchQuery = '') {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  let fileData = readSheetAsObjects(SHEET_NAMES.FILES);

  // Filter by kategori jika ada
  if (kategori && kategori.trim()) {
    fileData = fileData.filter(f => f.kategori === kategori);
  }

  // Search by nama_file atau deskripsi
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    fileData = fileData.filter(f =>
      String(f.nama_file).toLowerCase().includes(q) ||
      String(f.deskripsi).toLowerCase().includes(q)
    );
  }

  // Get user data untuk pembuat nama
  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);

  // Transform data
  const result = fileData.map(f => {
    const pembuat = usersData.find(u => u.id == f.dibuat_oleh);
    const ukuranKb = Math.round(f.ukuran_bytes / 1024);

    return {
      id: f.id,
      kategori: f.kategori,
      nama_file: f.nama_file,
      deskripsi: f.deskripsi,
      url: f.url_file,
      ukuran_kb: ukuranKb,
      pembuat_nama: pembuat ? pembuat.nama : 'Unknown',
      tanggal_upload: f.dibuat_pada,
      download_count: f.download_count || 0,
    };
  });

  // Sort by tanggal_upload DESC (newest first)
  result.sort((a, b) => new Date(b.tanggal_upload) - new Date(a.tanggal_upload));

  return { success: true, data: result };
}

/**
 * GET kategori list dengan jumlah file per kategori.
 * Return: [{kategori, jumlah}]
 */
function serverGetFileCategories(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const fileData = readSheetAsObjects(SHEET_NAMES.FILES);
  const categories = {};

  fileData.forEach(f => {
    if (!categories[f.kategori]) categories[f.kategori] = 0;
    categories[f.kategori]++;
  });

  const result = Object.entries(categories).map(([kategori, jumlah]) => ({
    kategori,
    jumlah,
  }));

  return { success: true, data: result };
}

/**
 * CREATE file baru (add to repository).
 * Input: {kategori, nama_file, deskripsi, url_file, ukuran_bytes}
 * Kategori: 'Modul' | 'Soal' | 'Dokumen' | 'Pedoman' | 'Lainnya'
 */
function serverCreateFile(token, fileData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC: Only admin_ppg or admin kelompok dapat upload
  if (!['admin_ppg', 'admin_desa', 'admin_kelompok'].includes(user.role)) {
    return { success: false, error: 'Hanya admin yang dapat upload file.' };
  }

  // Validasi data
  if (!fileData.kategori || !fileData.nama_file || !fileData.url_file) {
    return { success: false, error: 'Kategori, nama file, dan URL harus diisi.' };
  }

  const validCategories = ['Modul', 'Soal', 'Dokumen', 'Pedoman', 'Lainnya'];
  if (!validCategories.includes(fileData.kategori)) {
    return { success: false, error: 'Kategori tidak valid.' };
  }

  // Validasi URL format
  if (!fileData.url_file.startsWith('http')) {
    return { success: false, error: 'URL harus dimulai dengan http:// atau https://' };
  }

  // Insert
  const id = generateId(SHEET_NAMES.FILES);
  const now = new Date().toISOString().split('T')[0];
  const fileSheet = getSheetByName(SHEET_NAMES.FILES);

  fileSheet.appendRow([
    id,
    fileData.kategori,
    fileData.nama_file,
    fileData.deskripsi || '',
    fileData.url_file,
    fileData.ukuran_bytes || 0,
    user.id,
    now,
    now,
    0, // download_count
  ]);

  logAudit(SHEET_NAMES.FILES, id, 'create', user.id, `File: ${fileData.nama_file} (${fileData.kategori})`);

  return { success: true, message: 'File berhasil ditambahkan ke Pusat Unduhan.', id };
}

/**
 * DELETE file dari repository.
 */
function serverDeleteFile(token, fileId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC: Only admin_ppg atau pembuat file
  const fileData = readSheetAsObjects(SHEET_NAMES.FILES)
    .find(f => f.id == fileId);

  if (!fileData) {
    return { success: false, error: 'File tidak ditemukan.' };
  }

  if (user.role !== 'admin_ppg' && user.id != fileData.dibuat_oleh) {
    return { success: false, error: 'Hanya pembuat atau admin yang bisa menghapus file.' };
  }

  deleteRowByQuery(SHEET_NAMES.FILES, { id: fileId });
  logAudit(SHEET_NAMES.FILES, fileId, 'delete', user.id, `File deleted: ${fileData.nama_file}`);

  return { success: true, message: 'File berhasil dihapus dari Pusat Unduhan.' };
}

/**
 * INCREMENT download counter (when user downloads file).
 */
function serverIncrementFileDownloadCount(token, fileId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const fileData = readSheetAsObjects(SHEET_NAMES.FILES)
    .find(f => f.id == fileId);

  if (!fileData) {
    return { success: false, error: 'File tidak ditemukan.' };
  }

  const newCount = (Number(fileData.download_count) || 0) + 1;

  updateRowByQuery(SHEET_NAMES.FILES, { id: fileId }, {
    download_count: newCount,
  });

  return { success: true, data: { download_count: newCount } };
}

/**
 * GET file statistics.
 * Return: {total_files, total_size_mb, downloads_total, by_kategori: {...}}
 */
function serverGetFileStats(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const fileData = readSheetAsObjects(SHEET_NAMES.FILES);

  const totalFiles = fileData.length;
  const totalSizeBytes = fileData.reduce((sum, f) => sum + (Number(f.ukuran_bytes) || 0), 0);
  const totalDownloads = fileData.reduce((sum, f) => sum + (Number(f.download_count) || 0), 0);

  // Count by kategori
  const byKategori = {};
  fileData.forEach(f => {
    if (!byKategori[f.kategori]) byKategori[f.kategori] = 0;
    byKategori[f.kategori]++;
  });

  return {
    success: true,
    data: {
      total_files: totalFiles,
      total_size_mb: (totalSizeBytes / (1024 * 1024)).toFixed(2),
      downloads_total: totalDownloads,
      by_kategori: byKategori,
    },
  };
}
