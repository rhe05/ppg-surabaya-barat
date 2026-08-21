-- =====================================================================
-- 20260821120000_santri_guru_tulis_kelas_sendiri.sql
--
-- Fitur "Data Generus" mobile guru: guru boleh menambah & mengubah data
-- santri, TAPI cuma untuk kelas yang dia ampu sendiri (kelas.guru_id =
-- guru_id-nya) -- bukan seluruh kelompok seperti hak baca
-- (santri_select_scoped, migrasi 20260813125217).
--
-- Sebelum migrasi ini guru TIDAK PERNAH lolos INSERT/UPDATE santri (lihat
-- komentar "Guru tidak pernah lolos" di tambah_santri(), migrasi
-- 20260817100000, dan santri_update_admin yang hanya mendaftar 3 peran
-- admin). Migrasi ini menambah jalur guru di kedua tempat itu, TANPA
-- mengubah perilaku admin sama sekali.
--
-- Isi:
--   1. tambah_santri() -- tambah cabang guru pada pengecekan scope
--   2. santri_update_guru -- policy UPDATE baru, khusus guru & kelasnya
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. tambah_santri() -- izinkan guru menambah ke kelas miliknya sendiri
-- ---------------------------------------------------------------------
-- Guru WAJIB mengirim kelas_ngaji yang cocok dengan salah satu kelas yang
-- dia ampu (kelas.guru_id = guru_id-nya) di kelompok yang sama dengan
-- scope-nya. Kelas kosong/tidak cocok = ditolak -- guru tidak bisa
-- menambah santri "tanpa kelas" lewat jalur ini (beda dari admin yang
-- boleh, krn field itu memang opsional utk admin app lama).
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
  -- dibatasi kelompoknya; guru dibatasi kelas yang dia ampu SENDIRI di
  -- kelompok itu (fitur Data Generus mobile).
  select exists (
    select 1
      from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
     where pr.is_active
       and ( pr.role = 'admin_ppg'
          or (pr.role = 'admin_desa'
              and pr.scope_desa_id = (select k.desa_id from kelompok k where k.id = v_kelompok_id))
          or (pr.role = 'admin_kelompok'
              and pr.scope_kelompok_id = v_kelompok_id)
          or (pr.role = 'guru'
              and pr.scope_kelompok_id = v_kelompok_id
              and exists (
                    select 1 from kelas k
                     where k.kelompok_id = v_kelompok_id
                       and k.guru_id = pr.guru_id
                       and k.deleted_at is null
                       and k.nama = nullif(btrim(coalesce(p->>'kelas_ngaji','')), '')
                  )) )
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
  'Tambah santri + generate NIS dalam SATU transaksi. SECURITY INVOKER supaya policy santri_insert_admin tetap berlaku. Guru boleh lewat sini HANYA ke kelas yang dia ampu sendiri (lihat migrasi 20260821120000). kelas_id sengaja tidak diterima -- diturunkan trigger sinkron_santri_kelas dari kelas_ngaji.';

-- ---------------------------------------------------------------------
-- 2. santri_update_guru -- guru boleh UPDATE santri di kelasnya sendiri
-- ---------------------------------------------------------------------
-- Dicocokkan ke kelas_id (bukan kelas_ngaji teks) karena kelas_id sudah
-- dijamin sinkron oleh trigger sinkron_santri_kelas (migrasi 20260819110000)
-- -- lebih tegas ketimbang mencocokkan teks nama kelas.
--
-- USING dipakai ganda sbg WITH CHECK (tidak ditulis eksplisit): baris hasil
-- update tetap harus lolos syarat yang sama, jadi guru tidak bisa
-- "memindahkan" santri ke kelas_id milik guru lain lewat form ini.
DROP POLICY IF EXISTS "santri_update_guru" ON public.santri;
CREATE POLICY "santri_update_guru" ON public.santri
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'guru'::text) AND EXISTS (
    SELECT 1 FROM kelas k
     WHERE k.id = santri.kelas_id
       AND k.guru_id = p.guru_id
       AND k.deleted_at IS NULL
  )))));

COMMIT;
