/**
 * ⚠️⚠️⚠️ TEMPORARY — Modul_PerfAudit.gs ⚠️⚠️⚠️
 * Ditambahkan 2026-08-08 KHUSUS untuk ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md.
 * TIDAK mengubah business logic — semua fungsi di sini HANYA memanggil fungsi
 * server yang SUDAH ADA (serverAddGuru, serverGetInputAbsenMeta,
 * serverGetGuruDashboardSummaryRange, serverGetKelasAbsenList,
 * serverGetAbsensiKelasForm, serverSaveAbsensiKelasAdmin, dst) lewat sesi
 * sintetis di CacheService — pola PERSIS SAMA dengan diag=kehadirantest yang
 * sudah ada di Code.js sebelum file ini dibuat, bukan mekanisme baru.
 *
 * WAJIB DIHAPUS (file ini + baris dispatch di Code.js/doGet + revert
 * withScriptLock_/serverSaveAbsensiKelasAdmin di Modul_Utilities.gs/
 * Modul_InputAbsen.gs) setelah laporan pengukuran diverifikasi user. Lihat
 * daftar revert lengkap di akhir ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md
 * §Cleanup.
 *
 * Data yang dibuat fungsi ini (SEMUA baru/isolated, TIDAK menyentuh baris
 * guru/kelas/santri yang sudah ada):
 *   - 1 dokumen Firestore kelompok/{id}/guru bernama persis "Guru Test QA"
 *   - 1 baris sheet akses_kelas_request (status='approved', keterangan
 *     diawali "[PERFAUDIT TEMP]") — memberi guru QA akses BACA/TULIS ke 1
 *     kelas ASLI HANYA untuk 1 tanggal jauh ke depan yang ditentukan saat
 *     setup (tidak pernah menyentuh tanggal operasional yang sudah dipakai)
 *   - baris absensi (kelas asli tsb, tanggal jauh ke depan tsb SAJA) kalau
 *     diagPerfSave_ dipanggil — juga akan dihapus oleh diagPerfCleanup_.
 */

const PERF_QA_GURU_NAMA_ = 'Guru Test QA';

/** Sesi sintetis (CacheService) — TIDAK membuat/menyentuh baris `users`. */
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

/** ?diag=perfkelaslist&kelompok=1 — read-only, cek kelas + jumlah santri sebelum setup. */
function diagPerfKelasList_(kelompokId) {
  const list = getAllKelasInKelompok_(kelompokId);
  const santriAll = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId);
  list.forEach(function (item) {
    const kelasLower = item.kelas.toLowerCase();
    item.santriCount = santriAll.filter(function (s) {
      return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower;
    }).length;
  });
  return { success: true, data: list };
}

/**
 * ?diag=perfsetup&kelompok=1&kelas=<kelas asli>&tanggal=<YYYY-MM-DD jauh ke depan>
 * Idempotent — aman dipanggil ulang (cek dulu sebelum membuat).
 */
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
  let createdAkses = false;
  if (!existing) {
    const ownerGuruId = getKelasOwnerGuruId_(kelompokId, targetKelas) || '';
    withScriptLock_(function () {
      aksesId = generateId(SHEET_NAMES.AKSES_KELAS_REQUEST);
      appendRowToSheet(SHEET_NAMES.AKSES_KELAS_REQUEST, [
        aksesId, kelompokId, String(targetKelas).trim(), tanggal,
        0, qaGuru.id, PERF_QA_GURU_NAMA_, ownerGuruId,
        'approved', '[PERFAUDIT TEMP] akses test performa — hapus setelah pengukuran selesai',
        new Date().toISOString(), new Date().toISOString(),
      ]);
    });
    createdAkses = true;
  }

  const santriAll = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId);
  const santriKelas = santriAll.filter(function (s) {
    return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLowerTarget;
  });

  return {
    success: true,
    guruQaId: qaGuru.id,
    guruQaNama: qaGuru.nama,
    createdGuru: createdGuru,
    aksesKelasRequestId: aksesId,
    createdAkses: createdAkses,
    grantedKelas: targetKelas,
    tanggalTest: tanggal,
    santriCountKelas: santriKelas.length,
    santriIdsKelas: santriKelas.map(function (s) { return s.id; }),
  };
}

/** ?diag=perflogin&username=&password= — serverLogin() TIDAK bercabang per role,
 *  jadi login admin/admin123 representatif utk biaya login guru manapun (baca
 *  users sheet + hash compare, sama persis). Dipakai krn QA tidak punya baris
 *  `users` (sengaja, lihat catatan rule "jangan buat data absensi/identitas
 *  ekstra di luar yg diperlukan"). */
function diagPerfLogin_(username, password) {
  const t0 = Date.now();
  const res = serverLogin(username, password);
  const t1 = Date.now();
  return { success: true, ms: t1 - t0, loginSuccess: res.success, role: res.user ? res.user.role : null };
}

