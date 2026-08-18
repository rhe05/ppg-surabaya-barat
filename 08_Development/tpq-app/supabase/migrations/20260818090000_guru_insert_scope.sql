-- =====================================================================
-- 20260818090000_guru_insert_scope.sql
--
-- Menutup celah scope pada policy INSERT `guru_insert_admin` — celah yang
-- sama persis dengan `santri_insert_admin` (ditutup di 20260817120000).
--
-- MASALAH: WITH CHECK versi lama HANYA memeriksa ROLE, tanpa mencocokkan
-- `kelompok_id` baris baru dengan scope pengguna. Akibatnya admin_kelompok
-- kelompok 6 bisa menyisipkan guru ke kelompok 1 lewat
-- `POST /rest/v1/guru`, lalu baris itu tidak terlihat lagi olehnya sendiri
-- karena `guru_select_scoped` memang sudah ber-scope dengan benar.
--
-- Berbeda dari santri, guru TIDAK punya RPC penambah (tidak ada NIS yang
-- perlu dibuat atomik), jadi form Next.js memang menulis lewat
-- `.insert()` langsung — policy ini satu-satunya penahan, bukan lapis kedua.
--
-- BENTUK PERBAIKAN: meniru PERSIS `guru_update_admin` pada tabel yang sama,
-- yang sejak awal sudah benar. UPDATE dan DELETE tidak disentuh:
-- `guru_update_admin` sudah ber-scope, `guru_delete_ppg_only` memang
-- sengaja hanya admin_ppg.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "guru_insert_admin" ON public.guru;
CREATE POLICY "guru_insert_admin" ON public.guru
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = guru.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = guru.kelompok_id)))))));

COMMIT;
