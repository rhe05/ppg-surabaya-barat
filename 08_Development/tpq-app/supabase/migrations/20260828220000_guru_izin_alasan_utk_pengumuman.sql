-- =====================================================================
-- 20260828220000_guru_izin_alasan_utk_pengumuman.sql
--
-- Owner minta pengumuman menyebut ALASAN izin + siapa penggantinya
-- (2026-08-28). Fungsi `guru_izin_pada_tanggal` sebelumnya SENGAJA cuma
-- mengembalikan guru_id demi menjaga privasi; sekarang ditambah `jenis`
-- (izin/cuti) dan `alasan_kategori` (sakit/lainnya).
--
-- `alasan_detail` TETAP TIDAK DIBUKA. Itu teks bebas yang ditulis guru
-- utk dirinya sendiri (mis. "kontrol ke RS, hasil lab belum keluar"),
-- sedangkan keluaran fungsi ini berujung di grup WA WALI MURID --
-- pembaca yang jauh lebih luas daripada sesama guru. Kategori sudah
-- cukup utk kalimat "izin sakit, digantikan Kak Baban"; detailnya tidak
-- menambah kejelasan bagi wali murid tapi menambah paparan bagi gurunya.
--
-- CATATAN TEKNIS: tipe kembalian berubah, jadi CREATE OR REPLACE akan
-- gagal 42P13 -- harus DROP dulu. DROP juga menghapus GRANT lama, jadi
-- REVOKE/GRANT-nya WAJIB dipasang ulang di bawah.
--
-- Idempoten.
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.guru_izin_pada_tanggal(bigint, date);

CREATE FUNCTION public.guru_izin_pada_tanggal(
  p_kelompok_id bigint,
  p_tanggal     date
)
RETURNS TABLE (guru_id bigint, jenis text, alasan_kategori text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (gi.guru_id)
         gi.guru_id,
         gi.jenis::text,
         gi.alasan_kategori::text
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
   ORDER BY gi.guru_id, gi.tanggal_mulai DESC
$$;

COMMENT ON FUNCTION public.guru_izin_pada_tanggal(bigint, date) IS
  'Guru yang sedang izin pada satu tanggal di satu kelompok, beserta jenis & KATEGORI alasannya. alasan_detail SENGAJA tidak dikembalikan -- keluaran fungsi ini berujung di grup WA wali murid. Dipakai komposer Pengumuman Jadwal KBM.';

-- Wajib dipasang ulang: DROP di atas menghapus grant lama, dan tanpa
-- REVOKE ini peran `anon` ikut bisa memanggil.
REVOKE ALL ON FUNCTION public.guru_izin_pada_tanggal(bigint, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guru_izin_pada_tanggal(bigint, date) TO authenticated;

COMMIT;
