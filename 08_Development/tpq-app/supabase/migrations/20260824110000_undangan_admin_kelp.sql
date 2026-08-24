-- =====================================================================
-- 20260824110000_undangan_admin_kelp.sql
--
-- Jalur pendaftaran cepat khusus admin_kelompok (diminta owner
-- 2026-08-24), meniru PERSIS pola klaim cepat guru (20260820110000,
-- cari_guru_untuk_klaim/klaim_akun_guru): admin_ppg atau admin_desa
-- mengundang lebih dulu (nama lengkap + kelompok) lewat kartu baru di
-- /pengaturan, lalu orang yang diundang cukup MENGETIK nama kelompok +
-- nama lengkapnya di /onboarding -- langsung aktif, tanpa antrean
-- setujui_pendaftaran().
--
-- BEDA dari klaim guru (yang cocok NAMA saja lalu menyaring kandidat lwt
-- kelompok/kategori kalau ada beberapa cocok): klaim admin_kelp
-- mencocokkan NAMA + KELOMPOK SEKALIGUS sbg dua kunci wajib (diminta
-- owner eksplisit: "ketik nama kelp dan nama lengkapnya"). Peran admin
-- py privilese lebih tinggi drpd guru, jadi kelompok bukan cuma
-- penyaring kandidat tapi bagian dari verifikasinya sendiri -- orang yg
-- mengklaim harus memang tahu kelompok mana yg dimaksud (disepakati di
-- luar aplikasi dgn admin yang mengundang), bukan cuma menebak nama.
--
-- Siapa yang boleh MENGUNDANG (INSERT/UPDATE/DELETE admin_kelp_undangan)
-- SENGAJA dibatasi admin_ppg & admin_desa (scope desa) SAJA -- diminta
-- owner eksplisit ("yang bisa daftarkan ada dua: admin aplikasi dan
-- admin desa"), admin_kelompok TIDAK BOLEH mengundang admin_kelompok
-- lain -- persis batas wewenang setujui_pendaftaran() utk peran
-- admin_kelompok (20260819090000), jadi jalur cepat ini TIDAK membuka
-- privilese baru yang sebelumnya tidak ada di jalur lambat.
--
-- normalisasi_nama_() dipakai APA ADANYA (sudah ada sejak migrasi guru),
-- tidak didefinisikan ulang di sini.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_kelp_undangan (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama_lengkap text NOT NULL,
  kelompok_id  bigint NOT NULL REFERENCES public.kelompok (id),
  profile_id   uuid REFERENCES public.profiles (id),
  dibuat_oleh  uuid REFERENCES public.profiles (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz
);
COMMENT ON TABLE public.admin_kelp_undangan IS
  'Whitelist nama+kelompok utk klaim cepat peran admin_kelompok (analog tabel guru utk klaim guru) -- lihat klaim_admin_kelp().';

-- Satu undangan yang BELUM diklaim tidak boleh dobel utk kelompok+nama
-- yang sama (mencegah admin tidak sengaja mengundang 2x).
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_kelp_undangan_belum_klaim
  ON public.admin_kelp_undangan (kelompok_id, normalisasi_nama_(nama_lengkap))
  WHERE profile_id IS NULL;

ALTER TABLE public.admin_kelp_undangan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_kelp_undangan_select_scoped" ON public.admin_kelp_undangan;
CREATE POLICY "admin_kelp_undangan_select_scoped" ON public.admin_kelp_undangan
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = admin_kelp_undangan.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = admin_kelp_undangan.kelompok_id))));

DROP POLICY IF EXISTS "admin_kelp_undangan_tulis_ppg_desa" ON public.admin_kelp_undangan;
CREATE POLICY "admin_kelp_undangan_tulis_ppg_desa" ON public.admin_kelp_undangan
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = admin_kelp_undangan.kelompok_id)))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = admin_kelp_undangan.kelompok_id)))));

-- ---------------------------------------------------------------------
-- cari_admin_kelp_untuk_klaim: cocokkan NAMA + KELOMPOK sekaligus.
-- Read-only tapi SECURITY DEFINER supaya akun BELUM berperan (yang
-- sedang di /onboarding) tetap bisa memanggilnya tanpa perlu SELECT
-- langsung ke admin_kelp_undangan.
-- ---------------------------------------------------------------------
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
    AND normalisasi_nama_(k.nama) = normalisasi_nama_(p_kelompok)
    AND normalisasi_nama_(p_nama) <> ''
    AND normalisasi_nama_(p_kelompok) <> ''
  ORDER BY u.id;
$function$;

REVOKE EXECUTE ON FUNCTION public.cari_admin_kelp_untuk_klaim(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cari_admin_kelp_untuk_klaim(text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- klaim_admin_kelp: hubungkan akun pemanggil ke satu undangan, LANGSUNG
-- aktif (role='admin_kelompok', is_active=true) -- tanpa pendaftaran_akun,
-- tanpa persetujuan admin susulan.
-- ---------------------------------------------------------------------
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

  -- Nama & kelompok diverifikasi ULANG di sini (bukan percaya
  -- undangan_id dari klien begitu saja).
  select u.id, u.kelompok_id into v_undangan
  from admin_kelp_undangan u
  join kelompok k on k.id = u.kelompok_id
  where u.id = p_undangan_id
    and u.profile_id is null
    and normalisasi_nama_(u.nama_lengkap) = normalisasi_nama_(p_nama)
    and normalisasi_nama_(k.nama) = normalisasi_nama_(p_kelompok)
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

REVOKE EXECUTE ON FUNCTION public.klaim_admin_kelp(bigint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.klaim_admin_kelp(bigint, text, text) TO authenticated;

COMMIT;
