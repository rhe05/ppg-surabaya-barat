/**
 * Modul_InputAbsen.gs — Input Absen khusus role='guru'.
 *
 * Setiap akun role='guru' terhubung ke satu baris di sheet 'guru' lewat
 * users.guru_id (lihat Modul_UserManagement.gs → serverGetGuruOptionsForUser,
 * Code.js → serverLogin menaruh guru_id di session sbg user.guruId).
 *
 * "Kelas" seorang guru = nilai jadwal_kbm.kelas pada baris jadwal_kbm milik
 * guru itu (guru_id cocok, status='Aktif') — pola yang sama dipakai fitur
 * "Kelas Pengajian" (Modul_MaintainJadwalKBM.gs). Santri anggota kelas itu
 * dicocokkan lewat santri.kelas_ngaji (free-text, case-insensitive), sama
 * seperti Script_Main.html baris ~3040 (filterSantriByKelas_ pattern).
 *
 * Izin akses kelas lain: guru pemilik kelas ("owner") harus approve dulu
 * lewat sheet 'akses_kelas_request' sebelum guru lain bisa input absen
 * kelas itu — akses berlaku HANYA untuk tanggal yang diminta (bukan permanen).
 */

/**
 * Validasi token adalah guru yang punya guru_id terhubung, kembalikan
 * {user, kelompokId} atau {success:false, error} kalau tidak valid.
 * WAJIB dipanggil di awal semua fungsi Input Absen.
 */
function requireGuruContext_(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (user.role !== 'guru') return { success: false, error: 'Fitur ini khusus akun Guru.' };
  if (!user.guruId) return { success: false, error: 'Akun ini belum terhubung ke data Guru. Hubungi Admin Kelompok.' };
  return { success: true, user: user, kelompokId: user.scopeId };
}

/**
 * Baca 1 tabel yang di-scope per Kelompok (santri/guru/jadwal_kbm) — jauh
 * lebih cepat dari readSheetAsObjects() generik utk kasus Input Absen, yang
 * SELALU langsung butuh data 1 kelompok saja. readSheetAsObjects() generik
 * WAJIB baca Sheets PENUH (semua kelompok) + Firestore (kelompok yg sudah
 * migrasi) supaya benar utk 40+ pemanggil lain di app ini — tapi utk 1
 * kelompok spesifik itu kerja 2x lipat yang sia-sia (baca ratusan baris
 * kelompok LAIN cuma buat dibuang, DAN baca Firestore lagi). Kalau kelompok
 * ini sudah pindah Firestore (isKelompokTableOnFirestore_), baca Firestore
 * SAJA (skip Sheets total, sudah pasti kosong di sana). Kalau belum pindah,
 * baca Sheets mentah saja (skip pengecekan Firestore kelompok lain). Lihat
 * ERROR_LOG.md #20.
 */
function iaReadKelompokTable_(sheetName, kelompokId) {
  // Cek cache DULU terlepas dari sumbernya Firestore atau Sheets --
  // sebelumnya cache HANYA dicek di cabang Firestore, jadi 17/18 kelompok
  // yang masih Sheets SELALU baca langsung tanpa cache sama sekali walau
  // key-nya (IA_KELOMPOK_TABLE_CACHE_KEY_) sudah generik per-kelompok
  // (audit performa 2026-08-07, Sprint 2).
  const keyFn = IA_KELOMPOK_TABLE_CACHE_KEY_[sheetName];
  const cacheKey = keyFn ? keyFn(kelompokId) : null;
  if (cacheKey) {
    const cached = cacheGet_(cacheKey);
    if (cached) return cached;
  }

  const rows = isKelompokTableOnFirestore_(sheetName, kelompokId)
    ? firestoreListCollection_('kelompok/' + kelompokId + '/' + sheetName)
    : readSheetRowsRaw_(sheetName).filter(function (r) { return r.kelompok_id == kelompokId; });

  iaKelompokTableCachePut_(sheetName, kelompokId, rows);
  return rows;
}

/**
 * Baca absensi 1 Kelompok, DIBATASI 1 bulan/rentang tanggal — TIDAK PAKAI
 * `readSheetAsObjects(ABSENSI)` generik. Absensi tidak punya kolom
 * kelompok_id sendiri, jadi versi generik menanganinya dgn REBUILD PETA
 * SELURUH santri (baca ulang `readSheetAsObjects(SANTRI)`) SETIAP KALI
 * absensi dibaca — begitu santri JUGA Firestore-migrated, itu jadi 1 scan
 * Sheets + 1 fetch Firestore TERSEMBUNYI di tiap baca absensi (regresi
 * nyata, lihat ERROR_LOG.md #23). Di sini join dilakukan LOKAL pakai
 * santriIdsKelompok yang pemanggil SUDAH punya (tidak baca ulang apa pun).
 *
 * Utk kelompok yg sudah Firestore, filter tanggal dikerjakan DI SISI
 * FIRESTORE (`firestoreRunQuery_`) — cuma dokumen dalam rentang itu yang
 * di-download, BUKAN seluruh riwayat kelompok lalu dibuang sisanya di Apps
 * Script (analisis performa 2026-08-05, opsi B — sebelum ini SEMUA
 * pemanggil absensi, walau cuma butuh 1 bulan, selalu download SELURUH
 * riwayat kelompok lewat firestoreListCollection_). Utk kelompok yg masih
 * Sheets, tetap baca+filter di Apps Script seperti sebelumnya (tidak ada
 * cara push-down filter ke Google Sheets).
 * @param {string} kelompokId
 * @param {(string|number)[]} santriIdsKelompok - id SEMUA santri kelompok ini
 *   (dipakai HANYA di jalur Sheets; jalur Firestore sudah di-scope via path)
 * @param {string} tanggalMulai - 'yyyy-MM-dd', inklusif
 * @param {string} tanggalAkhir - 'yyyy-MM-dd', inklusif (boleh sama dgn
 *   tanggalMulai utk query 1 hari)
 */
function iaReadAbsensiKelompokRange_(kelompokId, santriIdsKelompok, tanggalMulai, tanggalAkhir) {
  if (isKelompokTableOnFirestore_(SHEET_NAMES.ABSENSI, kelompokId)) {
    const query = firestoreRangeQuery_('absensi', 'tanggal', tanggalMulai, tanggalAkhir);
    return firestoreRunQuery_('kelompok/' + kelompokId, query);
  }
  const santriIdSet = santriIdsKelompok.map(function (id) { return String(id); });
  return readSheetRowsRaw_(SHEET_NAMES.ABSENSI).filter(function (a) {
    if (santriIdSet.indexOf(String(a.santri_id)) === -1) return false;
    const tgl = tanggalKeString_(a.tanggal);
    return tgl >= tanggalMulai && tgl <= tanggalAkhir;
  });
}

/**
 * Baca BEBERAPA tabel Firestore ('kelompok/{id}/{tabel}') SEKALIGUS PARALEL
 * lewat UrlFetchApp.fetchAll — bukan satu-satu berurutan. `getKelasSessionInfo_`
 * dkk butuh jadwal_kbm+guru+santri dalam 1 request Input Absen; kalau ketiganya
 * sudah pindah Firestore (Kelp Petemon), baca satu-satu = 3x latensi jaringan
 * BERURUTAN. Paralel = cuma latensi 1x request (paling lambat dari yang 3).
 * Tabel yang BELUM pindah Firestore tetap dibaca lewat readSheetRowsRaw_
 * biasa (SpreadsheetApp, bukan HTTP, tidak bisa/perlu diparalelkan). Tabel
 * master (santri/guru/jadwal_kbm/jadwal_kategori_hari) dicek dulu ke cache
 * (IA_KELOMPOK_TABLE_CACHE_KEY_, Modul_Utilities.gs) sebelum fetch — cuma
 * cache MISS yang benar-benar ditembak ke Firestore (analisis performa
 * 2026-08-06).
 * @param {string[]} sheetNames
 * @returns {Object} { [sheetName]: rows[] }
 */
function iaReadKelompokTablesParallel_(sheetNames, kelompokId) {
  const result = {};
  const firestoreNames = [];
  sheetNames.forEach(function (name) {
    if (isKelompokTableOnFirestore_(name, kelompokId)) {
      firestoreNames.push(name);
      return;
    }
    // Tabel master (santri/guru/jadwal_kbm/jadwal_kategori_hari) sumber
    // Sheets sekarang JUGA dicek cache dulu -- sebelumnya SELALU baca
    // langsung tanpa cache utk 17/18 kelompok yg belum pindah Firestore
    // (audit performa 2026-08-07, Sprint 2). `absensi` tidak ada di
    // IA_KELOMPOK_TABLE_CACHE_KEY_ jadi keyFn null → selalu baca langsung,
    // TIDAK BERUBAH (sengaja, lihat komentar di atas const-nya).
    const keyFn = IA_KELOMPOK_TABLE_CACHE_KEY_[name];
    const cached = keyFn ? cacheGet_(keyFn(kelompokId)) : null;
    if (cached) {
      result[name] = cached;
      return;
    }
    const rows = readSheetRowsRaw_(name).filter(function (r) { return r.kelompok_id == kelompokId; });
    iaKelompokTableCachePut_(name, kelompokId, rows);
    result[name] = rows;
  });

  if (firestoreNames.length === 0) return result;

  // Cek cache dulu (tabel master: santri/guru/jadwal_kbm/jadwal_kategori_hari,
  // lihat IA_KELOMPOK_TABLE_CACHE_KEY_ di Modul_Utilities.gs) -- cuma tabel
  // yang CACHE MISS yang benar-benar di-fetch dari Firestore. Analisis
  // performa 2026-08-06: sebelum ini fungsi ini SELALU fetch semua tabel
  // tiap panggilan, walau dipanggil berkali-kali dlm hitungan menit yang
  // sama oleh guru yang sama/berbeda.
  const toFetch = [];
  firestoreNames.forEach(function (name) {
    const keyFn = IA_KELOMPOK_TABLE_CACHE_KEY_[name];
    const cached = keyFn ? cacheGet_(keyFn(kelompokId)) : null;
    if (cached) {
      result[name] = cached;
    } else {
      toFetch.push(name);
    }
  });

  if (toFetch.length === 0) return result;
  if (toFetch.length === 1) {
    const rows = firestoreListCollection_('kelompok/' + kelompokId + '/' + toFetch[0]);
    iaKelompokTableCachePut_(toFetch[0], kelompokId, rows);
    result[toFetch[0]] = rows;
    return result;
  }

  const token = firestoreGetAccessToken_();
  const baseUrl = firestoreBaseUrl_();
  const requests = toFetch.map(function (name) {
    return {
      url: baseUrl + '/kelompok/' + kelompokId + '/' + name + '?pageSize=300',
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    };
  });
  const responses = UrlFetchApp.fetchAll(requests);

  toFetch.forEach(function (name, idx) {
    const resp = responses[idx];
    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Gagal baca koleksi Firestore "kelompok/' + kelompokId + '/' + name + '": ' + resp.getContentText());
    }
    const body = resp.getContentText() ? JSON.parse(resp.getContentText()) : {};
    const docs = body.documents || [];
    let rows = docs.map(firestoreDocToObject_);
    // Jaga-jaga kalau 1 kelompok punya >300 baris di tabel ini (jarang) —
    // ambil sisa halamannya via jalur sekuensial biasa, tetap benar walau
    // kehilangan sebagian manfaat paralel utk tabel itu saja.
    if (body.nextPageToken) {
      rows = firestoreListCollection_('kelompok/' + kelompokId + '/' + name);
    }
    iaKelompokTableCachePut_(name, kelompokId, rows);
    result[name] = rows;
  });

  return result;
}

