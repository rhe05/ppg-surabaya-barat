/**
 * Modul_MaintainGuru.gs — CRUD Data Guru
 * Server-side functions dipanggil dari Index.html (screen Data Guru).
 *
 * RBAC: Admin Kelompok hanya bisa akses Kelompok mereka sendiri.
 */

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
  // — baca dari cache ±50ms vs baca sheet 300-800ms.
  // forceFresh = true (tombol Refresh) menembus cache: baca langsung dari sheet.
  const cacheKey = 'guru_k' + kelompokId;
  let guru = forceFresh ? null : cacheGet_(cacheKey);
  if (!guru) {
    guru = readSheetAsObjects(SHEET_NAMES.GURU).filter(g => g.kelompok_id == kelompokId);
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
      const id = generateId(SHEET_NAMES.GURU);
      const guruSheet = getSheetByName(SHEET_NAMES.GURU);

      guruSheet.appendRow([
        id,
        kelompokId,
        guruData.nama.trim(),
        guruData.kategori,
        guruData.tempat_lahir || '',
        guruData.tanggal_lahir || '',
        guruData.jenis_kelamin || '',
        guruData.mulai_mengajar || '',
        guruData.alamat || '',
        guruData.nomor_wa || '',
        guruData.pendidikan || '',
        guruData.rt || '',
        guruData.rw || '',
        guruData.kelurahan || '',
        guruData.kode_pos || '',
        guruData.kabupaten_kota || '',
        guruData.provinsi || '',
        guruData.kecamatan || '',
        guruData.lama_mengajar || '',
      ]);

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
 */
function serverUpdateGuru(token, guruId, guruData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const guru = readSheetAsObjects(SHEET_NAMES.GURU).find(g => g.id == guruId);
  if (!guru) return { success: false, error: 'Guru tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', guru.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Guru ini.' };
  }

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
      updateRowByQuery(SHEET_NAMES.GURU, { id: guru.id }, updates);
      cacheDrop_('guru_k' + guru.kelompok_id);
      logAudit('guru', guruId, 'update', user.id, JSON.stringify(updates));
      return { success: true, message: 'Guru berhasil diperbarui.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal memperbarui: ' + e.message };
  }
}

/**
 * DELETE guru.
 */
function serverDeleteGuru(token, guruId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  const guru = readSheetAsObjects(SHEET_NAMES.GURU).find(g => g.id == guruId);
  if (!guru) return { success: false, error: 'Guru tidak ditemukan.' };

  if (!validateUserAccess(token, 'kelompok', guru.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Guru ini.' };
  }

  try {
    return withScriptLock_(function () {
      deleteRowByQuery(SHEET_NAMES.GURU, { id: guru.id });
      cacheDrop_('guru_k' + guru.kelompok_id);
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
