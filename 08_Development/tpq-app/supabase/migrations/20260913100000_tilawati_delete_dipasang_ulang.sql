-- =====================================================================
-- 20260913100000_tilawati_delete_dipasang_ulang.sql
--
-- BUG: guru Baban (kelas 4) melaporkan tombol hapus di Riwayat
-- Pembelajaran > kartu Al-Qur'an tidak menghilangkan barisnya. Dicek
-- via query diagnostik (pg_policies, dijalankan owner) ke PRODUKSI:
-- tabel `tilawati_pelaksanaan` HANYA punya 3 kebijakan
-- (select/insert/update) -- TIDAK ADA kebijakan DELETE sama sekali.
--
-- Migrasi `20260910120000_tilawati_delete.sql` yang seharusnya
-- menambahkan kebijakan ini (dibuat 2026-09-10 utk kasus serupa milik
-- guru Ratna, tercatat "sudah dijalankan" di riwayat kerja) TERNYATA
-- TIDAK PERNAH benar2 diterapkan di database produksi -- entah
-- terlewat saat paste ke SQL Editor atau sebab lain, hasilnya: TIDAK
-- ADA satu pun guru/admin_kelompok/admin_ppg yang bisa menghapus baris
-- Tilawati/Al-Qur'an sejak awal, bukan cuma soal kelas 4/Al-Qur'an.
--
-- Isi kebijakan SAMA PERSIS dgn migrasi 20260910120000 (badannya sudah
-- benar, cuma belum pernah tereksekusi) -- disalin ulang di sini,
-- idempoten (DROP POLICY IF EXISTS dulu).
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
