-- =====================================================================
-- 20260821180000_permintaan_generus_approval.sql
--
-- Alur persetujuan Admin Kelp utk 5 aksi guru di Data Generus (tambah,
-- pindah kelas, naik kelas, pindah domisili, non aktif): SEBELUM migrasi
-- ini, kelima aksi itu langsung mengubah data (migrasi 20260821120000,
-- 20260821130000, 20260821150000, 20260821160000, 20260821170000). Owner
-- minta itu jadi WAJIB menunggu persetujuan admin_kelompok kelompoknya
-- (atau admin_desa/admin_ppg di atasnya) dulu, dengan notifikasi 2 arah
-- (lonceng guru: "sudah diputuskan", lonceng admin: "ada yang menunggu").
--
-- DESAIN: guru TIDAK LAGI memanggil tambah_santri/pindah_kelas_santri/
-- naikkan_jenjang_santri/nonaktifkan_santri secara langsung -- 4 fungsi
-- itu diubah jadi ADMIN-ONLY (cabang guru dicabut/diganti cabang admin).
-- Guru memanggil ajukan_permintaan_generus() yang HANYA mencatat
-- permintaan (status pending), tidak mengubah santri/siklus_generus sama
-- sekali. Admin memanggil putuskan_permintaan_generus() yang -- kalau
-- disetujui -- memanggil ULANG salah satu dari 4 fungsi di atas (auth.uid()
-- di dalam panggilan bersarang TETAP menunjuk admin yang login, TIDAK
-- terpengaruh SECURITY DEFINER/INVOKER, krn auth.uid() berbasis klaim JWT
-- sesi, bukan role SQL -- jadi 4 fungsi itu tidak perlu ditulis ulang
-- logikanya, cukup cabang otorisasinya yang diganti dari guru ke admin).
--
-- Isi:
--   1. Enum permintaan_generus_jenis
--   2. Tabel permintaan_generus + RLS (SELECT scoped, UPDATE guru_dibaca)
--   3. tambah_santri() -- cabut cabang guru
--   4. pindah_kelas_santri() -- cabang guru -> admin (scope via kelas tujuan)
--   5. naikkan_jenjang_santri() -- cabang guru -> admin (+kelompok_id di payload)
--   6. nonaktifkan_santri() -- cabang guru -> admin (+kelompok_id di payload)
--   7. Cabut policy guru yang sudah tidak terpakai (santri_pindah_kelas_guru,
--      siklus_generus_insert_guru) -- santri_update_guru TETAP ADA (masih
--      dipakai jalur edit biasa/non-5-aksi-ini, tidak diminta owner utk
--      ikut lewat persetujuan)
--   8. ajukan_permintaan_generus() -- guru mengajukan
--   9. putuskan_permintaan_generus() -- admin memutuskan
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.permintaan_generus_jenis AS ENUM
    ('tambah', 'pindah_kelas', 'naik_kelas', 'pindah_domisili', 'non_aktif');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------
-- 2. Tabel permintaan_generus
-- ---------------------------------------------------------------------
-- `payload` menyimpan persis argumen `p` yang akan dikirim ke fungsi aksi
-- terkait saat disetujui (tambah_santri/pindah_kelas_santri/dst) --
-- disusun & divalidasi di ajukan_permintaan_generus(), bukan dipercaya
-- mentah dari klien.
-- `ringkasan` teks siap-tampil (dibangun sekali saat diajukan) supaya
-- layar bell/daftar tidak perlu JOIN balik ke santri/kelas tiap render.
-- `guru_dibaca` -- badge lonceng GURU menghitung baris SUDAH diputuskan
-- (approved/rejected) TAPI belum ditandai dibaca; lonceng ADMIN menghitung
-- baris berstatus 'pending' di kelompoknya (tidak butuh kolom "dibaca"
-- terpisah krn begitu diputuskan baris itu otomatis tidak lagi pending).
CREATE TABLE IF NOT EXISTS public.permintaan_generus (
  id                bigint generated always as identity primary key,
  kelompok_id       bigint not null references public.kelompok (id),
  guru_id           bigint not null references public.guru (id),
  jenis             public.permintaan_generus_jenis not null,
  payload           jsonb not null,
  ringkasan         text not null,
  status            public.akses_kelas_status not null default 'pending',
  catatan_admin     text,
  diajukan_pada     timestamptz not null default now(),
  diputuskan_pada   timestamptz,
  diputuskan_oleh   uuid references public.profiles (id),
  guru_dibaca       boolean not null default false
);
CREATE INDEX IF NOT EXISTS idx_permintaan_generus_guru
  ON public.permintaan_generus (guru_id, status);
