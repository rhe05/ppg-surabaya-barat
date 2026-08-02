/**
 * Modul_Jurnal.gs — Input Jurnal (catatan materi KBM per kelas per tanggal).
 * Dipakai baik oleh Dashboard Kelompok desktop (tab Operasional, admin bisa
 * lihat/tambah/edit/hapus jurnal kelas manapun) MAUPUN mobile app guru
 * (Modul_InputAbsen.gs pola yang sama — guru cuma boleh isi kelas miliknya).
 *
 * SELALU Firestore, TIDAK PERNAH Sheets — fitur baru, tidak ada data lama yang
 * perlu dimigrasi (pola sama Modul_KopSurat.gs). Satu dokumen = SATU kelas
 * SATU tanggal (beda dari absensi yang 1 dokumen per santri per tanggal),
 * jadi jumlah dokumen 20 tahun ke depan tetap kecil & murah:
 * ±20 kelas × ±300 hari efektif/tahun × 20 tahun ≈ 120rb dokumen per
 * kelompok — jauh di bawah skala yang bikin Firestore mahal/lambat.
 *
 * Document ID DITENTUKAN (bukan auto-increment) = slug(kelas) + '__' + tanggal
 * → baca/tulis 1 entri kelas+tanggal tertentu SELALU direct-by-id (1 read/write
 * murah, TANPA scan koleksi/generateId), sekaligus upsert alami (guru edit
 * ulang jurnal hari yang sama = timpa dokumen yang sama, bukan baris baru).
 * Path: kelompok/{kelompokId}/jurnal_kbm/{docId}.
 */

/** Slug kelas dipakai sbg bagian docId — huruf kecil, non-alfanumerik jadi '-'. */
function jurnalKelasSlug_(kelas) {
  return String(kelas).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kelas';
}

function jurnalDocId_(kelas, tanggal) {
  return jurnalKelasSlug_(kelas) + '__' + tanggal;
}

function jurnalPath_(kelompokId) {
  return 'kelompok/' + kelompokId + '/jurnal_kbm';
}

/** GET 1 entri jurnal kelas+tanggal — direct-by-id, TIDAK list seluruh koleksi. */
function jurnalGetEntry_(kelompokId, kelas, tanggal) {
  return firestoreGetDoc_(jurnalPath_(kelompokId), jurnalDocId_(kelas, tanggal));
}

/** Upsert 1 entri jurnal. WAJIB dipanggil di dalam withScriptLock_. */
function jurnalSaveEntry_(kelompokId, kelas, tanggal, materi, catatan, guruId, dicatatOleh) {
  const path = jurnalPath_(kelompokId);
  const docId = jurnalDocId_(kelas, tanggal);
  const fields = {
    id: docId,
    kelompok_id: String(kelompokId),
    kelas: String(kelas).trim(),
    tanggal: tanggal,
    guru_id: guruId ? String(guruId) : '',
    materi: String(materi || '').trim(),
    catatan: String(catatan || '').trim(),
    dicatat_oleh: dicatatOleh || '',
    diperbarui_pada: new Date().toISOString(),
  };
  const existing = firestoreGetDoc_(path, docId);
  if (existing) {
    firestoreUpdateDoc_(path, docId, fields);
  } else {
    firestoreCreateDoc_(path, docId, fields);
  }
  return fields;
}

/* ═════ Guru mobile (Modul_InputAbsen.gs pola: requireGuruContext_,
   getKelasOwnedByGuru_, getKelasSessionInfo_, canGuruAccessKelas_) ═════ */

/**
 * Daftar kelas milik guru + info sesi (kategori/ruangan/jam) — dipakai ulang
 * oleh serverGetJurnalKelasList (Input Jurnal, butuh formData sekalian) dan
 * serverGetJurnalKelasOnly (Edit Jurnal, cuma butuh daftar kelas, TIDAK ada
 * tanggal spesifik jadi TIDAK ada formData yang relevan).
 */
