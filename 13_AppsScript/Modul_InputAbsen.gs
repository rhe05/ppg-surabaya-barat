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
 * Ambil daftar nama kelas (jadwal_kbm.kelas, status Aktif) milik satu guru_id
 * di satu Kelompok. Dedupe case-insensitive, tampilkan versi asli pertama ditemukan.
 */
function getKelasOwnedByGuru_(kelompokId, guruId) {
  const rows = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM).filter(function (j) {
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
 * Cari guru_id "pemilik" satu nama kelas di satu Kelompok — dipakai menentukan
 * siapa yang harus approve permintaan akses. Owner = guru_id pada baris
 * jadwal_kbm Aktif dengan kelas itu yang paling baru dibuat (dibuat_pada).
 * Return null kalau kelas tidak ditemukan/tidak ada guru terpasang.
 */
function getKelasOwnerGuruId_(kelompokId, kelas) {
  const kelasLower = String(kelas).trim().toLowerCase();
  const rows = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM).filter(function (j) {
    return j.kelompok_id == kelompokId && (j.status || 'Aktif') === 'Aktif' &&
      String(j.kelas || '').trim().toLowerCase() === kelasLower && j.guru_id;
  });
  if (rows.length === 0) return null;
  rows.sort(function (a, b) { return String(b.dibuat_pada || '').localeCompare(String(a.dibuat_pada || '')); });
  return rows[0].guru_id;
}

/**
 * Cek apakah guru boleh input absen kelas tsb pada tanggal tsb:
 * pemilik kelas ATAU ada permintaan akses berstatus 'approved' utk tanggal itu.
 */
function canGuruAccessKelas_(kelompokId, guruId, kelas, tanggal) {
  const owned = getKelasOwnedByGuru_(kelompokId, guruId).map(function (k) { return k.toLowerCase(); });
  if (owned.indexOf(String(kelas).trim().toLowerCase()) !== -1) return true;

  const kelasLower = String(kelas).trim().toLowerCase();
  const approved = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST).some(function (r) {
    return r.kelompok_id == kelompokId && r.requester_guru_id == guruId &&
      String(r.kelas || '').trim().toLowerCase() === kelasLower &&
      tanggalKeString_(r.tanggal) === tanggal && r.status === 'approved';
  });
  return approved;
}

/**
 * GET data awal screen Input Absen: profil guru, daftar kelas milik sendiri,
 * dan jumlah permintaan akses masuk yang masih pending (badge notifikasi).
 */
function serverGetInputAbsenMeta(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const kelasOwned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId);
  const pendingIncoming = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST).filter(function (r) {
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
function serverGetKelasAbsenList(token, tanggal) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const owned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId);
  const list = owned.map(function (k) { return { kelas: k, isOwn: true }; });

  const approvedExtra = readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST).filter(function (r) {
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

  // Isi jumlah santri per kelas supaya kartu pilihan kelas tidak kosong info.
  const santriAll = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(function (s) { return s.kelompok_id == ctx.kelompokId; });
  list.forEach(function (item) {
    const kelasLower = item.kelas.toLowerCase();
    item.santriCount = santriAll.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; }).length;
  });

  return { success: true, data: list };
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
  const santriKelas = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(function (s) {
    return s.kelompok_id == ctx.kelompokId && String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower;
  });

  const absensiExisting = readSheetAsObjects(SHEET_NAMES.ABSENSI).filter(function (a) {
    return tanggalKeString_(a.tanggal) === tanggal;
  });
  const statusMap = {};
  absensiExisting.forEach(function (a) { statusMap[a.santri_id] = a.status; });

  const formData = santriKelas.map(function (s) {
    return { santri_id: s.id, nama: s.nama, status: statusMap[s.id] || 'hadir' };
  });

  return { success: true, data: formData };
}

/**
 * SAVE absensi satu kelas pada satu tanggal. Hanya menghapus/menulis ulang
 * baris absensi milik santri DI KELAS INI (bukan seluruh Kelompok) supaya
 * tidak menimpa input kelas lain di tanggal yang sama.
 */
function serverSaveAbsensiKelas(token, kelas, tanggal, absensiList) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }
  if (!canGuruAccessKelas_(ctx.kelompokId, ctx.user.guruId, kelas, tanggal)) {
    return { success: false, error: 'Anda belum memiliki akses ke kelas ini pada tanggal tersebut.' };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const santriIdsKelas = readSheetAsObjects(SHEET_NAMES.SANTRI)
    .filter(function (s) { return s.kelompok_id == ctx.kelompokId && String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; })
    .map(function (s) { return s.id; });

  let count = 0;
  withScriptLock_(function () {
    const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);
    absensiData.forEach(function (a) {
      if (tanggalKeString_(a.tanggal) === tanggal && santriIdsKelas.includes(Number(a.santri_id))) {
        deleteRowByQuery(SHEET_NAMES.ABSENSI, { id: a.id });
      }
    });

    absensiList.forEach(function (item) {
      if (santriIdsKelas.includes(Number(item.santri_id))) {
        const id = generateId(SHEET_NAMES.ABSENSI);
        appendRowToSheet(SHEET_NAMES.ABSENSI, [id, item.santri_id, tanggal, item.status, ctx.user.id]);
        count++;
      }
    });
  });

  logAudit('absensi', 'kelas_' + kelas + '_' + tanggal, 'create', ctx.user.id, `Input Absen kelas "${kelas}": ${count} santri`);
  return { success: true, message: `Absensi kelas "${kelas}" (${count} santri) berhasil disimpan.` };
}

