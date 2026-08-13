-- =====================================================================
-- Migration 003 : RLS Policies, Helper Functions & Triggers
-- Project      : PPG Surabaya Barat (fnhqtkqswxsqmjxynldg)
-- Dibuat       : 13 Agustus 2026
--
-- Sumber: dump pg_policies + pg_get_functiondef dari live DB.
-- Tujuan: 37 policy + 7 function yang selama ini HANYA ada sebagai SQL
--         ad-hoc di Dashboard, supaya `supabase db push` ke project baru
--         menghasilkan DB yang benar-benar terkunci, bukan terbuka diam-diam.
--
-- Idempoten: aman dijalankan berulang.
--
-- CATATAN DUPLIKASI: handle_new_auth_user, set_updated_at, dan
-- sync_absensi_kelompok_id kemungkinan besar SUDAH terdefinisi di
-- migrasi 002 (karena 26 trigger di sana memanggilnya). Di sini tetap
-- disertakan dengan CREATE OR REPLACE -- tidak error, dan membuat
-- definisi live jadi sumber kebenaran. Yang benar-benar hilang dari 002
-- hanya: auth_profile, rls_auto_enable, pg_list_public_tables,
-- pg_table_columns.
-- Urutan WAJIB: function -> trigger -> policy -> grant.
--   (32 dari 37 policy memanggil auth_profile(); kalau policy dibuat lebih
--    dulu, push gagal dengan 'function auth_profile() does not exist')
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- BAGIAN 1 : HELPER FUNCTIONS (7)
-- ---------------------------------------------------------------------

-- [1.1] auth_profile()
--   FONDASI SELURUH RLS. Dipanggil 32 policy. SECURITY DEFINER agar bisa
--   membaca profiles tanpa terjegal policy profiles itu sendiri (rekursi).
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

-- [1.2] handle_new_auth_user()
--   Dipakai trigger di auth.users. Tanpa ini, user baru daftar TIDAK punya
--   baris profiles -> auth_profile() balik kosong -> semua RLS menolak dia.
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

-- [1.3] set_updated_at()
--   Trigger BEFORE UPDATE, mengisi kolom updated_at.
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- [1.4] sync_absensi_kelompok_id()
--   Trigger, menjaga absensi.kelompok_id sinkron dengan santri.kelompok_id.
--   Penting: policy absensi_select_scoped mengandalkan kolom ini.
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

-- [1.5] rls_auto_enable()
--   EVENT TRIGGER (bukan trigger tabel). Otomatis ENABLE RLS pada tabel baru.
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

-- [1.6] pg_list_public_tables()
--   Utilitas introspeksi (dipakai script migrasi/ETL).
CREATE OR REPLACE FUNCTION public.pg_list_public_tables()
 RETURNS TABLE(table_name text)
 LANGUAGE sql
 STABLE
AS $function$
  select table_name from information_schema.tables
  where table_schema = 'public' order by table_name;
$function$;

-- [1.7] pg_table_columns()
--   Utilitas introspeksi (dipakai script migrasi/ETL).
CREATE OR REPLACE FUNCTION public.pg_table_columns(p_table_name text)
 RETURNS TABLE(column_name text, data_type text)
 LANGUAGE sql
 STABLE
AS $function$
  select column_name, data_type from information_schema.columns
  where table_schema = 'public' and table_name = p_table_name
  order by ordinal_position;
$function$;

-- ---------------------------------------------------------------------
-- BAGIAN 2 : EVENT TRIGGER
-- ---------------------------------------------------------------------
-- TERVERIFIKASI 13 Agt 2026 lewat pg_trigger + pg_event_trigger:
--
--   26 trigger biasa SUDAH ADA di migrasi 002, identik 26/26 dengan live.
--   handle_new_auth_user, set_updated_at, sync_absensi_kelompok_id
--   semuanya sudah terikat penuh di sana. JANGAN salin ke sini --
--   db push akan gagal dengan "trigger already exists".
--
--   Dari 7 event trigger di live, 6 milik platform Supabase (schema
--   extensions, owner supabase_admin): pgrst_ddl_watch, pgrst_drop_watch,
--   issue_graphql_placeholder, issue_pg_cron_access, issue_pg_net_access,
--   issue_pg_graphql_access. Dikelola Supabase, JANGAN dimasukkan.
--
--   Sisa satu -- dan hanya inilah gap yang sebenarnya.

DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  EXECUTE FUNCTION public.rls_auto_enable();

-- Catatan: CREATE EVENT TRIGGER butuh hak superuser/owner. Di Supabase,
-- role `postgres` memenuhi ini dan itulah role yang dipakai db push.
-- Kalau statement ini gagal, JANGAN dilewati: tanpa ensure_rls, tabel
-- yang dibuat setelah ini lahir TANPA RLS -- persis lubang yang sedang
-- kita tutup, dan tidak ada error yang muncul saat itu terjadi.

