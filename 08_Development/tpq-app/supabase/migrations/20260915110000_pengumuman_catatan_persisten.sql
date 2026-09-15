-- =====================================================================
-- 20260915110000_pengumuman_catatan_persisten.sql
--
-- Bug (dilaporkan owner 2026-09-15): kotak "Catatan" di komposer
-- Pengumuman Jadwal KBM (PengumumanKbmComposer.tsx) diedit + "Simpan
-- Pengumuman" ditekan -- tapi begitu HALAMAN DI-REFRESH, isinya kembali
-- ke CATATAN_DEFAULT bawaan kode. Akar masalahnya: `catatan` cuma STATE
-- REACT lokal (`useState(CATATAN_DEFAULT)`), tidak pernah ditulis ke DB
-- sama sekali -- "Simpan Pengumuman" cuma menyimpan TEKS JADI (kolom
-- `pengumuman.isi`) sebagai entri riwayat baru, bukan menyimpan template
-- catatan itu sendiri utk dipakai lagi nanti.
--
-- Tabel baru `pengumuman_catatan`: SATU baris per kelompok (kelompok_id
-- PK, bukan bertambah tiap simpan) -- catatan ini memang boilerplate yang
-- dipakai ulang tiap kali menyusun pengumuman, bukan riwayat. RLS disalin
-- pola `kelas_gabung_select_scoped`/`kelas_gabung_tulis_admin_guru`
-- (migrasi 20260828200000/20260915100000) -- guru & admin_kelompok
-- keduanya boleh baca+tulis, scoped ke kelompoknya sendiri.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pengumuman_catatan (
  kelompok_id  bigint PRIMARY KEY REFERENCES public.kelompok (id),
  catatan      text NOT NULL,
  diubah_oleh  uuid REFERENCES public.profiles (id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.pengumuman_catatan IS
  'Template "Catatan" di komposer Pengumuman Jadwal KBM -- satu baris per kelompok, dipakai ulang (bukan riwayat). Sebelum tabel ini, isian catatan cuma state React lokal dan hilang tiap refresh (dilaporkan owner 2026-09-15).';

ALTER TABLE public.pengumuman_catatan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pengumuman_catatan_select_scoped" ON public.pengumuman_catatan;
CREATE POLICY "pengumuman_catatan_select_scoped" ON public.pengumuman_catatan
  AS PERMISSIVE FOR SELECT TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = pengumuman_catatan.kelompok_id))
       OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = pengumuman_catatan.kelompok_id))));

DROP POLICY IF EXISTS "pengumuman_catatan_tulis_admin_guru" ON public.pengumuman_catatan;
CREATE POLICY "pengumuman_catatan_tulis_admin_guru" ON public.pengumuman_catatan
  AS PERMISSIVE FOR ALL TO public
  USING (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = pengumuman_catatan.kelompok_id))
       OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = pengumuman_catatan.kelompok_id))))
  WITH CHECK (EXISTS ( SELECT 1
     FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
    WHERE p.is_active AND (
          p.role = 'admin_ppg'
       OR (p.role = 'admin_desa' AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = pengumuman_catatan.kelompok_id))
       OR (p.role IN ('admin_kelompok', 'guru') AND p.scope_kelompok_id = pengumuman_catatan.kelompok_id))));

COMMIT;
