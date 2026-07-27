/**
 * Modul_MaintainAbsensi.gs — CRUD Absensi (daily entry + bulk import)
 * Server-side functions untuk entry absensi harian per Kelompok.
 *
 * RBAC: Admin Kelompok hanya bisa entry absensi Kelompok mereka.
 *
 * ⚠️ ROLLOUT FIRESTORE PER-KELOMPOK: absensi TIDAK punya kolom kelompok_id
 * sendiri (beda dari santri/guru/jadwal_kbm) — kelompok ditentukan lewat join
 * ke santri_id. Karena kelompokId SUDAH jadi parameter di setiap fungsi tulis
 * di bawah, cabang Firestore dites langsung dari parameter itu (bukan lookup
 * per-baris). Dokumen Firestore-nya DENORMALISASI: field kelompok_id disimpan
 * juga di tiap dokumen supaya readSheetAsObjects() (Modul_Utilities.gs) bisa
 * exclude baris Sheet lewat peta santri_id→kelompok_id tanpa baca ulang.
 *
 * ⚠️ BUG TERPISAH ditemukan saat verifikasi rollout di atas (ERROR_LOG.md #8,
 * akar masalah sama dgn #7): kolom `tanggal` diam-diam jadi objek `Date` saat
 * ditulis appendRow, jadi SEMUA perbandingan `a.tanggal === tanggal` di bawah
 * (dan deleteRowByQuery yg query-nya menyertakan `tanggal`) selalu gagal
 * match. Dirapikan pakai tanggalKeString_() (Modul_Utilities.gs) di semua
 * titik baca, dan delete-by-id langsung (bukan query tanggal) di
 * serverSaveAbsensiDaily.
 */

/**
 * GET santri per Kelompok untuk absensi entry hari ini.
 * Return santri list + existing absensi records (jika ada).
 */
function serverGetAbsensiForm(token, kelompokId, tanggal) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Ambil santri di kelompok ini
  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(s => s.kelompok_id == kelompokId);

  // Ambil absensi existing untuk tanggal ini
  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI).filter(a => tanggalKeString_(a.tanggal) === tanggal);
  const absensiMap = {};
  absensiData.forEach(a => {
    absensiMap[a.santri_id] = a.status;
  });

  // Combine: santri + existing status
  const formData = santriData.map(s => ({
    santri_id: s.id,
    nama: s.nama,
    status: absensiMap[s.id] || 'hadir', // default hadir jika tidak ada record
  }));

  return { success: true, data: formData };
}

/**
 * SAVE absensi untuk satu hari (daily entry).
 * Input: array [{santri_id, status}, ...] untuk tanggal tertentu.
 */
function serverSaveAbsensiDaily(token, kelompokId, tanggal, absensiList) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Validasi tanggal format YYYY-MM-DD
  if (!tanggal.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const onFirestore = isKelompokTableOnFirestore_('absensi', kelompokId);
  const path = 'kelompok/' + kelompokId + '/absensi';

  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);

  // Delete existing absensi untuk tanggal ini (santri di kelompok ini)
  const santriIds = readSheetAsObjects(SHEET_NAMES.SANTRI)
    .filter(s => s.kelompok_id == kelompokId)
    .map(s => s.id);

  let count = 0;
  withScriptLock_(function () {
    absensiData.forEach(a => {
      if (tanggalKeString_(a.tanggal) === tanggal && santriIds.includes(Number(a.santri_id))) {
        if (onFirestore) {
          firestoreDeleteDoc_(path, String(a.id));
        } else {
          // Hapus by id langsung (bukan query {tanggal}) — deleteRowByQuery mencocokkan
          // via String(cell), dan cell tanggal di sheet adalah objek Date, bukan string
          // 'yyyy-MM-dd', jadi query {tanggal} TIDAK PERNAH match (ERROR_LOG.md #8).
          deleteRowByQuery(SHEET_NAMES.ABSENSI, { id: a.id });
        }
      }
    });

    // Insert baru
    absensiList.forEach(item => {
      if (santriIds.includes(Number(item.santri_id))) {
        if (onFirestore) {
          const id = firestoreGenerateIdInPath_(path);
          firestoreCreateDoc_(path, String(id), {
            id: id,
            santri_id: item.santri_id,
            tanggal: tanggal,
            status: item.status,
            dicatat_oleh: user.id,
            kelompok_id: String(kelompokId),
          });
        } else {
          const id = generateId(SHEET_NAMES.ABSENSI);
          appendRowToSheet(SHEET_NAMES.ABSENSI, [id, item.santri_id, tanggal, item.status, user.id]);
        }
        count++;
      }
    });
  });

  logAudit('absensi', 'batch_' + tanggal, 'create', user.id, `Daily entry: ${count} records`);
  return { success: true, message: `Absensi ${count} santri berhasil disimpan.` };
}

/**
 * BULK IMPORT absensi dari CSV/array data.
 * Format: [
 *   {nama_santri, tanggal, status},
 *   ...
 * ]
 *
 * Untuk fitur upload CSV nanti, parse CSV jadi array ini dulu, lalu call function ini.
 */
