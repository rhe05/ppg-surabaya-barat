-- =====================================================================
-- 20260818140000_pengumuman_rls_dan_kategori.sql
--
-- Fondasi DB untuk halaman Pengumuman. Dua hal yang membuat tabelnya belum
-- bisa dipakai sama sekali:
--
-- 1. `pengumuman` dan `kategori_pengumuman` punya RLS AKTIF tapi NOL policy.
--    Efeknya bukan error melainkan senyap: SELECT mengembalikan 0 baris dan
--    INSERT ditolak, seolah-olah tabelnya kosong permanen.
-- 2. `kategori_pengumuman` benar-benar kosong. Daftar bakunya ada di
--    KATEGORI_PENGUMUMAN_ (Modul_MaintainPengumuman.gs:19) dan tidak pernah
--    ikut ter-ETL karena di app lama nilainya cuma konstanta di kode, bukan
--    baris tabel.
--
-- Pola policy meniru tabel yang sudah benar (guru/santri setelah ditambal):
-- SELECT ber-scope termasuk untuk role `guru` — pengumuman memang ditujukan
-- untuk dibaca guru di kelompoknya. INSERT/UPDATE hanya admin DAN ber-scope
-- sejak awal, tidak mengulang kesalahan "cek role tanpa cek kelompok" yang
-- sudah tiga kali ditambal belakangan. DELETE hanya admin_ppg, seragam
-- dengan tabel lain.
--
-- `kategori_pengumuman` adalah tabel REFERENSI (6 baris, sama untuk semua
-- kelompok, tidak punya kolom kelompok_id): semua pengguna aktif boleh
-- membaca, hanya admin_ppg yang boleh mengubah isinya.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ── Seed kategori (KATEGORI_PENGUMUMAN_ app lama, urutan dipertahankan) ──
INSERT INTO public.kategori_pengumuman (nama, urutan)
SELECT v.nama, v.urutan
  FROM (VALUES
    ('Caberawit', 1),
    ('Pra Remaja & Remaja SMA', 2),
    ('Muda Mudi', 3),
    ('Pra 5 Unsur', 4),
    ('5 Unsur', 5),
    ('Khusus', 6)
  ) AS v(nama, urutan)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.kategori_pengumuman k WHERE k.nama = v.nama
 );

-- ── Policy kategori_pengumuman (tabel referensi) ─────────────────────
DROP POLICY IF EXISTS "kategori_pengumuman_select_semua" ON public.kategori_pengumuman;
CREATE POLICY "kategori_pengumuman_select_semua" ON public.kategori_pengumuman
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active)));

DROP POLICY IF EXISTS "kategori_pengumuman_tulis_ppg" ON public.kategori_pengumuman;
CREATE POLICY "kategori_pengumuman_tulis_ppg" ON public.kategori_pengumuman
  AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND (p.role = 'admin_ppg'::text)))));

-- ── Policy pengumuman ────────────────────────────────────────────────
DROP POLICY IF EXISTS "pengumuman_select_scoped" ON public.pengumuman;
CREATE POLICY "pengumuman_select_scoped" ON public.pengumuman
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = pengumuman.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = pengumuman.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = pengumuman.kelompok_id)))))));

DROP POLICY IF EXISTS "pengumuman_insert_admin" ON public.pengumuman;
CREATE POLICY "pengumuman_insert_admin" ON public.pengumuman
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = pengumuman.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = pengumuman.kelompok_id)))))));

DROP POLICY IF EXISTS "pengumuman_update_admin" ON public.pengumuman;
CREATE POLICY "pengumuman_update_admin" ON public.pengumuman
  AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = pengumuman.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = pengumuman.kelompok_id)))))));

-- Beda dari tabel lain: DELETE di sini TIDAK dibatasi admin_ppg saja.
-- Pengumuman itu catatan berumur pendek yang dibuat & dicabut sendiri oleh
-- admin kelompok — mengharuskan admin_ppg untuk menghapusnya akan membuat
-- pengumuman kedaluwarsa menumpuk. Tabelnya juga tidak punya `deleted_at`,
-- jadi tidak ada jalur hapus halus seperti santri/guru.
DROP POLICY IF EXISTS "pengumuman_delete_admin" ON public.pengumuman;
CREATE POLICY "pengumuman_delete_admin" ON public.pengumuman
  AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = pengumuman.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = pengumuman.kelompok_id)))))));

COMMIT;
