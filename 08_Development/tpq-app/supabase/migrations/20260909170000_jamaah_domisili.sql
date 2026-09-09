-- =====================================================================
-- 20260909170000_jamaah_domisili.sql
--
-- Tambah 3 kolom domisili/hunian ke tabel jamaah (fitur Penerobos Kelp).
-- Teks bebas (tanpa enum/CHECK) — nilainya dikunci di UI, sama pola
-- status_keluarga / pendidikan_terakhir.
--
--   status_domisili : Mukim / Musiman / Pindah
--   jenis_hunian    : Rumah / Kost / Apartemen / Mess / Lainnya
--   status_hunian   : Milik Sendiri / Sewa Kontrak / Rumah Orang Tua /
--                     Rumah Mertua / Di Sediakan Instansi / Lainnya
--
-- Idempoten: ADD COLUMN IF NOT EXISTS. Aman dijalankan ulang.
-- =====================================================================

BEGIN;

ALTER TABLE public.jamaah ADD COLUMN IF NOT EXISTS status_domisili text;
ALTER TABLE public.jamaah ADD COLUMN IF NOT EXISTS jenis_hunian    text;
ALTER TABLE public.jamaah ADD COLUMN IF NOT EXISTS status_hunian   text;

COMMIT;
