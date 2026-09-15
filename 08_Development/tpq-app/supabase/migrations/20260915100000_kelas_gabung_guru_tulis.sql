-- =====================================================================
-- 20260915100000_kelas_gabung_guru_tulis.sql
--
-- "Gabung Kelas" (2026-08-28) selama ini HANYA bisa ditulis admin_kelompok
-- (dari menu Data Kelas). Diminta owner 2026-09-15: guru sering butuh
-- menggabung kelas + mengubah jam KBM sendiri langsung dari Pengumuman,
-- tanpa harus minta admin_kelompok lebih dulu.
--
-- Cakupan (dipilih owner lewat AskUserQuestion): guru BEBAS menggabung
-- kelas mana pun ke kelas induk mana pun, selama masih di kelompoknya
-- sendiri -- BUKAN dibatasi ke kelas yang dia ampu saja. Polanya disamakan
-- dengan "kelas_gabung_select_scoped" (migrasi 20260828200000) yang sudah
-- lebih dulu membuka SELECT ke guru dgn syarat sama
-- (scope_kelompok_id = kelas_gabung.kelompok_id).
--
-- Badan kebijakan admin (admin_ppg/admin_desa/admin_kelompok) DISALIN apa
-- adanya dari kelas_gabung_tulis_admin (migrasi 20260828200000) -- cuma
-- ditambah cabang guru, TIDAK ada perilaku admin yang berubah. Kebijakan
-- lama di-drop & diganti nama (bukan sekadar direplace) supaya jelas dari
-- nama kebijakannya sendiri bahwa guru kini ikut tercakup.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "kelas_gabung_tulis_admin" ON public.kelas_gabung;
DROP POLICY IF EXISTS "kelas_gabung_tulis_admin_guru" ON public.kelas_gabung;
CREATE POLICY "kelas_gabung_tulis_admin_guru" ON public.kelas_gabung
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kelas_gabung.kelompok_id))
       OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = kelas_gabung.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kelas_gabung.kelompok_id))
       OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = kelas_gabung.kelompok_id))));

COMMIT;
