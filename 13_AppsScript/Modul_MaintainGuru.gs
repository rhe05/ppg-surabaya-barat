/**
 * Modul_MaintainGuru.gs — CRUD Data Guru
 * Server-side functions dipanggil dari Index.html (screen Data Guru).
 *
 * RBAC: Admin Kelompok hanya bisa akses Kelompok mereka sendiri.
 *
 * ⚠️ ROLLOUT FIRESTORE PER-KELOMPOK (bukan per-tabel spt FIRESTORE_TABLES_):
 * hanya kelompok yang ID-nya ada di FIRESTORE_KELOMPOK_GURU_ yang baca/tulis
 * lewat Firestore (/kelompok/{id}/guru/{id}) — kelompok lain TETAP di Sheets,
 * tidak berubah sama sekali. Ini sengaja supaya migrasi bisa diuji praktik
 * di 1 kelompok dulu (Kelp Petemon) sebelum semua kelompok lain ikut pindah.
 */

/** Kelompok yang tabel 'guru'-nya SUDAH dipindah ke Firestore. KOSONG dulu —
    diisi ['1'] (Kelp Petemon) SETELAH data lama disalin ke Firestore lewat
    ?diag=migrate&table=guru&kelompok=1&mode=copy (jangan urutan terbalik,
    nanti data kelompok itu tampak hilang di antara deploy). */
const FIRESTORE_KELOMPOK_GURU_ = [];

function guruPath_(kelompokId) {
  return 'kelompok/' + kelompokId + '/guru';
}

function isGuruOnFirestore_(kelompokId) {
  return FIRESTORE_KELOMPOK_GURU_.indexOf(String(kelompokId)) !== -1;
}

/**
 * GET guru per Kelompok (dengan search).
 */
function serverGetGuruList(token, kelompokId, searchQuery = '', forceFresh = false) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  // Cache per-kelompok (di-invalidate oleh setiap Add/Update/Delete di bawah)
  // — baca dari cache ±50ms vs baca sheet/Firestore 300-800ms.
  // forceFresh = true (tombol Refresh) menembus cache: baca langsung dari sumber.
  const cacheKey = 'guru_k' + kelompokId;
  let guru = forceFresh ? null : cacheGet_(cacheKey);
  if (!guru) {
    guru = isGuruOnFirestore_(kelompokId)
      ? firestoreListCollection_(guruPath_(kelompokId))
      : readSheetAsObjects(SHEET_NAMES.GURU).filter(g => g.kelompok_id == kelompokId);
    cachePut_(cacheKey, guru, 300);
  }

  // Search by nama
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    guru = guru.filter(g => String(g.nama).toLowerCase().includes(q));
  }

  return { success: true, data: guru };
}

/**
 * ADD guru baru.
 */
