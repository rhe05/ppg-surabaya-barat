-- =====================================================================
-- 20260819090000_pendaftaran_akun.sql
--
-- Onboarding akun baru: user yang baru pertama masuk (lewat Google atau
-- email) memilih PERAN + KELOMPOK/DESA sendiri, lalu menunggu persetujuan
-- admin.
--
-- Kenapa permintaan, bukan langsung diberikan: kalau pilihan peran di layar
-- langsung ditulis ke profiles.role, siapa pun pemilik alamat Gmail bisa
-- memilih 'admin_ppg' dan seketika membaca/mengubah data seluruh 18
-- kelompok. Karena itu tabel di bawah TIDAK pernah memberi hak apa pun --
-- ia cuma menyimpan permintaan. Satu-satunya jalan hak benar-benar
-- berpindah ke profiles adalah RPC setujui_pendaftaran(), yang memeriksa
-- wewenang PENYETUJU di dalamnya.
--
-- Kenapa tabel terpisah, bukan kolom di profiles: chk_profiles_scope
-- memaksa (role IS NULL => semua scope_* NULL). Menitipkan pilihan
-- kelompok di profiles.scope_kelompok_id sebelum disetujui akan melanggar
-- constraint itu -- dan lebih buruk lagi, membuat "diminta" tidak bisa
-- dibedakan dari "sudah diberikan".
--
-- Isi:
--   1. kelompok.pendaftaran_terbuka  -- kelompok mana yang menerima pendaftar
--   2. enum status_pendaftaran + tabel pendaftaran_akun
--   3. trigger jaga_pendaftaran_akun() -- memaksa status awal & kelompok terbuka
--   4. 3 policy RLS
--   5. RPC setujui_pendaftaran() / tolak_pendaftaran()
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. kelompok.pendaftaran_terbuka
-- ---------------------------------------------------------------------
-- SENGAJA BUKAN memakai ulang status_aktif: 4 kelompok sudah berstatus
-- 'aktif' (Petemon, Bangun Rejo, Purwodadi, Dupak) karena datanya memang
-- hidup, sementara yang boleh menerima pendaftar mandiri untuk saat ini
-- hanya Petemon & Bangun Rejo. Dua pertanyaan berbeda -> dua kolom.
-- Membuka kelompok lain nanti = UPDATE satu baris, tanpa ubah kode.
ALTER TABLE public.kelompok
  ADD COLUMN IF NOT EXISTS pendaftaran_terbuka boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.kelompok.pendaftaran_terbuka IS
  'true = kelompok ini muncul di layar pendaftaran akun baru (/onboarding). Default false: kelompok baru TIDAK otomatis menerima pendaftar mandiri.';

UPDATE public.kelompok SET pendaftaran_terbuka = true
 WHERE nama IN ('Kelp Petemon', 'Kelp Bangun Rejo');

-- ---------------------------------------------------------------------
-- 2. Tabel pendaftaran_akun
-- ---------------------------------------------------------------------
DO $blok$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_pendaftaran') THEN
    CREATE TYPE public.status_pendaftaran AS ENUM ('menunggu', 'disetujui', 'ditolak');
  END IF;
END
$blok$;

