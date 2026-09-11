-- =====================================================================
-- 20260911120000_pengunjung_klaim_seed_rls.sql
--
-- Fitur "Pengunjung" -- LANGKAH 3. Jalankan SETELAH 20260911110000
-- commit. Isi:
--   1. Data contoh (FIKTIF) di kelompok demo "Kelp Demo Pengunjung":
--      1 guru + 1 kelas + 5 santri + beberapa jurnal_materi (App Guru),
--      1 sub_kelp + 5 jamaah (App Penerobos Kelp).
--   2. RPC `klaim_akses_pengunjung(token)` -- dipanggil setelah visitor
--      selesai "Masuk dengan Google". Validasi token, lalu upsert profil
--      auth.uid() jadi role='pengunjung', scope_kelompok_id=kelompok
--      demo, guru_id=guru demo (supaya layar Guru yang query by guru_id
--      tetap jalan tanpa restrukturisasi kode). Menolak kalau akun itu
--      SUDAH punya peran lain (mencegah admin/guru sungguhan tak sengaja
--      menimpa profilnya sendiri via link Pengunjung).
--   3. Kebijakan SELECT tambahan utk role `pengunjung` (read-only) di
--      kelas/santri/guru/jurnal_materi/tilawati_pelaksanaan (App Guru)
--      dan sub_kelp/jamaah/jamaah_acara/jamaah_kehadiran/
--      jamaah_pengurus/jamaah_konfig (App Penerobos Kelp). Tiap cabang
--      pengunjung WAJIB sertakan cek kadaluwarsa (30 hari) lewat fungsi
--      `pengunjung_masih_berlaku()` (SECURITY DEFINER, lihat §2b) --
--      TIDAK boleh subquery polos ke pengunjung_akses (RLS tabel itu
--      admin_ppg-only, jadi dari policy lain akan selalu nol baris).
--      auth_profile() sendiri TIDAK diubah signature-nya (dipakai
--      puluhan kebijakan lain di luar migrasi ini).
--   Badan kebijakan lama disalin dari produksi (pg_get_expr, 2026-09-11),
--   cuma menambah SATU cabang OR per kebijakan. Idempoten.
-- =====================================================================

BEGIN;

-- ── 1) Data contoh ────────────────────────────────────────────────────
DO $$
DECLARE
  v_kelompok_id bigint;
  v_guru_id bigint;
  v_kelas_id bigint;
  v_subkelp_id bigint;
  v_tahun int := extract(year FROM now())::int;
  v_bulan int := extract(month FROM now())::int;
BEGIN
  SELECT id INTO v_kelompok_id FROM kelompok WHERE is_demo = true ORDER BY id LIMIT 1;
  IF v_kelompok_id IS NULL THEN
    RAISE EXCEPTION 'Kelompok demo belum ada -- jalankan 20260911110000 dulu.';
  END IF;

  -- Guru demo
  SELECT id INTO v_guru_id FROM guru WHERE kelompok_id = v_kelompok_id AND nama = 'Ustadz Demo';
  IF v_guru_id IS NULL THEN
    INSERT INTO guru (kelompok_id, nama, jenis_kelamin, kategori)
    VALUES (v_kelompok_id, 'Ustadz Demo', 'L', 'Guru Bantu')
    RETURNING id INTO v_guru_id;
  END IF;

  -- Kelas demo (kategori_kbm 3 = "Bacaan Al-Qur'an")
  SELECT id INTO v_kelas_id FROM kelas WHERE kelompok_id = v_kelompok_id AND nama = 'Kelas Demo';
  IF v_kelas_id IS NULL THEN
    INSERT INTO kelas (kelompok_id, nama, kategori_kbm_id, guru_id, jam_mulai, jam_selesai, ruangan, santri_count)
    VALUES (v_kelompok_id, 'Kelas Demo', 3, v_guru_id, '16:00', '17:30', 'Ruang Contoh', 5)
    RETURNING id INTO v_kelas_id;
  END IF;

  -- 5 santri contoh
  IF NOT EXISTS (SELECT 1 FROM santri WHERE kelas_id = v_kelas_id) THEN
    INSERT INTO santri (kelompok_id, kelas_id, nama, gender, jenjang_saat_ini)
    VALUES
      (v_kelompok_id, v_kelas_id, 'Ahmad Contoh', 'L', 'Cabe Rawit'),
      (v_kelompok_id, v_kelas_id, 'Fatimah Contoh', 'P', 'Cabe Rawit'),
      (v_kelompok_id, v_kelas_id, 'Umar Contoh', 'L', 'Pra Remaja'),
      (v_kelompok_id, v_kelas_id, 'Khadijah Contoh', 'P', 'Pra Remaja'),
      (v_kelompok_id, v_kelas_id, 'Ali Contoh', 'L', 'Remaja');
  END IF;

  -- Jurnal materi contoh -- bulan berjalan, minggu 1, campuran status
  IF NOT EXISTS (SELECT 1 FROM jurnal_materi WHERE kelas_id = v_kelas_id) THEN
    INSERT INTO jurnal_materi (kelompok_id, kelas_id, guru_id, tahun, bulan, minggu_ke, judul, status, jenis, tanggal_disampaikan)
    VALUES
      (v_kelompok_id, v_kelas_id, v_guru_id, v_tahun, v_bulan, 1, 'Klasikal', 'disampaikan', 'klasikal', current_date),
      (v_kelompok_id, v_kelas_id, v_guru_id, v_tahun, v_bulan, 1, 'Bacaan Al-Qur''an - Iqro Jilid 2', 'disampaikan', 'ngaji', current_date),
      (v_kelompok_id, v_kelas_id, v_guru_id, v_tahun, v_bulan, 1, 'Bacaan Al-Qur''an - Iqro Jilid 2 lanjutan', 'belum', 'ngaji', NULL);
  END IF;

  -- Sub Kelp + jamaah contoh
  SELECT id INTO v_subkelp_id FROM sub_kelp WHERE kelompok_id = v_kelompok_id LIMIT 1;
  IF v_subkelp_id IS NULL THEN
    INSERT INTO sub_kelp (kelompok_id, nama) VALUES (v_kelompok_id, 'Sub Kelp Contoh')
    RETURNING id INTO v_subkelp_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM jamaah WHERE kelompok_id = v_kelompok_id) THEN
    INSERT INTO jamaah (kelompok_id, sub_kelp_id, nama, gender, status_keluarga, status_domisili)
    VALUES
      (v_kelompok_id, v_subkelp_id, 'Bapak Contoh Satu', 'L', 'Kepala Keluarga', 'Mukim'),
      (v_kelompok_id, v_subkelp_id, 'Ibu Contoh Satu', 'P', 'Istri', 'Mukim'),
      (v_kelompok_id, v_subkelp_id, 'Bapak Contoh Dua', 'L', 'Kepala Keluarga', 'Mukim'),
      (v_kelompok_id, v_subkelp_id, 'Ibu Contoh Dua', 'P', 'Istri', 'Musiman'),
      (v_kelompok_id, v_subkelp_id, 'Bapak Contoh Tiga', 'L', 'Duda', 'Mukim');
  END IF;
