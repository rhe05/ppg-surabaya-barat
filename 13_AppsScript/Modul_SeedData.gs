/**
 * Modul_SeedData.gs — Populate demo data untuk dashboard testing
 * Jalankan SEKALI: di Apps Script editor, pilih "setupDemoData" dan Run.
 *
 * Data yang di-seed:
 * - Santri: 200+ santri di 4 kelompok pilot, 0 di kelompok belum_aktif (untuk clarity)
 * - Guru: 20+ guru di 4 kelompok pilot
 * - Absensi: 7 hari terakhir, kehadiran 70-90% (realistic)
 *
 * ⚠️ AMAN DIJALANKAN BERULANG — cek duplikasi sebelum insert.
 */

function setupDemoData() {
  console.log('🌱 Memulai seed demo data...');

  const kelompokData = readSheetAsObjects(SHEET_NAMES.KELOMPOK);
  const kelompokAktif = kelompokData.filter(k => k.status_aktif === 'aktif');
  const kelompokAktifIds = kelompokAktif.map(k => k.id);

  // Seed Santri
  seedSantri(kelompokAktifIds);

  // Seed Guru
  seedGuru(kelompokAktifIds);

  // Seed Absensi (7 hari terakhir)
  seedAbsensi(kelompokAktifIds);

  console.log('✅ Demo data setup selesai.');
}

/**
 * Seed santri: 200+ santri di 4 kelompok pilot.
 * Distribusi realistis: Petemon ~70, Purwodadi ~130.
 */
function seedSantri(kelompokAktifIds) {
  const santriSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SANTRI);
  const existingSantri = readSheetAsObjects(SHEET_NAMES.SANTRI);

  if (existingSantri.length > 0) {
    console.log('↷ Santri sudah ada, skip.');
    return;
  }

  const names = [
    // Nama santri laki-laki
    'Ahmad', 'Budi', 'Citra', 'Daris', 'Eka', 'Fajar', 'Gani', 'Hadi', 'Iman', 'Jamal',
    'Kabil', 'Lagi', 'Mahmud', 'Nasir', 'Omid', 'Pras', 'Qadir', 'Rafi', 'Samir', 'Taufik',
    'Umar', 'Vian', 'Wandi', 'Yusuf', 'Zaki',
    // Nama santri perempuan
    'Aida', 'Bilqis', 'Carla', 'Dina', 'Esya', 'Fara', 'Gita', 'Hasna', 'Ica', 'Jasmine',
    'Kiki', 'Layla', 'Mila', 'Nadia', 'Olla', 'Putri', 'Qurani', 'Ria', 'Siti', 'Tania',
    'Ulfa', 'Vita', 'Winda', 'Yasmin', 'Zara',
  ];

  const jenjang = ['AUD', 'Cabe Rawit', 'Pra Remaja', 'Remaja'];
  let santriId = 1;
  let rowCount = 0;

  // Kelompok Petemon (ID 1): 70 santri
  for (let i = 0; i < 70; i++) {
    const name = names[Math.floor(Math.random() * names.length)] + ' P-' + (i + 1);
    const nis = 'NIS-' + String(santriId).padStart(4, '0');
    const gender = Math.random() > 0.5 ? 'L' : 'P';
    const tahunLahir = 2010 + Math.floor(Math.random() * 10);
    const tglLahir = (Math.floor(Math.random() * 28) + 1) + '/' + (Math.floor(Math.random() * 12) + 1) + '/' + tahunLahir;
    const jenjangSaat = jenjang[Math.floor(Math.random() * jenjang.length)];

    santriSheet.appendRow([santriId, 1, name, nis, gender, tglLahir, jenjangSaat]);
    santriId++;
    rowCount++;
  }

  // Kelompok Purwodadi (ID 6, 7, 8): 130 santri (total untuk 3 kelompok)
  // Distribusi: 50, 40, 40
  const purwodadiDist = [50, 40, 40];
  const purwodadiIds = [6, 7, 8];

  for (let k = 0; k < 3; k++) {
    const count = purwodadiDist[k];
    for (let i = 0; i < count; i++) {
      const name = names[Math.floor(Math.random() * names.length)] + ' P' + (k + 1) + '-' + (i + 1);
      const nis = 'NIS-' + String(santriId).padStart(4, '0');
      const gender = Math.random() > 0.5 ? 'L' : 'P';
      const tahunLahir = 2010 + Math.floor(Math.random() * 10);
      const tglLahir = (Math.floor(Math.random() * 28) + 1) + '/' + (Math.floor(Math.random() * 12) + 1) + '/' + tahunLahir;
      const jenjangSaat = jenjang[Math.floor(Math.random() * jenjang.length)];

      santriSheet.appendRow([santriId, purwodadiIds[k], name, nis, gender, tglLahir, jenjangSaat]);
      santriId++;
      rowCount++;
    }
  }

  console.log(`✓ ${rowCount} santri seeded (Petemon 70, Purwodadi 130).`);
}

