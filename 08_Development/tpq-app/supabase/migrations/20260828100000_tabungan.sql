-- =====================================================================
-- 20260828100000_tabungan.sql
--
-- Fitur "Tabungan" (2026-08-28). Tabungan generus per-SANTRI (bukan
-- per-kelas -- santri bawa tabungannya walau pindah kelas). Tiap kelompok
-- punya beberapa JENIS tabungan (mis. "Tabungan Rekreasi", "Tabungan
-- Qurban") yang bisa diatur admin_kelompok + target per bulan. Guru
-- mencatat setoran/penarikan utk santri yang dia ajar; admin melihat
-- total keseluruhan & per-santri.
--
--   tabungan_jenis     : daftar jenis per kelompok + target_bulanan.
--   tabungan_transaksi : setoran ('masuk') / penarikan ('keluar').
--
-- RLS meniru pola kalender_kelompok (baca: admin scope + guru sekelompok;
-- tulis jenis: admin scope). tabungan_transaksi: guru boleh INSERT/UPDATE/
-- DELETE utk santri yang ada di kelas yang DIA AMPU, admin scope bebas
-- dalam kelompoknya.
--
-- Idempoten.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.tabungan_jenis (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id     bigint NOT NULL REFERENCES public.kelompok (id),
  nama            text   NOT NULL,
  target_bulanan  bigint,
  urutan          int    NOT NULL DEFAULT 0,
  aktif           boolean NOT NULL DEFAULT true,
  dibuat_oleh     uuid REFERENCES public.profiles (id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_tabungan_jenis_nama UNIQUE (kelompok_id, nama),
  CONSTRAINT chk_tabungan_target_nonneg CHECK (target_bulanan IS NULL OR target_bulanan >= 0)
);
COMMENT ON TABLE public.tabungan_jenis IS
  'Jenis tabungan per kelompok (mis. Rekreasi, Qurban) + target_bulanan opsional. Diatur admin_kelompok.';

CREATE TABLE IF NOT EXISTS public.tabungan_transaksi (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id  bigint NOT NULL REFERENCES public.kelompok (id),
  jenis_id     bigint NOT NULL REFERENCES public.tabungan_jenis (id),
  santri_id    bigint NOT NULL REFERENCES public.santri (id),
  arah         text   NOT NULL,
  jumlah       bigint NOT NULL,
  tanggal      date   NOT NULL DEFAULT current_date,
  keterangan   text,
  dicatat_oleh uuid REFERENCES public.profiles (id),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_tabungan_arah   CHECK (arah IN ('masuk', 'keluar')),
  CONSTRAINT chk_tabungan_jumlah CHECK (jumlah > 0)
);
COMMENT ON TABLE public.tabungan_transaksi IS
  'Setoran (masuk) / penarikan (keluar) tabungan per santri per jenis. Guru catat utk santri kelasnya; admin bebas dlm kelompok.';

CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_santri ON public.tabungan_transaksi (santri_id, jenis_id);
CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_kelompok ON public.tabungan_transaksi (kelompok_id, tanggal);

ALTER TABLE public.tabungan_jenis     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabungan_transaksi ENABLE ROW LEVEL SECURITY;

-- ── tabungan_jenis ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "tabungan_jenis_select_scoped" ON public.tabungan_jenis;
CREATE POLICY "tabungan_jenis_select_scoped" ON public.tabungan_jenis
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_jenis.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_jenis.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = tabungan_jenis.kelompok_id))));

DROP POLICY IF EXISTS "tabungan_jenis_tulis_admin" ON public.tabungan_jenis;
CREATE POLICY "tabungan_jenis_tulis_admin" ON public.tabungan_jenis
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_jenis.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_jenis.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_jenis.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_jenis.kelompok_id))));

-- ── tabungan_transaksi ───────────────────────────────────────────────
-- Guru boleh menyentuh baris utk santri yang ada di kelas yang DIA AMPU.
DROP POLICY IF EXISTS "tabungan_transaksi_select_scoped" ON public.tabungan_transaksi;
CREATE POLICY "tabungan_transaksi_select_scoped" ON public.tabungan_transaksi
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_transaksi.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id))));

DROP POLICY IF EXISTS "tabungan_transaksi_tulis" ON public.tabungan_transaksi;
CREATE POLICY "tabungan_transaksi_tulis" ON public.tabungan_transaksi
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_transaksi.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id)
       OR (p.role = 'guru' AND EXISTS (
             SELECT 1 FROM santri s JOIN kelas k ON k.id = s.kelas_id
              WHERE s.id = tabungan_transaksi.santri_id
                AND k.guru_id = p.guru_id AND k.deleted_at IS NULL)))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_transaksi.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id)
       OR (p.role = 'guru' AND EXISTS (
             SELECT 1 FROM santri s JOIN kelas k ON k.id = s.kelas_id
              WHERE s.id = tabungan_transaksi.santri_id
                AND k.guru_id = p.guru_id AND k.deleted_at IS NULL)))));

-- Seed 2 jenis default utk tiap kelompok yang belum punya (owner: mulai
-- dari "Tabungan Rekreasi" & "Tabungan Qurban").
INSERT INTO public.tabungan_jenis (kelompok_id, nama, urutan)
SELECT k.id, v.nama, v.urutan
  FROM public.kelompok k
 CROSS JOIN (VALUES ('Tabungan Rekreasi', 1), ('Tabungan Qurban', 2)) AS v(nama, urutan)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.tabungan_jenis tj
    WHERE tj.kelompok_id = k.id AND tj.nama = v.nama
 );

COMMIT;
