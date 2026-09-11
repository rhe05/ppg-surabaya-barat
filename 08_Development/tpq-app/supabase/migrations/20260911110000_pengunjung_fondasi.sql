-- =====================================================================
-- 20260911110000_pengunjung_fondasi.sql
--
-- Fitur "Pengunjung" -- LANGKAH 2 dari 2 (jalankan SETELAH
-- 20260911100000_app_role_pengunjung.sql commit).
--
-- Alur yang dituju: admin_ppg membuat SATU link
-- (/pengunjung/<token>, berlaku 30 hari). Siapa pun yang membuka link
-- itu cukup "Masuk dengan Google" (akun Google APA SAJA, tidak perlu
-- didaftarkan lebih dulu) -> otomatis jadi role `pengunjung`, read-only,
-- terkunci ke SATU kelompok contoh (data fiktif, bukan data jamaah/
-- santri sungguhan). RPC klaim + kebijakan RLS per-tabel menyusul di
-- migrasi berikutnya, setelah fondasi ini dikonfirmasi jalan -- diikuti
-- "Formula Kerja AI" repo ini: migrasi bertahap, bukan satu berkas raksasa.
--
-- Isi berkas ini:
--   1. chk_profiles_scope: 'pengunjung' masuk cabang kelompok-scoped
--      (pola sama ERROR_LOG #41 saat 'penerobos'/'ketua_mudai' ditambah).
--   2. kelompok.is_demo -- kelompok contoh disembunyikan dari navigasi
--      admin sungguhan (frontend menambah `.eq('is_demo', false)` di
--      query daftar kelompok admin_ppg/admin_desa).
--   3. Desa + Kelompok demo (kosong, data contoh menyusul terpisah).
--   4. Tabel `pengunjung_akses` -- token + masa berlaku 30 hari, CRUD
--      admin_ppg saja.
--   5. profiles.pengunjung_akses_id -- tautan baris pengunjung ke token
--      yang mengklaimnya; dipakai kebijakan RLS demo utk cek kadaluwarsa
--      TANPA mengubah signature auth_profile() (yang dipakai puluhan
--      kebijakan lain -- mengubah returns-nya berarti mengedit semuanya).
--   6. RPC publik `cek_akses_pengunjung(token)` -- dipanggil halaman
--      /pengunjung/[token] SEBELUM login, jadi wajib bisa dieksekusi
--      `anon`. Cuma balikin validitas + masa berlaku, TIDAK expose
--      kolom lain.
--
-- BELUM di berkas ini (menyusul): RPC klaim (upsert profiles saat user
-- baru selesai Google OAuth), kebijakan SELECT `pengunjung` di tabel
-- guru/santri/kelas/jurnal_materi/jamaah/sub_kelp/dst (dibatasi
-- kelompok_id = kelompok demo), layar admin_ppg "Akses Pengunjung",
-- halaman publik /pengunjung/[token], data contoh (santri/guru/jamaah
-- fiktif). Idempoten.
-- =====================================================================

BEGIN;

-- 1) chk_profiles_scope
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS chk_profiles_scope;
ALTER TABLE public.profiles ADD CONSTRAINT chk_profiles_scope CHECK (
  ((role IS NULL) AND (scope_ppg_id IS NULL) AND (scope_desa_id IS NULL) AND (scope_kelompok_id IS NULL))
  OR ((role = 'admin_ppg'::app_role) AND (scope_ppg_id IS NOT NULL) AND (scope_desa_id IS NULL) AND (scope_kelompok_id IS NULL))
  OR ((role = 'admin_desa'::app_role) AND (scope_desa_id IS NOT NULL) AND (scope_ppg_id IS NULL) AND (scope_kelompok_id IS NULL))
  OR ((role = ANY (ARRAY[
        'admin_kelompok'::app_role, 'guru'::app_role, 'penerobos'::app_role,
        'ketua_mudai'::app_role, 'pengunjung'::app_role
      ]))
      AND (scope_kelompok_id IS NOT NULL) AND (scope_ppg_id IS NULL) AND (scope_desa_id IS NULL))
);

-- 2) kelompok.is_demo + desa.is_demo -- disembunyikan dari navigasi admin
--    sungguhan (frontend menambah `.eq('is_demo', false)` di query daftar).
ALTER TABLE public.kelompok ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.desa ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- 3) Desa + Kelompok demo
INSERT INTO public.desa (ppg_id, nama, is_demo)
SELECT 1, 'Demo Pengunjung', true
WHERE NOT EXISTS (SELECT 1 FROM public.desa WHERE nama = 'Demo Pengunjung');

INSERT INTO public.kelompok (desa_id, nama, status_aktif, is_demo)
SELECT d.id, 'Kelp Demo Pengunjung', 'aktif', true
FROM public.desa d
WHERE d.nama = 'Demo Pengunjung'
  AND NOT EXISTS (SELECT 1 FROM public.kelompok WHERE nama = 'Kelp Demo Pengunjung');

-- 4) Token akses Pengunjung
CREATE TABLE IF NOT EXISTS public.pengunjung_akses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token text NOT NULL UNIQUE,
  keterangan text,
  dibuat_oleh uuid REFERENCES public.profiles(id),
  dibuat_pada timestamptz NOT NULL DEFAULT now(),
  berlaku_sampai timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  dicabut boolean NOT NULL DEFAULT false
);

ALTER TABLE public.pengunjung_akses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pengunjung_akses_admin_ppg" ON public.pengunjung_akses;
CREATE POLICY "pengunjung_akses_admin_ppg" ON public.pengunjung_akses
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND p.role = 'admin_ppg'::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND p.role = 'admin_ppg'::text
  ));

REVOKE ALL ON public.pengunjung_akses FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.pengunjung_akses TO authenticated;

-- 5) profiles.pengunjung_akses_id
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pengunjung_akses_id bigint REFERENCES public.pengunjung_akses(id);

-- 6) RPC publik validasi token (TANPA login) -- tidak expose kolom lain
CREATE OR REPLACE FUNCTION public.cek_akses_pengunjung(p_token text)
RETURNS TABLE(valid boolean, berlaku_sampai timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT (pa.id IS NOT NULL AND NOT pa.dicabut AND pa.berlaku_sampai > now()), pa.berlaku_sampai
  FROM public.pengunjung_akses pa
  WHERE pa.token = p_token;
$$;

REVOKE ALL ON FUNCTION public.cek_akses_pengunjung(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cek_akses_pengunjung(text) TO anon, authenticated;

COMMIT;
