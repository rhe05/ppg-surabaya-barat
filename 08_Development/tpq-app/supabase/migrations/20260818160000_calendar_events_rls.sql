-- =====================================================================
-- 20260818160000_calendar_events_rls.sql
--
-- Fondasi DB untuk halaman Kalender Akademik. Pola yang sama untuk ketiga
-- kalinya hari ini: `calendar_events` punya RLS AKTIF tapi NOL policy —
-- tertutup senyap, SELECT selalu 0 baris, INSERT selalu ditolak.
--
-- Aturan ditiru dari Modul_MaintainKalender.gs:
--   SELECT — ber-scope, TERMASUK role `guru` untuk kelompoknya. Kepala
--            berkas modul lama menyebut guru "view-only access", dan
--            memang begitu: guru melihat, tidak menulis.
--   INSERT/UPDATE/DELETE — hanya admin (ppg/desa/kelompok) DAN ber-scope
--            (serverCreateCalendarEvent:106 memakai validateUserAccess).
--
-- DELETE tidak dibatasi admin_ppg saja — sama alasannya dengan pengumuman:
-- event kalender itu jadwal yang wajar dibatalkan sendiri oleh admin
-- kelompok, dan tabel ini TIDAK punya `deleted_at` sehingga tidak ada
-- jalur hapus halus.
--
-- Satu batasan yang dipindahkan dari kode ke basis data: `tipe_event` di
-- app lama divalidasi daftar ['kbm','ujian','acara','libur']
-- (serverCreateCalendarEvent:101) tapi kolomnya di Postgres cuma `text`
-- bebas. Ditambahkan CHECK constraint supaya nilai di luar daftar itu
-- tidak bisa masuk lewat jalur mana pun. NULL tetap diterima — kolomnya
-- nullable dan app lama juga tidak mewajibkannya saat UPDATE.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'calendar_events_tipe_event_check'
       AND conrelid = 'public.calendar_events'::regclass
  ) THEN
    ALTER TABLE public.calendar_events
      ADD CONSTRAINT calendar_events_tipe_event_check
      CHECK (tipe_event IS NULL OR tipe_event IN ('kbm', 'ujian', 'acara', 'libur'));
  END IF;
END
$$;

DROP POLICY IF EXISTS "calendar_events_select_scoped" ON public.calendar_events;
CREATE POLICY "calendar_events_select_scoped" ON public.calendar_events
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = calendar_events.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = calendar_events.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = calendar_events.kelompok_id)))))));

DROP POLICY IF EXISTS "calendar_events_insert_admin" ON public.calendar_events;
CREATE POLICY "calendar_events_insert_admin" ON public.calendar_events
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = calendar_events.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = calendar_events.kelompok_id)))))));

DROP POLICY IF EXISTS "calendar_events_update_admin" ON public.calendar_events;
CREATE POLICY "calendar_events_update_admin" ON public.calendar_events
  AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = calendar_events.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = calendar_events.kelompok_id)))))));

DROP POLICY IF EXISTS "calendar_events_delete_admin" ON public.calendar_events;
CREATE POLICY "calendar_events_delete_admin" ON public.calendar_events
  AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = calendar_events.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = calendar_events.kelompok_id)))))));

COMMIT;
