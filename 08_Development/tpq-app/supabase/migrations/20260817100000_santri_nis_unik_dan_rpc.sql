-- =====================================================================
-- 20260817100000_santri_nis_unik_dan_rpc.sql
--
-- Menutup celah pembuatan NIS santri saat CRUD santri dipindahkan ke
-- Next.js/PostgREST.
--
-- Di app lama, NIS dihitung `max(nis)+1` PPG-wide lalu ditulis, seluruhnya
-- di dalam `withScriptLock_()` (Modul_MaintainSantri.gs:32-50 dan :86-172)
-- sehingga dua admin yang menyimpan bersamaan tidak pernah dapat NIS sama.
-- Di PostgREST TIDAK ADA lock global setara, dan tiap request = transaksi
-- sendiri. Artinya pola "panggil RPC ambil NIS, lalu INSERT terpisah"
-- TETAP balapan: lock apa pun di dalam RPC sudah dilepas sebelum INSERT
-- menyusul. Karena itu pembuatan NIS dan INSERT-nya WAJIB berada di dalam
-- SATU transaksi — itulah alasan `tambah_santri()` di bawah melakukan
-- keduanya sekaligus, bukan sekadar mengembalikan nomor.
--
-- Isi:
--   1. UNIQUE INDEX pada santri.nis (jaring pengaman terakhir)
--   2. next_nis_santri()  -- SECURITY DEFINER, advisory lock + scan PPG-wide
--   3. tambah_santri()    -- SECURITY INVOKER, RLS tetap berlaku, insert atomik
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. UNIQUE INDEX santri.nis
-- ---------------------------------------------------------------------
-- SENGAJA BUKAN partial `WHERE deleted_at IS NULL`: NIS adalah nomor
-- identitas permanen, dan NIS milik santri yang sudah di-soft-delete tidak
-- boleh dipakai ulang oleh santri baru. Baris ber-nis NULL tetap boleh
-- banyak (Postgres memperlakukan NULL sebagai tidak-sama-dengan-apa pun),
-- jadi index ini tidak memaksa data lama yang kosong untuk diisi.
--
-- Diverifikasi sebelum dipasang: 199 baris santri produksi, 0 duplikat.
CREATE UNIQUE INDEX IF NOT EXISTS uq_santri_nis ON public.santri USING btree (nis);

-- ---------------------------------------------------------------------
-- 2. next_nis_santri() -- hitung NIS berikutnya, PPG-wide
-- ---------------------------------------------------------------------
-- SECURITY DEFINER DIPERLUKAN di sini, bukan kelalaian: scan `max(nis)`
-- harus melihat SELURUH santri se-PPG. Kalau fungsi ini invoker, RLS
-- `santri_select_scoped` membuat admin_kelompok hanya melihat kelompoknya
-- sendiri, sehingga dua kelompok berbeda bisa menghasilkan NIS yang sama
-- persis. Fungsi ini HANYA membaca dan mengembalikan satu string — tidak
-- menulis apa pun dan tidak membocorkan baris santri ke pemanggil.
--
-- `pg_advisory_xact_lock` dipegang sampai AKHIR TRANSAKSI PEMANGGIL, bukan
-- akhir fungsi ini. Itu yang membuat `tambah_santri()` di bawah aman:
-- lock masih dipegang saat INSERT-nya berjalan.
--
-- Format YY#### mengikuti serverGetGenerusNis app lama; baris ber-NIS
-- format lain (mis. seed lama 'NIS-0071') tidak cocok regex dan otomatis
-- diabaikan, persis seperti perilaku GAS.
CREATE OR REPLACE FUNCTION public.next_nis_santri()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prefix text;
  v_max    int;
begin
  -- Serialisasikan semua pembuat NIS. Kunci dilepas otomatis saat transaksi
  -- pemanggil selesai (commit/rollback) -- tidak ada risiko lock tertinggal.
  perform pg_advisory_xact_lock(hashtext('nis_santri'));

  v_prefix := to_char((now() at time zone 'Asia/Jakarta'), 'YY');

  select coalesce(max(substring(nis from 3 for 4)::int), 0)
    into v_max
    from santri
   where nis ~ ('^' || v_prefix || '[0-9]{4}$');

  if v_max >= 9999 then
    raise exception 'Kuota NIS tahun % sudah habis (9999 santri)', v_prefix;
  end if;

  return v_prefix || lpad((v_max + 1)::text, 4, '0');
end;
$function$;

COMMENT ON FUNCTION public.next_nis_santri() IS
  'NIS berikutnya format YY####, PPG-wide. SECURITY DEFINER supaya scan max tidak terpotong RLS. Memegang advisory lock sampai transaksi pemanggil selesai -- panggil HANYA dari dalam transaksi yang sekalian menulis santri.';

