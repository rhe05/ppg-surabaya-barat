-- Diagnosa (READ-ONLY, tidak mengubah apa pun) -- lihat kondisi asli
-- kurikulum_promes + kurikulum_probul utk materi Bacaan Al-Qur'an,
-- kelas 1-3, sebelum memutuskan baris mana yang perlu dihapus/dipindah.
SELECT
  pr.kelas,
  pr.tahun,
  kel.nama AS nama_kelompok,
  pm.id AS promes_id,
  pm.semester,
  pb.id AS probul_id,
  pb.bulan,
  pb.target,
  pb.minggu1,
  pb.minggu2,
  pb.minggu3,
  pb.minggu4
FROM kurikulum_prota pr
JOIN kategori_kbm k ON k.id = pr.kategori_kbm_id
JOIN kelompok kel ON kel.id = pr.kelompok_id
JOIN kurikulum_promes pm ON pm.prota_id = pr.id
LEFT JOIN kurikulum_probul pb ON pb.promes_id = pm.id
WHERE pr.kelas IN ('1', '2', '3')
  AND k.nama = 'Bacaan Al-Qur''an'
ORDER BY kel.nama, pr.kelas, pm.semester, pb.bulan;
