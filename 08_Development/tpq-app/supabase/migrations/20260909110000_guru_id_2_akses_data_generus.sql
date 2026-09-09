-- =====================================================================
-- 20260909110000_guru_id_2_akses_data_generus.sql
--
-- Lanjutan celah "guru gilir kedua" (kelas.guru_id_2) -- bagian Data
-- Generus. Migrasi 20260909100000 sudah menutup jurnal & tilawati;
-- berkas ini menutup jalur guru MENGUBAH / MENGAJUKAN data santri.
--
-- Jalur tulis santri milik guru cuma dua (sisanya sudah admin-only):
--   1. Policy santri_update_guru  -- UPDATE inline field santri
--      (migrasi 20260821120000).
--   2. ajukan_permintaan_generus() -- antrean 5 aksi Data Generus
--      (migrasi 20260821180000). tambah_santri()/nonaktifkan_santri()/
--      pindah_kelas_santri()/naikkan_jenjang_santri() cabang guru-nya
--      SUDAH dicabut -- tidak disentuh di sini.
--
-- Perubahan: tiap cek "kelas ini/santri ini milik guru pemanggil"
--   dari  guru_id = <guru pemanggil>
--   jadi  <guru pemanggil> IN (guru_id, guru_id_2)
-- Tidak ada perubahan untuk peran admin.
--
-- Badan ajukan_permintaan_generus() disalin UTUH dari 20260821180000
-- (verified sama dgn produksi 2026-09-09), hanya 3 baris cek pemilik
-- yang diubah.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. santri_update_guru
-- ---------------------------------------------------------------------
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
       AND p.guru_id IN (k.guru_id, k.guru_id_2)
       AND k.deleted_at IS NULL
  )))));

-- ---------------------------------------------------------------------
-- 2. ajukan_permintaan_generus() -- 3 cek pemilik kelas/santri
-- ---------------------------------------------------------------------
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
       and v_guru_id in (guru_id, guru_id_2)
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
              where k.id = s.kelas_id and v_guru_id in (k.guru_id, k.guru_id_2) and k.deleted_at is null
           );
    if v_tidak_cocok <> array_length(v_santri_ids, 1) then
      raise exception 'Ada santri yang bukan di kelas Anda atau sudah tidak aktif.';
    end if;

    select string_agg(nama, ', ') into v_nama_list from santri where id = any(v_santri_ids);
    v_payload := v_payload || jsonb_build_object('kelompok_id', v_kelompok_id);

    if v_jenis = 'naik_kelas' then
      v_ringkasan := 'Naik jenjang: ' || v_nama_list;
    else
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
              where k.id = s.kelas_id and v_guru_id in (k.guru_id, k.guru_id_2) and k.deleted_at is null
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
  'Guru mengajukan salah satu dari 5 aksi Data Generus -- HANYA mencatat permintaan (status pending), tidak mengubah santri/siklus_generus. SECURITY DEFINER, validasi scope eksplisit di dalam. Kepemilikan kelas/santri diterima utk guru utama ATAU guru gilir kedua (kelas.guru_id_2, migrasi 20260909110000).';

COMMIT;