function serverBulkImportAbsensi(token, kelompokId, absensiRows) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const santriByName = {};
  santriData.forEach(s => {
    if (s.kelompok_id == kelompokId) {
      santriByName[String(s.nama).toLowerCase()] = s.id;
    }
  });

  const onFirestore = isKelompokTableOnFirestore_('absensi', kelompokId);
  const path = 'kelompok/' + kelompokId + '/absensi';

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  withScriptLock_(function () {
    absensiRows.forEach((row, idx) => {
      const santriId = santriByName[String(row.nama_santri).toLowerCase()];
      if (!santriId) {
        errorCount++;
        errors.push(`Baris ${idx + 1}: Santri "${row.nama_santri}" tidak ditemukan.`);
        return;
      }

      // Check duplicate (unique constraint santri_id + tanggal)
      const existing = readSheetAsObjects(SHEET_NAMES.ABSENSI).find(
        a => a.santri_id == santriId && tanggalKeString_(a.tanggal) === row.tanggal
      );
      if (existing) {
        // Skip atau update? Saat ini skip (comment out untuk update)
        errorCount++;
        errors.push(`Baris ${idx + 1}: Absensi ${row.nama_santri} pada ${row.tanggal} sudah ada.`);
        return;
      }

      if (onFirestore) {
        const id = firestoreGenerateIdInPath_(path);
        firestoreCreateDoc_(path, String(id), {
          id: id,
          santri_id: santriId,
          tanggal: row.tanggal,
          status: row.status,
          dicatat_oleh: user.id,
          kelompok_id: String(kelompokId),
        });
      } else {
        const id = generateId(SHEET_NAMES.ABSENSI);
        appendRowToSheet(SHEET_NAMES.ABSENSI, [id, santriId, row.tanggal, row.status, user.id]);
      }
      successCount++;
    });
  });

  logAudit('absensi', 'bulk_import', 'create', user.id, `Bulk: ${successCount} success, ${errorCount} errors`);
  return {
    success: true,
    message: `Bulk import selesai: ${successCount} berhasil.`,
    successCount,
    errorCount,
    errors,
  };
}

/**
 * GET absensi summary untuk tanggal tertentu (per Kelompok).
 * Return: {tanggal, hadir, alpa, izin, sakit, total}.
 */
function serverGetAbsensiSummary(token, kelompokId, tanggal) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI).filter(a => tanggalKeString_(a.tanggal) === tanggal);
  const santriIds = readSheetAsObjects(SHEET_NAMES.SANTRI)
    .filter(s => s.kelompok_id == kelompokId)
    .map(s => s.id);

  const absensiKelompok = absensiData.filter(a => santriIds.includes(Number(a.santri_id)));

  const summary = {
    tanggal,
    hadir: absensiKelompok.filter(a => a.status === 'hadir').length,
    alpa: absensiKelompok.filter(a => a.status === 'alpa').length,
    izin: absensiKelompok.filter(a => a.status === 'izin').length,
    sakit: absensiKelompok.filter(a => a.status === 'sakit').length,
    total: santriIds.length,
  };

  return { success: true, data: summary };
}

/**
 * GET santri yang "perlu perhatian" (Alpa >20% dalam bulan tertentu).
 * Business Rule BR-13: Santri dengan Alpa >20% dalam 1 bulan ditandai "perlu perhatian".
 *
 * @param {string} token - Session token
 * @param {string} kelompokId - Target Kelompok ID
 * @param {number} year - Tahun (YYYY)
 * @param {number} month - Bulan (1-12)
 * @returns {Object} { success, data: [{santri_id, nama, hadir, alpa, izin, sakit, total, alpa_pct, berisiko}] }
 */
function serverGetSantriBerisiko(token, kelompokId, year, month) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Get all santri in kelompok
  const santriList = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(s => s.kelompok_id == kelompokId);
  const santriMap = {};
  santriList.forEach(s => {
    santriMap[s.id] = s.nama;
  });

  // Get absensi for the month
  const allAbsensi = readSheetAsObjects(SHEET_NAMES.ABSENSI);
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month

  const monthAbsensi = allAbsensi.filter(a => {
    const tgl = tanggalKeString_(a.tanggal);
    return tgl >= monthStart && tgl <= monthEnd && santriMap[a.santri_id];
  });

  // Calculate stats per santri
  const santriStats = {};
  santriList.forEach(s => {
    santriStats[s.id] = { hadir: 0, alpa: 0, izin: 0, sakit: 0 };
  });

  monthAbsensi.forEach(a => {
    if (santriStats[a.santri_id]) {
      if (a.status === 'hadir') santriStats[a.santri_id].hadir++;
      else if (a.status === 'alpa') santriStats[a.santri_id].alpa++;
      else if (a.status === 'izin') santriStats[a.santri_id].izin++;
      else if (a.status === 'sakit') santriStats[a.santri_id].sakit++;
    }
  });

  // Build result with berisiko flag
  const result = [];
  Object.keys(santriStats).forEach(santriId => {
    const stats = santriStats[santriId];
    const total = stats.hadir + stats.alpa + stats.izin + stats.sakit;
    const alpaPct = total > 0 ? Math.round((stats.alpa / total) * 100) : 0;
    const berisiko = alpaPct > 20; // BR-13: >20% alpa is concerning

    result.push({
      santri_id: santriId,
      nama: santriMap[santriId],
      hadir: stats.hadir,
      alpa: stats.alpa,
      izin: stats.izin,
      sakit: stats.sakit,
      total,
      alpa_pct: alpaPct,
      berisiko,
    });
  });

  // Filter & sort: berisiko santri first, then by alpa % descending
  const berisiko = result.filter(r => r.berisiko).sort((a, b) => b.alpa_pct - a.alpa_pct);
  const normal = result.filter(r => !r.berisiko);

  return {
    success: true,
    data: berisiko.concat(normal),
    berisiko_count: berisiko.length,
    threshold: 20,
  };
}
