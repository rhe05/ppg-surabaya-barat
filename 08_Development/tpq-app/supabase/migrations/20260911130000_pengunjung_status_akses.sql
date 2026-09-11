-- =====================================================================
-- 20260911130000_pengunjung_status_akses.sql
--
-- Fitur "Pengunjung" -- LANGKAH 4. Selama ini kadaluwarsa (30 hari)
-- cuma ditegakkan lewat RLS: baris jadi kosong tanpa penjelasan (guru/
-- kelas/jamaah dst kembali nol) -- terlihat spt aplikasi rusak, bukan
-- "izin Anda berakhir". Frontend perlu tahu status akses SENDIRI
-- (tanpa bisa membaca tabel pengunjung_akses langsung -- itu RLS-nya
-- admin_ppg-only) supaya bisa menampilkan layar "Akses Berakhir" yang
-- jelas + tombol Keluar, bukan membiarkan pengunjung nyasar ke layar
-- app yang datanya nihil.
--
-- RPC ini dipanggil client (RequireAuth.tsx) sekali saat profil
-- `pengunjung` diketahui. Re-otorisasi = admin_ppg membuat LINK BARU;
-- begitu pengunjung yang sama klaim ulang, `klaim_akses_pengunjung`
-- (migrasi 20260911120000) menimpa `pengunjung_akses_id` ke token baru
-- -- alur "izin lagi ke admin" sudah otomatis lewat situ, tidak perlu
-- fitur permintaan akses terpisah.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.status_akses_pengunjung()
RETURNS TABLE(valid boolean, berlaku_sampai timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT (NOT pa.dicabut AND pa.berlaku_sampai > now()), pa.berlaku_sampai
  FROM profiles pr
  JOIN pengunjung_akses pa ON pa.id = pr.pengunjung_akses_id
  WHERE pr.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.status_akses_pengunjung() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.status_akses_pengunjung() TO authenticated;

COMMIT;