CREATE INDEX IF NOT EXISTS idx_permintaan_generus_kelompok
  ON public.permintaan_generus (kelompok_id, status);

COMMENT ON TABLE public.permintaan_generus IS
  'Antrean persetujuan Admin Kelp utk 5 aksi guru di Data Generus. Ditulis HANYA lewat ajukan_permintaan_generus()/putuskan_permintaan_generus() (SECURITY DEFINER, bypass RLS dgn pengecekan eksplisit) -- tidak ada policy INSERT, guru/admin tidak bisa insert langsung lewat PostgREST.';

ALTER TABLE public.permintaan_generus ENABLE ROW LEVEL SECURITY;

-- SELECT: guru lihat pengajuannya sendiri; admin lihat sesuai scope
-- (pola sama persis santri_select_scoped, migrasi 20260813125217).
DROP POLICY IF EXISTS "permintaan_generus_select_scoped" ON public.permintaan_generus;
CREATE POLICY "permintaan_generus_select_scoped" ON public.permintaan_generus
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          (p.role = 'guru' AND p.guru_id = permintaan_generus.guru_id)
       OR (p.role = 'admin_ppg')
       OR (p.role = 'admin_desa' AND p.scope_desa_id = (
             SELECT k.desa_id FROM kelompok k WHERE k.id = permintaan_generus.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = permintaan_generus.kelompok_id)
    )));

-- UPDATE: guru cuma boleh menandai pengajuannya SENDIRI sudah dibaca.
-- Kolom lain (status, dst) tetap ditulis via putuskan_permintaan_generus
-- (SECURITY DEFINER) -- policy ini tidak membatasi KOLOM mana yang boleh
-- diubah (Postgres RLS tidak punya izin per-kolom via policy biasa),
-- kenyamanan bukan pengaman mutlak; sama persis pola yg sudah diterima di
-- santri_update_guru (migrasi 20260821120000).
DROP POLICY IF EXISTS "permintaan_generus_update_guru_dibaca" ON public.permintaan_generus;
CREATE POLICY "permintaan_generus_update_guru_dibaca" ON public.permintaan_generus
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND p.role = 'guru' AND p.guru_id = permintaan_generus.guru_id));

-- ---------------------------------------------------------------------
-- 3. tambah_santri() -- cabut cabang guru (migrasi 20260821120000)
-- ---------------------------------------------------------------------
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
  if nullif(btrim(coalesce(p->>'tanggal_lahir','')), '') is null then
    raise exception 'tanggal lahir wajib diisi';
  end if;

  -- Scope: admin_ppg bebas; admin_desa dibatasi desanya; admin_kelompok
  -- dibatasi kelompoknya. Guru TIDAK LAGI lolos di sini -- guru wajib
  -- lewat ajukan_permintaan_generus() + persetujuan admin (lihat bagian
  -- 8-9 migrasi ini).
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
  'Tambah santri + generate NIS dalam SATU transaksi. Admin-only (admin_ppg/admin_desa/admin_kelompok) -- guru wajib lewat ajukan_permintaan_generus(), fungsi ini dipanggil ULANG oleh putuskan_permintaan_generus() saat admin menyetujui.';