-- BAGIAN 3 : ROW LEVEL SECURITY POLICIES (37)
-- ---------------------------------------------------------------------

-- [3.1] Tabel: absensi  (4 policy)
ALTER TABLE public.absensi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "absensi_delete_ppg_only" ON public.absensi;
CREATE POLICY "absensi_delete_ppg_only" ON public.absensi AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));
DROP POLICY IF EXISTS "absensi_insert_guru_admin" ON public.absensi;
CREATE POLICY "absensi_insert_guru_admin" ON public.absensi AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR (p.role = 'admin_desa'::text) OR (p.role = 'admin_kelompok'::text) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = ( SELECT santri.kelompok_id
           FROM santri
          WHERE (santri.id = absensi.santri_id)))))))));
DROP POLICY IF EXISTS "absensi_select_scoped" ON public.absensi;
CREATE POLICY "absensi_select_scoped" ON public.absensi AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = absensi.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = absensi.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = absensi.kelompok_id)))))));
DROP POLICY IF EXISTS "absensi_update_guru_admin" ON public.absensi;
CREATE POLICY "absensi_update_guru_admin" ON public.absensi AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = absensi.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = absensi.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = absensi.kelompok_id)))))));

-- [3.2] Tabel: desa  (1 policy)
ALTER TABLE public.desa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "desa_read_authenticated" ON public.desa;
CREATE POLICY "desa_read_authenticated" ON public.desa AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- [3.3] Tabel: guru  (4 policy)
ALTER TABLE public.guru ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "guru_delete_ppg_only" ON public.guru;
CREATE POLICY "guru_delete_ppg_only" ON public.guru AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));
DROP POLICY IF EXISTS "guru_insert_admin" ON public.guru;
CREATE POLICY "guru_insert_admin" ON public.guru AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR (p.role = 'admin_desa'::text) OR (p.role = 'admin_kelompok'::text))))));
DROP POLICY IF EXISTS "guru_select_scoped" ON public.guru;
CREATE POLICY "guru_select_scoped" ON public.guru AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = guru.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = guru.kelompok_id)) OR ((p.role = 'guru'::text) AND ((p.scope_kelompok_id = guru.kelompok_id) OR (p.guru_id = guru.id))))))));
DROP POLICY IF EXISTS "guru_update_admin" ON public.guru;
CREATE POLICY "guru_update_admin" ON public.guru AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = guru.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = guru.kelompok_id)))))));

-- [3.4] Tabel: jadwal_kategori_hari  (4 policy)
ALTER TABLE public.jadwal_kategori_hari ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jadwal_kategori_hari_delete_ppg_only" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_delete_ppg_only" ON public.jadwal_kategori_hari AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));
DROP POLICY IF EXISTS "jadwal_kategori_hari_insert_admin_only" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_insert_admin_only" ON public.jadwal_kategori_hari AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));
DROP POLICY IF EXISTS "jadwal_kategori_hari_select_scoped" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_select_scoped" ON public.jadwal_kategori_hari AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jadwal_kategori_hari.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jadwal_kategori_hari.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = jadwal_kategori_hari.kelompok_id)))))));
DROP POLICY IF EXISTS "jadwal_kategori_hari_update_admin_only" ON public.jadwal_kategori_hari;
CREATE POLICY "jadwal_kategori_hari_update_admin_only" ON public.jadwal_kategori_hari AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

-- [3.5] Tabel: jadwal_kbm  (4 policy)
ALTER TABLE public.jadwal_kbm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jadwal_kbm_delete_ppg_only" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_delete_ppg_only" ON public.jadwal_kbm AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));
DROP POLICY IF EXISTS "jadwal_kbm_insert_admin_only" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_insert_admin_only" ON public.jadwal_kbm AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));
DROP POLICY IF EXISTS "jadwal_kbm_select_scoped" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_select_scoped" ON public.jadwal_kbm AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = jadwal_kbm.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jadwal_kbm.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = jadwal_kbm.kelompok_id)))))));
DROP POLICY IF EXISTS "jadwal_kbm_update_admin_only" ON public.jadwal_kbm;
CREATE POLICY "jadwal_kbm_update_admin_only" ON public.jadwal_kbm AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

