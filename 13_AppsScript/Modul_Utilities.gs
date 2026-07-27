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
  absensi: [], // Kelp Petemon — MASIH KOSONG, tunggu data disalin (lihat migrateAbsensiKelompokToFirestore_)
};

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
 */
function readSheetAsObjects(sheetName) {
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
      readSheetAsObjects(SHEET_NAMES.SANTRI).forEach(function (s) {
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
 * Jalankan fungsi mutasi di dalam ScriptLock (antri maks 10 detik).
 * WAJIB membungkus SEMUA operasi tulis (add/update/delete) supaya aman
 * dipakai banyak pengguna bersamaan. Mencegah: (a) id ganda dari generateId,
 * (b) salah-baris pada delete/update karena index baris bergeser saat
 * pengguna lain menghapus di waktu yang sama. (ERROR_LOG.md #5)
 */
function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('Sistem sedang sibuk (banyak yang menyimpan bersamaan). Silakan coba lagi.');
  }
  try {
    return fn();
  } finally {
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
