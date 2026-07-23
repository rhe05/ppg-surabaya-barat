/**
 * Modul_MaintainSantri.gs — CRUD Data Santri
 * Server-side functions dipanggil dari Index.html (screen Data Santri).
 *
 * RBAC: Admin Kelompok hanya bisa akses Kelompok mereka sendiri.
 *
 * ⚠️ ROLLOUT FIRESTORE PER-KELOMPOK (bukan per-tabel spt FIRESTORE_TABLES_):
 * hanya kelompok yang ID-nya ada di FIRESTORE_KELOMPOK_TABLES_.santri
 * (Modul_Utilities.gs — SUMBER KEBENARAN TUNGGAL, dipakai juga oleh
 * readSheetAsObjects() supaya 40+ fungsi lain yang baca santri PPG-wide
 * — Laporan/Statistik/Dashboard/Absensi/dst — otomatis dapat data gabungan
 * yang benar tanpa perlu diubah) yang baca/tulis lewat Firestore
 * (/kelompok/{id}/santri/{id}) — kelompok lain TETAP di Sheets. Sengaja
 * supaya migrasi bisa diuji praktik di 1 kelompok dulu (Kelp Petemon)
 * sebelum kelompok lain ikut pindah.
 */

function santriPath_(kelompokId) {
  return 'kelompok/' + kelompokId + '/santri';
}

function isSantriOnFirestore_(kelompokId) {
  return isKelompokTableOnFirestore_('santri', kelompokId);
}

/**
 * GET santri per Kelompok (dengan search/filter).
 * Dipanggil saat load screen Data Santri.
 */
