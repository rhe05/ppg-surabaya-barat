-- =====================================================================
-- 20260826160000_riwayat_guru_purna_pindah.sql
--
-- Fitur "Data Guru" mobile admin_kelompok: ganti "Hapus Guru" biasa
-- jadi tandai Purna/Pindah -- BUKAN hapus mentah, dicatat sbg riwayat
-- (append-only ledger) lalu guru itu di-soft-delete SEJAK TANGGAL
-- PERISTIWA itu, satu transaksi. Pola SAMA PERSIS dgn santri
-- (siklus_generus + nonaktifkan_santri(), migrasi 20260821130000) --
-- guru.deleted_at dipakai apa adanya sbg "sejak kapan tidak aktif",
-- bukan cuma "kapan tombol diklik", supaya laporan periode lama tetap
-- menunjukkan guru itu walau sekarang sudah purna/pindah.
--
-- Isi:
--   1. Enum riwayat_guru_jenis ('Purna', 'Pindah').
--   2. Tabel riwayat_guru (historical snapshot, append-only, TANPA
--      updated_at/deleted_at -- sama alasan dgn siklus_generus).
--   3. RLS: SELECT scoped (admin_ppg semua, admin_desa kelompok2 di
--      desanya, admin_kelompok kelompoknya sendiri -- PERSIS pola
--      guru_select_scoped), INSERT admin-scoped (PERSIS pola
--      guru_insert_admin, migrasi 20260818090000).
--   4. RPC nonaktifkan_guru() -- catat riwayat_guru + soft-delete guru
--      dalam SATU transaksi, khusus admin (bukan guru sendiri).
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1-2. Enum + tabel
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE riwayat_guru_jenis AS ENUM ('Purna', 'Pindah');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS riwayat_guru (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id   bigint NOT NULL REFERENCES kelompok (id),
  guru_id       bigint NOT NULL REFERENCES guru (id),
  nama          text NOT NULL, -- snapshot nama guru PADA SAAT dicatat
  jenis         riwayat_guru_jenis NOT NULL,
  tanggal       date NOT NULL,
  keterangan    text,
  dicatat_oleh  uuid REFERENCES profiles (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_riwayat_guru_guru_id ON riwayat_guru (guru_id);
CREATE INDEX IF NOT EXISTS idx_riwayat_guru_kelompok_id ON riwayat_guru (kelompok_id);

COMMENT ON TABLE riwayat_guru IS 'Historical Snapshot Table (append-only ledger, tidak ada updated_at/deleted_at) -- catatan Purna/Pindah guru, sama pola dgn siklus_generus utk santri.';
COMMENT ON COLUMN riwayat_guru.nama IS 'Snapshot nama guru PADA SAAT dicatat, BUKAN sumber kebenaran nama (itu di guru.nama).';

ALTER TABLE riwayat_guru ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 3. RLS -- persis pola guru_select_scoped / guru_insert_admin
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "riwayat_guru_select_scoped" ON public.riwayat_guru;
CREATE POLICY "riwayat_guru_select_scoped" ON public.riwayat_guru
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = riwayat_guru.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = riwayat_guru.kelompok_id)))))));

DROP POLICY IF EXISTS "riwayat_guru_insert_admin" ON public.riwayat_guru;
CREATE POLICY "riwayat_guru_insert_admin" ON public.riwayat_guru
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = riwayat_guru.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = riwayat_guru.kelompok_id)))))));

-- ---------------------------------------------------------------------
-- 4. nonaktifkan_guru() -- catat riwayat + soft-delete, satu transaksi
-- ---------------------------------------------------------------------
-- SECURITY INVOKER (default): INSERT-nya tunduk pada
-- riwayat_guru_insert_admin di atas, UPDATE guru-nya tunduk pada
-- guru_update_admin (sudah ada sejak 20260805080137) -- pengecekan
-- scope di bawah adalah lapis pertama (pesan error ramah), RLS lapis
-- kedua. Khusus admin (admin_ppg/desa/kelompok) -- guru TIDAK bisa
-- menonaktifkan dirinya sendiri lewat jalur ini.
CREATE OR REPLACE FUNCTION public.nonaktifkan_guru(p jsonb)
 RETURNS public.guru
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_guru_id     bigint := (p->>'guru_id')::bigint;
  v_jenis       text   := p->>'jenis';
  v_tanggal     date   := coalesce(nullif(btrim(coalesce(p->>'tanggal','')), '')::date, current_date);
  v_kelompok_id bigint;
  v_boleh       boolean;
  v_row         public.guru;
begin
  if v_guru_id is null then
    raise exception 'guru_id wajib diisi';
  end if;
  if v_jenis not in ('Purna', 'Pindah') then
    raise exception 'jenis harus Purna atau Pindah';
  end if;

  select g.kelompok_id into v_kelompok_id
    from guru g where g.id = v_guru_id and g.deleted_at is null;
  if not found then
    raise exception 'Guru tidak ditemukan atau sudah tidak aktif.';
  end if;

  select exists (
    select 1
      from auth_profile() pr(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
     where pr.is_active
       and ((pr.role = 'admin_ppg')
         or (pr.role = 'admin_desa' and pr.scope_desa_id = (select k.desa_id from kelompok k where k.id = v_kelompok_id))
         or (pr.role = 'admin_kelompok' and pr.scope_kelompok_id = v_kelompok_id))
  ) into v_boleh;

  if not v_boleh then
    raise exception 'Anda tidak memiliki akses ke guru ini.';
  end if;

  insert into riwayat_guru (
    kelompok_id, guru_id, nama, jenis, tanggal, keterangan, dicatat_oleh
  )
  select v_kelompok_id, v_guru_id, g.nama, v_jenis::riwayat_guru_jenis, v_tanggal,
         nullif(btrim(coalesce(p->>'keterangan','')), ''),
         auth.uid()
    from guru g where g.id = v_guru_id;

  update guru
     set deleted_at = v_tanggal::timestamptz
   where id = v_guru_id
  returning * into v_row;

  return v_row;
end;
$function$;

REVOKE ALL ON FUNCTION public.nonaktifkan_guru(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nonaktifkan_guru(jsonb) TO authenticated;

COMMENT ON FUNCTION public.nonaktifkan_guru(jsonb) IS
  'Tandai guru Purna/Pindah: catat riwayat_guru + soft-delete guru SEJAK tanggal peristiwa, dalam satu transaksi. Khusus admin (admin_ppg/desa/kelompok).';

COMMIT;
