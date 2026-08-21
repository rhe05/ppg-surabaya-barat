-- =====================================================================
-- salin_probul_semester1_ke_semester2_v2_bulan_sama.sql
--
-- Versi PERBAIKAN dari salin_probul_semester1_ke_semester2_baca_huruf.sql
-- (skrip lama SALAH mencocokkan bulan+6, ternyata semester 1 & semester
-- 2 SAMA-SAMA pakai nomor bulan 1-6 di data produksi -- dikonfirmasi
-- lewat diagnosa_probul_semester_bacaan_alquran.sql sebelumnya, BUKAN
-- ditebak dari kode). Skrip ini mencocokkan BULAN YANG SAMA (bulan 1 ke
-- bulan 1, dst), bukan +6.
--
-- Menyalin Target & Minggu 1-4 semester 1 APA ADANYA ke bulan yang SAMA
-- di semester 2, khusus materi Bacaan Al-Qur'an kelas 1-3, semua
-- kelompok/tahun. Jilid/Deskripsi TIDAK ikut disalin.
--
-- Plain UPDATE (bukan UPSERT) -- baris semester 2 bulan 1-6 SUDAH ADA
-- semua (Target sudah terisi manual, Minggu memang masih kosong),
-- dikonfirmasi lewat diagnosa sebelumnya, jadi tidak ada baris baru yang
-- perlu di-INSERT kali ini.
--
-- Aman dijalankan ulang (menimpa dgn nilai semester 1 yang sama).
-- =====================================================================

BEGIN;

UPDATE kurikulum_probul b2
   SET target = b1.target,
       minggu1 = b1.minggu1,
       minggu2 = b1.minggu2,
       minggu3 = b1.minggu3,
       minggu4 = b1.minggu4
  FROM kurikulum_probul b1
  JOIN kurikulum_promes pm1 ON pm1.id = b1.promes_id AND pm1.semester = 1
  JOIN kurikulum_prota pr ON pr.id = pm1.prota_id
  JOIN kategori_kbm k ON k.id = pr.kategori_kbm_id
  JOIN kurikulum_promes pm2 ON pm2.prota_id = pr.id AND pm2.semester = 2
 WHERE b2.promes_id = pm2.id
   AND b2.bulan = b1.bulan
   AND pr.kelas IN ('1', '2', '3')
   AND k.nama = 'Bacaan Al-Qur''an';

COMMIT;
