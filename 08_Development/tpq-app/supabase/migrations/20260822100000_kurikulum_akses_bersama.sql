-- =====================================================================
-- 20260822100000_kurikulum_akses_bersama.sql
--
-- Owner: Kurikulum sekarang jadi "dasar" bersama utk SEMUA kelp/desa,
-- bukan data per-kelompok lagi (faktanya cuma Kelp Petemon yang pernah
-- diisi -- 94 baris Prota, satu2nya sumber). Frontend (kurikulum/page.tsx)
-- berhenti menampilkan gerbang pilih Kelompok+Tahun sama sekali dan
-- selalu memuat kelompok_id=1 (Kelp Petemon) apa adanya utk SEMUA
-- peran. RLS WAJIB menyusul, bukan cuma UI:
--
-- 1. SELECT dibuka utk SEMUA peran aktif (bukan cuma yg scope-nya cocok
--    dgn kelompok_id=1 spt sebelumnya) -- guru/admin_kelompok/admin_desa
--    dari kelp/desa MANAPUN sekarang harus bisa membaca kurikulum
--    bersama ini, bukan cuma yang scope_kelompok_id-nya kebetulan 1.
-- 2. INSERT/UPDATE dipersempit jadi admin_ppg SAJA (diminta owner:
--    "yang bisa edit hanya admin aplikasi, yang lain sifatnya hanya
--    lihat saja entah itu admin kelp admin desa ataupun guru").
--    Sebelumnya admin_desa & admin_kelompok jg boleh tulis -- itu
--    dicabut di sini.
-- 3. DELETE TIDAK disentuh -- sudah admin_ppg-only sejak awal.
--
-- Berlaku utk ketiga tabel kurikulum_prota/promes/probul (redundan
-- sengaja, RLS tidak bisa "warisan" dari tabel induk).
--
-- Berkas idempoten: aman dijalankan ulang (DROP POLICY IF EXISTS lalu
-- CREATE POLICY).
-- =====================================================================

BEGIN;

-- ── kurikulum_prota ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "kurikulum_prota_select_scoped" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_select_scoped" ON public.kurikulum_prota
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active)));

DROP POLICY IF EXISTS "kurikulum_prota_insert_admin_only" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_insert_admin_only" ON public.kurikulum_prota
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "kurikulum_prota_update_admin_only" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_update_admin_only" ON public.kurikulum_prota
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

-- ── kurikulum_promes ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "kurikulum_promes_select_scoped" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_select_scoped" ON public.kurikulum_promes
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active)));

DROP POLICY IF EXISTS "kurikulum_promes_insert_admin_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_insert_admin_only" ON public.kurikulum_promes
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "kurikulum_promes_update_admin_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_update_admin_only" ON public.kurikulum_promes
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

-- ── kurikulum_probul ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "kurikulum_probul_select_scoped" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_select_scoped" ON public.kurikulum_probul
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active)));

DROP POLICY IF EXISTS "kurikulum_probul_insert_admin_only" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_insert_admin_only" ON public.kurikulum_probul
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "kurikulum_probul_update_admin_only" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_update_admin_only" ON public.kurikulum_probul
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

COMMIT;
