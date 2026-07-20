/**
 * Modul_FirestoreBridge.gs — Jembatan Apps Script ↔ Firestore REST API.
 *
 * Fase 2 dari migrasi Sheets→Firestore (lihat rencana migrasi). File ini BELUM
 * dipakai oleh alur aplikasi manapun — cuma menyiapkan alatnya. Tabel baru mulai
 * pakai Firestore setelah namanya ditambahkan ke `FIRESTORE_TABLES_` di
 * Modul_Utilities.gs.
 *
 * Autentikasi pakai service account (JWT hand-roll, RFC 7523) — sengaja TIDAK
 * pakai library komunitas pihak ketiga (FirestoreApp sudah lama tak di-maintain)
 * demi data produksi yang lebih bisa diaudit & dipercaya.
 *
 * Kredensial disimpan di Script Properties (Project Settings → Script Properties),
 * key: FIRESTORE_SERVICE_ACCOUNT_JSON — TIDAK PERNAH masuk git.
 */

/** Baca & parse kredensial service account dari Script Properties. */
function firestoreServiceAccount_() {
  const raw = PropertiesService.getScriptProperties().getProperty('FIRESTORE_SERVICE_ACCOUNT_JSON');
  if (!raw) {
    throw new Error('Script Property "FIRESTORE_SERVICE_ACCOUNT_JSON" belum diisi. Lihat Fase 0 rencana migrasi.');
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Isi Script Property "FIRESTORE_SERVICE_ACCOUNT_JSON" bukan JSON valid: ' + e.message);
  }
}

function firestoreBaseUrl_() {
  const sa = firestoreServiceAccount_();
  return 'https://firestore.googleapis.com/v1/projects/' + sa.project_id + '/databases/(default)/documents';
}

/** base64url encode tanpa padding '=' — Utilities.base64EncodeWebSafe masih menyisakan padding. */
function firestoreBase64Url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/**
 * Ambil access token OAuth2 (JWT-bearer flow, RFC 7523) untuk service account.
 * Di-cache 3300 detik (55 menit) — token asli berlaku 3600 detik, sisa 5 menit
 * jadi jeda aman supaya tidak ada request yang "kejepit" token baru kedaluwarsa.
 */
function firestoreGetAccessToken_() {
  const cached = cacheGet_('firestore_access_token');
  if (cached) return cached;

  const sa = firestoreServiceAccount_();
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = firestoreBase64Url_(Utilities.newBlob(JSON.stringify(header)).getBytes());
  const claimB64 = firestoreBase64Url_(Utilities.newBlob(JSON.stringify(claim)).getBytes());
  const unsigned = headerB64 + '.' + claimB64;
  const signatureBytes = Utilities.computeRsaSha256Signature(unsigned, sa.private_key);
  const jwt = unsigned + '.' + firestoreBase64Url_(signatureBytes);

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Gagal ambil access token Firestore: ' + resp.getContentText());
  }

  const token = JSON.parse(resp.getContentText()).access_token;
  cachePut_('firestore_access_token', token, 3300);
  return token;
}

/**
 * Request generik ke Firestore REST API.
 * @param {string} method - 'get' | 'post' | 'patch' | 'delete'
 * @param {string} path - path relatif dari base URL (mis. 'pengumuman' atau 'pengumuman/123')
 * @param {Object} [payload] - body JSON (opsional)
 * @param {string[]} [queryParams] - array potongan query string, mis. ['pageSize=300']
 */
function firestoreRequest_(method, path, payload, queryParams) {
  const token = firestoreGetAccessToken_();
  let url = firestoreBaseUrl_();
  if (path) url += '/' + path;
  if (queryParams && queryParams.length) url += '?' + queryParams.join('&');

  const options = {
    method: method,
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  const resp = UrlFetchApp.fetch(url, options);
  const code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    return { ok: false, code: code, body: resp.getContentText() };
  }
  const text = resp.getContentText();
  return { ok: true, code: code, body: text ? JSON.parse(text) : null };
}

/* ═════ Konversi nilai JS ↔ format typed-value Firestore ═════
   ATURAN PENTING: kolom tanggal/jam di aplikasi ini (tanggal, tanggal_lahir,
   jam_mulai, dst.) SELALU disimpan sebagai teks string, TIDAK PERNAH pakai
   timestampValue Firestore — supaya tidak mengulang bug lama "Sheets diam-diam
   ubah teks tanggal jadi objek Date". Aturan ini otomatis terpenuhi selama
   pemanggil sudah menormalkan tanggal jadi string SEBELUM sampai ke sini
   (sudah begitu adanya di seluruh codebase saat ini). */

function firestoreEncodeValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: String(v) };
}

function firestoreDecodeValue_(value) {
  if (!value) return null;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('stringValue' in value) return value.stringValue;
  return null; // nullValue atau tipe tak dikenal
}

function firestoreEncodeFields_(obj) {
  const fields = {};
  Object.keys(obj).forEach(function (k) { fields[k] = firestoreEncodeValue_(obj[k]); });
  return fields;
}

function firestoreDecodeFields_(fields) {
  const obj = {};
  if (!fields) return obj;
  Object.keys(fields).forEach(function (k) { obj[k] = firestoreDecodeValue_(fields[k]); });
  return obj;
}

/** Dokumen Firestore → object polos, bentuknya disamakan dengan readSheetAsObjects()
    (key huruf kecil, ada `id`) supaya pemanggil tidak perlu tahu bedanya. */
function firestoreDocToObject_(doc) {
  const obj = firestoreDecodeFields_(doc.fields);
  if (obj.id === undefined) {
    const parts = doc.name.split('/');
    obj.id = parts[parts.length - 1];
  }
  return obj;
}

/** GET satu dokumen. Return null kalau tidak ada (bukan error). */
function firestoreGetDoc_(collectionName, docId) {
  const res = firestoreRequest_('get', collectionName + '/' + encodeURIComponent(docId));
  if (!res.ok) {
    if (res.code === 404) return null;
    throw new Error('Gagal baca dokumen Firestore "' + collectionName + '/' + docId + '": ' + res.body);
  }
  return firestoreDocToObject_(res.body);
}

/** Baca SEMUA dokumen dalam 1 koleksi, loop tiap halaman sampai habis.
    WAJIB loop sampai nextPageToken habis — kalau tidak, generateId() di
    Modul_Utilities.gs bisa hasilkan id kembar untuk tabel yang datanya banyak. */
function firestoreListCollection_(collectionName) {
  const results = [];
  let pageToken = null;
  do {
    const params = ['pageSize=300'];
    if (pageToken) params.push('pageToken=' + encodeURIComponent(pageToken));
    const res = firestoreRequest_('get', collectionName, undefined, params);
    if (!res.ok) {
      // Koleksi belum pernah dibuat = Firestore balas 200 dgn body kosong biasanya,
      // tapi jaga-jaga kalau balas error lain, jangan ditelan diam-diam.
      throw new Error('Gagal baca koleksi Firestore "' + collectionName + '": ' + res.body);
    }
    const docs = (res.body && res.body.documents) || [];
    docs.forEach(function (d) { results.push(firestoreDocToObject_(d)); });
    pageToken = res.body && res.body.nextPageToken;
  } while (pageToken);
  return results;
}

/**
 * Buat dokumen baru dengan ID pilihan sendiri (bukan ID acak Firestore) —
 * dipakai supaya kolom `id` yang sudah ada di aplikasi tetap jadi ID dokumen,
 * jadi cari/update/hapus 1 baris langsung tanpa scan.
 * Kalau dokumen dgn id itu SUDAH ADA → tidak error, return {alreadyExists:true}
 * (dibutuhkan skrip salin data yang harus aman dijalankan berulang).
 */
function firestoreCreateDoc_(collectionName, docId, fieldsObj) {
  const res = firestoreRequest_('post', collectionName, { fields: firestoreEncodeFields_(fieldsObj) }, ['documentId=' + encodeURIComponent(docId)]);
  if (!res.ok) {
    if (res.code === 409) return { created: false, alreadyExists: true };
    throw new Error('Gagal buat dokumen Firestore "' + collectionName + '/' + docId + '": ' + res.body);
  }
  return { created: true, alreadyExists: false };
}

/**
 * Update SEBAGIAN field dokumen (partial update).
 * ⚠️ TITIK PALING KRITIS: Firestore PATCH tanpa `updateMask` akan MENIMPA
 * SELURUH dokumen (field yg tidak disebut ikut TERHAPUS). Mask dihitung
 * OTOMATIS di sini dari nama field yang dikirim, supaya pemanggil tidak
 * mungkin lupa — jangan pernah panggil firestoreRequest_ PATCH manual tanpa ini.
 */
