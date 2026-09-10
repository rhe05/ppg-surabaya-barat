-- =====================================================================
-- 20260910180000_guru_select_penerobos.sql
--
-- KPI "Ringkasan Jamaah" (beranda Penerobos Kelp) menampilkan hitungan
-- "MS" (Muballigh/ot Setempat). Sebagian data MS ada di tabel `guru`
-- (kategori = 'Muballigh Setempat'), bukan cuma di `jamaah` — jadi
-- peran 'penerobos' perlu BISA MEMBACA `guru` di kelompoknya sendiri
-- (read-only; penerobos TIDAK bisa insert/update/delete guru).
--
-- Perubahan: tambah satu cabang OR ke `guru_select_scoped` — pola
-- cabang 'admin_kelompok' (se-kelompok). Badan lama DISALIN dari produksi
-- (pg_get_expr, 2026-09-10), hanya 1 baris ditambahkan. Idempoten.
-- Selaras dgn 20260910160000 (santri_select_scoped + penerobos).
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "guru_select_scoped" ON public.guru;

CREATE POLICY "guru_select_scoped" ON public.guru
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text)
          AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = guru.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = guru.kelompok_id))
      OR ((p.role = 'guru'::text)
          AND ((p.scope_kelompok_id = guru.kelompok_id) OR (p.guru_id = guru.id)))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = guru.kelompok_id))
    )));

COMMIT;
