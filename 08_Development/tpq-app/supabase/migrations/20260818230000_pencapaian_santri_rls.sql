-- =====================================================================
-- 20260818230000_pencapaian_santri_rls.sql
--
-- Fondasi untuk pencatatan PENCAPAIAN SANTRI terhadap target bulanan
-- kurikulum (serverGetPencapaianSantri / serverUpdatePencapaianSantri,
-- Modul_MaintainKurikulum.gs:761-814). Tabelnya RLS aktif dengan NOL policy.
--
-- Aturan:
--   SELECT — ber-scope biasa, TERMASUK guru untuk kelompoknya: pencapaian
--            santri justru catatan yang dipakai guru sehari-hari.
--   TULIS  — admin DAN guru dalam kelompok yang sama. Berbeda dari
--            kurikulum_prota/promes/probul yang hanya admin: menyusun
--            RENCANA kurikulum memang wewenang admin, tapi menandai
--            pencapaian tiap santri adalah pekerjaan guru kelasnya.
--            serverUpdatePencapaianSantri app lama pun hanya menuntut sesi
--            valid + akses kelompok, bukan peran admin.
--
-- Satu baris = satu santri untuk satu target bulanan, jadi pasangan
-- (santri_id, probul_id) ditegakkan unik. App lama tidak menjaganya sama
-- sekali sehingga satu santri bisa punya dua catatan untuk target yang
-- sama, dan mana yang benar jadi tidak jelas.
--
-- `kurikulum_probul_minggu` ikut diberi policy di sini: tabel turunan
-- probul yang belum pernah dipakai UI mana pun, tapi kalau dibiarkan tanpa
-- policy ia akan diam-diam mengembalikan nol baris begitu dipakai nanti.
-- Hak aksesnya menumpang induknya, dengan pemisahan baca/tulis yang sama
-- seperti kop_surat_baris.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pencapaian_santri_probul
  ON public.kurikulum_pencapaian_santri (santri_id, probul_id);

DROP POLICY IF EXISTS "pencapaian_select_scoped" ON public.kurikulum_pencapaian_santri;
CREATE POLICY "pencapaian_select_scoped" ON public.kurikulum_pencapaian_santri
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kurikulum_pencapaian_santri.kelompok_id))
     OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = kurikulum_pencapaian_santri.kelompok_id))));

DROP POLICY IF EXISTS "pencapaian_tulis_admin_guru" ON public.kurikulum_pencapaian_santri;
CREATE POLICY "pencapaian_tulis_admin_guru" ON public.kurikulum_pencapaian_santri
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kurikulum_pencapaian_santri.kelompok_id))
     OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = kurikulum_pencapaian_santri.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = kurikulum_pencapaian_santri.kelompok_id))
     OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = kurikulum_pencapaian_santri.kelompok_id))));

-- ── Turunan probul ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "probul_minggu_select_ikut_induk" ON public.kurikulum_probul_minggu;
CREATE POLICY "probul_minggu_select_ikut_induk" ON public.kurikulum_probul_minggu
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1 FROM public.kurikulum_probul b
                   WHERE b.id = kurikulum_probul_minggu.probul_id));

-- Tulis TIDAK boleh sekadar menumpang keterlihatan induk: probul terlihat
-- oleh guru juga, sedangkan menyusun rencana kurikulum wewenang admin.
DROP POLICY IF EXISTS "probul_minggu_tulis_admin" ON public.kurikulum_probul_minggu;
CREATE POLICY "probul_minggu_tulis_admin" ON public.kurikulum_probul_minggu
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
   FROM public.kurikulum_probul b,
        auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE b.id = kurikulum_probul_minggu.probul_id AND p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = b.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = b.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
   FROM public.kurikulum_probul b,
        auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE b.id = kurikulum_probul_minggu.probul_id AND p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = b.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = b.kelompok_id))));

COMMIT;
