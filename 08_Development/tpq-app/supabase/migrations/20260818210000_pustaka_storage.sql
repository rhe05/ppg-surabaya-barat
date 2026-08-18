-- =====================================================================
-- 20260818210000_pustaka_storage.sql
--
-- Fondasi untuk Pusat Unduhan (padanan Modul_MaintainPustakUnduhan.gs).
-- Dua lapis: bucket Supabase Storage untuk isi berkasnya, dan tabel
-- `public.files` untuk katalognya (judul, kategori, deskripsi, penghitung
-- unduhan).
--
-- KEPUTUSAN PEMILIK (18 Agt 2026), bukan tafsiran:
--   bucket           : `pustaka`
--   batas ukuran     : 10 MB per berkas
--   boleh mengunggah : admin (ppg/desa/kelompok) DAN guru
--   akses unduh      : PUBLIK — siapa pun yang punya tautan bisa mengunduh,
--                      tanpa perlu login dan tanpa tautan kedaluwarsa.
--
-- ⚠️ Butir terakhir BERBEDA dari tabel lain di app ini yang semuanya
-- ber-RLS ketat. Konsekuensinya perlu disadari: tautan berkas di bucket ini
-- bisa dibagikan ke siapa saja dan tetap terbuka selamanya, termasuk kalau
-- bocor ke luar organisasi. Jadi bucket ini HANYA untuk materi yang memang
-- boleh tersebar (modul, soal latihan, pedoman) — jangan dipakai untuk
-- dokumen berisi data pribadi santri.
--
-- ⚠️ Butir "guru boleh mengunggah" juga BERBEDA dari app lama, yang
-- menyebut guru "view-only access" di kepala modulnya. Ini permintaan
-- eksplisit pemilik, bukan kelalaian.
--
-- Penghitung unduhan dinaikkan lewat RPC, bukan UPDATE langsung: kalau
-- tabel `files` dibuka untuk UPDATE oleh semua pengunduh, mereka juga bisa
-- mengubah judul/kategori/URL berkas orang lain.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ── Bucket ───────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pustaka', 'pustaka', true, 10485760)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit;

-- ── Isi berkas (storage.objects) ─────────────────────────────────────
-- Membaca: dibiarkan terbuka sesuai keputusan "publik". Bucket publik
-- sudah menyajikan berkas lewat URL tanpa policy, jadi policy SELECT ini
-- hanya membuat DAFTAR isinya bisa dibaca aplikasi.
DROP POLICY IF EXISTS "pustaka_baca_publik" ON storage.objects;
CREATE POLICY "pustaka_baca_publik" ON storage.objects
  AS PERMISSIVE FOR SELECT TO public
  USING (bucket_id = 'pustaka');

-- Mengunggah/menghapus: admin + guru yang aktif.
DROP POLICY IF EXISTS "pustaka_tulis_admin_guru" ON storage.objects;
CREATE POLICY "pustaka_tulis_admin_guru" ON storage.objects
  AS PERMISSIVE FOR ALL TO public
  USING (bucket_id = 'pustaka' AND EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role IN ('admin_ppg', 'admin_desa', 'admin_kelompok', 'guru')))
  WITH CHECK (bucket_id = 'pustaka' AND EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role IN ('admin_ppg', 'admin_desa', 'admin_kelompok', 'guru')));

-- ── Katalog (public.files) ───────────────────────────────────────────
DROP POLICY IF EXISTS "files_select_semua" ON public.files;
CREATE POLICY "files_select_semua" ON public.files
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active));

DROP POLICY IF EXISTS "files_insert_admin_guru" ON public.files;
CREATE POLICY "files_insert_admin_guru" ON public.files
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND p.role IN ('admin_ppg', 'admin_desa', 'admin_kelompok', 'guru')));

-- Mengubah & menghapus katalog: pengunggahnya sendiri atau admin_ppg.
-- Guru boleh menambah, tapi tidak boleh merapikan/menghapus entri orang
-- lain — pola yang sama dengan konseling.
DROP POLICY IF EXISTS "files_update_pengunggah_atau_ppg" ON public.files;
CREATE POLICY "files_update_pengunggah_atau_ppg" ON public.files
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (p.role = 'admin_ppg' OR files.dibuat_oleh = auth.uid())));

DROP POLICY IF EXISTS "files_delete_pengunggah_atau_ppg" ON public.files;
CREATE POLICY "files_delete_pengunggah_atau_ppg" ON public.files
  AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (p.role = 'admin_ppg' OR files.dibuat_oleh = auth.uid())));

-- ── Penghitung unduhan ───────────────────────────────────────────────
-- SECURITY DEFINER karena pengunduh biasa TIDAK punya hak UPDATE pada
-- baris orang lain — dan memang tidak boleh diberi, kalau tidak mereka bisa
-- mengubah judul & URL berkas. Fungsi ini hanya menaikkan satu kolom
-- angka, tidak menerima nilai apa pun selain id.
CREATE OR REPLACE FUNCTION public.naikkan_unduhan(p_file_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.files SET download_count = download_count + 1 WHERE id = p_file_id;
END
$$;

REVOKE EXECUTE ON FUNCTION public.naikkan_unduhan(bigint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.naikkan_unduhan(bigint) TO authenticated;

COMMIT;
