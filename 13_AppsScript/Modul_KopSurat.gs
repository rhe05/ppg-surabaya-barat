/**
 * Modul_KopSurat.gs — Konfigurasi kop surat (letterhead: logo + 2 baris teks +
 * warna + garis) untuk PDF Laporan Perkembangan Santri (Modul_Laporan.gs).
 *
 * SELALU disimpan di Firestore, TIDAK PERNAH di Sheets — ini data BARU (tidak
 * ada baris legacy yang perlu dimigrasi), dan logo base64 bisa jauh melebihi
 * batas 1 sel Sheets (~50rb karakter) tapi masih aman di bawah batas 1 MiB per
 * dokumen Firestore. Jadi tidak perlu percabangan Sheets/Firestore seperti
 * tabel lain di FIRESTORE_KELOMPOK_TABLES_ (Modul_Utilities.gs).
 *
 * Dokumen tunggal per kelompok+kategori (bukan tabel banyak baris), path:
 * kelompok/{kelompokId}/kop_surat/{kategoriSlug}. MVP (2026-07-30) baru
 * dipakai UI utk kategoriSlug 'cabe-rawit' — struktur sudah kategori-scoped
 * jadi kategori lain tinggal ditambah di UI tanpa ubah backend ini.
 */

function kopSuratPath_(kelompokId) {
  return 'kelompok/' + kelompokId + '/kop_surat';
}

/**
 * GET konfigurasi kop surat. Return { success, data: null } kalau belum pernah diatur.
 */
function serverGetKopSurat(token, kelompokId, kategoriSlug) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const doc = firestoreGetDoc_(kopSuratPath_(kelompokId), kategoriSlug);
  return { success: true, data: doc };
}

/**
 * SAVE (upsert) konfigurasi kop surat.
 * @param {Object} data - {logoBase64, baris1, baris2, warna, pakaiGaris}
 */
function serverSaveKopSurat(token, kelompokId, kategoriSlug, data) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const fields = {
    logo_base64: data.logoBase64 || '',
    baris1: data.baris1 || '',
    baris2: data.baris2 || '',
    warna: data.warna || '#0F172A',
    pakai_garis: !!data.pakaiGaris,
    diubah_oleh: user.id,
    diubah_pada: new Date().toISOString(),
  };

  try {
    return withScriptLock_(function () {
      const path = kopSuratPath_(kelompokId);
      const existing = firestoreGetDoc_(path, kategoriSlug);
      if (existing) {
        firestoreUpdateDoc_(path, kategoriSlug, fields);
      } else {
        firestoreCreateDoc_(path, kategoriSlug, fields);
      }
      return { success: true };
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}
