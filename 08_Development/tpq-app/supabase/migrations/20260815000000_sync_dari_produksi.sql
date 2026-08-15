-- =====================================================================
-- 20260815000000_sync_dari_produksi.sql
--
-- Sinkronisasi objek yang hanya ada di DB produksi (project
-- fnhqtkqswxsqmjxynldg) dan belum tercatat di supabase/migrations/.
-- Diekstrak 2026-08-15 dari katalog sistem produksi (pg_policies,
-- pg_get_functiondef, pg_get_triggerdef, pg_indexes, pg_constraint,
-- pg_enum, pg_class) lewat Supabase Management API.
--
-- Isi:
--    14 enum        (CREATE TYPE, dibungkus DO/duplicate_object)
--     7 fungsi      (CREATE OR REPLACE FUNCTION, body apa adanya)
--    11 CHECK       (ALTER TABLE ADD CONSTRAINT, dibungkus DO)
--    39 index       (CREATE INDEX IF NOT EXISTS)
--    25 trigger     (DROP IF EXISTS lalu CREATE)
--    37 ENABLE RLS  (ALTER TABLE)
--    41 policy      (DROP IF EXISTS lalu CREATE)
--
-- Seluruh berkas idempoten: aman dijalankan ulang pada DB yang sudah
-- memiliki objek-objek ini. Tidak memuat policy untuk tabel yang di
-- produksi memang belum punya policy - itu ditangani terpisah.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUM
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.absensi_status AS ENUM ('hadir', 'izin', 'sakit', 'alpa');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.akses_kelas_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin_ppg', 'admin_desa', 'admin_kelompok', 'guru');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.audit_action AS ENUM ('create', 'update', 'delete');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.gender_type AS ENUM ('L', 'P');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.guru_izin_jenis AS ENUM ('izin', 'cuti');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.kelas_status AS ENUM ('aktif', 'tidak_aktif');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.kelompok_status AS ENUM ('aktif', 'belum_aktif');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.konseling_kategori AS ENUM ('akademik', 'perilaku', 'emosional', 'sosial', 'kesehatan', 'lainnya');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.konseling_status AS ENUM ('aktif', 'selesai', 'pending');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.munaqosah_status AS ENUM ('dinilai', 'belum_dinilai');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pencapaian_status AS ENUM ('pending', 'in_progress', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.santri_jenjang AS ENUM ('AUD', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.siklus_generus_jenis AS ENUM ('Kerja', 'Kuliah', 'Pindah', 'Mondok', 'Tugas', 'Tidak Aktif');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------
-- 2. FUNGSI
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_profile()
 RETURNS TABLE(role text, scope_ppg_id bigint, scope_desa_id bigint, scope_kelompok_id bigint, guru_id bigint, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role::text, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active
  from profiles
  where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, role, is_active, created_at, updated_at)
  values (new.id, null, true, now(), now())
  on conflict (id) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pg_list_public_tables()
 RETURNS TABLE(table_name text)
 LANGUAGE sql
 STABLE
AS $function$
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name;
$function$;

CREATE OR REPLACE FUNCTION public.pg_table_columns(p_table_name text)
 RETURNS TABLE(column_name text, data_type text)
 LANGUAGE sql
 STABLE
AS $function$
  select column_name, data_type from information_schema.columns
  where table_schema = 'public' and table_name = p_table_name
  order by ordinal_position;
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_absensi_kelompok_id()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_kelompok_id bigint;
begin
  select kelompok_id into v_kelompok_id from santri where id = new.santri_id;

  if v_kelompok_id is null then
    raise exception 'absensi.santri_id % tidak ditemukan di tabel santri', new.santri_id;
  end if;

  new.kelompok_id = v_kelompok_id;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. CHECK CONSTRAINT