-- ---------------------------------------------------------------------
-- 4. pindah_kelas_santri() -- cabang guru -> admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pindah_kelas_santri(p jsonb)
 RETURNS SETOF public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_santri_ids      bigint[];
  v_kelas_tujuan_id bigint := (p->>'kelas_tujuan_id')::bigint;
  v_kelas_tujuan    public.kelas;
  v_boleh           boolean;
  v_tidak_cocok     int;
begin
  select array(
    select (jsonb_array_elements_text(p->'santri_ids'))::bigint
  ) into v_santri_ids;

  if v_santri_ids is null or array_length(v_santri_ids, 1) is null then
    raise exception 'Pilih minimal satu santri.';
  end if;
  if v_kelas_tujuan_id is null then
    raise exception 'Kelas tujuan wajib dipilih.';
  end if;

  select * into v_kelas_tujuan from kelas where id = v_kelas_tujuan_id and deleted_at is null;
  if not found then
    raise exception 'Kelas tujuan tidak ditemukan.';
  end if;

  -- Admin-only: admin_ppg bebas; admin_desa/admin_kelompok dibatasi scope
  -- kelas TUJUAN. Cabang guru (kelas asal miliknya sendiri) DICABUT --
  -- guru wajib lewat ajukan_permintaan_generus().
  select exists (
    select 1
      from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
     where pr.is_active
       and ( pr.role = 'admin_ppg'
          or (pr.role = 'admin_desa'
              and pr.scope_desa_id = (select k.desa_id from kelompok k where k.id = v_kelas_tujuan.kelompok_id))
          or (pr.role = 'admin_kelompok'
              and pr.scope_kelompok_id = v_kelas_tujuan.kelompok_id) )
  ) into v_boleh;

  if not v_boleh then
    raise exception 'Anda tidak memiliki akses ke kelas tujuan ini.';
  end if;

  -- Semua santri yang dipilih wajib berada di kelompok yang SAMA dgn
  -- kelas tujuan -- tidak boleh memindah lintas kelompok lewat jalur ini.
  select count(*) into v_tidak_cocok
    from santri s
   where s.id = any(v_santri_ids)
     and s.kelompok_id is distinct from v_kelas_tujuan.kelompok_id;
  if v_tidak_cocok > 0 then
    raise exception 'Ada santri di luar kelompok kelas tujuan.';
  end if;

  return query
    update santri
       set kelas_ngaji = v_kelas_tujuan.nama
     where id = any(v_santri_ids)
    returning *;
end;
$function$;

COMMENT ON FUNCTION public.pindah_kelas_santri(jsonb) IS
  'Pindahkan banyak santri sekaligus ke kelas lain DALAM kelompok yang sama, satu transaksi. Admin-only -- guru wajib lewat ajukan_permintaan_generus(), fungsi ini dipanggil ULANG oleh putuskan_permintaan_generus() saat disetujui.';

-- ---------------------------------------------------------------------
-- 5. naikkan_jenjang_santri() -- cabang guru -> admin
-- ---------------------------------------------------------------------
-- `kelompok_id` sekarang WAJIB ada di payload (ditulis
-- ajukan_permintaan_generus() dari kelompok guru pengaju) -- dipakai
-- utk pengecekan scope admin_desa/admin_kelompok tanpa perlu menebak dari
-- baris santri (yang bisa lintas kelas/kelompok kalau admin_ppg memilih
-- sembarang, walau dlm praktik selalu satu kelompok krn berasal dari satu
-- pengajuan guru).
CREATE OR REPLACE FUNCTION public.naikkan_jenjang_santri(p jsonb)
 RETURNS SETOF public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_santri_ids  bigint[];
  v_kelompok_id bigint := (p->>'kelompok_id')::bigint;
  v_boleh       boolean;
  v_tidak_cocok int;
