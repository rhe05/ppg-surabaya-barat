-- =====================================================================
-- 20260910120000_tilawati_delete.sql
--
-- Kebijakan DELETE untuk tilawati_pelaksanaan.
--
-- LATAR: guru Kelp Petemon (Ratna) melaporkan tidak bisa MEMPERBAIKI
-- pencapaian Tilawati santri yang salah -- catatan Buku Jilid yang
-- terlanjur "naik" berlebihan tidak bisa dihapus, hanya bisa ditambah.
-- Tabel ini punya policy INSERT/UPDATE/SELECT (migrasi 20260903120000)
-- tapi TIDAK ada DELETE -> baris salah nyangkut selamanya & "pencapaian
-- terakhir" (baris tanggal termuda) jadi keliru.
--
-- Cakupan DELETE = SAMA PERSIS dgn UPDATE (tilawati_update_guru_admin):
-- guru atas kelasnya sendiri (guru_id / guru_id_2), admin_kelompok
-- se-kelompok, admin_ppg. Frontend (Riwayat Pembelajaran > Tilawati)
-- memberi tombol hapus per baris riwayat.
--
-- Idempoten: DROP POLICY IF EXISTS sebelum CREATE.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "tilawati_delete_guru_admin" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_delete_guru_admin" ON public.tilawati_pelaksanaan
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1
      FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
     WHERE p.is_active AND (
          p.role = 'admin_ppg'::text
       OR (p.role = 'admin_kelompok'::text
           AND p.scope_kelompok_id = tilawati_pelaksanaan.kelompok_id)
       OR (p.role = 'guru'::text
           AND tilawati_pelaksanaan.kelas_id IN (
                 SELECT kl.id FROM public.kelas kl
                  WHERE p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
     )
  ));

COMMIT;
