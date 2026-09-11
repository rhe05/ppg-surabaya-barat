-- =====================================================================
-- 20260911160000_pengunjung_santri_kelas_riwayat_select.sql
--
-- Bug: Riwayat Kehadiran (App Guru, /absensi/riwayat) tampak kosong utk
-- pengunjung walau baris absensi sudah tersimpan benar. Akar masalah:
-- santriIdsKelasPadaPeriode() (lib/riwayatKelas.ts) membaca keanggotaan
-- kelas per-periode dari `santri_kelas_riwayat` -- tabel ini TIDAK
-- pernah dapat kebijakan SELECT utk `pengunjung` waktu migrasi awal
-- fitur Pengunjung (20260911120000, daftar 11 tabelnya tidak menyertakan
-- tabel ini). RLS diam-diam mengembalikan 0 baris -> roster kelas
-- kosong -> matrix "Belum ada santri di kelas ini." walau absensi ada.
--
-- Fix: tambah cabang 'pengunjung' pada kebijakan SELECT yang sudah ada,
-- pola SAMA persis dgn cabang 'guru' (scope_kelompok_id cocok), plus
-- pengunjung_masih_berlaku() spt tabel2 lain yg sudah dibuka utk
-- pengunjung. Badan kebijakan disalin dari produksi (pg_policies).
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "santri_kelas_riwayat_select_scoped" ON public.santri_kelas_riwayat;
CREATE POLICY "santri_kelas_riwayat_select_scoped" ON public.santri_kelas_riwayat
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = santri_kelas_riwayat.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = santri_kelas_riwayat.kelompok_id))
      OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = santri_kelas_riwayat.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = santri_kelas_riwayat.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

COMMIT;
