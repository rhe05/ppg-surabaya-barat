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
 * Seed absensi: 7 hari terakhir, kehadiran 70-90% realistis.
 * Hanya untuk santri di kelompok pilot.
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
  let rowCount = 0;

  // Generate 7 hari terakhir
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const date = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];

    // Skip Minggu? (optional — sekarang include semua hari untuk data lengkap)
    // if (date.getDay() === 0) continue;

    // Untuk setiap santri, 85-95% hadir
    santriPilot.forEach(santri => {
      const rand = Math.random();
      let status = 'hadir';

      if (rand < 0.05) {
        status = 'alpa';
      } else if (rand < 0.12) {
        status = 'izin';
      }
      // else hadir (85%)

      absensiSheet.appendRow([absensiId, santri.id, dateStr, status, 1]); // user_id = 1 (admin dummy)
      absensiId++;
      rowCount++;
    });
  }

  console.log(`✓ ${rowCount} record absensi seeded (7 hari, ${santriPilot.length} santri, ~85% kehadiran).`);
}
