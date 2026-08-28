-- =====================================================================
-- 20260828180000_guru_izin_pada_tanggal.sql
--
-- Integrasi Guru Izin -> Pengumuman Jadwal KBM (permintaan owner
-- 2026-08-28): begitu seorang guru mengajukan izin lewat aplikasi, sesi
-- miliknya di komposer pengumuman otomatis ditandai "Diganti", tidak lagi
-- perlu diingat & diklik manual oleh penyusun pengumuman.
--
-- MASALAHNYA: policy `guru_izin_select_scoped` membatasi peran 'guru'
-- hanya boleh membaca barisnya SENDIRI (p.guru_id = guru_izin.guru_id).
-- Padahal penyusun pengumuman umumnya guru, dan yang perlu dia ketahui
-- justru izin REKANNYA. Melebarkan policy SELECT itu bukan pilihan:
-- barisnya memuat `alasan_kategori`/`alasan_detail` yang bersifat pribadi
-- (lihat komentar di app/guru-saya/page.tsx -- alasan izin sengaja tidak
-- pernah disodorkan ke guru lain).
--
-- Karena itu jalurnya fungsi SECURITY DEFINER yang mengembalikan
-- SEMATA-MATA `guru_id`: cukup untuk menandai sesi siapa yang perlu
-- pengganti, tanpa membocorkan alasan, jenis, maupun rentang tanggalnya.
-- Pemanggil tetap wajib berada dalam lingkup kelompok yang diminta --
-- dicek di dalam fungsi, bukan diandalkan ke pemanggil.
--
-- Idempoten.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.guru_izin_pada_tanggal(
  p_kelompok_id bigint,
  p_tanggal     date
)
RETURNS TABLE (guru_id bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT gi.guru_id
    FROM public.guru_izin gi
   WHERE gi.kelompok_id = p_kelompok_id
     AND p_tanggal BETWEEN gi.tanggal_mulai AND gi.tanggal_selesai
     AND EXISTS (
       SELECT 1
         FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
        WHERE p.is_active AND (
              p.role = 'admin_ppg'
           OR (p.role = 'admin_desa'
               AND p.scope_desa_id = (SELECT k.desa_id FROM public.kelompok k WHERE k.id = p_kelompok_id))
           OR (p.role IN ('admin_kelompok', 'guru')
               AND p.scope_kelompok_id = p_kelompok_id)))
$$;

COMMENT ON FUNCTION public.guru_izin_pada_tanggal(bigint, date) IS
  'Daftar guru_id yang sedang izin pada satu tanggal di satu kelompok. SENGAJA hanya mengembalikan guru_id -- alasan/jenis/rentang izin tetap tertutup bagi guru lain. Dipakai komposer Pengumuman Jadwal KBM utk menandai sesi "Diganti" otomatis.';

-- Wajib: tanpa REVOKE ini peran `anon` ikut bisa memanggil.
REVOKE ALL ON FUNCTION public.guru_izin_pada_tanggal(bigint, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guru_izin_pada_tanggal(bigint, date) TO authenticated;

COMMIT;