/** ?diag=perfdashboard&kelompok=1&guruid=&tahun=&bulan= — real init sequence
 *  (bell/meta, quote, dashboard summary, prefetch kelas) diukur satu-satu. */
function diagPerfDashboard_(kelompokId, guruId, tahun, bulan) {
  const token = perfMintSession_('guru', kelompokId, guruId, 300);
  const todayStr = Utilities.formatDate(new Date(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const mulai = tahun + '-' + String(bulan).padStart(2, '0') + '-01';
  const lastDay = new Date(Number(tahun), Number(bulan), 0).getDate();
  const selesai = tahun + '-' + String(bulan).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');

  const t0 = Date.now();
  const meta = serverGetInputAbsenMeta(token);
  const t1 = Date.now();
  const dash = serverGetGuruDashboardSummaryRange(token, mulai, selesai);
  const t2 = Date.now();
  const prefetch = serverGetKelasAbsenList(token, todayStr, null);
  const t3 = Date.now();

  return {
    success: true,
    metaMs: t1 - t0, metaSuccess: meta.success,
    dashboardMs: t2 - t1, dashboardSuccess: dash.success,
    prefetchKelasMs: t3 - t2, prefetchSuccess: prefetch.success,
    sequentialTotalMs: t3 - t0,
    note: 'Diukur BERURUTAN (sequential) di server utk isolasi biaya per fungsi — di browser asli 3 panggilan ini + serverGetQuoteHariIni + serverGetJurnalKelasList dikirim hampir bersamaan (concurrent), jadi total waktu SAMPAI DASHBOARD TERLIHAT di browser TIDAK SAMA DENGAN penjumlahan angka ini (lihat catatan NOT MEASURED utk waktu konkuren nyata).',
  };
}

/** ?diag=perfswitchclass&kelompok=1&guruid=&kelas=&tanggal= — real serverGetKelasAbsenList
 *  (cache-miss / round-trip penuh; "cache-hit" adalah murni client-side, 0 network,
 *  lihat laporan). tanggal WAJIB tanggal test dari diagPerfSetup_. */
function diagPerfSwitchClass_(kelompokId, guruId, kelas, tanggal) {
  const token = perfMintSession_('guru', kelompokId, guruId, 300);
  const t0 = Date.now();
  const res = serverGetKelasAbsenList(token, tanggal, kelas);
  const t1 = Date.now();
  return {
    success: true, ms: t1 - t0, callSuccess: res.success,
    kelasCount: res.data ? res.data.length : 0,
    formDataCount: res.formData ? res.formData.length : 0,
  };
}

/** ?diag=perfstudentlist&kelompok=1&guruid=&kelas=&tanggal= — real serverGetAbsensiKelasForm
 *  (skenario "fetch" terpisah dari switch-class; "preloaded" = 0 tambahan, sudah
 *  ikut di formData respons switch-class, lihat diagPerfSwitchClass_). */
function diagPerfStudentList_(kelompokId, guruId, kelas, tanggal) {
  const token = perfMintSession_('guru', kelompokId, guruId, 300);
  const t0 = Date.now();
  const res = serverGetAbsensiKelasForm(token, kelas, tanggal);
  const t1 = Date.now();
  return { success: true, ms: t1 - t0, callSuccess: res.success, santriCount: res.data ? res.data.length : 0 };
}

/**
 * ?diag=perfsave&kelompok=1&kelas=&tanggal=&count=N
 * PAKAI serverSaveAbsensiKelasAdmin (BUKAN serverSaveAbsensiKelas guru) —
 * SATU-SATUNYA jalur simpan yang TIDAK menolak tanggal jauh ke depan
 * (serverSaveAbsensiKelas guru SELALU menolak tanggal > hari ini, lihat
 * iaValidateWaktuAbsen_, jadi tidak bisa dipakai bersama tanggal aman jauh
 * ke depan). Konsekuensi: akses_kelas_request/guru_izin TIDAK ikut terpanggil
 * DI DALAM diag ini (jalur admin memang tidak memanggilnya) — kedua tabel itu
 * sudah diukur terpisah & real via diagPerfSwitchClass_ (akses_kelas_request)
 * dan diagPerfGuruIzin_ (guru_izin) di bawah. SAVE_ACCESS_CHECK_MS/
 * SAVE_GURU_IZIN_MS akan NOT MEASURED di sini dgn alasan ini (jalur admin
 * memang tidak punya tahap itu), dicatat jelas di laporan.
 */
function diagPerfSave_(kelompokId, kelas, tanggal, santriIds) {
  const adminToken = perfMintSession_('admin_ppg', kelompokId, null, 300);

  const tPrep0 = Date.now();
  const absensiList = santriIds.map(function (id, idx) {
    const statuses = ['hadir', 'izin', 'sakit', 'alpa'];
    return { santri_id: id, status: statuses[idx % statuses.length] };
  });
  const tPrep1 = Date.now();

  const tReadStart = Date.now();
  const santriIdsKelas = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId)
    .filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === String(kelas).trim().toLowerCase(); })
    .map(function (s) { return s.id; });
  const tReadEnd = Date.now();

  const perfLock = {};
  const tWriteStart = Date.now();
  let count = 0;
  withScriptLock_(function () {
    count = iaRewriteAbsensiKelas_(kelompokId, santriIdsKelas, tanggal, absensiList, 0);
  }, perfLock);
  const tWriteEnd = Date.now();

  const tAuditStart = Date.now();
  logAudit('absensi', 'kelas_' + kelas + '_' + tanggal, 'create', 0, '[PERFAUDIT TEMP] Input Absen kelas "' + kelas + '": ' + count + ' santri');
  const tAuditEnd = Date.now();

  return {
    success: true,
    santriCountRequested: santriIds.length,
    santriCountWritten: count,
    clientPrepMs: tPrep1 - tPrep0,
    readMasterMs: tReadEnd - tReadStart,
    lockWaitMs: perfLock.lockWaitMs,
    writeMs: perfLock.lockHeldMs,
    writeWallMs: tWriteEnd - tWriteStart,
    auditLogMs: tAuditEnd - tAuditStart,
    serverTotalMs: tAuditEnd - tPrep0,
    note: 'Via serverSaveAbsensiKelasAdmin path (aman utk tanggal jauh ke depan) — SAVE_ACCESS_CHECK_MS & SAVE_GURU_IZIN_MS NOT MEASURED di sini (jalur admin tidak memanggil canGuruAccessKelas_/iaCekGuruSedangIzin_), lihat diagPerfSwitchClass_/diagPerfGuruIzin_ utk angka real keduanya.',
  };
}

