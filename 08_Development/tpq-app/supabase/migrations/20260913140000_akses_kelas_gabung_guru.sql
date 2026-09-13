-- =====================================================================
-- 20260913140000_akses_kelas_gabung_guru.sql
--
-- "Gabung Kelas" (2026-08-28) selama ini HANYA berpengaruh ke tampilan
-- Pengumuman Jadwal KBM. Diminta owner 2026-09-13: selama penggabungan
-- aktif, guru KELAS INDUK harus bisa LIHAT + ISI (bukan cuma lihat nama
-- gabungan) santri/absensi/jurnal/tilawati/hafalan-surat milik kelas yang
-- digabung ke dia -- guru sedang benar-benar mengajar gabungan.
--
-- Badan kebijakan di bawah DISALIN dari PRODUKSI (pg_policies, dicek
-- 2026-09-13) sebelum ditambah klausa baru -- BUKAN dari berkas migrasi
-- lama (proyek ini baru saja kena masalah "migrasi tercatat sudah jalan
-- padahal tidak" utk Tilawati DELETE, 2026-09-13 juga -- lihat ERROR_LOG).
--
-- Cakupan LEBIH KECIL dari dugaan awal: `santri` & `absensi` sudah
-- LONGGAR se-kelompok utk peran guru (BUKAN per-kelas -- lihat
-- absensi_select_scoped/absensi_update_guru_admin: p.scope_kelompok_id =
-- absensi.kelompok_id; santri_select_scoped: p.scope_kelompok_id =
-- santri.kelompok_id) -- jadi Ringkasan Kehadiran & Input Absensi TIDAK
-- BUTUH migrasi ini sama sekali, guru sudah bisa baca/tulis absensi
-- kelas manapun di kelompoknya. Yang dikunci PER-KELAS (kelas.guru_id/
-- guru_id_2) cuma tiga: jurnal_materi, tilawati_pelaksanaan,
-- hafalan_surat_pelaksanaan -- tiga tabel itu saja yang disentuh di sini.
--
-- Sengaja HANYA cabang 'guru' yang ditambah (bukan 'pengunjung') --
-- fitur ini soal guru benar2 mengajar gabungan, memperluas akses
-- pengunjung (mode demo) ke kelas lain tidak diminta & memperbesar
-- lingkup tanpa perlu.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

-- ── Helper: apakah kelas ini SEDANG digabung (aktif hari ini) ke kelas
--    yang diampu guru p_guru_id (induk)? SECURITY DEFINER (pola sama
--    persis auth_profile(), dipakai di SEMUA kebijakan proyek ini) --
--    supaya tidak bergantung pada RLS kelas/kelas_gabung milik pemanggil.
CREATE OR REPLACE FUNCTION public.kelas_gabung_aktif_ke_guru(p_kelas_id bigint, p_guru_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM kelas_gabung kg
    JOIN kelas kli ON kli.id = kg.kelas_induk_id
    WHERE kg.kelas_id = p_kelas_id
      AND p_guru_id IS NOT NULL
      AND (kli.guru_id = p_guru_id OR kli.guru_id_2 = p_guru_id)
      AND kg.tanggal_mulai <= CURRENT_DATE
      AND (kg.tanggal_selesai IS NULL OR kg.tanggal_selesai >= CURRENT_DATE)
  );
$$;

COMMENT ON FUNCTION public.kelas_gabung_aktif_ke_guru(bigint, bigint) IS
  'True kalau kelas p_kelas_id SEDANG (hari ini) digabung aktif ke kelas induk yang diampu guru p_guru_id (guru_id atau guru_id_2). Dipakai kebijakan RLS jurnal_materi/tilawati_pelaksanaan/hafalan_surat_pelaksanaan supaya guru kelas induk bisa isi data kelas yang digabung ke dia.';

REVOKE ALL ON FUNCTION public.kelas_gabung_aktif_ke_guru(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kelas_gabung_aktif_ke_guru(bigint, bigint) TO authenticated;

-- ── jurnal_materi ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "jurnal_materi_select_scoped" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_select_scoped" ON public.jurnal_materi
  FOR SELECT TO authenticated
  USING (
    (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_desa'
      AND (SELECT p.scope_desa_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
          = (SELECT k.desa_id FROM kelompok k WHERE k.id = jurnal_materi.kelompok_id)
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_kelompok'
      AND (SELECT p.scope_kelompok_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = jurnal_materi.kelompok_id
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'guru'
      AND (
        jurnal_materi.kelas_id IN (
          SELECT kl.id FROM kelas kl
          WHERE (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id
             OR (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2
        )
        OR public.kelas_gabung_aktif_ke_guru(
             jurnal_materi.kelas_id,
             (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
           )
      )
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'pengunjung'
      AND jurnal_materi.kelas_id IN (
        SELECT kl.id FROM kelas kl
        WHERE (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id
           OR (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2
      )
      AND pengunjung_masih_berlaku()
    )
  );

DROP POLICY IF EXISTS "jurnal_materi_insert_guru_admin" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_insert_guru_admin" ON public.jurnal_materi
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND (
            EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
            OR public.kelas_gabung_aktif_ke_guru(jurnal_materi.kelas_id, p.guru_id)
          ))
      OR (p.role = 'pengunjung' AND p.guru_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
          AND pengunjung_masih_berlaku())
    )
  ));

DROP POLICY IF EXISTS "jurnal_materi_update_guru_admin" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_update_guru_admin" ON public.jurnal_materi
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND (
            EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
            OR public.kelas_gabung_aktif_ke_guru(jurnal_materi.kelas_id, p.guru_id)
          ))
      OR (p.role = 'pengunjung' AND p.guru_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = jurnal_materi.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
          AND pengunjung_masih_berlaku())
    )
  ));

-- ── tilawati_pelaksanaan ──────────────────────────────────────────────

DROP POLICY IF EXISTS "tilawati_select_scoped" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_select_scoped" ON public.tilawati_pelaksanaan
  FOR SELECT TO authenticated
  USING (
    (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_desa'
      AND (SELECT p.scope_desa_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
          = (SELECT k.desa_id FROM kelompok k WHERE k.id = tilawati_pelaksanaan.kelompok_id)
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_kelompok'
      AND (SELECT p.scope_kelompok_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = tilawati_pelaksanaan.kelompok_id
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'guru'
      AND (
        tilawati_pelaksanaan.kelas_id IN (
          SELECT kl.id FROM kelas kl
          WHERE (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id
             OR (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2
        )
        OR public.kelas_gabung_aktif_ke_guru(
             tilawati_pelaksanaan.kelas_id,
             (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
           )
      )
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'pengunjung'
      AND tilawati_pelaksanaan.kelas_id IN (
        SELECT kl.id FROM kelas kl
        WHERE (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id
           OR (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2
      )
      AND pengunjung_masih_berlaku()
    )
  );

DROP POLICY IF EXISTS "tilawati_insert_guru_admin" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_insert_guru_admin" ON public.tilawati_pelaksanaan
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_desa'
      AND (SELECT p.scope_desa_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
          = (SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id WHERE kl.id = tilawati_pelaksanaan.kelas_id)
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_kelompok'
      AND (SELECT p.scope_kelompok_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
          = (SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = tilawati_pelaksanaan.kelas_id)
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'guru'
      AND (
        tilawati_pelaksanaan.kelas_id IN (
          SELECT kl.id FROM kelas kl
          WHERE (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id
             OR (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2
        )
        OR public.kelas_gabung_aktif_ke_guru(
             tilawati_pelaksanaan.kelas_id,
             (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
           )
      )
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'pengunjung'
      AND tilawati_pelaksanaan.kelas_id IN (
        SELECT kl.id FROM kelas kl
        WHERE (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id
           OR (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2
      )
      AND pengunjung_masih_berlaku()
    )
  );

DROP POLICY IF EXISTS "tilawati_update_guru_admin" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_update_guru_admin" ON public.tilawati_pelaksanaan
  FOR UPDATE TO authenticated
  USING (
    (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_kelompok'
      AND (SELECT p.scope_kelompok_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = tilawati_pelaksanaan.kelompok_id
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'guru'
      AND (
        tilawati_pelaksanaan.kelas_id IN (
          SELECT kl.id FROM kelas kl
          WHERE (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id
             OR (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2
        )
        OR public.kelas_gabung_aktif_ke_guru(
             tilawati_pelaksanaan.kelas_id,
             (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
           )
      )
    )
    OR (
      (SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'pengunjung'
      AND tilawati_pelaksanaan.kelas_id IN (
        SELECT kl.id FROM kelas kl
        WHERE (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id
           OR (SELECT p.guru_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = kl.guru_id_2
      )
      AND pengunjung_masih_berlaku()
    )
  );

DROP POLICY IF EXISTS "tilawati_delete_guru_admin" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_delete_guru_admin" ON public.tilawati_pelaksanaan
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = tilawati_pelaksanaan.kelompok_id)
      OR (p.role = 'guru' AND (
            tilawati_pelaksanaan.kelas_id IN (SELECT kl.id FROM kelas kl WHERE p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2)
            OR public.kelas_gabung_aktif_ke_guru(tilawati_pelaksanaan.kelas_id, p.guru_id)
          ))
    )
  ));

-- ── hafalan_surat_pelaksanaan ─────────────────────────────────────────

DROP POLICY IF EXISTS "hafalan_surat_select_scoped" ON public.hafalan_surat_pelaksanaan;
CREATE POLICY "hafalan_surat_select_scoped" ON public.hafalan_surat_pelaksanaan
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = hafalan_surat_pelaksanaan.kelompok_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = hafalan_surat_pelaksanaan.kelompok_id)
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND (
            EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
            OR public.kelas_gabung_aktif_ke_guru(hafalan_surat_pelaksanaan.kelas_id, p.guru_id)
          ))
      OR (p.role = 'pengunjung' AND p.guru_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
          AND pengunjung_masih_berlaku())
    )
  ));

DROP POLICY IF EXISTS "hafalan_surat_insert_guru_admin" ON public.hafalan_surat_pelaksanaan;
CREATE POLICY "hafalan_surat_insert_guru_admin" ON public.hafalan_surat_pelaksanaan
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (
            SELECT k.desa_id FROM kelompok k JOIN kelas kl ON kl.kelompok_id = k.id WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = (SELECT kl.kelompok_id FROM kelas kl WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id))
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND (
            EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
            OR public.kelas_gabung_aktif_ke_guru(hafalan_surat_pelaksanaan.kelas_id, p.guru_id)
          ))
      OR (p.role = 'pengunjung' AND p.guru_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
          AND pengunjung_masih_berlaku())
    )
  ));

DROP POLICY IF EXISTS "hafalan_surat_update_guru_admin" ON public.hafalan_surat_pelaksanaan;
CREATE POLICY "hafalan_surat_update_guru_admin" ON public.hafalan_surat_pelaksanaan
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = hafalan_surat_pelaksanaan.kelompok_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = hafalan_surat_pelaksanaan.kelompok_id)
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND (
            EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
            OR public.kelas_gabung_aktif_ke_guru(hafalan_surat_pelaksanaan.kelas_id, p.guru_id)
          ))
      OR (p.role = 'pengunjung' AND p.guru_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
          AND pengunjung_masih_berlaku())
    )
  ));

DROP POLICY IF EXISTS "hafalan_surat_delete_guru_admin" ON public.hafalan_surat_pelaksanaan;
CREATE POLICY "hafalan_surat_delete_guru_admin" ON public.hafalan_surat_pelaksanaan
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
      p.role = 'admin_ppg'
      OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = hafalan_surat_pelaksanaan.kelompok_id))
      OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = hafalan_surat_pelaksanaan.kelompok_id)
      OR (p.role = 'guru' AND p.guru_id IS NOT NULL AND (
            EXISTS (SELECT 1 FROM kelas kl WHERE kl.id = hafalan_surat_pelaksanaan.kelas_id AND (p.guru_id = kl.guru_id OR p.guru_id = kl.guru_id_2))
            OR public.kelas_gabung_aktif_ke_guru(hafalan_surat_pelaksanaan.kelas_id, p.guru_id)
          ))
    )
  ));

COMMIT;
