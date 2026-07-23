/**
 * Setup_Database.gs — Inisialisasi struktur Google Sheet database
 * Jalankan SEKALI: di Apps Script editor, buka "Run" menu, pilih "setupDatabaseStructure"
 * Atau di Google Sheets, cek "Extensions" → "Apps Script" → jalankan dari sini.
 *
 * Membuat:
 * - 12 sheet dengan header row sesuai Database Design.md Tahap 16
 * - Seed data: 5 Desa, 18 Kelompok (+ status pilot), 1 user dummy
 *
 * ⚠️ AMAN DIJALANKAN BERULANG — fungsi cek apakah sheet sudah ada sebelum create.
 */

const DB_SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

function setupDatabaseStructure() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  console.log('🔧 Memulai setup database...');

  // 1. ORGANISASI INTI
  createSheetIfNotExists(ss, 'ppg', ['id', 'nama']);
  createSheetIfNotExists(ss, 'desa', ['id', 'ppg_id', 'nama']);
  createSheetIfNotExists(ss, 'kelompok', ['id', 'desa_id', 'nama', 'status_aktif', 'created_at']);

  // 2. PENGGUNA & AKSES
  createSheetIfNotExists(ss, 'users', ['id', 'nama', 'username', 'password_hash', 'role', 'scope_type', 'scope_id', 'email', 'status', 'created_at', 'updated_at', 'created_by']);

  // 3. DATA SANTRI & GURU
  createSheetIfNotExists(ss, 'santri', ['id', 'kelompok_id', 'nama', 'nis', 'gender', 'tanggal_lahir', 'jenjang_saat_ini', 'nama_panggilan', 'tempat_lahir', 'pendidikan', 'kelas_sekolah', 'kelas_ngaji', 'alamat', 'nama_ayah', 'nama_ibu', 'rt', 'rw', 'kelurahan', 'kode_pos', 'kabupaten_kota', 'provinsi', 'nomor_wa_ayah', 'nomor_wa_ibu', 'kecamatan', 'nomor_wa', 'status_nikah']);
  createSheetIfNotExists(ss, 'guru', ['id', 'kelompok_id', 'nama', 'kategori', 'tempat_lahir', 'tanggal_lahir', 'jenis_kelamin', 'mulai_mengajar', 'alamat', 'nomor_wa', 'pendidikan', 'rt', 'rw', 'kelurahan', 'kode_pos', 'kabupaten_kota', 'provinsi', 'kecamatan', 'lama_mengajar']);
  createSheetIfNotExists(ss, 'riwayat_jenjang', ['id', 'santri_id', 'jenjang_lama', 'jenjang_baru', 'tanggal', 'catatan', 'dicatat_oleh']);

  // 4. KEHADIRAN
  createSheetIfNotExists(ss, 'absensi', ['id', 'santri_id', 'tanggal', 'status', 'dicatat_oleh']);

  // 5. PENILAIAN & EVALUASI
  createSheetIfNotExists(ss, 'munaqosah', ['id', 'santri_id', 'periode_id', 'tanggal', 'kelas', 'wilayah', 'nilai', 'status', 'catatan', 'dinilai_oleh', 'dinilai_pada']);
  createSheetIfNotExists(ss, 'periode_munaqosah', ['id', 'semester', 'status', 'estimasi_buka_kembali', 'kontak', 'diubah_oleh', 'diubah_pada']);

  // 6. BIMBINGAN KONSELING
  createSheetIfNotExists(ss, 'konseling', ['id', 'santri_id', 'kelompok_id', 'tanggal', 'kategori', 'masalah', 'status', 'aksi', 'pencatat_id', 'dibuat_pada', 'diupdate_pada', 'catatan_tindak_lanjut']);

  // 7. MODUL KURIKULUM
  createSheetIfNotExists(ss, 'kurikulum_akhlaq', ['id', 'santri_id', 'semester', 'nilai_akhlaq', 'catatan_capaian', 'dicatat_oleh']);

  // 8. KALENDER AKADEMIK
  createSheetIfNotExists(ss, 'calendar_events', ['id', 'kelompok_id', 'tanggal', 'judul_event', 'deskripsi', 'tipe_event', 'lokasi', 'pukul_mulai', 'pukul_selesai', 'dibuat_oleh', 'dibuat_pada', 'diupdate_pada']);

  // 9. PUSAT UNDUHAN (FILE REPOSITORY)
  createSheetIfNotExists(ss, 'files', ['id', 'kategori', 'nama_file', 'deskripsi', 'url_file', 'ukuran_bytes', 'dibuat_oleh', 'dibuat_pada', 'diupdate_pada', 'download_count']);

  // 10. AUDIT & LOGS
  createSheetIfNotExists(ss, 'audit_log', ['id', 'table_name', 'record_id', 'action', 'user_id', 'timestamp', 'detail_perubahan']);

  // 11. JADWAL KBM (jadwal rutin mingguan per Kelompok)
  createSheetIfNotExists(ss, 'jadwal_kbm', ['id', 'kelompok_id', 'hari', 'jam_mulai', 'jam_selesai', 'keterangan', 'dibuat_oleh', 'dibuat_pada', 'tanggal', 'guru_id', 'kelas', 'ruangan', 'kategori']);

  // 12. PENGUMUMAN (per Kelompok)
  createSheetIfNotExists(ss, 'pengumuman', ['id', 'kelompok_id', 'judul', 'isi', 'tanggal', 'dibuat_oleh', 'dibuat_pada', 'kategori']);

  // 13. JADWAL KATEGORI HARI (hari aktif per kategori KBM, mis. Cabe Rawit = Senin-Jumat)
  createSheetIfNotExists(ss, 'jadwal_kategori_hari', ['id', 'kelompok_id', 'kategori', 'hari_aktif', 'diubah_oleh', 'diubah_pada']);

  // 14-17. KURIKULUM (Prota/Promes/Probul + Pencapaian Santri)
  createSheetIfNotExists(ss, 'kurikulum_prota', ['id', 'kelompok_id', 'tahun', 'kategori', 'target', 'deskripsi', 'created_by', 'created_at', 'updated_at']);
  createSheetIfNotExists(ss, 'kurikulum_promes', ['id', 'kelompok_id', 'prota_id', 'semester', 'target', 'deskripsi', 'created_by', 'created_at', 'updated_at']);
  createSheetIfNotExists(ss, 'kurikulum_probul', ['id', 'kelompok_id', 'promes_id', 'tahun', 'bulan', 'kategori', 'target', 'deskripsi', 'created_by', 'created_at', 'updated_at']);
  createSheetIfNotExists(ss, 'kurikulum_pencapaian_santri', ['id', 'kelompok_id', 'santri_id', 'probul_id', 'status', 'tanggal_update', 'catatan_guru', 'updated_by']);

  console.log('✅ Semua 21 sheet berhasil dibuat atau sudah ada.');

  // Migrasi: tambah kolom baru ke sheet 'guru'/'santri'/'jadwal_kbm'/'pengumuman' yang sudah ada (aman dijalankan berulang)
  migrateGuruSchemaAddFields_(ss);
  migrateSantriSchemaAddFields_(ss);
  migrateJadwalKbmSchemaAddFields_(ss);
  migratePengumumanSchemaAddFields_(ss);

  // Seed data
  seedData(ss);

  console.log('✅ Database setup selesai.');
}

