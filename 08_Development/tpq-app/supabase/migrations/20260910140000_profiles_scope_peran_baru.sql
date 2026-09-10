-- =====================================================================
-- 20260910140000_profiles_scope_peran_baru.sql
--
-- BUG (ERROR_LOG #41): registrasi Penerobos Kelp / Ketua Muda-i gagal
--   new row for relation "profiles" violates check constraint
--   "chk_profiles_scope"
--
-- Akar: migrasi 20260909190000 memperluas chk_pendaftaran_scope (di tabel
-- pendaftaran_akun) & 20260910130000 memperluas jalur undangan untuk peran
-- 'penerobos' + 'ketua_mudai' — TAPI constraint chk_profiles_scope di tabel
-- `profiles` sendiri tidak pernah ikut diperluas. Jadi begitu
-- setujui_pendaftaran() / klaim_admin_kelp() menulis
-- profiles.role = 'penerobos'|'ketua_mudai' dengan scope_kelompok_id,
-- CHECK menolak (cabang kelompok-scoped cuma mengenal admin_kelompok + guru).
--
-- Perbaikan: tambahkan 'penerobos' & 'ketua_mudai' ke cabang kelompok-scoped.
-- Keduanya memang koordinator SE-KELOMPOK (butuh scope_kelompok_id,
-- scope_ppg_id/desa_id NULL) — cerminan chk_pendaftaran_scope.
--
-- Definisi lama DISALIN dari produksi (pg_get_constraintdef, 2026-09-10),
-- hanya ARRAY cabang terakhir yang berubah. Idempoten.
-- =====================================================================

BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_scope;

ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_scope CHECK (
  (
    (role IS NULL) AND (scope_ppg_id IS NULL) AND (scope_desa_id IS NULL) AND (scope_kelompok_id IS NULL)
  )
  OR (
    (role = 'admin_ppg'::app_role) AND (scope_ppg_id IS NOT NULL) AND (scope_desa_id IS NULL) AND (scope_kelompok_id IS NULL)
  )
  OR (
    (role = 'admin_desa'::app_role) AND (scope_desa_id IS NOT NULL) AND (scope_ppg_id IS NULL) AND (scope_kelompok_id IS NULL)
  )
  OR (
    (role = ANY (ARRAY[
       'admin_kelompok'::app_role,
       'guru'::app_role,
       'penerobos'::app_role,
       'ketua_mudai'::app_role]))
    AND (scope_kelompok_id IS NOT NULL) AND (scope_ppg_id IS NULL) AND (scope_desa_id IS NULL)
  )
);

COMMIT;