function serverGetSantriList(token, kelompokId, searchQuery = '', forceFresh = false) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  // RBAC: validasi akses ke kelompok ini
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Cache per-kelompok (di-invalidate oleh setiap Add/Update/Delete/BulkImport)
  // forceFresh = true (tombol Refresh) menembus cache: baca langsung dari sumber.
  const cacheKey = 'santri_k' + kelompokId;
  let santri = forceFresh ? null : cacheGet_(cacheKey);
  if (!santri) {
    santri = isSantriOnFirestore_(kelompokId)
      ? firestoreListCollection_(santriPath_(kelompokId))
      : readSheetAsObjects(SHEET_NAMES.SANTRI).filter(s => s.kelompok_id == kelompokId);
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
      const fields = {
        kelompok_id: kelompokId,
        nama: santriData.nama.trim(),
        nis: santriData.nis.trim(),
        gender: santriData.gender,
        tanggal_lahir: santriData.tanggal_lahir,
        jenjang_saat_ini: santriData.jenjang_saat_ini,
        nama_panggilan: santriData.nama_panggilan || '',
        tempat_lahir: santriData.tempat_lahir || '',
        pendidikan: santriData.pendidikan || '',
        kelas_sekolah: santriData.kelas_sekolah || '',
        kelas_ngaji: santriData.kelas_ngaji || '',
        alamat: santriData.alamat || '',
        nama_ayah: santriData.nama_ayah || '',
        nama_ibu: santriData.nama_ibu || '',
        rt: santriData.rt || '',
        rw: santriData.rw || '',
        kelurahan: santriData.kelurahan || '',
        kode_pos: santriData.kode_pos || '',
        kabupaten_kota: santriData.kabupaten_kota || '',
        provinsi: santriData.provinsi || '',
        nomor_wa_ayah: santriData.nomor_wa_ayah || '',
        nomor_wa_ibu: santriData.nomor_wa_ibu || '',
        kecamatan: santriData.kecamatan || '',
        nomor_wa: santriData.nomor_wa || '',
        status_nikah: santriData.status_nikah || '',
      };

      let id;
      if (isSantriOnFirestore_(kelompokId)) {
        const path = santriPath_(kelompokId);
        id = firestoreGenerateIdInPath_(path);
        fields.id = id;
        firestoreCreateDoc_(path, String(id), fields);
      } else {
        id = generateId(SHEET_NAMES.SANTRI);
        appendRowToSheet(SHEET_NAMES.SANTRI, [
          id,
          kelompokId,
          fields.nama,
          fields.nis,
          fields.gender,
          fields.tanggal_lahir,
          fields.jenjang_saat_ini,
          fields.nama_panggilan,
          fields.tempat_lahir,
          fields.pendidikan,
          fields.kelas_sekolah,
          fields.kelas_ngaji,
          fields.alamat,
          fields.nama_ayah,
          fields.nama_ibu,
          fields.rt,
          fields.rw,
          fields.kelurahan,
          fields.kode_pos,
          fields.kabupaten_kota,
          fields.provinsi,
          fields.nomor_wa_ayah,
          fields.nomor_wa_ibu,
          fields.kecamatan,
          fields.nomor_wa,
          fields.status_nikah,
        ]);
      }

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
 * ⚠️ kelompokId WAJIB dikirim (dibutuhkan utk tahu apakah kelompok ini sudah
 * di Firestore atau masih Sheets, dan path Firestore-nya kalau sudah pindah).
 */
function serverUpdateSantri(token, kelompokId, santriId, santriData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Santri ini.' };
  }

  const onFirestore = isSantriOnFirestore_(kelompokId);
  const santri = onFirestore
    ? firestoreGetDoc_(santriPath_(kelompokId), String(santriId))
    : readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == santriId);
  if (!santri) return { success: false, error: 'Santri tidak ditemukan.' };

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
    nomor_wa: santriData.nomor_wa !== undefined ? santriData.nomor_wa : santri.nomor_wa,
    status_nikah: santriData.status_nikah !== undefined ? santriData.status_nikah : santri.status_nikah,
  };

  try {
    return withScriptLock_(function () {
      if (onFirestore) {
        firestoreUpdateDoc_(santriPath_(kelompokId), String(santriId), updates);
      } else {
        updateRowByQuery(SHEET_NAMES.SANTRI, { id: santri.id }, updates);
      }
      cacheDrop_('santri_k' + kelompokId);
      logAudit('santri', santriId, 'update', user.id, JSON.stringify(updates));
      return { success: true, message: 'Santri berhasil diperbarui.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal memperbarui: ' + e.message };
  }
}

/**
 * DELETE santri.
 * ⚠️ kelompokId WAJIB dikirim, sama alasannya dengan serverUpdateSantri.
 */
function serverDeleteSantri(token, kelompokId, santriId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Santri ini.' };
  }

  const onFirestore = isSantriOnFirestore_(kelompokId);
  const santri = onFirestore
    ? firestoreGetDoc_(santriPath_(kelompokId), String(santriId))
    : readSheetAsObjects(SHEET_NAMES.SANTRI).find(s => s.id == santriId);
  if (!santri) return { success: false, error: 'Santri tidak ditemukan.' };

  try {
    return withScriptLock_(function () {
      if (onFirestore) {
        firestoreDeleteDoc_(santriPath_(kelompokId), String(santriId));
      } else {
        deleteRowByQuery(SHEET_NAMES.SANTRI, { id: santri.id });
      }
      cacheDrop_('santri_k' + kelompokId);
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
  const id = generateId(SHEET_NAMES.AUDIT_LOG);
  const timestamp = new Date().toISOString();

  appendRowToSheet(SHEET_NAMES.AUDIT_LOG, [id, tableName, recordId, action, userId, timestamp, detail]);
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

  const onFirestore = isSantriOnFirestore_(kelompokId);

  // Load existing santri (seluruh PPG) to check duplikat NIS — readSheetAsObjects
  // otomatis gabung Sheets+Firestore (lihat Modul_Utilities.gs), jadi ini sudah
  // benar utk semua kelompok termasuk yg sudah pindah ke Firestore.
  const existingNis = new Set(
    readSheetAsObjects(SHEET_NAMES.SANTRI).map(s => String(s.nis).trim().toUpperCase())
  );

  const santriSheet = onFirestore ? null : getSheetByName(SHEET_NAMES.SANTRI);
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

  // Insert valid rows — id digenerate DI DALAM lock supaya berurutan dan
  // tidak bentrok dengan penyimpanan pengguna lain yang berjalan bersamaan.
  if (validRows.length > 0) {
    try {
      withScriptLock_(function () {
        if (onFirestore) {
          const path = santriPath_(kelompokId);
          let nextId = firestoreGenerateIdInPath_(path);
          validRows.forEach(s => {
            firestoreCreateDoc_(path, String(nextId), Object.assign({ id: nextId }, s));
            nextId++;
          });
        } else {
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
        }
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