begin
  select array(
    select (jsonb_array_elements_text(p->'santri_ids'))::bigint
  ) into v_santri_ids;

  if v_santri_ids is null or array_length(v_santri_ids, 1) is null then
    raise exception 'Pilih minimal satu santri.';
  end if;
  if v_kelompok_id is null then
    raise exception 'kelompok_id wajib diisi';
  end if;

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

  select count(*) into v_tidak_cocok
    from santri s
   where s.id = any(v_santri_ids)
     and s.kelompok_id is distinct from v_kelompok_id;
  if v_tidak_cocok > 0 then
    raise exception 'Ada santri di luar kelompok ini.';
  end if;

  return query
    update santri
       set jenjang_saat_ini = (case jenjang_saat_ini
             when 'PAUD/TK'::santri_jenjang    then 'Cabe Rawit'
             when 'Cabe Rawit'::santri_jenjang  then 'Pra Remaja'
             when 'Pra Remaja'::santri_jenjang  then 'Remaja SMA'
             when 'Remaja SMA'::santri_jenjang  then 'Remaja'
             else jenjang_saat_ini
           end)::santri_jenjang
     where id = any(v_santri_ids)
       and jenjang_saat_ini is distinct from 'Remaja'::santri_jenjang
    returning *;
end;
$function$;

COMMENT ON FUNCTION public.naikkan_jenjang_santri(jsonb) IS
  'Naikkan jenjang_saat_ini satu tingkat utk banyak santri sekaligus, satu transaksi. Admin-only -- guru wajib lewat ajukan_permintaan_generus(). Santri yang sudah di jenjang Remaja (tertinggi) dilewati, bukan ditolak.';

-- ---------------------------------------------------------------------
-- 6. nonaktifkan_santri() -- cabang guru -> admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nonaktifkan_santri(p jsonb)
 RETURNS SETOF public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_santri_ids  bigint[];
  v_jenis       text := p->>'jenis_siklus';
  v_tanggal     date := coalesce(nullif(btrim(coalesce(p->>'tanggal','')), '')::date, current_date);
  v_kelompok_id bigint := (p->>'kelompok_id')::bigint;
  v_boleh       boolean;
  v_cocok       int;
begin
  select array(
    select (jsonb_array_elements_text(p->'santri_ids'))::bigint
  ) into v_santri_ids;

  if v_santri_ids is null or array_length(v_santri_ids, 1) is null then
    raise exception 'Pilih minimal satu santri.';
  end if;
  if v_jenis not in ('Pindah', 'Tidak Aktif') then
    raise exception 'jenis_siklus harus Pindah atau Tidak Aktif';
  end if;
  if v_kelompok_id is null then
    raise exception 'kelompok_id wajib diisi';
  end if;

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

  select count(*) into v_cocok
    from santri s
   where s.id = any(v_santri_ids)
     and s.deleted_at is null
     and s.kelompok_id = v_kelompok_id;
  if v_cocok <> array_length(v_santri_ids, 1) then
    raise exception 'Ada santri di luar kelompok ini atau sudah tidak aktif.';
  end if;

  insert into siklus_generus (
    kelompok_id, santri_id, nama, jenis_siklus, tanggal, keterangan, dicatat_oleh
  )
  select v_kelompok_id, s.id, s.nama, v_jenis::siklus_generus_jenis, v_tanggal,
         nullif(btrim(coalesce(p->>'keterangan','')), ''), auth.uid()
    from santri s where s.id = any(v_santri_ids);

  return query
    update santri
       set deleted_at = v_tanggal::timestamptz
     where id = any(v_santri_ids)
    returning *;
end;
$function$;

COMMENT ON FUNCTION public.nonaktifkan_santri(jsonb) IS
  'Tandai banyak santri sekaligus Pindah/Tidak Aktif: catat siklus_generus + soft-delete SEJAK tanggal peristiwa, satu transaksi. Admin-only -- guru wajib lewat ajukan_permintaan_generus().';