/**
 * Migrasi sheet 'guru' yang SUDAH ADA: tambah kolom baru di akhir jika belum ada.
 * createSheetIfNotExists() tidak mengubah sheet yang sudah eksis, jadi kolom baru
 * (tempat_lahir dst) perlu ditambahkan manual di sini supaya deployment lama ikut update.
 * ⚠️ AMAN DIJALANKAN BERULANG — hanya menambah kolom yang belum ada.
 */
function migrateGuruSchemaAddFields_(ss) {
  const sheet = ss.getSheetByName('guru');
  if (!sheet) return;

  const newColumns = ['tempat_lahir', 'tanggal_lahir', 'jenis_kelamin', 'mulai_mengajar', 'alamat', 'nomor_wa', 'pendidikan', 'rt', 'rw', 'kelurahan', 'kode_pos', 'kabupaten_kota', 'provinsi', 'kecamatan', 'lama_mengajar'];
  const lastCol = sheet.getLastColumn();
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toLowerCase());

  const missing = newColumns.filter(col => !existingHeaders.includes(col));
  if (missing.length === 0) {
    console.log('↷ Sheet "guru" sudah punya semua kolom baru, skip migrasi.');
    return;
  }

  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  console.log(`✓ Sheet "guru" dimigrasi, kolom ditambahkan: ${missing.join(', ')}`);
}

