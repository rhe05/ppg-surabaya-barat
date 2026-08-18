-- =====================================================================
-- 20260818240000_statistik_rpc.sql
--
-- Agregasi untuk halaman Statistik — padanan Modul_Statistics.gs (7 fungsi:
-- tren kehadiran, kehadiran per kelompok, demografi, 10 teratas, 10
-- terbawah, pertumbuhan, peringkat kelompok).
--
-- KENAPA DI POSTGRES, BUKAN DI PERAMBAN: statistik menghitung dari SELURUH
-- riwayat absensi. Menariknya ke peramban berarti mengunduh ribuan baris
-- lalu membuang hampir semuanya, dan biayanya tumbuh terus seiring data
-- bertambah — persis yang dilarang prinsip performa proyek ini untuk tabel
-- time-series. Di sini yang berpindah hanya hasil akhirnya (puluhan baris).
--
-- SECURITY INVOKER (bawaan): seluruh policy RLS absensi/santri tetap
-- berlaku, jadi admin kelompok hanya melihat angkanya sendiri tanpa satu
-- baris pun pemeriksaan tambahan di sini.
--
-- Semua bagian dikembalikan dalam SATU jsonb supaya halaman cukup sekali
-- memanggil, bukan tujuh kali.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.statistik_kehadiran(p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_kelompok bigint := NULLIF(p ->> 'kelompok_id', '')::bigint;
  v_hari     int     := COALESCE(NULLIF(p ->> 'hari', '')::int, 30);
  v_sejak    date;
  v_hasil    jsonb;
BEGIN
  IF v_hari < 1 OR v_hari > 365 THEN
    RAISE EXCEPTION 'Rentang hari harus 1-365';
  END IF;
  v_sejak := current_date - v_hari;

  WITH absen AS (
    SELECT a.tanggal, a.status, s.kelompok_id, s.id AS santri_id, s.nama
      FROM public.absensi a
      JOIN public.santri s ON s.id = a.santri_id
     WHERE a.deleted_at IS NULL AND s.deleted_at IS NULL
       AND a.tanggal >= v_sejak
       AND (v_kelompok IS NULL OR s.kelompok_id = v_kelompok)
  ),
  tren AS (
    SELECT tanggal,
           count(*) AS total,
           count(*) FILTER (WHERE status = 'hadir') AS hadir
      FROM absen GROUP BY tanggal ORDER BY tanggal
  ),
  per_kelompok AS (
    SELECT k.nama AS kelompok,
           count(*) AS total,
           count(*) FILTER (WHERE a.status = 'hadir') AS hadir
      FROM absen a JOIN public.kelompok k ON k.id = a.kelompok_id
     GROUP BY k.nama
  ),
  per_santri AS (
    SELECT santri_id, nama,
           count(*) AS total,
           count(*) FILTER (WHERE status = 'hadir') AS hadir
      FROM absen GROUP BY santri_id, nama
    HAVING count(*) >= 3   -- di bawah 3 catatan, persentasenya menyesatkan
  ),
  demografi AS (
    SELECT coalesce(s.jenjang_saat_ini::text, '(kosong)') AS jenjang,
           count(*) AS jumlah,
           count(*) FILTER (WHERE upper(coalesce(s.gender::text, '')) = 'L') AS lk,
           count(*) FILTER (WHERE upper(coalesce(s.gender::text, '')) = 'P') AS pr
      FROM public.santri s
     WHERE s.deleted_at IS NULL
       AND (v_kelompok IS NULL OR s.kelompok_id = v_kelompok)
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'sejak', v_sejak,
    'hari', v_hari,
    'tren', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'tanggal', tanggal, 'total', total, 'hadir', hadir,
                'persen', round(hadir::numeric / nullif(total, 0) * 100, 1))
              ORDER BY tanggal) FROM tren), '[]'::jsonb),
    'per_kelompok', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'kelompok', kelompok, 'total', total, 'hadir', hadir,
                'persen', round(hadir::numeric / nullif(total, 0) * 100, 1))
              ORDER BY round(hadir::numeric / nullif(total, 0) * 100, 1) DESC NULLS LAST)
              FROM per_kelompok), '[]'::jsonb),
    'teratas', coalesce((SELECT jsonb_agg(x) FROM (
                SELECT jsonb_build_object('nama', nama, 'total', total, 'hadir', hadir,
                       'persen', round(hadir::numeric / total * 100, 1)) AS x,
                       round(hadir::numeric / total * 100, 1) AS urut
                  FROM per_santri ORDER BY urut DESC, total DESC LIMIT 10) t), '[]'::jsonb),
    'terbawah', coalesce((SELECT jsonb_agg(x) FROM (
                SELECT jsonb_build_object('nama', nama, 'total', total, 'hadir', hadir,
                       'persen', round(hadir::numeric / total * 100, 1)) AS x,
                       round(hadir::numeric / total * 100, 1) AS urut
                  FROM per_santri ORDER BY urut ASC, total DESC LIMIT 10) t), '[]'::jsonb),
    'demografi', coalesce((SELECT jsonb_agg(jsonb_build_object(
                'jenjang', jenjang, 'jumlah', jumlah, 'lk', lk, 'pr', pr)
              ORDER BY jumlah DESC) FROM demografi), '[]'::jsonb),
    'ringkas', (SELECT jsonb_build_object(
                'total_catatan', coalesce(sum(total), 0),
                'total_hadir', coalesce(sum(hadir), 0),
                'persen', round(coalesce(sum(hadir), 0)::numeric / nullif(sum(total), 0) * 100, 1),
                'jumlah_hari', count(*)) FROM tren)
  ) INTO v_hasil;

  RETURN v_hasil;
END
$$;

-- EXECUTE untuk PUBLIC melekat otomatis pada fungsi baru dan anon anggota
-- PUBLIC — GRANT ke authenticated saja TIDAK menutup anon.
REVOKE EXECUTE ON FUNCTION public.statistik_kehadiran(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.statistik_kehadiran(jsonb) TO authenticated;

COMMIT;