/**
 * Ambil daftar nama kelas (jadwal_kbm.kelas, status Aktif) milik satu guru_id
 * di satu Kelompok. Dedupe case-insensitive, tampilkan versi asli pertama ditemukan.
 */
function getKelasOwnedByGuru_(kelompokId, guruId, jadwalRowsAll) {
  const rows = (jadwalRowsAll || iaReadKelompokTable_(SHEET_NAMES.JADWAL_KBM, kelompokId)).filter(function (j) {
    return j.kelompok_id == kelompokId && j.guru_id == guruId && (j.status || 'Aktif') === 'Aktif' && String(j.kelas || '').trim() !== '';
  });
  const seen = {};
  const result = [];
  rows.forEach(function (j) {
    const key = String(j.kelas).trim().toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      result.push(String(j.kelas).trim());
    }
  });
  return result;
}

/**
 * Info sesi satu kelas (ruangan, jam, guru pengampu) — diambil dari baris
 * jadwal_kbm Aktif kelas itu yang PALING BARU dibuat (dibuat_pada), dipakai
 * kartu info kelas di layar Input Absen & penentuan owner permintaan akses.
 * Return null kalau kelas tidak ditemukan di jadwal_kbm.
 */
function getKelasSessionInfo_(kelompokId, kelas, jadwalRowsAll, guruRowsAll) {
  const kelasLower = String(kelas).trim().toLowerCase();
  const rows = (jadwalRowsAll || iaReadKelompokTable_(SHEET_NAMES.JADWAL_KBM, kelompokId)).filter(function (j) {
    return j.kelompok_id == kelompokId && (j.status || 'Aktif') === 'Aktif' &&
      String(j.kelas || '').trim().toLowerCase() === kelasLower;
  });
  if (rows.length === 0) return null;
  rows.sort(function (a, b) { return String(b.dibuat_pada || '').localeCompare(String(a.dibuat_pada || '')); });
  const row = rows[0];
  const guruRows = row.guru_id ? (guruRowsAll || iaReadKelompokTable_(SHEET_NAMES.GURU, kelompokId)) : [];
  const guruRow = row.guru_id ? guruRows.find(function (g) { return g.id == row.guru_id; }) : null;
  return {
    guruId: row.guru_id || null,
    namaGuru: guruRow ? guruRow.nama : '',
    ruangan: row.ruangan || '',
    jamMulai: row.jam_mulai || '',
    jamSelesai: row.jam_selesai || '',
    kategori: row.kategori || '',
  };
}

/**
 * Cari guru_id "pemilik" satu nama kelas di satu Kelompok — dipakai menentukan
 * siapa yang harus approve permintaan akses.
 */
function getKelasOwnerGuruId_(kelompokId, kelas) {
  const info = getKelasSessionInfo_(kelompokId, kelas);
  return info ? info.guruId : null;
}

/**
 * Cek apakah guru boleh input absen kelas tsb pada tanggal tsb:
 * pemilik kelas ATAU ada permintaan akses berstatus 'approved' utk tanggal itu.
 *
 * Tahap 6 (2026-08-08): baca akses_kelas_request lewat iaReadKelompokTable_
 * (cache-first + scoped 1 kelompok, pola sama santri/guru/jadwal_kbm),
 * BUKAN readSheetAsObjects generik (full-scan semua kelompok tiap
 * panggilan). Filter/keputusan authorization DI BAWAH ini SAMA PERSIS
 * TIDAK BERUBAH — cuma sumber baris yang berubah. Lihat
 * AKSES_KELAS_REQUEST_OPTIMIZATION_REPORT.md §Cache Analysis utk analisis
 * staleness (aman: 'approved' tidak pernah bisa jadi tidak-approved lagi,
 * dan cache di-drop di 2 titik tulis).
 */
function canGuruAccessKelas_(kelompokId, guruId, kelas, tanggal, jadwalRowsAll) {
  const owned = getKelasOwnedByGuru_(kelompokId, guruId, jadwalRowsAll).map(function (k) { return k.toLowerCase(); });
  if (owned.indexOf(String(kelas).trim().toLowerCase()) !== -1) return true;

  const kelasLower = String(kelas).trim().toLowerCase();
  const approved = iaReadKelompokTable_(SHEET_NAMES.AKSES_KELAS_REQUEST, kelompokId).some(function (r) {
    return r.kelompok_id == kelompokId && r.requester_guru_id == guruId &&
      String(r.kelas || '').trim().toLowerCase() === kelasLower &&
      tanggalKeString_(r.tanggal) === tanggal && r.status === 'approved';
  });
  return approved;
}

/**
 * Cek apakah guru boleh MENYIMPAN absen kelas tsb pada tanggal tsb SEKARANG:
 * tanggal masa depan selalu ditolak; tanggal hari ini ditolak kalau jam
 * sekarang masih sebelum jam_mulai sesi kelas itu (sesi belum berlangsung);
 * tanggal yang sudah lewat SELALU boleh kapan saja (guru menyusulkan absen
 * hari sebelumnya). Dipanggil HANYA dari serverSaveAbsensiKelas (guru) —
 * mode Admin PPG (serverSaveAbsensiKelasAdmin) sengaja tidak dibatasi, itu
 * jalur override yang memang bebas.
 */
function iaValidateWaktuAbsen_(kelompokId, kelas, tanggal, jadwalRowsAll, guruRowsAll) {
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const now = new Date();
  const todayStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');

  if (tanggal > todayStr) {
    return { valid: false, code: 'future', error: 'Tidak bisa menyimpan absen untuk tanggal yang akan datang.' };
  }
  if (tanggal === todayStr) {
    const info = getKelasSessionInfo_(kelompokId, kelas, jadwalRowsAll, guruRowsAll);
    const jamMulai = info && info.jamMulai;
    if (jamMulai) {
      const nowHHMM = Utilities.formatDate(now, tz, 'HH:mm');
      if (nowHHMM < jamMulai) {
        return { valid: false, code: 'belum-waktu', error: `Sesi ngaji kelas ini baru mulai jam ${jamMulai}. Absen belum bisa disimpan sebelum sesi berlangsung.` };
      }
    }
  }
  return { valid: true };
}

/**
 * GET data awal screen Input Absen: profil guru, daftar kelas milik sendiri,
 * dan jumlah permintaan akses masuk yang masih pending (badge notifikasi).
 */
function serverGetInputAbsenMeta(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const kelasOwned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId);
  const pendingIncoming = iaReadKelompokTable_(SHEET_NAMES.AKSES_KELAS_REQUEST, ctx.kelompokId).filter(function (r) {
    return r.kelompok_id == ctx.kelompokId && r.owner_guru_id == ctx.user.guruId && r.status === 'pending';
  }).length;

  return {
    success: true,
    data: {
      nama: ctx.user.nama,
      kelompokId: ctx.kelompokId,
      kelasOwned: kelasOwned,
      pendingIncomingCount: pendingIncoming,
    },
  };
}

/**
 * GET daftar kelas yang BOLEH diisi guru ini pada tanggal tertentu:
 * kelas miliknya sendiri + kelas yang izinnya sudah di-approve utk tanggal itu.
 */
/**
 * @param {string} [preferKelas] - kelas yang mau langsung disiapkan formnya
 *   sekalian (kelas terakhir dipilih guru), dipakai supaya klik "Pilih Kelas"
 *   tidak perlu 2 round-trip terpisah (list lalu form) — kalau kosong/tidak
 *   ditemukan, jatuh ke kelas pertama di list. Lihat ERROR_LOG.md #18/#19.
 */
