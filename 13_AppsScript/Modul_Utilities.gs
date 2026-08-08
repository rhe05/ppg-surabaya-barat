/**
 * Modul_Utilities.gs — Helper functions untuk database operations
 * Read/Write sheets sebagai array of objects, session validation, etc.
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();

/**
 * Definisi sheet names (HARUS match dengan sheet yang ada di Spreadsheet).
 * Digunakan di semua modul untuk referensi sheet.
 */
const SHEET_NAMES = {
  PPG: 'ppg',
  DESA: 'desa',
  KELOMPOK: 'kelompok',
  USERS: 'users',
  SANTRI: 'santri',
  GURU: 'guru',
  RIWAYAT_JENJANG: 'riwayat_jenjang',
  ABSENSI: 'absensi',
  MUNAQOSAH: 'munaqosah',
  PERIODE_MUNAQOSAH: 'periode_munaqosah',
  KONSELING: 'konseling',
  KURIKULUM_AKHLAQ: 'kurikulum_akhlaq',
  CALENDAR_EVENTS: 'calendar_events',
  FILES: 'files',
  AUDIT_LOG: 'audit_log',
  JADWAL_KBM: 'jadwal_kbm',
  PENGUMUMAN: 'pengumuman',
  JADWAL_KATEGORI_HARI: 'jadwal_kategori_hari',
  SIKLUS_GENERUS: 'siklus_generus',
  PENGURUS_KELP: 'pengurus_kelp',
  AKSES_KELAS_REQUEST: 'akses_kelas_request',
  GURU_IZIN: 'guru_izin',
  QUOTE_HARIAN: 'quote_harian',
};

/**
 * Saklar migrasi Sheets→Firestore (per tabel), UNTUK MODEL FLAT/MIRROR SAJA.
 * Nama sheet yang ADA di daftar ini otomatis dibaca/ditulis lewat Firestore
 * collection top-level (Modul_FirestoreBridge.gs) oleh readSheetAsObjects/
 * appendRowToSheet/updateRowByQuery/deleteRowByQuery di bawah — sheet aslinya
 * TIDAK dihapus, tetap ada sbg "foto terakhir" kalau perlu dibandingkan/rollback.
 *
 * ⚠️ Cocok HANYA untuk tabel yang memang PPG-wide/tidak terikat 1 kelompok
 * (mis. ppg/desa/kelompok/users/audit_log/files/periode_munaqosah — lihat
 * rencana migrasi bagian arsitektur Firestore). Tabel yang terikat 1 kelompok
 * (santri, guru, absensi, pengumuman, dst.) PAKAI STRUKTUR BERSARANG
 * /kelompok/{kelompokId}/{tabel}/{id} — modulnya masing-masing manggil
 * Modul_FirestoreBridge.gs LANGSUNG dgn path lengkap (lihat contoh di
 * Modul_MaintainPengumuman.gs), BUKAN lewat saklar generik ini.
 *
 * Selama daftar ini KOSONG, tidak ada tabel yang berubah perilakunya lewat
 * mekanisme ini — 100% masih baca/tulis Sheets utk tabel yg belum eksplisit
 * ditulis ulang modulnya (spt pengumuman).
 */
const FIRESTORE_TABLES_ = [];

/**
 * Saklar migrasi Sheets→Firestore PER-KELOMPOK (rollout bertahap, mis. Kelp
 * Petemon dulu sebelum kelompok lain ikut) — SUMBER KEBENARAN TUNGGAL, dipakai
 * baik oleh readSheetAsObjects() di sini (baca gabungan) MAUPUN oleh
 * Modul_MaintainSantri.gs/Modul_MaintainGuru.gs (tulis) lewat
 * isKelompokTableOnFirestore_() di bawah — supaya tidak ada 2 daftar terpisah
 * yang bisa tidak sinkron.
 *
 * Key: nama tabel (SHEET_NAMES value). Value: array kelompok_id (string) yang
 * SUDAH pindah ke /kelompok/{id}/{tabel}. Kelompok yang TIDAK ada di daftar
 * tetap 100% dibaca/ditulis dari Sheets.
 */
const FIRESTORE_KELOMPOK_TABLES_ = {
  santri: ['1'], // Kelp Petemon
  guru: ['1'], // Kelp Petemon
  jadwal_kbm: ['1'], // Kelp Petemon — data lama sudah disalin (7 sesi, 0 error)
  jadwal_kategori_hari: ['1'], // Kelp Petemon — data lama sudah disalin (4 baris, 0 error)
  absensi: ['1'], // Kelp Petemon — data lama sudah disalin (7 baris, 0 error, 2026-07-28)
};