-- id = auth.users.id, jadi satu orang punya TEPAT SATU permintaan. Ditolak
-- lalu mendaftar lagi = memperbarui baris yang sama (lihat policy update),
-- bukan menumpuk antrean baru yang harus ditinjau berulang.
CREATE TABLE IF NOT EXISTS public.pendaftaran_akun (
  id             uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nama_lengkap   text NOT NULL,
  peran_diminta  public.app_role NOT NULL,
  kelompok_id    bigint REFERENCES public.kelompok (id),
  desa_id        bigint REFERENCES public.desa (id),
  ppg_id         bigint REFERENCES public.ppg (id),
  status         public.status_pendaftaran NOT NULL DEFAULT 'menunggu',
  alasan_tolak   text,
  ditinjau_oleh  uuid REFERENCES public.profiles (id),
  ditinjau_pada  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- Cerminan chk_profiles_scope: bentuk permintaan harus SUDAH sah sebelum
  -- disetujui, supaya penyetuju tidak pernah bertemu permintaan yang
  -- mustahil dipindahkan ke profiles.
  CONSTRAINT chk_pendaftaran_scope CHECK (
    (peran_diminta = 'admin_ppg'
      AND ppg_id IS NOT NULL AND desa_id IS NULL AND kelompok_id IS NULL)
    OR
    (peran_diminta = 'admin_desa'
      AND desa_id IS NOT NULL AND ppg_id IS NULL AND kelompok_id IS NULL)
    OR
    (peran_diminta IN ('admin_kelompok', 'guru')
      AND kelompok_id IS NOT NULL AND ppg_id IS NULL AND desa_id IS NULL)
  ),
  CONSTRAINT chk_pendaftaran_nama CHECK (length(btrim(nama_lengkap)) >= 3)
);

COMMENT ON TABLE public.pendaftaran_akun IS
  'Permintaan peran dari user yang baru mendaftar. TIDAK memberi hak apa pun: hak baru berpindah ke profiles lewat RPC setujui_pendaftaran(). Satu baris per akun (id = auth.users.id).';

CREATE INDEX IF NOT EXISTS idx_pendaftaran_menunggu
  ON public.pendaftaran_akun (status, created_at) WHERE status = 'menunggu';

DROP TRIGGER IF EXISTS trg_pendaftaran_akun_updated_at ON public.pendaftaran_akun;
CREATE TRIGGER trg_pendaftaran_akun_updated_at
  BEFORE UPDATE ON public.pendaftaran_akun
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pendaftaran_akun ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.pendaftaran_akun TO authenticated;
REVOKE ALL ON TABLE public.pendaftaran_akun FROM anon;

