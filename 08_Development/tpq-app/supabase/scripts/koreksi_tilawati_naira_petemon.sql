-- =====================================================================
-- koreksi_tilawati_naira_petemon.sql   (2026-09-10)
--
-- Keluhan guru Ratna (Kelp Petemon, kelas "2 B"): pencapaian Tilawati
-- "Nairra Azzahra Pramesti" (santri_id 254) menunjukkan Jilid 4, padahal
-- seharusnya Jilid 2.
--
-- Data saat ini di tilawati_pelaksanaan:
--   id 99  | 2026-09-03 | Jilid 2 hal 44 | naik   <- yang benar (dipertahankan)
--   id 111 | 2026-09-07 | Jilid 3 hal 44 | naik   <- kemungkinan salah (auto-prefill)
--   id 173 | 2026-09-08 | Jilid 4 hal 1  | naik   <- kemungkinan salah (auto-prefill)
--
-- "Pencapaian terakhir" dibaca dari baris TANGGAL TERMUDA -> id 173 (Jilid 4).
--
-- ⚠️ JALANKAN HANYA setelah owner mengonfirmasi ke Ratna bahwa Naira
--    memang di Jilid 2 (bukan 3/4). Kalau Ratna bisa akses app, lebih
--    baik dia hapus sendiri lewat: Jurnal > Riwayat Pembelajaran >
--    kartu Tilawati > tombol (x) di baris tanggal 07 & 08 September
--    (fitur baru migrasi 20260910120000).
--
-- Idempoten: DELETE berdasarkan kondisi, aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- Sebelum
SELECT id, tanggal, buku_jilid, halaman, status
  FROM public.tilawati_pelaksanaan
 WHERE santri_id = 254
 ORDER BY tanggal;

-- Hapus dua catatan yang kemungkinan salah (biarkan 03 Sep / Jilid 2)
DELETE FROM public.tilawati_pelaksanaan
 WHERE santri_id = 254
   AND tanggal IN (DATE '2026-09-07', DATE '2026-09-08')
   AND buku_jilid IN ('3', '4');

-- Sesudah (harusnya tinggal baris 03 Sep, Jilid 2)
SELECT id, tanggal, buku_jilid, halaman, status
  FROM public.tilawati_pelaksanaan
 WHERE santri_id = 254
 ORDER BY tanggal;

COMMIT;