/**
 * Migrasi sheet 'santri' yang SUDAH ADA: tambah kolom baru di akhir jika belum ada
 * (nama_panggilan, tempat_lahir, pendidikan, kelas_sekolah, kelas_ngaji, alamat, nama_ayah, nama_ibu).
 * ⚠️ AMAN DIJALANKAN BERULANG — hanya menambah kolom yang belum ada.
 */
function migrateSantriSchemaAddFields_(ss) {
  const sheet = ss.getSheetByName('santri');
  if (!sheet) return;

  const newColumns = ['nama_panggilan', 'tempat_lahir', 'pendidikan', 'kelas_sekolah', 'kelas_ngaji', 'alamat', 'nama_ayah', 'nama_ibu', 'rt', 'rw', 'kelurahan', 'kode_pos', 'kabupaten_kota', 'provinsi', 'nomor_wa_ayah', 'nomor_wa_ibu', 'kecamatan', 'nomor_wa', 'status_nikah'];
  const lastCol = sheet.getLastColumn();
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toLowerCase());

  const missing = newColumns.filter(col => !existingHeaders.includes(col));
  if (missing.length === 0) {
    console.log('↷ Sheet "santri" sudah punya semua kolom baru, skip migrasi.');
    return;
  }

  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  console.log(`✓ Sheet "santri" dimigrasi, kolom ditambahkan: ${missing.join(', ')}`);
}

/**
 * Migrasi sheet 'jadwal_kbm' yang SUDAH ADA: tambah kolom baru di akhir jika belum ada.
 * Model lama = jadwal rutin mingguan ('hari' berulang). Model baru = sesi per tanggal
 * spesifik (sesuai pengumuman WA guru): tanggal, guru_id, kelas, ruangan.
 * Kolom lama ('hari', 'keterangan') TETAP DIPERTAHANKAN (tidak dihapus) — 'hari'
 * kini diisi otomatis dari 'tanggal' oleh server, 'keterangan' jadi field catatan opsional.
 * ⚠️ AMAN DIJALANKAN BERULANG — hanya menambah kolom yang belum ada.
 */
function migrateJadwalKbmSchemaAddFields_(ss) {
  const sheet = ss.getSheetByName('jadwal_kbm');
  if (!sheet) return;

  const newColumns = ['tanggal', 'guru_id', 'kelas', 'ruangan', 'kategori'];
  const lastCol = sheet.getLastColumn();
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toLowerCase());

  const missing = newColumns.filter(col => !existingHeaders.includes(col));
  if (missing.length === 0) {
    console.log('↷ Sheet "jadwal_kbm" sudah punya semua kolom baru, skip migrasi.');
    return;
  }

  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  console.log(`✓ Sheet "jadwal_kbm" dimigrasi, kolom ditambahkan: ${missing.join(', ')}`);
}

/**
 * Migrasi sheet 'pengumuman' yang SUDAH ADA: tambah kolom 'kategori' di akhir jika belum ada.
 * Dipakai mengelompokkan pengumuman jadi kartu per sub-kategori (Pengumuman KBM / Musyawarah)
 * di Dashboard Kelompok. Entri lama tanpa kategori tetap tampil di bucket "Lainnya" (frontend).
 * ⚠️ AMAN DIJALANKAN BERULANG — hanya menambah kolom yang belum ada.
 */
function migratePengumumanSchemaAddFields_(ss) {
  const sheet = ss.getSheetByName('pengumuman');
  if (!sheet) return;

  const newColumns = ['kategori'];
  const lastCol = sheet.getLastColumn();
  const existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim().toLowerCase());

  const missing = newColumns.filter(col => !existingHeaders.includes(col));
  if (missing.length === 0) {
    console.log('↷ Sheet "pengumuman" sudah punya semua kolom baru, skip migrasi.');
    return;
  }

  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  console.log(`✓ Sheet "pengumuman" dimigrasi, kolom ditambahkan: ${missing.join(', ')}`);
}