/**
 * Seed guru: 20+ guru di 4 kelompok pilot.
 * Distribusi: Petemon ~8, Purwodadi ~12 (4 per kelompok).
 */
function seedGuru(kelompokAktifIds) {
  const guruSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.GURU);
  const existingGuru = readSheetAsObjects(SHEET_NAMES.GURU);

  if (existingGuru.length > 0) {
    console.log('↷ Guru sudah ada, skip.');
    return;
  }

  const names = [
    'Ibu Siti', 'Pak Mahmud', 'Ibu Hajar', 'Pak Ridho', 'Ibu Nurul', 'Pak Amin', 'Ibu Zainab', 'Pak Hani',
    'Ibu Layla', 'Pak Karim', 'Ibu Saida', 'Pak Nizam', 'Ibu Nur', 'Pak Salim', 'Ibu Aisya', 'Pak Zahir',
    'Ibu Maryam', 'Pak Taufik', 'Ibu Ratna', 'Pak Rayan', 'Ibu Safa', 'Pak Adli',
  ];

  const kategori = ['Muballigh Tugasan', 'Muballigh Setempat', 'Guru Mutu', 'Guru Bantu'];
  let guruId = 1;
  let rowCount = 0;

  // Kelompok Petemon (ID 1): 8 guru
  for (let i = 0; i < 8; i++) {
    const name = names[Math.floor(Math.random() * names.length)];
    const kat = kategori[Math.floor(Math.random() * kategori.length)];
    guruSheet.appendRow([guruId, 1, name, kat]);
    guruId++;
    rowCount++;
  }

  // Kelompok Purwodadi (ID 6, 7, 8): 12 guru (4 per kelompok)
  const purwodadiIds = [6, 7, 8];
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 4; i++) {
      const name = names[Math.floor(Math.random() * names.length)];
      const kat = kategori[Math.floor(Math.random() * kategori.length)];
      guruSheet.appendRow([guruId, purwodadiIds[k], name, kat]);
      guruId++;
      rowCount++;
    }
  }

  console.log(`✓ ${rowCount} guru seeded (Petemon 8, Purwodadi 12).`);
}

/**
 * Seed absensi: 3 hari terakhir (lebih efisien), kehadiran 70-90% realistis.
 * Hanya untuk santri di kelompok pilot.
 *
 * Menggunakan batch setValues() daripada appendRow loop — jauh lebih cepat
 * (avoid timeout pada 1400+ rows).
 */
function seedAbsensi(kelompokAktifIds) {
  const absensiSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ABSENSI);
  const existingAbsensi = readSheetAsObjects(SHEET_NAMES.ABSENSI);

  if (existingAbsensi.length > 0) {
    console.log('↷ Absensi sudah ada, skip.');
    return;
  }

  const santriData = readSheetAsObjects(SHEET_NAMES.SANTRI);
  const santriPilot = santriData.filter(s => kelompokAktifIds.includes(s.kelompok_id));

  const today = new Date();
  let absensiId = 1;
  const absensiRows = [];

  // Generate 3 hari terakhir (lebih efisien, masih cukup untuk visualisasi chart)
  for (let dayOffset = 2; dayOffset >= 0; dayOffset--) {
    const date = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];

    // Untuk setiap santri, 85% hadir (5% alpa, 10% izin)
    santriPilot.forEach(santri => {
      const rand = Math.random();
      let status = 'hadir';

      if (rand < 0.05) {
        status = 'alpa';
      } else if (rand < 0.12) {
        status = 'izin';
      }

      absensiRows.push([absensiId, santri.id, dateStr, status, 1]); // user_id = 1 (admin dummy)
      absensiId++;
    });
  }

  // Batch insert via setValues() — jauh lebih cepat
  if (absensiRows.length > 0) {
    absensiSheet.getRange(2, 1, absensiRows.length, 5).setValues(absensiRows);
  }

  console.log(`✓ ${absensiRows.length} record absensi seeded (3 hari, ${santriPilot.length} santri, ~85% kehadiran).`);
}

