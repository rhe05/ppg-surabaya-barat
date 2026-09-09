-- =====================================================================
-- 20260909190000_pendaftaran_koordinator.sql
--
-- Buka registrasi mandiri (/onboarding) untuk 2 peran koordinator
-- se-kelompok: 'penerobos' (Penerobos Kelp) & 'ketua_mudai' (Ketua
-- Muda-i). Keduanya SUDAH ada di enum app_role (migrasi 20260909150000
-- & 20260909180000 — WAJIB dijalankan lebih dulu).
--
-- 3 perubahan:
--   1. chk_pendaftaran_scope  — izinkan kedua peran (butuh kelompok_id).
--   2. pendaftaran_read_scoped — admin desa/kelp bisa melihat pendaftaran
--      kedua peran itu di scope-nya (biar muncul di layar persetujuan).
--   3. setujui_pendaftaran()  — admin desa (se-desa) & admin kelp
--      (se-kelompok) boleh menyetujui kedua peran itu, selain admin_ppg.
--
-- Badan setujui_pendaftaran() disalin UTUH dari produksi 2026-09-09,
-- hanya 2 baris cabang otorisasi yang diperluas.
--
-- Idempoten: DROP ... IF EXISTS sebelum CREATE.
-- =====================================================================

BEGIN;

-- 1. CHECK scope ---------------------------------------------------------
ALTER TABLE public.pendaftaran_akun DROP CONSTRAINT IF EXISTS chk_pendaftaran_scope;
ALTER TABLE public.pendaftaran_akun ADD CONSTRAINT chk_pendaftaran_scope CHECK (
  (peran_diminta = 'admin_ppg'::app_role  AND ppg_id IS NOT NULL AND desa_id IS NULL AND kelompok_id IS NULL)
  OR (peran_diminta = 'admin_desa'::app_role AND desa_id IS NOT NULL AND ppg_id IS NULL AND kelompok_id IS NULL)
  OR (peran_diminta = ANY (ARRAY[
        'admin_kelompok'::app_role, 'guru'::app_role,
        'penerobos'::app_role, 'ketua_mudai'::app_role])
      AND kelompok_id IS NOT NULL AND ppg_id IS NULL AND desa_id IS NULL)
);

-- 2. READ policy --------------------------------------------------------
DROP POLICY IF EXISTS "pendaftaran_read_scoped" ON public.pendaftaran_akun;
CREATE POLICY "pendaftaran_read_scoped" ON public.pendaftaran_akun
  AS PERMISSIVE FOR SELECT TO public
  USING (
    (id = auth.uid())
    OR (EXISTS ( SELECT 1
      FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
      WHERE (p.is_active AND (
        (p.role = 'admin_ppg'::text)
        OR ((p.role = 'admin_desa'::text)
            AND (pendaftaran_akun.peran_diminta = ANY (ARRAY[
                  'guru'::app_role, 'admin_kelompok'::app_role,
                  'penerobos'::app_role, 'ketua_mudai'::app_role]))
            AND (p.scope_desa_id = COALESCE(pendaftaran_akun.desa_id,
                  ( SELECT k.desa_id FROM kelompok k WHERE (k.id = pendaftaran_akun.kelompok_id)))))
        OR ((p.role = 'admin_kelompok'::text)
            AND (pendaftaran_akun.peran_diminta = ANY (ARRAY[
                  'guru'::app_role, 'penerobos'::app_role, 'ketua_mudai'::app_role]))
            AND (p.scope_kelompok_id = pendaftaran_akun.kelompok_id))
      ))))
  );

-- 3. setujui_pendaftaran() -------------------------------------------------
CREATE OR REPLACE FUNCTION public.setujui_pendaftaran(p_id uuid, p_guru_id bigint DEFAULT NULL::bigint)
 RETURNS pendaftaran_akun
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p           pendaftaran_akun;
  v_penyetuju   record;
  v_desa_target bigint;
begin
  select * into v_p from pendaftaran_akun where id = p_id for update;
  if not found then
    raise exception 'Pendaftaran tidak ditemukan';
  end if;
  if v_p.status = 'disetujui' then
    raise exception 'Pendaftaran ini sudah disetujui sebelumnya';
  end if;

  select * into v_penyetuju from auth_profile();
  if v_penyetuju.role is null or not v_penyetuju.is_active then
    raise exception 'Anda tidak berwenang menyetujui pendaftaran';
  end if;

  v_desa_target := coalesce(v_p.desa_id, (select k.desa_id from kelompok k where k.id = v_p.kelompok_id));

  if v_penyetuju.role = 'admin_ppg' then
    null; -- boleh semua peran
  elsif v_penyetuju.role = 'admin_desa'
        and v_p.peran_diminta in ('guru', 'admin_kelompok', 'penerobos', 'ketua_mudai')
        and v_penyetuju.scope_desa_id = v_desa_target then
    null;
  elsif v_penyetuju.role = 'admin_kelompok'
        and v_p.peran_diminta in ('guru', 'penerobos', 'ketua_mudai')
        and v_penyetuju.scope_kelompok_id = v_p.kelompok_id then
    null;
  else
    raise exception 'Anda tidak berwenang menyetujui permintaan peran % pada scope tersebut', v_p.peran_diminta;
  end if;

  update profiles set
    role              = v_p.peran_diminta,
    display_name      = coalesce(display_name, btrim(v_p.nama_lengkap)),
    guru_id           = coalesce(p_guru_id, guru_id),
    scope_ppg_id      = v_p.ppg_id,
    scope_desa_id     = v_p.desa_id,
    scope_kelompok_id = v_p.kelompok_id,
    is_active         = true,
    updated_at        = now()
  where id = p_id;

  perform set_config('app.peninjauan_pendaftaran', '1', true);
  update pendaftaran_akun set
    status        = 'disetujui',
    alasan_tolak  = null,
    ditinjau_oleh = auth.uid(),
    ditinjau_pada = now()
  where id = p_id
  returning * into v_p;
  perform set_config('app.peninjauan_pendaftaran', '0', true);

  return v_p;
end;
$function$;

COMMIT;