/**
 * Kunci CacheService (ScriptCache, dibagi SEMUA eksekusi/pengguna) utk
 * tabel MASTER/REFERENSI per-kelompok yang dibaca lewat iaReadKelompokTable_/
 * iaReadKelompokTablesParallel_ (Modul_InputAbsen.gs) — dipakai 20+ fungsi
 * mobile guru (Dashboard/Kelas/Riwayat/Jurnal/Laporan) yang sebelumnya SELALU
 * baca Firestore fresh tiap panggilan, walau datanya jarang berubah dalam
 * hitungan menit (analisis performa 2026-08-06, setelah kuota Firestore
 * harian habis). `santri`/`guru` SENGAJA pakai key yang SAMA dgn cache lama
 * di Modul_MaintainSantri.gs/Modul_MaintainGuru.gs (`santri_k<id>`/
 * `guru_k<id>`) supaya invalidasi yang sudah ada di situ (tiap Add/Update/
 * Delete/BulkImport) otomatis ikut membersihkan cache di sini juga — TIDAK
 * ADA 2 cache terpisah yang bisa tidak sinkron. `absensi` SENGAJA TIDAK ada
 * di sini — data transaksional yang ditulis tiap hari, guru mengharapkan
 * Dashboard langsung update setelah Simpan (lihat ERROR_LOG.md #30), risiko
 * data "telat muncul" lebih besar dari manfaat cache-nya; query absensi
 * sendiri sudah di-scope tanggal (opsi B, 2026-08-05) jadi biayanya sudah
 * rendah tanpa cache.
 */
const IA_KELOMPOK_TABLE_CACHE_KEY_ = {
  santri: function (kelompokId) { return 'santri_k' + kelompokId; },
  guru: function (kelompokId) { return 'guru_k' + kelompokId; },
  jadwal_kbm: function (kelompokId) { return 'jadwalkbm_k' + kelompokId; },
  jadwal_kategori_hari: function (kelompokId) { return 'jadwalkategorihari_k' + kelompokId; },
};

/** TTL cache tabel master (detik) — samakan dgn cache santri/guru lama. */
const IA_KELOMPOK_TABLE_CACHE_TTL_ = 300;

/** Simpan hasil baca 1 tabel master ke cache, kalau tabel itu ada di daftar
    IA_KELOMPOK_TABLE_CACHE_KEY_ (no-op kalau tidak, mis. absensi). */
function iaKelompokTableCachePut_(sheetName, kelompokId, rows) {
  const keyFn = IA_KELOMPOK_TABLE_CACHE_KEY_[sheetName];
  if (keyFn) cachePut_(keyFn(kelompokId), rows, IA_KELOMPOK_TABLE_CACHE_TTL_);
}

function isKelompokTableOnFirestore_(tableName, kelompokId) {
  const list = FIRESTORE_KELOMPOK_TABLES_[tableName];
  return !!list && list.indexOf(String(kelompokId)) !== -1;
}

/**
 * Ambil sheet dari nama. Return object sheet atau null jika tidak ditemukan.
 */
function getSheetByName(sheetName) {
  const sheet = SS.getSheetByName(sheetName);
  return sheet || null;
}

/** Baca sheet APA ADANYA (tanpa cek saklar Firestore apapun) — dipakai
    readSheetAsObjects() di bawah, dipisah supaya bisa dipanggil ulang saat
    perlu "cuma baris Sheet" tanpa menyebabkan pemanggilan berulang tak
    berujung saat digabung dengan data Firestore. */
function readSheetRowsRaw_(sheetName) {
  const sheet = getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  }

  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];

  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const rows = data.slice(1);

  return rows
    .filter(row => row.some(cell => cell !== null && cell !== '')) // skip baris kosong
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] !== undefined ? row[i] : null;
      });
      return obj;
    });
}

