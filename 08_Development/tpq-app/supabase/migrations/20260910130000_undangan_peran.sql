-- =====================================================================
-- 20260910130000_undangan_peran.sql
--
-- "Registrasi" (kartu Undang Admin Kelp di /pengaturan) kini bisa
-- MENENTUKAN PERAN orang yang didaftarkan -- bukan cuma "Admin Kelp".
-- Diminta owner: admin_ppg pra-registrasi "nama + kelompok + peran"
-- (mis. Agus dari Kelp Petemon sebagai Penerobos Kelp) sebagai
-- OTENTIKASI -- akunnya nanti mengklaim persis peran itu, tidak perlu
-- approval lagi. Sederhana tapi mengunci proses registrasi.
--
-- admin_kelp_undangan + kolom `peran` (default 'admin_kelompok' -> baris
-- lama tidak berubah). Peran diizinkan = kelompok-scoped non-guru:
-- admin_kelompok / ketua_mudai / penerobos. ('guru' PUNYA jalur sendiri
-- lewat RegistrasiGuru -> tabel guru; lewat undangan tidak akan mengisi
-- profiles.guru_id, jadi sengaja tidak diizinkan.)
--
-- KEAMANAN: hanya admin_ppg boleh memilih peran selain 'admin_kelompok'
-- (ditegakkan di WITH CHECK policy). admin_desa tetap seperti dulu
-- (hanya bisa mendaftarkan Admin Kelp di desanya).
--
-- Enum 'penerobos' & 'ketua_mudai' HARUS sudah ada (migrasi 20260909150000
-- & 20260909180000).
--
-- Idempoten. cari_admin_kelp_untuk_klaim() DROP dulu (RETURNS berubah).
-- Badan klaim_admin_kelp() disalin dari produksi + 1 perubahan (peran).
-- =====================================================================

BEGIN;

-- 1. Kolom peran -------------------------------------------------------
ALTER TABLE public.admin_kelp_undangan
  ADD COLUMN IF NOT EXISTS peran public.app_role NOT NULL DEFAULT 'admin_kelompok';

ALTER TABLE public.admin_kelp_undangan DROP CONSTRAINT IF EXISTS chk_undangan_peran;
ALTER TABLE public.admin_kelp_undangan ADD CONSTRAINT chk_undangan_peran
  CHECK (peran = ANY (ARRAY['admin_kelompok'::app_role, 'ketua_mudai'::app_role, 'penerobos'::app_role]));

-- 2. Write policy: admin_desa dikunci ke peran 'admin_kelompok' --------
DROP POLICY IF EXISTS "admin_kelp_undangan_tulis_ppg_desa" ON public.admin_kelp_undangan;
CREATE POLICY "admin_kelp_undangan_tulis_ppg_desa" ON public.admin_kelp_undangan
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
         p.role = 'admin_ppg'::text
      OR (p.role = 'admin_desa'::text
          AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = admin_kelp_undangan.kelompok_id)))))
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
         p.role = 'admin_ppg'::text
      OR (p.role = 'admin_desa'::text
          AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = admin_kelp_undangan.kelompok_id)
          AND admin_kelp_undangan.peran = 'admin_kelompok'::app_role))));

-- 3. cari_admin_kelp_untuk_klaim: kembalikan `peran` juga --------------
DROP FUNCTION IF EXISTS public.cari_admin_kelp_untuk_klaim(text, text);
CREATE FUNCTION public.cari_admin_kelp_untuk_klaim(p_nama text, p_kelompok text)
 RETURNS TABLE(undangan_id bigint, nama_lengkap text, kelompok_id bigint,
               kelompok_nama text, desa_nama text, peran public.app_role)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, u.nama_lengkap, u.kelompok_id, k.nama, d.nama, u.peran
  FROM admin_kelp_undangan u
  JOIN kelompok k ON k.id = u.kelompok_id
  JOIN desa d ON d.id = k.desa_id
  WHERE u.profile_id IS NULL
    AND normalisasi_nama_(u.nama_lengkap) = normalisasi_nama_(p_nama)
    AND normalisasi_kelompok_(k.nama) = normalisasi_kelompok_(p_kelompok)
    AND normalisasi_nama_(p_nama) <> ''
    AND normalisasi_kelompok_(p_kelompok) <> ''
  ORDER BY u.id;
$function$;
REVOKE ALL ON FUNCTION public.cari_admin_kelp_untuk_klaim(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cari_admin_kelp_untuk_klaim(text, text) TO authenticated;

-- 4. klaim_admin_kelp: pakai peran undangan, bukan hardcode ------------
CREATE OR REPLACE FUNCTION public.klaim_admin_kelp(p_undangan_id bigint, p_nama text, p_kelompok text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_undangan record;
  v_profil   record;
begin
  if auth.uid() is null then
    raise exception 'Sesi tidak valid';
  end if;

  select role into v_profil from profiles where id = auth.uid();
  if not found then
    raise exception 'Profil akun tidak ditemukan';
  end if;
  if v_profil.role is not null then
    raise exception 'Akun ini sudah punya peran (%). Klaim hanya berlaku utk akun baru.', v_profil.role;
  end if;

  select u.id, u.kelompok_id, u.peran into v_undangan
  from admin_kelp_undangan u
  join kelompok k on k.id = u.kelompok_id
  where u.id = p_undangan_id
    and u.profile_id is null
    and normalisasi_nama_(u.nama_lengkap) = normalisasi_nama_(p_nama)
    and normalisasi_kelompok_(k.nama) = normalisasi_kelompok_(p_kelompok)
  for update of u;

  if not found then
    raise exception 'Undangan tidak ditemukan, sudah diklaim, atau nama/kelompok tidak cocok';
  end if;

  update profiles set
    role              = v_undangan.peran,
    display_name      = coalesce(display_name, btrim(p_nama)),
    scope_ppg_id      = null,
    scope_desa_id     = null,
    scope_kelompok_id = v_undangan.kelompok_id,
    is_active         = true,
    updated_at        = now()
  where id = auth.uid()
  returning * into v_profil;

  update admin_kelp_undangan set profile_id = auth.uid(), claimed_at = now() where id = v_undangan.id;

  return v_profil;
end;
$function$;

COMMENT ON COLUMN public.admin_kelp_undangan.peran IS
  'Peran yang akan diberikan saat undangan diklaim. Default admin_kelompok. Hanya admin_ppg boleh memilih ketua_mudai/penerobos (WITH CHECK policy).';

COMMIT;
