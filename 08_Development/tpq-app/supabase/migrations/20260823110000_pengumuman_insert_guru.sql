-- =====================================================================
-- 20260823110000_pengumuman_insert_guru.sql
--
-- Owner: fitur baru "Pengumuman Jadwal KBM" (komposer WhatsApp siap
-- salin, mobile guru) -- guru sendiri yg "dewan guru" biasanya
-- membagikan pengumuman jadwal KBM ke grup WA wali murid, jadi guru
-- WAJIB bisa MEMBUAT (INSERT) pengumuman, tidak cukup baca-saja spt
-- sebelumnya (pengumuman_select_scoped sudah lebih dulu mengizinkan
-- guru baca, migrasi 20260818140000).
--
-- UPDATE/DELETE SENGAJA TIDAK ikut dibuka utk guru -- kelompok bisa py
-- banyak guru sekaligus, biar tidak saling menghapus/mengubah
-- pengumuman guru lain tanpa sepengetahuannya; itu tetap admin-only
-- spt semula. Guru yg mau membetulkan draftnya sendiri sblm disimpan
-- cukup edit di layar komposer sblm tekan Simpan.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "pengumuman_insert_admin" ON public.pengumuman;
CREATE POLICY "pengumuman_insert_admin" ON public.pengumuman
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (
    (p.role = 'admin_ppg'::text)
    OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
         FROM kelompok k
        WHERE (k.id = pengumuman.kelompok_id))))
    OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = pengumuman.kelompok_id))
    OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = pengumuman.kelompok_id))
  )))));

COMMIT;
