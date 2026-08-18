-- =====================================================================
-- 20260818220000_kelas_scope.sql
--
-- Menutup celah scope TERAKHIR dari audit 17 Agt 2026 yang masih terbuka:
-- policy INSERT dan UPDATE `kelas` hanya memeriksa ROLE, tanpa mencocokkan
-- `kelompok_id` baris dengan scope pengguna. Pola yang sama sudah ditambal
-- untuk santri (20260817120000), guru (20260818090000), dan jadwal
-- (20260818130000).
--
-- Dampaknya sekarang lebih nyata daripada saat audit: halaman /kelas akan
-- dibuka untuk membuat & menyunting kelas (kelompok 6/7/8 punya 130 santri
-- tanpa satu pun kelas), jadi tanpa tambalan ini admin satu kelompok bisa
-- membuat kelas di kelompok lain — lalu kelasnya menghilang dari
-- pandangannya sendiri karena `kelas_select_scoped` memang sudah benar.
--
-- DELETE dibiarkan admin_ppg saja (`kelas_delete_ppg_only`), seragam dengan
-- tabel master lain. Tabel `kelas` punya `deleted_at`, jadi admin kelompok
-- tetap bisa menonaktifkan kelas lewat hapus halus.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "kelas_insert_admin_only" ON public.kelas;
CREATE POLICY "kelas_insert_admin_only" ON public.kelas
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kelas.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = kelas.kelompok_id))));

DROP POLICY IF EXISTS "kelas_update_admin_only" ON public.kelas;
CREATE POLICY "kelas_update_admin_only" ON public.kelas
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kelas.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = kelas.kelompok_id))));

COMMIT;
