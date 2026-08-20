-- =====================================================================
-- 20260820110000_klaim_akun_guru.sql
--
-- Jalur pendaftaran cepat khusus guru (diminta owner 20 Agt): alih-alih
-- mengisi kelompok manual lalu menunggu admin menyetujui lewat
-- setujui_pendaftaran() (20260819090000), guru cukup mengetik NAMA
-- LENGKAP -- dicocokkan ke data guru yang sudah ada di tabel `guru`
-- (hasil migrasi dari Sheets/GAS), lalu akun langsung terhubung dan aktif.
-- Tidak ada verifikasi email/admin di jalur ini sama sekali.
--
-- Kenapa aman TANPA admin di tengah: pencocokan nama BUKAN cara guru
-- "memilih siapa dirinya" secara bebas -- cocok = identitas & scope
-- (kelompok_id) berasal dari baris `guru` yang sudah ada, guru tidak bisa
-- menentukan kelompoknya sendiri. Dua penjaga inti:
--   1. Guru yang SUDAH terhubung ke profil lain (guru_id sudah dipakai)
--      tidak bisa diklaim ulang -- klaim_akun_guru() menolaknya.
--   2. Nama diverifikasi ULANG di dalam klaim_akun_guru() (bukan cuma
--      percaya guru_id dari klien) -- membela dari client yang dimodifikasi
--      utk mengirim guru_id sembarang dgn nama kosong/beda.
-- Nama sama persis milik 2 guru beda kelompok (kasus nyata, mis. dua orang
-- bernama sama di kelompok berbeda) diserahkan ke pemohon utk memilih --
-- cari_guru_untuk_klaim() mengembalikan SEMUA yang cocok berikut konteks
-- kelompok/desa supaya bisa dibedakan, bukan menebak salah satu.
--
-- Cocok nama case-insensitive + spasi-ganda dirapikan (owner: "besar
-- kecil tidak masalah") tapi TETAP exact match ternormalisasi, bukan
-- substring -- exact match mencegah pencarian jadi cara mengintip daftar
-- nama guru lain lewat wildcard.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalisasi_nama_(p_nama text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT lower(regexp_replace(btrim(coalesce(p_nama, '')), '\s+', ' ', 'g'));
$function$;

-- ---------------------------------------------------------------------
-- cari_guru_untuk_klaim: cari kandidat guru yang cocok & belum terhubung
-- ke profil mana pun. Read-only, tapi SECURITY DEFINER supaya tidak perlu
-- membuka SELECT langsung ke tabel guru utk peran yang belum py peran
-- (RLS guru saat ini mensyaratkan profil aktif berperan).
-- ---------------------------------------------------------------------
-- DROP dulu: signature RETURNS TABLE berubah (kategori ditambahkan) sesudah
-- versi pertama sempat diterapkan -- Postgres menolak CREATE OR REPLACE
-- kalau bentuk kolom hasil berbeda.
DROP FUNCTION IF EXISTS public.cari_guru_untuk_klaim(text);

CREATE OR REPLACE FUNCTION public.cari_guru_untuk_klaim(p_nama text)
 RETURNS TABLE (
   guru_id bigint, nama text, kategori text,
   kelompok_id bigint, kelompok_nama text, desa_nama text
 )
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- kategori ikut dikembalikan sbg pembeda tambahan -- kelompok saja
  -- terbukti tidak selalu cukup (kasus nyata: 2 "Pak Nizam" di kelompok
  -- yang SAMA, kategori "Guru Bantu" vs "Guru Mutu").
  SELECT g.id, g.nama, g.kategori, g.kelompok_id, k.nama, d.nama
  FROM guru g
  JOIN kelompok k ON k.id = g.kelompok_id
  JOIN desa d ON d.id = k.desa_id
  WHERE g.deleted_at IS NULL
    AND normalisasi_nama_(g.nama) = normalisasi_nama_(p_nama)
    AND normalisasi_nama_(p_nama) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.guru_id = g.id AND pr.deleted_at IS NULL
    )
  ORDER BY k.nama, g.id;
$function$;

REVOKE EXECUTE ON FUNCTION public.cari_guru_untuk_klaim(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cari_guru_untuk_klaim(text) TO authenticated;

-- ---------------------------------------------------------------------
-- klaim_akun_guru: hubungkan akun pemanggil ke satu baris guru, LANGSUNG
-- aktif (role='guru', is_active=true) -- tanpa pendaftaran_akun, tanpa
-- persetujuan admin.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.klaim_akun_guru(p_guru_id bigint, p_nama text)
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

  -- Nama diverifikasi ulang di sini (bukan percaya guru_id dari klien
  -- begitu saja) -- lihat catatan keamanan di kepala berkas.
  select id, kelompok_id, nama into v_guru
  from guru
  where id = p_guru_id
    and deleted_at is null
    and normalisasi_nama_(nama) = normalisasi_nama_(p_nama)
  for update;

  if not found then
    raise exception 'Data guru tidak ditemukan atau nama tidak cocok';
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

REVOKE EXECUTE ON FUNCTION public.klaim_akun_guru(bigint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.klaim_akun_guru(bigint, text) TO authenticated;

COMMIT;
