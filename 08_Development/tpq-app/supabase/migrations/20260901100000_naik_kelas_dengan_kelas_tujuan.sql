-- =====================================================================
-- 20260901100000_naik_kelas_dengan_kelas_tujuan.sql
--
-- "Naik Kelas" (Data Generus guru & Admin Kelp) sekarang SEKALIGUS
-- memindahkan santri ke kelas tujuan yang dipilih, bukan cuma menaikkan
-- jenjang_saat_ini seperti migrasi 20260821160000/20260821180000.
-- Alasan: di lapangan naik jenjang selalu berbarengan dgn pindah
-- kelompok belajar, jadi memaksa guru menjalankan dua aksi terpisah
-- (Naik Kelas lalu Pindah Kelas) menghasilkan data setengah jadi kalau
-- yang kedua lupa dijalankan.
--
-- Isi:
--   1. naikkan_jenjang_santri() -- terima `kelas_tujuan_id` (OPSIONAL,
--      demi kompatibilitas pemanggil lama); kalau ada, kelas_ngaji ikut
--      diganti. Santri yang jenjangnya sudah tertinggi (Remaja) TETAP
--      ikut pindah kelas -- cuma jenjangnya yang tidak berubah.
--   2. ajukan_permintaan_generus() -- utk jenis 'naik_kelas',
--      `kelas_tujuan_id` WAJIB dan harus kelas aktif di kelompok guru
--      pengaju (boleh kelas milik guru lain, sama spt 'pindah_kelas').
--      Ringkasan permintaan ikut menyebut kelas tujuannya supaya admin
--      tahu apa yang dia setujui.
--
-- Tidak ada policy RLS baru: jalur guru tetap lewat antrean
-- permintaan_generus (dieksekusi admin oleh putuskan_permintaan_generus),
-- jalur admin tetap admin-only spt sebelumnya.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. naikkan_jenjang_santri() -- + kelas tujuan
-- ---------------------------------------------------------------------
-- Sama spt pindah_kelas_santri(): yang ditulis adalah kelas_ngaji (nama),
-- BUKAN kelas_id -- trigger sinkron_santri_kelas (migrasi 20260819110000)
-- yang menurunkan kelas_id-nya.
CREATE OR REPLACE FUNCTION public.naikkan_jenjang_santri(p jsonb)
 RETURNS SETOF public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_santri_ids      bigint[];
  v_kelompok_id     bigint := (p->>'kelompok_id')::bigint;
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

  if v_kelas_tujuan_id is not null then
    select * into v_kelas_tujuan
      from kelas
     where id = v_kelas_tujuan_id
       and kelompok_id = v_kelompok_id
       and deleted_at is null;
    if not found then
      raise exception 'Kelas tujuan tidak ditemukan di kelompok ini.';
    end if;
  end if;

  -- Saringan "belum Remaja" hanya dipakai kalau TIDAK ada kelas tujuan.
  -- Kalau ada, santri yang jenjangnya sudah mentok tetap harus ikut
  -- pindah kelas (jenjangnya saja yang tidak berubah, lihat CASE ELSE).
  return query
    update santri
       set jenjang_saat_ini = (case jenjang_saat_ini
             when 'PAUD/TK'::santri_jenjang     then 'Cabe Rawit'
             when 'Cabe Rawit'::santri_jenjang  then 'Pra Remaja'
             when 'Pra Remaja'::santri_jenjang  then 'Remaja SMA'
             when 'Remaja SMA'::santri_jenjang  then 'Remaja'
             else jenjang_saat_ini
           end)::santri_jenjang,
           kelas_ngaji = coalesce(v_kelas_tujuan.nama, kelas_ngaji)
     where id = any(v_santri_ids)
       and ( v_kelas_tujuan_id is not null
          or jenjang_saat_ini is distinct from 'Remaja'::santri_jenjang )
    returning *;
end;
$function$;

COMMENT ON FUNCTION public.naikkan_jenjang_santri(jsonb) IS
  'Naikkan jenjang_saat_ini satu tingkat utk banyak santri sekaligus, satu transaksi; kalau payload memuat kelas_tujuan_id (kelas aktif di kelompok yang sama) santri sekalian dipindah ke kelas itu. Admin-only -- guru wajib lewat ajukan_permintaan_generus(). Santri yang sudah di jenjang Remaja (tertinggi) tidak naik lagi, tapi tetap ikut pindah kelas.';

-- ---------------------------------------------------------------------
-- 2. ajukan_permintaan_generus() -- 'naik_kelas' wajib bawa kelas tujuan
-- ---------------------------------------------------------------------
-- Badan fungsi = SALINAN PERSIS versi migrasi 20260821180000, dgn SATU
-- perubahan: cabang v_jenis = 'naik_kelas' kini memvalidasi kelas tujuan
-- (wajib, boleh kelas guru lain selama satu kelompok -- aturan sama dgn
-- 'pindah_kelas') dan ringkasannya menyebut kelas itu supaya admin tahu
-- persis apa yang dia setujui.
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
      -- Kelas tujuan WAJIB sejak 20260901100000 & boleh kelas guru lain
      -- selama satu kelompok -- aturan sama dgn 'pindah_kelas'.
      select * into v_kelas
        from kelas
       where id = ((v_payload->>'kelas_tujuan_id')::bigint)
         and kelompok_id = v_kelompok_id
         and deleted_at is null;
      if not found then
        raise exception 'Kelas tujuan tidak ditemukan di kelompok Anda.';
      end if;
      v_ringkasan := 'Naik Kelas: ' || v_nama_list || ' → Kelas ' || v_kelas.nama;
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
  'Guru mengajukan salah satu dari 5 aksi Data Generus -- HANYA mencatat permintaan (status pending), tidak mengubah santri/siklus_generus. SECURITY DEFINER, validasi scope eksplisit di dalam. Sejak 20260901100000 jenis naik_kelas WAJIB membawa kelas_tujuan_id.';

GRANT EXECUTE ON FUNCTION public.ajukan_permintaan_generus(jsonb) TO authenticated;

COMMIT;