-- ---------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_scope CHECK ((((role IS NULL) AND (scope_ppg_id IS NULL) AND (scope_desa_id IS NULL) AND (scope_kelompok_id IS NULL)) OR ((role = 'admin_ppg'::app_role) AND (scope_ppg_id IS NOT NULL) AND (scope_desa_id IS NULL) AND (scope_kelompok_id IS NULL)) OR ((role = 'admin_desa'::app_role) AND (scope_desa_id IS NOT NULL) AND (scope_ppg_id IS NULL) AND (scope_kelompok_id IS NULL)) OR ((role = ANY (ARRAY['admin_kelompok'::app_role, 'guru'::app_role])) AND (scope_kelompok_id IS NOT NULL) AND (scope_ppg_id IS NULL) AND (scope_desa_id IS NULL))));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.kelas ADD CONSTRAINT chk_kelas_jam CHECK ((jam_selesai > jam_mulai));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.munaqosah ADD CONSTRAINT chk_munaqosah_nilai CHECK (((nilai IS NULL) OR ((nilai >= (0)::numeric) AND (nilai <= (100)::numeric))));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.kurikulum_akhlaq ADD CONSTRAINT chk_kurikulum_akhlaq_nilai CHECK (((nilai_akhlaq IS NULL) OR ((nilai_akhlaq >= (0)::numeric) AND (nilai_akhlaq <= (100)::numeric))));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.kurikulum_promes ADD CONSTRAINT chk_kurikulum_promes_semester CHECK ((semester = ANY (ARRAY[1, 2])));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.kurikulum_probul ADD CONSTRAINT chk_kurikulum_probul_bulan CHECK (((bulan >= 1) AND (bulan <= 12)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.kurikulum_probul_minggu ADD CONSTRAINT chk_kurikulum_probul_minggu_ke CHECK (((minggu_ke >= 1) AND (minggu_ke <= 4)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.kop_surat_baris ADD CONSTRAINT chk_kop_surat_baris_align CHECK ((align = ANY (ARRAY['left'::text, 'center'::text, 'right'::text])));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.kop_surat_baris ADD CONSTRAINT chk_kop_surat_baris_ke CHECK (((baris_ke >= 1) AND (baris_ke <= 3)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.akses_kelas_request ADD CONSTRAINT chk_akses_kelas_requester_not_owner CHECK ((requester_guru_id <> owner_guru_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.guru_izin ADD CONSTRAINT chk_guru_izin_tanggal CHECK ((tanggal_selesai >= tanggal_mulai));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------
-- 4. INDEX
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_absensi_kelompok_tanggal ON public.absensi USING btree (kelompok_id, tanggal) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_absensi_santri_tanggal ON public.absensi USING btree (santri_id, tanggal) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_absensi_santri_tanggal ON public.absensi USING btree (santri_id, tanggal) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_akses_kelas_request_lookup ON public.akses_kelas_request USING btree (kelompok_id, kelas_id, tanggal, status);
CREATE INDEX IF NOT EXISTS idx_akses_kelas_request_owner ON public.akses_kelas_request USING btree (owner_guru_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON public.audit_log USING btree (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_kelompok_tanggal ON public.calendar_events USING btree (kelompok_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_desa_ppg_id ON public.desa USING btree (ppg_id);
CREATE INDEX IF NOT EXISTS idx_guru_kelompok_id ON public.guru USING btree (kelompok_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_guru_izin_guru_tanggal ON public.guru_izin USING btree (guru_id, tanggal_mulai, tanggal_selesai);
CREATE INDEX IF NOT EXISTS idx_jurnal_kbm_guru_id ON public.jurnal_kbm USING btree (guru_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_jurnal_kbm_kelompok_tanggal ON public.jurnal_kbm USING btree (kelompok_id, tanggal) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_jurnal_kbm_kelas_tanggal ON public.jurnal_kbm USING btree (kelas_id, tanggal) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_kelas_guru_id ON public.kelas USING btree (guru_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_kelas_kelompok_id ON public.kelas USING btree (kelompok_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_kelas_kelompok_status ON public.kelas USING btree (kelompok_id, status) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kelas_kelompok_nama ON public.kelas USING btree (kelompok_id, lower(nama)) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_kelompok_desa_id ON public.kelompok USING btree (desa_id);
CREATE INDEX IF NOT EXISTS idx_kelompok_status_aktif ON public.kelompok USING btree (status_aktif) WHERE (status_aktif = 'aktif'::kelompok_status);
CREATE INDEX IF NOT EXISTS idx_konseling_kelompok_status ON public.konseling USING btree (kelompok_id, status) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_konseling_santri_id ON public.konseling USING btree (santri_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_kurikulum_akhlaq_santri_id ON public.kurikulum_akhlaq USING btree (santri_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_kurikulum_pencapaian_probul_id ON public.kurikulum_pencapaian_santri USING btree (probul_id);
CREATE INDEX IF NOT EXISTS idx_kurikulum_probul_kelompok_tahun_bulan ON public.kurikulum_probul USING btree (kelompok_id, tahun, bulan);
CREATE INDEX IF NOT EXISTS idx_kurikulum_probul_promes_id ON public.kurikulum_probul USING btree (promes_id);
CREATE INDEX IF NOT EXISTS idx_kurikulum_promes_prota_id ON public.kurikulum_promes USING btree (prota_id);
CREATE INDEX IF NOT EXISTS idx_kurikulum_prota_kelompok_tahun ON public.kurikulum_prota USING btree (kelompok_id, tahun);
CREATE INDEX IF NOT EXISTS idx_munaqosah_periode_id ON public.munaqosah USING btree (periode_id, status) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_munaqosah_santri_id ON public.munaqosah USING btree (santri_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_pengumuman_kelompok_tanggal ON public.pengumuman USING btree (kelompok_id, tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_pengurus_kelp_kelompok_id ON public.pengurus_kelp USING btree (kelompok_id);
CREATE INDEX IF NOT EXISTS idx_profiles_guru_id ON public.profiles USING btree (guru_id) WHERE ((guru_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_profiles_scope_kelompok_id ON public.profiles USING btree (scope_kelompok_id) WHERE ((scope_kelompok_id IS NOT NULL) AND (deleted_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_riwayat_jenjang_santri_id ON public.riwayat_jenjang USING btree (santri_id);
CREATE INDEX IF NOT EXISTS idx_santri_kelas_id ON public.santri USING btree (kelas_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_santri_kelompok_id ON public.santri USING btree (kelompok_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_siklus_generus_kelompok_id ON public.siklus_generus USING btree (kelompok_id);
CREATE INDEX IF NOT EXISTS idx_siklus_generus_santri_id ON public.siklus_generus USING btree (santri_id);

-- ---------------------------------------------------------------------
-- 5. TRIGGER
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_ppg_updated_at ON public.ppg;
CREATE TRIGGER trg_ppg_updated_at BEFORE UPDATE ON public.ppg FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_desa_updated_at ON public.desa;
CREATE TRIGGER trg_desa_updated_at BEFORE UPDATE ON public.desa FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kelompok_updated_at ON public.kelompok;
CREATE TRIGGER trg_kelompok_updated_at BEFORE UPDATE ON public.kelompok FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_guru_updated_at ON public.guru;
CREATE TRIGGER trg_guru_updated_at BEFORE UPDATE ON public.guru FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kelas_updated_at ON public.kelas;
CREATE TRIGGER trg_kelas_updated_at BEFORE UPDATE ON public.kelas FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_jadwal_kategori_hari_updated_at ON public.jadwal_kategori_hari;
CREATE TRIGGER trg_jadwal_kategori_hari_updated_at BEFORE UPDATE ON public.jadwal_kategori_hari FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_santri_updated_at ON public.santri;
CREATE TRIGGER trg_santri_updated_at BEFORE UPDATE ON public.santri FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pengurus_kelp_updated_at ON public.pengurus_kelp;
CREATE TRIGGER trg_pengurus_kelp_updated_at BEFORE UPDATE ON public.pengurus_kelp FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_absensi_updated_at ON public.absensi;
CREATE TRIGGER trg_absensi_updated_at BEFORE UPDATE ON public.absensi FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_periode_munaqosah_updated_at ON public.periode_munaqosah;
CREATE TRIGGER trg_periode_munaqosah_updated_at BEFORE UPDATE ON public.periode_munaqosah FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_munaqosah_updated_at ON public.munaqosah;
CREATE TRIGGER trg_munaqosah_updated_at BEFORE UPDATE ON public.munaqosah FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_konseling_updated_at ON public.konseling;
CREATE TRIGGER trg_konseling_updated_at BEFORE UPDATE ON public.konseling FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kurikulum_akhlaq_updated_at ON public.kurikulum_akhlaq;
CREATE TRIGGER trg_kurikulum_akhlaq_updated_at BEFORE UPDATE ON public.kurikulum_akhlaq FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kurikulum_prota_updated_at ON public.kurikulum_prota;
CREATE TRIGGER trg_kurikulum_prota_updated_at BEFORE UPDATE ON public.kurikulum_prota FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kurikulum_promes_updated_at ON public.kurikulum_promes;
CREATE TRIGGER trg_kurikulum_promes_updated_at BEFORE UPDATE ON public.kurikulum_promes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kurikulum_probul_updated_at ON public.kurikulum_probul;
CREATE TRIGGER trg_kurikulum_probul_updated_at BEFORE UPDATE ON public.kurikulum_probul FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kurikulum_probul_minggu_updated_at ON public.kurikulum_probul_minggu;
CREATE TRIGGER trg_kurikulum_probul_minggu_updated_at BEFORE UPDATE ON public.kurikulum_probul_minggu FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kurikulum_pencapaian_santri_updated_at ON public.kurikulum_pencapaian_santri;
CREATE TRIGGER trg_kurikulum_pencapaian_santri_updated_at BEFORE UPDATE ON public.kurikulum_pencapaian_santri FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_files_updated_at ON public.files;
CREATE TRIGGER trg_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_pengumuman_updated_at ON public.pengumuman;
CREATE TRIGGER trg_pengumuman_updated_at BEFORE UPDATE ON public.pengumuman FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_jurnal_kbm_updated_at ON public.jurnal_kbm;
CREATE TRIGGER trg_jurnal_kbm_updated_at BEFORE UPDATE ON public.jurnal_kbm FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_kop_surat_updated_at ON public.kop_surat;
CREATE TRIGGER trg_kop_surat_updated_at BEFORE UPDATE ON public.kop_surat FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_absensi_sync_kelompok_id ON public.absensi;
CREATE TRIGGER trg_absensi_sync_kelompok_id BEFORE INSERT OR UPDATE OF santri_id ON public.absensi FOR EACH ROW EXECUTE FUNCTION sync_absensi_kelompok_id();

-- ---------------------------------------------------------------------
-- 6. ENABLE ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
ALTER TABLE public.absensi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.akses_kelas_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guru ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guru_izin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jabatan_pengurus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_kategori_hari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jadwal_kategori_hari_aktif ENABLE ROW LEVEL SECURITY;
-- LEGACY: jadwal_kbm adalah duplikat kelas, warisan Apps Script.
-- Dipertahankan sesuai prinsip "tambah dulu, hapus paling akhir".
-- DROP hanya setelah kelas terbukti bekerja (punya policy + ter-seed).
-- Data: 8 baris operasional Petemon. Kolom hari/tanggal adalah dead data.
CREATE TABLE IF NOT EXISTS public.jadwal_kbm (
  id            bigint                   NOT NULL,
  kelompok_id   bigint                   NOT NULL,
  hari          text,
  keterangan    text,
  dibuat_oleh   bigint,
  dibuat_pada   date,
  tanggal       date,
  ruangan       text,
  kategori      text,
  jam_mulai     time without time zone,
  jam_selesai   time without time zone,
  santri_count  integer                  NOT NULL DEFAULT 0,
  kelas         text,
  guru_id       bigint,
  status        text,
  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  updated_at    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT jadwal_kbm_pkey PRIMARY KEY (id),
  CONSTRAINT jadwal_kbm_kelompok_id_fkey FOREIGN KEY (kelompok_id) REFERENCES public.kelompok(id),
  CONSTRAINT jadwal_kbm_guru_id_fkey FOREIGN KEY (guru_id) REFERENCES public.guru(id)
);

ALTER TABLE public.jadwal_kbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jurnal_kbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kategori_kbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kategori_pengumuman ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kelompok ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.konseling ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kop_surat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kop_surat_baris ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurikulum_akhlaq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurikulum_pencapaian_santri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurikulum_probul ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurikulum_probul_minggu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurikulum_promes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurikulum_prota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.munaqosah ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengumuman ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pengurus_kelp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periode_munaqosah ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_harian ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riwayat_jenjang ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.santri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siklus_generus ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 7. POLICY
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "absensi_delete_ppg_only" ON public.absensi;
CREATE POLICY "absensi_delete_ppg_only" ON public.absensi
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "absensi_insert_guru_admin" ON public.absensi;
CREATE POLICY "absensi_insert_guru_admin" ON public.absensi
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR (p.role = 'admin_desa'::text) OR (p.role = 'admin_kelompok'::text) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = ( SELECT santri.kelompok_id
           FROM santri
          WHERE (santri.id = absensi.santri_id)))))))));

DROP POLICY IF EXISTS "absensi_select_scoped" ON public.absensi;
CREATE POLICY "absensi_select_scoped" ON public.absensi
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = absensi.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = absensi.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = absensi.kelompok_id)))))));

DROP POLICY IF EXISTS "absensi_update_guru_admin" ON public.absensi;
CREATE POLICY "absensi_update_guru_admin" ON public.absensi
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = absensi.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = absensi.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = absensi.kelompok_id)))))));

DROP POLICY IF EXISTS "desa_read_authenticated" ON public.desa;
CREATE POLICY "desa_read_authenticated" ON public.desa
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "guru_delete_ppg_only" ON public.guru;
CREATE POLICY "guru_delete_ppg_only" ON public.guru
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "guru_insert_admin" ON public.guru;
CREATE POLICY "guru_insert_admin" ON public.guru
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR (p.role = 'admin_desa'::text) OR (p.role = 'admin_kelompok'::text))))));

