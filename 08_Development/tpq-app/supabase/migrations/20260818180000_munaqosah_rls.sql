-- =====================================================================
-- 20260818180000_munaqosah_rls.sql
--
-- Fondasi DB untuk halaman Munaqosah (penilaian santri per periode).
-- Pola yang sama untuk kesekian kalinya: `munaqosah` dan
-- `periode_munaqosah` punya RLS AKTIF dengan NOL policy — tertutup senyap.
--
-- Aturan ditiru dari Modul_MaintainMunaqosah.gs:
--   periode_munaqosah — REFERENSI PPG-wide (tidak punya kolom kelompok_id).
--       Semua peran aktif membaca; hanya admin_ppg yang membuka/menutup
--       periode. serverGetPeriodeMunaqosah:15 memang membuka daftar ini
--       untuk semua sesi tanpa memeriksa peran.
--   munaqosah — BER-KELOMPOK, tapi lewat santri: tabelnya TIDAK punya
--       kolom kelompok_id sendiri, jadi scope-nya ditelusuri
--       `santri.kelompok_id` (serverCreateMunaqosah:171 memakai
--       kelompok santri, bukan kolom sendiri).
--       Guru VIEW-ONLY, sesuai kepala modul lama.
--
-- Satu aturan yang di app lama hanya dijaga kode: larangan dua penilaian
-- untuk santri yang sama pada periode yang sama
-- (serverCreateMunaqosah:177-183). Ditegakkan indeks unik parsial supaya
-- Postgres yang menjamin, bukan pemeriksaan baca-lalu-tulis yang bisa
-- bocor saat dua penilai menyimpan bersamaan.
--
-- ⚠️ Indeks uniknya PARSIAL — `.upsert onConflict` gagal 42P10, frontend
-- harus cek-lalu-insert dan menerjemahkan 23505.
--
-- DELETE munaqosah tidak diberi policy: tabelnya punya `deleted_at`,
-- jadi jalur yang benar adalah hapus HALUS lewat UPDATE.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_munaqosah_santri_periode
  ON public.munaqosah (santri_id, periode_id)
  WHERE (deleted_at IS NULL);

-- ── periode_munaqosah: referensi PPG-wide ────────────────────────────
DROP POLICY IF EXISTS "periode_munaqosah_select_semua" ON public.periode_munaqosah;
CREATE POLICY "periode_munaqosah_select_semua" ON public.periode_munaqosah
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active));

DROP POLICY IF EXISTS "periode_munaqosah_tulis_ppg" ON public.periode_munaqosah;
CREATE POLICY "periode_munaqosah_tulis_ppg" ON public.periode_munaqosah
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role = 'admin_ppg'))
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role = 'admin_ppg'));

-- ── munaqosah: scope ditelusuri lewat santri ─────────────────────────
-- Perhatikan subquery `(SELECT s.kelompok_id FROM santri s WHERE s.id =
-- munaqosah.santri_id)`: itu satu-satunya jembatan ke kelompok, karena
-- tabel munaqosah tidak menyimpan kelompok_id sendiri.
DROP POLICY IF EXISTS "munaqosah_select_scoped" ON public.munaqosah;
CREATE POLICY "munaqosah_select_scoped" ON public.munaqosah
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa' AND p.scope_desa_id = (
           SELECT k.desa_id FROM kelompok k
            WHERE k.id = (SELECT s.kelompok_id FROM santri s WHERE s.id = munaqosah.santri_id)))
     OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = (
           SELECT s.kelompok_id FROM santri s WHERE s.id = munaqosah.santri_id)))));

DROP POLICY IF EXISTS "munaqosah_tulis_admin" ON public.munaqosah;
CREATE POLICY "munaqosah_tulis_admin" ON public.munaqosah
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa' AND p.scope_desa_id = (
           SELECT k.desa_id FROM kelompok k
            WHERE k.id = (SELECT s.kelompok_id FROM santri s WHERE s.id = munaqosah.santri_id)))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
           SELECT s.kelompok_id FROM santri s WHERE s.id = munaqosah.santri_id)))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa' AND p.scope_desa_id = (
           SELECT k.desa_id FROM kelompok k
            WHERE k.id = (SELECT s.kelompok_id FROM santri s WHERE s.id = munaqosah.santri_id)))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
           SELECT s.kelompok_id FROM santri s WHERE s.id = munaqosah.santri_id)))));

COMMIT;