/**
 * Helper generik: seed 1 kategori Kurikulum Prota/Promes (1 Prota per Kelas,
 * masing-masing dipecah 2 Promes Semester I & II). Dipakai oleh
 * seedKurikulumBacaanQuranPetemon() dan seedKurikulumTulisHurufArabPetemon() —
 * kategori BARU ditambah SELALU lewat appendRow (baris baru di bawah kategori
 * lama), supaya urutan tampil di kartu Prota (mengikuti urutan baris sheet)
 * tetap "kategori lama di atas, kategori baru di bawah" sesuai yang diminta.
 * ⚠️ AMAN DIJALANKAN BERULANG — skip kalau kategori ini utk kelompok+tahun
 * ini sudah ada (idempotent per kategori, BUKAN per keseluruhan sheet).
 *
 * @param {string} kategoriSlug — dipakai di ID Prota, mis. 'tulis_huruf_arab'.
 * @param {Array} materi — [{ kelas, jenjang, s1:{target,deskripsi}, s2:{target,deskripsi} }, ...]
 */
function seedKurikulumProta_(kelompokId, tahun, kategori, kategoriSlug, materi) {
  // Hapus cache serverGetProta utk kelompok+tahun ini SEBELUM cek "sudah ada" —
  // kalau UI pernah dibuka saat sheet masih kosong/belum lengkap, hasil itu
  // ke-cache 1 jam (cacheGet_ tidak bisa bedakan array kosong vs "belum
  // pernah dibaca"). Tanpa baris ini, data baru tetap tidak keliatan di app
  // sampai cache kadaluwarsa sendiri.
  for (let k = 0; k <= 9; k++) {
    cacheDrop_('kurikulum_prota_' + kelompokId + '_' + tahun + '_' + (k === 0 ? 'all' : k));
  }

  const existing = readSheetAsObjects('kurikulum_prota').filter(r =>
    String(r.kelompok_id) === String(kelompokId) &&
    parseInt(r.tahun || 0) === parseInt(tahun) &&
    String(r.kategori) === kategori
  );
  if (existing.length > 0) {
    console.log(`↷ Kurikulum "${kategori}" kelompok ${kelompokId} tahun ${tahun} sudah ada, skip.`);
    return;
  }

  const protaSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_prota');
  const promesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_promes');
  const now = new Date().toISOString();
  let protaCount = 0;
  let promesCount = 0;

  materi.forEach(function (m) {
    const protaId = 'prota_' + kelompokId + '_' + tahun + '_' + kategoriSlug + '_kelas' + m.kelas;
    const protaTarget = m.s1.target + ' → ' + m.s2.target;
    const protaDeskripsi = 'Jenjang ' + m.jenjang + ' — Materi ' + kategori + ' Kelas ' + m.kelas;

    protaSheet.appendRow([protaId, kelompokId, tahun, kategori, protaTarget, protaDeskripsi, 'seed', now, now, m.kelas]);
    protaCount++;

    [['1', m.s1], ['2', m.s2]].forEach(function (pair) {
      const semester = pair[0];
      const data = pair[1];
      const promesId = 'promes_' + protaId + '_' + semester;
      promesSheet.appendRow([promesId, kelompokId, protaId, semester, data.target, data.deskripsi, 'seed', now, now]);
      promesCount++;
    });
  });

  console.log(`✓ Kurikulum "${kategori}" kelompok ${kelompokId} tahun ${tahun} seeded: ${protaCount} Prota, ${promesCount} Promes.`);
}

/**
 * Seed Kurikulum Prota/Promes "Bacaan Al-Qur'an" untuk Kelp Petemon (kelompok_id=1), tahun 2026.
 * 1 Prota per Kelas (1-9), masing-masing dipecah 2 Promes (Semester I & II).
 * Jalankan SEKALI dari Apps Script editor: pilih "seedKurikulumBacaanQuranPetemon" dan Run.
 * ⚠️ Butuh kolom 'kelas' di sheet 'kurikulum_prota' — jalankan setupDatabaseStructure() dulu.
 * ⚠️ AMAN DIJALANKAN BERULANG — skip kalau data kategori ini utk kelompok+tahun ini sudah ada.
 */
