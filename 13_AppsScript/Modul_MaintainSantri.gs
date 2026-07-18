/**
 * Modul_MaintainSantri.gs — CRUD Data Santri
 * Server-side functions dipanggil dari Index.html (screen Data Santri).
 *
 * RBAC: Admin Kelompok hanya bisa akses Kelompok mereka sendiri.
 */

/**
 * GET santri per Kelompok (dengan search/filter).
 * Dipanggil saat load screen Data Santri.
 */
function serverGetSantriList(token, kelompokId, searchQuery = '') {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC: validasi akses ke kelompok ini
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Cache per-kelompok (di-invalidate oleh setiap Add/Update/Delete/BulkImport)
  const cacheKey = 'santri_k' + kelompokId;
  let santri = cacheGet_(cacheKey);
  if (!santri) {
    santri = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(s => s.kelompok_id == kelompokId);
    cachePut_(cacheKey, santri, 300);
  }

  // Search by nama
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    santri = santri.filter(s => String(s.nama).toLowerCase().includes(q));
  }

  return { success: true, data: santri };
}

/**
 * ADD santri baru.
 */
function serverAddSantri(token, kelompokId, santriData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Validasi input
  if (!santriData.nama || !santriData.nis || !santriData.gender || !santriData.tanggal_lahir || !santriData.jenjang_saat_ini) {
    return { success: false, error: 'Semua field wajib diisi.' };
  }

  try {
    return withScriptLock_(function () {
      const id = generateId(SHEET_NAMES.SANTRI);
      const santriSheet = getSheetByName(SHEET_NAMES.SANTRI);

      santriSheet.appendRow([
        id,
        kelompokId,
        santriData.nama.trim(),
        santriData.nis.trim(),
        santriData.gender,
        santriData.tanggal_lahir,
        santriData.jenjang_saat_ini,
        santriData.nama_panggilan || '',
        santriData.tempat_lahir || '',
        santriData.pendidikan || '',
        santriData.kelas_sekolah || '',
        santriData.kelas_ngaji || '',
        santriData.alamat || '',
        santriData.nama_ayah || '',
        santriData.nama_ibu || '',
        santriData.rt || '',
        santriData.rw || '',
        santriData.kelurahan || '',
        santriData.kode_pos || '',
        santriData.kabupaten_kota || '',
        santriData.provinsi || '',
        santriData.nomor_wa_ayah || '',
        santriData.nomor_wa_ibu || '',
        santriData.kecamatan || '',
      ]);

      cacheDrop_('santri_k' + kelompokId);
      logAudit('santri', id, 'create', user.id, JSON.stringify(santriData));
      return { success: true, message: 'Santri berhasil ditambahkan.', id: id };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menyimpan: ' + e.message };
  }
}

/**
 * UPDATE santri.
 */
function serverUpdateSantri(token, santriId, santriData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == santriId);
  if (!santri) return { success: false, error: 'Santri tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Santri ini.' };
  }

  const updates = {
    nama: santriData.nama?.trim() || santri.nama,
    nis: santriData.nis?.trim() || santri.nis,
    gender: santriData.gender || santri.gender,
    tanggal_lahir: santriData.tanggal_lahir || santri.tanggal_lahir,
    jenjang_saat_ini: santriData.jenjang_saat_ini || santri.jenjang_saat_ini,
    nama_panggilan: santriData.nama_panggilan !== undefined ? santriData.nama_panggilan : santri.nama_panggilan,
    tempat_lahir: santriData.tempat_lahir !== undefined ? santriData.tempat_lahir : santri.tempat_lahir,
    pendidikan: santriData.pendidikan !== undefined ? santriData.pendidikan : santri.pendidikan,
    kelas_sekolah: santriData.kelas_sekolah !== undefined ? santriData.kelas_sekolah : santri.kelas_sekolah,
    kelas_ngaji: santriData.kelas_ngaji !== undefined ? santriData.kelas_ngaji : santri.kelas_ngaji,
    alamat: santriData.alamat !== undefined ? santriData.alamat : santri.alamat,
    nama_ayah: santriData.nama_ayah !== undefined ? santriData.nama_ayah : santri.nama_ayah,
    nama_ibu: santriData.nama_ibu !== undefined ? santriData.nama_ibu : santri.nama_ibu,
    rt: santriData.rt !== undefined ? santriData.rt : santri.rt,
    rw: santriData.rw !== undefined ? santriData.rw : santri.rw,
    kelurahan: santriData.kelurahan !== undefined ? santriData.kelurahan : santri.kelurahan,
    kode_pos: santriData.kode_pos !== undefined ? santriData.kode_pos : santri.kode_pos,
    kabupaten_kota: santriData.kabupaten_kota !== undefined ? santriData.kabupaten_kota : santri.kabupaten_kota,
    provinsi: santriData.provinsi !== undefined ? santriData.provinsi : santri.provinsi,
    kecamatan: santriData.kecamatan !== undefined ? santriData.kecamatan : santri.kecamatan,
    nomor_wa_ayah: santriData.nomor_wa_ayah !== undefined ? santriData.nomor_wa_ayah : santri.nomor_wa_ayah,
    nomor_wa_ibu: santriData.nomor_wa_ibu !== undefined ? santriData.nomor_wa_ibu : santri.nomor_wa_ibu,
  };

  try {
    return withScriptLock_(function () {
      updateRowByQuery(SHEET_NAMES.SANTRI, { id: santri.id }, updates);
      cacheDrop_('santri_k' + santri.kelompok_id);
      logAudit('santri', santriId, 'update', user.id, JSON.stringify(updates));
      return { success: true, message: 'Santri berhasil diperbarui.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal memperbarui: ' + e.message };
  }
}

/**
 * DELETE santri.
 */
function serverDeleteSantri(token, santriId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const santri = readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == santriId);
  if (!santri) return { success: false, error: 'Santri tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', santri.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Santri ini.' };
  }

  try {
    return withScriptLock_(function () {
      deleteRowByQuery(SHEET_NAMES.SANTRI, { id: santri.id });
      cacheDrop_('santri_k' + santri.kelompok_id);
      logAudit('santri', santriId, 'delete', user.id, 'deleted');
      return { success: true, message: 'Santri berhasil dihapus.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menghapus: ' + e.message };
  }
}

/**
 * Helper: log audit trail.
 */
function logAudit(tableName, recordId, action, userId, detail) {
  const auditSheet = getSheetByName(SHEET_NAMES.AUDIT_LOG);
  const id = generateId(SHEET_NAMES.AUDIT_LOG);
  const timestamp = new Date().toISOString();

  auditSheet.appendRow([id, tableName, recordId, action, userId, timestamp, detail]);
}

/**
 * BULK IMPORT santri dari CSV/Excel (array of objects).
 * CSV format: Nama, NIS, Gender, Tanggal Lahir (YYYY-MM-DD), Jenjang
 *
 * @param {string} token - Session token
 * @param {string} kelompokId - Target Kelompok ID
 * @param {Array} santriRows - Array of santri objects: [{nama, nis, gender, tanggal_lahir, jenjang_saat_ini}, ...]
 * @returns {Object} { success, successCount, errorCount, errors: [{row, error}], errorReport: string }
 */
function serverBulkImportSantri(token, kelompokId, santriRows) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  if (!Array.isArray(santriRows) || santriRows.length === 0) {
    return { success: false, error: 'Data santri kosong atau format tidak valid.' };
  }

  // Validasi max 200 rows per import (prevent timeout)
  if (santriRows.length > 200) {
    return { success: false, error: 'Maksimal 200 santri per import. Bagi menjadi beberapa file.' };
  }

  // Load existing santri to check duplicates
  const existingSantri = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const existingNis = new Set(existingSantri.map(s => String(s.nis).trim().toUpperCase()));

  const santriSheet = getSheetByName(SHEET_NAMES.SANTRI);
  const errors = [];
  const validRows = [];
  let successCount = 0;
  let errorCount = 0;

  // Validasi & prepare rows
  for (let rowIdx = 0; rowIdx < santriRows.length; rowIdx++) {
    const row = santriRows[rowIdx];
    const rowNumber = rowIdx + 1; // 1-based untuk user
    let rowError = '';

    // Validasi: Nama
    if (!row.nama || String(row.nama).trim() === '') {
      rowError = 'Nama wajib diisi';
    }
    // Validasi: NIS
    else if (!row.nis || String(row.nis).trim() === '') {
      rowError = 'NIS wajib diisi';
    }
    // Validasi: Gender
    else if (!row.gender || !['L', 'P'].includes(String(row.gender).trim().toUpperCase())) {
      rowError = 'Gender harus "L" atau "P"';
    }
    // Validasi: Tanggal Lahir (format YYYY-MM-DD)
    else if (!row.tanggal_lahir || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.tanggal_lahir).trim())) {
      rowError = 'Tanggal Lahir format YYYY-MM-DD';
    }
    // Validasi: Jenjang
    else if (!row.jenjang_saat_ini || !['AUD', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja'].includes(String(row.jenjang_saat_ini).trim())) {
      rowError = 'Jenjang tidak valid (AUD, Cabe Rawit, Pra Remaja, Remaja SMA, Remaja)';
    }
    // Validasi: Duplicate NIS
    else if (existingNis.has(String(row.nis).trim().toUpperCase())) {
      rowError = `NIS "${row.nis}" sudah terdaftar`;
    }

    if (rowError) {
      errors.push({ row: rowNumber, error: rowError });
      errorCount++;
    } else {
      // Prepare for insert. ⚠️ id TIDAK digenerate di sini — generateId() dalam
      // loop tanpa append di antaranya mengembalikan nilai SAMA untuk semua baris
      // (bug id ganda, ERROR_LOG.md #5). Id diberikan di dalam lock saat insert.
      validRows.push({
        kelompok_id: kelompokId,
        nama: String(row.nama).trim(),
        nis: String(row.nis).trim(),
        gender: String(row.gender).trim().toUpperCase(),
        tanggal_lahir: String(row.tanggal_lahir).trim(),
        jenjang_saat_ini: String(row.jenjang_saat_ini).trim(),
      });
      successCount++;
    }
  }

  // Batch insert valid rows — id digenerate DI DALAM lock supaya berurutan
  // dan tidak bentrok dengan penyimpanan pengguna lain yang berjalan bersamaan.
  if (validRows.length > 0) {
    try {
      withScriptLock_(function () {
        let nextId = generateId(SHEET_NAMES.SANTRI);
        const dataToInsert = validRows.map(s => [
          nextId++,
          s.kelompok_id,
          s.nama,
          s.nis,
          s.gender,
          s.tanggal_lahir,
          s.jenjang_saat_ini,
        ]);
        santriSheet.getRange(santriSheet.getLastRow() + 1, 1, dataToInsert.length, 7).setValues(dataToInsert);
        cacheDrop_('santri_k' + kelompokId);
      });

      // Log audit
      logAudit('santri', 'bulk_import', 'create', user.id, `Bulk: ${successCount} berhasil, ${errorCount} error`);
    } catch (e) {
      return {
        success: false,
        error: `Gagal import: ${e.toString()}`,
        successCount,
        errorCount,
        errors,
      };
    }
  }

  // Generate error report
  let errorReport = '';
  if (errors.length > 0) {
    errorReport = errors.map(e => `Baris ${e.row}: ${e.error}`).join('\n');
  }

  return {
    success: true,
    message: `${successCount} santri berhasil diimpor. ${errorCount} baris error.`,
    successCount,
    errorCount,
    errors,
    errorReport,
  };
}