DROP POLICY IF EXISTS "guru_select_scoped" ON public.guru;
CREATE POLICY "guru_select_scoped" ON public.guru
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = guru.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = guru.kelompok_id)) OR ((p.role = 'guru'::text) AND ((p.scope_kelompok_id = guru.kelompok_id) OR (p.guru_id = guru.id))))))));

DROP POLICY IF EXISTS "guru_update_admin" ON public.guru;
CREATE POLICY "guru_update_admin" ON public.guru
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = guru.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = guru.kelompok_id)))))));

DROP POLICY IF EXISTS "jadwal_kategori_hari_delete_ppg_only" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_delete_ppg_only" ON public.jadwal_kategori_hari
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "jadwal_kategori_hari_insert_admin_only" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_insert_admin_only" ON public.jadwal_kategori_hari
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "jadwal_kategori_hari_select_scoped" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_select_scoped" ON public.jadwal_kategori_hari
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jadwal_kategori_hari.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jadwal_kategori_hari.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = jadwal_kategori_hari.kelompok_id)))))));

DROP POLICY IF EXISTS "jadwal_kategori_hari_update_admin_only" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_update_admin_only" ON public.jadwal_kategori_hari
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "jadwal_kbm_delete_ppg_only" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_delete_ppg_only" ON public.jadwal_kbm
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "jadwal_kbm_insert_admin_only" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_insert_admin_only" ON public.jadwal_kbm
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "jadwal_kbm_select_scoped" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_select_scoped" ON public.jadwal_kbm
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jadwal_kbm.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jadwal_kbm.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = jadwal_kbm.kelompok_id)))))));