function seedKurikulumBacaanQuranPetemon() {
  seedKurikulumProta_(1, 2026, "Bacaan Al-Qur'an", 'bacaan_alquran', [
    { kelas: 1, jenjang: 'Caberawit', s1: { target: 'Tilawati Jilid 1', deskripsi: 'Halaman 1-44' }, s2: { target: 'Tilawati Jilid 2', deskripsi: 'Halaman 1-44' } },
    { kelas: 2, jenjang: 'Caberawit', s1: { target: 'Tilawati Jilid 3', deskripsi: 'Halaman 1-44' }, s2: { target: 'Tilawati Jilid 4', deskripsi: 'Halaman 1-44' } },
    { kelas: 3, jenjang: 'Caberawit', s1: { target: 'Tilawati Jilid 5', deskripsi: 'Halaman 1-44' }, s2: { target: 'Tilawati Jilid 6', deskripsi: 'Halaman 1-44' } },
    { kelas: 4, jenjang: 'Caberawit', s1: { target: "Al-Qur'an Juz 30", deskripsi: '11,5 Lembar - 23 Halaman' }, s2: { target: "Al-Qur'an Juz 1 dan 2", deskripsi: '20 Lembar - 40 Halaman' } },
    { kelas: 5, jenjang: 'Caberawit', s1: { target: "Al-Qur'an Juz 3 dan 4", deskripsi: '20 Lembar - 40 Halaman' }, s2: { target: "Al-Qur'an Juz 5 dan 6", deskripsi: '20 Lembar - 40 Halaman' } },
    { kelas: 6, jenjang: 'Caberawit', s1: { target: "Al-Qur'an Juz 7 dan 8", deskripsi: '20 Lembar - 40 Halaman' }, s2: { target: "Al-Qur'an Juz 9, 10 dan 11", deskripsi: '30 Lembar - 60 Halaman' } },
    { kelas: 7, jenjang: 'Pra Remaja SMP', s1: { target: "Al-Qur'an Juz 12, 13 dan 14", deskripsi: '30 Lembar - 60 Halaman' }, s2: { target: "Al-Qur'an Juz 15, 16 dan 17", deskripsi: '30 Lembar - 60 Halaman' } },
    { kelas: 8, jenjang: 'Pra Remaja SMP', s1: { target: "Al-Qur'an Juz 18, 19 dan 20", deskripsi: '30 Lembar - 60 Halaman' }, s2: { target: "Al-Qur'an Juz 21, 22 dan 23", deskripsi: '30 Lembar - 60 Halaman' } },
    { kelas: 9, jenjang: 'Pra Remaja SMP', s1: { target: "Al-Qur'an Juz 24, 25 dan 26", deskripsi: '30 Lembar - 60 Halaman' }, s2: { target: "Al-Qur'an Juz 27, 28 dan 29", deskripsi: '30 Lembar - 60 Halaman' } },
  ]);
}

/**
 * Seed Kurikulum Prota/Promes "Tulis Huruf Arab" untuk Kelp Petemon (kelompok_id=1), tahun 2026.
 * Ditambah SETELAH "Bacaan Al-Qur'an" (tampil di bawahnya di kartu Prota — lihat
 * seedKurikulumProta_). Hanya Jenjang Caberawit, Kelas 1-6 (data yang diberikan
 * tidak mencakup jenjang Pra Remaja SMP utk materi ini).
 * Jalankan SEKALI dari Apps Script editor: pilih "seedKurikulumTulisHurufArabPetemon" dan Run.
 * ⚠️ AMAN DIJALANKAN BERULANG — skip kalau data kategori ini utk kelompok+tahun ini sudah ada.
 */
