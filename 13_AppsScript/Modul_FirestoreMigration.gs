/**
 * Modul_FirestoreMigration.gs — Skrip migrasi per-tabel Sheets → Firestore.
 *
 * Fase 3 dari migrasi (lihat rencana migrasi, file plan). Isinya BUKAN bagian
 * dari alur aplikasi pengguna — dipanggil manual lewat endpoint diagnostik
 * (?diag=migrate, ?diag=pilottest di Code.js) saat memindahkan 1 tabel.
 */

/**
 * Salin semua baris dari Sheet ke Firestore collection TOP-LEVEL (flat/mirror),
 * pakai `id` yang sudah ada sbg ID dokumen. AMAN DIJALANKAN BERULANG — baris
 * yang sudah ada di Firestore tidak ditimpa (firestoreCreateDoc_ deteksi 409).
 * Cocok HANYA utk tabel PPG-wide (ppg/desa/kelompok/users/audit_log/files/
 * periode_munaqosah) — lihat FIRESTORE_TABLES_ di Modul_Utilities.gs.
 * @param {string} sheetName
 * @param {boolean} dryRun - true = cuma HITUNG apa yang AKAN disalin, tidak menulis apapun.
 */
function migrateTableToFirestore_(sheetName, dryRun) {
  const rows = readSheetAsObjects(sheetName); // tabel ini belum masuk FIRESTORE_TABLES_ saat dipanggil, jadi ini masih baca dari Sheet asli
  const report = { sheetName: sheetName, totalDiSheet: rows.length, dibuatBaru: 0, sudahAda: 0, error: [] };

  rows.forEach(function (row) {
    const docId = String(row.id);
    if (dryRun) {
      const existing = firestoreGetDoc_(sheetName, docId);
      if (existing) report.sudahAda++; else report.dibuatBaru++;
      return;
    }
    try {
      const result = firestoreCreateDoc_(sheetName, docId, row);
      if (result.created) report.dibuatBaru++; else report.sudahAda++;
    } catch (e) {
      report.error.push({ id: docId, pesan: e.message });
    }
  });

  return report;
}

/**
 * Salin semua baris dari Sheet ke Firestore struktur BERSARANG
 * /kelompok/{kelompokId}/{sheetName}/{id} — dikelompokkan otomatis pakai
 * field kelompok_id tiap baris. AMAN DIJALANKAN BERULANG (sama spt di atas).
 * @param {string} sheetName
 * @param {boolean} dryRun
 */
function migrateNestedTableToFirestore_(sheetName, dryRun) {
  const rows = readSheetAsObjects(sheetName);
  const report = { sheetName: sheetName, totalDiSheet: rows.length, dibuatBaru: 0, sudahAda: 0, error: [] };

  rows.forEach(function (row) {
    const kelompokId = row.kelompok_id;
    if (!kelompokId) {
      report.error.push({ id: String(row.id), pesan: 'Baris tidak punya kelompok_id, dilewati.' });
      return;
    }
    const path = 'kelompok/' + kelompokId + '/' + sheetName;
    const docId = String(row.id);
    if (dryRun) {
      const existing = firestoreGetDoc_(path, docId);
      if (existing) report.sudahAda++; else report.dibuatBaru++;
      return;
    }
    try {
      const result = firestoreCreateDoc_(path, docId, row);
      if (result.created) report.dibuatBaru++; else report.sudahAda++;
    } catch (e) {
      report.error.push({ id: docId, pesan: e.message });
    }
  });

  return report;
}

/**
 * Tes end-to-end PILOT: menjalankan CRUD Pengumuman lewat FUNGSI APLIKASI
 * SESUNGGUHNYA (serverCreatePengumuman dkk — bukan cuma jembatan level-rendah
 * yang sudah dites di testFirestoreBridge_()), dgn asumsi 'pengumuman' SUDAH
 * dimasukkan ke FIRESTORE_TABLES_. Membuat 1 pengumuman percobaan, verifikasi,
 * update SEBAGIAN (cek field lain tidak ikut hilang — titik paling kritis),
 * lalu hapus lagi (bersih-bersih, tidak meninggalkan data sampah).
 */