/**
 * Baca sheet dan kembalikan sebagai array of objects (row 1 = headers).
 * Contoh: readSheetAsObjects('desa') → [{id: 1, ppg_id: 1, nama: 'Petemon'}, ...]
 *
 * Kalau `sheetName` ada di FIRESTORE_KELOMPOK_TABLES_ (mis. 'santri'/'guru'),
 * hasilnya OTOMATIS gabungan: baris Sheet utk kelompok yang BELUM pindah +
 * baris Firestore utk kelompok yang SUDAH pindah — supaya SEMUA pemanggil
 * yang sudah ada (Laporan, Statistik, Dashboard, Absensi, dst — 40+ titik)
 * tetap dapat data lengkap & benar TANPA perlu diubah satu-satu.
 *
 * @param {Array} [preloadedSantriForAbsensi] - HANYA dipakai kalau sheetName
 *   === SHEET_NAMES.ABSENSI: kalau pemanggil SUDAH punya hasil
 *   readSheetAsObjects(SANTRI) di scope yang sama, kirim di sini supaya
 *   fungsi ini TIDAK baca ulang tabel santri PENUH cuma utk bikin peta
 *   join santri_id→kelompok_id (nested read tersembunyi, audit performa
 *   2026-08-07, Sprint 3). Opsional — kalau tidak dikirim, perilaku PERSIS
 *   seperti sebelumnya (baca santri sendiri).
 */
function readSheetAsObjects(sheetName, preloadedSantriForAbsensi) {
  if (FIRESTORE_TABLES_.indexOf(sheetName) !== -1) {
    return firestoreListCollection_(sheetName);
  }

  const kelompokFirestoreList = FIRESTORE_KELOMPOK_TABLES_[sheetName];
  if (kelompokFirestoreList && kelompokFirestoreList.length > 0) {
    let sheetRows = readSheetRowsRaw_(sheetName);
    if (sheetName === SHEET_NAMES.ABSENSI) {
      // absensi TIDAK punya kolom kelompok_id sendiri — kelompok ditentukan
      // lewat join ke santri_id, jadi filter exclude-nya harus lewat peta ini,
      // bukan row.kelompok_id langsung (selalu undefined utk tabel ini).
      const santriKelompokMap_ = {};
      (preloadedSantriForAbsensi || readSheetAsObjects(SHEET_NAMES.SANTRI)).forEach(function (s) {
        santriKelompokMap_[s.id] = String(s.kelompok_id);
      });
      sheetRows = sheetRows.filter(row => kelompokFirestoreList.indexOf(santriKelompokMap_[row.santri_id]) === -1);
    } else {
      sheetRows = sheetRows.filter(row => kelompokFirestoreList.indexOf(String(row.kelompok_id)) === -1);
    }
    let firestoreRows = [];
    kelompokFirestoreList.forEach(function (kelompokId) {
      firestoreRows = firestoreRows.concat(firestoreListCollection_('kelompok/' + kelompokId + '/' + sheetName));
    });
    return sheetRows.concat(firestoreRows);
  }

  return readSheetRowsRaw_(sheetName);
}

/**
 * Tulis array of objects ke sheet (menimpa semua konten existing).
 * Contoh: writeSheetFromObjects('desa', [{id: 1, ppg_id: 1, nama: 'Petemon'}, ...])
 *
 * ⚠️ Menimpa semua data. Gunakan untuk initial seed atau refresh total.
 * Untuk update single row, gunakan updateSheetRow() atau updateSheetByQuery().
 */
function writeSheetFromObjects(sheetName, objects) {
  const sheet = getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  }

  if (objects.length === 0) {
    console.warn(`writeSheetFromObjects: array kosong untuk sheet "${sheetName}". Sheet tidak diubah.`);
    return;
  }

  // Ambil headers dari object pertama
  const headers = Object.keys(objects[0]);
  const rows = objects.map(obj => headers.map(h => obj[h] || ''));

  // Bersihkan sheet (kecuali header)
  const maxRows = sheet.getMaxRows();
  if (maxRows > 1) {
    sheet.deleteRows(2, maxRows - 1);
  }

  // Tulis header + data
  sheet.appendRow(headers);
  rows.forEach(row => sheet.appendRow(row));

  console.log(`✓ ${objects.length} baris ditulis ke sheet "${sheetName}".`);
}

/**
 * Tambah satu row ke sheet. Kembalikan row number yang ditambahkan.
 */
function appendRowToSheet(sheetName, values) {
  if (FIRESTORE_TABLES_.indexOf(sheetName) !== -1) {
    const fields = firestoreFieldsFromRowArray_(sheetName, values);
    firestoreCreateDoc_(sheetName, String(fields.id), fields);
    return null; // tidak ada pemanggil di codebase ini yang memakai return value-nya
  }

  const sheet = getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  }
  sheet.appendRow(values);
  return sheet.getLastRow();
}

/**
 * Update satu cell di sheet (1-indexed).
 */