function seedKurikulumTulisHurufArabPetemon() {
  seedKurikulumProta_(1, 2026, 'Tulis Huruf Arab', 'tulis_huruf_arab', [
    { kelas: 1, jenjang: 'Caberawit',
      s1: { target: 'Menulis huruf tunggal fathah + angka Arab', deskripsi: '1. Menulis huruf tunggal fathah; 2. Menulis angka Arab' },
      s2: { target: 'Menulis huruf sambung', deskripsi: '3. Menulis huruf sambung (di depan, tengah, dan belakang)' } },
    { kelas: 2, jenjang: 'Caberawit',
      s1: { target: 'Menulis rangkaian kata', deskripsi: '1. Menulis rangkaian kata' },
      s2: { target: 'Menulis kata Arab baku/potongan ayat', deskripsi: '2. Menulis kata Arab baku/potongan ayat' } },
    { kelas: 3, jenjang: 'Caberawit',
      s1: { target: 'Menulis rangkaian kata', deskripsi: '1. Menulis rangkaian kata' },
      s2: { target: 'Menulis kata Arab baku/potongan ayat', deskripsi: '2. Menulis kata Arab baku/potongan ayat' } },
    { kelas: 4, jenjang: 'Caberawit',
      s1: { target: 'Latihan makna pegon (mushaf Al-Qur\'an)', deskripsi: '1. Latihan makna pegon dan kode-kodenya dengan menggunakan mushaf Al-Qur\'an' },
      s2: { target: 'Latihan makna pegon (mushaf Al-Qur\'an)', deskripsi: '1. Latihan makna pegon dan kode-kodenya dengan menggunakan mushaf Al-Qur\'an' } },
    { kelas: 5, jenjang: 'Caberawit',
      s1: { target: 'Terampil menulis Arab', deskripsi: '1. Terampil menulis Arab' },
      s2: { target: 'Terampil menulis makna pegon', deskripsi: '2. Terampil menulis makna pegon' } },
    { kelas: 6, jenjang: 'Caberawit',
      s1: { target: 'Terampil menulis Arab', deskripsi: '1. Terampil menulis Arab' },
      s2: { target: 'Terampil menulis makna pegon', deskripsi: '2. Terampil menulis makna pegon' } },
  ]);
}

/**
 * Seed Kurikulum Prota/Promes "Hafalan Surat-Surat Al-Qur'an" untuk Kelp
 * Petemon (kelompok_id=1), tahun 2026. Jenjang Caberawit — HANYA Kelas
 * PAUD-TK, 1, 2 (data yang diberikan tidak mencakup kelas lain utk materi
 * ini). Kelas 'PAUD-TK' BUKAN angka (beda dari Kelas 1-9 kategori lain) —
 * pastikan sudah ada opsi "PAUD-TK" di dropdown kelas (Markup_Screens.html)
 * & sorting kelas di Script_Main.html sudah menangani nilai non-angka
 * sebelum menjalankan seed ini.
 * Tidak ada Probul (Target Per Bulan) utk materi ini — tab Semester akan
 * fallback tampilkan Target+Deskripsi polos (perilaku bawaan yang sudah ada).
 * Jalankan SEKALI dari Apps Script editor: pilih "seedKurikulumHafalanSuratPetemon" dan Run.
 * ⚠️ AMAN DIJALANKAN BERULANG — skip kalau data kategori ini utk kelompok+tahun ini sudah ada.
 */
function seedKurikulumHafalanSuratPetemon() {
  cacheDrop_('kurikulum_prota_1_2026_PAUD-TK');
  seedKurikulumProta_(1, 2026, "Hafalan Surat-Surat Al-Qur'an", 'hafalan_surat', [
    { kelas: 'PAUD-TK', jenjang: 'Caberawit',
      s1: { target: 'Surat Al-Fatihah s/d Surat Al-Ikhlas', deskripsi: '4 Surat' },
      s2: { target: 'Surat Al-Lahab s/d Al-Kafirun', deskripsi: '3 Surat' } },
    { kelas: 1, jenjang: 'Caberawit',
      s1: { target: 'Surat Al Kautsar s/d Surat Quraisyh', deskripsi: '3 Surat' },
      s2: { target: 'Surat Al-Fiil s/d Surat Al-Asyr', deskripsi: '3 Surat' } },
    { kelas: 2, jenjang: 'Caberawit',
      s1: { target: "Surat At-Takatsur s/d Al-Qori'ah", deskripsi: '2 Surat' },
      s2: { target: "Surat Al-A'diyat s/d Surat Al-Zalzalah", deskripsi: '2 Surat' } },
  ]);
}

