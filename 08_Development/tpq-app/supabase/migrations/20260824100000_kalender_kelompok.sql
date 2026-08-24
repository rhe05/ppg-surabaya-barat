-- =====================================================================
-- 20260824100000_kalender_kelompok.sql
--
-- Owner: fitur baru "Kalender Kelompok" di /pengaturan (2026-08-24) --
-- admin (kelompok/desa/ppg) bisa menandai tanggal TERTENTU beda dari
-- kalender libur nasional bawaan (frontend/lib/liburNasional.ts, dipakai
-- kalender Input Kehadiran & Materi Klasikal Rencana Pembelajaran):
--   - jenis='aktif' -- kelp TETAP masuk ngaji walau tanggal itu tanggal
--     merah nasional (mis. Maulid Nabi kelp tertentu tetap KBM).
--   - jenis='libur' -- kelp LIBUR MENDADAK walau hari itu hari kerja
--     biasa (mis. cuaca ekstrem, acara lokal).
--
-- Tanggal merah NASIONAL sendiri (LIBUR_NASIONAL_2026) TIDAK disentuh
-- sama sekali -- tabel ini murni PENGECUALIAN per kelompok yang
-- ditumpangkan di atasnya oleh frontend (lib/kalenderKelompok.ts),
-- bukan pengganti daftar nasionalnya.
--
-- Skema & RLS meniru PERSIS pola "A. Tabel ber-kelompok" di
-- 20260818170000_empat_modul_kecil_rls.sql (siklus_generus/pengurus_kelp/
-- kop_surat): guru boleh MEMBACA kelompoknya sendiri (kalender ini
-- dikonsumsi kalender guru), tulis hanya admin_ppg/admin_desa (scope
-- desa)/admin_kelompok (scope kelompok).
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.kalender_kelompok (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id bigint NOT NULL REFERENCES public.kelompok (id),
  tanggal     date NOT NULL,
  jenis       text NOT NULL,
  catatan     text,
  dibuat_oleh uuid REFERENCES public.profiles (id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_kalender_kelompok_jenis CHECK (jenis IN ('aktif', 'libur')),
  CONSTRAINT uq_kalender_kelompok_tanggal UNIQUE (kelompok_id, tanggal)
);
COMMENT ON TABLE public.kalender_kelompok IS
  'Pengecualian kalender per kelompok (aktif meski tanggal merah / libur mendadak di hari kerja) -- lihat lib/kalenderKelompok.ts.';

ALTER TABLE public.kalender_kelompok ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kalender_kelompok_select_scoped" ON public.kalender_kelompok;
CREATE POLICY "kalender_kelompok_select_scoped" ON public.kalender_kelompok
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kalender_kelompok.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = kalender_kelompok.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = kalender_kelompok.kelompok_id))));

DROP POLICY IF EXISTS "kalender_kelompok_tulis_admin" ON public.kalender_kelompok;
CREATE POLICY "kalender_kelompok_tulis_admin" ON public.kalender_kelompok
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kalender_kelompok.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = kalender_kelompok.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kalender_kelompok.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = kalender_kelompok.kelompok_id))));

COMMIT;
