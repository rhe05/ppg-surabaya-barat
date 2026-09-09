-- =====================================================================
-- 20260909180000_ketua_mudai_role.sql
--
-- Tambah nilai peran 'ketua_mudai' (Ketua Muda-i) ke enum app_role.
-- Untuk saat ini PERAN SAJA — belum ada aplikasi/fitur khusus; akun
-- ketua_mudai yang login diarahkan ke halaman "fitur menyusul"
-- (RequireAuth). Dipilih saat registrasi (/onboarding) & disetujui admin.
--
-- DIPISAH dari 20260909190000 (CHECK + policy + RPC yang MEMAKAI nilai
-- ini) karena PostgreSQL melarang pakai nilai enum baru pada transaksi
-- yang sama dengan ALTER TYPE ... ADD VALUE-nya. Jalankan berkas ini
-- DULU, commit, baru berkas 190000.
--
-- Idempoten: ADD VALUE IF NOT EXISTS.
-- =====================================================================

BEGIN;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ketua_mudai';

COMMIT;