-- ---------------------------------------------------------------------
-- 3. Trigger penjaga
-- ---------------------------------------------------------------------
-- Yang TIDAK bisa dijaga policy RLS sendirian: (a) status awal dan kolom
-- peninjauan harus bersih walau klien mengirimnya, (b) kelompok yang
-- diminta harus yang dibuka, (c) orang yang SUDAH punya peran tidak boleh
-- menaikkan dirinya lewat pintu ini.
--
-- RPC peninjau menandai dirinya lewat set_config lokal ('app.peninjauan_
-- pendaftaran'), supaya jalur sah bisa menulis status/ditinjau_* sementara
-- klien tidak. Penanda itu transaction-local (parameter ketiga true), jadi
-- tidak bocor ke request berikutnya di koneksi yang sama.
CREATE OR REPLACE FUNCTION public.jaga_pendaftaran_akun()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_peran_pemohon text;
  v_terbuka       boolean;
  v_dari_rpc      boolean := coalesce(current_setting('app.peninjauan_pendaftaran', true), '') = '1';
begin
  if v_dari_rpc then
    return new;
  end if;

  -- Pemohon tidak boleh menulis keputusan untuk dirinya sendiri.
  new.status        := 'menunggu';
  new.alasan_tolak  := null;
  new.ditinjau_oleh := null;
  new.ditinjau_pada := null;

  select role::text into v_peran_pemohon from profiles where id = new.id;
  if v_peran_pemohon is not null then
    raise exception 'Akun ini sudah punya peran (%). Perubahan peran dilakukan admin, bukan lewat pendaftaran.', v_peran_pemohon;
  end if;

  if new.kelompok_id is not null then
    select pendaftaran_terbuka into v_terbuka from kelompok where id = new.kelompok_id;
    if not coalesce(v_terbuka, false) then
      raise exception 'Kelompok ini belum dibuka untuk pendaftaran akun baru';
    end if;
  end if;

  -- Permintaan admin_desa hanya untuk desa yang punya kelompok terbuka.
  -- Tanpa ini, layar bisa dilewati dan orang meminta scope yang tidak
  -- pernah ditawarkan (mis. desa yang seluruh kelompoknya belum jalan).
  if new.desa_id is not null then
    if not exists (select 1 from kelompok where desa_id = new.desa_id and pendaftaran_terbuka) then
      raise exception 'Desa ini belum dibuka untuk pendaftaran akun baru';
    end if;
  end if;

  return new;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.jaga_pendaftaran_akun() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jaga_pendaftaran_akun ON public.pendaftaran_akun;
CREATE TRIGGER trg_jaga_pendaftaran_akun
  BEFORE INSERT OR UPDATE ON public.pendaftaran_akun
  FOR EACH ROW EXECUTE FUNCTION public.jaga_pendaftaran_akun();

-- ---------------------------------------------------------------------
-- 4. Policy
-- ---------------------------------------------------------------------
-- Pemohon: melihat & mengubah permintaannya sendiri selama belum disetujui.
DROP POLICY IF EXISTS "pendaftaran_self_insert" ON public.pendaftaran_akun;
CREATE POLICY "pendaftaran_self_insert" ON public.pendaftaran_akun
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "pendaftaran_self_update" ON public.pendaftaran_akun;
CREATE POLICY "pendaftaran_self_update" ON public.pendaftaran_akun
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (id = auth.uid() AND status <> 'disetujui')
  WITH CHECK (id = auth.uid());

-- Pembaca: pemohon sendiri, atau admin yang berwenang atas scope itu.
-- Admin kelompok sengaja hanya melihat permintaan 'guru' di kelompoknya --
-- permintaan admin_kelompok di kelompok yang sama bukan wewenangnya untuk
-- disetujui, jadi tidak perlu pula dilihatnya.
DROP POLICY IF EXISTS "pendaftaran_read_scoped" ON public.pendaftaran_akun;
CREATE POLICY "pendaftaran_read_scoped" ON public.pendaftaran_akun
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM auth_profile() p
      WHERE p.is_active AND (
        p.role = 'admin_ppg'
        OR (p.role = 'admin_desa' AND peran_diminta IN ('guru', 'admin_kelompok')
            AND p.scope_desa_id = COALESCE(
                  pendaftaran_akun.desa_id,
                  (SELECT k.desa_id FROM kelompok k WHERE k.id = pendaftaran_akun.kelompok_id)))
        OR (p.role = 'admin_kelompok' AND peran_diminta = 'guru'
            AND p.scope_kelompok_id = pendaftaran_akun.kelompok_id)
      )
    )
  );

-- ---------------------------------------------------------------------
-- 5. RPC setujui_pendaftaran() / tolak_pendaftaran()
-- ---------------------------------------------------------------------
-- SECURITY DEFINER karena keduanya menulis ke profiles, yang TIDAK punya
-- policy UPDATE sama sekali (dan memang tidak boleh punya -- profiles.role
-- adalah sumber seluruh RLS app ini). Wewenang penyetuju diperiksa di
-- dalam fungsi; tanpa pemeriksaan itu fungsi ini justru jadi pintu
-- belakang yang lebih longgar daripada policy mana pun.
CREATE OR REPLACE FUNCTION public.setujui_pendaftaran(p_id uuid, p_guru_id bigint DEFAULT NULL)
 RETURNS public.pendaftaran_akun
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p           pendaftaran_akun;
  v_penyetuju   record;
  v_desa_target bigint;
