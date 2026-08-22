-- =====================================================================
-- 20260822110000_tulis_huruf_arab_semester_ganda.sql
--
-- Owner: borang Ubah Prota "Tulis Huruf Arab" (kategori_kbm_id=15) mau
-- disamakan konsepnya dgn "Bacaan Al-Qur'an" -- 2 field "Semester 1"/
-- "Semester 2", TANPA field Target terpisah -- berlaku SEMUA kelas
-- (PAUD-TK s.d. 9), krn cek kategorinya di frontend murni nama, tidak
-- pernah difilter per kelas.
--
-- BEDA dari Bacaan Al-Qur'an: dicek dulu ke data produksi (bukan
-- tebakan) -- utk kategori ini, target SUDAH berisi teks per-semester
-- ASLI (kelas 1-6 py isi), cuma digabung 1 baris pakai pemisah panah
-- unicode U+2192 "→" (dicek langsung kode karakternya, BUKAN "->" ASCII)
-- krn belum ada kolom target2 waktu itu (mis. kelas 1: "Menulis huruf
-- tunggal fathah + angka Arab → Menulis huruf sambung"). deskripsi
-- kategori ini cuma boilerplate seragam per kelas ("Jenjang Caberawit —
-- Materi Tulis Huruf Arab Kelas N"), BUKAN konten per-semester -- jadi
-- TIDAK disentuh/dipecah, tetap seperti semula. Dipakai chr(8594)
-- (bukan karakter "→" mentah di berkas ini) supaya tidak tergantung
-- encoding editor/tool yang menjalankannya.
--
-- Berkas idempoten: baris yang target-nya sudah tidak mengandung panah
-- itu (baik krn sudah pernah dijalankan, atau kelas yg dari awal kosong/
-- PAUD-TK) otomatis tidak kena WHERE-nya, aman dijalankan ulang.
-- =====================================================================

BEGIN;

UPDATE public.kurikulum_prota
SET
  target = trim(split_part(target, chr(8594), 1)),
  target2 = trim(split_part(target, chr(8594), 2))
WHERE kategori_kbm_id = 15
  AND target LIKE '%' || chr(8594) || '%';

COMMIT;
