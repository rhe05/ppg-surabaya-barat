-- =====================================================================
-- 20260910160000_santri_select_penerobos.sql
--
-- Fitur: form Tambah Jamaah (Penerobos Kelp) menyarankan nama saat
-- diketik dari data GENERUS sekelompok (nama generus + nama ayah + nama
-- ibu) lalu autofill alamat/WA/wilayah keluarganya — supaya penerobos
-- tak mengetik ulang data yang sudah ada di Data Generus.
--
-- Untuk itu peran 'penerobos' perlu BISA MEMBACA tabel `santri` di
-- kelompoknya sendiri (read-only — penerobos tetap TIDAK bisa
-- insert/update/delete santri; policy tulis tak disentuh).
--
-- Perubahan: tambah satu cabang OR ke `santri_select_scoped` — persis
-- pola cabang 'guru' (se-kelompok). Badan lama DISALIN dari produksi
-- (pg_get_expr, 2026-09-10), hanya 1 baris ditambahkan. Idempoten.
-- =====================================================================

BEGIN;

DROP POLICY IF EXISTS "santri_select_scoped" ON public.santri;

CREATE POLICY "santri_select_scoped" ON public.santri
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text)
          AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = santri.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = santri.kelompok_id))
      OR ((p.role = 'guru'::text)           AND (p.scope_kelompok_id = santri.kelompok_id))
      OR ((p.role = 'penerobos'::text)      AND (p.scope_kelompok_id = santri.kelompok_id))
    )));

COMMIT;
