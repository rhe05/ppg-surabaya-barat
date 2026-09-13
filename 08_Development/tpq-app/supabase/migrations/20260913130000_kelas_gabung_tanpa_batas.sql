-- =====================================================================
-- 20260913130000_kelas_gabung_tanpa_batas.sql
--
-- "Gabung Kelas" (guru/admin mobile) -- diminta owner 2026-09-13: kolom
-- "Sampai" WAJIB diisi tanggal padahal admin sering tidak tahu sampai
-- kapan gurunya izin/kelas digabung ("kami tidak tau sampai kapan kelas
-- ini di gabungkan") -- perlu opsi "Tanpa batas waktu".
--
-- `kelas_gabung.tanggal_selesai` (migrasi 20260828200000) dibuat NOT NULL
-- sejak awal, jadi tidak ada cara merepresentasikan "tanpa batas". Diubah
-- jadi NULLABLE -- NULL = tanpa batas waktu (penggabungan aktif TERUS
-- sejak tanggal_mulai sampai admin membatalkannya manual). CHECK rentang
-- disesuaikan supaya NULL tidak kena constraint "selesai >= mulai".
--
-- Konsumen `muatGabungAktif` (lib/kelasGabungGilir.ts) HARUS ikut
-- diperbaiki di sisi frontend (query `.gte('tanggal_selesai', tanggal)`
-- SELALU false utk NULL di Postgres/PostgREST -- kalau tidak diubah jadi
-- OR ".is.null", penggabungan "tanpa batas" tidak akan pernah terbaca
-- aktif di Pengumuman Jadwal KBM sama sekali).
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

ALTER TABLE public.kelas_gabung ALTER COLUMN tanggal_selesai DROP NOT NULL;

ALTER TABLE public.kelas_gabung DROP CONSTRAINT IF EXISTS chk_kelas_gabung_rentang;
ALTER TABLE public.kelas_gabung
  ADD CONSTRAINT chk_kelas_gabung_rentang
  CHECK (tanggal_selesai IS NULL OR tanggal_selesai >= tanggal_mulai);

COMMENT ON COLUMN public.kelas_gabung.tanggal_selesai IS
  'NULL = tanpa batas waktu (penggabungan aktif terus sejak tanggal_mulai sampai admin membatalkannya manual). Diisi = berakhir otomatis pada tanggal itu.';

COMMIT;