/**
 * Seed Kurikulum Probul (Target Per Bulan) utk semua Promes "Bacaan Al-Qur'an"
 * Kelp Petemon 2026 — dipakai tabel "Target Per Bulan" inline di rincian
 * Semester (Kurikulum Tahunan). Mengikuti pola poster rujukan: Bulan 1-5 =
 * pembagian rata halaman semester itu (5 bagian, sisa taruh di bagian
 * terakhir), Bulan 6 = Evaluasi/Ujian (tanpa materi baru).
 *
 * ⚠️ WAJIB dijalankan SETELAH seedKurikulumBacaanQuranPetemon() (butuh
 * Prota/Promes-nya sudah ada). Jalankan SEKALI dari Apps Script editor:
 * pilih "seedKurikulumProbulBacaanQuranPetemon" dan Run.
 * ⚠️ AMAN DIJALANKAN BERULANG — skip per-Promes yang Probul-nya sudah ada.
 */
function seedKurikulumProbulBacaanQuranPetemon() {
  const KELOMPOK_ID = 1;
  const TAHUN = 2026;
  const KATEGORI = "Bacaan Al-Qur'an";

  // Total halaman per Kelas+Semester (sumber: deskripsi Promes yang sama
  // dipakai seedKurikulumBacaanQuranPetemon() — Tilawati selalu 44 halaman,
  // sisanya sesuai lembar Al-Qur'an per Juz yang diberikan).
  const halamanPerKelas = {
    1: { 1: 44, 2: 44 },
    2: { 1: 44, 2: 44 },
    3: { 1: 44, 2: 44 },
    4: { 1: 23, 2: 40 },
    5: { 1: 40, 2: 40 },
    6: { 1: 40, 2: 60 },
    7: { 1: 60, 2: 60 },
    8: { 1: 60, 2: 60 },
    9: { 1: 60, 2: 60 },
  };

  const probulSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('kurikulum_probul');
  const now = new Date().toISOString();
  let count = 0;

  Object.keys(halamanPerKelas).forEach(function (kelasStr) {
    const kelas = parseInt(kelasStr, 10);
    [1, 2].forEach(function (semester) {
      const protaId = 'prota_' + KELOMPOK_ID + '_' + TAHUN + '_bacaan_alquran_kelas' + kelas;
      const promesId = 'promes_' + protaId + '_' + semester;
      const totalHalaman = halamanPerKelas[kelas][semester];

      // Hapus cache SEBELUM cek "sudah ada" — sama alasannya seperti
      // seedKurikulumProta_ (hasil kosong ke-cache 1 jam kalau UI pernah
      // dibuka duluan sebelum data ini ada).
      cacheDrop_('kurikulum_probul_bypromes_' + promesId);

      const existing = readSheetAsObjects('kurikulum_probul').filter(r => String(r.promes_id) === String(promesId));
      if (existing.length > 0) {
        console.log(`↷ Probul utk ${promesId} sudah ada, skip.`);
        return;
      }

      // Bagi rata 5 bagian (bulan 1-5): tiap bagian ceil(total/5) halaman,
      // bagian terakhir menampung sisanya — cocok dgn contoh poster (mis.
      // 44 halaman -> 9,9,9,9,8; 23 halaman -> 5,5,5,5,3).
      const perBulan = Math.ceil(totalHalaman / 5);
      let halamanTerpakai = 0;
      for (let bulan = 1; bulan <= 5; bulan++) {
        const mulai = halamanTerpakai + 1;
        const jumlahBulanIni = (bulan === 5) ? (totalHalaman - halamanTerpakai) : perBulan;
        const selesai = halamanTerpakai + jumlahBulanIni;
        halamanTerpakai = selesai;

        const target = (mulai === selesai) ? ('Hal. ' + mulai) : ('Hal. ' + mulai + ' - ' + selesai);
        const deskripsi = (bulan <= 4) ? 'Penyampaian materi baru' : 'Penyelesaian target materi';
        const id = 'probul_' + promesId + '_' + bulan;

        probulSheet.appendRow([id, KELOMPOK_ID, promesId, TAHUN, bulan, KATEGORI, target, deskripsi, 'seed', now, now]);
        count++;
      }

      // Bulan 6 = Evaluasi/Ujian, tidak ada materi baru.
      const idEval = 'probul_' + promesId + '_6';
      probulSheet.appendRow([idEval, KELOMPOK_ID, promesId, TAHUN, 6, KATEGORI, 'Evaluasi / Ujian', 'Evaluasi/Ujian Semester — tidak ada materi baru', 'seed', now, now]);
      count++;
    });
  });

  console.log(`✓ Kurikulum Probul "Bacaan Al-Qur'an" Kelp Petemon 2026 seeded: ${count} baris (9 Kelas x 2 Semester x 6 Bulan).`);
}
