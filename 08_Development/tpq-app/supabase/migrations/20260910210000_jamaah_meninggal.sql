-- =====================================================================
-- 20260910210000_jamaah_meninggal.sql
--
-- Fitur "Jamaah Meninggal" (Penerobos Kelp): mencatat jamaah yang wafat.
-- Jamaah dengan tanggal_meninggal terisi keluar dari Data Jamaah aktif
-- dan dari seluruh hitungan Ringkasan Jamaah; masuk arsip "Jamaah
-- Meninggal" (bisa dikembalikan bila salah input).
--
-- Dua kolom baru di `jamaah`:
--   tanggal_meninggal  date  -- kapan wafat (NULL = masih hidup/aktif)
--   catatan_meninggal  text  -- keterangan (opsional)
--
-- Tidak ada perubahan RLS: kebijakan UPDATE `jamaah` untuk penerobos
-- (migrasi 20260909150000) sudah mencakup seluruh kolom baris sekelompok.
-- Idempoten. Selaras dgn 20260910200000 (jamaah_pindah).
-- =====================================================================

BEGIN;

ALTER TABLE public.jamaah
  ADD COLUMN IF NOT EXISTS tanggal_meninggal date,
  ADD COLUMN IF NOT EXISTS catatan_meninggal text;

COMMENT ON COLUMN public.jamaah.tanggal_meninggal IS
  'Tanggal jamaah meninggal. NULL = masih hidup/aktif.';
COMMENT ON COLUMN public.jamaah.catatan_meninggal IS
  'Keterangan kematian jamaah (opsional).';

COMMIT;
