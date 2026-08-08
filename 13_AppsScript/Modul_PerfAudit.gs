/**
 * ⚠️⚠️⚠️ TEMPORARY — Modul_PerfAudit.gs (Tahap 5) ⚠️⚠️⚠️
 * Ditambahkan 2026-08-08 KHUSUS utk before/after measurement
 * AUDIT_LOG_UUID_OPTIMIZATION_REPORT.md. TIDAK mengubah business logic —
 * semua fungsi di sini HANYA memanggil fungsi server yang SUDAH ADA
 * (serverAddGuru, serverSaveAbsensiKelas) lewat sesi sintetis CacheService
 * (pola sama diag=kehadirantest yang sudah ada di Code.js). withScriptLock_
 * TIDAK disentuh sama sekali tahap ini (di luar hard scope Tahap 5).
 *
 * WAJIB DIHAPUS (file ini + dispatch di Code.js + revert side-channel
 * LOG_AUDIT_LAST_PERF_/_perfT* di Modul_MaintainSantri.gs, dan _perf di
 * serverSaveAbsensiKelas kalau ditambahkan) setelah before/after measurement
 * selesai & data test dibersihkan. Lihat AUDIT_LOG_UUID_OPTIMIZATION_REPORT.md §Cleanup.
 */

const PERF_QA_GURU_NAMA_ = 'Guru Test QA';

function perfMintSession_(role, kelompokId, guruId, ttlSec) {
  const token = Utilities.getUuid();
  CacheService.getUserCache().put('session_' + token, JSON.stringify({
    id: 0,
    nama: role === 'admin_ppg' ? '[perfaudit-admin]' : '[perfaudit-guru]',
    role: role,
    scopeType: role === 'admin_ppg' ? 'ppg' : 'kelompok',
    scopeId: kelompokId,
    guruId: guruId || null,
  }), ttlSec || 300);
  return token;
}

function perfFindQaGuru_(kelompokId) {
  const guruAll = iaReadKelompokTable_(SHEET_NAMES.GURU, kelompokId);
  return guruAll.find(function (g) { return String(g.nama || '').trim() === PERF_QA_GURU_NAMA_; }) || null;
}

/** ?diag=perfcheckempty&kelompok=1&kelas=&tanggal= */
function diagPerfCheckAbsensiEmpty_(kelompokId, kelas, tanggal) {
  const santriKelas = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId).filter(function (s) {
    return String(s.kelas_ngaji || '').trim().toLowerCase() === String(kelas).trim().toLowerCase();
  });
  const rows = iaReadAbsensiKelompokRange_(kelompokId, santriKelas.map(function (s) { return s.id; }), tanggal, tanggal);
  return { success: true, empty: rows.length === 0, existingCount: rows.length, santriCountKelas: santriKelas.length, santriIds: santriKelas.map(function (s) { return s.id; }) };
}

/** ?diag=perfsetup&kelompok=1&kelas=&tanggal= — idempotent. */
function diagPerfSetup_(kelompokId, targetKelas, tanggal) {
  let qaGuru = perfFindQaGuru_(kelompokId);
  let createdGuru = false;
  if (!qaGuru) {
    const adminToken = perfMintSession_('admin_ppg', kelompokId, null, 600);
    const res = serverAddGuru(adminToken, kelompokId, { nama: PERF_QA_GURU_NAMA_, kategori: 'Cabe Rawit' });
    if (!res.success) return { success: false, error: 'Gagal membuat guru QA: ' + res.error };
    qaGuru = perfFindQaGuru_(kelompokId);
    createdGuru = true;
  }
  if (!qaGuru) return { success: false, error: 'Guru QA tidak ditemukan setelah dibuat.' };

  const kelasLowerTarget = String(targetKelas).trim().toLowerCase();
  const existing = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST).find(function (r) {
    return String(r.kelompok_id) === String(kelompokId) &&
      String(r.requester_guru_id) === String(qaGuru.id) &&
      String(r.kelas || '').trim().toLowerCase() === kelasLowerTarget &&
      tanggalKeString_(r.tanggal) === tanggal && r.status === 'approved';
  });

  let aksesId = existing ? existing.id : null;
  if (!existing) {
    const ownerGuruId = getKelasOwnerGuruId_(kelompokId, targetKelas) || '';
    withScriptLock_(function () {
      aksesId = generateId(SHEET_NAMES.AKSES_KELAS_REQUEST);
      appendRowToSheet(SHEET_NAMES.AKSES_KELAS_REQUEST, [
        aksesId, kelompokId, String(targetKelas).trim(), tanggal,
        0, qaGuru.id, PERF_QA_GURU_NAMA_, ownerGuruId,
        'approved', '[PERFAUDIT TEMP] Tahap5 audit_log UUID before/after — hapus setelah pengukuran selesai',
        new Date().toISOString(), new Date().toISOString(),
      ]);
    });
  }

  const santriAll = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId);
  const santriKelas = santriAll.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLowerTarget; });

  return {
    success: true,
    guruQaId: qaGuru.id,
    createdGuru: createdGuru,
    aksesKelasRequestId: aksesId,
    santriCountKelas: santriKelas.length,
    santriIdsKelas: santriKelas.map(function (s) { return s.id; }),
  };
}

