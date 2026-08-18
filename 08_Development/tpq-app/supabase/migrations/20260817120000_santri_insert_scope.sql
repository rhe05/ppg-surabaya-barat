-- =====================================================================
-- 20260817120000_santri_insert_scope.sql
--
-- (Dinomori ulang dari 20260817110000 karena bentrok versi dengan
--  20260817110000_drift_privilege_identity_fk.sql yang lahir di branch lain.)
--
-- Menutup celah scope pada policy INSERT `santri_insert_admin`.
--
-- MASALAH: WITH CHECK versi lama HANYA memeriksa ROLE --
--   p.is_active AND (role = 'admin_ppg' OR 'admin_desa' OR 'admin_kelompok')
-- tanpa memeriksa apakah `kelompok_id` baris yang disisipkan berada di dalam
-- scope pengguna. Akibatnya admin_kelompok kelompok 6 bisa menyisipkan santri
-- ke kelompok 1 lewat `POST /rest/v1/santri` langsung, dan admin_desa bisa
-- menyisipkan ke desa lain. Kebocorannya adalah tulis-lintas-scope, bukan
-- baca: `santri_select_scoped` tetap benar sehingga baris hasil selundupan
-- itu justru tidak terlihat lagi oleh pembuatnya.
--
-- Jalur form Next.js sudah aman lewat RPC `tambah_santri()`
-- (20260817100000_santri_nis_unik_dan_rpc.sql) yang memuat pengecekan scope
-- yang sama di dalam fungsinya. Yang masih terbuka adalah INSERT langsung ke
-- tabel lewat PostgREST -- itu yang ditutup di sini. Setelah migrasi ini,
-- pengecekan di dalam `tambah_santri()` menjadi lapis kedua (pesan error yang
-- lebih ramah), bukan lagi satu-satunya penahan.
--
-- BENTUK PERBAIKAN: meniru PERSIS `santri_update_admin` pada tabel yang sama,
-- yang sejak awal sudah benar -- admin_desa dicocokkan lewat
-- `kelompok.desa_id`, admin_kelompok dicocokkan langsung ke
-- `santri.kelompok_id`. Sengaja tidak memakai bentuk lain (mis. helper
-- function baru) supaya kedua policy bisa dibandingkan sebaris-demi-sebaris.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "santri_insert_admin" ON public.santri;
CREATE POLICY "santri_insert_admin" ON public.santri
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = santri.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = santri.kelompok_id)))))));

COMMIT;