function serverGetKelasAbsenList(token, tanggal, preferKelas) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  // jadwal_kbm, guru, & santri dibaca SEKALI & PARALEL di sini (dipakai ulang
  // di seluruh fungsi ini, termasuk lookup pemilik kelas & form santri di
  // bawah). Lihat ERROR_LOG.md #19/#20/#21 — Kelp Petemon sudah pindah Firestore.
  const tabelKelas_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.GURU, SHEET_NAMES.SANTRI], ctx.kelompokId);
  const jadwalRowsAll = tabelKelas_[SHEET_NAMES.JADWAL_KBM];
  const guruRowsAll = tabelKelas_[SHEET_NAMES.GURU];
  const santriAll = tabelKelas_[SHEET_NAMES.SANTRI];

  const owned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId, jadwalRowsAll);
  const list = owned.map(function (k) { return { kelas: k, isOwn: true }; });

  const approvedExtra = iaReadKelompokTable_(SHEET_NAMES.AKSES_KELAS_REQUEST, ctx.kelompokId).filter(function (r) {
    return r.kelompok_id == ctx.kelompokId && r.requester_guru_id == ctx.user.guruId &&
      r.status === 'approved' && tanggalKeString_(r.tanggal) === tanggal;
  });
  const ownedLower = owned.map(function (k) { return k.toLowerCase(); });
  approvedExtra.forEach(function (r) {
    const kelasTrim = String(r.kelas).trim();
    if (ownedLower.indexOf(kelasTrim.toLowerCase()) === -1) {
      list.push({ kelas: kelasTrim, isOwn: false });
    }
  });

  // Isi jumlah santri + info sesi (ruangan/jam/guru) per kelas, dipakai kartu
  // info kelas di layar Input Absen.
  list.forEach(function (item) {
    const kelasLower = item.kelas.toLowerCase();
    item.santriCount = santriAll.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; }).length;
    const info = getKelasSessionInfo_(ctx.kelompokId, item.kelas, jadwalRowsAll, guruRowsAll) || {};
    item.ruangan = info.ruangan || '';
    item.jamMulai = info.jamMulai || '';
    item.jamSelesai = info.jamSelesai || '';
    item.namaGuru = info.namaGuru || '';
    item.kategori = info.kategori || '';
  });

  // Sekalian siapkan form santri utk kelas yang bakal auto-dipilih klien
  // (preferKelas kalau ada & masih ada di list, else kelas pertama) — pakai
  // santriAll yang SUDAH dibaca di atas + iaReadAbsensiKelompokRange_ (BUKAN
  // readSheetAsObjects generik — lihat ERROR_LOG.md #23).
  let formKelas = null;
  let formData = null;
  let formSudahTersimpan = false;
  let formExpectedVersion = 0;
  if (list.length > 0) {
    let idx = -1;
    if (preferKelas) {
      idx = list.findIndex(function (it) { return it.kelas.toLowerCase() === String(preferKelas).toLowerCase(); });
    }
    if (idx < 0) idx = 0;
    formKelas = list[idx].kelas;
    const kelasLower = formKelas.toLowerCase();
    const santriKelas = santriAll.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; });

    // Tahap: baca absensi + version sesi PARALEL (1 fetchAll) kalau kelompok
    // ini sudah Firestore -- sebelumnya 2 round-trip berurutan (lihat
    // iaReadAbsensiRangeDanVersiParalel_ di atas utk detail pengukuran).
    let absensiExisting;
    if (isKelompokTableOnFirestore_(SHEET_NAMES.ABSENSI, ctx.kelompokId)) {
      const paralel = iaReadAbsensiRangeDanVersiParalel_(ctx.kelompokId, formKelas, tanggal);
      absensiExisting = paralel.absensiRows;
      formExpectedVersion = paralel.version;
    } else {
      absensiExisting = iaReadAbsensiKelompokRange_(ctx.kelompokId, santriAll.map(function (s) { return s.id; }), tanggal, tanggal);
    }
    const statusMap = {};
    absensiExisting.forEach(function (a) { statusMap[a.santri_id] = a.status; });
    formData = santriKelas.map(function (s) { return { santri_id: s.id, nama: s.nama, status: statusMap[s.id] || 'hadir' }; });
    // formSudahTersimpan SENGAJA selalu false -- guru boleh mengoreksi absen
    // kelasnya sendiri kapan pun (lihat serverSaveAbsensiKelas), jadi tombol
    // Simpan di klien tidak pernah terkunci lagi krn flag ini.
  }

  return { success: true, data: list, formKelas: formKelas, formData: formData, formSudahTersimpan: formSudahTersimpan, formExpectedVersion: formExpectedVersion };
}

/**
 * GET santri + status absensi existing utk satu kelas & tanggal (form input).
 */
function serverGetAbsensiKelasForm(token, kelas, tanggal) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }
  if (!canGuruAccessKelas_(ctx.kelompokId, ctx.user.guruId, kelas, tanggal)) {
    return { success: false, error: 'Anda belum memiliki akses ke kelas ini pada tanggal tersebut.' };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const santriKelas = iaReadKelompokTable_(SHEET_NAMES.SANTRI, ctx.kelompokId).filter(function (s) {
    return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower;
  });

  // Baca absensi + version sesi PARALEL (1 fetchAll) kalau kelompok ini
  // sudah Firestore -- sebelumnya 2 round-trip berurutan (diukur 2026-08-08,
  // ~1-2 detik per klik "pilih kelas" di Input Kehadiran guru -- lihat
  // iaReadAbsensiRangeDanVersiParalel_ utk detail).
  let absensiExisting, expectedVersion;
  if (isKelompokTableOnFirestore_(SHEET_NAMES.ABSENSI, ctx.kelompokId)) {
    const paralel = iaReadAbsensiRangeDanVersiParalel_(ctx.kelompokId, kelas, tanggal);
    absensiExisting = paralel.absensiRows;
    expectedVersion = paralel.version;
  } else {
    absensiExisting = iaReadAbsensiKelompokRange_(ctx.kelompokId, santriKelas.map(function (s) { return s.id; }), tanggal, tanggal);
    expectedVersion = 0;
  }
  const statusMap = {};
  absensiExisting.forEach(function (a) { statusMap[a.santri_id] = a.status; });

  const formData = santriKelas.map(function (s) {
    return { santri_id: s.id, nama: s.nama, status: statusMap[s.id] || 'hadir' };
  });

  // sudahTersimpan SENGAJA selalu false -- guru boleh mengoreksi absen
  // kelasnya sendiri kapan pun (lihat serverSaveAbsensiKelas).
  return { success: true, data: formData, sudahTersimpan: false, expectedVersion: expectedVersion };
}

/**
 * Ganti baris absensi utk sekumpulan santri (1 kelas) pada 1 tanggal — SATU
 * baca + SATU tulis batch, BUKAN N kali deleteRowByQuery + M kali generateId
 * (yang masing-masing scan ULANG SELURUH sheet absensi tiap panggilan — utk
 * kelas 25 santri itu ~50 full-table-scan, semuanya DI DALAM lock global yang
 * memblokir SEMUA guru lain di seluruh aplikasi. Lihat ERROR_LOG.md #22).
 * WAJIB dipanggil di dalam withScriptLock_. Otomatis pakai jalur Firestore
 * kalau kelompokId sudah migrasi (isKelompokTableOnFirestore_).
 *
 * Tahap 12 (2026-08-08, concurrency): `kelas`+`expectedVersion` BARU —
 * dibutuhkan jalur Firestore utk optimistic-concurrency check (lihat
 * iaRewriteAbsensiKelasFirestore_ di bawah). Jalur Sheets (kelompok yang
 * BELUM migrasi) SENGAJA TIDAK diberi proteksi ini (di luar cakupan Tahap
 * 10/11/12, lihat FIRESTORE_ATTENDANCE_CONCURRENCY_PROPOSAL.md §Executive
 * Summary — hanya Kelp Petemon yang absensinya di Firestore saat ini).
 *
 * @returns {{conflict:boolean, count:number, newVersion:(number|null), currentVersion:(number|undefined)}}
 *   `conflict:true` → TIDAK ADA delete/write yang dieksekusi sama sekali.
 *   Jalur Sheets SELALU `conflict:false, newVersion:null` (tidak berlaku).
 */
function iaRewriteAbsensiKelas_(kelompokId, santriIdsKelas, tanggal, absensiList, dicatatOleh, kelas, expectedVersion) {
  const santriIdSet = santriIdsKelas.map(function (id) { return String(id); });
  const relevantList = absensiList.filter(function (item) { return santriIdSet.indexOf(String(item.santri_id)) !== -1; });

  if (isKelompokTableOnFirestore_(SHEET_NAMES.ABSENSI, kelompokId)) {
    return iaRewriteAbsensiKelasFirestore_(kelompokId, santriIdSet, tanggal, relevantList, dicatatOleh, kelas, expectedVersion);
  }

  const NUM_COLS = 5; // id, santri_id, tanggal, status, dicatat_oleh — Setup_Database.gs
  const sheet = getSheetByName(SHEET_NAMES.ABSENSI);
  const lastRow = sheet.getLastRow();
  const data = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, NUM_COLS).getValues() : [];

  let maxId = 0;
  const keptRows = [];
  data.forEach(function (row) {
    const id = Number(row[0]) || 0;
    if (id > maxId) maxId = id;
    const isMatch = santriIdSet.indexOf(String(row[1])) !== -1 && tanggalKeString_(row[2]) === tanggal;
    if (!isMatch) keptRows.push(row);
  });

  const newRows = relevantList.map(function (item) {
    maxId += 1;
    return [maxId, item.santri_id, tanggal, item.status, dicatatOleh];
  });

  const finalRows = keptRows.concat(newRows);
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, NUM_COLS).clearContent();
  }
  if (finalRows.length > 0) {
    sheet.getRange(2, 1, finalRows.length, NUM_COLS).setValues(finalRows);
  }
  return { conflict: false, count: newRows.length, newVersion: null };
}

/**
 * Versi Firestore dari iaRewriteAbsensiKelas_ — delegasi ke
 * iaBulkWriteAbsensiFirestore_ (di bawah), yang pakai id dokumen DETERMINISTIK
 * (`absensiDocId_`, Modul_Utilities.gs) jadi TIDAK PERLU baca koleksi sama
 * sekali sebelum menulis. Sebelumnya fungsi ini baca SELURUH riwayat absensi
 * kelompok cuma utk cari baris yang mau dihapus + hitung id berikutnya —
 * biaya itu tumbuh terus seiring riwayat kelompok bertambah (lihat analisis
 * performa 2026-08-05, opsi A).
 *
 * Tahap 12 (2026-08-08, concurrency): SEBELUM delete/write apa pun, baca
 * dokumen header "sesi absensi" (1 per kelas+tanggal, TERPISAH dari dokumen
 * absensi per-santri) dan bandingkan `version`-nya dgn `expectedVersion` yang
 * guru bawa dari saat form dibuka. TIDAK MATCH → return conflict SEBELUM
 * baris delete/write mana pun dieksekusi (invariant #1/#2,
 * FIRESTORE_ATTENDANCE_CONCURRENCY_PROPOSAL.md §6/§18). Fungsi ini SELALU
 * dipanggil di dalam withScriptLock_ (oleh serverSaveAbsensiKelas/Admin) —
 * lock itulah yang menjamin hanya SATU eksekusi bisa berada di titik
 * baca-header→tulis-header pada satu waktu (invariant #3), BUKAN Firestore
 * native transaction (lihat proposal §7/§8 kenapa transaction tidak
 * diperlukan di sini).
 */