DROP POLICY IF EXISTS "jadwal_kbm_update_admin_only" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_update_admin_only" ON public.jadwal_kbm
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "kategori_kbm_read_authenticated" ON public.kategori_kbm;
CREATE POLICY "kategori_kbm_read_authenticated" ON public.kategori_kbm
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "kelas_delete_ppg_only" ON public.kelas;
CREATE POLICY "kelas_delete_ppg_only" ON public.kelas
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "kelas_insert_admin_only" ON public.kelas;
CREATE POLICY "kelas_insert_admin_only" ON public.kelas
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "kelas_select_scoped" ON public.kelas;
CREATE POLICY "kelas_select_scoped" ON public.kelas
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = kelas.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = kelas.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = kelas.kelompok_id)))))));

DROP POLICY IF EXISTS "kelas_update_admin_only" ON public.kelas;
CREATE POLICY "kelas_update_admin_only" ON public.kelas
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "kelompok_read_authenticated" ON public.kelompok;
CREATE POLICY "kelompok_read_authenticated" ON public.kelompok
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "kurikulum_probul_delete_ppg_only" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_delete_ppg_only" ON public.kurikulum_probul
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "kurikulum_probul_insert_admin_only" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_insert_admin_only" ON public.kurikulum_probul
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "kurikulum_probul_select_scoped" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_select_scoped" ON public.kurikulum_probul
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = kurikulum_probul.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = kurikulum_probul.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = kurikulum_probul.kelompok_id)))))));

