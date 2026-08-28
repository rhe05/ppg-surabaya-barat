-- =====================================================================
-- 20260828140000_tabungan_terima_setor_tarik.sql
--
-- Perluasan fitur Tabungan (permintaan owner 2026-08-28). Alur uang
-- tabungan generus dipecah jadi 3 langkah, bukan lagi cuma masuk/keluar:
--
--   TERIMA  guru menerima uang tunai DARI generus. Uang masuk ke tangan
--           guru DAN menambah saldo tabungan santri. Efektif seketika.
--   SETOR   guru menyerahkan uang yang sudah terkumpul KE penghimpun
--           (guru/pengurus yang diamanahi admin_kelompok -- tiap kelompok
--           beda: ada yang tiap guru pegang sendiri, ada yang dihimpun
--           satu orang). Memindahkan kas, TIDAK mengubah saldo santri
--           mana pun. Dicatat di tabel terpisah (tabungan_setoran).
--   TARIK   generus/wali menarik tabungannya. Mengurangi saldo santri.
--           WAJIB persetujuan admin_kelompok: dibuat status 'pending',
--           baru berpengaruh ke saldo setelah admin -> 'disetujui'.
--
-- Perubahan:
--   1. tabungan_transaksi.arah  'masuk'/'keluar' -> 'terima'/'tarik'
--      + kolom status/diputus_oleh/diputus_pada/catatan_keputusan.
--      Policy tulis dipecah per-perintah supaya guru TIDAK bisa
--      menyetujui penarikannya sendiri (UPDATE = admin saja).
--   2. tabungan_penghimpun : siapa yang menghimpun setoran per kelompok.
--   3. tabungan_setoran     : catatan setoran guru -> penghimpun.
--
-- Idempoten.
-- =====================================================================

BEGIN;

-- ── 1. tabungan_transaksi: terima/tarik + status persetujuan ──────────
ALTER TABLE public.tabungan_transaksi DROP CONSTRAINT IF EXISTS chk_tabungan_arah;
UPDATE public.tabungan_transaksi SET arah = 'terima' WHERE arah = 'masuk';
UPDATE public.tabungan_transaksi SET arah = 'tarik'  WHERE arah = 'keluar';
ALTER TABLE public.tabungan_transaksi
  ADD CONSTRAINT chk_tabungan_arah CHECK (arah IN ('terima', 'tarik'));

ALTER TABLE public.tabungan_transaksi
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'disetujui',
  ADD COLUMN IF NOT EXISTS diputus_oleh      uuid REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS diputus_pada      timestamptz,
  ADD COLUMN IF NOT EXISTS catatan_keputusan text;

ALTER TABLE public.tabungan_transaksi DROP CONSTRAINT IF EXISTS chk_tabungan_status;
ALTER TABLE public.tabungan_transaksi
  ADD CONSTRAINT chk_tabungan_status CHECK (status IN ('pending', 'disetujui', 'ditolak'));

-- Terima selalu efektif seketika; hanya tarik yang bisa menggantung.
ALTER TABLE public.tabungan_transaksi DROP CONSTRAINT IF EXISTS chk_tabungan_terima_final;
ALTER TABLE public.tabungan_transaksi
  ADD CONSTRAINT chk_tabungan_terima_final CHECK (arah <> 'terima' OR status = 'disetujui');

CREATE INDEX IF NOT EXISTS idx_tabungan_transaksi_status
  ON public.tabungan_transaksi (kelompok_id, status) WHERE status = 'pending';

-- Policy tulis lama (FOR ALL) diganti policy per-perintah.
DROP POLICY IF EXISTS "tabungan_transaksi_tulis" ON public.tabungan_transaksi;

-- INSERT: admin scope bebas; guru hanya utk santri kelas yang dia ampu,
-- dan hanya boleh membuat terima (langsung disetujui) atau tarik
-- (wajib mulai 'pending' -- tidak bisa menyulap jadi 'disetujui').
DROP POLICY IF EXISTS "tabungan_transaksi_insert" ON public.tabungan_transaksi;
CREATE POLICY "tabungan_transaksi_insert" ON public.tabungan_transaksi
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_transaksi.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id)
       OR (p.role = 'guru'
           AND EXISTS (SELECT 1 FROM santri s JOIN kelas k ON k.id = s.kelas_id
                        WHERE s.id = tabungan_transaksi.santri_id
                          AND k.guru_id = p.guru_id AND k.deleted_at IS NULL)
           AND ( (tabungan_transaksi.arah = 'terima' AND tabungan_transaksi.status = 'disetujui')
              OR (tabungan_transaksi.arah = 'tarik'  AND tabungan_transaksi.status = 'pending') )))));

