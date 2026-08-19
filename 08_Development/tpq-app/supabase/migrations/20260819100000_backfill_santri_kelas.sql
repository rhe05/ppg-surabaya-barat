-- =====================================================================
-- 20260819100000_backfill_santri_kelas.sql
--
-- Memulihkan tautan santri -> kelas yang tidak pernah dibuat saat migrasi
-- Sheets/Firestore ke Supabase.
--
-- Duduk perkaranya: kelas ngaji santri ikut terbawa ke Supabase sebagai
-- TEKS di kolom `santri.kelas_ngaji` (50 baris terisi), tetapi kolom relasi
-- `santri.kelas_id` tidak pernah diisi dari teks itu — 0 dari 199 santri
-- punya kelas. Akibatnya statistik per kelas di dashboard guru (HARI AKTIF/
-- HADIR/IZIN/SAKIT/ALPA) mustahil dihitung, karena jalurnya
-- absensi -> santri.kelas_id -> kelas.
--
-- KOREKSI: versi pertama berkas ini menuliskan 50 pasangan id sebagai
-- VALUES hasil bacaan tools/audit_kelas_ngaji.js atas sumber lama, dengan
-- keterangan bahwa kolom kelas_ngaji "tidak ikut terbawa". Keterangan itu
-- KELIRU — kolomnya ada dan terisi di Supabase, jadi pemetaannya bisa
-- diturunkan langsung di dalam DB. Hasil kedua cara sudah dibandingkan dan
-- identik (50 baris, 8 nama kelas, 0 selisih), tetapi bentuk join di bawah
-- yang benar: tidak menanam id yang hanya berlaku di satu project, dan ikut
-- membetulkan diri kalau ada santri baru yang ber-kelas_ngaji.
--
-- Pencocokan memakai (kelompok_id, nama) — bukan nama saja — supaya nama
-- kelas yang kelak dipakai ulang di kelompok lain tidak menyeberang.
--
-- Yang SENGAJA tidak ikut tertaut:
--   - 19 santri Kelp Petemon berjenjang Remaja: kelas_ngaji-nya kosong di
--     sumber juga (di app lama mereka dicatat lewat Kehadiran Generus,
--     bukan kelas ngaji). Bukan data hilang.
--   - 130 santri Bangun Rejo/Purwodadi/Dupak: tidak punya kelas_ngaji, dan
--     kelompoknya memang belum punya baris `kelas` sama sekali.
--
-- Berkas idempoten: hanya mengisi baris yang kelas_id-nya masih NULL, jadi
-- penetapan kelas yang dilakukan admin belakangan tidak akan tertimpa.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Isi santri.kelas_id dari teks kelas_ngaji
-- ---------------------------------------------------------------------
UPDATE santri s
   SET kelas_id = k.id,
       updated_at = now()
  FROM kelas k
 WHERE k.kelompok_id = s.kelompok_id
   AND k.nama = btrim(s.kelas_ngaji)
   AND btrim(COALESCE(s.kelas_ngaji, '')) <> ''
   AND s.kelas_id IS NULL
   AND s.deleted_at IS NULL;

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
