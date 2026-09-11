-- =====================================================================
-- 20260911150000_pengunjung_tulis_dan_reset.sql
--
-- Fitur "Pengunjung" -- perubahan arah (diminta owner 2026-09-11):
-- pengunjung BOLEH input & edit data (bukan read-only lagi), TAPI setiap
-- baris yang dia sentuh (baru ATAU edit baris contoh yang sudah ada)
-- otomatis DIRESET 30 hari sejak SENTUHAN TERAKHIR -- baris baru dihapus,
-- baris contoh yang diedit dikembalikan ke keadaan semula. Pembersihan
-- dipicu Vercel Cron (bukan pg_cron -- belum aktif di project ini),
-- lihat frontend/app/api/cron/reset-pengunjung/route.ts + vercel.json.
--
-- Mekanisme:
--   1. Tabel `pengunjung_jejak` -- satu baris per (tabel, baris_id) yang
--      pernah disentuh pengunjung. `aksi`='insert' -> baris BARU (nanti
--      dihapus utuh). `aksi`='update' -> baris CONTOH yang diedit
--      (snapshot_sebelum = keadaan SEBELUM sentuhan pertama, nanti
--      dikembalikan). RLS: TIDAK ADA kebijakan sama sekali -- cuma
--      trigger & RPC SECURITY DEFINER yang boleh menyentuhnya.
--   2. Trigger generik `pengunjung_catat_jejak()` dipasang di 9 tabel yang
--      punya jalur tulis utk pengunjung. Nol-efek utk peran lain (guru/
--      admin sungguhan) -- baris pertama fungsi cek role, langsung RETURN
--      kalau bukan 'pengunjung'.
--   3. RPC `reset_data_pengunjung_kadaluwarsa()` -- proses jejak yang
--      `disentuh_pada` sudah lewat 30 hari: DELETE (aksi=insert) atau
--      restore dari snapshot (aksi=update) via SQL dinamis (nama tabel
--      HANYA berasal dari TG_TABLE_NAME yang dipasang manual di sini,
--      tidak pernah dari input pengguna -- aman dari injeksi).
--   4. Kebijakan INSERT/UPDATE tambahan utk `pengunjung` (scoped kelompok
--      demo + `pengunjung_masih_berlaku()`) di: jamaah, sub_kelp,
--      jamaah_konfig, jamaah_acara, jamaah_kehadiran, jamaah_pengurus
--      (App Penerobos Kelp) & absensi, jurnal_materi, tilawati_pelaksanaan
--      (App Guru). Badan kebijakan lama disalin dari produksi
--      (pg_get_expr, 2026-09-11), cuma menambah SATU cabang OR.
--
-- BELUM di berkas ini: frontend (hapus penjagaan "hanya untuk melihat"
-- yang baru ditambah commit 4186bc1/9c5e351, sebagian jadi tidak relevan)
-- + rute API Vercel Cron. Menyusul di commit terpisah. Idempoten.
-- =====================================================================

BEGIN;

-- ── 1) Tabel jejak ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pengunjung_jejak (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabel text NOT NULL,
  id_kolom text NOT NULL DEFAULT 'id',
  baris_id bigint NOT NULL,
  aksi text NOT NULL CHECK (aksi IN ('insert', 'update')),
  snapshot_sebelum jsonb,
  disentuh_pada timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tabel, baris_id)
);

ALTER TABLE public.pengunjung_jejak ENABLE ROW LEVEL SECURITY;
-- SENGAJA tanpa kebijakan sama sekali -- cuma trigger & RPC SECURITY
-- DEFINER (di bawah) yang boleh baca/tulis tabel ini.
REVOKE ALL ON public.pengunjung_jejak FROM PUBLIC, anon, authenticated;

-- ── 2) Trigger generik ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pengunjung_catat_jejak()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_role text;
  v_id bigint;
  v_id_kolom text;
BEGIN
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'pengunjung' THEN
    RETURN NEW;
  END IF;

  -- Sebagian besar tabel pakai `id`; jamaah_konfig PK-nya `kelompok_id`.
  IF (to_jsonb(NEW) ? 'id') THEN
    v_id_kolom := 'id';
    v_id := (to_jsonb(NEW) ->> 'id')::bigint;
  ELSE
    v_id_kolom := 'kelompok_id';
    v_id := (to_jsonb(NEW) ->> 'kelompok_id')::bigint;
  END IF;

  INSERT INTO pengunjung_jejak (tabel, id_kolom, baris_id, aksi, snapshot_sebelum, disentuh_pada)
  VALUES (
    TG_TABLE_NAME,
    v_id_kolom,
    v_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    now()
  )
  ON CONFLICT (tabel, baris_id) DO UPDATE SET disentuh_pada = now();
  -- SENGAJA cuma disentuh_pada yang diperbarui saat baris sudah terjejak
  -- -- aksi & snapshot_sebelum tetap yang PERTAMA (baris yg tadinya
  -- 'insert' baru lalu diedit lagi TETAP 'insert', supaya nanti dihapus
  -- utuh, bukan "direvert" ke keadaan tengah-edit yang juga bukan asli).

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pengunjung_catat_jejak() FROM PUBLIC;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'jamaah', 'sub_kelp', 'jamaah_konfig', 'jamaah_acara',
    'jamaah_kehadiran', 'jamaah_pengurus',
    'absensi', 'jurnal_materi', 'tilawati_pelaksanaan'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS pengunjung_jejak_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER pengunjung_jejak_trg AFTER INSERT OR UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.pengunjung_catat_jejak()',
      t
    );
  END LOOP;