DROP POLICY IF EXISTS "kurikulum_probul_update_admin_only" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_update_admin_only" ON public.kurikulum_probul
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "kurikulum_promes_delete_ppg_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_delete_ppg_only" ON public.kurikulum_promes
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "kurikulum_promes_insert_admin_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_insert_admin_only" ON public.kurikulum_promes
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "kurikulum_promes_select_scoped" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_select_scoped" ON public.kurikulum_promes
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = ( SELECT pr.kelompok_id
                   FROM kurikulum_prota pr
                  WHERE (pr.id = kurikulum_promes.prota_id)))))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = ( SELECT pr.kelompok_id
           FROM kurikulum_prota pr
          WHERE (pr.id = kurikulum_promes.prota_id)))) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = ( SELECT pr.kelompok_id
           FROM kurikulum_prota pr
          WHERE (pr.id = kurikulum_promes.prota_id)))))))));

DROP POLICY IF EXISTS "kurikulum_promes_update_admin_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_update_admin_only" ON public.kurikulum_promes
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "kurikulum_prota_delete_ppg_only" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_delete_ppg_only" ON public.kurikulum_prota
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "kurikulum_prota_insert_admin_only" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_insert_admin_only" ON public.kurikulum_prota
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "kurikulum_prota_select_scoped" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_select_scoped" ON public.kurikulum_prota
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = kurikulum_prota.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = kurikulum_prota.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = kurikulum_prota.kelompok_id)))))));

DROP POLICY IF EXISTS "kurikulum_prota_update_admin_only" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_update_admin_only" ON public.kurikulum_prota
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

DROP POLICY IF EXISTS "ppg_read_authenticated" ON public.ppg;
CREATE POLICY "ppg_read_authenticated" ON public.ppg
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((id = auth.uid()));

DROP POLICY IF EXISTS "santri_delete_ppg_only" ON public.santri;
CREATE POLICY "santri_delete_ppg_only" ON public.santri
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

DROP POLICY IF EXISTS "santri_insert_admin" ON public.santri;
CREATE POLICY "santri_insert_admin" ON public.santri
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR (p.role = 'admin_desa'::text) OR (p.role = 'admin_kelompok'::text))))));

DROP POLICY IF EXISTS "santri_select_scoped" ON public.santri;
CREATE POLICY "santri_select_scoped" ON public.santri
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = santri.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = santri.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = santri.kelompok_id)))))));

DROP POLICY IF EXISTS "santri_update_admin" ON public.santri;
CREATE POLICY "santri_update_admin" ON public.santri
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = santri.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = santri.kelompok_id)))))));

COMMIT;
