-- =====================================================================
-- 20260818150000_konseling_rls.sql
--
-- Fondasi DB untuk halaman Bimbingan Konseling. Sama seperti `pengumuman`
-- kemarin sore: tabel `konseling` punya RLS AKTIF tapi NOL policy —
-- tertutup senyap, SELECT selalu 0 baris, INSERT selalu ditolak.
--
-- Aturannya ditiru PERSIS dari Modul_MaintainKonseling.gs, bukan
-- diseragamkan dengan tabel lain, karena konseling memang punya aturan
-- sendiri yang lebih ketat:
--
--   SELECT  — ber-scope biasa, TERMASUK role `guru` untuk kelompoknya
--             (serverGetKonselingList:31-40 memberi guru accessible
--             kelompok = scope_id-nya).
--   INSERT  — semua peran yang punya akses ke kelompok santri, guru ikut
--             (serverCreateKonseling:170 memakai validateUserAccess biasa).
--   UPDATE  — HANYA pencatat aslinya ATAU admin_ppg
--             (serverUpdateKonseling:220-223, apa adanya). Jadi admin
--             kelompok TIDAK bisa menyunting catatan orang lain; ini
--             disengaja, isi konseling bersifat sensitif.
--   DELETE  — tidak diberi policy sama sekali. App lama membatasi hapus ke
--             admin_ppg, dan karena tabel ini punya `deleted_at`, jalur
--             yang benar adalah hapus HALUS lewat UPDATE — yang otomatis
--             ikut aturan UPDATE di atas.
--
-- Ditambah satu aturan yang di app lama hanya dijaga kode (dan karena itu
-- bisa bocor lewat penulisan serentak): larangan dua catatan untuk santri
-- yang sama pada tanggal yang sama (serverCreateKonseling:176-181). Di sini
-- ditegakkan indeks unik parsial supaya Postgres yang menjamin, bukan
-- pemeriksaan baca-lalu-tulis.
--
-- ⚠️ Indeks uniknya PARSIAL — `.upsert({ onConflict })` akan gagal 42P10,
-- sama seperti jurnal_kbm. Frontend harus cek-lalu-insert.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_konseling_santri_tanggal
  ON public.konseling (santri_id, tanggal)
  WHERE (deleted_at IS NULL);

DROP POLICY IF EXISTS "konseling_select_scoped" ON public.konseling;
CREATE POLICY "konseling_select_scoped" ON public.konseling
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = konseling.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = konseling.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = konseling.kelompok_id)))))));

DROP POLICY IF EXISTS "konseling_insert_scoped" ON public.konseling;
CREATE POLICY "konseling_insert_scoped" ON public.konseling
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id
           FROM kelompok k
          WHERE (k.id = konseling.kelompok_id)))) OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = konseling.kelompok_id)) OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = konseling.kelompok_id)))))));

-- Hanya pencatat asli atau admin_ppg. Tanpa WITH CHECK terpisah: Postgres
-- memakai ekspresi USING sebagai pemeriksa baris baru, jadi pencatat tetap
-- tidak bisa mengoper catatan ke orang lain.
DROP POLICY IF EXISTS "konseling_update_pencatat_atau_ppg" ON public.konseling;
CREATE POLICY "konseling_update_pencatat_atau_ppg" ON public.konseling
  AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE (p.is_active AND ((p.role = 'admin_ppg'::text) OR (konseling.pencatat_id = auth.uid()))))));

COMMIT;
