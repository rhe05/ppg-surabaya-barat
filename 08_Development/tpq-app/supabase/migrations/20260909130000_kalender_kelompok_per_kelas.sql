-- =====================================================================
-- 20260909130000_kalender_kelompok_per_kelas.sql
--
-- "Tandai Libur / Aktif" (kalender_kelompok) sebelumnya SELALU se-kelompok:
-- satu baris per (kelompok, tanggal). Diminta owner 2026-09-09: admin
-- boleh menandai HANYA kelas tertentu yang libur/aktif, dan boleh ada
-- kelas A libur + kelas B tetap aktif di tanggal yang sama.
--
-- Perubahan:
--   1. kolom kelas_ids bigint[]  -- NULL = seluruh kelompok (perilaku
--      lama; 3 baris produksi yg ada otomatis NULL = tidak berubah).
--      Array id kelas = HANYA kelas itu.
--   2. unik (kelompok_id, tanggal) -> (kelompok_id, tanggal, jenis):
--      izinkan 1 baris 'libur' + 1 baris 'aktif' pd tanggal sama.
--
-- Aturan resolusi per (tanggal, kelas) -- ditegakkan di aplikasi
-- (lib/kalenderKelompok.ts), bukan DB:
--   entri SPESIFIK (kelas_ids memuat kelas itu) menang atas entri NULL;
--   pd kekhususan sama, 'aktif' menang atas 'libur' (tidak menghapus
--   absensi).
--
-- RLS tidak berubah: kalender_kelompok_tulis_admin sudah scoped
-- kelompok_id, dan kelas_ids selalu kelas milik kelompok itu (dibatasi UI).
--
-- Berkas idempoten.
-- =====================================================================

BEGIN;

ALTER TABLE public.kalender_kelompok
  ADD COLUMN IF NOT EXISTS kelas_ids bigint[];

COMMENT ON COLUMN public.kalender_kelompok.kelas_ids IS
  'NULL = berlaku utk SELURUH kelompok (perilaku lama). Array id kelas = HANYA kelas itu yang libur/aktif pd tanggal ini. Resolusi per-kelas di lib/kalenderKelompok.ts: spesifik menang atas NULL, aktif menang atas libur pd kekhususan sama.';

ALTER TABLE public.kalender_kelompok
  DROP CONSTRAINT IF EXISTS uq_kalender_kelompok_tanggal;

ALTER TABLE public.kalender_kelompok
  DROP CONSTRAINT IF EXISTS uq_kalender_kelompok_tanggal_jenis;
ALTER TABLE public.kalender_kelompok
  ADD CONSTRAINT uq_kalender_kelompok_tanggal_jenis UNIQUE (kelompok_id, tanggal, jenis);

COMMIT;
