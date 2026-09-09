-- =====================================================================
-- 20260909120000_guru_id_2_akses_tabungan_hafalan.sql
--
-- Penutup celah "guru gilir kedua" (kelas.guru_id_2). Tiga kebijakan
-- terakhir yang masih mencocokkan HANYA kl.guru_id:
--
--   1. tabungan_transaksi_insert   -- cabang guru: mencatat penerimaan
--      tabungan utk santri di "kelas yang dia ampu". Guru gilir kedua
--      tidak bisa. (Jalur penghimpun tidak berubah.)
--   2. jurnal_materi_hafalan_surat_select_scoped  -- monitoring
--      pengulangan hafalan surat (tabel turunan, dibaca via RPC).
--   3. jurnal_materi_hafalan_doa_select_scoped    -- kembarannya utk do'a.
--
-- Perubahan: cabang guru dari  kl.guru_id = <guru>  jadi
--            <guru> IN (kl.guru_id, kl.guru_id_2). Peran admin & jalur
--            penghimpun TIDAK disentuh. Bentuk kebijakan dipertahankan.
--
-- Badan disalin utuh dari 20260829100000 / 20260902150000 /
-- 20260903110000 (verified sama dgn produksi 2026-09-09).
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. tabungan_transaksi_insert
-- ---------------------------------------------------------------------
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
           AND ( -- santri di kelas yang dia ampu, utama ATAU gilir kedua (cara 1) ...
                 EXISTS (SELECT 1 FROM santri s JOIN kelas k ON k.id = s.kelas_id
                          WHERE s.id = tabungan_transaksi.santri_id
                            AND p.guru_id IN (k.guru_id, k.guru_id_2) AND k.deleted_at IS NULL)
                 -- ... atau dia penghimpun kelompok ini (cara 2).
              OR ( p.scope_kelompok_id = tabungan_transaksi.kelompok_id
                   AND public.adalah_penghimpun(tabungan_transaksi.kelompok_id)
                   AND EXISTS (SELECT 1 FROM santri s
                                WHERE s.id = tabungan_transaksi.santri_id
                                  AND s.kelompok_id = tabungan_transaksi.kelompok_id)))
           AND ( (tabungan_transaksi.arah = 'terima' AND tabungan_transaksi.status = 'disetujui')
              OR (tabungan_transaksi.arah = 'tarik'  AND tabungan_transaksi.status = 'pending') )))));

-- ---------------------------------------------------------------------
-- 2. jurnal_materi_hafalan_surat_select_scoped
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS jurnal_materi_hafalan_surat_select_scoped ON public.jurnal_materi_hafalan_surat;
CREATE POLICY jurnal_materi_hafalan_surat_select_scoped
  ON public.jurnal_materi_hafalan_surat
  FOR SELECT TO authenticated
  USING (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k where k.id = jurnal_materi_hafalan_surat.kelompok_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = jurnal_materi_hafalan_surat.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and jurnal_materi_hafalan_surat.kelas_id in (
        select kl.id from public.kelas kl
        where (select p.guru_id from auth_profile() p where p.is_active) in (kl.guru_id, kl.guru_id_2)
      )
    )
  );

-- ---------------------------------------------------------------------
-- 3. jurnal_materi_hafalan_doa_select_scoped
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS jurnal_materi_hafalan_doa_select_scoped ON public.jurnal_materi_hafalan_doa;
CREATE POLICY jurnal_materi_hafalan_doa_select_scoped
  ON public.jurnal_materi_hafalan_doa
  FOR SELECT TO authenticated
  USING (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k where k.id = jurnal_materi_hafalan_doa.kelompok_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = jurnal_materi_hafalan_doa.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and jurnal_materi_hafalan_doa.kelas_id in (
        select kl.id from public.kelas kl
        where (select p.guru_id from auth_profile() p where p.is_active) in (kl.guru_id, kl.guru_id_2)
      )
    )
  );

COMMIT;