function iaRewriteAbsensiKelasFirestore_(kelompokId, santriIdSet, tanggal, relevantList, dicatatOleh, kelas, expectedVersion) {
  const sesiPath = iaAbsensiSesiPath_(kelompokId);
  const sesiDocId = absensiSesiDocId_(kelas, tanggal);
  const sesiHeader = firestoreGetDoc_(sesiPath, sesiDocId);
  const currentVersion = sesiHeader ? (Number(sesiHeader.version) || 0) : 0;

  if (Number(expectedVersion) !== currentVersion) {
    return { conflict: true, count: 0, newVersion: null, currentVersion: currentVersion };
  }

  const relevantSantriIds = relevantList.map(function (item) { return String(item.santri_id); });
  const deleteSantriIds = santriIdSet.filter(function (id) { return relevantSantriIds.indexOf(id) === -1; });
  // Kalau baris di bawah throw (mis. sebagian request Firestore gagal — lihat
  // ATTENDANCE_CONCURRENCY_ANALYSIS.md §6 Failure Scenarios), eksekusi
  // TIDAK PERNAH sampai ke penulisan header di bawah — version TIDAK naik,
  // sesuai FINAL RULE Tahap 12 poin 7/8 ("save gagal → version tidak boleh naik").
  const count = iaBulkWriteAbsensiFirestore_(kelompokId, deleteSantriIds, relevantList, tanggal, dicatatOleh);

  const newVersion = currentVersion + 1;
  const headerFields = {
    version: newVersion, kelas: kelas, tanggal: tanggal,
    kelompok_id: String(kelompokId), updated_by: dicatatOleh,
  };
  if (sesiHeader) {
    firestoreUpdateDoc_(sesiPath, sesiDocId, headerFields);
  } else {
    firestoreCreateDoc_(sesiPath, sesiDocId, headerFields);
  }

  return { conflict: false, count: count, newVersion: newVersion };
}

/** Path Firestore koleksi header "sesi absensi" (1 kelompok). Lihat
 *  iaRewriteAbsensiKelasFirestore_ di atas. */
function iaAbsensiSesiPath_(kelompokId) {
  return 'kelompok/' + kelompokId + '/absensi_sesi';
}

/**
 * Baca `version` sesi absensi (kelas+tanggal) SAAT INI — dipakai
 * serverGetAbsensiKelasForm/serverGetKelasAbsenList (+ varian Admin) supaya
 * client tahu `expectedVersion` sebelum guru mulai edit. Header belum pernah
 * ada (belum ada Save sejak fitur ini aktif) → 0 (lazy initialization, TIDAK
 * membuat dokumen apa pun hanya karena form dibuka — lihat proposal §4/§9).
 * @returns {number}
 */
function iaGetAbsensiSesiVersion_(kelompokId, kelas, tanggal) {
  const doc = firestoreGetDoc_(iaAbsensiSesiPath_(kelompokId), absensiSesiDocId_(kelas, tanggal));
  return doc ? (Number(doc.version) || 0) : 0;
}

/**
 * Versi PARALEL dari "baca absensi 1 tanggal" + "baca version header sesi 1
 * kelas" — dua request Firestore (structured query range absensi + GET
 * dokumen absensi_sesi) dikirim BERSAMAAN via UrlFetchApp.fetchAll, BUKAN
 * berurutan. Sebelumnya `serverGetKelasAbsenList`/`serverGetAbsensiKelasForm`
 * memanggil `iaReadAbsensiKelompokRange_` lalu `iaGetAbsensiSesiVersion_`
 * SATU-PER-SATU (2x round-trip Firestore berurutan, masing-masing ~0.9-2
 * detik) — diukur 2026-08-08 (popup "pilih kelas" Input Kehadiran guru
 * terasa lambat ~1-2 detik tiap klik kelas yang bukan kelas ter-prefetch).
 * Digabung jadi 1 fetchAll = ~1x latency, bukan 2x dijumlah.
 * HANYA dipakai kalau kelompok ini sudah Firestore utk absensi (dicek
 * pemanggil) — kelompok Sheets tidak melakukan Firestore call sama sekali
 * di jalur ini, tidak perlu diparalelkan.
 * @returns {{absensiRows: Array, version: number}}
 */
function iaReadAbsensiRangeDanVersiParalel_(kelompokId, kelas, tanggal) {
  const token = firestoreGetAccessToken_();
  const baseUrl = firestoreBaseUrl_();

  const query = firestoreRangeQuery_('absensi', 'tanggal', tanggal, tanggal);
  const queryReq = {
    url: baseUrl + '/kelompok/' + kelompokId + ':runQuery',
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ structuredQuery: query }),
    muteHttpExceptions: true,
  };

  const sesiDocId = absensiSesiDocId_(kelas, tanggal);
  const sesiReq = {
    url: baseUrl + '/' + iaAbsensiSesiPath_(kelompokId) + '/' + encodeURIComponent(sesiDocId),
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  };

  const responses = UrlFetchApp.fetchAll([queryReq, sesiReq]);

  const queryResp = responses[0];
  const queryCode = queryResp.getResponseCode();
  if (queryCode < 200 || queryCode >= 300) {
    throw new Error('Gagal baca absensi Firestore (paralel): ' + queryResp.getContentText());
  }
  const queryBody = JSON.parse(queryResp.getContentText() || '[]');
  const absensiRows = queryBody
    .filter(function (item) { return item.document; })
    .map(function (item) { return firestoreDocToObject_(item.document); });

  const sesiResp = responses[1];
  const sesiCode = sesiResp.getResponseCode();
  let version = 0;
  if (sesiCode === 200) {
    version = Number(firestoreDocToObject_(JSON.parse(sesiResp.getContentText())).version) || 0;
  } else if (sesiCode !== 404) {
    throw new Error('Gagal baca versi sesi absensi Firestore (paralel): ' + sesiResp.getContentText());
  }

  return { absensiRows: absensiRows, version: version };
}

/**
 * Tahap 15 (2026-08-08, secondary write-path concurrency): baca `version`
 * SEMUA kelas berbeda sekaligus, PARALEL via UrlFetchApp.fetchAll (GET per
 * dokumen header) — dipakai `serverSaveAbsensiDaily`/`serverGetAbsensiForm`
 * (Modul_MaintainAbsensi.gs) yang scope-nya SELURUH kelompok (banyak kelas
 * sekaligus), BEDA dari `iaGetAbsensiSesiVersion_` di atas yang cuma 1 kelas
 * (dipakai jalur per-kelas Tahap 12). Lihat
 * FIRESTORE_SECONDARY_ATTENDANCE_CONCURRENCY_PROPOSAL.md §7 Option A —
 * "multiple class versions", diparalelkan spy latency tidak tumbuh linear
 * per kelas.
 * @param {Array<string>} kelasList - boleh mengandung duplikat/case berbeda,
 *   di-dedupe internal (dibandingkan trim+lowercase, sama normalisasi
 *   `absensiSesiDocId_`).
 * @returns {Object} map { kelasLower: version } — key SELALU trim+lowercase.
 */
function iaGetAbsensiSesiVersionsBatch_(kelompokId, kelasList, tanggal) {
  const uniqueKelas = [];
  const seen = {};
  kelasList.forEach(function (k) {
    const key = String(k).trim().toLowerCase();
    if (key && !seen[key]) { seen[key] = true; uniqueKelas.push(k); }
  });
  if (uniqueKelas.length === 0) return {};

  const path = iaAbsensiSesiPath_(kelompokId);
  const token = firestoreGetAccessToken_();
  const baseUrl = firestoreBaseUrl_();
  const requests = uniqueKelas.map(function (kelas) {
    return {
      url: baseUrl + '/' + path + '/' + encodeURIComponent(absensiSesiDocId_(kelas, tanggal)),
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    };
  });

  const responses = UrlFetchApp.fetchAll(requests);
  const result = {};
  uniqueKelas.forEach(function (kelas, idx) {
    const resp = responses[idx];
    const code = resp.getResponseCode();
    const key = String(kelas).trim().toLowerCase();
    if (code === 404) { result[key] = 0; return; }
    if (code < 200 || code >= 300) {
      throw new Error('Gagal baca versi sesi absensi kelas "' + kelas + '": ' + resp.getContentText());
    }
    const doc = JSON.parse(resp.getContentText());
    result[key] = Number(firestoreDocToObject_(doc).version) || 0;
  });
  return result;
}

/**
 * Tahap 15: increment SEMUA header kelas terdampak sekaligus, PARALEL via
 * fetchAll (upsert PATCH per dokumen) — WAJIB dipanggil SETELAH delete/write
 * attendance-nya sukses (kalau dipanggil sebelum/gagal di tengah,
 * version akan naik padahal data belum tentu berubah — lihat kontrak di
 * `serverSaveAbsensiDaily`).
 * @param {Object} currentVersions - HASIL `iaGetAbsensiSesiVersionsBatch_`
 *   yang SAMA (versi SEBELUM increment), dipakai basis +1 per kelas.
 */
function iaIncrementAbsensiSesiVersionsBatch_(kelompokId, kelasList, tanggal, currentVersions, dicatatOleh) {
  const uniqueKelas = [];
  const seen = {};
  kelasList.forEach(function (k) {
    const key = String(k).trim().toLowerCase();
    if (key && !seen[key]) { seen[key] = true; uniqueKelas.push(k); }
  });
  if (uniqueKelas.length === 0) return;

  const path = iaAbsensiSesiPath_(kelompokId);
  const token = firestoreGetAccessToken_();
  const baseUrl = firestoreBaseUrl_();
  const requests = uniqueKelas.map(function (kelas) {
    const key = String(kelas).trim().toLowerCase();
    const newVersion = (Number(currentVersions[key]) || 0) + 1;
    const docId = absensiSesiDocId_(kelas, tanggal);
    const fields = {
      version: newVersion, kelas: kelas, tanggal: tanggal,
      kelompok_id: String(kelompokId), updated_by: dicatatOleh,
    };
    const mask = Object.keys(fields).map(function (k2) { return 'updateMask.fieldPaths=' + encodeURIComponent(k2); }).join('&');
    return {
      url: baseUrl + '/' + path + '/' + encodeURIComponent(docId) + '?' + mask,
      method: 'patch',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ fields: firestoreEncodeFields_(fields) }),
      muteHttpExceptions: true,
    };
  });

  const responses = UrlFetchApp.fetchAll(requests);
  responses.forEach(function (resp, idx) {
    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('Gagal update versi sesi absensi kelas "' + uniqueKelas[idx] + '": ' + resp.getContentText());
    }
  });
}