function testPengumumanFirestorePilot_() {
  const dev = serverCheckDevMode();
  if (!dev || !dev.token) throw new Error('Gagal ambil sesi dev-mode.');
  const token = dev.token;
  const kelompokId = 1; // Petemon — selalu ada dari seed data
  const steps = [];
  let testId = null; // di-set setelah create berhasil; dipakai finally utk cleanup kalau ada step lain gagal

  function step(name, fn) {
    const result = fn();
    steps.push({ langkah: name, ok: true, detail: result });
    return result;
  }

  try {
    const before = step('baca daftar pengumuman (sebelum)', function () {
      const r = serverGetPengumuman(token, kelompokId);
      if (!r.success) throw new Error('serverGetPengumuman gagal: ' + r.error);
      return { jumlah: r.data.length };
    });

    const testJudul = '__TEST_PILOT_FIRESTORE_' + new Date().getTime();
    const testIsi = 'Isi asli — dibuat otomatis oleh tes pilot migrasi Firestore, aman diabaikan.';

    const created = step('buat pengumuman percobaan (lewat serverCreatePengumuman)', function () {
      const r = serverCreatePengumuman(token, {
        kelompok_id: kelompokId,
        judul: testJudul,
        isi: testIsi,
        tanggal: '2026-01-01',
        kategori: 'Caberawit',
      });
      if (!r.success) throw new Error('serverCreatePengumuman gagal: ' + r.error);
      return { id: r.id };
    });
    testId = created.id;

    step('verifikasi pengumuman percobaan muncul & field lengkap', function () {
      const r = serverGetPengumuman(token, kelompokId);
      if (!r.success) throw new Error(r.error);
      const found = r.data.find(function (p) { return String(p.id) === String(testId); });
      if (!found) throw new Error('Pengumuman percobaan TIDAK ditemukan setelah create.');
      if (found.judul !== testJudul) throw new Error('Judul tidak cocok setelah create.');
      if (found.isi !== testIsi) throw new Error('Isi tidak cocok setelah create.');
      if (found.kategori !== 'Caberawit') throw new Error('Kategori tidak cocok setelah create.');
      if (String(found.kelompok_id) !== String(kelompokId)) throw new Error('kelompok_id tidak cocok setelah create.');
      return { judul: found.judul, kategori: found.kategori };
    });

    step('update SEBAGIAN (lewat serverUpdatePengumuman, cuma judul) — field lain WAJIB tidak hilang', function () {
      const r = serverUpdatePengumuman(token, kelompokId, testId, { judul: testJudul + '_UPDATED' });
      if (!r.success) throw new Error('serverUpdatePengumuman gagal: ' + r.error);

      const check = serverGetPengumuman(token, kelompokId);
      const found = check.data.find(function (p) { return String(p.id) === String(testId); });
      if (!found) throw new Error('Pengumuman percobaan hilang setelah update.');
      if (found.judul !== testJudul + '_UPDATED') throw new Error('Judul tidak berubah setelah update.');
      if (found.isi !== testIsi) throw new Error('GAGAL KRITIS: field "isi" berubah/hilang padahal tidak diupdate!');
      if (found.kategori !== 'Caberawit') throw new Error('GAGAL KRITIS: field "kategori" hilang padahal tidak diupdate — updateMask tidak berfungsi!');
      if (String(found.kelompok_id) !== String(kelompokId)) throw new Error('GAGAL KRITIS: field "kelompok_id" hilang padahal tidak diupdate!');
      return { judul: found.judul, isi: found.isi, kategori: found.kategori };
    });

    step('hapus pengumuman percobaan (lewat serverDeletePengumuman, bersih-bersih)', function () {
      const r = serverDeletePengumuman(token, kelompokId, testId);
      if (!r.success) throw new Error('serverDeletePengumuman gagal: ' + r.error);
      testId = null; // sudah terhapus normal — finally tidak perlu cleanup ganda
      return { deleted: true };
    });

    step('verifikasi pengumuman percobaan sudah hilang & jumlah kembali seperti semula', function () {
      const r = serverGetPengumuman(token, kelompokId);
      if (r.data.length !== before.jumlah) {
        throw new Error('Jumlah pengumuman tidak kembali ke ' + before.jumlah + ' setelah bersih-bersih (sekarang: ' + r.data.length + ').');
      }
      return { jumlahSetelahHapus: r.data.length };
    });

    return { success: true, langkah: steps };
  } catch (e) {
    return { success: false, langkah: steps, error: e.message };
  } finally {
    // Jaring pengaman: kalau ada step GAGAL sebelum sempat hapus normal,
    // tetap coba bersihkan data percobaan supaya tidak tertinggal di aplikasi.
    if (testId) {
      try { serverDeletePengumuman(token, kelompokId, testId); } catch (cleanupErr) { /* sudah dilaporkan lewat error di atas */ }
    }
  }
}