-- UPDATE: admin scope SAJA -- ini jalur menyetujui/menolak penarikan.
DROP POLICY IF EXISTS "tabungan_transaksi_update_admin" ON public.tabungan_transaksi;
CREATE POLICY "tabungan_transaksi_update_admin" ON public.tabungan_transaksi
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_transaksi.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_transaksi.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id))));

-- DELETE: admin scope bebas; guru hanya baris CATATANNYA SENDIRI yang
-- belum jadi penarikan disetujui (batal ketik / batal ajukan tarik).
DROP POLICY IF EXISTS "tabungan_transaksi_delete" ON public.tabungan_transaksi;
CREATE POLICY "tabungan_transaksi_delete" ON public.tabungan_transaksi
  AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_transaksi.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_transaksi.kelompok_id)
       OR (p.role = 'guru'
           AND tabungan_transaksi.dicatat_oleh = (SELECT auth.uid())
           AND NOT (tabungan_transaksi.arah = 'tarik' AND tabungan_transaksi.status = 'disetujui')))));

-- ── 2. tabungan_penghimpun ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tabungan_penghimpun (
  kelompok_id  bigint PRIMARY KEY REFERENCES public.kelompok (id),
  guru_id      bigint REFERENCES public.guru (id),
  catatan      text,
  updated_oleh uuid REFERENCES public.profiles (id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tabungan_penghimpun IS
  'Guru yang ditunjuk admin_kelompok utk menghimpun setoran tabungan. guru_id NULL = tiap guru pegang tabungannya sendiri.';

ALTER TABLE public.tabungan_penghimpun ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tabungan_penghimpun_select_scoped" ON public.tabungan_penghimpun;
CREATE POLICY "tabungan_penghimpun_select_scoped" ON public.tabungan_penghimpun
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_penghimpun.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_penghimpun.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = tabungan_penghimpun.kelompok_id))));

DROP POLICY IF EXISTS "tabungan_penghimpun_tulis_admin" ON public.tabungan_penghimpun;
CREATE POLICY "tabungan_penghimpun_tulis_admin" ON public.tabungan_penghimpun
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_penghimpun.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_penghimpun.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_penghimpun.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_penghimpun.kelompok_id))));

-- ── 3. tabungan_setoran ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tabungan_setoran (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kelompok_id  bigint NOT NULL REFERENCES public.kelompok (id),
  guru_id      bigint NOT NULL REFERENCES public.guru (id),
  jumlah       bigint NOT NULL CHECK (jumlah > 0),
  tanggal      date   NOT NULL DEFAULT current_date,
  keterangan   text,
  dicatat_oleh uuid REFERENCES public.profiles (id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tabungan_setoran IS
  'Catatan setoran uang tabungan dari seorang guru ke penghimpun. Memindahkan kas, tidak mengubah saldo santri.';

CREATE INDEX IF NOT EXISTS idx_tabungan_setoran_kelompok ON public.tabungan_setoran (kelompok_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_tabungan_setoran_guru ON public.tabungan_setoran (guru_id);

ALTER TABLE public.tabungan_setoran ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tabungan_setoran_select_scoped" ON public.tabungan_setoran;
CREATE POLICY "tabungan_setoran_select_scoped" ON public.tabungan_setoran
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_setoran.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_setoran.kelompok_id)
       OR (p.role = 'guru'           AND p.scope_kelompok_id = tabungan_setoran.kelompok_id))));

DROP POLICY IF EXISTS "tabungan_setoran_insert" ON public.tabungan_setoran;
CREATE POLICY "tabungan_setoran_insert" ON public.tabungan_setoran
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_setoran.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_setoran.kelompok_id)
       OR (p.role = 'guru'           AND p.guru_id = tabungan_setoran.guru_id
                                     AND p.scope_kelompok_id = tabungan_setoran.kelompok_id))));

DROP POLICY IF EXISTS "tabungan_setoran_delete" ON public.tabungan_setoran;
CREATE POLICY "tabungan_setoran_delete" ON public.tabungan_setoran
  AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = tabungan_setoran.kelompok_id))
       OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tabungan_setoran.kelompok_id)
       OR (p.role = 'guru'           AND tabungan_setoran.dicatat_oleh = (SELECT auth.uid())))));

COMMIT;
