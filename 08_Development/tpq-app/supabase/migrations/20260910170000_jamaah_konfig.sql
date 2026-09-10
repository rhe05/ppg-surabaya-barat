-- =====================================================================
-- 20260910170000_jamaah_konfig.sql
--
-- Fitur "Penerobos Kelp": pengaturan per-kelompok utk form Data Jamaah.
-- Untuk sekarang satu saklar:
--   sub_kelp_wajib  — kalau true, form Tambah Jamaah WAJIB memilih Sub
--                     Kelp (beberapa daerah mengharuskan, sebagian tidak).
--
-- Satu baris per kelompok (kelompok_id = PK). Dibuat on-demand lewat
-- upsert dari layar "Kelola Sub Kelp". Tabel sengaja terpisah dari
-- `kelompok` (master data org-wide) supaya penerobos tak perlu grant
-- tulis ke sana.
--
-- RLS & pola persis tabel `jamaah` (migrasi 20260909160000):
--   admin_ppg | admin_desa se-desa | admin_kelompok se-kelompok |
--   penerobos se-kelompok  — utk SELECT / INSERT / UPDATE.
--   DELETE tidak dibutuhkan (tak ada policy -> tertutup).
--
-- Idempoten.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.jamaah_konfig (
  kelompok_id    bigint PRIMARY KEY REFERENCES public.kelompok (id),
  sub_kelp_wajib boolean NOT NULL DEFAULT false,
  diubah_oleh    uuid REFERENCES public.profiles (id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_jamaah_konfig_updated_at ON public.jamaah_konfig;
CREATE TRIGGER trg_jamaah_konfig_updated_at
  BEFORE UPDATE ON public.jamaah_konfig
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.jamaah_konfig TO authenticated;
GRANT ALL ON public.jamaah_konfig TO service_role;

ALTER TABLE public.jamaah_konfig ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jamaah_konfig_select" ON public.jamaah_konfig;
DROP POLICY IF EXISTS "jamaah_konfig_insert" ON public.jamaah_konfig;
DROP POLICY IF EXISTS "jamaah_konfig_update" ON public.jamaah_konfig;

CREATE POLICY "jamaah_konfig_select" ON public.jamaah_konfig
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
         p.role = 'admin_ppg'::text
      OR (p.role = 'admin_desa'::text AND p.scope_desa_id =
            (SELECT k.desa_id FROM public.kelompok k WHERE k.id = jamaah_konfig.kelompok_id))
      OR (p.role = 'admin_kelompok'::text AND p.scope_kelompok_id = jamaah_konfig.kelompok_id)
      OR (p.role = 'penerobos'::text      AND p.scope_kelompok_id = jamaah_konfig.kelompok_id))));

CREATE POLICY "jamaah_konfig_insert" ON public.jamaah_konfig
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
         p.role = 'admin_ppg'::text
      OR (p.role = 'admin_desa'::text AND p.scope_desa_id =
            (SELECT k.desa_id FROM public.kelompok k WHERE k.id = jamaah_konfig.kelompok_id))
      OR (p.role = 'admin_kelompok'::text AND p.scope_kelompok_id = jamaah_konfig.kelompok_id)
      OR (p.role = 'penerobos'::text      AND p.scope_kelompok_id = jamaah_konfig.kelompok_id))));

CREATE POLICY "jamaah_konfig_update" ON public.jamaah_konfig
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
         p.role = 'admin_ppg'::text
      OR (p.role = 'admin_desa'::text AND p.scope_desa_id =
            (SELECT k.desa_id FROM public.kelompok k WHERE k.id = jamaah_konfig.kelompok_id))
      OR (p.role = 'admin_kelompok'::text AND p.scope_kelompok_id = jamaah_konfig.kelompok_id)
      OR (p.role = 'penerobos'::text      AND p.scope_kelompok_id = jamaah_konfig.kelompok_id))));

COMMENT ON TABLE public.jamaah_konfig IS
  'Pengaturan per-kelompok fitur Penerobos Kelp. sub_kelp_wajib: form Data Jamaah wajib memilih Sub Kelp. 1 baris per kelompok (upsert dari layar Kelola Sub Kelp).';

COMMIT;
