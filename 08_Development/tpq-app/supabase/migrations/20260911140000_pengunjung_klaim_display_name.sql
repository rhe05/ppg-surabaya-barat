-- =====================================================================
-- 20260911140000_pengunjung_klaim_display_name.sql
--
-- Perbaikan kecil klaim_akses_pengunjung (migrasi 20260911120000):
-- klausa ON CONFLICT DO UPDATE tidak menyertakan `display_name`, jadi
-- nama Pengunjung tetap NULL selamanya -- baris `profiles` untuk akun
-- Google BARU sudah lebih dulu dibuat trigger `handle_new_auth_user()`
-- (role NULL, display_name NULL), sehingga INSERT klaim SELALU kena
-- cabang ON CONFLICT, bukan INSERT murni; VALUES yg berisi nama Google
-- tidak pernah terpakai. Sama signature -> CREATE OR REPLACE cukup,
-- tanpa DROP. Idempoten.
-- =====================================================================

BEGIN;

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

COMMIT;
