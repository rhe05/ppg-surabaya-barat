/**
 * Modul_KopSurat.gs — Konfigurasi kop surat (letterhead: logo + 3 baris teks
 * dgn tipografi per-baris + garis) untuk PDF Laporan Perkembangan Santri
 * (Modul_Laporan.gs). Baris 1 = Nama TPQ/TPA, Baris 2 = Nomor Izin
 * Operasional, Baris 3 = Alamat — masing-masing punya font/bold/ukuran/
 * warna/tata-letak sendiri.
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
 *
 * ⚠️ firestoreEncodeFields_ (Modul_FirestoreBridge.gs) cuma dukung nilai
 * skalar (string/number/boolean), TIDAK ADA nested object/array — makanya
 * tiap baris disimpan sbg field FLAT b1_teks/b1_font/dst, bukan array
 * `baris: [...]`. Klien kirim & terima persis bentuk flat yang sama
 * (lihat window.saveKopSurat_/loadKopSuratForm_ di Script_Main.html).
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
 * @param {Object} data - {logoBase64, pakaiGaris,
 *   b1Teks,b1Font,b1Bold,b1Ukuran,b1Warna,b1Align, b2Teks,..., b3Teks,...}
 */
function serverSaveKopSurat(token, kelompokId, kategoriSlug, data) {
  const user = getCurrentUser(token);
  if (!user) return { success: false, error: 'Sesi tidak valid.' };
  if (!validateUserAccess(token, 'kelompok', kelompokId)) {
    return { success: false, error: 'Anda tidak memiliki akses ke Kelompok ini.' };
  }

  const fields = {
    logo_base64: data.logoBase64 || '',
    pakai_garis: !!data.pakaiGaris,
    diubah_oleh: user.id,
    diubah_pada: new Date().toISOString(),
  };
  ['b1', 'b2', 'b3'].forEach(function (prefix) {
    fields[prefix + '_teks'] = data[prefix + 'Teks'] || '';
    fields[prefix + '_font'] = data[prefix + 'Font'] || 'Roboto';
    fields[prefix + '_bold'] = !!data[prefix + 'Bold'];
    fields[prefix + '_ukuran'] = Number(data[prefix + 'Ukuran']) || 10;
    fields[prefix + '_warna'] = data[prefix + 'Warna'] || '#0F172A';
    fields[prefix + '_align'] = data[prefix + 'Align'] || 'left';
  });

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
