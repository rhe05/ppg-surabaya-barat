-- =====================================================================
-- 20260910200000_jamaah_pindah.sql
--
-- Fitur "Jamaah Pindah" (Penerobos Kelp): mencatat jamaah yang pindah
-- keluar kelompok. Jamaah ditandai status_domisili = 'Pindah' lalu
-- keluar dari daftar Data Jamaah aktif dan masuk arsip "Jamaah Pindah".
--
-- Dua kolom baru di `jamaah`:
--   tanggal_pindah  date  -- kapan pindah (NULL = masih aktif)
--   pindah_ke       text  -- tujuan / keterangan kepindahan
--
-- Tidak ada perubahan RLS: kebijakan UPDATE `jamaah` untuk penerobos
-- (migrasi 20260909150000) sudah mencakup seluruh kolom baris sekelompok.
-- Idempoten.
-- =====================================================================

BEGIN;

ALTER TABLE public.jamaah
  ADD COLUMN IF NOT EXISTS tanggal_pindah date,
  ADD COLUMN IF NOT EXISTS pindah_ke      text;

COMMENT ON COLUMN public.jamaah.tanggal_pindah IS
  'Tanggal jamaah pindah keluar kelompok (status_domisili = ''Pindah''). NULL = masih aktif.';
COMMENT ON COLUMN public.jamaah.pindah_ke IS
  'Tujuan / keterangan kepindahan jamaah.';

COMMIT;
