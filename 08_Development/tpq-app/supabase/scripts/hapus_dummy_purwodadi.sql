-- Hapus PERMANEN data dummy Desa Purwodadi (id=2): Kelp Bangun Rejo (6),
-- Kelp Purwodadi (7), Kelp Dupak (8) -- diminta owner 20 Agt, dikonfirmasi
-- boleh hard delete (bukan soft-delete). Dijalankan MANUAL oleh owner
-- lewat Supabase Studio > SQL Editor (project ruang-ngaji-dev), BUKAN oleh
-- Claude -- kebijakan: tidak mengeksekusi penghapusan permanen sendiri.
--
-- Dicek dulu (20 Agt): 130 santri, 12 guru, 780 absensi di 3 kelompok itu;
-- SEMUA tabel lain (kelas, jurnal_kbm, kurikulum_*, munaqosah, konseling,
-- pengurus_kelp, jadwal_kbm, guru_izin, akses_kelas_request, pengumuman,
-- calendar_events, kop_surat, siklus_generus) sudah 0 baris, dan TIDAK ADA
-- akun (profiles.scope_kelompok_id) yang terhubung ke kelompok ini -- jadi
-- hapus tabel di bawah TIDAK memutus data lain / akun siapa pun.
--
-- Urutan wajib: absensi (anak) dulu sebelum santri (induk, FK
-- absensi.santri_id -> santri.id), baru guru.
BEGIN;

DELETE FROM absensi WHERE kelompok_id IN (6, 7, 8);
DELETE FROM santri  WHERE kelompok_id IN (6, 7, 8);
DELETE FROM guru    WHERE kelompok_id IN (6, 7, 8);

-- Verifikasi sebelum COMMIT -- ketiganya harus 0.
SELECT
  (SELECT count(*) FROM absensi WHERE kelompok_id IN (6, 7, 8)) AS sisa_absensi,
  (SELECT count(*) FROM santri  WHERE kelompok_id IN (6, 7, 8)) AS sisa_santri,
  (SELECT count(*) FROM guru    WHERE kelompok_id IN (6, 7, 8)) AS sisa_guru;

COMMIT;
-- Kalau hasil SELECT di atas TIDAK semuanya 0, ganti COMMIT jadi ROLLBACK
-- sebelum menjalankan, lalu laporkan ke Claude.
