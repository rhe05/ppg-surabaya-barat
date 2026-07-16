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
  AUDIT_LOG: 'audit_log',
};

/**
 * Ambil sheet dari nama. Return object sheet atau null jika tidak ditemukan.
 */
function getSheetByName(sheetName) {
  const sheet = SS.getSheetByName(sheetName);
  return sheet || null;
}

/**
 * Baca sheet dan kembalikan sebagai array of objects (row 1 = headers).
 * Contoh: readSheetAsObjects('desa') → [{id: 1, ppg_id: 1, nama: 'Petemon'}, ...]
 */
function readSheetAsObjects(sheetName) {
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
  const index = objects.findIndex(obj => {
    return Object.keys(query).every(key => obj[key] === query[key]);
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
 */
function generateId(sheetName) {
  const objects = readSheetAsObjects(sheetName);
  if (objects.length === 0) return 1;
  const maxId = Math.max(...objects.map(obj => parseInt(obj.id) || 0));
  return maxId + 1;
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
