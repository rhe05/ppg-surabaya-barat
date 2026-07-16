/**
 * Modul_MaintainKonseling.gs — CRUD Bimbingan Konseling
 * Server-side functions untuk pencatatan karakter dan penyelesaian masalah santri.
 *
 * RBAC:
 * - admin_ppg: Akses semua pencatatan konseling
 * - admin_desa/kelompok: Akses pencatatan di desa/kelompok mereka
 * - guru: Akses pencatatan santri di kelompok yang diajar
 */

/**
 * GET daftar pencatatan konseling dengan filter.
 * Filters: santri_id, kelompok_id, kategori, status, from_date, to_date
 * Return: [{id, tanggal, santri_nama, kategori, masalah, status, pencatat_nama}]
 */
function serverGetKonselingList(token, filters = {}) {
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
  } else if (user.role === 'admin_kelompok' || user.role === 'guru') {
    accessibleKelompokIds = [user.scope_id];
  } else {
    return { success: false, error: 'Anda tidak memiliki akses.' };
  }

  // Ambil data
  let konselingData = readSheetAsObjects(SHEET_NAMES.KONSELING);
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);

  // Filter by accessible kelompok
  konselingData = konselingData.filter(k => {
    return accessibleKelompokIds.includes(Number(k.kelompok_id));
  });

  // Apply filters
  if (filters.santri_id) {
    konselingData = konselingData.filter(k => k.santri_id == filters.santri_id);
  }
  if (filters.kategori) {
    konselingData = konselingData.filter(k => k.kategori === filters.kategori);
  }
  if (filters.status) {
    konselingData = konselingData.filter(k => k.status === filters.status);
  }
  if (filters.from_date) {
    konselingData = konselingData.filter(k => k.tanggal >= filters.from_date);
  }
  if (filters.to_date) {
    konselingData = konselingData.filter(k => k.tanggal <= filters.to_date);
  }

  // Join dengan santri dan users
  const result = konselingData.map(k => {
    const santri = santriData.find(s => s.id == k.santri_id);
    const pencatat = usersData.find(u => u.id == k.pencatat_id);

    return {
      id: k.id,
      tanggal: k.tanggal,
      santri_id: k.santri_id,
      santri_nama: santri ? santri.nama : 'Unknown',
      kategori: k.kategori,
      masalah: k.masalah,
      status: k.status,
      aksi: k.aksi,
      pencatat_nama: pencatat ? pencatat.nama : 'Unknown',
      catatan_tindak_lanjut: k.catatan_tindak_lanjut || '',
    };
  });

  // Sort by tanggal DESC (newest first)
  result.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

  return { success: true, data: result, total: result.length };
}

/**
 * GET detail pencatatan konseling + riwayat santri.
 */
function serverGetKonselingDetail(token, konselingId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const konselingData = readSheetAsObjects(SHEET_NAMES.KONSELING)
    .find(k => k.id == konselingId);
  if (!konselingData) {
    return { success: false, error: 'Data konseling tidak ditemukan.' };
  }

  // RBAC check
  if (!validateUserAccess(token, 'kelompok', konselingData.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses.' };
  }

  // Ambil riwayat konseling santri ini
  const riwayat = readSheetAsObjects(SHEET_NAMES.KONSELING)
    .filter(k => k.santri_id == konselingData.santri_id)
    .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

  return {
    success: true,
    data: konselingData,
    riwayat: riwayat.map(k => ({
      tanggal: k.tanggal,
      kategori: k.kategori,
      masalah: k.masalah,
      status: k.status,
    })),
  };
}

/**
 * CREATE pencatatan konseling baru.
 * Input: {santri_id, tanggal, kategori, masalah, status, aksi, catatan_tindak_lanjut}
 * Auto-populate: kelompok_id (dari santri), pencatat_id (dari token)
 */
function serverCreateKonseling(token, konselingData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // Validasi data
  if (!konselingData.santri_id) {
    return { success: false, error: 'santri_id harus diisi.' };
  }
  if (!konselingData.tanggal || !konselingData.tanggal.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Tanggal harus format YYYY-MM-DD.' };
  }
  if (!['akademik', 'perilaku', 'emosional', 'sosial', 'kesehatan', 'lainnya'].includes(konselingData.kategori)) {
    return { success: false, error: 'Kategori tidak valid.' };
  }
  if (!konselingData.masalah || konselingData.masalah.length < 5) {
    return { success: false, error: 'Masalah harus minimal 5 karakter.' };
  }
  if (!['aktif', 'selesai', 'pending'].includes(konselingData.status)) {
    return { success: false, error: 'Status tidak valid.' };
  }

  // Ambil santri data
  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI)
    .find(s => s.id == konselingData.santri_id);
  if (!santri) {
    return { success: false, error: 'Santri tidak ditemukan.' };
  }

  // RBAC check
  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok santri ini.' };
  }

  // Check duplicate: unique(santri_id, tanggal) — prevent same day duplicate
  const existing = readSheetAsObjects(SHEET_NAMES.KONSELING).find(k =>
    k.santri_id == konselingData.santri_id && k.tanggal === konselingData.tanggal
  );
  if (existing) {
    return { success: false, error: 'Sudah ada pencatatan konseling untuk santri ini pada tanggal tersebut.' };
  }

  // Insert
  const id = generateId(SHEET_NAMES.KONSELING);
  const now = new Date().toISOString().split('T')[0];
  const konselingSheet = getSheetByName(SHEET_NAMES.KONSELING);

  konselingSheet.appendRow([
    id,
    konselingData.santri_id,
    santri.kelompok_id,
    konselingData.tanggal,
    konselingData.kategori,
    konselingData.masalah,
    konselingData.status,
    konselingData.aksi || '',
    user.id,
    now,
    now,
    konselingData.catatan_tindak_lanjut || '',
  ]);

  logAudit(SHEET_NAMES.KONSELING, id, 'create', user.id, `Konseling ${santri.nama}: ${konselingData.kategori}`);

  return { success: true, message: 'Pencatatan konseling berhasil disimpan.', id };
}

