-- =====================================================================
-- 20260828160000_tabungan_setoran_rincian.sql
--
-- Rincian setoran per-anak (permintaan owner 2026-08-28). Sebuah setoran
-- guru -> penghimpun sekarang = SEIKAT transaksi "terima" tertentu, bukan
-- cuma satu angka gelondongan. Guru memilih penerimaan mana yang ia
-- serahkan; tiap baris terima ditandai `setoran_id`-nya. Akibatnya:
--   - kas di tangan guru = Σ terima yang setoran_id-nya masih NULL,
--   - penghimpun bisa menurunkan setoran -> daftar (nama anak, jenis,
--     nominal) yang PERSIS sama dengan catatan guru (tidak ada miss).
--
-- FK ON DELETE SET NULL: menghapus setoran otomatis mengembalikan
-- transaksi terima-nya ke "kas di tangan".
--
-- Idempoten.
-- =====================================================================

BEGIN;

ALTER TABLE public.tabungan_transaksi
  ADD COLUMN IF NOT EXISTS setoran_id bigint
    REFERENCES public.tabungan_setoran (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_setoran
  ON public.tabungan_transaksi (setoran_id) WHERE setoran_id IS NOT NULL;

-- Guru perlu meng-UPDATE `setoran_id` pada transaksi TERIMA catatannya
-- sendiri (policy tulis sebelumnya membuat UPDATE = admin saja, supaya
-- guru tak bisa menyetujui penarikannya sendiri). Policy tambahan ini
-- SENGAJA dibatasi arah='terima' -> baris 'tarik' tetap tak tersentuh
-- guru, jadi jalur persetujuan penarikan tidak bocor. PERMISSIVE =
-- union dengan tabungan_transaksi_update_admin.
DROP POLICY IF EXISTS "tabungan_transaksi_update_guru_terima" ON public.tabungan_transaksi;
CREATE POLICY "tabungan_transaksi_update_guru_terima" ON public.tabungan_transaksi
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND p.role = 'guru'
      AND tabungan_transaksi.dicatat_oleh = (SELECT auth.uid())
      AND tabungan_transaksi.arah = 'terima'))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND p.role = 'guru'
      AND tabungan_transaksi.dicatat_oleh = (SELECT auth.uid())
      AND tabungan_transaksi.arah = 'terima'
      AND tabungan_transaksi.status = 'disetujui'));

COMMIT;
