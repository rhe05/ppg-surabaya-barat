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
 * Salin baris dari Sheet ke Firestore struktur BERSARANG, TAPI CUMA UNTUK 1
 * KELOMPOK (bukan semua kelompok sekaligus spt migrateNestedTableToFirestore_)
 * — dipakai utk rollout per-kelompok (mis. Kelp Petemon dulu, kelompok lain
 * menyusul). AMAN DIJALANKAN BERULANG.
 * @param {string} sheetName
 * @param {string} kelompokId
 * @param {boolean} dryRun
 */
function migrateKelompokTableToFirestore_(sheetName, kelompokId, dryRun) {
  const rows = readSheetAsObjects(sheetName).filter(function (r) { return String(r.kelompok_id) === String(kelompokId); });
  const path = 'kelompok/' + kelompokId + '/' + sheetName;
  const report = { sheetName: sheetName, kelompokId: kelompokId, totalDiSheet: rows.length, dibuatBaru: 0, sudahAda: 0, error: [] };

  rows.forEach(function (row) {
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

/**
 * Tes end-to-end PILOT untuk 'guru' — pola identik dgn testPengumumanFirestorePilot_,
 * dijalankan di kelompokId=1 (Kelp Petemon). Asumsi '1' SUDAH dimasukkan ke
 * FIRESTORE_KELOMPOK_GURU_ (Modul_MaintainGuru.gs) sebelum tes ini dijalankan.
 */
function testGuruFirestorePilot_() {
  const dev = serverCheckDevMode();
  if (!dev || !dev.token) throw new Error('Gagal ambil sesi dev-mode.');
  const token = dev.token;
  const kelompokId = '1'; // Kelp Petemon
  const steps = [];
  let testId = null;

  function step(name, fn) {
    const result = fn();
    steps.push({ langkah: name, ok: true, detail: result });
    return result;
  }

  try {
    const before = step('baca daftar guru (sebelum)', function () {
      const r = serverGetGuruList(token, kelompokId, '', true);
      if (!r.success) throw new Error('serverGetGuruList gagal: ' + r.error);
      return { jumlah: r.data.length };
    });

    const testNama = '__TEST_PILOT_FIRESTORE_' + new Date().getTime();

    const created = step('buat guru percobaan (lewat serverAddGuru)', function () {
      const r = serverAddGuru(token, kelompokId, {
        nama: testNama,
        kategori: 'Guru Bantu',
        jenis_kelamin: 'L',
        nomor_wa: '081200000000',
      });
      if (!r.success) throw new Error('serverAddGuru gagal: ' + r.error);
      return { id: r.id };
    });
    testId = created.id;

    step('verifikasi guru percobaan muncul & field lengkap', function () {
      const r = serverGetGuruList(token, kelompokId, '', true);
      const found = r.data.find(function (g) { return String(g.id) === String(testId); });
      if (!found) throw new Error('Guru percobaan TIDAK ditemukan setelah create.');
      if (found.nama !== testNama) throw new Error('Nama tidak cocok setelah create.');
      if (found.kategori !== 'Guru Bantu') throw new Error('Kategori tidak cocok setelah create.');
      if (found.nomor_wa !== '081200000000') throw new Error('Nomor WA tidak cocok setelah create.');
      return { nama: found.nama, kategori: found.kategori };
    });

    step('update SEBAGIAN (lewat serverUpdateGuru, cuma nama) — field lain WAJIB tidak hilang', function () {
      const r = serverUpdateGuru(token, kelompokId, testId, { nama: testNama + '_UPDATED' });
      if (!r.success) throw new Error('serverUpdateGuru gagal: ' + r.error);

      const check = serverGetGuruList(token, kelompokId, '', true);
      const found = check.data.find(function (g) { return String(g.id) === String(testId); });
      if (!found) throw new Error('Guru percobaan hilang setelah update.');
      if (found.nama !== testNama + '_UPDATED') throw new Error('Nama tidak berubah setelah update.');
      if (found.kategori !== 'Guru Bantu') throw new Error('GAGAL KRITIS: field "kategori" hilang padahal tidak diupdate — updateMask tidak berfungsi!');
      if (found.nomor_wa !== '081200000000') throw new Error('GAGAL KRITIS: field "nomor_wa" hilang padahal tidak diupdate!');
      return { nama: found.nama, kategori: found.kategori, nomor_wa: found.nomor_wa };
    });

    step('hapus guru percobaan (lewat serverDeleteGuru, bersih-bersih)', function () {
      const r = serverDeleteGuru(token, kelompokId, testId);
      if (!r.success) throw new Error('serverDeleteGuru gagal: ' + r.error);
      testId = null;
      return { deleted: true };
    });

    step('verifikasi guru percobaan sudah hilang & jumlah kembali seperti semula', function () {
      const r = serverGetGuruList(token, kelompokId, '', true);
      if (r.data.length !== before.jumlah) {
        throw new Error('Jumlah guru tidak kembali ke ' + before.jumlah + ' setelah bersih-bersih (sekarang: ' + r.data.length + ').');
      }
      return { jumlahSetelahHapus: r.data.length };
    });

    return { success: true, langkah: steps };
  } catch (e) {
    return { success: false, langkah: steps, error: e.message };
  } finally {
    if (testId) {
      try { serverDeleteGuru(token, kelompokId, testId); } catch (cleanupErr) { /* sudah dilaporkan lewat error di atas */ }
    }
  }
}

/**
 * Tes end-to-end PILOT untuk 'santri' — pola identik, dijalankan di
 * kelompokId=1 (Kelp Petemon). Asumsi '1' SUDAH dimasukkan ke
 * FIRESTORE_KELOMPOK_SANTRI_ (Modul_MaintainSantri.gs) sebelum tes ini dijalankan.
 */
function testSantriFirestorePilot_() {
  const dev = serverCheckDevMode();
  if (!dev || !dev.token) throw new Error('Gagal ambil sesi dev-mode.');
  const token = dev.token;
  const kelompokId = '1'; // Kelp Petemon
  const steps = [];
  let testId = null;

  function step(name, fn) {
    const result = fn();
    steps.push({ langkah: name, ok: true, detail: result });
    return result;
  }

  try {
    const before = step('baca daftar santri (sebelum)', function () {
      const r = serverGetSantriList(token, kelompokId, '', true);
      if (!r.success) throw new Error('serverGetSantriList gagal: ' + r.error);
      return { jumlah: r.data.length };
    });

    const testNis = '__TEST_' + new Date().getTime();

    const created = step('buat santri percobaan (lewat serverAddSantri)', function () {
      const r = serverAddSantri(token, kelompokId, {
        nama: '__TEST_PILOT_FIRESTORE__',
        nis: testNis,
        gender: 'L',
        tanggal_lahir: '2015-01-01',
        jenjang_saat_ini: 'Cabe Rawit',
      });
      if (!r.success) throw new Error('serverAddSantri gagal: ' + r.error);
      return { id: r.id };
    });
    testId = created.id;

    step('verifikasi santri percobaan muncul & field lengkap', function () {
      const r = serverGetSantriList(token, kelompokId, '', true);
      const found = r.data.find(function (s) { return String(s.id) === String(testId); });
      if (!found) throw new Error('Santri percobaan TIDAK ditemukan setelah create.');
      if (found.nis !== testNis) throw new Error('NIS tidak cocok setelah create.');
      if (found.jenjang_saat_ini !== 'Cabe Rawit') throw new Error('Jenjang tidak cocok setelah create.');
      return { nama: found.nama, jenjang_saat_ini: found.jenjang_saat_ini };
    });

    step('update SEBAGIAN (lewat serverUpdateSantri, cuma nama) — field lain WAJIB tidak hilang', function () {
      const r = serverUpdateSantri(token, kelompokId, testId, { nama: '__TEST_PILOT_FIRESTORE__UPDATED' });
      if (!r.success) throw new Error('serverUpdateSantri gagal: ' + r.error);

      const check = serverGetSantriList(token, kelompokId, '', true);
      const found = check.data.find(function (s) { return String(s.id) === String(testId); });
      if (!found) throw new Error('Santri percobaan hilang setelah update.');
      if (found.nama !== '__TEST_PILOT_FIRESTORE__UPDATED') throw new Error('Nama tidak berubah setelah update.');
      if (found.nis !== testNis) throw new Error('GAGAL KRITIS: field "nis" hilang padahal tidak diupdate — updateMask tidak berfungsi!');
      if (found.jenjang_saat_ini !== 'Cabe Rawit') throw new Error('GAGAL KRITIS: field "jenjang_saat_ini" hilang padahal tidak diupdate!');
      return { nama: found.nama, nis: found.nis, jenjang_saat_ini: found.jenjang_saat_ini };
    });

    step('hapus santri percobaan (lewat serverDeleteSantri, bersih-bersih)', function () {
      const r = serverDeleteSantri(token, kelompokId, testId);
      if (!r.success) throw new Error('serverDeleteSantri gagal: ' + r.error);
      testId = null;
      return { deleted: true };
    });

    step('verifikasi santri percobaan sudah hilang & jumlah kembali seperti semula', function () {
      const r = serverGetSantriList(token, kelompokId, '', true);
      if (r.data.length !== before.jumlah) {
        throw new Error('Jumlah santri tidak kembali ke ' + before.jumlah + ' setelah bersih-bersih (sekarang: ' + r.data.length + ').');
      }
      return { jumlahSetelahHapus: r.data.length };
    });

    return { success: true, langkah: steps };
  } catch (e) {
    return { success: false, langkah: steps, error: e.message };
  } finally {
    if (testId) {
      try { serverDeleteSantri(token, kelompokId, testId); } catch (cleanupErr) { /* sudah dilaporkan lewat error di atas */ }
    }
  }
}
