-- =====================================================================
-- 20260827100000_peringkat_konfig_poin.sql
--
-- Fitur "Peringkat" (2026-08-27) -- peringkat kehadiran berbasis POIN.
-- Nilai poin per status BISA DIATUR TIAP KELOMPOK (owner: "setiap kelp
-- cara mengatur pointnya pasti berbeda"). Satu baris per kelompok; kalau
-- belum ada, frontend (lib/peringkatKehadiran.ts) pakai default 3/1/1/0.
--
-- Skema & RLS meniru PERSIS pola kalender_kelompok (20260824100000):
-- guru boleh MEMBACA kelompoknya sendiri (peringkat ditampilkan jg ke
-- guru), TULIS hanya admin_ppg / admin_desa (scope desa) / admin_kelompok
-- (scope kelompok). Tidak ada GRANT tabel eksplisit -- sama dgn
-- kalender_kelompok & admin_kelp_undangan, default privileges Supabase
-- utk role `authenticated` di schema public sudah cukup.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.peringkat_konfig_poin (
  kelompok_id     bigint PRIMARY KEY REFERENCES public.kelompok (id),
  poin_hadir      smallint NOT NULL DEFAULT 3,
  poin_izin       smallint NOT NULL DEFAULT 1,
  poin_sakit      smallint NOT NULL DEFAULT 1,
  poin_alpa       smallint NOT NULL DEFAULT 0,
  diperbarui_oleh uuid REFERENCES public.profiles (id),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_peringkat_poin_nonneg
    CHECK (poin_hadir >= 0 AND poin_izin >= 0 AND poin_sakit >= 0 AND poin_alpa >= 0),
  CONSTRAINT chk_peringkat_poin_maks
    CHECK (poin_hadir <= 100 AND poin_izin <= 100 AND poin_sakit <= 100 AND poin_alpa <= 100)
);
COMMENT ON TABLE public.peringkat_konfig_poin IS
  'Nilai poin per status kehadiran, diatur per kelompok utk fitur Peringkat. Default 3/1/1/0 kalau baris tidak ada -- lihat lib/peringkatKehadiran.ts.';

ALTER TABLE public.peringkat_konfig_poin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "peringkat_konfig_poin_select_scoped" ON public.peringkat_konfig_poin;
CREATE POLICY "peringkat_konfig_poin_select_scoped" ON public.peringkat_konfig_poin
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = peringkat_konfig_poin.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = peringkat_konfig_poin.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = peringkat_konfig_poin.kelompok_id))));

DROP POLICY IF EXISTS "peringkat_konfig_poin_tulis_admin" ON public.peringkat_konfig_poin;
CREATE POLICY "peringkat_konfig_poin_tulis_admin" ON public.peringkat_konfig_poin
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = peringkat_konfig_poin.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = peringkat_konfig_poin.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = peringkat_konfig_poin.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = peringkat_konfig_poin.kelompok_id))));

COMMIT;
