-- =====================================================================
-- 20260912110000_audit_fix_infaq_trigger_dan_kehadiran_delete.sql
--
-- 2 perbaikan dari "Audit Menyeluruh 4 Peran" (2026-09-12,
-- AUDIT_MENYELURUH_4_PERAN_2026-09-12.md), keduanya P1/P2 -- tidak ada
-- perubahan perilaku utk guru/admin sungguhan.
--
-- 1) (P1) `infaq_pengajian` dibuka tulis utk pengunjung (migrasi
--    20260911180000, SESUDAH trigger reset 20260911150000 dibuat) tapi
--    lupa dimasukkan ke daftar 9 tabel ber-trigger `pengunjung_jejak_trg`
--    -- akibatnya baris demo pengunjung di tabel ini TIDAK PERNAH
--    otomatis direset 30 hari, beda dari 9 tabel pengunjung lainnya.
--    Fungsi `pengunjung_catat_jejak()` generik, tidak diubah -- cukup
--    pasang triggernya di tabel ini jg (pola sama persis).
--
-- 2) (P2) `jamaah_kehadiran_delete` (migrasi 20260909160000) tidak
--    punya cabang `admin_desa`, padahal 3 kebijakan saudaranya
--    (select/write/update) semua punya. admin_desa jadi tidak bisa
--    membatalkan-centang (hapus) kesalahan input kehadiran jamaah di
--    kelompok pada desanya -- harus eskalasi ke admin_ppg. Badan
--    kebijakan lain (select) disalin sbg acuan cabang admin_desa
--    (join jamaah_acara -> kelompok -> desa_id), ditambahkan ke DELETE.
-- =====================================================================

BEGIN;

-- ── 1) Trigger reset pengunjung utk infaq_pengajian ──────────────────
DROP TRIGGER IF EXISTS pengunjung_jejak_trg ON public.infaq_pengajian;
CREATE TRIGGER pengunjung_jejak_trg AFTER INSERT OR UPDATE ON public.infaq_pengajian
  FOR EACH ROW EXECUTE FUNCTION public.pengunjung_catat_jejak();

-- ── 2) Tambah cabang admin_desa di jamaah_kehadiran_delete ───────────
DROP POLICY IF EXISTS "jamaah_kehadiran_delete" ON public.jamaah_kehadiran;
CREATE POLICY "jamaah_kehadiran_delete" ON public.jamaah_kehadiran
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k
           WHERE (k.id = ( SELECT a.kelompok_id FROM jamaah_acara a WHERE (a.id = jamaah_kehadiran.acara_id))))))
      OR ((p.role = ANY (ARRAY['admin_kelompok'::text, 'penerobos'::text]))
          AND (p.scope_kelompok_id = ( SELECT a.kelompok_id FROM jamaah_acara a WHERE (a.id = jamaah_kehadiran.acara_id))))
    ))));

COMMIT;