function updateCell(sheetName, row, col, value) {
  const sheet = getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  }
  sheet.getRange(row, col).setValue(value);
}

/**
 * Cari baris pertama di sheet yang match kondisi (object key-value).
 * Contoh: findRow('kelompok', {id: 5}) → returns baris index (1-based) atau -1 jika tidak ada.
 *
 * ⚠️ Pencarian case-sensitive. Untuk kriteria complex, gunakan readSheetAsObjects() + filter.
 */
function findRowByQuery(sheetName, query) {
  const objects = readSheetAsObjects(sheetName);
  // Perbandingan via String() — id dari client (onclick HTML) selalu string,
  // sedangkan kolom id di sheet numerik. Strict === di sini pernah menyebabkan
  // update/delete diam-diam gagal (ERROR_LOG.md #2). JANGAN kembalikan ke ===.
  const index = objects.findIndex(obj => {
    return Object.keys(query).every(key => String(obj[key]) === String(query[key]));
  });
  return index === -1 ? -1 : index + 2; // +2 karena row 1 = header, data dimulai row 2
}

/**
 * Update satu baris di sheet berdasarkan query match.
 * Contoh: updateRowByQuery('kelompok', {id: 5}, {status_aktif: 'aktif'})
 *
 * ⚠️ Update hanya baris pertama yang match. Jika ada multiple matches, gunakan perulangan manual.
 */
function updateRowByQuery(sheetName, query, updates) {
  if (FIRESTORE_TABLES_.indexOf(sheetName) !== -1) {
    const keys = Object.keys(query);
    if (keys.length !== 1 || keys[0] !== 'id') {
      throw new Error(`updateRowByQuery via Firestore hanya mendukung query {id: ...} saat ini (sheet: "${sheetName}").`);
    }
    firestoreUpdateDoc_(sheetName, String(query.id), updates);
    return;
  }

  const rowNum = findRowByQuery(sheetName, query);
  if (rowNum === -1) {
    throw new Error(`Row tidak ditemukan di sheet "${sheetName}" dengan query: ${JSON.stringify(query)}`);
  }

  const sheet = getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  Object.keys(updates).forEach(key => {
    const colIndex = headers.findIndex(h => h.toLowerCase() === key.toLowerCase());
    if (colIndex !== -1) {
      sheet.getRange(rowNum, colIndex + 1).setValue(updates[key]);
    }
  });

  console.log(`✓ Row ${rowNum} di sheet "${sheetName}" diupdate.`);
}

/**
 * Hapus baris pertama yang match query.
 * ⚠️ Hanya untuk delete single row. Jika perlu bulk delete, gunakan loop + rewrite.
 */
function deleteRowByQuery(sheetName, query) {
  if (FIRESTORE_TABLES_.indexOf(sheetName) !== -1) {
    const keys = Object.keys(query);
    if (keys.length !== 1 || keys[0] !== 'id') {
      throw new Error(`deleteRowByQuery via Firestore hanya mendukung query {id: ...} saat ini (sheet: "${sheetName}").`);
    }
    firestoreDeleteDoc_(sheetName, String(query.id));
    return;
  }

  const rowNum = findRowByQuery(sheetName, query);
  if (rowNum === -1) {
    console.warn(`Row tidak ditemukan. Tidak ada yang dihapus.`);
    return;
  }
  const sheet = getSheetByName(sheetName);
  sheet.deleteRow(rowNum);
  console.log(`✓ Row ${rowNum} di sheet "${sheetName}" dihapus.`);
}

/**
 * Ambil user dari session token (cache-based).
 * Dipanggil oleh funcsi di Code.gs untuk validasi sesi.
 */
function getCurrentUser(token) {
  const cached = CacheService.getUserCache().get('session_' + token);
  if (!cached) return null;
  try {
    return JSON.parse(cached);
  } catch (e) {
    return null;
  }
}

/**
 * Validasi apakah token valid dan punya akses ke resource (polimorfik: kelompok/desa/ppg).
 * Contoh: validateUserAccess(token, 'kelompok', 5) → user bisa akses Kelompok ID 5?
 *
 * ⚠️ Implementasi RBAC sederhana. Untuk kontrol fine-grained, perluas di sini.
 */