GRANT EXECUTE ON FUNCTION public.tambah_santri(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pindah_kelas_santri(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.naikkan_jenjang_santri(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nonaktifkan_santri(jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 7. Cabut policy guru yang sudah tidak terpakai
-- ---------------------------------------------------------------------
-- santri_update_guru (migrasi 20260821120000) SENGAJA TIDAK dicabut --
-- masih dipakai jalur "Ubah" biasa (ganti alamat/no WA/dst), yang TIDAK
-- termasuk 5 aksi yang diminta owner lewat persetujuan.
DROP POLICY IF EXISTS "santri_pindah_kelas_guru" ON public.santri;
DROP POLICY IF EXISTS "siklus_generus_insert_guru" ON public.siklus_generus;

-- ---------------------------------------------------------------------
-- 8. ajukan_permintaan_generus() -- guru mengajukan
-- ---------------------------------------------------------------------
-- SECURITY DEFINER: bypass RLS scope-crossing yang rumit (tabel santri/
-- kelas/permintaan_generus sekaligus), otorisasi dicek eksplisit di sini
-- -- pola sama dgn next_nis_santri()/putuskan_permintaan_generus().
--
-- p = { jenis: 'tambah'|'pindah_kelas'|'naik_kelas'|'pindah_domisili'|'non_aktif',
--       payload: jsonb (bentuk PERSIS argumen fungsi aksi terkait) }
--
-- kelompok_id & jenis_siklus TIDAK dipercaya dari payload klien utk jenis
-- selain 'tambah' -- ditimpa di sini dari scope guru sendiri / dari jenis
-- yang dipilih, supaya guru tidak bisa menyelundupkan kelompok/jenis lain.
CREATE OR REPLACE FUNCTION public.ajukan_permintaan_generus(p jsonb)
 RETURNS public.permintaan_generus
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_jenis        public.permintaan_generus_jenis := (p->>'jenis')::public.permintaan_generus_jenis;
  v_payload      jsonb := p->'payload';
  v_guru_id      bigint;
  v_kelompok_id  bigint;
  v_santri_ids   bigint[];
  v_tidak_cocok  int;
  v_kelas        public.kelas;
  v_ringkasan    text;
  v_nama_list    text;
  v_row          public.permintaan_generus;
begin
  select pr.guru_id, pr.scope_kelompok_id into v_guru_id, v_kelompok_id
    from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
   where pr.is_active and pr.role = 'guru';
  if v_guru_id is null then
    raise exception 'Hanya guru yang bisa mengajukan permintaan Data Generus.';
  end if;
  if v_jenis is null then
    raise exception 'jenis permintaan wajib diisi.';
  end if;

  if v_jenis = 'tambah' then
    -- kelompok_id & kelas_ngaji divalidasi persis spt tambah_santri()
    -- dulu memvalidasi guru (migrasi 20260821120000, sekarang dicabut dari
    -- sana): kelas_ngaji WAJIB kelas milik guru ini sendiri.
    v_payload := v_payload || jsonb_build_object('kelompok_id', v_kelompok_id);
    if nullif(btrim(coalesce(v_payload->>'nama','')), '') is null then
      raise exception 'Nama wajib diisi.';
    end if;
    if v_payload->>'gender' is null then
      raise exception 'Gender wajib diisi.';
    end if;
    if v_payload->>'jenjang_saat_ini' is null then
      raise exception 'Jenjang wajib diisi.';
    end if;
    if nullif(btrim(coalesce(v_payload->>'tanggal_lahir','')), '') is null then
      raise exception 'Tanggal lahir wajib diisi.';
    end if;
    select * into v_kelas
      from kelas
     where kelompok_id = v_kelompok_id
       and guru_id = v_guru_id
       and deleted_at is null
       and nama = nullif(btrim(coalesce(v_payload->>'kelas_ngaji','')), '');
    if not found then
      raise exception 'Kelas Ngaji wajib salah satu kelas yang Anda ampu.';
    end if;
    v_ringkasan := 'Tambah santri baru: ' || (v_payload->>'nama') ||
                   ' (' || (v_payload->>'jenjang_saat_ini') || ', Kelas ' || v_kelas.nama || ')';

  elsif v_jenis in ('naik_kelas', 'pindah_domisili', 'non_aktif') then
    select array(select (jsonb_array_elements_text(v_payload->'santri_ids'))::bigint)
      into v_santri_ids;
    if v_santri_ids is null or array_length(v_santri_ids, 1) is null then
      raise exception 'Pilih minimal satu santri.';
    end if;
    select count(*) into v_tidak_cocok
      from santri s
     where s.id = any(v_santri_ids)
       and s.deleted_at is null
       and exists (
             select 1 from kelas k
              where k.id = s.kelas_id and k.guru_id = v_guru_id and k.deleted_at is null
           );
    if v_tidak_cocok <> array_length(v_santri_ids, 1) then
      raise exception 'Ada santri yang bukan di kelas Anda atau sudah tidak aktif.';
    end if;

    select string_agg(nama, ', ') into v_nama_list from santri where id = any(v_santri_ids);
    v_payload := v_payload || jsonb_build_object('kelompok_id', v_kelompok_id);

    if v_jenis = 'naik_kelas' then
      v_ringkasan := 'Naik jenjang: ' || v_nama_list;
    else
      -- jenis_siklus DITENTUKAN DI SINI dari jenis permintaan, BUKAN
      -- dipercaya dari payload klien -- guru tidak bisa mengajukan
      -- 'pindah_domisili' tapi menyelundupkan jenis_siklus lain.
      v_payload := v_payload || jsonb_build_object(
        'jenis_siklus', case when v_jenis = 'pindah_domisili' then 'Pindah' else 'Tidak Aktif' end
      );
      v_ringkasan := (case when v_jenis = 'pindah_domisili' then 'Pindah Domisili' else 'Non Aktif' end)
                     || ' sejak ' || coalesce(nullif(btrim(coalesce(v_payload->>'tanggal','')), ''), 'hari ini')
                     || ': ' || v_nama_list;
    end if;

  elsif v_jenis = 'pindah_kelas' then
    select array(select (jsonb_array_elements_text(v_payload->'santri_ids'))::bigint)
      into v_santri_ids;
    if v_santri_ids is null or array_length(v_santri_ids, 1) is null then
      raise exception 'Pilih minimal satu santri.';
    end if;
    select count(*) into v_tidak_cocok
      from santri s
     where s.id = any(v_santri_ids)
       and s.deleted_at is null
       and exists (
             select 1 from kelas k
              where k.id = s.kelas_id and k.guru_id = v_guru_id and k.deleted_at is null
           );
    if v_tidak_cocok <> array_length(v_santri_ids, 1) then
      raise exception 'Ada santri yang bukan di kelas Anda atau sudah tidak aktif.';
    end if;

    select * into v_kelas
      from kelas
     where id = ((v_payload->>'kelas_tujuan_id')::bigint)
       and kelompok_id = v_kelompok_id
       and deleted_at is null;
    if not found then
      raise exception 'Kelas tujuan tidak ditemukan di kelompok Anda.';
    end if;

    select string_agg(nama, ', ') into v_nama_list from santri where id = any(v_santri_ids);
    v_ringkasan := v_nama_list || ' → Kelas ' || v_kelas.nama;

  else
    raise exception 'Jenis permintaan tidak dikenali.';
  end if;

  insert into permintaan_generus (kelompok_id, guru_id, jenis, payload, ringkasan)
  values (v_kelompok_id, v_guru_id, v_jenis, v_payload, v_ringkasan)
  returning * into v_row;

  return v_row;
end;
$function$;

COMMENT ON FUNCTION public.ajukan_permintaan_generus(jsonb) IS
  'Guru mengajukan salah satu dari 5 aksi Data Generus -- HANYA mencatat permintaan (status pending), tidak mengubah santri/siklus_generus. SECURITY DEFINER, validasi scope eksplisit di dalam.';

GRANT EXECUTE ON FUNCTION public.ajukan_permintaan_generus(jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 9. putuskan_permintaan_generus() -- admin memutuskan
-- ---------------------------------------------------------------------
-- p = { permintaan_id, keputusan: 'approved'|'rejected', catatan? }
--
-- SECURITY DEFINER, TAPI panggilan bersarang ke tambah_santri/
-- pindah_kelas_santri/naikkan_jenjang_santri/nonaktifkan_santri tetap
-- membaca auth.uid() SESI ASLI (admin yang login) -- fungsi2 itu jadi
-- lolos cabang admin-nya sendiri secara wajar, TIDAK krn RLS di-bypass
-- (walau memang ikut ter-bypass sbg efek DEFINER, itu bukan yang
-- menahannya -- pengecekan eksplisit di dalam masing2 fungsi itu yang
-- sesungguhnya menahan).
CREATE OR REPLACE FUNCTION public.putuskan_permintaan_generus(p jsonb)
 RETURNS public.permintaan_generus
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id         bigint := (p->>'permintaan_id')::bigint;
  v_keputusan  text := p->>'keputusan';
  v_catatan    text := nullif(btrim(coalesce(p->>'catatan','')), '');
  v_permintaan public.permintaan_generus;
  v_boleh      boolean;
  v_row        public.permintaan_generus;
begin
  if v_id is null then
    raise exception 'permintaan_id wajib diisi.';
  end if;
  if v_keputusan not in ('approved', 'rejected') then
    raise exception 'keputusan harus approved atau rejected.';
  end if;

  select * into v_permintaan from permintaan_generus where id = v_id;
  if not found then
    raise exception 'Permintaan tidak ditemukan.';
  end if;
  if v_permintaan.status <> 'pending' then
    raise exception 'Permintaan ini sudah diputuskan.';
  end if;

  select exists (
    select 1
      from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
     where pr.is_active
       and ( pr.role = 'admin_ppg'
          or (pr.role = 'admin_desa'
              and pr.scope_desa_id = (select k.desa_id from kelompok k where k.id = v_permintaan.kelompok_id))
          or (pr.role = 'admin_kelompok'
              and pr.scope_kelompok_id = v_permintaan.kelompok_id) )
  ) into v_boleh;

  if not v_boleh then
    raise exception 'Anda tidak memiliki akses ke permintaan ini.';
  end if;

  if v_keputusan = 'approved' then
    if v_permintaan.jenis = 'tambah' then
      perform tambah_santri(v_permintaan.payload);
    elsif v_permintaan.jenis = 'pindah_kelas' then
      perform pindah_kelas_santri(v_permintaan.payload);
    elsif v_permintaan.jenis = 'naik_kelas' then
      perform naikkan_jenjang_santri(v_permintaan.payload);
    else
      perform nonaktifkan_santri(v_permintaan.payload);
    end if;
  end if;

  update permintaan_generus
     set status = v_keputusan::akses_kelas_status,
         catatan_admin = v_catatan,
         diputuskan_pada = now(),
         diputuskan_oleh = auth.uid(),
         guru_dibaca = false
   where id = v_id
  returning * into v_row;

  return v_row;
end;
$function$;

COMMENT ON FUNCTION public.putuskan_permintaan_generus(jsonb) IS
  'Admin Kelp (atau admin_desa/admin_ppg) menyetujui/menolak permintaan Data Generus. Kalau disetujui, memanggil ULANG fungsi aksi terkait dgn payload yang tersimpan -- auth.uid() di panggilan bersarang tetap admin yang login (berbasis klaim JWT sesi, bukan role SQL), jadi lolos cabang admin fungsi2 itu secara wajar.';

GRANT EXECUTE ON FUNCTION public.putuskan_permintaan_generus(jsonb) TO authenticated;

COMMIT;