begin
  select * into v_p from pendaftaran_akun where id = p_id for update;
  if not found then
    raise exception 'Pendaftaran tidak ditemukan';
  end if;
  if v_p.status = 'disetujui' then
    raise exception 'Pendaftaran ini sudah disetujui sebelumnya';
  end if;

  select * into v_penyetuju from auth_profile();
  if v_penyetuju.role is null or not v_penyetuju.is_active then
    raise exception 'Anda tidak berwenang menyetujui pendaftaran';
  end if;

  v_desa_target := coalesce(v_p.desa_id, (select k.desa_id from kelompok k where k.id = v_p.kelompok_id));

  if v_penyetuju.role = 'admin_ppg' then
    null; -- boleh semua peran
  elsif v_penyetuju.role = 'admin_desa'
        and v_p.peran_diminta in ('guru', 'admin_kelompok')
        and v_penyetuju.scope_desa_id = v_desa_target then
    null;
  elsif v_penyetuju.role = 'admin_kelompok'
        and v_p.peran_diminta = 'guru'
        and v_penyetuju.scope_kelompok_id = v_p.kelompok_id then
    null;
  else
    raise exception 'Anda tidak berwenang menyetujui permintaan peran % pada scope tersebut', v_p.peran_diminta;
  end if;

  update profiles set
    role              = v_p.peran_diminta,
    display_name      = coalesce(display_name, btrim(v_p.nama_lengkap)),
    guru_id           = coalesce(p_guru_id, guru_id),
    scope_ppg_id      = v_p.ppg_id,
    scope_desa_id     = v_p.desa_id,
    scope_kelompok_id = v_p.kelompok_id,
    is_active         = true,
    updated_at        = now()
  where id = p_id;

  perform set_config('app.peninjauan_pendaftaran', '1', true);
  update pendaftaran_akun set
    status        = 'disetujui',
    alasan_tolak  = null,
    ditinjau_oleh = auth.uid(),
    ditinjau_pada = now()
  where id = p_id
  returning * into v_p;
  perform set_config('app.peninjauan_pendaftaran', '0', true);

  return v_p;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tolak_pendaftaran(p_id uuid, p_alasan text DEFAULT NULL)
 RETURNS public.pendaftaran_akun
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_p           pendaftaran_akun;
  v_penyetuju   record;
  v_desa_target bigint;
begin
  select * into v_p from pendaftaran_akun where id = p_id for update;
  if not found then
    raise exception 'Pendaftaran tidak ditemukan';
  end if;

  select * into v_penyetuju from auth_profile();
  if v_penyetuju.role is null or not v_penyetuju.is_active then
    raise exception 'Anda tidak berwenang meninjau pendaftaran';
  end if;

  v_desa_target := coalesce(v_p.desa_id, (select k.desa_id from kelompok k where k.id = v_p.kelompok_id));

  if v_penyetuju.role = 'admin_ppg' then
    null;
  elsif v_penyetuju.role = 'admin_desa'
        and v_p.peran_diminta in ('guru', 'admin_kelompok')
        and v_penyetuju.scope_desa_id = v_desa_target then
    null;
  elsif v_penyetuju.role = 'admin_kelompok'
        and v_p.peran_diminta = 'guru'
        and v_penyetuju.scope_kelompok_id = v_p.kelompok_id then
    null;
  else
    raise exception 'Anda tidak berwenang meninjau permintaan ini';
  end if;

  perform set_config('app.peninjauan_pendaftaran', '1', true);
  update pendaftaran_akun set
    status        = 'ditolak',
    alasan_tolak  = nullif(btrim(coalesce(p_alasan, '')), ''),
    ditinjau_oleh = auth.uid(),
    ditinjau_pada = now()
  where id = p_id
  returning * into v_p;
  perform set_config('app.peninjauan_pendaftaran', '0', true);

  return v_p;
end;
$function$;

-- Pola wajib proyek ini: EXECUTE untuk PUBLIC menembus GRANT ke
-- authenticated, sehingga anon ikut bisa memanggil kalau tidak dicabut
-- eksplisit.
REVOKE EXECUTE ON FUNCTION public.setujui_pendaftaran(uuid, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tolak_pendaftaran(uuid, text)     FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.setujui_pendaftaran(uuid, bigint) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.tolak_pendaftaran(uuid, text)     TO authenticated;

COMMIT;