/**
 * GET daftar kelas LAIN (bukan milik sendiri) di Kelompok yang sama, untuk
 * modal "Minta Akses Kelas Lain".
 */
function serverListKelasUntukPermintaan(token) {
  const ctx = requireGuruContext_(token);
  if (!ctx.success) return ctx;

  const owned = getKelasOwnedByGuru_(ctx.kelompokId, ctx.user.guruId).map(function (k) { return k.toLowerCase(); });
  const rows = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM).filter(function (j) {
    return j.kelompok_id == ctx.kelompokId && (j.status || 'Aktif') === 'Aktif' && String(j.kelas || '').trim() !== '';
  });
  const guruMap = {};
  readSheetAsObjects(SHEET_NAMES.GURU).forEach(function (g) { guruMap[g.id] = g.nama; });

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

  return { success: true, message: decision === 'approved' ? 'Permintaan disetujui.' : 'Permintaan ditolak.' };
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
  const rows = readSheetAsObjects(SHEET_NAMES.JADWAL_KBM).filter(function (j) {
    return j.kelompok_id == kelompokId && (j.status || 'Aktif') === 'Aktif' && String(j.kelas || '').trim() !== '';
  });
  const guruMap = {};
  readSheetAsObjects(SHEET_NAMES.GURU).forEach(function (g) { guruMap[g.id] = g.nama; });

  const seen = {};
  const result = [];
  rows.forEach(function (j) {
    const kelasTrim = String(j.kelas).trim();
    const key = kelasTrim.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    result.push({ kelas: kelasTrim, namaGuru: guruMap[j.guru_id] || '(belum ada guru)' });
  });
  return result;
}

function serverGetKelasAbsenListAdmin(token, kelompokId, tanggal) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const list = getAllKelasInKelompok_(kelompokId);
  const santriAll = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(function (s) { return s.kelompok_id == kelompokId; });
  list.forEach(function (item) {
    const kelasLower = item.kelas.toLowerCase();
    item.santriCount = santriAll.filter(function (s) { return String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; }).length;
  });

  return { success: true, data: list };
}

function serverGetAbsensiKelasFormAdmin(token, kelompokId, kelas, tanggal) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const santriKelas = readSheetAsObjects(SHEET_NAMES.SANTRI).filter(function (s) {
    return s.kelompok_id == kelompokId && String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower;
  });

  const absensiExisting = readSheetAsObjects(SHEET_NAMES.ABSENSI).filter(function (a) {
    return tanggalKeString_(a.tanggal) === tanggal;
  });
  const statusMap = {};
  absensiExisting.forEach(function (a) { statusMap[a.santri_id] = a.status; });

  const formData = santriKelas.map(function (s) {
    return { santri_id: s.id, nama: s.nama, status: statusMap[s.id] || 'hadir' };
  });

  return { success: true, data: formData };
}

function serverSaveAbsensiKelasAdmin(token, kelompokId, kelas, tanggal, absensiList) {
  const ctx = requireAdminPpg_(token);
  if (!ctx.success) return ctx;
  if (!String(tanggal).match(/^\d{4}-\d{2}-\d{2}$/)) {
    return { success: false, error: 'Format tanggal tidak valid.' };
  }

  const kelasLower = String(kelas).trim().toLowerCase();
  const santriIdsKelas = readSheetAsObjects(SHEET_NAMES.SANTRI)
    .filter(function (s) { return s.kelompok_id == kelompokId && String(s.kelas_ngaji || '').trim().toLowerCase() === kelasLower; })
    .map(function (s) { return s.id; });

  let count = 0;
  withScriptLock_(function () {
    const absensiData = readSheetAsObjects(SHEET_NAMES.ABSENSI);
    absensiData.forEach(function (a) {
      if (tanggalKeString_(a.tanggal) === tanggal && santriIdsKelas.includes(Number(a.santri_id))) {
        deleteRowByQuery(SHEET_NAMES.ABSENSI, { id: a.id });
      }
    });

    absensiList.forEach(function (item) {
      if (santriIdsKelas.includes(Number(item.santri_id))) {
        const id = generateId(SHEET_NAMES.ABSENSI);
        appendRowToSheet(SHEET_NAMES.ABSENSI, [id, item.santri_id, tanggal, item.status, ctx.user.id]);
        count++;
      }
    });
  });

  logAudit('absensi', 'kelas_' + kelas + '_' + tanggal, 'create', ctx.user.id, `Input Absen (Admin) kelas "${kelas}": ${count} santri`);
  return { success: true, message: `Absensi kelas "${kelas}" (${count} santri) berhasil disimpan.` };
}
