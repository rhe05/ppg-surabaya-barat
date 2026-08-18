/**
 * Deploy otomatis via GitHub Actions aktif sejak 2026-07-15.
 * Code.gs — Entry point Web App + autentikasi login.
 * Melengkapi SchemaConfig.gs, Auth.gs, KelompokService.gs, AbsensiService.gs
 * yang sudah dibuat sebelumnya.
 *
 * CATATAN ARSITEKTUR: Apps Script Web App secara idiomatis memakai pola
 * google.script.run (client memanggil fungsi server langsung), BUKAN
 * fetch ke endpoint REST seperti di API Design.md (Tahap 18, dirancang
 * untuk Next.js). Ini penyesuaian wajar terhadap platform — logika bisnis
 * & RBAC di baliknya tetap sama persis.
 */

/**
 * ⚠️ MODE PENGEMBANGAN — login dilewati sementara agar UI/fitur lain
 * bisa dites tanpa perlu isi tabel Users dulu.
 *
 * WAJIB diubah ke `false` sebelum aplikasi dipakai pengguna pilot nyata
 * (Kelp Petemon, Bangun Rejo, Purwodadi, Dupak) — selama true, SIAPA PUN
 * yang membuka URL langsung masuk sebagai Admin PPG tanpa password.
 */
const DEV_MODE_SKIP_LOGIN = false;

/**
 * SHEET_NAMES — Daftar semua sheet di Spreadsheet.
 * Diimport dari Modul_Utilities.gs (definisi tunggal untuk consistency).
 */

/**
 * Dipanggil otomatis saat Web App diakses via URL (GET).
 */