/** ?diag=perfaksesrequest&kelompok=1 — timing + row count baca akses_kelas_request
 *  (representatif utk SEMUA 3 titik panggilan statis di §11 audit — fungsinya
 *  generik & identik di ke-3 titik itu, readSheetAsObjects sama persis). */
function diagPerfAksesRequest_(kelompokId) {
  const t0 = Date.now();
  const rows = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST);
  const t1 = Date.now();
  return { success: true, ms: t1 - t0, rowCount: rows.length };
}

/** ?diag=perfauditlog&kelompok=1 — timing + row count SCAN audit_log (bagian
 *  generateId() dalam logAudit — bukan append-nya, lihat diagPerfSave_.auditLogMs
 *  utk total termasuk append). */
function diagPerfAuditLogScan_() {
  const t0 = Date.now();
  const rows = readSheetAsObjects(SHEET_NAMES.AUDIT_LOG);
  const t1 = Date.now();
  return { success: true, ms: t1 - t0, rowCount: rows.length };
}

/** ?diag=perfguruizin&guruid=&tanggal= — real iaCekGuruSedangIzin_. */
function diagPerfGuruIzin_(guruId, tanggal) {
  const t0 = Date.now();
  const izin = iaCekGuruSedangIzin_(guruId, tanggal);
  const t1 = Date.now();
  const allRows = readSheetAsObjects(SHEET_NAMES.GURU_IZIN);
  return { success: true, ms: t1 - t0, rowCount: allRows.length, izinAktif: !!izin };
}

/**
 * ?diag=perfcleanup&kelompok=1&kelas=&tanggal=
 * JANGAN dipanggil sebelum laporan diverifikasi user. Menghapus SEMUA data
 * yang dibuat diagPerfSetup_/diagPerfSave_ — guru QA, baris akses_kelas_request
 * TEMP, dan baris absensi kelas+tanggal test (yang ditulis diagPerfSave_).
 */
function diagPerfCleanup_(kelompokId, kelas, tanggal) {
  const result = { removedGuru: false, removedAkses: 0, removedAbsensi: 0 };
  const qaGuru = perfFindQaGuru_(kelompokId);

  withScriptLock_(function () {
    // Hapus baris akses_kelas_request TEMP milik guru QA.
    const aksesRows = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST);
    aksesRows.forEach(function (r) {
      if (qaGuru && String(r.requester_guru_id) === String(qaGuru.id) &&
        String(r.keterangan || '').indexOf('[PERFAUDIT TEMP]') === 0) {
        deleteRowByQuery(SHEET_NAMES.AKSES_KELAS_REQUEST, { id: r.id });
        result.removedAkses++;
      }
    });

    // Hapus baris absensi test (kelas+tanggal test SAJA, tidak menyentuh tanggal lain).
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