/**
 * ?diag=perfsaveguru&kelompok=1&guruid=&kelas=&tanggal=&santriids=[...]
 * REAL serverSaveAbsensiKelas (jalur guru asli). Baca LOG_AUDIT_LAST_PERF_
 * (side-channel dari logAudit(), Modul_MaintainSantri.gs) utk breakdown
 * ID-generation vs appendRow vs total audit_log.
 */
function diagPerfSaveGuru_(kelompokId, guruId, kelas, tanggal, santriIds) {
  const token = perfMintSession_('guru', kelompokId, guruId, 300);
  const statuses = ['hadir', 'izin', 'sakit', 'alpa'];
  const absensiList = santriIds.map(function (id, idx) { return { santri_id: id, status: statuses[idx % statuses.length] }; });

  LOG_AUDIT_LAST_PERF_ = null;
  const tCall0 = Date.now();
  const res = serverSaveAbsensiKelas(token, kelas, tanggal, absensiList);
  const tCall1 = Date.now();

  return {
    success: res.success,
    error: res.error,
    serverTotalMs: tCall1 - tCall0,
    auditLogPerf: LOG_AUDIT_LAST_PERF_,
  };
}

/** ?diag=perfcleanup&kelompok=1&kelas=&tanggal= */
function diagPerfCleanup_(kelompokId, kelas, tanggal) {
  const result = { removedGuru: false, removedAkses: 0, removedAbsensi: 0 };
  const qaGuru = perfFindQaGuru_(kelompokId);

  withScriptLock_(function () {
    const aksesRows = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST);
    aksesRows.forEach(function (r) {
      if (qaGuru && String(r.requester_guru_id) === String(qaGuru.id) &&
        String(r.keterangan || '').indexOf('[PERFAUDIT TEMP]') === 0) {
        deleteRowByQuery(SHEET_NAMES.AKSES_KELAS_REQUEST, { id: r.id });
        result.removedAkses++;
      }
    });

    if (kelas && tanggal) {
      const santriKelas = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId).filter(function (s) {
        return String(s.kelas_ngaji || '').trim().toLowerCase() === String(kelas).trim().toLowerCase();
      });
      const santriIds = santriKelas.map(function (s) { return String(s.id); });
      if (isKelompokTableOnFirestore_(SHEET_NAMES.ABSENSI, kelompokId)) {
        santriIds.forEach(function (sid) {
          const docId = tanggal + '_' + sid;
          firestoreDeleteDoc_('kelompok/' + kelompokId + '/absensi', docId);
          result.removedAbsensi++;
        });
      } else {
        readSheetAsObjects(SHEET_NAMES.ABSENSI).forEach(function (a) {
          if (santriIds.indexOf(String(a.santri_id)) !== -1 && tanggalKeString_(a.tanggal) === tanggal) {
            deleteRowByQuery(SHEET_NAMES.ABSENSI, { id: a.id });
            result.removedAbsensi++;
          }
        });
      }
    }
  });

  if (qaGuru) {
    const path = guruPath_(kelompokId);
    firestoreDeleteDoc_(path, String(qaGuru.id));
    cacheDrop_('guru_k' + kelompokId);
    result.removedGuru = true;
  }

  return { success: true, data: result };
}

/** ?diag=perfauditlograwcount — hitung baris audit_log SAAT INI (read-only, tanpa mengubah apa pun). */
function diagPerfAuditLogRowCount_() {
  const rows = readSheetAsObjects(SHEET_NAMES.AUDIT_LOG);
  return { success: true, rowCount: rows.length };
}