function firestoreUpdateDoc_(collectionName, docId, fieldsObj) {
  const mask = Object.keys(fieldsObj).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); });
  const res = firestoreRequest_('patch', collectionName + '/' + encodeURIComponent(docId), { fields: firestoreEncodeFields_(fieldsObj) }, mask);
  if (!res.ok) {
    throw new Error('Gagal update dokumen Firestore "' + collectionName + '/' + docId + '": ' + res.body);
  }
  return true;
}

/** Hapus dokumen. Idempotent — hapus dokumen yg sudah tidak ada tidak dianggap error
    (samakan perilaku dengan deleteRowByQuery() versi Sheets). */
function firestoreDeleteDoc_(collectionName, docId) {
  const res = firestoreRequest_('delete', collectionName + '/' + encodeURIComponent(docId));
  if (!res.ok && res.code !== 404) {
    throw new Error('Gagal hapus dokumen Firestore "' + collectionName + '/' + docId + '": ' + res.body);
  }
  return true;
}

/**
 * Ubah array posisi (persis seperti yang dikirim ke appendRowToSheet) jadi object
 * {namaKolom: nilai} — pakai baris header (row 1) Sheet yang bersangkutan sebagai
 * acuan urutan kolom. Sheet TIDAK dihapus setelah tabelnya pindah ke Firestore,
 * jadi baris header ini tetap jadi "kamus skema" yang selalu update mengikuti
 * Setup_Database.gs — tidak perlu daftar skema kedua yang terpisah & bisa basi.
 */
function firestoreFieldsFromRowArray_(sheetName, values) {
  const sheet = getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet "' + sheetName + '" tidak ditemukan (dipakai sbg acuan skema Firestore).');
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim().toLowerCase(); });
  const obj = {};
  headers.forEach(function (h, i) { obj[h] = values[i] !== undefined ? values[i] : ''; });
  return obj;
}

/**
 * Tes menyeluruh jembatan Firestore — jalankan MANUAL dari Apps Script editor
 * (pilih fungsi ini di dropdown, klik Run) SETELAH Fase 0 selesai (Script
 * Property FIRESTORE_SERVICE_ACCOUNT_JSON sudah diisi). TIDAK menyentuh data
 * aplikasi asli — cuma baca/tulis 1 dokumen percobaan di koleksi "_bridge_test".
 * Lihat hasilnya di menu "Executions" / Logger setelah selesai jalan.
 */
function testFirestoreBridge_() {
  const testId = 'test_' + new Date().getTime();
  const collection = '_bridge_test';

  Logger.log('1) Create dokumen percobaan...');
  const created = firestoreCreateDoc_(collection, testId, { id: testId, pesan: 'halo dari Apps Script', angka: 42, aktif: true });
  Logger.log(JSON.stringify(created));
  if (!created.created) throw new Error('GAGAL: create tidak berhasil.');

  Logger.log('2) Baca dokumen...');
  const doc = firestoreGetDoc_(collection, testId);
  Logger.log(JSON.stringify(doc));
  if (!doc || doc.pesan !== 'halo dari Apps Script' || doc.angka !== 42 || doc.aktif !== true) {
    throw new Error('GAGAL: data yang dibaca kembali tidak cocok dengan yang ditulis.');
  }

  Logger.log('3) List koleksi...');
  const list = firestoreListCollection_(collection);
  Logger.log('jumlah dokumen di "_bridge_test": ' + list.length);

  Logger.log('4) Update sebagian (cuma field "pesan")...');
  firestoreUpdateDoc_(collection, testId, { pesan: 'sudah diupdate' });
  const afterUpdate = firestoreGetDoc_(collection, testId);
  Logger.log(JSON.stringify(afterUpdate));
  if (afterUpdate.angka !== 42) {
    throw new Error('GAGAL KRITIS: field "angka" hilang setelah partial update — updateMask TIDAK berfungsi!');
  }
  if (afterUpdate.pesan !== 'sudah diupdate') {
    throw new Error('GAGAL: field "pesan" tidak berubah setelah update.');
  }

  Logger.log('5) Delete dokumen percobaan...');
  firestoreDeleteDoc_(collection, testId);
  const afterDelete = firestoreGetDoc_(collection, testId);
  if (afterDelete !== null) throw new Error('GAGAL: dokumen masih ada setelah delete.');

  Logger.log('✅ SEMUA TES JEMBATAN FIRESTORE LOLOS. Aman lanjut ke Fase 3.');
}
