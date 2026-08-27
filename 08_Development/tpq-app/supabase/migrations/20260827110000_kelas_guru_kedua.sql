-- =====================================================================
-- 20260827110000_kelas_guru_kedua.sql
--
-- Sebagian kelompok memakai POLA GILIR guru: satu kelas diajar dua guru
-- bergantian (mis. 2 minggu Guru A, 2 minggu Guru B). Owner memilih
-- pendekatan "INFO SAJA" (2026-08-27): cukup catat guru keduanya + pola
-- gilirnya sbg teks -- TIDAK ada perhitungan otomatis "guru minggu ini".
--
--   guru_id_2       : guru kedua (opsional), FK ke guru spt guru_id.
--   pola_gilir_guru : teks bebas, mis. "Gilir tiap 2 minggu".
--
-- Tidak perlu policy baru: RLS `kelas` berlaku per-baris, kolom baru ikut.
-- Idempoten.
-- =====================================================================

BEGIN;

ALTER TABLE public.kelas
  ADD COLUMN IF NOT EXISTS guru_id_2       bigint REFERENCES public.guru (id),
  ADD COLUMN IF NOT EXISTS pola_gilir_guru text;

COMMENT ON COLUMN public.kelas.guru_id_2 IS
  'Guru kedua utk kelas yg diajar bergilir. Info saja -- app tidak menghitung siapa yg giliran minggu ini. Lihat pola_gilir_guru.';
COMMENT ON COLUMN public.kelas.pola_gilir_guru IS
  'Keterangan pola gilir guru, teks bebas (mis. "Gilir tiap 2 minggu").';

COMMIT;
