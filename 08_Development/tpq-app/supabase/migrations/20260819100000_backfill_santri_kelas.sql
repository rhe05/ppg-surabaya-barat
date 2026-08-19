-- =====================================================================
-- 20260819100000_backfill_santri_kelas.sql
--
-- Memulihkan tautan santri -> kelas yang hilang saat migrasi Sheets/
-- Firestore ke Supabase.
--
-- Duduk perkaranya: di sumber lama kelas ngaji santri disimpan sebagai TEKS
-- pada kolom `santri.kelas_ngaji` (Setup_Database.gs:29). Kolom itu tidak
-- ikut terbawa ke Supabase, dan `santri.kelas_id` tidak pernah diisi —
-- akibatnya 0 dari 199 santri punya kelas, dan statistik per kelas di
-- dashboard guru (HARI AKTIF/HADIR/IZIN/SAKIT/ALPA) mustahil dihitung
-- karena jalurnya absensi -> santri.kelas_id -> kelas.
--
-- Pemetaan di bawah BUKAN tebakan: dihasilkan tools/audit_kelas_ngaji.js
-- yang membaca kedua sumber asli (Firestore utk Kelp Petemon, Sheets utk
-- sisanya), lalu dicocokkan ke tabel kelas — 50 baris, 8 nama kelas,
-- 0 tidak cocok. Nilainya ditulis apa adanya di sini supaya migrasi ini
-- bisa diputar ulang di project lain tanpa perlu akses ke sumber lama.
--
-- Yang SENGAJA tidak ikut:
--   - 19 santri Kelp Petemon berjenjang Remaja: kolom kelas_ngaji-nya
--     kosong di sumber juga (di app lama mereka dicatat lewat Kehadiran
--     Generus, bukan kelas ngaji). Bukan data hilang.
--   - 130 santri Bangun Rejo/Purwodadi/Dupak: tidak punya kelas_ngaji di
--     sumber, dan kelompoknya memang belum punya baris `kelas` sama sekali.
--
-- Berkas idempoten: hanya mengisi baris yang kelas_id-nya masih NULL, jadi
-- penetapan kelas yang dilakukan admin belakangan tidak akan tertimpa.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Isi santri.kelas_id
-- ---------------------------------------------------------------------
-- Join ke kelas memakai (kelompok_id, nama) — bukan nama saja — supaya nama
-- kelas yang kelak dipakai ulang di kelompok lain tidak pernah menyeberang.
WITH sumber(santri_id, kelompok_id, kelas_ngaji) AS (VALUES
  (201, 1, '4'),
  (202, 1, '2 & 3A'),
  (203, 1, '2 & 3A'),
  (205, 1, 'Remaja SMA'),
  (217, 1, 'Remaja SMA'),
  (218, 1, 'Remaja SMA'),
  (223, 1, 'Pra Remaja SMP'),
  (224, 1, 'Remaja SMA'),
  (226, 1, 'Pra Remaja SMP'),
  (227, 1, 'Remaja SMA'),
  (228, 1, 'Remaja SMA'),
  (229, 1, 'Remaja SMA'),
  (233, 1, '2 & 3A'),
  (234, 1, 'PAUD/TK B'),
  (235, 1, '4'),
  (236, 1, '2 & 3A'),
  (237, 1, '1A'),
  (238, 1, '2 & 3A'),
  (239, 1, '1B'),
  (240, 1, '1B'),
  (241, 1, 'PAUD/TK B'),
  (242, 1, 'PAUD/TK B'),
  (243, 1, '1B'),
  (244, 1, 'PAUD/TK B'),
  (245, 1, 'PAUD/TK A'),
  (246, 1, '1A'),
  (247, 1, 'PAUD/TK B'),
  (248, 1, '1B'),
  (249, 1, '2 & 3A'),
  (250, 1, '2 & 3A'),
  (251, 1, '1B'),
  (252, 1, '1A'),
  (253, 1, '1B'),
  (254, 1, '2 & 3A'),
  (255, 1, '1A'),
  (256, 1, '1B'),
  (257, 1, 'PAUD/TK B'),
  (258, 1, 'PAUD/TK A'),
  (259, 1, 'PAUD/TK B'),
  (260, 1, 'PAUD/TK A'),
  (261, 1, '1A'),
  (262, 1, 'PAUD/TK A'),
  (263, 1, 'PAUD/TK A'),
  (264, 1, 'PAUD/TK A'),
  (265, 1, 'PAUD/TK A'),
  (266, 1, '1B'),
  (267, 1, '1A'),
  (268, 1, '1A'),
  (269, 1, 'PAUD/TK A'),
  (270, 1, 'PAUD/TK A'))
UPDATE santri s
   SET kelas_id = k.id,
       updated_at = now()
  FROM sumber m
  JOIN kelas k ON k.kelompok_id = m.kelompok_id AND k.nama = m.kelas_ngaji
 WHERE s.id = m.santri_id
   AND s.kelompok_id = m.kelompok_id
   AND s.kelas_id IS NULL;

-- ---------------------------------------------------------------------
-- 2. Hitung ulang kelas.santri_count
-- ---------------------------------------------------------------------
-- Kolom ini sudah menyimpang sebelum migrasi ini: kelas "1A" tertulis 0
-- padahal berisi 7 santri, sehingga dashboard guru menampilkan "0 Santri"
-- untuk kelas yang di app lama tertulis "7 Santri". Dihitung ulang dari
-- tautan yang baru saja dipulihkan, untuk SEMUA kelas (termasuk yang
-- memang kosong) supaya tidak ada sisa angka lama yang tertinggal.
UPDATE kelas k
   SET santri_count = COALESCE(hitung.jumlah, 0),
       updated_at = now()
  FROM (
    SELECT k2.id,
           (SELECT count(*) FROM santri s
             WHERE s.kelas_id = k2.id AND s.deleted_at IS NULL) AS jumlah
      FROM kelas k2
  ) hitung
 WHERE k.id = hitung.id
   AND k.santri_count IS DISTINCT FROM COALESCE(hitung.jumlah, 0);

COMMIT;