function jurnalKelasListForGuru_(ctx) {
  const tabelKelas_ = iaReadKelompokTablesParallel_([SHEET_NAMES.JADWAL_KBM, SHEET_NAMES.GURU], ctx.kelompokId);
  const jadwalRowsAll = tabelKelas_[SHEET_NAMES.JADWAL_KBM];
  const guruRowsAll = tabelKelas_[SHEET_NAMES.GURU];

  const kelasNames = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId, jadwalRowsAll);
  return kelasNames.map(function (kelas) {
    const info = getKelasSessionInfo_(ctx.kelompokId, kelas, jadwalRowsAll, guruRowsAll) || {};
    return {
      kelas: kelas,
      kategori: info.kategori || '',
      ruangan: info.ruangan || '',
      jamMulai: info.jamMulai || '',
      jamSelesai: info.jamSelesai || '',
    };
  });
}

/**
 * GET daftar kelas milik guru + (kalau ada preferKelas yang cocok) jurnal
 * kelas itu sekalian — sama seperti serverGetKelasAbsenList, supaya popup
 * pilih kelas & form jurnal tidak perlu 2 round-trip terpisah. Dipakai oleh
 * mode "Input Jurnal" (guru isi jurnal TANGGAL TERPILIH di header).
 */
function serverGetJurnalKelasList(token, tanggal, preferKelas) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const data = jurnalKelasListForGuru_(ctx);
  const result = { success: true, data: data };
  if (data.length === 0) return result;

  let chosenKelas = data[0].kelas;
  if (preferKelas) {
    const match = data.find(function (d) { return d.kelas.toLowerCase() === String(preferKelas).toLowerCase(); });
    if (match) chosenKelas = match.kelas;
  }

  const entry = jurnalGetEntry_(ctx.kelompokId, chosenKelas, tanggal);
  result.formKelas = chosenKelas;
  result.formData = { materi: entry ? entry.materi : '', catatan: entry ? entry.catatan : '' };
  result.formTersimpan = !!entry;

  return result;
}

/**
 * GET daftar kelas milik guru SAJA, TANPA lookup jurnal tanggal tertentu —
 * dipakai oleh mode "Edit Jurnal" (guru pilih kelas dulu, lalu browse RIWAYAT
 * semua tanggal yang sudah pernah diisi, bukan 1 tanggal spesifik).
 */
function serverGetJurnalKelasOnly(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  return { success: true, data: jurnalKelasListForGuru_(ctx) };
}

/**
 * GET riwayat SEMUA jurnal 1 kelas (semua tanggal yang pernah diisi, terbaru
 * dulu) — dipakai layar "Edit Jurnal". SENGAJA hanya kelas MILIK SENDIRI
 * (bukan kelas pinjaman via akses_kelas_request) — guru cuma boleh
 * lihat/edit riwayat jurnal kelasnya sendiri.
 */
function serverGetJurnalRiwayat(token, kelas) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const owned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId).map(function (k) { return k.toLowerCase(); });
  if (owned.indexOf(String(kelas).trim().toLowerCase()) === -1) {
    return { success: false, error: 'Anda tidak punya akses ke kelas ini.' };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const rows = firestoreListCollection_(jurnalPath_(ctx.kelompokId)).filter(function (j) {
    return String(j.kelas || '').trim().toLowerCase() === kelasLower;
  });
  rows.sort(function (a, b) { return String(b.tanggal || '').localeCompare(String(a.tanggal || '')); });

  return {
    success: true,
    data: rows.map(function (r) { return { tanggal: r.tanggal, materi: r.materi || '', catatan: r.catatan || '' }; }),
  };
}

