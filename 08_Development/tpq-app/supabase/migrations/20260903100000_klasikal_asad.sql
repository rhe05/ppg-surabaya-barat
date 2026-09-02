-- =====================================================================
-- 20260903100000_klasikal_asad.sql
--
-- Owner (2026-09-03): pada hari Jumat minggu ke-1/ke-2 (Kelp Petemon;
-- kelp lain waktunya beda-beda) seluruh kelompok latihan Pencak Silat
-- ASAD -- pada tanggal itu TIDAK ADA kegiatan klasikal. Guru menandai
-- tanggal ASAD dari borang "Tambah Materi Klasikal" (Rencana
-- Pembelajaran). Sifatnya SE-KELOMPOK: begitu SATU guru menandai, semua
-- guru kelompok itu ikut (baris hari itu terkunci + label "Pencak Silat
-- ASAD" di kartu Klasikal). Guru mana pun boleh membatalkannya.
--
-- Pengecualian: kelas Remaja/SMA TIDAK ikut ASAD (klasikal jalan
-- seperti biasa) -- itu disaring di frontend (lib/klasikalAsad tidak
-- tahu kelas; RencanaPembelajaranView yang memutuskan lewat nama ruang).
--
-- Tabel TERPISAH (bukan menumpang kalender_kelompok jenis baru) karena
-- ASAD BUKAN libur -- ngaji tetap jalan, hanya sesi klasikal yang
-- dilewati -- dan penulisnya guru, bukan admin (kalender_kelompok
-- sengaja tulis-admin-saja).
--
-- Skema & RLS meniru pola "A. Tabel ber-kelompok" (kalender_kelompok),
-- BEDA: guru kelompok itu jg boleh TULIS (insert/delete), bukan baca
-- saja.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.klasikal_asad (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id bigint NOT NULL REFERENCES public.kelompok (id),
  tanggal     date NOT NULL,
  dibuat_oleh uuid REFERENCES public.profiles (id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_klasikal_asad_tanggal UNIQUE (kelompok_id, tanggal)
);
COMMENT ON TABLE public.klasikal_asad IS
  'Tanggal Pencak Silat ASAD per kelompok -- pada tanggal ini tidak ada sesi klasikal (kecuali kelas Remaja/SMA). Ditandai/dibatalkan guru dari Rencana Pembelajaran.';

ALTER TABLE public.klasikal_asad ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "klasikal_asad_select_scoped" ON public.klasikal_asad;
CREATE POLICY "klasikal_asad_select_scoped" ON public.klasikal_asad
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = klasikal_asad.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = klasikal_asad.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = klasikal_asad.kelompok_id))));

DROP POLICY IF EXISTS "klasikal_asad_tulis_scoped" ON public.klasikal_asad;
CREATE POLICY "klasikal_asad_tulis_scoped" ON public.klasikal_asad
  AS PERMISSIVE FOR ALL TO authenticated
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = klasikal_asad.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = klasikal_asad.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = klasikal_asad.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = klasikal_asad.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = klasikal_asad.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = klasikal_asad.kelompok_id))));

COMMIT;