/**
 * UPDATE pencatatan konseling.
 * Input: {masalah?, status?, aksi?, catatan_tindak_lanjut?}
 * RBAC: Only pencatat_id (original recorder) atau admin_ppg
 */
function serverUpdateKonseling(token, konselingId, updates) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const konselingData = readSheetAsObjects(SHEET_NAMES.KONSELING)
    .find(k => k.id == konselingId);
  if (!konselingData) {
    return { success: false, error: 'Data konseling tidak ditemukan.' };
  }

  // RBAC: Only pencatat or admin_ppg
  if (user.role !== 'admin_ppg' && user.id != konselingData.pencatat_id) {
    return { success: false, error: 'Hanya pencatat atau admin yang bisa mengedit.' };
  }

  // Validasi status jika ada
  if (updates.status && !['aktif', 'selesai', 'pending'].includes(updates.status)) {
    return { success: false, error: 'Status tidak valid.' };
  }

  // Update di sheet
  const now = new Date().toISOString().split('T')[0];

  updateRowByQuery(SHEET_NAMES.KONSELING, { id: konselingId }, {
    masalah: updates.masalah !== undefined ? updates.masalah : konselingData.masalah,
    status: updates.status !== undefined ? updates.status : konselingData.status,
    aksi: updates.aksi !== undefined ? updates.aksi : konselingData.aksi,
    catatan_tindak_lanjut: updates.catatan_tindak_lanjut !== undefined ? updates.catatan_tindak_lanjut : konselingData.catatan_tindak_lanjut,
    diupdate_pada: now,
  });

  logAudit(SHEET_NAMES.KONSELING, konselingId, 'update', user.id, `Status: ${konselingData.status} → ${updates.status || konselingData.status}`);

  return { success: true, message: 'Pencatatan konseling berhasil diperbarui.' };
}

/**
 * DELETE pencatatan konseling (soft delete).
 * RBAC: admin_ppg only
 */
function serverDeleteKonseling(token, konselingId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (user.role !== 'admin_ppg') {
    return { success: false, error: 'Hanya admin yang bisa menghapus.' };
  }

  const konselingData = readSheetAsObjects(SHEET_NAMES.KONSELING)
    .find(k => k.id == konselingId);
  if (!konselingData) {
    return { success: false, error: 'Data konseling tidak ditemukan.' };
  }

  deleteRowByQuery(SHEET_NAMES.KONSELING, { id: konselingId });
  logAudit(SHEET_NAMES.KONSELING, konselingId, 'delete', user.id, 'Pencatatan konseling dihapus');

  return { success: true, message: 'Pencatatan konseling berhasil dihapus.' };
}

/**
 * GET riwayat konseling per santri (timeline view).
 * Return: [{tanggal, kategori, masalah, status, pencatat_nama}] sorted DESC
 */