function validateUserAccess(token, resourceType, resourceId) {
  const user = getCurrentUser(token);
  if (!user) return false;

  // Admin PPG bisa akses semua
  if (user.role === 'admin_ppg') return true;

  // Admin Desa bisa akses Kelompok di Desanya
  if (user.role === 'admin_desa' && user.scopeType === 'desa') {
    if (resourceType === 'desa') return user.scopeId === resourceId;
    if (resourceType === 'kelompok') {
      const kelompok = readSheetAsObjects(SHEET_NAMES.KELOMPOK).find(k => k.id === resourceId);
      return kelompok && kelompok.desa_id === user.scopeId;
    }
  }

  // Admin Kelompok bisa akses Kelompoknya sendiri saja
  if (user.role === 'admin_kelompok' && user.scopeType === 'kelompok') {
    return resourceType === 'kelompok' && user.scopeId === resourceId;
  }

  // Admin Kelp (akun mobile self-register, lihat serverCompleteOnboardingAdminKelompok
  // di Code.js) — akses Kelompoknya sendiri saja, sama seperti admin_kelompok.
  if (user.role === 'admin_kelp' && user.scopeType === 'kelompok') {
    return resourceType === 'kelompok' && user.scopeId === resourceId;
  }

  // Guru bisa akses Kelompoknya sendiri saja (dipakai fitur mobile Input
  // Absen > Laporan > Unduh PDF, reuse serverGetLaporanPerkembanganSantri)
  if (user.role === 'guru' && user.scopeType === 'kelompok') {
    return resourceType === 'kelompok' && user.scopeId === resourceId;
  }

  return false;
}

/**
 * Generate ID otomatis (integer) untuk entitas baru.
 * Cari MAX(id) di sheet, return max + 1.
 *
 * ⚠️ WAJIB dipanggil DI DALAM withScriptLock_() bersama appendRow-nya —
 * tanpa lock, dua pengguna yang menyimpan bersamaan mendapat id yang sama
 * (ERROR_LOG.md #5).
 */
function generateId(sheetName) {
  const objects = readSheetAsObjects(sheetName);
  if (objects.length === 0) return 1;
  const maxId = Math.max(...objects.map(obj => parseInt(obj.id) || 0));
  return maxId + 1;
}

/**
 * Normalkan kolom tanggal 'yyyy-MM-dd' yang diam-diam diubah Sheets jadi
 * objek `Date` saat ditulis lewat appendRow (ERROR_LOG.md #7). WAJIB dipakai
 * sebelum membandingkan tanggal dari readSheetAsObjects() dgn string
 * (`===`, sort, dsb) — kalau tidak, perbandingan SELALU false walau
 * nilainya sama secara kalender.
 */
function tanggalKeString_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return v ? String(v) : '';
}

/**
 * String 'yyyy-MM-dd' tanggal TERAKHIR di satu bulan (dipakai batas atas
 * filter rentang bulanan, mis. Kehadiran Generus). SENGAJA tidak lewat
 * `new Date(year, month, 0).toISOString()` -- toISOString() konversi ke UTC,
 * jadi di timezone WIB (UTC+7) tanggal 1 (mis. "2026-07-31" jam 00:00 lokal)
 * mundur jadi "2026-07-30" saat di-ISO-kan, diam-diam MEMBUANG seluruh data
 * hari terakhir bulan itu dari perbandingan `tgl <= monthEnd`. Ditemukan saat
 * investigasi laporan guru "sudah input absen tapi tidak muncul di Dashboard/
 * Riwayat Kehadiran" -- kelas yang HANYA punya catatan di tanggal 31 hilang
 * total dari Kehadiran Generus (2026-08-05).
 */
