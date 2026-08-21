-- =====================================================================
-- 20260822090000_kurikulum_prota_target2_deskripsi2.sql
--
-- Owner minta pasangan Target/Deskripsi KEDUA di form Ubah Prota,
-- SEMENTARA khusus materi "Bacaan Al-Qur'an" (kategori KBM lain TIDAK
-- disentuh, tetap 1 pasang). Ditaruh di kurikulum_prota (bukan tabel
-- terpisah): kolom tambahan nullable, tidak mengubah baris yang sudah
-- ada, dan kategori lain yang tidak pernah mengisinya cukup NULL selamanya.
--
-- Tidak ada perubahan RLS -- policy kurikulum_prota yang sudah ada
-- (SELECT/UPDATE/dst) berlaku per-BARIS, bukan per-kolom, jadi kolom
-- baru otomatis ikut tercakup tanpa policy tambahan.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

ALTER TABLE public.kurikulum_prota
  ADD COLUMN IF NOT EXISTS target2 text,
  ADD COLUMN IF NOT EXISTS deskripsi2 text;

COMMENT ON COLUMN public.kurikulum_prota.target2 IS
  'Pasangan Target KEDUA -- sementara khusus materi "Bacaan Al-Qur''an" (diisi lewat form Ubah Prota kalau kategorinya cocok). NULL utk kategori lain.';
COMMENT ON COLUMN public.kurikulum_prota.deskripsi2 IS
  'Pasangan Deskripsi KEDUA -- sementara khusus materi "Bacaan Al-Qur''an". NULL utk kategori lain.';

COMMIT;
