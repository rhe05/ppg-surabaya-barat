-- =====================================================================
-- 20260821130000_nonaktifkan_santri_guru.sql
--
-- Fitur "Data Generus" mobile guru, lanjutan migrasi 20260821120000:
-- ketika guru "menghapus" santri dari Data Generus, itu BUKAN hapus biasa
-- -- dicatat sebagai peristiwa siklus generus (Pindah / Tidak Aktif) dan
-- santri itu di-soft-delete SEJAK TANGGAL PERISTIWA itu (bisa hari ini,
-- bisa tanggal lampau kalau guru mengisi mundur).
--
-- `santri.deleted_at` dipakai APA ADANYA sebagai "sejak kapan tidak aktif"
-- -- bukan cuma "kapan tombol Hapus diklik". Ini yang membuat laporan
-- periode lama (mis. Juli) tetap menunjukkan data santri itu walau bulan
-- ini (Agustus) dia sudah dipindah/nonaktif -- lihat migrasi
-- 20260821140000 utk sisi baca (RPC statistik) dan perubahan query
-- frontend utk layar-layar berperiode lainnya.
--
-- Isi:
--   1. siklus_generus_insert_guru -- guru boleh mencatat siklus generus,
--      HANYA utk santri di kelas yang dia ampu sendiri.
--   2. nonaktifkan_santri() -- catat siklus_generus + soft-delete santri
--      dalam SATU transaksi (pola sama dgn tambah_santri, migrasi
--      20260817100000).
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. siklus_generus_insert_guru
-- ---------------------------------------------------------------------
-- siklus_generus sudah punya SELECT ter-scope kelompok utk guru (migrasi
-- 20260818170000) dan tulis-admin (siklus_generus_tulis_admin, FOR ALL,
-- guru TIDAK termasuk). Policy ini menambah jalur INSERT KHUSUS guru,
-- dibatasi ke santri di kelas yang dia ampu sendiri -- lebih sempit dari
-- scope admin (sekelompok) karena guru cuma boleh mencatat siklus utk
-- murid yang benar-benar dia ajar.
DROP POLICY IF EXISTS "siklus_generus_insert_guru" ON public.siklus_generus;
CREATE POLICY "siklus_generus_insert_guru" ON public.siklus_generus
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active
      AND p.role = 'guru'
      AND p.scope_kelompok_id = siklus_generus.kelompok_id
      AND EXISTS (
            SELECT 1 FROM santri s
            JOIN kelas k ON k.id = s.kelas_id
           WHERE s.id = siklus_generus.santri_id
             AND k.guru_id = p.guru_id
             AND k.deleted_at IS NULL
          )));

-- ---------------------------------------------------------------------
-- 2. nonaktifkan_santri() -- catat siklus + soft-delete, satu transaksi
-- ---------------------------------------------------------------------
-- SECURITY INVOKER (default): INSERT-nya tunduk pada
-- siklus_generus_insert_guru di atas, UPDATE santri-nya tunduk pada
-- santri_update_guru (migrasi 20260821120000) -- pengecekan scope di
-- bawah adalah lapis pertama (pesan error ramah), RLS lapis kedua.
--
-- jenis_siklus dibatasi ke 'Pindah'/'Tidak Aktif' SAJA di jalur guru --
-- empat nilai enum lainnya (Kerja, Kuliah, Mondok, Tugas) adalah utk
-- santri yang sudah lulus/dewasa, dicatat admin lewat layar Siklus
-- Generus yang sudah ada, bukan lewat Data Generus guru.
CREATE OR REPLACE FUNCTION public.nonaktifkan_santri(p jsonb)
 RETURNS public.santri
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_santri_id   bigint := (p->>'santri_id')::bigint;
  v_jenis       text   := p->>'jenis_siklus';
  v_tanggal     date   := coalesce(nullif(btrim(coalesce(p->>'tanggal','')), '')::date, current_date);
  v_kelas_id    bigint;
  v_kelompok_id bigint;
  v_boleh       boolean;
  v_row         public.santri;
begin
  if v_santri_id is null then
    raise exception 'santri_id wajib diisi';
  end if;
  if v_jenis not in ('Pindah', 'Tidak Aktif') then
    raise exception 'jenis_siklus harus Pindah atau Tidak Aktif';
  end if;

  select s.kelas_id, s.kelompok_id into v_kelas_id, v_kelompok_id
    from santri s where s.id = v_santri_id and s.deleted_at is null;
  if not found then
    raise exception 'Santri tidak ditemukan atau sudah tidak aktif.';
  end if;

  select exists (
    select 1
      from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
     where pr.is_active
       and pr.role = 'guru'
       and pr.scope_kelompok_id = v_kelompok_id
       and v_kelas_id is not null
       and exists (
             select 1 from kelas k
              where k.id = v_kelas_id
                and k.guru_id = pr.guru_id
                and k.deleted_at is null
           )
  ) into v_boleh;

  if not v_boleh then
    raise exception 'Anda tidak memiliki akses ke santri ini.';
  end if;

  insert into siklus_generus (
    kelompok_id, santri_id, nama, jenis_siklus, tanggal, keterangan, dicatat_oleh
  )
  select v_kelompok_id, v_santri_id, s.nama, v_jenis::siklus_generus_jenis, v_tanggal,
         nullif(btrim(coalesce(p->>'keterangan','')), ''),
         auth.uid()
    from santri s where s.id = v_santri_id;

  update santri
     set deleted_at = v_tanggal::timestamptz
   where id = v_santri_id
  returning * into v_row;

  return v_row;
end;
$function$;

COMMENT ON FUNCTION public.nonaktifkan_santri(jsonb) IS
  'Tandai santri Pindah/Tidak Aktif: catat siklus_generus + soft-delete santri SEJAK tanggal peristiwa, dalam satu transaksi. Khusus guru, dibatasi ke kelas yang dia ampu sendiri.';

GRANT EXECUTE ON FUNCTION public.nonaktifkan_santri(jsonb) TO authenticated;

COMMIT;
