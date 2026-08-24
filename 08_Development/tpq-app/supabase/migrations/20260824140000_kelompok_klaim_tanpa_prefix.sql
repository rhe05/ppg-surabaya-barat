-- =====================================================================
-- 20260824140000_kelompok_klaim_tanpa_prefix.sql
--
-- Owner: saat mengetik nama kelompok utk klaim akun (guru & admin kelp),
-- tidak perlu mengulang kata "Kelp" -- kelompok bernama resmi "Kelp
-- Bungurasih" di database, tapi orangnya cukup ketik "Bungurasih".
--
-- normalisasi_kelompok_() = normalisasi_nama_() (lowercase + rapikan
-- spasi, sudah ada sejak migrasi guru) DITAMBAH buang kata "kelp" di
-- depan kalau ada -- dipakai utk MEMBANDINGKAN kelompok.nama vs input
-- pengguna, di KEDUA sisi (baik nama kelompok asli di DB maupun yang
-- diketik) supaya "Bungurasih" dan "Kelp Bungurasih" dianggap sama,
-- tanpa mengubah nama kelompok yang tersimpan.
--
-- Menimpa 4 fungsi yang sudah ada, SIGNATURE TIDAK BERUBAH (cuma
-- klausa pembanding kelompoknya) -- CREATE OR REPLACE polos, tanpa
-- perlu DROP+GRANT ulang.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalisasi_kelompok_(p_nama text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(normalisasi_nama_(p_nama), '^kelp\s+', '');
$function$;

CREATE OR REPLACE FUNCTION public.cari_guru_untuk_klaim(p_nama text, p_kelompok text)
 RETURNS TABLE (
   guru_id bigint, nama text, kategori text,
   kelompok_id bigint, kelompok_nama text, desa_nama text
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT g.id, g.nama, g.kategori, g.kelompok_id, k.nama, d.nama
  FROM guru g
  JOIN kelompok k ON k.id = g.kelompok_id
  JOIN desa d ON d.id = k.desa_id
  WHERE g.deleted_at IS NULL
    AND normalisasi_nama_(g.nama) = normalisasi_nama_(p_nama)
    AND normalisasi_kelompok_(k.nama) = normalisasi_kelompok_(p_kelompok)
    AND normalisasi_nama_(p_nama) <> ''
    AND normalisasi_kelompok_(p_kelompok) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.guru_id = g.id AND pr.deleted_at IS NULL
    )
  ORDER BY g.id;
$function$;

CREATE OR REPLACE FUNCTION public.klaim_akun_guru(p_guru_id bigint, p_nama text, p_kelompok text)
 RETURNS public.profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_guru    record;
  v_profil  record;
begin
  if auth.uid() is null then
    raise exception 'Sesi tidak valid';
  end if;

  select role into v_profil from profiles where id = auth.uid();
  if not found then
    raise exception 'Profil akun tidak ditemukan';
  end if;
  if v_profil.role is not null then
    raise exception 'Akun ini sudah punya peran (%). Klaim guru hanya berlaku utk akun baru.', v_profil.role;
  end if;

  select g.id, g.kelompok_id, g.nama into v_guru
  from guru g
  join kelompok k on k.id = g.kelompok_id
  where g.id = p_guru_id
    and g.deleted_at is null
    and normalisasi_nama_(g.nama) = normalisasi_nama_(p_nama)
    and normalisasi_kelompok_(k.nama) = normalisasi_kelompok_(p_kelompok)
  for update of g;

  if not found then
    raise exception 'Data guru tidak ditemukan atau nama/kelompok tidak cocok';
  end if;

  if exists (select 1 from profiles where guru_id = v_guru.id and deleted_at is null) then
    raise exception 'Data guru ini sudah terhubung ke akun lain. Hubungi admin kelompok.';
  end if;

  update profiles set
    role              = 'guru',
    display_name      = coalesce(display_name, btrim(p_nama)),
    guru_id           = v_guru.id,
    scope_ppg_id      = null,
    scope_desa_id     = null,
    scope_kelompok_id = v_guru.kelompok_id,
    is_active         = true,
    updated_at        = now()
  where id = auth.uid()
  returning * into v_profil;

  return v_profil;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cari_admin_kelp_untuk_klaim(p_nama text, p_kelompok text)
 RETURNS TABLE (
   undangan_id bigint, nama_lengkap text,
   kelompok_id bigint, kelompok_nama text, desa_nama text
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, u.nama_lengkap, u.kelompok_id, k.nama, d.nama
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

CREATE OR REPLACE FUNCTION public.klaim_admin_kelp(p_undangan_id bigint, p_nama text, p_kelompok text)
 RETURNS public.profiles
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
    raise exception 'Akun ini sudah punya peran (%). Klaim admin kelp hanya berlaku utk akun baru.', v_profil.role;
  end if;

  select u.id, u.kelompok_id into v_undangan
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
    role              = 'admin_kelompok',
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

COMMIT;
