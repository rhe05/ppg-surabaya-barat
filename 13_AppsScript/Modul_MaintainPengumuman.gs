/**
 * Modul_MaintainPengumuman.gs — CRUD Pengumuman per Kelompok
 * Server-side functions dipanggil dari Index.html (bagian "Pengumuman" di Dashboard Kelompok).
 *
 * RBAC: Admin Kelompok/Desa hanya bisa akses Kelompok yang jadi scope mereka. Admin PPG akses semua.
 *
 * ⚠️ ARSITEKTUR FIRESTORE (bukan Sheets lagi): modul ini TIDAK pakai
 * readSheetAsObjects/appendRowToSheet/updateRowByQuery/deleteRowByQuery
 * generik (yg dirancang untuk model flat/mirror-Sheets). Pengumuman disimpan
 * di path bersarang Firestore /kelompok/{kelompokId}/pengumuman/{id} —
 * dipanggil LANGSUNG lewat Modul_FirestoreBridge.gs, karena kelompokId
 * SELALU diketahui di setiap titik panggil (bukan tabel PPG-wide lintas
 * kelompok yang butuh collectionGroup query).
 */

/** Sub-kategori baku untuk kartu Pengumuman KBM & Musyawarah — samakan dengan window.PENGUMUMAN_KATEGORI_GROUPS_ di frontend.
    Kosong ('') tetap diterima (mis. dari generator "Buat Pengumuman KBM" yang bisa mencakup beberapa jenjang sekaligus) —
    entri begini masuk bucket "Lainnya" di frontend, bukan ditolak. */
const KATEGORI_PENGUMUMAN_ = ['Caberawit', 'Pra Remaja & Remaja SMA', 'Muda Mudi', 'Pra 5 Unsur', '5 Unsur', 'Khusus'];

/** Path Firestore koleksi Pengumuman 1 Kelompok. */
function pengumumanPath_(kelompokId) {
  return 'kelompok/' + kelompokId + '/pengumuman';
}

/**
 * GET daftar pengumuman untuk satu Kelompok, terbaru dulu.
 */
function serverGetPengumuman(token, kelompokId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const pengumuman = firestoreListCollection_(pengumumanPath_(kelompokId));
  pengumuman.sort((a, b) => String(b.tanggal || '').localeCompare(String(a.tanggal || '')));

  return { success: true, data: pengumuman };
}

/**
 * CREATE pengumuman baru.
 * Input: {kelompok_id, judul, isi, tanggal}
 */
function serverCreatePengumuman(token, pengumumanData) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!pengumumanData.kelompok_id || !pengumumanData.judul || !pengumumanData.isi) {
    return { success: false, error: 'Judul dan isi pengumuman wajib diisi.' };
  }

  const kategori = pengumumanData.kategori || '';
  if (kategori && KATEGORI_PENGUMUMAN_.indexOf(kategori) === -1) {
    return { success: false, error: 'Kategori tidak valid.' };
  }

  if (!validateUserAccess(token, 'kelompok', pengumumanData.kelompok_id)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  try {
    return withScriptLock_(function () {
      const path = pengumumanPath_(pengumumanData.kelompok_id);
      const id = firestoreGenerateIdInPath_(path);
      const now = new Date().toISOString().split('T')[0];
      const tanggal = pengumumanData.tanggal || now;

      const fields = {
        id: id,
        kelompok_id: pengumumanData.kelompok_id,
        judul: pengumumanData.judul.trim(),
        isi: pengumumanData.isi.trim(),
        tanggal: tanggal,
        dibuat_oleh: user.id,
        dibuat_pada: now,
        kategori: kategori,
      };
      firestoreCreateDoc_(path, String(id), fields);

      logAudit(SHEET_NAMES.PENGUMUMAN, id, 'create', user.id, `Pengumuman: ${pengumumanData.judul}`);
      return { success: true, message: 'Pengumuman berhasil ditambahkan.', id };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menyimpan: ' + e.message };
  }
}

/**
 * UPDATE pengumuman.
 * ⚠️ kelompokId WAJIB dikirim (beda dari pola Sheets lama) — path Firestore
 * butuh tahu subcollection kelompok mana sebelum bisa mencari dokumennya.
 */
function serverUpdatePengumuman(token, kelompokId, pengumumanId, updates) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke pengumuman ini.' };
  }

  const path = pengumumanPath_(kelompokId);
  const pengumuman = firestoreGetDoc_(path, String(pengumumanId));
  if (!pengumuman) return { success: false, error: 'Pengumuman tidak ditemukan.' };

  try {
    return withScriptLock_(function () {
      firestoreUpdateDoc_(path, String(pengumumanId), {
        judul: updates.judul !== undefined ? updates.judul.trim() : pengumuman.judul,
        isi: updates.isi !== undefined ? updates.isi.trim() : pengumuman.isi,
        tanggal: updates.tanggal !== undefined ? updates.tanggal : pengumuman.tanggal,
      });

      logAudit(SHEET_NAMES.PENGUMUMAN, pengumumanId, 'update', user.id, JSON.stringify(updates));
      return { success: true, message: 'Pengumuman berhasil diperbarui.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal memperbarui: ' + e.message };
  }
}

/**
 * DELETE pengumuman.
 * ⚠️ kelompokId WAJIB dikirim, sama alasannya dengan serverUpdatePengumuman.
 */
function serverDeletePengumuman(token, kelompokId, pengumumanId) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };

  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke pengumuman ini.' };
  }

  const path = pengumumanPath_(kelompokId);
  const pengumuman = firestoreGetDoc_(path, String(pengumumanId));
  if (!pengumuman) return { success: false, error: 'Pengumuman tidak ditemukan.' };

  try {
    return withScriptLock_(function () {
      firestoreDeleteDoc_(path, String(pengumumanId));
      logAudit(SHEET_NAMES.PENGUMUMAN, pengumumanId, 'delete', user.id, 'deleted');
      return { success: true, message: 'Pengumuman berhasil dihapus.' };
    });
  } catch (e) {
    return { success: false, error: 'Gagal menghapus: ' + e.message };
  }
}