-- [3.6] Tabel: kategori_kbm  (1 policy)
--   Tabel lookup: read-only untuk semua user terautentikasi. Tidak perlu
--   scoping karena isinya referensi statis (tidak ada kolom kelompok_id/
--   desa_id/ppg_id), sama seperti desa/kelompok/ppg di atas-bawah.
ALTER TABLE public.kategori_kbm ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kategori_kbm_read_authenticated" ON public.kategori_kbm;
CREATE POLICY "kategori_kbm_read_authenticated" ON public.kategori_kbm AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- [3.7] Tabel: kelompok  (1 policy)
ALTER TABLE public.kelompok ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kelompok_read_authenticated" ON public.kelompok;
CREATE POLICY "kelompok_read_authenticated" ON public.kelompok AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- [3.8] Tabel: kurikulum_probul  (4 policy)
ALTER TABLE public.kurikulum_probul ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kurikulum_probul_delete_ppg_only" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_delete_ppg_only" ON public.kurikulum_probul AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));
DROP POLICY IF EXISTS "kurikulum_probul_insert_admin_only" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_insert_admin_only" ON public.kurikulum_probul AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));
DROP POLICY IF EXISTS "kurikulum_probul_select_scoped" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_select_scoped" ON public.kurikulum_probul AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = kurikulum_probul.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = kurikulum_probul.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = kurikulum_probul.kelompok_id)))))));
DROP POLICY IF EXISTS "kurikulum_probul_update_admin_only" ON public.kurikulum_probul;
CREATE POLICY "kurikulum_probul_update_admin_only" ON public.kurikulum_probul AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

-- [3.9] Tabel: kurikulum_promes  (4 policy)
ALTER TABLE public.kurikulum_promes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kurikulum_promes_delete_ppg_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_delete_ppg_only" ON public.kurikulum_promes AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));
DROP POLICY IF EXISTS "kurikulum_promes_insert_admin_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_insert_admin_only" ON public.kurikulum_promes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));
DROP POLICY IF EXISTS "kurikulum_promes_select_scoped" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_select_scoped" ON public.kurikulum_promes AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = kurikulum_promes.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = kurikulum_promes.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = kurikulum_promes.kelompok_id)))))));
DROP POLICY IF EXISTS "kurikulum_promes_update_admin_only" ON public.kurikulum_promes;
CREATE POLICY "kurikulum_promes_update_admin_only" ON public.kurikulum_promes AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

-- [3.10] Tabel: kurikulum_prota  (4 policy)
ALTER TABLE public.kurikulum_prota ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kurikulum_prota_delete_ppg_only" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_delete_ppg_only" ON public.kurikulum_prota AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));
DROP POLICY IF EXISTS "kurikulum_prota_insert_admin_only" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_insert_admin_only" ON public.kurikulum_prota AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));
DROP POLICY IF EXISTS "kurikulum_prota_select_scoped" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_select_scoped" ON public.kurikulum_prota AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = kurikulum_prota.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = kurikulum_prota.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = kurikulum_prota.kelompok_id)))))));
DROP POLICY IF EXISTS "kurikulum_prota_update_admin_only" ON public.kurikulum_prota;
CREATE POLICY "kurikulum_prota_update_admin_only" ON public.kurikulum_prota AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = ANY (ARRAY['admin_ppg'::text, 'admin_desa'::text, 'admin_kelompok'::text]))))));

-- [3.11] Tabel: ppg  (1 policy)
ALTER TABLE public.ppg ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ppg_read_authenticated" ON public.ppg;
CREATE POLICY "ppg_read_authenticated" ON public.ppg AS PERMISSIVE FOR SELECT TO authenticated USING (true);

-- [3.12] Tabel: profiles  (1 policy)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_self_read" ON public.profiles;
CREATE POLICY "profiles_self_read" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((id = auth.uid()));

-- [3.13] Tabel: santri  (4 policy)
ALTER TABLE public.santri ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "santri_delete_ppg_only" ON public.santri;
CREATE POLICY "santri_delete_ppg_only" ON public.santri AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));
DROP POLICY IF EXISTS "santri_insert_admin" ON public.santri;
CREATE POLICY "santri_insert_admin" ON public.santri AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR (p.role = 'admin_desa'::text) OR (p.role = 'admin_kelompok'::text))))));
DROP POLICY IF EXISTS "santri_select_scoped" ON public.santri;
CREATE POLICY "santri_select_scoped" ON public.santri AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = santri.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = santri.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = santri.kelompok_id)))))));
DROP POLICY IF EXISTS "santri_update_admin" ON public.santri;
CREATE POLICY "santri_update_admin" ON public.santri AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = santri.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = santri.kelompok_id)))))));

-- ---------------------------------------------------------------------
-- BAGIAN 4 : GRANTS
-- ---------------------------------------------------------------------
-- Policy menyaring BARIS; GRANT menentukan boleh menyentuh TABEL atau tidak.
-- Keduanya harus ada. Tanpa GRANT, user sah pun kena 'permission denied'.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

COMMIT;

-- =====================================================================
-- VERIFIKASI (jalankan setelah push, harus cocok):
--   SELECT count(*) FROM pg_policies WHERE schemaname='public';  -- 37
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public';                                  -- 7
--   SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal;      -- 26
--   SELECT evtname FROM pg_event_trigger e JOIN pg_proc p
--     ON p.oid=e.evtfoid WHERE p.pronamespace='public'::regnamespace;
--                                                                -- ensure_rls
-- =====================================================================