-- =====================================================================
-- SEKALI JALAN (owner, Supabase SQL Editor) -- 2026-09-09
--
-- Kelp Bangun Rejo (kelompok_id 6): 4 anak PAUD/TK yang selama ini
-- tercatat di kelas ruang "1 & 2" (id 17) dipindah ke kelas "PAUD/TK"
-- tersendiri, guru & jadwal SAMA -- supaya Monitoring & Laporan
-- Perkembangan memakai target PAUD, bukan target kelas 2.
--
-- RETROAKTIF: seluruh riwayat (kehadiran & tilawati) ikut ke kelas baru,
-- BUKAN cuma sejak bulan ini. Guru TIDAK perlu input ulang apa pun --
-- `absensi` memang per-santri (tak punya kolom kelas), jadi otomatis
-- ikut; yang dirapikan di sini cuma atribusi kelas per periode
-- (santri_kelas_riwayat) + baris tilawati per-santri.
--
-- Yang TIDAK ikut (memang benar begitu): jurnal materi kelas "1 & 2"
-- yang lama -- itu materi tingkat kelas 2, kelas PAUD mulai jurnal
-- sendiri yang bersih.
--
-- 4 santri: 323 Ghaida, 326 Fauzan, 331 Reyyan, 334 Azfer.
-- Idempoten: aman kalau ternyata sudah dijalankan sebagian.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_paud_id bigint;
  v_santri  bigint[] := ARRAY[323, 326, 331, 334];
BEGIN
  -- 1. Kelas "PAUD/TK" -- salin kategori/guru/jam/ruangan dari kelas 17.
  SELECT id INTO v_paud_id
    FROM kelas
   WHERE kelompok_id = 6 AND nama = 'PAUD/TK' AND deleted_at IS NULL;

  IF v_paud_id IS NULL THEN
    INSERT INTO kelas (kelompok_id, nama, kategori_kbm_id, guru_id, guru_id_2,
                       jam_mulai, jam_selesai, ruangan, status, created_by, hari_ngaji)
    SELECT kelompok_id, 'PAUD/TK', kategori_kbm_id, guru_id, guru_id_2,
           jam_mulai, jam_selesai, ruangan, 'aktif', created_by, hari_ngaji
      FROM kelas WHERE id = 17
    RETURNING id INTO v_paud_id;
    RAISE NOTICE 'Kelas PAUD/TK dibuat, id=%', v_paud_id;
  ELSE
    RAISE NOTICE 'Kelas PAUD/TK sudah ada, id=%', v_paud_id;
  END IF;

  -- 2. Pindahkan santri (set kelas_ngaji -> trigger sinkron mengisi
  --    kelas_id, santri_count, dan split riwayat -- semua di-override
  --    di langkah 3).
  UPDATE santri
     SET kelas_ngaji = 'PAUD/TK'
   WHERE id = ANY(v_santri) AND kelompok_id = 6;

  -- 3. RETROAKTIF: ganti riwayat kelas jadi SATU baris bersih per santri,
  --    kelas PAUD sejak awal data (2025-01-01, sama pola dgn backfill
  --    migrasi 20260901110000). Semua bulan lampau di Riwayat Kehadiran
  --    ikut ke kelas PAUD.
  DELETE FROM santri_kelas_riwayat WHERE santri_id = ANY(v_santri);
  INSERT INTO santri_kelas_riwayat (santri_id, kelompok_id, kelas_id, mulai)
  SELECT s, 6, v_paud_id, DATE '2025-01-01'
    FROM unnest(v_santri) AS s;

  -- 4. Tilawati per-santri yang sudah tercatat -> pindah ke kelas PAUD.
  UPDATE tilawati_pelaksanaan
     SET kelas_id = v_paud_id
   WHERE santri_id = ANY(v_santri);

  -- 5. Selaraskan santri_count (trigger sudah, ini jaring pengaman).
  UPDATE kelas k
     SET santri_count = (SELECT count(*) FROM santri s
                          WHERE s.kelas_id = k.id AND s.deleted_at IS NULL)
   WHERE k.id IN (17, v_paud_id);
END $$;

COMMIT;

-- Verifikasi cepat setelah COMMIT:
--   select id,nama,santri_count,guru_id from kelas where kelompok_id=6 order by id;
--   select santri_id,kelas_id,mulai,selesai from santri_kelas_riwayat where santri_id in (323,326,331,334);
--   select santri_id,kelas_id from tilawati_pelaksanaan where santri_id in (323,326,331,334);