END $$;

-- ── 2) RPC klaim ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.klaim_akses_pengunjung(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_akses record;
  v_kelompok_id bigint;
  v_guru_id bigint;
  v_existing_role app_role;
  v_nama text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Harus masuk (login) dulu.';
  END IF;

  SELECT * INTO v_akses FROM pengunjung_akses WHERE token = p_token;
  IF v_akses.id IS NULL OR v_akses.dicabut OR v_akses.berlaku_sampai <= now() THEN
    RAISE EXCEPTION 'Link tidak valid atau sudah kadaluwarsa.';
  END IF;

  SELECT id INTO v_kelompok_id FROM kelompok WHERE is_demo = true ORDER BY id LIMIT 1;
  SELECT id INTO v_guru_id FROM guru WHERE kelompok_id = v_kelompok_id AND nama = 'Ustadz Demo';
  IF v_kelompok_id IS NULL OR v_guru_id IS NULL THEN
    RAISE EXCEPTION 'Data contoh Pengunjung belum lengkap.';
  END IF;

  SELECT role INTO v_existing_role FROM profiles WHERE id = auth.uid();
  IF v_existing_role IS NOT NULL AND v_existing_role <> 'pengunjung' THEN
    RAISE EXCEPTION 'Akun Google ini sudah terdaftar dengan peran lain di Ruang Ngaji.';
  END IF;

  SELECT raw_user_meta_data ->> 'full_name' INTO v_nama FROM auth.users WHERE id = auth.uid();

  INSERT INTO profiles (id, display_name, role, scope_kelompok_id, guru_id, pengunjung_akses_id, is_active)
  VALUES (auth.uid(), COALESCE(v_nama, 'Pengunjung'), 'pengunjung', v_kelompok_id, v_guru_id, v_akses.id, true)
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(v_nama, profiles.display_name, 'Pengunjung'),
    role = 'pengunjung',
    scope_ppg_id = NULL,
    scope_desa_id = NULL,
    scope_kelompok_id = v_kelompok_id,
    guru_id = v_guru_id,
    pengunjung_akses_id = v_akses.id,
    is_active = true,
    deleted_at = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.klaim_akses_pengunjung(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.klaim_akses_pengunjung(text) TO authenticated;

-- ── 2b) Helper kadaluwarsa (WAJIB SECURITY DEFINER) ──────────────────
-- Kebijakan RLS tabel LAIN (kelas/santri/dst) di bawah memanggil fungsi
-- ini utk cek token pengunjung masih berlaku. Kalau ditulis sbg subquery
-- polos ke `pengunjung_akses` langsung di dalam policy tabel lain, baris
-- itu SELALU nol karena `pengunjung_akses` sendiri RLS-nya admin_ppg-only
-- -- pengunjung tak pernah boleh baca tabelnya secara langsung. Fungsi
-- SECURITY DEFINER ini yang menjembatani (pola sama auth_profile()).
CREATE OR REPLACE FUNCTION public.pengunjung_masih_berlaku()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles pr
    JOIN pengunjung_akses pa ON pa.id = pr.pengunjung_akses_id
    WHERE pr.id = auth.uid() AND NOT pa.dicabut AND pa.berlaku_sampai > now()
  );
