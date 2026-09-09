-- =====================================================================
-- 20260909100000_guru_id_2_akses_jurnal_tilawati.sql
--
-- Celah "guru gilir kedua" (kelas.guru_id_2).
--
-- Data Kelas mengizinkan admin kelp menaruh DUA guru pada satu kelas
-- (guru_id = guru utama, guru_id_2 = guru gilir kedua; jadwal giliran
-- dihitung frontend lewat guruGiliran(), lib/kelasGabungGilir.ts). Tapi
-- kebijakan RLS jurnal_kbm / jurnal_materi / tilawati_pelaksanaan cuma
-- mengenali kl.guru_id -- guru kedua TIDAK bisa membaca/menulis jurnal
-- atau tilawati kelas yang dia ampu bergilir.
--
-- Kasus nyata: Kelp Bangun Rejo (kelompok 6) kelas "1 & 2" -> guru_id 40
-- (Dara) + guru_id_2 42 (Nabhilla). Nabhilla tidak bisa isi jurnal utk
-- kelas itu.
--
-- Perbaikan: setiap CABANG GURU pada 9 kebijakan di bawah diganti dari
--   p.guru_id = kl.guru_id
-- menjadi
--   p.guru_id IN (kl.guru_id, kl.guru_id_2)
-- Semantik peran lain (admin_ppg/desa/kelompok) TIDAK disentuh.
--
-- absensi TIDAK termasuk: cabang guru-nya sudah se-kelompok
-- (p.scope_kelompok_id = absensi.kelompok_id), bukan per-kelas, jadi
-- guru kedua sudah bisa input kehadiran.
--
-- Bentuk kebijakan dipertahankan apa adanya (InitPlan "kelas_id IN
-- (daftar kelas saya)" utk yg sudah dioptimalkan, EXISTS berkorelasi utk
-- sisanya) supaya diff-nya sekecil mungkin -- lihat migrasi
-- 20260902100000 / 20260902120000 utk alasan bentuk InitPlan.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- jurnal_kbm  (bentuk EXISTS berkorelasi, dari 20260817090000)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "jurnal_kbm_select_scoped" ON public.jurnal_kbm;
CREATE POLICY "jurnal_kbm_select_scoped" ON public.jurnal_kbm
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k WHERE k.id = jurnal_kbm.kelompok_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = jurnal_kbm.kelompok_id)
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM kelas kl
            WHERE kl.id = jurnal_kbm.kelas_id
              AND p.guru_id IN (kl.guru_id, kl.guru_id_2)))
    )
  ));

DROP POLICY IF EXISTS "jurnal_kbm_insert_guru_admin" ON public.jurnal_kbm;
CREATE POLICY "jurnal_kbm_insert_guru_admin" ON public.jurnal_kbm
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_kbm.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_kbm.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM kelas kl
            WHERE kl.id = jurnal_kbm.kelas_id
              AND p.guru_id IN (kl.guru_id, kl.guru_id_2)))
    )
  ));

DROP POLICY IF EXISTS "jurnal_kbm_update_guru_admin" ON public.jurnal_kbm;
CREATE POLICY "jurnal_kbm_update_guru_admin" ON public.jurnal_kbm
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_kbm.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_kbm.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM kelas kl
            WHERE kl.id = jurnal_kbm.kelas_id
              AND p.guru_id IN (kl.guru_id, kl.guru_id_2)))
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_kbm.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_kbm.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM kelas kl
            WHERE kl.id = jurnal_kbm.kelas_id
              AND p.guru_id IN (kl.guru_id, kl.guru_id_2)))
    )
  ));

-- ---------------------------------------------------------------------
-- jurnal_materi
--   SELECT : bentuk InitPlan "kelas_id IN (daftar kelas saya)"
--            (dari 20260902120000)
--   INSERT/UPDATE : bentuk EXISTS berkorelasi (dari 20260820120000)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS jurnal_materi_select_scoped ON public.jurnal_materi;
CREATE POLICY jurnal_materi_select_scoped ON public.jurnal_materi
  FOR SELECT TO authenticated
  USING (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k where k.id = jurnal_materi.kelompok_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = jurnal_materi.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and jurnal_materi.kelas_id in (
        select kl.id from kelas kl
        where (select p.guru_id from auth_profile() p where p.is_active) in (kl.guru_id, kl.guru_id_2)
      )
    )
  );
COMMENT ON POLICY jurnal_materi_select_scoped ON public.jurnal_materi IS
  'Cakupan baca per peran. Bagian tak-bergantung-baris = subquery tanpa korelasi (InitPlan). Cabang guru: kelas_id ada di daftar kelas yang saya ampu -- guru utama ATAU guru gilir kedua (kl.guru_id_2). Lihat migrasi 20260902120000 & 20260909100000.';

DROP POLICY IF EXISTS "jurnal_materi_insert_guru_admin" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_insert_guru_admin" ON public.jurnal_materi
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM kelas kl
            WHERE kl.id = jurnal_materi.kelas_id
              AND p.guru_id IN (kl.guru_id, kl.guru_id_2)))
    )
  ));

DROP POLICY IF EXISTS "jurnal_materi_update_guru_admin" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_update_guru_admin" ON public.jurnal_materi
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM kelas kl
            WHERE kl.id = jurnal_materi.kelas_id
              AND p.guru_id IN (kl.guru_id, kl.guru_id_2)))
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id
            WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (
            SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM kelas kl
            WHERE kl.id = jurnal_materi.kelas_id
              AND p.guru_id IN (kl.guru_id, kl.guru_id_2)))
    )
  ));

-- ---------------------------------------------------------------------
-- tilawati_pelaksanaan  (bentuk InitPlan, dari 20260903120000)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "tilawati_select_scoped" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_select_scoped" ON public.tilawati_pelaksanaan
  FOR SELECT TO authenticated
  USING (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k where k.id = tilawati_pelaksanaan.kelompok_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = tilawati_pelaksanaan.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and tilawati_pelaksanaan.kelas_id in (
        select kl.id from public.kelas kl
        where (select p.guru_id from auth_profile() p where p.is_active) in (kl.guru_id, kl.guru_id_2)
      )
    )
  );

DROP POLICY IF EXISTS "tilawati_insert_guru_admin" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_insert_guru_admin" ON public.tilawati_pelaksanaan
  FOR INSERT TO authenticated
  WITH CHECK (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k
             join public.kelas kl on kl.kelompok_id = k.id
             where kl.id = tilawati_pelaksanaan.kelas_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active)
          = (select kl.kelompok_id from public.kelas kl where kl.id = tilawati_pelaksanaan.kelas_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and tilawati_pelaksanaan.kelas_id in (
        select kl.id from public.kelas kl
        where (select p.guru_id from auth_profile() p where p.is_active) in (kl.guru_id, kl.guru_id_2)
      )
    )
  );

DROP POLICY IF EXISTS "tilawati_update_guru_admin" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_update_guru_admin" ON public.tilawati_pelaksanaan
  FOR UPDATE TO authenticated
  USING (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = tilawati_pelaksanaan.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and tilawati_pelaksanaan.kelas_id in (
        select kl.id from public.kelas kl
        where (select p.guru_id from auth_profile() p where p.is_active) in (kl.guru_id, kl.guru_id_2)
      )
    )
  )
  with check (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active)
          = (select kl.kelompok_id from public.kelas kl where kl.id = tilawati_pelaksanaan.kelas_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and tilawati_pelaksanaan.kelas_id in (
        select kl.id from public.kelas kl
        where (select p.guru_id from auth_profile() p where p.is_active) in (kl.guru_id, kl.guru_id_2)
      )
    )
  );

COMMIT;