/** GET jurnal 1 kelas+tanggal (dipanggil saat guru ganti kelas via chip). */
function serverGetJurnalForm(token, kelas, tanggal) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const owned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId).map(function (k) { return k.toLowerCase(); });
  const hasAccess = owned.indexOf(String(kelas).trim().toLowerCase()) !== -1
    || canGuruAccessKelas_(ctx.kelompokId, ctx.user.guruId, kelas, tanggal);
  if (!hasAccess) return { success: false, error: 'Anda tidak punya akses ke kelas ini.' };

  const entry = jurnalGetEntry_(ctx.kelompokId, kelas, tanggal);
  return {
    success: true,
    data: { materi: entry ? entry.materi : '', catatan: entry ? entry.catatan : '' },
    tersimpan: !!entry,
  };
}

/** SIMPAN jurnal (guru mobile, kelas milik sendiri atau akses yang di-approve). */
function serverSaveJurnal(token, kelas, tanggal, materi, catatan) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }
  if (!String(materi || '').trim()) {
    return { success: false, error: 'Materi wajib diisi.' };
  }

  const owned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId).map(function (k) { return k.toLowerCase(); });
  const hasAccess = owned.indexOf(String(kelas).trim().toLowerCase()) !== -1
    || canGuruAccessKelas_(ctx.kelompokId, ctx.user.guruId, kelas, tanggal);
  if (!hasAccess) return { success: false, error: 'Anda tidak punya akses ke kelas ini.' };

  try {
    return withScriptLock_(function () {
      jurnalSaveEntry_(ctx.kelompokId, kelas, tanggal, materi, catatan, ctx.user.guruId, ctx.user.nama);
      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/* ═════ Desktop Dashboard Kelompok (admin — tab Operasional) ═════ */

/** GET daftar jurnal 1 bulan (utk tabel Input Jurnal di Operasional). */
function serverGetJurnalListKelompok(token, kelompokId, bulan, tahun) {
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const prefix = tahun + '-' + String(bulan).padStart(2, '0');
  const all = firestoreListCollection_(jurnalPath_(kelompokId));
  const filtered = all.filter(function (j) { return String(j.tanggal || '').indexOf(prefix) === 0; });

  const guruMap = {};
  iaReadKelompokTable_(SHEET_NAMES.GURU, kelompokId).forEach(function (g) { guruMap[g.id] = g.nama; });

  filtered.sort(function (a, b) {
    return String(b.tanggal || '').localeCompare(String(a.tanggal || '')) || String(a.kelas || '').localeCompare(String(b.kelas || ''));
  });

  const data = filtered.map(function (j) {
    return {
      id: j.id,
      kelas: j.kelas,
      tanggal: j.tanggal,
      materi: j.materi || '',
      catatan: j.catatan || '',
      guru_id: j.guru_id || '',
      guru_nama: guruMap[j.guru_id] || '(guru tidak ditemukan)',
    };
  });

  return { success: true, data: data };
}

/**
 * SIMPAN (upsert) jurnal dari panel admin — guru_id diambil otomatis dari
 * pemilik kelas di Jadwal KBM (sama seperti getKelasOwnerGuruId_), admin
 * tidak perlu pilih guru manual.
 */
function serverSaveJurnalAdmin(token, kelompokId, kelas, tanggal, materi, catatan) {
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }
  if (!kelas || !String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Kelas dan tanggal wajib diisi dengan benar.' };
  }
  if (!String(materi || '').trim()) {
    return { success: false, error: 'Materi wajib diisi.' };
  }

  const user = getCurrentUser(token);
  const guruId = getKelasOwnerGuruId_(kelompokId, kelas);

  try {
    return withScriptLock_(function () {
      const saved = jurnalSaveEntry_(kelompokId, kelas, tanggal, materi, catatan, guruId, user.nama);
      return { success: true, data: saved };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/** HAPUS 1 entri jurnal (panel admin). */
function serverDeleteJurnalAdmin(token, kelompokId, kelas, tanggal) {
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }
  try {
    firestoreDeleteDoc_(jurnalPath_(kelompokId), jurnalDocId_(kelas, tanggal));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
