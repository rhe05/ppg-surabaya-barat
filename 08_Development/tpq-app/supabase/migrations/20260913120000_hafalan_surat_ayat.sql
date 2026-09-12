-- =====================================================================
-- 20260913120000_hafalan_surat_ayat.sql
--
-- Kartu "Hafalan Surat-Surat Al-Qur'an" (Pelaksanaan Pembelajaran) --
-- diminta owner 2026-09-13: tambah 2 kolom "Ayat dari" s/d "Ayat
-- sampai" per santri, WAJIB angka (contoh: santri A setoran ayat 1 s/d
-- ayat 10). Pola SAMA PERSIS kolom `ayat` di tilawati_pelaksanaan
-- (migrasi 20260912100000, kartu "Al-Qur'an"): satu kolom TEXT
-- menyimpan rentang "dari-sampai" (mis. "1-10"), diuraikan/digabung di
-- frontend (uraikanHalaman/gabungHalaman), dijepit ke jumlah ayat surat
-- terpilih (lib/suratAlQuran.ts jumlahAyatSurat).
-- =====================================================================

BEGIN;

ALTER TABLE public.hafalan_surat_pelaksanaan
  ADD COLUMN IF NOT EXISTS ayat text;

COMMIT;