function bulanTerakhirStr_(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/**
 * ID dokumen Firestore utk 1 baris absensi = deterministik dari tanggal +
 * santri_id (BUKAN integer sekuensial) -- satu santri cuma bisa punya 1
 * status per hari, jadi key ini alami unik. Dipakai supaya simpan/edit
 * absensi TIDAK PERNAH perlu baca seluruh koleksi dulu (cuma utk cari id
 * berikutnya atau cari dokumen mana yang mau ditimpa) -- lihat analisis
 * performa 2026-08-05 (opsi A: hilangkan full-collection read di jalur
 * tulis absensi Firestore).
 */
function absensiDocId_(tanggal, santriId) {
  return tanggal + '_' + santriId;
}

/**
 * Jalankan fungsi mutasi di dalam ScriptLock (antri maks 10 detik).
 * WAJIB membungkus SEMUA operasi tulis (add/update/delete) supaya aman
 * dipakai banyak pengguna bersamaan. Mencegah: (a) id ganda dari generateId,
 * (b) salah-baris pada delete/update karena index baris bergeser saat
 * pengguna lain menghapus di waktu yang sama. (ERROR_LOG.md #5)
 */
/**
 * ⚠️ TEMPORARY (2026-08-08, lihat Modul_PerfAudit.gs): param `perfObj` opsional
 * ditambah HANYA utk instrumentasi ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md
 * — additive & backward-compatible (semua pemanggil lama tetap kirim 1 arg,
 * perilaku lock sama sekali tidak berubah). Kalau `perfObj` diisi, diisi
 * `lockWaitMs` (waktu tryLock menunggu) & `lockHeldMs` (waktu fn() jalan di
 * dalam lock). REVERT: hapus parameter kedua + 2 baris `if (perfObj)` di
 * bawah, kembalikan ke bentuk aslinya `function withScriptLock_(fn) { ... }`.
 */
function withScriptLock_(fn, perfObj) {
  const lock = LockService.getScriptLock();
  const _perfLockT0 = Date.now();
  if (!lock.tryLock(10000)) {
    throw new Error('Sistem sedang sibuk (banyak yang menyimpan bersamaan). Silakan coba lagi.');
  }
  if (perfObj) perfObj.lockWaitMs = Date.now() - _perfLockT0;
  const _perfLockT1 = Date.now();
  try {
    return fn();
  } finally {
    if (perfObj) perfObj.lockHeldMs = Date.now() - _perfLockT1;
    lock.releaseLock();
  }
}

/**
 * Cache helpers (ScriptCache) — mempercepat baca daftar yang sering diakses.
 * Kunci yang dipakai saat ini: 'guru_k<kelompokId>' dan 'santri_k<kelompokId>'.
 * SEMUA mutasi pada sheet terkait WAJIB memanggil cacheDrop_ kunci tersebut.
 * Gagal cache (data >100KB / error) tidak fatal — jatuh ke baca sheet biasa.
 */
function cacheGet_(key) {
  try {
    const v = CacheService.getScriptCache().get(key);
    return v ? JSON.parse(v) : null;
  } catch (e) { return null; }
}

function cachePut_(key, value, seconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), seconds || 300);
  } catch (e) { /* data terlalu besar / cache error — abaikan */ }
}

function cacheDrop_(key) {
  try { CacheService.getScriptCache().remove(key); } catch (e) { /* abaikan */ }
}


/**
 * Convert object ke array values berdasarkan header sheet.
 * Digunakan untuk append row dengan struktur yang benar.
 */
function objectToRowArray(sheetName, obj) {
  const sheet = getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.map(h => obj[h.toLowerCase()] || '');
}

/**
 * Diagnostik skema: daftar semua sheet + baris header + jumlah baris data.
 * Dipakai lewat doGet(?diag=schema) oleh tools/check_schema.js agar status
 * setupDatabaseStructure() bisa diverifikasi tanpa membuka Sheet manual.
 */
function diagSchema_() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets().map(function (sh) {
      const lastCol = sh.getLastColumn();
      const lastRow = sh.getLastRow();
      return {
        nama: sh.getName(),
        header: lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [],
        barisData: Math.max(0, lastRow - 1),
      };
    });
    return { success: true, spreadsheet: ss.getName(), sheets: sheets };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Diagnostik isi baris: kembalikan nilai + TIPE tiap kolom untuk beberapa baris awal.
 * Tipe penting karena Google Sheets diam-diam mengubah teks 'yyyy-MM-dd' / 'HH:mm'
 * menjadi objek Date, yang bisa membuat data gagal dikirim ke klien.
 * Dipakai lewat doGet(?diag=rows&sheet=...&limit=...).
 */
function diagRows_(sheetName, limit) {
  try {
    const n = Math.min(parseInt(limit, 10) || 5, 50);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) return { success: false, error: 'Sheet "' + sheetName + '" tidak ditemukan.' };

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { success: true, sheet: sheetName, header: [], rows: [] };

    const header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const values = sheet.getRange(2, 1, Math.min(n, lastRow - 1), lastCol).getValues();

    const rows = values.map(function (row) {
      const obj = {};
      header.forEach(function (h, i) {
        const v = row[i];
        obj[h] = {
          nilai: (v instanceof Date) ? v.toISOString() : v,
          tipe: (v instanceof Date) ? 'Date' : typeof v,
        };
      });
      return obj;
    });

    return { success: true, sheet: sheetName, header: header, rows: rows };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
