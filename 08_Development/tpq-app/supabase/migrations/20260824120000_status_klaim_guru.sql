-- =====================================================================
-- 20260824120000_status_klaim_guru.sql
--
-- Owner: fitur baru "Registrasi Guru" di /pengaturan (2026-08-24) --
-- admin (kelompok/desa/ppg) tambah baris `guru` (nama + kelompok) LEWAT
-- FORM RINGKAS (cuma nama, bukan form lengkap /guru yg py banyak field),
-- lalu guru itu klaim akun sendiri di /onboarding pakai mekanisme yang
-- SUDAH ADA (cari_guru_untuk_klaim/klaim_akun_guru, 20260820110000) --
-- TIDAK ada tabel/RPC klaim baru, "Registrasi Guru" murni cara CEPAT
-- mengisi tabel `guru` yang jadi sumber pencocokan itu.
--
-- Satu potong yang BELUM ada: UI perlu tahu guru mana yang SUDAH
-- diklaim (utk badge "Sudah Bergabung" + waktu klaim), tapi
-- profiles_select_self ("id = auth.uid()") TIDAK mengizinkan admin
-- membaca baris profiles siapa pun selain dirinya sendiri -- sengaja
-- ketat, sumber seluruh RLS app ini. status_klaim_guru() RPC ini
-- SECURITY DEFINER, menjembatani itu, TAPI tetap memeriksa wewenang
-- pemanggil per guru (scope kelompok/desa/ppg) sebelum membocorkan
-- status klaimnya -- pola yang sama dgn RPC SECURITY DEFINER lain di
-- app ini (setujui_pendaftaran dkk).
--
-- klaim_pada BEST-EFFORT dari profiles.updated_at (klaim_akun_guru()
-- menyetelnya persis saat klaim) -- bukan kolom "waktu klaim" khusus,
-- jadi bisa sedikit meleset kalau profil itu diedit lagi belakangan.
-- Disengaja: menambah kolom baru cuma utk tampilan sekunder ini
-- dianggap berlebihan utk fitur seringan ini.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.status_klaim_guru(p_guru_ids bigint[])
 RETURNS TABLE (guru_id bigint, sudah_klaim boolean, klaim_pada timestamptz)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    g.id,
    pr.id IS NOT NULL,
    pr.updated_at
  FROM guru g
  LEFT JOIN profiles pr ON pr.guru_id = g.id AND pr.deleted_at IS NULL
  WHERE g.id = ANY(p_guru_ids)
    AND EXISTS ( SELECT 1
       FROM auth_profile() p(role, scope_ppg_id, scope_desa_id, scope_kelompok_id, guru_id, is_active)
      WHERE p.is_active AND (
            p.role = 'admin_ppg'
         OR (p.role = 'admin_desa'     AND p.scope_desa_id = (SELECT k.desa_id FROM kelompok k WHERE k.id = g.kelompok_id))
         OR (p.role = 'admin_kelompok' AND p.scope_kelompok_id = g.kelompok_id)));
$function$;

REVOKE EXECUTE ON FUNCTION public.status_klaim_guru(bigint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.status_klaim_guru(bigint[]) TO authenticated;

COMMIT;
