-- =====================================================================
-- 20260818190000_guru_izin_akses_kelas_rls.sql
--
-- Fondasi DB untuk alur mobile guru: pengajuan Izin/Cuti dan permintaan
-- akses kelas milik guru lain. Kedua tabelnya RLS aktif dengan NOL policy.
--
-- ATURAN AKSES (ditiru dari Modul_InputAbsen.gs):
--
--   guru_izin
--     Guru mengajukan izin UNTUK DIRINYA SENDIRI (requireGuruContext_ di
--     serverSubmitGuruIzin:1533 memakai guru_id dari sesi, bukan parameter).
--     Karena itu INSERT diwajibkan `guru_id = profil.guru_id`. Admin
--     kelompok/desa/ppg boleh menulis untuk guru di scope-nya — di app lama
--     admin memang bisa mencatatkan izin lewat layar override.
--     BACA: guru melihat izinnya sendiri; admin melihat seluruh kelompoknya.
--
--   akses_kelas_request
--     Guru A meminta akses kelas milik guru B pada tanggal tertentu.
--     INSERT: hanya sebagai diri sendiri (requester_guru_id = profil).
--     BACA: peminta ATAU pemilik kelas, plus admin dalam scope.
--     UPDATE (menyetujui/menolak): HANYA pemilik kelas atau admin —
--     peminta tidak boleh menyetujui permintaannya sendiri
--     (serverRespondAksesRequest:1043 memeriksa owner_guru_id).
--
-- LARANGAN IZIN BERTUMPUK: app lama memeriksanya di kode
-- (serverSubmitGuruIzin:1561-1569) sehingga dua pengajuan berbarengan bisa
-- lolos berdua. Di sini ditegakkan EXCLUDE constraint: satu guru tidak bisa
-- punya dua rentang izin yang beririsan. Butuh ekstensi btree_gist agar
-- kolom bigint bisa disandingkan dengan rentang tanggal dalam satu indeks.
--
-- CATATAN PENTING YANG BUKAN BAGIAN MIGRASI INI:
-- app lama punya tabel `absensi_sesi` sebagai penjaga versi supaya dua guru
-- yang menyimpan absensi kelas yang sama tidak saling menimpa (perbaikan
-- lost-update 2026-08-08). Tabel itu TIDAK ADA di Supabase dan belum ada
-- penggantinya — jadi perlindungan tabrakan simpan absensi saat ini BELUM
-- ADA di app baru. Diperbaiki terpisah, bukan di sini.
--
-- Idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'guru_izin_tidak_bertumpuk'
       AND conrelid = 'public.guru_izin'::regclass
  ) THEN
    ALTER TABLE public.guru_izin
      ADD CONSTRAINT guru_izin_tidak_bertumpuk
      EXCLUDE USING gist (
        guru_id WITH =,
        daterange(tanggal_mulai, tanggal_selesai, '[]') WITH &&
      );
  END IF;
END
$$;

-- ── guru_izin ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "guru_izin_select_scoped" ON public.guru_izin;
CREATE POLICY "guru_izin_select_scoped" ON public.guru_izin
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = guru_izin.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = guru_izin.kelompok_id)
     OR (p.role = 'guru'           AND p.guru_id = guru_izin.guru_id))));

DROP POLICY IF EXISTS "guru_izin_insert_diri_atau_admin" ON public.guru_izin;
CREATE POLICY "guru_izin_insert_diri_atau_admin" ON public.guru_izin
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = guru_izin.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = guru_izin.kelompok_id)
     OR (p.role = 'guru'           AND p.guru_id = guru_izin.guru_id))));

-- Membatalkan izin = menghapus barisnya; tabel ini tidak punya deleted_at.
-- Yang boleh: guru pemilik izin, atau admin dalam scope.
DROP POLICY IF EXISTS "guru_izin_delete_diri_atau_admin" ON public.guru_izin;
CREATE POLICY "guru_izin_delete_diri_atau_admin" ON public.guru_izin
  AS PERMISSIVE FOR DELETE TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = guru_izin.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = guru_izin.kelompok_id)
     OR (p.role = 'guru'           AND p.guru_id = guru_izin.guru_id))));

-- ── akses_kelas_request ──────────────────────────────────────────────
DROP POLICY IF EXISTS "akses_kelas_request_select_pihak_terkait" ON public.akses_kelas_request;
CREATE POLICY "akses_kelas_request_select_pihak_terkait" ON public.akses_kelas_request
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = akses_kelas_request.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = akses_kelas_request.kelompok_id)
     OR (p.role = 'guru' AND p.guru_id IN (akses_kelas_request.requester_guru_id, akses_kelas_request.owner_guru_id)))));

DROP POLICY IF EXISTS "akses_kelas_request_insert_pemohon" ON public.akses_kelas_request;
CREATE POLICY "akses_kelas_request_insert_pemohon" ON public.akses_kelas_request
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = akses_kelas_request.kelompok_id)
     OR (p.role = 'guru' AND p.guru_id = akses_kelas_request.requester_guru_id))));

-- Memutus permintaan: PEMILIK kelas atau admin. Pemohon sengaja TIDAK
-- termasuk — kalau ikut, ia bisa menyetujui permintaannya sendiri.
DROP POLICY IF EXISTS "akses_kelas_request_update_pemilik" ON public.akses_kelas_request;
CREATE POLICY "akses_kelas_request_update_pemilik" ON public.akses_kelas_request
  AS PERMISSIVE FOR UPDATE TO public
  USING (EXISTS ( SELECT 1
   FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
  WHERE p.is_active AND (
        p.role = 'admin_ppg'
     OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = akses_kelas_request.kelompok_id))
     OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = akses_kelas_request.kelompok_id)
     OR (p.role = 'guru' AND p.guru_id = akses_kelas_request.owner_guru_id))));

COMMIT;
