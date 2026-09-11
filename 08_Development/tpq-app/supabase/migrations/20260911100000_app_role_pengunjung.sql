-- =====================================================================
-- 20260911100000_app_role_pengunjung.sql
--
-- Fitur "Pengunjung" (demo aplikasi via link, klaim dgn Google, tanpa
-- username/password) -- LANGKAH 1 dari 2. Nilai enum baru TIDAK BOLEH
-- dipakai dalam transaksi yang sama dgn ALTER TYPE (gotcha Postgres),
-- makanya file ini SENDIRIAN. Migrasi berikutnya
-- (20260911110000_pengunjung_fondasi.sql) baru boleh dijalankan SETELAH
-- file ini commit.
-- =====================================================================

BEGIN;

ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'pengunjung';

COMMIT;