function serverAddGuru(token, kelompokId, guruData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  if (!guruData.nama || !guruData.kategori) {
    return { success: false, error: 'Nama dan Kategori wajib diisi.' };
  }

  try {
    return withScriptLock_(function () {
      const fields = {
        kelompok_id: kelompokId,
        nama: guruData.nama.trim(),
        kategori: guruData.kategori,
        tempat_lahir: guruData.tempat_lahir || '',
        tanggal_lahir: guruData.tanggal_lahir || '',
        jenis_kelamin: guruData.jenis_kelamin || '',
        mulai_mengajar: guruData.mulai_mengajar || '',
        alamat: guruData.alamat || '',
        nomor_wa: guruData.nomor_wa || '',
        pendidikan: guruData.pendidikan || '',
        rt: guruData.rt || '',
        rw: guruData.rw || '',
        kelurahan: guruData.kelurahan || '',
        kode_pos: guruData.kode_pos || '',
        kabupaten_kota: guruData.kabupaten_kota || '',
        provinsi: guruData.provinsi || '',
        kecamatan: guruData.kecamatan || '',
        lama_mengajar: guruData.lama_mengajar || '',
      };

      let id;
      if (isGuruOnFirestore_(kelompokId)) {
        const path = guruPath_(kelompokId);
        id = firestoreGenerateIdInPath_(path);
        fields.id = id;
        firestoreCreateDoc_(path, String(id), fields);
      } else {
        id = generateId(SHEET_NAMES.GURU);
        appendRowToSheet(SHEET_NAMES.GURU, [
          id,
          kelompokId,
          fields.nama,
          fields.kategori,
          fields.tempat_lahir,
          fields.tanggal_lahir,
          fields.jenis_kelamin,
          fields.mulai_mengajar,
          fields.alamat,
          fields.nomor_wa,
          fields.pendidikan,
          fields.rt,
          fields.rw,
          fields.kelurahan,
          fields.kode_pos,
          fields.kabupaten_kota,
          fields.provinsi,
          fields.kecamatan,
          fields.lama_mengajar,
        ]);
      }

      cacheDrop_('guru_k' + kelompokId);
      logAudit('guru', id, 'create', user.id, JSON.stringify(guruData));
      return { success: true, message: 'Guru berhasil ditambahkan.', id: id };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menyimpan: ' + e.message };
  }
}

/**
 * UPDATE guru.
 * ⚠️ kelompokId WAJIB dikirim (dibutuhkan utk tahu apakah kelompok ini sudah
 * di Firestore atau masih Sheets, dan path Firestore-nya kalau sudah pindah).
 */
function serverUpdateGuru(token, kelompokId, guruId, guruData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Guru ini.' };
  }

  const onFirestore = isGuruOnFirestore_(kelompokId);
  const guru = onFirestore
    ? firestoreGetDoc_(guruPath_(kelompokId), String(guruId))
    : readSheetAsObjects(SHEET_NAMES.GURU).find(g => g.id == guruId);
  if (!guru) return { success: false, error: 'Guru tidak ditemukan.' };

  const updates = {
    nama: guruData.nama?.trim() || guru.nama,
    kategori: guruData.kategori || guru.kategori,
    jenis_kelamin: guruData.jenis_kelamin !== undefined ? guruData.jenis_kelamin : guru.jenis_kelamin,
    tempat_lahir: guruData.tempat_lahir !== undefined ? guruData.tempat_lahir : guru.tempat_lahir,
    tanggal_lahir: guruData.tanggal_lahir !== undefined ? guruData.tanggal_lahir : guru.tanggal_lahir,
    mulai_mengajar: guruData.mulai_mengajar !== undefined ? guruData.mulai_mengajar : guru.mulai_mengajar,
    alamat: guruData.alamat !== undefined ? guruData.alamat : guru.alamat,
    rt: guruData.rt !== undefined ? guruData.rt : guru.rt,
    rw: guruData.rw !== undefined ? guruData.rw : guru.rw,
    kelurahan: guruData.kelurahan !== undefined ? guruData.kelurahan : guru.kelurahan,
    kode_pos: guruData.kode_pos !== undefined ? guruData.kode_pos : guru.kode_pos,
    kabupaten_kota: guruData.kabupaten_kota !== undefined ? guruData.kabupaten_kota : guru.kabupaten_kota,
    provinsi: guruData.provinsi !== undefined ? guruData.provinsi : guru.provinsi,
    kecamatan: guruData.kecamatan !== undefined ? guruData.kecamatan : guru.kecamatan,
    lama_mengajar: guruData.lama_mengajar !== undefined ? guruData.lama_mengajar : guru.lama_mengajar,
    nomor_wa: guruData.nomor_wa !== undefined ? guruData.nomor_wa : guru.nomor_wa,
    pendidikan: guruData.pendidikan !== undefined ? guruData.pendidikan : guru.pendidikan,
  };

  try {
    return withScriptLock_(function () {
      if (onFirestore) {
        firestoreUpdateDoc_(guruPath_(kelompokId), String(guruId), updates);
      } else {
        updateRowByQuery(SHEET_NAMES.GURU, { id: guru.id }, updates);
      }
      cacheDrop_('guru_k' + kelompokId);
      logAudit('guru', guruId, 'update', user.id, JSON.stringify(updates));
      return { success: true, message: 'Guru berhasil diperbarui.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal memperbarui: ' + e.message };
  }
}

/**
 * DELETE guru.
 * ⚠️ kelompokId WAJIB dikirim, sama alasannya dengan serverUpdateGuru.
 */
function serverDeleteGuru(token, kelompokId, guruId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Guru ini.' };
  }

  const onFirestore = isGuruOnFirestore_(kelompokId);
  const guru = onFirestore
    ? firestoreGetDoc_(guruPath_(kelompokId), String(guruId))
    : readSheetAsObjects(SHEET_NAMES.GURU).find(g => g.id == guruId);
  if (!guru) return { success: false, error: 'Guru tidak ditemukan.' };

  try {
    return withScriptLock_(function () {
      if (onFirestore) {
        firestoreDeleteDoc_(guruPath_(kelompokId), String(guruId));
      } else {
        deleteRowByQuery(SHEET_NAMES.GURU, { id: guru.id });
      }
      cacheDrop_('guru_k' + kelompokId);
      logAudit('guru', guruId, 'delete', user.id, 'deleted');
      return { success: true, message: 'Guru berhasil dihapus.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menghapus: ' + e.message };
  }
}

/**
 * GET guru summary by kategori (Muballigh Tugasan vs Muballigh Setempat).
 * Return: {total_guru, tugasan_count, setempat_count}
 * ⚠️ TIDAK diubah — sudah PPG-wide (baca semua guru lintas kelompok) sejak
 * awal, di luar cakupan migrasi per-kelompok ini.
 */
function serverGetGuruSummary(token) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const guruData = readSheetAsObjects(SHEET_NAMES.GURU);

  const tugasan = guruData.filter(g => g.kategori === 'Muballigh Tugasan').length;
  const setempat = guruData.filter(g => g.kategori === 'Muballigh Setempat').length;
  const total = guruData.length;

  return {
    success: true,
    data: {
      total_guru: total,
      tugasan_count: tugasan,
      setempat_count: setempat,
    },
  };
}
