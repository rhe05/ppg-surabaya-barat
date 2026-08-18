-- =====================================================================
-- 20260818130000_jadwal_scope.sql
--
-- Menutup celah scope pada policy TULIS `jadwal_kbm` dan
-- `jadwal_kategori_hari` — pola yang sama persis dengan santri
-- (20260817120000) dan guru (20260818090000): WITH CHECK/USING versi lama
-- hanya memeriksa ROLE, tanpa mencocokkan `kelompok_id` baris dengan scope
-- pengguna.
--
-- Dibuktikan di produksi 18 Agt 2026 lewat peniruan role: admin_kelompok
-- kelompok 6 BERHASIL menyisipkan sesi KBM ke kelompok 1. Baris itu lalu
-- tidak terlihat lagi olehnya sendiri karena policy SELECT memang sudah
-- ber-scope dengan benar.
--
-- Berbeda dari santri/guru, di sini UPDATE ikut ditambal: pada kedua tabel
-- ini policy UPDATE juga role-only, jadi admin satu kelompok bisa MENGUBAH
-- jadwal kelompok lain, bukan cuma menambah.
--
-- DELETE tidak disentuh: `*_delete_ppg_only` memang sengaja hanya admin_ppg.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ── jadwal_kbm ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "jadwal_kbm_insert_admin_only" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_insert_admin_only" ON public.jadwal_kbm
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jadwal_kbm.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jadwal_kbm.kelompok_id)))))));

DROP POLICY IF EXISTS "jadwal_kbm_update_admin_only" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_update_admin_only" ON public.jadwal_kbm
  AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jadwal_kbm.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jadwal_kbm.kelompok_id)))))));

-- ── jadwal_kategori_hari ─────────────────────────────────────────────
DROP POLICY IF EXISTS "jadwal_kategori_hari_insert_admin_only" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_insert_admin_only" ON public.jadwal_kategori_hari
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jadwal_kategori_hari.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jadwal_kategori_hari.kelompok_id)))))));

DROP POLICY IF EXISTS "jadwal_kategori_hari_update_admin_only" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_update_admin_only" ON public.jadwal_kategori_hari
  AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jadwal_kategori_hari.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jadwal_kategori_hari.kelompok_id)))))));

COMMIT;