/**
 * Hapus (by id deterministik) sekumpulan santri_id pada 1 tanggal, DAN
 * upsert (PATCH — menimpa kalau sudah ada, membuat kalau belum) sekumpulan
 * record baru — semua dikirim PARALEL lewat UrlFetchApp.fetchAll dalam 1
 * batch, TANPA baca apa pun dulu (id dokumen sudah pasti dari
 * `absensiDocId_(tanggal, santriId)`). Dipakai bersama oleh
 * iaRewriteAbsensiKelasFirestore_ (guru, per-kelas) & serverSaveAbsensiDaily
 * (admin, per-kelompok/harian, Modul_MaintainAbsensi.gs) supaya logika
 * tulisnya 1 tempat saja.
 * @returns {number} jumlah record yang di-upsert
 */
function iaBulkWriteAbsensiFirestore_(kelompokId, deleteSantriIds, upsertList, tanggal, dicatatOleh) {
  const path = 'kelompok/' + kelompokId + '/absensi';
  const token = firestoreGetAccessToken_();
  const baseUrl = firestoreBaseUrl_();
  const requests = [];

  deleteSantriIds.forEach(function (santriId) {
    requests.push({
      url: baseUrl + '/' + path + '/' + encodeURIComponent(absensiDocId_(tanggal, santriId)),
      method: 'delete',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    });
  });

  upsertList.forEach(function (item) {
    const docId = absensiDocId_(tanggal, item.santri_id);
    const fields = {
      id: docId, santri_id: item.santri_id, tanggal: tanggal, status: item.status,
      dicatat_oleh: dicatatOleh, kelompok_id: String(kelompokId),
    };
    const mask = Object.keys(fields).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
    requests.push({
      url: baseUrl + '/' + path + '/' + encodeURIComponent(docId) + '?' + mask,
      method: 'patch',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ fields: firestoreEncodeFields_(fields) }),
      muteHttpExceptions: true,
    });
  });

  if (requests.length > 0) {
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(function (resp, idx) {
      const code = resp.getResponseCode();
      if (code < 200 || code >= 300) {
        throw new Error('Gagal tulis absensi Firestore (request #' + idx + '): ' + resp.getContentText());
      }
    });
  }

  return upsertList.length;
}

/**
 * Cek apakah guru sedang mengajukan Izin/Cuti yang mencakup tanggal tsb
 * (guru_izin TIDAK ADA approval — self-declared, jadi begitu diajukan
 * langsung berlaku). Dipakai serverSaveAbsensiKelas supaya guru yang lagi
 * izin tidak bisa input absen di tanggal yang sama.
 *
 * Tahap 7 (2026-08-08): baca lewat iaReadKelompokTable_ (cache-first,
 * scoped 1 kelompok, pola sama santri/guru/jadwal_kbm/akses_kelas_request),
 * BUKAN readSheetAsObjects generik (full-scan semua kelompok tiap
 * panggilan) — makanya `kelompokId` jadi parameter baru (dulu tidak
 * dibutuhkan krn baca generik). Filter guru_id + rentang tanggal DI BAWAH
 * ini SAMA PERSIS TIDAK BERUBAH. Lihat GURU_IZIN_OPTIMIZATION_REPORT.md
 * §Cache Safety Analysis (aman: guru_izin tidak punya status/approval,
 * TIDAK ADA fungsi cancel/update/delete, satu-satunya titik tulis
 * serverSubmitGuruIzin sudah di-cacheDrop_).
 * @returns {Object|null} baris guru_izin yang cocok, atau null kalau tidak izin.
 */
function iaCekGuruSedangIzin_(kelompokId, guruId, tanggal) {
  const izinAktif = iaReadKelompokTable_(SHEET_NAMES.GURU_IZIN, kelompokId).find(function (r) {
    if (r.guru_id != guruId) return false;
    const mulai = tanggalKeString_(r.tanggal_mulai);
    const selesai = tanggalKeString_(r.tanggal_selesai) || mulai;
    return tanggal >= mulai && tanggal <= selesai;
  });
  return izinAktif || null;
}

/**
 * SAVE absensi satu kelas pada satu tanggal. Hanya menghapus/menulis ulang
 * baris absensi milik santri DI KELAS INI (bukan seluruh Kelompok) supaya
 * tidak menimpa input kelas lain di tanggal yang sama.
 *
 * Tahap 12 (2026-08-08, concurrency): `expectedVersion` BARU — guru bawa nilai
 * ini dari saat form dibuka (serverGetAbsensiKelasForm/serverGetKelasAbsenList).
 * Kalau sudah tidak cocok dgn version SAAT INI (guru lain sudah menyimpan
 * kelas+tanggal yang sama sejak form ini dibuka), TIDAK ADA delete/write yang
 * dieksekusi -- return conflict. Lihat
 * FIRESTORE_ATTENDANCE_CONCURRENCY_PROPOSAL.md §18/§6.
 */
function serverSaveAbsensiKelas(token, kelas, tanggal, absensiList, expectedVersion) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  // JADWAL_KBM/GURU/SANTRI dibaca SEKALI & PARALEL di sini, dipakai ulang oleh
  // canGuruAccessKelas_/iaValidateWaktuAbsen_/santriIdsKelas di bawah --
  // sebelumnya masing-masing baca sendiri (JADWAL_KBM sampai 2x) jadi 3-4
  // round-trip Firestore BERURUTAN yang bikin Simpan Kehadiran lambat
  // (pola sama ERROR_LOG #18-22, belum sempat diterapkan ke fungsi ini).
  const tabelAbsen_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.GURU, SHEET_NAMES.SANTRI], ctx.kelompokId);
  const jadwalRowsAll = tabelAbsen_[SHEET_NAMES.JADWAL_KBM];
  const guruRowsAll = tabelAbsen_[SHEET_NAMES.GURU];
  const santriAll = tabelAbsen_[SHEET_NAMES.SANTRI];

  if (!canGuruAccessKelas_(ctx.kelompokId, ctx.user.guruId, kelas, tanggal, jadwalRowsAll)) {
    return { success: false, error: 'Anda belum memiliki akses ke kelas ini pada tanggal tersebut.' };
  }

  const waktuCheck = iaValidateWaktuAbsen_(ctx.kelompokId, kelas, tanggal, jadwalRowsAll, guruRowsAll);
  if (!waktuCheck.valid) {
    return { success: false, error: waktuCheck.error, code: waktuCheck.code };
  }

  const izinAktif = iaCekGuruSedangIzin_(ctx.kelompokId, ctx.user.guruId, tanggal);
  if (izinAktif) {
    return {
      success: false,
      error: `Anda sedang mengajukan ${izinAktif.jenis === 'cuti' ? 'Cuti' : 'Izin'} pada tanggal ini, tidak bisa input absen. Hubungi Admin Kelompok kalau ini keliru.`,
      code: 'guru-izin',
    };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const santriIdsKelas = santriAll
    .filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; })
    .map(function (s) { return s.id; });

  // Guru boleh mengoreksi absen kelasnya sendiri kapan pun (tanggal berapa
  // pun, tidak dibatasi "hari ini" saja) -- kelas mingguan (mis. Senin)
  // sering baru ketahuan salah beberapa hari kemudian. iaRewriteAbsensiKelas_
  // menimpa per kelas+tanggal (hapus+tulis ulang), jadi aman tanpa duplikat;
  // tiap simpan tetap tercatat logAudit di bawah, jadi tidak "diam-diam".

  let result = null;
  withScriptLock_(function () {
    result = iaRewriteAbsensiKelas_(ctx.kelompokId, santriIdsKelas, tanggal, absensiList, ctx.user.id, kelas, expectedVersion);
  });

  if (result.conflict) {
    return {
      success: false,
      code: 'attendance-conflict',
      error: 'Data absensi sudah diperbarui oleh guru lain.',
      currentVersion: result.currentVersion,
    };
  }

  logAudit('absensi', 'kelas_' + kelas + '_' + tanggal, 'create', ctx.user.id, `Input Absen kelas "${kelas}": ${result.count} santri`);
  return { success: true, message: `Absensi kelas "${kelas}" (${result.count} santri) berhasil disimpan.`, newVersion: result.newVersion };
}

/**
 * GET daftar kelas LAIN (bukan milik sendiri) di Kelompok yang sama, untuk
 * modal "Minta Akses Kelas Lain".
 */
function serverListKelasUntukPermintaan(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const jadwalRowsAll = iaReadKelompokTable_(SHEET_NAMES.JADWAL_KBM, ctx.kelompokId);
  const owned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId, jadwalRowsAll).map(function (k) { return k.toLowerCase(); });
  const rows = jadwalRowsAll.filter(function (j) {
    return j.kelompok_id == ctx.kelompokId && (j.status || 'Aktif') === 'Aktif' && String(j.kelas || '').trim() !== '';
  });
  const guruMap = {};
  iaReadKelompokTable_(SHEET_NAMES.GURU, ctx.kelompokId).forEach(function (g) { guruMap[g.id] = g.nama; });

  const seen = {};
  const result = [];
  rows.forEach(function (j) {
    const kelasTrim = String(j.kelas).trim();
    const key = kelasTrim.toLowerCase();
    if (owned.indexOf(key) !== -1 || seen[key]) return;
    seen[key] = true;
    result.push({ kelas: kelasTrim, namaGuruPemilik: guruMap[j.guru_id] || '(tidak diketahui)' });
  });

  return { success: true, data: result };
}

/**
 * REQUEST akses ke kelas guru lain, untuk satu tanggal spesifik.
 */
function serverRequestAksesKelas(token, kelas, tanggal, keterangan) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }
  if (!String(kelas || '').trim()) {
    return { success: false, error: 'Kelas wajib dipilih.' };
  }

  const ownerGuruId = getKelasOwnerGuruId_(ctx.kelompokId, kelas);
  if (!ownerGuruId) {
    return { success: false, error: 'Kelas tidak ditemukan atau belum punya guru pengampu.' };
  }
  if (ownerGuruId == ctx.user.guruId) {
    return { success: false, error: 'Ini kelas Anda sendiri.' };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const existingPending = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST).find(function (r) {
    return r.kelompok_id == ctx.kelompokId && r.requester_guru_id == ctx.user.guruId &&
      String(r.kelas || '').trim().toLowerCase() === kelasLower && tanggalKeString_(r.tanggal) === tanggal &&
      r.status === 'pending';
  });
  if (existingPending) {
    return { success: false, error: 'Permintaan untuk kelas & tanggal ini sudah menunggu persetujuan.' };
  }

  let newId;
  withScriptLock_(function () {
    newId = generateId(SHEET_NAMES.AKSES_KELAS_REQUEST);
    appendRowToSheet(SHEET_NAMES.AKSES_KELAS_REQUEST, [
      newId, ctx.kelompokId, String(kelas).trim(), tanggal,
      ctx.user.id, ctx.user.guruId, ctx.user.nama, ownerGuruId,
      'pending', keterangan || '', new Date().toISOString(), '',
    ]);
  });
  cacheDrop_(IA_KELOMPOK_TABLE_CACHE_KEY_.akses_kelas_request(ctx.kelompokId));

  return { success: true, message: 'Permintaan akses terkirim, menunggu persetujuan guru pemilik kelas.' };
}

