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
const DEV_MODE_SKIP_LOGIN = true;

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

  // ?diag=migrate&table=<nama>&mode=copy (default: dryrun kalau mode selain 'copy')
  // → salin data 1 tabel dari Sheet ke Firestore (Modul_FirestoreMigration.gs),
  // dipakai sekali per tabel saat migrasi Fase 3+. Whitelist demi jaga-jaga
  // supaya tidak ada nama sheet salah ketik ikut ter-trigger dari URL.
  if (e && e.parameter && e.parameter.diag === 'migrate') {
    const allowedTables = ['pengumuman'];
    const table = e.parameter.table;
    let result;
    if (allowedTables.indexOf(table) === -1) {
      result = { success: false, error: 'Tabel "' + table + '" belum diizinkan untuk migrasi diagnostik ini.' };
    } else {
      const dryRun = e.parameter.mode !== 'copy';
      try {
        result = { success: true, dryRun: dryRun, report: migrateTableToFirestore_(table, dryRun) };
      } catch (err) {
        result = { success: false, error: err.message };
      }
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ?diag=pilottest&table=pengumuman → jalankan tes CRUD end-to-end lewat
  // fungsi aplikasi SESUNGGUHNYA (bukan cuma jembatan level-rendah), dipakai
  // SETELAH tabel dimasukkan ke FIRESTORE_TABLES_ (Fase 3). Membuat & hapus
  // 1 data percobaan, tidak meninggalkan sampah walau tesnya gagal di tengah.
  if (e && e.parameter && e.parameter.diag === 'pilottest' && e.parameter.table === 'pengumuman') {
    let result;
    try {
      result = testPengumumanFirestorePilot_();
    } catch (err) {
      result = { success: false, error: err.message };
    }
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Ruang Ngaji')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
 * Mengembalikan { success, token, user } atau { success:false, error }.
 */
function serverLogin(username, password) {
  const users = readSheetAsObjects(SHEET_NAMES.USERS);
  const found = users.find((u) => u.username === username);

  if (!found) {
    return { success: false, error: 'Username atau password salah.' };
  }

  const hashed = hashPassword_(password);
  if (hashed !== found.passwordHash) {
    return { success: false, error: 'Username atau password salah.' };
  }

  // Buat token sesi sederhana, simpan di cache 6 jam
  const token = Utilities.getUuid();
  const sessionData = {
    id: found.id,
    nama: found.nama,
    role: found.role,
    scopeType: found.scopeType,
    scopeId: found.scopeId,
  };
  CacheService.getUserCache().put('session_' + token, JSON.stringify(sessionData), 21600); // 6 jam

  return { success: true, token: token, user: sessionData };
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
 * Dipanggil dari Index.html saat logout.
 */
function serverLogout(token) {
  CacheService.getUserCache().remove('session_' + token);
  return { success: true };
}