function serverGetKonselingBySantri(token, santriId, limit = 50) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == santriId);
  if (!santri) {
    return { success: false, error: 'Santri tidak ditemukan.' };
  }

  // RBAC check
  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses.' };
  }

  const konselingData = readSheetAsObjects(SHEET_NAMES.KONSELING)
    .filter(k => k.santri_id == santriId)
    .sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal))
    .slice(0, limit);

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);

  const result = konselingData.map(k => {
    const pencatat = usersData.find(u => u.id == k.pencatat_id);
    return {
      tanggal: k.tanggal,
      kategori: k.kategori,
      masalah: k.masalah,
      status: k.status,
      aksi: k.aksi,
      pencatat_nama: pencatat ? pencatat.nama : 'Unknown',
      catatan_tindak_lanjut: k.catatan_tindak_lanjut || '',
    };
  });

  return { success: true, data: result };
}

/**
 * GET statistik konseling untuk chart/reporting.
 * Return: {total, aktif, selesai, pending, distribution_by_kategori, distribution_by_month}
 */
function serverGetKonselingStats(token, filters = {}) {
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
  } else if (user.role === 'admin_kelompok' || user.role === 'guru') {
    accessibleKelompokIds = [user.scope_id];
  }

  let konselingData = readSheetAsObjects(SHEET_NAMES.KONSELING)
    .filter(k => accessibleKelompokIds.includes(Number(k.kelompok_id)));

  // Apply filters
  if (filters.from_date) {
    konselingData = konselingData.filter(k => k.tanggal >= filters.from_date);
  }
  if (filters.to_date) {
    konselingData = konselingData.filter(k => k.tanggal <= filters.to_date);
  }

  // Hitung statistik
  const total = konselingData.length;
  const aktif = konselingData.filter(k => k.status === 'aktif').length;
  const selesai = konselingData.filter(k => k.status === 'selesai').length;
  const pending = konselingData.filter(k => k.status === 'pending').length;

  // Distribution by kategori
  const distribution_by_kategori = {};
  konselingData.forEach(k => {
    distribution_by_kategori[k.kategori] = (distribution_by_kategori[k.kategori] || 0) + 1;
  });

  // Distribution by month (for timeline chart)
  const distribution_by_month = {};
  konselingData.forEach(k => {
    const month = k.tanggal.substring(0, 7); // YYYY-MM
    distribution_by_month[month] = (distribution_by_month[month] || 0) + 1;
  });

  return {
    success: true,
    data: {
      total,
      aktif,
      selesai,
      pending,
      distribution_by_kategori,
      distribution_by_month,
    },
  };
}

/**
 * BULK IMPORT pencatatan konseling dari CSV/array.
 * Format: [{santri_nama, tanggal, kategori, masalah, status, aksi}]
 * Match santri by nama (case-insensitive)
 */
function serverBulkImportKonseling(token, kelompokId, konselingRows) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC check
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Build santri map by name untuk kelompok ini
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const santriByName = {};
  santriData.forEach(s => {
    if (s.kelompok_id == kelompokId) {
      santriByName[String(s.nama).toLowerCase()] = s.id;
    }
  });

  const konselingSheet = getSheetByName(SHEET_NAMES.KONSELING);
  let successCount = 0;
  let errorCount = 0;
  const errors = [];
  const now = new Date().toISOString().split('T')[0];

  konselingRows.forEach((row, idx) => {
    // Validate kategori
    if (!['akademik', 'perilaku', 'emosional', 'sosial', 'kesehatan', 'lainnya'].includes(row.kategori)) {
      errorCount++;
      errors.push(`Baris ${idx + 1}: Kategori "${row.kategori}" tidak valid.`);
      return;
    }

    // Match santri
    const santriId = santriByName[String(row.santri_nama).toLowerCase()];
    if (!santriId) {
      errorCount++;
      errors.push(`Baris ${idx + 1}: Santri "${row.santri_nama}" tidak ditemukan.`);
      return;
    }

    // Check duplicate
    const existing = readSheetAsObjects(SHEET_NAMES.KONSELING).find(
      k => k.santri_id == santriId && k.tanggal === row.tanggal
    );
    if (existing) {
      errorCount++;
      errors.push(`Baris ${idx + 1}: Konseling ${row.santri_nama} pada ${row.tanggal} sudah ada.`);
      return;
    }

    // Insert
    const id = generateId(SHEET_NAMES.KONSELING);
    konselingSheet.appendRow([
      id,
      santriId,
      kelompokId,
      row.tanggal,
      row.kategori,
      row.masalah,
      row.status || 'aktif',
      row.aksi || '',
      user.id,
      now,
      now,
      row.catatan_tindak_lanjut || '',
    ]);

    successCount++;
  });

  logAudit(SHEET_NAMES.KONSELING, 'bulk_import', 'create', user.id, `Bulk: ${successCount} success, ${errorCount} errors`);

  return {
    success: true,
    message: `Bulk import selesai: ${successCount} berhasil.`,
    successCount,
    errorCount,
    errors,
  };
}