/**
 * GET permintaan akses MASUK (guru ini adalah owner) yang masih pending —
 * dipakai badge notifikasi + modal approve/reject.
 */
function serverGetIncomingAksesRequests(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const rows = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST)
    .filter(function (r) { return r.kelompok_id == ctx.kelompokId && r.owner_guru_id == ctx.user.guruId && r.status === 'pending'; })
    .map(function (r) {
      return {
        id: r.id, kelas: r.kelas, tanggal: tanggalKeString_(r.tanggal),
        requester_nama: r.requester_nama, keterangan: r.keterangan || '',
      };
    })
    .sort(function (a, b) { return a.tanggal.localeCompare(b.tanggal); });

  return { success: true, data: rows };
}

/**
 * GET permintaan yang PERNAH saya kirim (requester) — supaya guru pemohon
 * bisa lihat status approve/reject miliknya sendiri.
 */
function serverGetMyAksesRequests(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const rows = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST)
    .filter(function (r) { return r.kelompok_id == ctx.kelompokId && r.requester_guru_id == ctx.user.guruId; })
    .map(function (r) {
      return { id: r.id, kelas: r.kelas, tanggal: tanggalKeString_(r.tanggal), status: r.status };
    })
    .sort(function (a, b) { return b.tanggal.localeCompare(a.tanggal); });

  return { success: true, data: rows };
}

/**
 * APPROVE / REJECT satu permintaan akses — hanya boleh oleh guru pemilik kelas.
 */
function serverRespondAksesRequest(token, requestId, decision) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (['approved', 'rejected'].indexOf(decision) === -1) {
    return { success: false, error: 'Keputusan tidak valid.' };
  }

  const rows = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST);
  const target = rows.find(function (r) { return r.id == requestId; });
  if (!target) return { success: false, error: 'Permintaan tidak ditemukan.' };
  if (target.owner_guru_id != ctx.user.guruId) {
    return { success: false, error: 'Anda bukan pemilik kelas ini.' };
  }
  if (target.status !== 'pending') {
    return { success: false, error: 'Permintaan ini sudah diproses sebelumnya.' };
  }

  withScriptLock_(function () {
    updateRowByQuery(SHEET_NAMES.AKSES_KELAS_REQUEST, { id: target.id }, {
      status: decision,
      diputuskan_pada: new Date().toISOString(),
    });
  });
  cacheDrop_(IA_KELOMPOK_TABLE_CACHE_KEY_.akses_kelas_request(ctx.kelompokId));

  return { success: true, message: decision === 'approved' ? 'Permintaan disetujui.' : 'Permintaan ditolak.' };
}

/**
 * GET ringkasan kehadiran (hadir/izin/sakit/alpa) per kelas milik guru ini
 * pada satu tanggal — dipakai kartu Dashboard di layar Input Absen. Satu
 * kartu per kelas yang diampu (guru ngajar 2 kelas → 2 kartu, dst).
 */
function serverGetGuruDashboardSummary(token, tanggal) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  // jadwal_kbm, guru, & santri dibaca SEKALI & PARALEL di sini (lihat
  // ERROR_LOG.md #19/#20/#21).
  const tabelKelas_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.GURU, SHEET_NAMES.SANTRI], ctx.kelompokId);
  const jadwalRowsAll = tabelKelas_[SHEET_NAMES.JADWAL_KBM];
  const guruRowsAll = tabelKelas_[SHEET_NAMES.GURU];
  const kelasOwned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId, jadwalRowsAll);
  const santriAll = tabelKelas_[SHEET_NAMES.SANTRI];
  const absensiTanggal = iaReadAbsensiKelompokRange_(ctx.kelompokId, santriAll.map(function (s) { return s.id; }), tanggal, tanggal);
  const statusMap = {};
  absensiTanggal.forEach(function (a) { statusMap[a.santri_id] = a.status; });

  const result = kelasOwned.map(function (kelas) {
    const kelasLower = kelas.toLowerCase();
    const santriKelas = santriAll.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; });
    const info = getKelasSessionInfo_(ctx.kelompokId, kelas, jadwalRowsAll, guruRowsAll) || {};
    const summary = {
      kelas: kelas, total: santriKelas.length, hadir: 0, izin: 0, sakit: 0, alpa: 0, belumInput: 0,
      ruangan: info.ruangan || '', jamMulai: info.jamMulai || '', jamSelesai: info.jamSelesai || '', kategori: info.kategori || '',
    };
    santriKelas.forEach(function (s) {
      const status = statusMap[s.id];
      if (status === 'hadir') summary.hadir++;
      else if (status === 'izin') summary.izin++;
      else if (status === 'sakit') summary.sakit++;
      else if (status === 'alpa') summary.alpa++;
      else summary.belumInput++;
    });
    return summary;
  });

  return { success: true, data: result };
}

/**
 * GET ringkasan kehadiran per kelas milik guru, DIAKUMULASI sepanjang rentang
 * tanggal (dipakai tombol Filter di Dashboard) — beda dari versi 1-hari di
 * atas: hadir/izin/sakit/alpa di sini jumlah SELURUH catatan absensi dalam
 * rentang (bukan per-santri per-hari), jadi tidak ada "belumInput".
 */
function serverGetGuruDashboardSummaryRange(token, tanggalMulai, tanggalSelesai) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggalMulai).match(/^\d{4}-\d{2}-\d{2}$/) || !String(tanggalSelesai).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }
  if (tanggalSelesai < tanggalMulai) {
    return { success: false, error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' };
  }

  // jadwal_kbm, guru, & santri dibaca SEKALI & PARALEL di sini (lihat
  // ERROR_LOG.md #19/#20/#21).
  const tabelKelas_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.GURU, SHEET_NAMES.SANTRI], ctx.kelompokId);
  const jadwalRowsAll = tabelKelas_[SHEET_NAMES.JADWAL_KBM];
  const guruRowsAll = tabelKelas_[SHEET_NAMES.GURU];
  const kelasOwned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId, jadwalRowsAll);
  const santriAll = tabelKelas_[SHEET_NAMES.SANTRI];
  const absensiRange = iaReadAbsensiKelompokRange_(ctx.kelompokId, santriAll.map(function (s) { return s.id; }), tanggalMulai, tanggalSelesai);

  const result = kelasOwned.map(function (kelas) {
    const kelasLower = kelas.toLowerCase();
    const santriIdsKelas = santriAll
      .filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; })
      .map(function (s) { return Number(s.id); });
    const info = getKelasSessionInfo_(ctx.kelompokId, kelas, jadwalRowsAll, guruRowsAll) || {};
    const summary = {
      kelas: kelas, total: santriIdsKelas.length, hadir: 0, izin: 0, sakit: 0, alpa: 0,
      ruangan: info.ruangan || '', jamMulai: info.jamMulai || '', jamSelesai: info.jamSelesai || '', kategori: info.kategori || '',
    };
    // Hari Aktif = jumlah tanggal BERBEDA yang sudah diisi guru utk kelas ini
    // (bukan jumlah catatan) -- kartu Dashboard mobile Kelp Petemon.
    const tanggalDiisi = {};
    absensiRange.forEach(function (a) {
      if (santriIdsKelas.indexOf(Number(a.santri_id)) === -1) return;
      if (a.status === 'hadir') summary.hadir++;
      else if (a.status === 'izin') summary.izin++;
      else if (a.status === 'sakit') summary.sakit++;
      else if (a.status === 'alpa') summary.alpa++;
      tanggalDiisi[tanggalKeString_(a.tanggal)] = true;
    });
    summary.hariAktif = Object.keys(tanggalDiisi).length;
    return summary;
  });

  return { success: true, data: result };
}

/**
 * Validasi token adalah akun 'admin_kelp' (mobile self-register, lihat
 * serverCompleteOnboardingAdminKelompok di Code.js — BEDA dari 'admin_kelompok'
 * desktop). Kembalikan {user, kelompokId} atau {success:false, error}.
 */
function requireAdminKelpContext_(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (user.role !== 'admin_kelp') return { success: false, error: 'Fitur ini khusus akun Admin Kelompok.' };
  return { success: true, user: user, kelompokId: user.scopeId };
}

/**
 * GET ringkasan kehadiran SEMUA kelas di Kelompok (bukan cuma milik 1 guru,
 * beda dari serverGetGuruDashboardSummaryRange di atas) — dipakai Dashboard
 * Kehadiran akun 'admin_kelp'. Tampilan kartu & filter Bulan-Tahun-nya SAMA
 * dengan dashboard guru (Script_Main.html → iaRenderDashboardCards_), cuma
 * sumber kelasnya "semua kelas Kelompok" (lihat getAllKelasInKelompok_ di
 * bawah), bukan "kelas milik guru_id ini".
 */
