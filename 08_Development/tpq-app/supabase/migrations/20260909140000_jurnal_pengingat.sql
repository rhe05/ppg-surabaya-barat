-- =====================================================================
-- 20260909140000_jurnal_pengingat.sql
--
-- Fase 1 "Ringkasan Jurnal Pembelajaran" (admin kelp mobile): kartu
-- pemantauan jurnal per kelas + tombol "Kirim Pengingat" ke guru, dengan
-- JEJAK (kapan terakhir diingatkan). Tabel ini = log append-only
-- pengiriman pengingat itu.
--
-- Pengiriman pengingat JUGA membuat 1 baris `pengumuman` (supaya masuk
-- lonceng guru) -- id-nya disimpan di pengumuman_id.
--
-- RLS: baca se-kelompok (admin sesuai scope + guru kelompoknya), tulis
-- hanya admin (ppg/desa/kelompok sesuai scope). Tidak ada update/delete
-- -- ini catatan riwayat.
--
-- Berkas idempoten.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.jurnal_pengingat (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id    bigint NOT NULL REFERENCES public.kelompok (id),
  kelas_id       bigint NOT NULL REFERENCES public.kelas (id),
  guru_id        bigint REFERENCES public.guru (id),
  catatan        text,                       -- ringkasan kondisi saat dikirim (opsional)
  pengumuman_id  bigint REFERENCES public.pengumuman (id) ON DELETE SET NULL,
  dikirim_oleh   uuid REFERENCES public.profiles (id),
  dikirim_pada   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jurnal_pengingat_kelas
  ON public.jurnal_pengingat (kelas_id, dikirim_pada DESC);
CREATE INDEX IF NOT EXISTS idx_jurnal_pengingat_kelompok
  ON public.jurnal_pengingat (kelompok_id, dikirim_pada DESC);

ALTER TABLE public.jurnal_pengingat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jurnal_pengingat_select_scoped" ON public.jurnal_pengingat;
CREATE POLICY "jurnal_pengingat_select_scoped" ON public.jurnal_pengingat
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k WHERE k.id = jurnal_pengingat.kelompok_id))
      OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = jurnal_pengingat.kelompok_id)
    )
  ));

DROP POLICY IF EXISTS "jurnal_pengingat_insert_admin" ON public.jurnal_pengingat;
CREATE POLICY "jurnal_pengingat_insert_admin" ON public.jurnal_pengingat
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k WHERE k.id = jurnal_pengingat.kelompok_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = jurnal_pengingat.kelompok_id)
    )
  ));

COMMENT ON TABLE public.jurnal_pengingat IS
  'Log append-only: admin mengirim pengingat jurnal ke guru sebuah kelas (Ringkasan Jurnal Pembelajaran, admin kelp mobile). Juga membuat baris pengumuman utk lonceng guru.';

COMMIT;
