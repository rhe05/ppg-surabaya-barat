-- =====================================================================
-- 20260912100000_tilawati_alquran_kelas4plus.sql
--
-- Kartu "Tilawati" di Pelaksanaan Pembelajaran dipisah dua alur (diminta
-- owner 2026-09-12): kelas PAUD-TK s.d. 3 tetap Buku Jilid (Jilid+
-- Halaman, TIDAK berubah). Kelas 4+ (tidak lagi baca Jilid) sekarang
-- kartunya berjudul "Al-Qur'an" dan mencatat Juz/Surat/Ayat per santri,
-- konsep sama (ada Naik/Tetap) tapi field beda.
--
-- Reuse tabel `tilawati_pelaksanaan` yang sudah ada -- HANYA tambah 2
-- kolom nullable. `buku_jilid` dipakai ulang utk simpan "Juz N" (sama
-- format dgn kelanjutan Jilid->Juz yang sudah ada, migrasi 2026-09-11
-- fitur "lanjut ke Al-Qur'an" di Pelaksanaan), TIDAK butuh kolom baru
-- utk itu. `surat` & `ayat` BARU -- kelas PAUD-TK s.d. 3 selalu NULL
-- di kolom ini (tidak dipakai), kelas 4+ selalu NULL di `halaman`
-- (diganti `ayat`).
-- =====================================================================

BEGIN;

ALTER TABLE public.tilawati_pelaksanaan
  ADD COLUMN IF NOT EXISTS surat text,
  ADD COLUMN IF NOT EXISTS ayat text;

COMMIT;
