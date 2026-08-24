-- =====================================================================
-- 20260824130000_klaim_guru_dua_kunci.sql
--
-- Owner: samakan konfirmasi klaim guru dgn admin kelp -- dua kunci wajib
-- (NAMA + KELOMPOK, bukan nama saja) supaya "natural" (praktis selalu
-- tepat satu kandidat, checklist disambiguasi bisa disembunyikan) TAPI
-- tetap aman: matching nama-saja terbukti PERNAH tidak cukup di data
-- nyata -- cari_guru_untuk_klaim() versi lama sendiri py komentar
-- "kasus nyata: 2 'Pak Nizam' di kelompok yang SAMA, kategori 'Guru
-- Bantu' vs 'Guru Mutu'" -- artinya kelompok SAJA jg tidak selalu cukup
-- utk membedakan, jadi checklist disambiguasi TETAP dipertahankan di
-- frontend utk kasus >1 kandidat meski dua kunci ini sudah dicocokkan.
--
-- Signature KEDUA fungsi berubah (tambah p_kelompok) -- DROP dulu
-- (CREATE OR REPLACE menolak kalau daftar parameter berbeda), lalu
-- GRANT ulang (DROP FUNCTION menghapus GRANT lama).
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.cari_guru_untuk_klaim(text);

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
    AND normalisasi_nama_(k.nama) = normalisasi_nama_(p_kelompok)
    AND normalisasi_nama_(p_nama) <> ''
    AND normalisasi_nama_(p_kelompok) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.guru_id = g.id AND pr.deleted_at IS NULL
    )
  ORDER BY g.id;
$function$;

REVOKE EXECUTE ON FUNCTION public.cari_guru_untuk_klaim(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cari_guru_untuk_klaim(text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.klaim_akun_guru(bigint, text);

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

  -- Nama & kelompok diverifikasi ULANG di sini (bukan percaya guru_id
  -- dari klien begitu saja).
  select g.id, g.kelompok_id, g.nama into v_guru
  from guru g
  join kelompok k on k.id = g.kelompok_id
  where g.id = p_guru_id
    and g.deleted_at is null
    and normalisasi_nama_(g.nama) = normalisasi_nama_(p_nama)
    and normalisasi_nama_(k.nama) = normalisasi_nama_(p_kelompok)
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

REVOKE EXECUTE ON FUNCTION public.klaim_akun_guru(bigint, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.klaim_akun_guru(bigint, text, text) TO authenticated;

COMMIT;
