-- =====================================================================
-- SEKALI JALAN (owner, Supabase SQL Editor) -- 2026-09-09
--
-- Santri ganda "Abrisam Fahmi Hadinata" di Kelp Bangun Rejo (kelompok 6):
--   id 313 (NIS 260070) -- baris PERCOBAAN owner, tanpa kelas, TANPA data
--                           turunan sama sekali (0 absensi/tilawati/riwayat/
--                           siklus/konseling/munaqosah/tabungan/pencapaian).
--   id 314 (NIS 260071) -- baris ASLI (kelas "1 & 2", 23 absensi, dst) -> DIPERTAHANKAN.
--
-- id 313 di-HARD DELETE (bukan soft-delete): ini data uji yang tidak
-- seharusnya ada & tidak direferensikan mana pun. Guard di WHERE mencegah
-- salah hapus. permintaan_generus id 3 ("Tambah ... Abrisam") merujuk ke
-- 314, TIDAK disentuh.
-- =====================================================================

BEGIN;

DELETE FROM santri
 WHERE id = 313
   AND nis = '260070'
   AND kelompok_id = 6
   AND kelas_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM absensi WHERE santri_id = 313)
   AND NOT EXISTS (SELECT 1 FROM tilawati_pelaksanaan WHERE santri_id = 313);

COMMIT;

-- Verifikasi: select id,nama,nis,kelas_ngaji from santri where nama ilike 'abrisam%';
--   -> harus tinggal 1 baris (id 314).