END $$;

-- ── 3) RPC pembersihan (dipanggil Vercel Cron 1x/hari) ────────────────
CREATE OR REPLACE FUNCTION public.reset_data_pengunjung_kadaluwarsa()
RETURNS TABLE(dihapus int, dikembalikan int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  j record;
  v_dihapus int := 0;
  v_dikembalikan int := 0;
  v_kolom text;
BEGIN
  FOR j IN
    SELECT * FROM pengunjung_jejak WHERE disentuh_pada < now() - interval '30 days'
  LOOP
    IF j.aksi = 'insert' THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', j.tabel, j.id_kolom) USING j.baris_id;
      v_dihapus := v_dihapus + 1;
    ELSE
      SELECT string_agg(quote_ident(key), ',') INTO v_kolom
      FROM jsonb_object_keys(j.snapshot_sebelum) AS key;

      IF v_kolom IS NOT NULL THEN
        EXECUTE format(
          'UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(null::public.%I, $1)) WHERE %I = $2',
          j.tabel, v_kolom, v_kolom, j.tabel, j.id_kolom
        ) USING j.snapshot_sebelum, j.baris_id;
        v_dikembalikan := v_dikembalikan + 1;
      END IF;
    END IF;

    DELETE FROM pengunjung_jejak WHERE id = j.id;
  END LOOP;

  RETURN QUERY SELECT v_dihapus, v_dikembalikan;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_data_pengunjung_kadaluwarsa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_data_pengunjung_kadaluwarsa() TO anon, authenticated;

-- ── 4) Kebijakan INSERT/UPDATE tambahan utk `pengunjung` ─────────────
-- App Penerobos Kelp (kelompok-scoped, sama pola cabang 'penerobos')
DROP POLICY IF EXISTS "jamaah_insert" ON public.jamaah;
CREATE POLICY "jamaah_insert" ON public.jamaah
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_update" ON public.jamaah;
CREATE POLICY "jamaah_update" ON public.jamaah
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "sub_kelp_insert" ON public.sub_kelp;
CREATE POLICY "sub_kelp_insert" ON public.sub_kelp
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = sub_kelp.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "sub_kelp_update" ON public.sub_kelp;
CREATE POLICY "sub_kelp_update" ON public.sub_kelp
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = sub_kelp.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_konfig_insert" ON public.jamaah_konfig;
CREATE POLICY "jamaah_konfig_insert" ON public.jamaah_konfig
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_konfig.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_konfig_update" ON public.jamaah_konfig;
CREATE POLICY "jamaah_konfig_update" ON public.jamaah_konfig
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_konfig.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_acara_insert" ON public.jamaah_acara;
CREATE POLICY "jamaah_acara_insert" ON public.jamaah_acara
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_acara.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_acara_update" ON public.jamaah_acara;
CREATE POLICY "jamaah_acara_update" ON public.jamaah_acara
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_acara.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_kehadiran_write" ON public.jamaah_kehadiran;
CREATE POLICY "jamaah_kehadiran_write" ON public.jamaah_kehadiran
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k
           WHERE (k.id = ( SELECT a.kelompok_id FROM jamaah_acara a WHERE (a.id = jamaah_kehadiran.acara_id))))))
      OR ((p.role = ANY (ARRAY['admin_kelompok'::text, 'penerobos'::text]))
          AND (p.scope_kelompok_id = ( SELECT a.kelompok_id FROM jamaah_acara a WHERE (a.id = jamaah_kehadiran.acara_id))))
      OR ((p.role = 'pengunjung'::text)
          AND (p.scope_kelompok_id = ( SELECT a.kelompok_id FROM jamaah_acara a WHERE (a.id = jamaah_kehadiran.acara_id)))
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_kehadiran_update" ON public.jamaah_kehadiran;
CREATE POLICY "jamaah_kehadiran_update" ON public.jamaah_kehadiran
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k
           WHERE (k.id = ( SELECT a.kelompok_id FROM jamaah_acara a WHERE (a.id = jamaah_kehadiran.acara_id))))))
      OR ((p.role = ANY (ARRAY['admin_kelompok'::text, 'penerobos'::text]))
          AND (p.scope_kelompok_id = ( SELECT a.kelompok_id FROM jamaah_acara a WHERE (a.id = jamaah_kehadiran.acara_id))))
      OR ((p.role = 'pengunjung'::text)
          AND (p.scope_kelompok_id = ( SELECT a.kelompok_id FROM jamaah_acara a WHERE (a.id = jamaah_kehadiran.acara_id)))
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_pengurus_insert" ON public.jamaah_pengurus;
CREATE POLICY "jamaah_pengurus_insert" ON public.jamaah_pengurus
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_pengurus.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_pengurus_update" ON public.jamaah_pengurus;
CREATE POLICY "jamaah_pengurus_update" ON public.jamaah_pengurus
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_pengurus.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

-- App Guru
DROP POLICY IF EXISTS "absensi_insert_guru_admin" ON public.absensi;
CREATE POLICY "absensi_insert_guru_admin" ON public.absensi
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text) OR (p.role = 'admin_desa'::text) OR (p.role = 'admin_kelompok'::text)
      OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = ( SELECT santri.kelompok_id FROM santri WHERE (santri.id = absensi.santri_id))))
      OR ((p.role = 'pengunjung'::text)
          AND (p.scope_kelompok_id = ( SELECT santri.kelompok_id FROM santri WHERE (santri.id = absensi.santri_id)))
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "absensi_update_guru_admin" ON public.absensi;
CREATE POLICY "absensi_update_guru_admin" ON public.absensi
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = absensi.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = absensi.kelompok_id))
      OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = absensi.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = absensi.kelompok_id) AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jurnal_materi_insert_guru_admin" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_insert_guru_admin" ON public.jurnal_materi
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM (kelompok k JOIN kelas kl ON ((kl.kelompok_id = k.id))) WHERE (kl.id = jurnal_materi.kelas_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = ( SELECT kl.kelompok_id FROM kelas kl WHERE (kl.id = jurnal_materi.kelas_id))))
      OR ((p.role = 'guru'::text) AND (p.guru_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM kelas kl
           WHERE ((kl.id = jurnal_materi.kelas_id) AND ((p.guru_id = kl.guru_id) OR (p.guru_id = kl.guru_id_2))))))
      OR ((p.role = 'pengunjung'::text) AND (p.guru_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM kelas kl
           WHERE ((kl.id = jurnal_materi.kelas_id) AND ((p.guru_id = kl.guru_id) OR (p.guru_id = kl.guru_id_2)))))
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jurnal_materi_update_guru_admin" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_update_guru_admin" ON public.jurnal_materi
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM (kelompok k JOIN kelas kl ON ((kl.kelompok_id = k.id))) WHERE (kl.id = jurnal_materi.kelas_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = ( SELECT kl.kelompok_id FROM kelas kl WHERE (kl.id = jurnal_materi.kelas_id))))
      OR ((p.role = 'guru'::text) AND (p.guru_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM kelas kl
           WHERE ((kl.id = jurnal_materi.kelas_id) AND ((p.guru_id = kl.guru_id) OR (p.guru_id = kl.guru_id_2))))))
      OR ((p.role = 'pengunjung'::text) AND (p.guru_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM kelas kl
           WHERE ((kl.id = jurnal_materi.kelas_id) AND ((p.guru_id = kl.guru_id) OR (p.guru_id = kl.guru_id_2)))))
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "tilawati_insert_guru_admin" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_insert_guru_admin" ON public.tilawati_pelaksanaan
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
       (( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'::text)
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_desa'::text)
        AND (( SELECT p.scope_desa_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
             = ( SELECT k.desa_id FROM (kelompok k JOIN kelas kl ON ((kl.kelompok_id = k.id))) WHERE (kl.id = tilawati_pelaksanaan.kelas_id))))
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_kelompok'::text)
        AND (( SELECT p.scope_kelompok_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = ( SELECT kl.kelompok_id FROM kelas kl WHERE (kl.id = tilawati_pelaksanaan.kelas_id))))
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'guru'::text)
        AND (kelas_id IN ( SELECT kl.id FROM kelas kl
             WHERE ((( SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id)
                 OR (( SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2)))))
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'pengunjung'::text)
        AND (kelas_id IN ( SELECT kl.id FROM kelas kl
             WHERE ((( SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id)
                 OR (( SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2))))
        AND public.pengunjung_masih_berlaku())
  );

DROP POLICY IF EXISTS "tilawati_update_guru_admin" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_update_guru_admin" ON public.tilawati_pelaksanaan
  AS PERMISSIVE FOR UPDATE TO public
  USING (
       (( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'::text)
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_kelompok'::text)
        AND (( SELECT p.scope_kelompok_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kelompok_id))
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'guru'::text)
        AND (kelas_id IN ( SELECT kl.id FROM kelas kl
             WHERE ((( SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id)
                 OR (( SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2)))))
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'pengunjung'::text)
        AND (kelas_id IN ( SELECT kl.id FROM kelas kl
             WHERE ((( SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id)
                 OR (( SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2))))
        AND public.pengunjung_masih_berlaku())
  );

COMMIT;