function serverGetAdminKelpDashboardSummaryRange(token, tanggalMulai, tanggalSelesai) {
  const ctx = requireAdminKelpContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggalMulai).match(/^\d{4}-\d{2}-\d{2}$/) || !String(tanggalSelesai).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }
  if (tanggalSelesai < tanggalMulai) {
    return { success: false, error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' };
  }

  const kelasList = getAllKelasInKelompok_(ctx.kelompokId);
  const tabelKelas_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.GURU, SHEET_NAMES.SANTRI], ctx.kelompokId);
  const jadwalRowsAll = tabelKelas_[SHEET_NAMES.JADWAL_KBM];
  const guruRowsAll = tabelKelas_[SHEET_NAMES.GURU];
  const santriAll = tabelKelas_[SHEET_NAMES.SANTRI];
  const absensiRange = iaReadAbsensiKelompokRange_(ctx.kelompokId, santriAll.map(function (s) { return s.id; }), tanggalMulai, tanggalSelesai);

  const result = kelasList.map(function (meta) {
    const kelasLower = meta.kelas.toLowerCase();
    const santriIdsKelas = santriAll
      .filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; })
      .map(function (s) { return Number(s.id); });
    const info = getKelasSessionInfo_(ctx.kelompokId, meta.kelas, jadwalRowsAll, guruRowsAll) || {};
    const summary = {
      kelas: meta.kelas, total: santriIdsKelas.length, hadir: 0, izin: 0, sakit: 0, alpa: 0,
      ruangan: info.ruangan || '', jamMulai: info.jamMulai || '', jamSelesai: info.jamSelesai || '',
      kategori: info.kategori || '', namaGuru: info.namaGuru || '',
    };
    const tanggalDiisi = {};
    absensiRange.forEach(function (a) {
      if (santriIdsKelas.indexOf(Number(a.santri_id)) === -1) return;
      if (a.status === 'hadir') summary.hadir++;
      else if (a.status === 'izin') summary.izin++;
      else if (a.status === 'sakit') summary.sakit++;
      else if (a.status === 'alpa') summary.alpa++;
      tanggalDiisi[tanggalKeString_(a.tanggal)] = true;
    });
    summary.hariAktif = Object.keys(tanggalDiisi).length;
    return summary;
  });

  return { success: true, data: result };
}

/**
 * GET KPI ringkas Dashboard Admin Kelp (Total Kelas / Total Generus /
 * Total Caberawit / Total Pra Remaja / Total Remaja SMA / Total Muda-Mudi,
 * masing² kelompok santri dipecah L/P) — endpoint TERPISAH dari
 * serverGetAdminKelpDashboardSummaryRange di atas (kartu per kelas yang
 * sudah ada), sengaja tidak digabung supaya tidak menyentuh fungsi itu.
 *
 * Caberawit/Pra Remaja/Remaja SMA = santri yang kelas_ngaji-nya termasuk
 * kategori "Cabe Rawit"/"Pra Remaja SMP"/"Remaja SMA" di Jadwal KBM (sama
 * definisi kategori yang sudah dipakai fitur Kehadiran Generus).
 *
 * Muda-Mudi SENGAJA beda sumber (bukan kategori Jadwal KBM — belum ada
 * kelas berkategori "Muda-Mudi" yang di-setting di Jadwal KBM Kelp Petemon
 * saat ini, jadi kategori itu selalu kosong): dihitung dari
 * `santri.jenjang_saat_ini === 'Remaja'` ("Remaja Pra Nikah", definisi yang
 * sudah dipakai `MONITORING_JENJANG_LABEL_`, Modul_Monitoring.gs) — sesuai
 * arahan user, "data Muda-Mudi diambil dari total Remaja Pra Nikah".
 */
function serverGetAdminKelpKpiSummary(token) {
  const ctx = requireAdminKelpContext_(token);
  if (!ctx.success) return ctx;

  const kelasList = getAllKelasInKelompok_(ctx.kelompokId);
  const tabelKelas_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.GURU, SHEET_NAMES.SANTRI], ctx.kelompokId);
  const jadwalRowsAll = tabelKelas_[SHEET_NAMES.JADWAL_KBM];
  const guruRowsAll = tabelKelas_[SHEET_NAMES.GURU];
  const santriAll = tabelKelas_[SHEET_NAMES.SANTRI];

  // Peta kelas (huruf kecil) -> kategori, dibangun SEKALI (bukan per santri).
  const kategoriByKelas = {};
  kelasList.forEach(function (meta) {
    const info = getKelasSessionInfo_(ctx.kelompokId, meta.kelas, jadwalRowsAll, guruRowsAll) || {};
    kategoriByKelas[meta.kelas.toLowerCase()] = info.kategori || '';
  });

  const bumpGender_ = function (bucket, gender) {
    bucket.total++;
    if (gender === 'L') bucket.l++;
    else if (gender === 'P') bucket.p++;
  };

  const totalGenerus = { total: 0, l: 0, p: 0 };
  const totalCaberawit = { total: 0, l: 0, p: 0 };
  const totalPraRemaja = { total: 0, l: 0, p: 0 };
  const totalRemajaSma = { total: 0, l: 0, p: 0 };
  const totalMudaMudi = { total: 0, l: 0, p: 0 };
  let totalKlsCaberawit = 0;
  kelasList.forEach(function (meta) {
    if (kategoriByKelas[meta.kelas.toLowerCase()] === 'Cabe Rawit') totalKlsCaberawit++;
  });

  santriAll.forEach(function (s) {
    const gender = String(s.gender || '').trim().toUpperCase();
    bumpGender_(totalGenerus, gender);

    const kelasKey = String(s.kelas_ngaji || '').trim().toLowerCase();
    const kategori = kelasKey ? kategoriByKelas[kelasKey] : '';
    if (kategori === 'Cabe Rawit') bumpGender_(totalCaberawit, gender);
    else if (kategori === 'Pra Remaja SMP') bumpGender_(totalPraRemaja, gender);
    else if (kategori === 'Remaja SMA') bumpGender_(totalRemajaSma, gender);

    if (String(s.jenjang_saat_ini || '').trim() === 'Remaja') bumpGender_(totalMudaMudi, gender);
  });

  return {
    success: true,
    data: {
      totalKelas: kelasList.length,
      totalKlsCaberawit: totalKlsCaberawit,
      totalGenerus: totalGenerus,
      totalCaberawit: totalCaberawit,
      totalPraRemaja: totalPraRemaja,
      totalRemajaSma: totalRemajaSma,
      totalMudaMudi: totalMudaMudi,
    },
  };
}

/**
 * ═════ MODE ADMIN (admin_ppg) — akses ke SEMUA Kelompok/Guru/Kelas ═════
 *
 * Admin PPG boleh pakai screen Input Absen yang sama, tapi TANPA dikunci ke
 * satu guru_id — bebas pilih Kelompok lalu kelas mana pun (bukan cuma
 * miliknya sendiri, karena admin_ppg memang tidak "punya" kelas). Dipisah
 * dari fungsi guru di atas (bukan menambah percabangan ke dalamnya) supaya
 * RBAC guru yang sudah teruji tidak ikut berubah.
 */
function requireAdminPpg_(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (user.role !== 'admin_ppg') return { success: false, error: 'Fitur ini khusus Admin PPG.' };
  return { success: true, user: user };
}

/**
 * GET semua Kelompok (Admin PPG tidak dibatasi Kelompok aktif tertentu,
 * beda dari ONBOARDING_ACTIVE_KELOMPOK_IDS_ yang khusus wizard guru).
 */
function serverGetInputAbsenKelompokOptionsAdmin(token) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;
  const list = readSheetAsObjects(SHEET_NAMES.KELOMPOK).map(function (k) { return { id: k.id, nama: k.nama }; });
  return { success: true, data: list };
}

/**
 * Semua nama kelas (jadwal_kbm.kelas, Aktif) di satu Kelompok — TIDAK
 * difilter per guru_id, beda dari getKelasOwnedByGuru_.
 */
function getAllKelasInKelompok_(kelompokId) {
  // jadwal_kbm & guru dibaca SEKALI & PARALEL di luar loop (bukan per-kelas),
  // lihat ERROR_LOG.md #19/#20/#21.
  const tabelKelas_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.GURU], kelompokId);
  const jadwalRowsAll = tabelKelas_[SHEET_NAMES.JADWAL_KBM];
  const guruRowsAll = tabelKelas_[SHEET_NAMES.GURU];
  const rows = jadwalRowsAll.filter(function (j) {
    return j.kelompok_id == kelompokId && (j.status || 'Aktif') === 'Aktif' && String(j.kelas || '').trim() !== '';
  });

  const seen = {};
  const result = [];
  rows.forEach(function (j) {
    const kelasTrim = String(j.kelas).trim();
    const key = kelasTrim.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    const info = getKelasSessionInfo_(kelompokId, kelasTrim, jadwalRowsAll, guruRowsAll) || {};
    result.push({
      kelas: kelasTrim,
      namaGuru: info.namaGuru || '(belum ada guru)',
      ruangan: info.ruangan || '',
      jamMulai: info.jamMulai || '',
      jamSelesai: info.jamSelesai || '',
    });
  });
  return result;
}

/**
 * @param {string} [preferKelas] - sama pola dengan serverGetKelasAbsenList:
 *   sekalian siapkan form santri kelas ini (atau kelas pertama) dalam
 *   response yang sama, supaya klik "Pilih Kelas" (mode Admin) juga cuma
 *   1 round-trip. Lihat ERROR_LOG.md #18/#19.
 */
function serverGetKelasAbsenListAdmin(token, kelompokId, tanggal, preferKelas) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const list = getAllKelasInKelompok_(kelompokId);
  const santriAll = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId);
  list.forEach(function (item) {
    const kelasLower = item.kelas.toLowerCase();
    item.santriCount = santriAll.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; }).length;
  });

  let formKelas = null;
  let formData = null;
  let formExpectedVersion = 0;
  if (list.length > 0) {
    let idx = -1;
    if (preferKelas) {
      idx = list.findIndex(function (it) { return it.kelas.toLowerCase() === String(preferKelas).toLowerCase(); });
    }
    if (idx < 0) idx = 0;
    formKelas = list[idx].kelas;
    const kelasLower = formKelas.toLowerCase();
    const santriKelas = santriAll.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; });
    const absensiExisting = iaReadAbsensiKelompokRange_(kelompokId, santriAll.map(function (s) { return s.id; }), tanggal, tanggal);
    const statusMap = {};
    absensiExisting.forEach(function (a) { statusMap[a.santri_id] = a.status; });
    formData = santriKelas.map(function (s) { return { santri_id: s.id, nama: s.nama, status: statusMap[s.id] || 'hadir' }; });
    if (isKelompokTableOnFirestore_(SHEET_NAMES.ABSENSI, kelompokId)) {
      formExpectedVersion = iaGetAbsensiSesiVersion_(kelompokId, formKelas, tanggal);
    }
  }

  return { success: true, data: list, formKelas: formKelas, formData: formData, formExpectedVersion: formExpectedVersion };
}

