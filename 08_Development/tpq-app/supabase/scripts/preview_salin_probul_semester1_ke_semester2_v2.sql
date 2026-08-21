-- Preview (READ-ONLY) -- lihat dulu nilai semester 1 yang AKAN disalin
-- ke semester 2 (bulan yang sama), sebelum menjalankan UPDATE
-- sungguhan di salin_probul_semester1_ke_semester2_v2_bulan_sama.sql.
SELECT
  kel.nama AS nama_kelompok,
  pr.kelas,
  b1.bulan,
  b1.target AS target_semester1,
  b2.target AS target_semester2_sekarang,
  b1.minggu1 AS minggu1_semester1,
  b2.minggu1 AS minggu1_semester2_sekarang,
  b1.minggu2, b1.minggu3, b1.minggu4
FROM kurikulum_probul b1
JOIN kurikulum_promes pm1 ON pm1.id = b1.promes_id AND pm1.semester = 1
JOIN kurikulum_prota pr ON pr.id = pm1.prota_id
JOIN kategori_kbm k ON k.id = pr.kategori_kbm_id
JOIN kelompok kel ON kel.id = pr.kelompok_id
JOIN kurikulum_promes pm2 ON pm2.prota_id = pr.id AND pm2.semester = 2
JOIN kurikulum_probul b2 ON b2.promes_id = pm2.id AND b2.bulan = b1.bulan
WHERE pr.kelas IN ('1', '2', '3')
  AND k.nama = 'Bacaan Al-Qur''an'
ORDER BY kel.nama, pr.kelas, b1.bulan;