-- ---------------------------------------------------------------------
-- 3. tambah_santri() -- generate NIS + INSERT dalam satu transaksi
-- ---------------------------------------------------------------------
-- SECURITY INVOKER (default, SENGAJA tidak DEFINER): INSERT di dalamnya
-- tetap tunduk pada policy `santri_insert_admin`, jadi guru tetap tidak
-- bisa menambah santri lewat jalur ini.
--
-- Payload jsonb dengan field di-whitelist satu per satu -- klien tidak bisa
-- menyelundupkan kolom yang tidak dimaksudkan (mis. id, deleted_at,
-- kelas_id yang penetapannya ditunda ke task terpisah).
--
-- Pengecekan scope kelompok DIPERLUKAN di sini karena policy
-- `santri_insert_admin` yang ada di produksi hanya memeriksa ROLE, TIDAK
-- memeriksa apakah kelompok_id tujuan berada dalam scope pengguna (berbeda
-- dari `santri_update_admin` yang sudah benar). Selama policy itu belum
-- diperketat, penjagaan scope di sini adalah satu-satunya yang menahan
-- admin_kelompok menulis ke kelompok lain lewat jalur RPC ini.
CREATE OR REPLACE FUNCTION public.tambah_santri(p jsonb)
 RETURNS public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_kelompok_id bigint := (p->>'kelompok_id')::bigint;
  v_row         public.santri;
  v_boleh       boolean;
begin
  if v_kelompok_id is null then
    raise exception 'kelompok_id wajib diisi';
  end if;
  if nullif(btrim(coalesce(p->>'nama','')), '') is null then
    raise exception 'nama wajib diisi';
  end if;
  if p->>'gender' is null then
    raise exception 'gender wajib diisi';
  end if;
  if p->>'jenjang_saat_ini' is null then
    raise exception 'jenjang wajib diisi';
  end if;
  -- tanggal_lahir WAJIB mengikuti app lama, walau kolomnya nullable.
  if nullif(btrim(coalesce(p->>'tanggal_lahir','')), '') is null then
    raise exception 'tanggal lahir wajib diisi';
  end if;

  -- Scope: admin_ppg bebas; admin_desa dibatasi desanya; admin_kelompok
  -- dibatasi kelompoknya. Guru tidak pernah lolos (dan tetap ditahan RLS).
  select exists (
    select 1
      from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
     where pr.is_active
       and ( pr.role = 'admin_ppg'
          or (pr.role = 'admin_desa'
              and pr.scope_desa_id = (select k.desa_id from kelompok k where k.id = v_kelompok_id))
          or (pr.role = 'admin_kelompok'
              and pr.scope_kelompok_id = v_kelompok_id) )
  ) into v_boleh;

  if not v_boleh then
    raise exception 'Anda tidak memiliki akses ke Kelompok ini.';
  end if;

  insert into santri (
    kelompok_id, nama, nis, gender, tanggal_lahir, jenjang_saat_ini,
    nama_panggilan, tempat_lahir, pendidikan, kelas_sekolah, kelas_ngaji,
    alamat, nama_ayah, nama_ibu, rt, rw, kelurahan, kode_pos,
    kabupaten_kota, provinsi, kecamatan,
    nomor_wa, nomor_wa_ayah, nomor_wa_ibu, status_nikah, mulai_ngaji
  ) values (
    v_kelompok_id,
    btrim(p->>'nama'),
    next_nis_santri(),
    (p->>'gender')::gender_type,
    (p->>'tanggal_lahir')::date,
    (p->>'jenjang_saat_ini')::santri_jenjang,
    nullif(btrim(coalesce(p->>'nama_panggilan','')), ''),
    nullif(btrim(coalesce(p->>'tempat_lahir','')), ''),
    nullif(btrim(coalesce(p->>'pendidikan','')), ''),
    nullif(btrim(coalesce(p->>'kelas_sekolah','')), ''),
    nullif(btrim(coalesce(p->>'kelas_ngaji','')), ''),
    nullif(btrim(coalesce(p->>'alamat','')), ''),
    nullif(btrim(coalesce(p->>'nama_ayah','')), ''),
    nullif(btrim(coalesce(p->>'nama_ibu','')), ''),
    nullif(btrim(coalesce(p->>'rt','')), ''),
    nullif(btrim(coalesce(p->>'rw','')), ''),
    nullif(btrim(coalesce(p->>'kelurahan','')), ''),
    nullif(btrim(coalesce(p->>'kode_pos','')), ''),
    nullif(btrim(coalesce(p->>'kabupaten_kota','')), ''),
    nullif(btrim(coalesce(p->>'provinsi','')), ''),
    nullif(btrim(coalesce(p->>'kecamatan','')), ''),
    nullif(btrim(coalesce(p->>'nomor_wa','')), ''),
    nullif(btrim(coalesce(p->>'nomor_wa_ayah','')), ''),
    nullif(btrim(coalesce(p->>'nomor_wa_ibu','')), ''),
    nullif(btrim(coalesce(p->>'status_nikah','')), ''),
    nullif(btrim(coalesce(p->>'mulai_ngaji','')), '')::date
  )
  returning * into v_row;

  return v_row;
end;
$function$;

COMMENT ON FUNCTION public.tambah_santri(jsonb) IS
  'Tambah santri + generate NIS dalam SATU transaksi. SECURITY INVOKER supaya policy santri_insert_admin tetap berlaku. kelas_id sengaja tidak diterima -- penetapan kelas ditangani task terpisah.';

GRANT EXECUTE ON FUNCTION public.tambah_santri(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_nis_santri() TO authenticated;

COMMIT;
