-- =====================================================================
-- 20260909150000_penerobos_role.sql
--
-- Fitur "Penerobos Kelp" (Pnb Kelp) -- app mobile tersendiri utk majlis
-- taklim jamaah keluarga/umum (di atas usia generus). Berkas ini HANYA
-- menambah nilai peran 'penerobos' ke enum app_role.
--
-- DIPISAH dari 20260909160000_jamaah.sql (tabel + RLS) karena PostgreSQL
-- melarang MEMAKAI nilai enum baru pada transaksi yang SAMA dengan
-- ALTER TYPE ... ADD VALUE-nya. Jalankan berkas ini DULU, commit, baru
-- berkas jamaah.
--
-- Peran 'penerobos' dikunci ke satu kelompok lewat profiles.scope_kelompok_id
-- (persis pola 'guru'/'admin_kelompok'). auth_profile() tidak perlu diubah
-- -- ia mengembalikan role apa adanya.
--
-- Idempoten: ADD VALUE IF NOT EXISTS -- aman dijalankan ulang.
-- =====================================================================

BEGIN;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'penerobos';

COMMIT;
