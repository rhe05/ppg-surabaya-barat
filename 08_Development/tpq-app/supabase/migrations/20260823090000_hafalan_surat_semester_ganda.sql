-- =====================================================================
-- 20260823090000_hafalan_surat_semester_ganda.sql
--
-- Owner: borang Ubah Prota "Hafalan Surat-Surat Al-Qur'an"
-- (kategori_kbm_id=7) disamakan konsepnya dgn "Bacaan Al-Qur'an"/"Tulis
-- Huruf Arab" -- 2 field "Semester 1"/"Semester 2", TANPA field Target
-- terpisah -- berlaku PAUD-TK s.d. 6 (sesuai permintaan; kode frontend
-- sendiri tidak memfilter per kelas, jadi otomatis berlaku ke kelas
-- mana pun yg py baris kategori ini, termasuk di luar rentang itu kalau
-- nanti ditambah).
--
-- Pola datanya SAMA PERSIS dgn Tulis Huruf Arab (dicek ke produksi
-- dulu, bukan tebakan): target sudah berisi teks per-semester ASLI,
-- digabung 1 baris pakai panah unicode U+2192 "→" krn dulu belum ada
-- kolom target2 (mis. PAUD-TK: "Surat Al-Fatihah s/d Surat Al-Ikhlas →
-- Surat Al-Lahab s/d Al-Kafirun"). deskripsi cuma boilerplate seragam
-- per kelas ("Jenjang Caberawit — Materi Hafalan Surat-Surat Al-Qur'an
-- Kelas N"), TIDAK disentuh/dipecah.
--
-- Baris kelas 3 (prota_id=20) SENGAJA TIDAK ikut kena migrasi ini --
-- datanya sudah rusak/tidak lengkap dari awal (target="Semester II",
-- deskripsi="Surat Al-Qodr - 1 Surat", 0 baris Promes sama sekali,
-- BUKAN pola "A → B"), jadi WHERE-nya (butuh panah) otomatis melewati
-- baris itu -- perlu keputusan terpisah dari owner, bukan ditebak di
-- sini. Kelas 5 & 6 belum py baris kategori ini sama sekali di produksi
-- (di luar cakupan migrasi data, tinggal Tambah Materi manual).
--
-- Berkas idempoten: baris yang target-nya sudah tidak mengandung panah
-- itu (sudah pernah dijalankan / tidak match pola) otomatis tidak kena
-- WHERE-nya, aman dijalankan ulang.
-- =====================================================================

BEGIN;

UPDATE public.kurikulum_prota
SET
  target = trim(split_part(target, chr(8594), 1)),
  target2 = trim(split_part(target, chr(8594), 2))
WHERE kategori_kbm_id = 7
  AND target LIKE '%' || chr(8594) || '%';

COMMIT;