$$;

REVOKE ALL ON FUNCTION public.pengunjung_masih_berlaku() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pengunjung_masih_berlaku() TO authenticated;

-- ── 3) Kebijakan SELECT read-only utk `pengunjung` ───────────────────
-- App Guru: kelas (kelompok-scoped, sama pola cabang 'guru')
DROP POLICY IF EXISTS "kelas_select_scoped" ON public.kelas;
CREATE POLICY "kelas_select_scoped" ON public.kelas
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = kelas.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = kelas.kelompok_id))
      OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = kelas.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = kelas.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

-- santri (kelompok-scoped, sama pola cabang 'guru')
DROP POLICY IF EXISTS "santri_select_scoped" ON public.santri;
CREATE POLICY "santri_select_scoped" ON public.santri
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = santri.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = santri.kelompok_id))
      OR ((p.role = 'guru'::text) AND (p.scope_kelompok_id = santri.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = santri.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = santri.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

-- guru (kelompok-scoped, sama pola cabang 'guru'/'penerobos')
DROP POLICY IF EXISTS "guru_select_scoped" ON public.guru;
CREATE POLICY "guru_select_scoped" ON public.guru
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = guru.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = guru.kelompok_id))
      OR ((p.role = 'guru'::text) AND ((p.scope_kelompok_id = guru.kelompok_id) OR (p.guru_id = guru.id)))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = guru.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = guru.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

-- jurnal_materi (guru_id/kelas-scoped, sama pola cabang 'guru')
DROP POLICY IF EXISTS "jurnal_materi_select_scoped" ON public.jurnal_materi;
CREATE POLICY "jurnal_materi_select_scoped" ON public.jurnal_materi
  AS PERMISSIVE FOR SELECT TO public
  USING (
       (( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'::text)
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_desa'::text)
        AND (( SELECT p.scope_desa_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
             = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jurnal_materi.kelompok_id))))
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

-- tilawati_pelaksanaan (guru_id/kelas-scoped, sama pola cabang 'guru')
DROP POLICY IF EXISTS "tilawati_select_scoped" ON public.tilawati_pelaksanaan;
CREATE POLICY "tilawati_select_scoped" ON public.tilawati_pelaksanaan
  AS PERMISSIVE FOR SELECT TO public
  USING (
       (( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_ppg'::text)
    OR ((( SELECT p.role FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active) = 'admin_desa'::text)
        AND (( SELECT p.scope_desa_id FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active) WHERE p.is_active)
             = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = tilawati_pelaksanaan.kelompok_id))))
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

-- App Penerobos Kelp: sub_kelp / jamaah / jamaah_pengurus / jamaah_konfig (kelompok-scoped)
DROP POLICY IF EXISTS "sub_kelp_select" ON public.sub_kelp;
CREATE POLICY "sub_kelp_select" ON public.sub_kelp
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = sub_kelp.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = sub_kelp.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_select" ON public.jamaah;
CREATE POLICY "jamaah_select" ON public.jamaah
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_pengurus_select" ON public.jamaah_pengurus;
CREATE POLICY "jamaah_pengurus_select" ON public.jamaah_pengurus
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_pengurus.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_pengurus.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_konfig_select" ON public.jamaah_konfig;
CREATE POLICY "jamaah_konfig_select" ON public.jamaah_konfig
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_konfig.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_konfig.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

DROP POLICY IF EXISTS "jamaah_acara_select" ON public.jamaah_acara;
CREATE POLICY "jamaah_acara_select" ON public.jamaah_acara
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
    FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE (p.is_active AND (
         (p.role = 'admin_ppg'::text)
      OR ((p.role = 'admin_desa'::text) AND (p.scope_desa_id = ( SELECT k.desa_id FROM kelompok k WHERE (k.id = jamaah_acara.kelompok_id))))
      OR ((p.role = 'admin_kelompok'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id))
      OR ((p.role = 'penerobos'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id))
      OR ((p.role = 'pengunjung'::text) AND (p.scope_kelompok_id = jamaah_acara.kelompok_id)
          AND public.pengunjung_masih_berlaku())
    ))));

-- jamaah_kehadiran: kelompok didapat lewat jamaah_acara.kelompok_id
DROP POLICY IF EXISTS "jamaah_kehadiran_select" ON public.jamaah_kehadiran;
CREATE POLICY "jamaah_kehadiran_select" ON public.jamaah_kehadiran
  AS PERMISSIVE FOR SELECT TO public
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

COMMIT;
