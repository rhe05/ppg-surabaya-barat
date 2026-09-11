-- =====================================================================
-- 20260911170000_pengunjung_absensi_select.sql
--
-- Bug: pengunjung sudah bisa MENULIS absensi (migrasi 20260911150000)
-- tapi tidak bisa MEMBACANYA kembali -- Riwayat Kehadiran (App Guru)
-- tetap kosong utk tanggal yang baru saja diisi. Akar masalah:
-- `absensi_select_scoped` tidak pernah menyertakan cabang 'pengunjung'
-- sejak migrasi awal fitur Pengunjung (20260911120000, daftar 11
-- tabelnya tidak menyertakan `absensi` -- pola gap yang sama dgn bug
-- ke-5 di `santri_kelas_riwayat`).
--
-- Fix: tambah cabang 'pengunjung' pada kebijakan SELECT yang sudah ada.
-- Badan 3 cabang lain disalin PERSIS dari produksi (pg_get_expr) supaya
-- tidak mengubah perilaku peran lain.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "absensi_select_scoped" ON public.absensi;
CREATE POLICY "absensi_select_scoped" ON public.absensi
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'::text)
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_desa'::text)
        AND (( SELECT p.scope_desa_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
             = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = absensi.kelompok_id))))
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = ANY (ARRAY['admin_kelompok'::text, 'guru'::text]))
        AND (( SELECT p.scope_kelompok_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kelompok_id))
    OR (EXISTS ( SELECT 1
        FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
        WHERE (p.is_active
          AND (p.role = 'pengunjung'::text)
          AND (p.scope_kelompok_id = absensi.kelompok_id)
          AND public.pengunjung_masih_berlaku())))
  );

COMMIT;