function doGet(e) {
  // ?diag=schema → JSON daftar sheet + header, dipakai tools/check_schema.js
  // untuk memverifikasi setupDatabaseStructure() sudah jalan. Aman: web app
  // access = MYSELF, jadi hanya pemilik yang bisa memanggil.
  if (e && e.parameter && e.parameter.diag === 'schema') {
    return ContentService
      .createTextOutput(JSON.stringify(diagSchema_()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=rows&sheet=<nama>&limit=<n> → JSON isi baris + tipe tiap nilai.
  // Dipakai untuk mendiagnosis data yang tampil aneh/tidak muncul di UI
  // (mis. sel tanggal/jam yang jadi objek Date, bukan string).
  if (e && e.parameter && e.parameter.diag === 'rows') {
    return ContentService
      .createTextOutput(JSON.stringify(diagRows_(e.parameter.sheet, e.parameter.limit)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=kelompokdist&sheet=<nama> → hitung jumlah baris per kelompok_id
  // (join ke santri_id kalau sheet itu 'absensi', yang tidak punya kolom
  // kelompok_id sendiri). Dipakai investigasi Migration 003 (data inventory)
  // tanpa perlu diagRows_ yang dibatasi 50 baris. HAPUS setelah dipakai.
  if (e && e.parameter && e.parameter.diag === 'kelompokdist') {
    let result;
    try {
      const sheetName = e.parameter.sheet;
      const rows = readSheetAsObjects(sheetName);
      const dist = {};
      if (sheetName === 'absensi') {
        const santriMap = {};
        readSheetAsObjects('santri').forEach(function (s) { santriMap[s.id] = s.kelompok_id; });
        rows.forEach(function (r) {
          const k = santriMap[r.santri_id] || 'ORPHAN(santri_id=' + r.santri_id + ')';
          dist[k] = (dist[k] || 0) + 1;
        });
      } else {
        rows.forEach(function (r) {
          const k = r.kelompok_id !== undefined ? r.kelompok_id : '(tidak ada kolom kelompok_id)';
          dist[k] = (dist[k] || 0) + 1;
        });
      }
      result = { success: true, sheet: sheetName, totalRows: rows.length, distribusiPerKelompok: dist };
    } catch (err) {
      result = { success: false, error: err.message };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=firestoretest → jalankan testFirestoreBridge_() (Modul_FirestoreBridge.gs)
  // lewat Web App, alternatif kalau dropdown "select function" di editor Apps
  // Script gagal ke-load untuk file baru. TIDAK menyentuh data aplikasi asli —
  // cuma baca/tulis 1 dokumen percobaan di koleksi Firestore "_bridge_test".
  if (e && e.parameter && e.parameter.diag === 'firestoretest') {
    let result;
    try {
      testFirestoreBridge_();
      result = { success: true, message: 'Semua tes jembatan Firestore lolos.' };
    } catch (err) {
      result = { success: false, error: err.message };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=migrate&table=<nama>&mode=copy&kelompok=<id> (default: dryrun kalau
  // mode selain 'copy') → salin data 1 tabel ke Firestore (Modul_FirestoreMigration.gs).
  // Whitelist demi jaga-jaga supaya tidak ada nama sheet salah ketik ke-trigger dari URL.
  // 'nested: true' → tabel terikat kelompok. 'kelompok' param HANYA WAJIB kalau
  // 'perKelompok: true' (rollout 1 kelompok dulu, spt santri/guru) — kalau tidak
  // diisi utk tabel yg perKelompok, semua kelompok ikut disalin sekaligus.
  if (e && e.parameter && e.parameter.diag === 'migrate') {
    const allowedTables = {
      pengumuman: { nested: true },
      santri: { nested: true, perKelompok: true },
      guru: { nested: true, perKelompok: true },
      jadwal_kbm: { nested: true, perKelompok: true },
      jadwal_kategori_hari: { nested: true, perKelompok: true },
      // absensi: tidak punya kolom kelompok_id sendiri (join ke santri_id),
      // jadi WAJIB selalu perKelompok — dipakai migrateAbsensiKelompokToFirestore_
      // (fungsi terpisah, bukan migrateKelompokTableToFirestore_ generik).
      absensi: { nested: true, perKelompok: true, customMigrateFn: true },
    };
    const table = e.parameter.table;
    const kelompokId = e.parameter.kelompok;
    let result;
    if (!allowedTables[table]) {
      result = { success: false, error: 'Tabel "' + table + '" belum diizinkan untuk migrasi diagnostik ini.' };
    } else if (allowedTables[table].perKelompok && !kelompokId) {
      result = { success: false, error: 'Tabel "' + table + '" butuh parameter &kelompok=<id> (rollout per kelompok, bukan sekaligus semua).' };
    } else {
      const dryRun = e.parameter.mode !== 'copy';
      try {
        let report;
        if (allowedTables[table].customMigrateFn) {
          report = migrateAbsensiKelompokToFirestore_(kelompokId, dryRun);
        } else {
          report = kelompokId
            ? migrateKelompokTableToFirestore_(table, kelompokId, dryRun)
            : migrateNestedTableToFirestore_(table, dryRun);
        }
        result = { success: true, dryRun: dryRun, report: report };
      } catch (err) {
        result = { success: false, error: err.message };
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=pilottest&table=<pengumuman|santri|guru> → jalankan tes CRUD
  // end-to-end lewat fungsi aplikasi SESUNGGUHNYA (bukan cuma jembatan
  // level-rendah), dipakai SETELAH tabel/kelompok diaktifkan di saklar
  // Firestore-nya. Membuat & hapus data percobaan, tidak meninggalkan sampah
  // walau tesnya gagal di tengah.
  if (e && e.parameter && e.parameter.diag === 'pilottest') {
    const table = e.parameter.table;
    const pilotFns = {
      pengumuman: testPengumumanFirestorePilot_,
      santri: testSantriFirestorePilot_,
      guru: testGuruFirestorePilot_,
      jadwal_kbm: testJadwalKBMFirestorePilot_,
      absensi: testAbsensiFirestorePilot_,
    };
    let result;
    if (!pilotFns[table]) {
      result = { success: false, error: 'Tabel "' + table + '" belum punya tes pilot.' };
    } else {
      try {
        result = pilotFns[table]();
      } catch (err) {
        result = { success: false, error: err.message };
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=listkelompok&table=santri|guru|absensi&kelompok=<id> → lihat isi mentah
  // 1 subcollection Firestore (mis. buat pastikan tidak ada duplikasi setelah
  // sentralisasi readSheetAsObjects). TIDAK mengubah apapun, cuma baca.
  if (e && e.parameter && e.parameter.diag === 'listkelompok') {
    const table = e.parameter.table;
    const kelompokId = e.parameter.kelompok;
    let result;
    if (['santri', 'guru', 'absensi', 'jadwal_kbm'].indexOf(table) === -1 || !kelompokId) {
      result = { success: false, error: 'Butuh &table=santri|guru|absensi|jadwal_kbm&kelompok=<id>.' };
    } else {
      try {
        const data = firestoreListCollection_('kelompok/' + kelompokId + '/' + table);
        result = { success: true, jumlah: data.length, data: data };
      } catch (err) {
        result = { success: false, error: err.message };
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=monitoringtest&kelompok=<id>&tahun=<yyyy>&bulan=<1-12> → panggil
  // serverGetMonitoringGenerus() langsung, dipakai verifikasi logika rata-rata
  // per kelas/jenjang terhadap data asli sebelum tampilan dibangun.
  if (e && e.parameter && e.parameter.diag === 'monitoringtest') {
    let result;
    try {
      const dev = serverCheckDevMode();
      const now = new Date();
      const kelompokId = e.parameter.kelompok || '1';
      const tahun = parseInt(e.parameter.tahun, 10) || now.getFullYear();
      const bulan = parseInt(e.parameter.bulan, 10) || (now.getMonth() + 1);
      result = serverGetMonitoringGenerus(dev.token, kelompokId, tahun, bulan);
    } catch (err) {
      result = { success: false, error: err.message };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=seedkurikulum → jalankan seedKurikulumBacaanQuranPetemon() (Modul_SeedData.gs)
  // lewat Web App, dipakai supaya seed data bisa dipicu tanpa perlu buka
  // dropdown "select function" di editor Apps Script. Aman diulang (idempotent —
  // fungsi ini sendiri skip kalau data kategori sudah ada).
  if (e && e.parameter && e.parameter.diag === 'seedkurikulum') {
    let result;
    try {
      seedKurikulumBacaanQuranPetemon();
      seedKurikulumTulisHurufArabPetemon();
      seedKurikulumHafalanSuratPetemon();
      seedKurikulumProbulBacaanQuranPetemon();
      result = { success: true, message: 'Seed kurikulum (Bacaan Al-Qur\'an + Tulis Huruf Arab + Hafalan Surat + Probul Bacaan Al-Qur\'an) selesai dijalankan.' };
    } catch (err) {
      result = { success: false, error: err.message };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=dashboardbundle → panggil serverGetDashboardBundle() langsung & lihat
  // hasil JSON-nya, dipakai memverifikasi struktur (kpi/desaBreakdown/
  // santriTeladan) setelah refactor tanpa perlu login browser (web app
  // access = MYSELF, sulit dites otomatis lewat browser biasa).
  if (e && e.parameter && e.parameter.diag === 'dashboardbundle') {
    let result;
    try {
      result = serverGetDashboardBundle();
    } catch (err) {
      result = { success: false, error: err.message };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=kehadirantest&kelompok=<id>&tahun=<yyyy>&bulan=<1-12> → panggil
  // serverGetKehadiranGenerusKategori/DetailList/serverGetRiwayatKehadiranGuru
  // langsung pakai sesi admin_ppg sementara (bukan token login sungguhan) --
  // dipakai investigasi laporan guru "sudah input absen tapi tidak muncul di
  // Dashboard/Riwayat Kehadiran" tanpa perlu login browser (web app diam-diam
  // pakai DEV_MODE_SKIP_LOGIN=false sekarang jadi diag=monitoringtest lama
  // sudah tidak jalan tanpa token asli).
  if (e && e.parameter && e.parameter.diag === 'kehadirantest') {
    let result;
    try {
      const kelompokId = e.parameter.kelompok || '1';
      const tahun = parseInt(e.parameter.tahun, 10) || new Date().getFullYear();
      const bulan = parseInt(e.parameter.bulan, 10) || (new Date().getMonth() + 1);
      const kelas = e.parameter.kelas || '';
      const guruId = e.parameter.guruid || '';
      const diagToken = Utilities.getUuid();
      CacheService.getUserCache().put('session_' + diagToken, JSON.stringify({
        id: 0, nama: '[diag]', role: 'admin_ppg', scopeType: 'ppg', scopeId: 1, guruId: guruId || null,
      }), 300);
      result = {
        kategori: serverGetKehadiranGenerusKategori(diagToken, kelompokId, tahun, bulan),
        detailList: serverGetKehadiranGenerusDetailList(diagToken, kelompokId, tahun, bulan),
      };
      if (guruId && kelas) {
        const guruToken = Utilities.getUuid();
        CacheService.getUserCache().put('session_' + guruToken, JSON.stringify({
          id: 0, nama: '[diag-guru]', role: 'guru', scopeType: 'kelompok', scopeId: parseInt(kelompokId, 10), guruId: parseInt(guruId, 10),
        }), 300);
        result.riwayatGuru = serverGetRiwayatKehadiranGuru(guruToken, tahun, bulan, kelas);
      }
    } catch (err) {
      result = { success: false, error: err.message, stack: err.stack };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ═══════════════════════════════════════════════════════════════════
  // APLIKASI INI SUDAH PINDAH KE SUPABASE + NEXT.JS (18 Agustus 2026).
  //
  // Layar aplikasi lama TIDAK LAGI disajikan ke pengguna: guru yang membuka
  // tautan lama akan melihat pemberitahuan pindah, bukan form absensi.
  // Alasannya bukan sekadar kerapian — selama dua sistem sama-sama bisa
  // MENULIS, absensi yang diinput di sini tidak akan pernah muncul di app
  // baru, dan data kedua sistem menyimpang diam-diam.
  //
  // Yang SENGAJA dibiarkan hidup:
  //   - Seluruh route ?diag=... di atas (perkakas pemeriksaan, tidak menulis)
  //   - Layar lama lewat ?rujukan=tampilan — dipakai membandingkan gaya
  //     tampilan lama dengan app baru. Ini BUKAN pintu belakang untuk
  //     pemakaian sehari-hari: login lama tetap berlaku di baliknya, dan
  //     tautan ini tidak diberikan ke guru.
  //
  // Untuk MENGHIDUPKAN KEMBALI app lama: hapus blok if di bawah ini, lalu
  // push (CI/CD akan clasp push + deploy). Tidak ada data yang berubah.
  var lihatRujukan = e && e.parameter && e.parameter.rujukan === 'tampilan';
  if (!lihatRujukan) {
    return HtmlService.createHtmlOutput(halamanPindah_())
      .setTitle('Ruang Ngaji — Aplikasi Sudah Pindah')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Ruang Ngaji (arsip tampilan lama)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Halaman pemberitahuan pindah. Sengaja TIDAK memuat tautan app baru:
 * alamatnya masih bisa berubah, dan tautan mati lebih membingungkan
 * daripada tidak ada tautan sama sekali. Guru diarahkan menghubungi admin,
 * yang selalu tahu alamat terbaru.
 *
 * Ditulis sebagai string HTML biasa, bukan berkas terpisah, supaya tidak
 * ada berkas baru yang harus dirawat hanya untuk satu halaman statis.
 * Gayanya menyalin token desain app lama (Style_Main.html:2-23) agar
 * peralihannya tidak terasa seperti error.
 */
function halamanPindah_() {
  return [
    '<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">',
    '<style>',
    ':root{--brass:#D97706;--panel:#FFFFFF;--bg:#F8FAFC;--border:#E2E8F0;',
    '--text:#0F172A;--text-dim:#64748B;--radius:8px;}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
    'background:var(--bg);color:var(--text);min-height:100vh;display:flex;',
    'align-items:center;justify-content:center;padding:24px;line-height:1.6}',
    '.kartu{background:var(--panel);border:1px solid var(--border);',
    'border-radius:14px;box-shadow:0 2px 12px rgba(15,23,42,.08);',
    'max-width:460px;width:100%;padding:32px;text-align:center}',
    '.lencana{display:inline-block;background:var(--brass);color:#fff;',
    'font-size:11px;font-weight:700;letter-spacing:.5px;padding:5px 12px;',
    'border-radius:999px;margin-bottom:20px}',
    'h1{font-size:21px;margin-bottom:12px}',
    'p{font-size:14px;color:var(--text-dim);margin-bottom:14px}',
    '.tegas{color:var(--text);font-weight:600}',
    '.kotak{background:var(--bg);border:1px solid var(--border);',
    'border-radius:var(--radius);padding:14px;font-size:13px;margin-top:20px;',
    'text-align:left;color:var(--text-dim)}',
    '</style></head><body><div class="kartu">',
    '<div class="lencana">APLIKASI SUDAH PINDAH</div>',
    '<h1>Ruang Ngaji punya alamat baru</h1>',
    '<p>Mulai <span class="tegas">18 Agustus 2026</span>, seluruh pencatatan ',
    'absensi, jurnal, dan data santri dilakukan di aplikasi baru.</p>',
    '<p>Aplikasi di alamat ini <span class="tegas">sudah tidak dipakai lagi</span>. ',
    'Data yang diinput di sini tidak akan tersimpan ke sistem baru.</p>',
    '<div class="kotak"><span class="tegas">Yang perlu Anda lakukan:</span><br>',
    'Hubungi admin kelompok atau admin PPG untuk mendapatkan tautan aplikasi ',
    'yang terbaru, lalu simpan tautan itu di ponsel Anda.</div>',
    '</div></body></html>',
  ].join('');
}

/**
 * Dipanggil dari Index.html via <?!= include('NamaFile'); ?> untuk
 * menggabungkan Style_Main.html / Markup_Screens.html / Script_Main.html
 * menjadi satu output HTML (pola resmi HtmlService template include).
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Dipanggil Index.html paling awal untuk cek apakah mode pengembangan aktif.
 * Jika aktif, buat sesi dummy (role admin_ppg agar semua fitur bisa dites)
 * tanpa perlu login sungguhan.
 */
function serverCheckDevMode() {
  if (!DEV_MODE_SKIP_LOGIN) {
    return { devMode: false };
  }

  const token = Utilities.getUuid();
  const sessionData = {
    id: 0,
    nama: '[Mode Pengembangan — Belum Login Sungguhan]',
    role: 'admin_ppg',
    scopeType: 'ppg',
    scopeId: 1,
  };
  CacheService.getUserCache().put('session_' + token, JSON.stringify(sessionData), 21600);

  return { devMode: true, token: token, user: sessionData };
}

/**
 * Hash password sederhana (SHA-256). Untuk skala internal organisasi ini
 * cukup memadai; jika suatu saat migrasi ke Supabase (ADR-011), ganti ke
 * bcrypt/argon2 sesuai System Architecture §2 (Fase 1).
 */
function hashPassword_(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return digest.map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

/**
 * Dipanggil dari Index.html lewat google.script.run.serverLogin(...)
 * Mengembalikan { success, token, user, rememberToken? } atau { success:false, error }.
 *
 * `rememberMe` opsional (checkbox "Ingat saya di perangkat ini" login guru) —
 * kalau true, selain token sesi 6-jam biasa (CacheService, batas maksimum
 * platform) juga diterbitkan `rememberToken` acak 30-hari yang klien simpan
 * di localStorage (bukan sessionStorage → bertahan lintas sesi browser).
 * Lihat serverLoginWithRememberToken di bawah utk alur pemakaiannya.
 */
function serverLogin(username, password, rememberMe) {
  const users = readSheetAsObjects(SHEET_NAMES.USERS);
  const found = users.find((u) => u.username === username);

  if (!found) {
    return { success: false, error: 'Username atau password salah.' };
  }

  const hashed = hashPassword_(password);
  if (hashed !== found.password_hash) {
    return { success: false, error: 'Username atau password salah.' };
  }

  if (String(found.status).toLowerCase() === 'inactive') {
    return { success: false, error: 'Akun tidak aktif. Hubungi admin.' };
  }

  // Buat token sesi sederhana, simpan di cache 6 jam
  const token = Utilities.getUuid();
  const sessionData = {
    id: found.id,
    nama: found.nama,
    role: found.role,
    scopeType: found.scope_type,
    scopeId: found.scope_id,
    guruId: found.guru_id || null,
  };
  CacheService.getUserCache().put('session_' + token, JSON.stringify(sessionData), 21600); // 6 jam

  const result = { success: true, token: token, user: sessionData };
  if (rememberMe) {
    result.rememberToken = issueRememberToken_(found.id);
  }
  return result;
}

/**
 * Masa berlaku remember-token ("Ingat saya di perangkat ini") dalam hari.
 */
const REMEMBER_TOKEN_DAYS_ = 30;

/**
 * Terbitkan remember-token acak utk 1 user, simpan HASH-nya saja (pola sama
 * dgn password_hash) di sheet remember_tokens, kembalikan token mentah utk
 * disimpan klien di localStorage.
 */
function issueRememberToken_(userId) {
  const raw = Utilities.getUuid() + Utilities.getUuid();
  const expiresAt = new Date(Date.now() + REMEMBER_TOKEN_DAYS_ * 24 * 60 * 60 * 1000).toISOString();
  withScriptLock_(function () {
    const newId = generateId(SHEET_NAMES.REMEMBER_TOKENS);
    appendRowToSheet(SHEET_NAMES.REMEMBER_TOKENS, [
      newId, userId, hashPassword_(raw), expiresAt, new Date().toISOString(),
    ]);
  });
  return raw;
}

/**
 * Dipanggil dari Index.html lewat google.script.run.serverLoginWithRememberToken(...)
 * saat tidak ada sesi CacheService aktif (mis. browser baru dibuka lagi
 * setelah lebih dari 6 jam) TAPI ada remember-token tersimpan di
 * localStorage. Kalau valid & belum kedaluwarsa, terbitkan sesi baru
 * (sama seperti serverLogin) tanpa minta username/password lagi.
 */
function serverLoginWithRememberToken(rememberToken) {
  if (!rememberToken) return { success: false, error: 'Token tidak ada.' };

  const hashed = hashPassword_(rememberToken);
  const rows = readSheetAsObjects(SHEET_NAMES.REMEMBER_TOKENS);
  const found = rows.find((r) => r.token_hash === hashed);

  if (!found || new Date(found.expires_at) < new Date()) {
    if (found) {
      withScriptLock_(function () {
        deleteRowByQuery(SHEET_NAMES.REMEMBER_TOKENS, { id: found.id });
      });
    }
    return { success: false, error: 'Sesi tersimpan sudah kedaluwarsa. Silakan login kembali.' };
  }

  const users = readSheetAsObjects(SHEET_NAMES.USERS);
  const user = users.find((u) => String(u.id) === String(found.user_id));
  if (!user || String(user.status).toLowerCase() === 'inactive') {
    return { success: false, error: 'Akun tidak ditemukan atau tidak aktif.' };
  }

  const token = Utilities.getUuid();
  const sessionData = {
    id: user.id,
    nama: user.nama,
    role: user.role,
    scopeType: user.scope_type,
    scopeId: user.scope_id,
    guruId: user.guru_id || null,
  };
  CacheService.getUserCache().put('session_' + token, JSON.stringify(sessionData), 21600);

  return { success: true, token: token, user: sessionData };
}

/**
 * Kelompok yang ditampilkan di wizard onboarding guru (Daftar → pilih Kelompok).
 * Untuk saat ini HANYA Kelp Petemon (id 1) — Kelompok lain belum aktif dipakai
 * fitur ini. Tambah id di sini kapan pun Kelompok lain siap dipakai.
 */
const ONBOARDING_ACTIVE_KELOMPOK_IDS_ = [1];

/**
 * Dipanggil dari Index.html lewat google.script.run.serverRegisterGuru(...)
 * Pendaftaran mandiri — HANYA email + password. Akun dibuat dalam status
 * "belum lengkap" (role/scope/guru_id kosong) — verifikasi identitas guru
 * (Kelompok/Nama/Kelas) baru dilakukan SETELAH login pertama lewat wizard
 * onboarding (lihat serverCompleteOnboardingGuru di bawah), bukan saat
 * daftar. Jalur admin manual (Modul_UserManagement.gs →
 * serverGetGuruOptionsForUser) tetap ada sbg opsi cadangan.
 */
function serverRegisterGuru(email, password) {
  email = String(email || '').trim().toLowerCase();

  if (!email || !password) {
    return { success: false, error: 'Email dan password wajib diisi.' };
  }
  if (password.length < 6) {
    return { success: false, error: 'Password minimal 6 karakter.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, error: 'Format email tidak valid.' };
  }

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  const emailTaken = usersData.find(function (u) {
    return String(u.username || '').toLowerCase() === email || String(u.email || '').toLowerCase() === email;
  });
  if (emailTaken) {
    return { success: false, error: 'Email ini sudah terdaftar.' };
  }

  let newId;
  withScriptLock_(function () {
    newId = generateId(SHEET_NAMES.USERS);
    const now = new Date().toISOString().split('T')[0];
    appendRowToSheet(SHEET_NAMES.USERS, [
      newId, '', email, hashPassword_(password), '',
      '', '', email, 'active', now, now, 'self_register', '',
    ]);
  });

  const token = Utilities.getUuid();
  const sessionData = {
    id: newId,
    nama: '',
    role: '',
    scopeType: '',
    scopeId: '',
    guruId: null,
  };
  CacheService.getUserCache().put('session_' + token, JSON.stringify(sessionData), 21600);

  return { success: true, token: token, user: sessionData, message: 'Akun berhasil dibuat.' };
}

/**
 * GET daftar Kelompok yang boleh dipilih di wizard onboarding (lihat
 * ONBOARDING_ACTIVE_KELOMPOK_IDS_ di atas).
 */
function serverGetOnboardingKelompokOptions() {
  const list = readSheetAsObjects(SHEET_NAMES.KELOMPOK)
    .filter(function (k) { return ONBOARDING_ACTIVE_KELOMPOK_IDS_.indexOf(Number(k.id)) !== -1; })
    .map(function (k) { return { id: k.id, nama: k.nama }; });
  return { success: true, data: list };
}

/**
 * Cari baris 'guru' di satu Kelompok yang nama-nya cocok (case-insensitive,
 * trim) — dipakai onboarding & reset password mandiri.
 */
function findGuruByNamaKelompok_(kelompokId, nama) {
  const namaLower = String(nama || '').trim().toLowerCase();
  if (!namaLower) return null;
  return readSheetAsObjects(SHEET_NAMES.GURU).find(function (g) {
    return g.kelompok_id == kelompokId && String(g.nama || '').trim().toLowerCase() === namaLower;
  }) || null;
}

/**
 * Verifikasi identitas guru: Kelompok + Nama + Kelas harus cocok dengan data
 * yang sudah ada (guru row di Kelompok itu, dan kelas ada di jadwal_kbm milik
 * guru_id itu — pakai getKelasOwnedByGuru_ dari Modul_InputAbsen.gs supaya
 * satu sumber kebenaran dgn fitur Input Absen). Return guru row atau null.
 */
function verifyGuruIdentity_(kelompokId, nama, kelas) {
  const matched = findGuruByNamaKelompok_(kelompokId, nama);
  if (!matched) return null;

  const kelasLower = String(kelas || '').trim().toLowerCase();
  if (!kelasLower) return null;
  const owned = getKelasOwnedByGuru_(kelompokId, matched.id).map(function (k) { return k.toLowerCase(); });
  if (owned.indexOf(kelasLower) === -1) return null;

  return matched;
}

/**
 * Dipanggil SETELAH login pertama (akun role masih kosong) — wizard
 * onboarding: user pilih Kelompok, isi Nama, isi Kelas. Kalau cocok dengan
 * data Guru+Jadwal KBM yang sudah ada, akun ini "dilengkapi" jadi role='guru'
 * terhubung ke guru_id itu. Kalau tidak cocok, TIDAK ADA perubahan apa pun
 * (aman diulang) — pesan error generik sesuai permintaan user.
 */
function serverCompleteOnboardingGuru(token, kelompokId, nama, kelas) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (ONBOARDING_ACTIVE_KELOMPOK_IDS_.indexOf(Number(kelompokId)) === -1) {
    return { success: false, error: 'Kelompok tidak tersedia untuk saat ini.' };
  }

  const matched = verifyGuruIdentity_(kelompokId, nama, kelas);
  if (!matched) {
    return { success: false, error: 'Data belum terdaftar. Silakan hubungi Admin Ruang Ngaji.' };
  }

  withScriptLock_(function () {
    updateRowByQuery(SHEET_NAMES.USERS, { id: user.id }, {
      nama: matched.nama,
      role: 'guru',
      scope_type: 'kelompok',
      scope_id: matched.kelompok_id,
      guru_id: matched.id,
      updated_at: new Date().toISOString().split('T')[0],
    });
  });

  const sessionData = {
    id: user.id,
    nama: matched.nama,
    role: 'guru',
    scopeType: 'kelompok',
    scopeId: matched.kelompok_id,
    guruId: matched.id,
  };
  CacheService.getUserCache().put('session_' + token, JSON.stringify(sessionData), 21600);

  return { success: true, user: sessionData };
}

/**
 * Dipanggil SETELAH login pertama (akun role masih kosong) — jalur Admin
 * Kelompok wizard onboarding: user pilih peran Admin > Admin Kelompok, pilih
 * Kelompok (dibatasi ONBOARDING_ACTIVE_KELOMPOK_IDS_, sama dgn jalur guru),
 * isi Nama. TIDAK ada verifikasi ke data Guru (akun admin bukan guru) — nama
 * bebas diisi, langsung dilengkapi jadi role='admin_kelp' terikat Kelompok
 * itu. Role ini SENGAJA beda dari 'admin_kelompok' (akun desktop lengkap yang
 * dibuat manual admin_ppg lewat User Management) — 'admin_kelp' dikunci ke
 * screen mobile Input Absen, hanya lihat Dashboard Kehadiran semua kelas.
 */
function serverCompleteOnboardingAdminKelompok(token, kelompokId, nama) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (ONBOARDING_ACTIVE_KELOMPOK_IDS_.indexOf(Number(kelompokId)) === -1) {
    return { success: false, error: 'Kelompok tidak tersedia untuk saat ini.' };
  }

  nama = String(nama || '').trim();
  if (!nama) return { success: false, error: 'Nama wajib diisi.' };

  withScriptLock_(function () {
    updateRowByQuery(SHEET_NAMES.USERS, { id: user.id }, {
      nama: nama,
      role: 'admin_kelp',
      scope_type: 'kelompok',
      scope_id: kelompokId,
      updated_at: new Date().toISOString().split('T')[0],
    });
  });

  const sessionData = {
    id: user.id,
    nama: nama,
    role: 'admin_kelp',
    scopeType: 'kelompok',
    scopeId: kelompokId,
    guruId: null,
  };
  CacheService.getUserCache().put('session_' + token, JSON.stringify(sessionData), 21600);

  return { success: true, user: sessionData };
}

/**
 * "Lupa Password" mandiri — dipakai untuk akun guru self-register. Ganti
 * password TANPA tahu password lama, tapi harus membuktikan identitas yang
 * SAMA dengan yang dipakai saat onboarding (Kelompok+Nama+Kelas cocok data
 * Guru, DAN guru_id hasil pencocokan itu harus SAMA dengan guru_id akun yang
 * emailnya diberikan) — supaya tidak bisa reset password akun guru lain
 * hanya dengan menebak nama+kelas guru itu.
 */
function serverResetPasswordSelfGuru(email, kelompokId, nama, kelas, newPassword) {
  email = String(email || '').trim().toLowerCase();
  if (!email || !newPassword) {
    return { success: false, error: 'Email dan password baru wajib diisi.' };
  }
  if (newPassword.length < 6) {
    return { success: false, error: 'Password baru minimal 6 karakter.' };
  }

  const usersData = readSheetAsObjects(SHEET_NAMES.USERS);
  const targetUser = usersData.find(function (u) {
    return String(u.username || '').toLowerCase() === email || String(u.email || '').toLowerCase() === email;
  });
  if (!targetUser || targetUser.role !== 'guru' || !targetUser.guru_id) {
    return { success: false, error: 'Data belum terdaftar. Silakan hubungi Admin Ruang Ngaji.' };
  }

  const matched = verifyGuruIdentity_(kelompokId, nama, kelas);
  if (!matched || matched.id != targetUser.guru_id) {
    return { success: false, error: 'Data belum terdaftar. Silakan hubungi Admin Ruang Ngaji.' };
  }

  withScriptLock_(function () {
    updateRowByQuery(SHEET_NAMES.USERS, { id: targetUser.id }, {
      password_hash: hashPassword_(newPassword),
      updated_at: new Date().toISOString().split('T')[0],
    });
  });

  return { success: true, message: 'Password berhasil diubah. Silakan Masuk dengan password baru.' };
}

/**
 * Dipanggil dari halaman-halaman lain (setelah login) untuk verifikasi sesi
 * masih valid — dipakai client-side sebelum menampilkan dashboard.
 */
function serverGetSession(token) {
  const user = getCurrentUser(token);
  if (!user) {
    return { success: false, error: 'Sesi tidak valid atau kedaluwarsa. Silakan login kembali.' };
  }
  return { success: true, user: user };
}

/**
 * Dipanggil dari Index.html saat logout. `rememberToken` opsional — kalau
 * dikirim, baris remember_tokens terkait ikut dihapus (logout eksplisit
 * = benar-benar keluar, bukan cuma tutup tab).
 */
function serverLogout(token, rememberToken) {
  CacheService.getUserCache().remove('session_' + token);
  if (rememberToken) {
    const hashed = hashPassword_(rememberToken);
    withScriptLock_(function () {
      deleteRowByQuery(SHEET_NAMES.REMEMBER_TOKENS, { token_hash: hashed });
    });
  }
  return { success: true };
}