function serverGetAbsensiKelasFormAdmin(token, kelompokId, kelas, tanggal) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const santriKelas = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId).filter(function (s) {
    return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower;
  });

  const absensiExisting = iaReadAbsensiKelompokRange_(kelompokId, santriKelas.map(function (s) { return s.id; }), tanggal, tanggal);
  const statusMap = {};
  absensiExisting.forEach(function (a) { statusMap[a.santri_id] = a.status; });

  const formData = santriKelas.map(function (s) {
    return { santri_id: s.id, nama: s.nama, status: statusMap[s.id] || 'hadir' };
  });

  const expectedVersion = isKelompokTableOnFirestore_(SHEET_NAMES.ABSENSI, kelompokId)
    ? iaGetAbsensiSesiVersion_(kelompokId, kelas, tanggal)
    : 0;
  return { success: true, data: formData, expectedVersion: expectedVersion };
}

/**
 * Tahap 12 (2026-08-08): `expectedVersion` BARU -- admin override memakai
 * `withScriptLock_` yang SAMA + iaRewriteAbsensiKelas_ yang SAMA persis
 * dgn jalur guru, jadi mendapat proteksi concurrency yang SAMA (TIDAK ada
 * bypass version-check utk admin -- FIRESTORE_ATTENDANCE_CONCURRENCY_PROPOSAL.md §6).
 */
function serverSaveAbsensiKelasAdmin(token, kelompokId, kelas, tanggal, absensiList, expectedVersion) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const santriIdsKelas = iaReadKelompokTable_(SHEET_NAMES.SANTRI, kelompokId)
    .filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; })
    .map(function (s) { return s.id; });

  let result = null;
  withScriptLock_(function () {
    result = iaRewriteAbsensiKelas_(kelompokId, santriIdsKelas, tanggal, absensiList, ctx.user.id, kelas, expectedVersion);
  });

  if (result.conflict) {
    return {
      success: false,
      code: 'attendance-conflict',
      error: 'Data absensi sudah diperbarui oleh guru lain.',
      currentVersion: result.currentVersion,
    };
  }

  logAudit('absensi', 'kelas_' + kelas + '_' + tanggal, 'create', ctx.user.id, `Input Absen (Admin) kelas "${kelas}": ${result.count} santri`);
  return { success: true, message: `Absensi kelas "${kelas}" (${result.count} santri) berhasil disimpan.`, newVersion: result.newVersion };
}

/**
 * ═════ GURU IZIN (Izin Harian / Cuti) — tombol "Guru Izin" di layar Input Absen ═════
 * Guru mengajukan izin sendiri (tidak butuh approval admin, sifatnya
 * dokumentasi/notifikasi). Alasan "Lainnya" yang diketik guru disimpan supaya
 * jadi pilihan datalist bagi guru lain berikutnya (bukan per-guru, dibagi
 * lintas Kelompok — pola sama seperti datalist nama pengurus/ortu lain di app ini).
 */

/**
 * GET daftar alasan "Lainnya" yang pernah diketik guru sebelumnya (dedupe,
 * terbaru dulu) — dipakai isi datalist di modal Guru Izin.
 */
function serverGetGuruIzinAlasanSuggestions(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const rows = readSheetAsObjects(SHEET_NAMES.GURU_IZIN)
    .filter(function (r) { return r.alasan_kategori === 'lainnya' && String(r.alasan_detail || '').trim() !== ''; })
    .sort(function (a, b) { return String(b.dibuat_pada || '').localeCompare(String(a.dibuat_pada || '')); });

  const seen = {};
  const result = [];
  rows.forEach(function (r) {
    const key = String(r.alasan_detail).trim().toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      result.push(String(r.alasan_detail).trim());
    }
  });

  return { success: true, data: result };
}

/**
 * GET jumlah pengajuan izin guru ini di BULAN INI (berdasar tanggal_mulai) —
 * dipakai popup konfirmasi "Konfirmasi Izin Mengajar" sebelum tombol menu
 * "Guru Izin" membuka form (muncul mulai izin ke-2 dst, bukan izin pertama).
 */
function serverGetGuruIzinCountBulanIni(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const bulanIni = Utilities.formatDate(new Date(), tz, 'yyyy-MM');

  const count = readSheetAsObjects(SHEET_NAMES.GURU_IZIN).filter(function (r) {
    return r.guru_id == ctx.user.guruId && tanggalKeString_(r.tanggal_mulai).indexOf(bulanIni) === 0;
  }).length;

  return { success: true, data: { count: count } };
}

/**
 * SUBMIT pengajuan izin guru (Izin Harian / Cuti).
 * @param {Object} payload - { jenis, tanggalMulai, tanggalSelesai, alasanKategori, alasanDetail }
 */
function serverSubmitGuruIzin(token, payload) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  payload = payload || {};
  const jenis = payload.jenis;
  const tanggalMulai = payload.tanggalMulai;
  const tanggalSelesai = payload.tanggalSelesai || payload.tanggalMulai;
  const alasanKategori = payload.alasanKategori;
  const alasanDetail = String(payload.alasanDetail || '').trim();

  if (['harian', 'cuti'].indexOf(jenis) === -1) {
    return { success: false, error: 'Jenis izin tidak valid.' };
  }
  if (!String(tanggalMulai).match(/^\d{4}-\d{2}-\d{2}$/) || !String(tanggalSelesai).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Tanggal izin belum diisi dengan benar.' };
  }
  if (tanggalSelesai < tanggalMulai) {
    return { success: false, error: 'Tanggal selesai tidak boleh sebelum tanggal mulai.' };
  }
  if (['sakit', 'lainnya'].indexOf(alasanKategori) === -1) {
    return { success: false, error: 'Alasan izin belum dipilih.' };
  }
  if (alasanKategori === 'lainnya' && !alasanDetail) {
    return { success: false, error: 'Ketik alasan izin Anda.' };
  }

  const sudahAdaIzin = readSheetAsObjects(SHEET_NAMES.GURU_IZIN).some(function (r) {
    if (r.guru_id != ctx.user.guruId) return false;
    const mulaiE = tanggalKeString_(r.tanggal_mulai);
    const selesaiE = tanggalKeString_(r.tanggal_selesai) || mulaiE;
    return mulaiE <= tanggalSelesai && selesaiE >= tanggalMulai;
  });
  if (sudahAdaIzin) {
    return { success: false, error: 'Anda sudah mengajukan izin untuk tanggal tersebut. Tidak bisa mengajukan izin dobel di tanggal yang sama.', code: 'sudah-izin' };
  }

  let newId;
  withScriptLock_(function () {
    newId = generateId(SHEET_NAMES.GURU_IZIN);
    appendRowToSheet(SHEET_NAMES.GURU_IZIN, [
      newId, ctx.kelompokId, ctx.user.guruId, ctx.user.nama, jenis,
      tanggalMulai, tanggalSelesai, alasanKategori, alasanKategori === 'sakit' ? '' : alasanDetail,
      new Date().toISOString(),
    ]);
  });
  cacheDrop_(IA_KELOMPOK_TABLE_CACHE_KEY_.guru_izin(ctx.kelompokId));

  logAudit('guru_izin', String(newId), 'create', ctx.user.id, `Ajukan ${jenis === 'cuti' ? 'Cuti' : 'Izin Harian'} (${tanggalMulai} s/d ${tanggalSelesai})`);
  return { success: true, message: (jenis === 'cuti' ? 'Cuti' : 'Izin') + ' berhasil diajukan.' };
}

/**
 * Riwayat Kehadiran (mobile, "Kehadiran" > "Riwayat Kehadiran") — matrix
 * santri × tanggal 1 bulan, sama pola dgn serverGetKehadiranGenerusMatrix
 * (desktop Operasional > Kehadiran Generus > Detail Kehadiran), TAPI di-scope
 * ke SATU kelas milik guru ini SAJA (dipilih guru lewat popup "Pilih Kelas",
 * pola sama Input Kehadiran/Jurnal — lihat window.iaRiwayatOpenGate_).
 */
function serverGetRiwayatKehadiranGuru(token, year, month, kelas) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const tabelKelas_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.SANTRI], ctx.kelompokId);
  const jadwalRowsAll = tabelKelas_[SHEET_NAMES.JADWAL_KBM];
  const santriAll = tabelKelas_[SHEET_NAMES.SANTRI];

  const kelasOwnedLower = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId, jadwalRowsAll).map(function (k) { return k.toLowerCase(); });
  const kelasLower = String(kelas || '').trim().toLowerCase();
  if (!kelasLower || kelasOwnedLower.indexOf(kelasLower) === -1) {
    return { success: false, error: 'Kelas tidak ditemukan atau bukan milik Anda.' };
  }

  const santriList = santriAll.filter(function (s) {
    return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower;
  });
  const santriIds = santriList.map(function (s) { return String(s.id); });

  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Minggu, 6=Sabtu
    if (dow !== 0 && dow !== 6) {
      dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }

  const monthStart = dates.length > 0 ? dates[0] : `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = dates.length > 0 ? dates[dates.length - 1] : monthStart;
  const monthAbsensi = iaReadAbsensiKelompokRange_(ctx.kelompokId, santriIds, monthStart, monthEnd);

  const statusMap = {};
  const tanggalDiisi = {};
  monthAbsensi.forEach(function (a) {
    const id = String(a.santri_id);
    // monthAbsensi utk kelompok Firestore TIDAK di-filter santriIds (query
    // cuma di-scope tanggal) -- WAJIB cek di sini, kalau tidak Hari Aktif
    // ikut menghitung tanggal dari kelas LAIN di kelompok yang sama.
    if (santriIds.indexOf(id) === -1) return;
    if (!statusMap[id]) statusMap[id] = {};
    const tgl = tanggalKeString_(a.tanggal);
    statusMap[id][tgl] = a.status;
    // Hari Aktif = jumlah tanggal BERBEDA yang sudah diisi guru, APAPUN
    // statusnya (hadir/izin/sakit/alpa semua tetap dihitung) -- kartu
    // "Hari Aktif" di Riwayat Kehadiran mobile.
    tanggalDiisi[tgl] = true;
  });

  const rows = santriList.map(function (s) {
    return {
      id: s.id,
      nama: String(s.nama_panggilan || '').trim() || s.nama,
      statusByDate: statusMap[String(s.id)] || {},
    };
  });

  rows.sort(function (a, b) { return a.nama.localeCompare(b.nama); });

  return { success: true, dates: dates, data: rows, hariAktif: Object.keys(tanggalDiisi).length };
}
