-- =====================================================================
-- 20260821140000_statistik_riwayat_period_aware.sql
--
-- `statistik_kehadiran()` (migrasi 20260818240000) menyaring baris absensi
-- dgn `s.deleted_at IS NULL` -- begitu seorang santri dipindah/nonaktifkan
-- (fitur Data Generus guru, migrasi 20260821130000), SELURUH riwayat
-- kehadirannya ikut lenyap dari statistik, termasuk hari-hari SEBELUM dia
-- pindah. Itu salah: laporan bulan lalu semestinya tetap menghitung
-- kehadirannya yang memang benar-benar terjadi saat itu.
--
-- PERBAIKAN: `s.deleted_at IS NULL OR s.deleted_at::date > a.tanggal` --
-- dicek PER BARIS ABSENSI (bukan per periode), jadi tepat ke hari:
-- kehadiran SEBELUM tanggal dia pindah tetap terhitung, SESUDAHNYA tidak
-- (dan memang tidak akan ada baris absensi baru sesudahnya, krn dia sudah
-- hilang dari daftar kelas begitu di-soft-delete).
--
-- `demografi` SENGAJA TIDAK ikut diubah -- itu potret KONDISI SEKARANG
-- (tidak berperiode), jadi memang harus mengikuti status aktif saat ini.
--
-- Berkas idempoten: aman dijalankan ulang.
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
     WHERE a.deleted_at IS NULL
       AND (s.deleted_at IS NULL OR s.deleted_at::date > a.tanggal)
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

REVOKE EXECUTE ON FUNCTION public.statistik_kehadiran(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.statistik_kehadiran(jsonb) TO authenticated;

COMMIT;
