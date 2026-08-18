-- Dihasilkan oleh tools/etl_absensi_firestore_tertinggal.js
-- 25 catatan absensi Firestore yang belum ada di Supabase.
-- dicatat_oleh dibiarkan NULL: Firestore menyimpan id pengguna app lama,
-- yang tidak punya padanan di auth.users.
BEGIN;

INSERT INTO public.absensi (santri_id, kelompok_id, tanggal, status)
SELECT v.santri_id, 1, v.tanggal, v.status
  FROM (VALUES
    (234::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (241::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (242::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (244::bigint, '2026-07-15'::date, 'alpa'::absensi_status),
    (245::bigint, '2026-07-15'::date, 'alpa'::absensi_status),
    (247::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (257::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (258::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (259::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (260::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (262::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (263::bigint, '2026-07-15'::date, 'alpa'::absensi_status),
    (264::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (265::bigint, '2026-07-15'::date, 'hadir'::absensi_status),
    (269::bigint, '2026-07-15'::date, 'izin'::absensi_status),
    (270::bigint, '2026-07-15'::date, 'izin'::absensi_status),
    (245::bigint, '2026-08-06'::date, 'alpa'::absensi_status),
    (258::bigint, '2026-08-06'::date, 'hadir'::absensi_status),
    (260::bigint, '2026-08-06'::date, 'alpa'::absensi_status),
    (262::bigint, '2026-08-06'::date, 'hadir'::absensi_status),
    (263::bigint, '2026-08-06'::date, 'alpa'::absensi_status),
    (264::bigint, '2026-08-06'::date, 'hadir'::absensi_status),
    (265::bigint, '2026-08-06'::date, 'alpa'::absensi_status),
    (269::bigint, '2026-08-06'::date, 'hadir'::absensi_status),
    (270::bigint, '2026-08-06'::date, 'hadir'::absensi_status)
  ) AS v(santri_id, tanggal, status)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.absensi a
    WHERE a.santri_id = v.santri_id AND a.tanggal = v.tanggal AND a.deleted_at IS NULL
 );

SELECT count(*)::text AS absensi_kelompok_1
  FROM public.absensi a JOIN public.santri s ON s.id = a.santri_id
 WHERE s.kelompok_id = 1 AND a.deleted_at IS NULL;

COMMIT;
