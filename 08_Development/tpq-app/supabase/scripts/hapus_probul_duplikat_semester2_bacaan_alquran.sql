-- =====================================================================
-- hapus_probul_duplikat_semester2_bacaan_alquran.sql
--
-- PERBAIKAN utk kesalahan skrip sebelumnya
-- (salin_probul_semester1_ke_semester2_baca_huruf.sql): skrip itu
-- menyalin Target/Minggu semester 1 (bulan 1-6) ke BULAN+6 (7-12) milik
-- promes semester 2 -- padahal semester 2 utk materi Bacaan Al-Qur'an
-- kelas 1-3 SUDAH punya datanya sendiri di bulan 1-6 (Target terisi,
-- Minggu memang belum diisi). Hasilnya: promes semester 2 jadi py 12
-- baris (6 asli + 6 duplikat salinan dari semester 1).
--
-- Skrip ini menghapus HANYA baris duplikat itu -- baris probul di bawah
-- promes semester=2, bulan>6 (7-12), khusus materi Bacaan Al-Qur'an
-- kelas 1-3. Baris asli semester 2 (bulan 1-6) dan seluruh semester 1
-- TIDAK disentuh sama sekali.
--
-- Diverifikasi dulu lewat diagnosa_probul_semester_bacaan_alquran.sql:
-- 18 baris (id 177-182, 165-170, 171-176) di kelp Petemon kelas 1/2/3
-- persis cocok pola ini (isinya identik dgn semester 1 -- bukti nyata
-- itu hasil salinan skrip lama, bukan data asli).
-- =====================================================================

BEGIN;

DELETE FROM kurikulum_probul pb
USING kurikulum_promes pm, kurikulum_prota pr, kategori_kbm k
WHERE pb.promes_id = pm.id
  AND pm.prota_id = pr.id
  AND pr.kategori_kbm_id = k.id
  AND pr.kelas IN ('1', '2', '3')
  AND k.nama = 'Bacaan Al-Qur''an'
  AND pm.semester = 2
  AND pb.bulan > 6;

COMMIT;