/**
 * Buat sheet jika belum ada.
 */
function createSheetIfNotExists(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    console.log(`✓ Sheet "${sheetName}" dibuat dengan ${headers.length} kolom.`);
  } else {
    console.log(`↷ Sheet "${sheetName}" sudah ada, skip.`);
  }
}

/**
 * Seed data awal: PPG, 5 Desa, 18 Kelompok (+ status pilot), dummy user.
 */
function seedData(ss) {
  // Seed PPG (jika belum ada data)
  const ppgSheet = ss.getSheetByName('ppg');
  if (ppgSheet.getLastRow() === 1) { // hanya header
    ppgSheet.appendRow([1, 'PPG Surabaya Barat']);
    console.log('✓ PPG seeded.');
  }

  // Seed Desa (jika belum ada data)
  const desaSheet = ss.getSheetByName('desa');
  if (desaSheet.getLastRow() === 1) {
    desaSheet.appendRow([1, 1, 'Petemon']);
    desaSheet.appendRow([2, 1, 'Purwodadi']);
    desaSheet.appendRow([3, 1, 'Tanbar']);
    desaSheet.appendRow([4, 1, 'Tantim']);
    desaSheet.appendRow([5, 1, 'Benowo']);
    console.log('✓ 5 Desa seeded.');
  }

  // Seed Kelompok (jika belum ada data)
  const kelompokSheet = ss.getSheetByName('kelompok');
  if (kelompokSheet.getLastRow() === 1) {
    const kelompokData = [
      // Petemon (5 Kelompok) — 1 pilot, 4 off
      [1, 1, 'Kelp Petemon', 'aktif', new Date().toISOString().split('T')[0]],
      [2, 1, 'Kelp Simo', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [3, 1, 'Kelp Jl Semarang', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [4, 1, 'Kelp Asem Jaya', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [5, 1, 'Kelp DST', 'belum_aktif', new Date().toISOString().split('T')[0]],

      // Purwodadi (3 Kelompok) — semua pilot/aktif
      [6, 2, 'Kelp Bangun Rejo', 'aktif', new Date().toISOString().split('T')[0]],
      [7, 2, 'Kelp Purwodadi', 'aktif', new Date().toISOString().split('T')[0]],
      [8, 2, 'Kelp Dupak', 'aktif', new Date().toISOString().split('T')[0]],

      // Tanbar (4 Kelompok) — off
      [9, 3, 'Manukan 1', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [10, 3, 'Manukan 2', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [11, 3, 'Candi Lontar', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [12, 3, 'Wonorejo', 'belum_aktif', new Date().toISOString().split('T')[0]],

      // Tantim (3 Kelompok) — off
      [13, 4, 'Balongsari', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [14, 4, 'Dermo', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [15, 4, 'Buntaran', 'belum_aktif', new Date().toISOString().split('T')[0]],

      // Benowo (3 Kelompok) — off
      [16, 5, 'Sememi Barat', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [17, 5, 'Sememi Timur', 'belum_aktif', new Date().toISOString().split('T')[0]],
      [18, 5, 'Pakal', 'belum_aktif', new Date().toISOString().split('T')[0]],
    ];
    kelompokData.forEach(row => kelompokSheet.appendRow(row));
    console.log('✓ 18 Kelompok seeded (4 pilot aktif, 14 belum_aktif).');
  }

  // Seed dummy user (Admin PPG) — jika belum ada data
  const usersSheet = ss.getSheetByName('users');
  if (usersSheet.getLastRow() === 1) {
    const hashedPassword = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'admin123');
    const passwordHash = hashedPassword.map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
    const now = new Date().toISOString().split('T')[0];
    usersSheet.appendRow([1, 'Admin PPG', 'admin', passwordHash, 'admin_ppg', 'ppg', 1, 'admin@ppg.local', 'active', now, now, 'system']);
    console.log('✓ Dummy user (admin/admin123) seeded. WAJIB GANTI PASSWORD sebelum produksi!');
  }
}
