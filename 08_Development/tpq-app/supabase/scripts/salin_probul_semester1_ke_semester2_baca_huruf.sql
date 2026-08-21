-- =====================================================================
-- salin_probul_semester1_ke_semester2_baca_huruf.sql
--
-- Skrip data SEKALI JALAN (bukan migrasi skema) -- diminta owner: utk
-- materi "Bacaan Al-Qur'an" (ditampilkan "Baca Huruf Al-Qur'an" di
-- kelas PAUD/TK-3), kelas 1-3, salin isi Target & Minggu 1-4 Probul
-- semester 1 APA ADANYA ke bulan yang sepadan di semester 2 (bulan+6),
-- utk SEMUA kelompok & tahun yang punya data ini. Jilid/Deskripsi
-- TIDAK ikut disalin -- owner cuma minta Target & Minggu 1-4.
--
-- UPSERT set-based: baris semester 2 yang sudah ada di-UPDATE, yang
-- belum ada (semester 2 belum diisi sama sekali) di-INSERT baru --
-- tidak perlu tahu ID/kelompok/tahun persis lebih dulu, Postgres yang
-- mencocokkan lewat prota_id yang sama.
--
-- Aman dijalankan ulang (idempoten thd hasil akhir): jalan ulang cuma
-- menimpa dgn nilai semester 1 yang sama, bukan menduplikasi baris.
-- =====================================================================

BEGIN;

WITH target_prota AS (
  SELECT p.id AS prota_id, p.kelompok_id, p.kategori_kbm_id, p.tahun
    FROM kurikulum_prota p
    JOIN kategori_kbm k ON k.id = p.kategori_kbm_id
   WHERE p.kelas IN ('1', '2', '3')
     AND k.nama = 'Bacaan Al-Qur''an'
),
promes_pair AS (
  SELECT tp.prota_id, tp.kelompok_id, tp.kategori_kbm_id, tp.tahun,
         pm1.id AS promes1_id, pm2.id AS promes2_id
    FROM target_prota tp
    JOIN kurikulum_promes pm1 ON pm1.prota_id = tp.prota_id AND pm1.semester = 1
    JOIN kurikulum_promes pm2 ON pm2.prota_id = tp.prota_id AND pm2.semester = 2
),
sumber AS (
  SELECT pp.promes2_id, pp.kelompok_id, pp.kategori_kbm_id, pp.tahun,
         b1.bulan + 6 AS bulan_tujuan,
         b1.target, b1.minggu1, b1.minggu2, b1.minggu3, b1.minggu4
    FROM promes_pair pp
    JOIN kurikulum_probul b1 ON b1.promes_id = pp.promes1_id
),
upd AS (
  UPDATE kurikulum_probul b2
     SET target = s.target,
         minggu1 = s.minggu1,
         minggu2 = s.minggu2,
         minggu3 = s.minggu3,
         minggu4 = s.minggu4
    FROM sumber s
   WHERE b2.promes_id = s.promes2_id
     AND b2.bulan = s.bulan_tujuan
  RETURNING b2.promes_id, b2.bulan
)
INSERT INTO kurikulum_probul (
  promes_id, kelompok_id, kategori_kbm_id, tahun, bulan,
  target, minggu1, minggu2, minggu3, minggu4
)
SELECT s.promes2_id, s.kelompok_id, s.kategori_kbm_id, s.tahun, s.bulan_tujuan,
       s.target, s.minggu1, s.minggu2, s.minggu3, s.minggu4
  FROM sumber s
 WHERE NOT EXISTS (
       SELECT 1 FROM upd u WHERE u.promes_id = s.promes2_id AND u.bulan = s.bulan_tujuan
     );

COMMIT;
