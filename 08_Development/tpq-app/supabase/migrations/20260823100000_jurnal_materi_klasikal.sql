-- =====================================================================
-- 20260823100000_jurnal_materi_klasikal.sql
--
-- Owner: Rencana Pembelajaran butuh jenis materi KEDUA -- "Materi
-- Klasikal", sesi pembukaan KBM (dewan guru): klasikal hafalan surat +
-- klasikal hafalan doa (Asmaul Husna termasuk di sini). Beda konsep dari
-- "Materi Ngaji" yg sudah ada (per-minggu, satu blok judul bebas) --
-- klasikal py struktur sendiri: satu tanggal, satu pilihan hafalan
-- surat, satu isian hafalan doa.
--
-- Ditaruh di jurnal_materi yg SUDAH ADA (bukan tabel baru) supaya
-- numpang infrastruktur yg sudah teruji: RLS per-role (guru/admin_kelp/
-- admin_desa/admin_ppg lewat kelas_id -> kelompok_id), trigger sinkron
-- kelompok_id (sync_jurnal_materi_kelompok_id), soft-delete
-- (deleted_at), tanggal_rencana yg sudah ada dipakai apa adanya utk
-- tanggal klasikal. TIDAK ADA perubahan RLS -- policy yg ada berlaku
-- per-BARIS, bukan per-kolom, jadi kolom baru otomatis ikut tercakup.
--
-- - jenis: pembeda 'ngaji' (default, baris LAMA otomatis dianggap ini)
--   vs 'klasikal'. CHECK constraint jaga2 dari typo nilai lain.
-- - klasikal_hafalan_surat: teks materi hafalan surat terpilih (dari
--   dropdown Kurikulum, TAPI tetap teks bebas -- bukan FK ke
--   kurikulum_prota, krn materi bisa ditulis manual/di luar Kurikulum jg
--   & tidak boleh rusak kalau baris Kurikulum sumbernya diedit/dihapus
--   nanti). NULL utk baris 'ngaji'.
-- - klasikal_hafalan_doa: sama pola dgn di atas, tapi ketentuan isi &
--   sumbernya BELUM ditentukan owner ("buatkan dulu, ketentuan
--   menyusul") -- sementara cuma kolom teks bebas, akan diperkaya nanti
--   (migrasi terpisah) begitu aturannya jelas.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

BEGIN;

ALTER TABLE public.jurnal_materi
  ADD COLUMN IF NOT EXISTS jenis text NOT NULL DEFAULT 'ngaji',
  ADD COLUMN IF NOT EXISTS klasikal_hafalan_surat text,
  ADD COLUMN IF NOT EXISTS klasikal_hafalan_doa text;

ALTER TABLE public.jurnal_materi
  DROP CONSTRAINT IF EXISTS jurnal_materi_jenis_check;
ALTER TABLE public.jurnal_materi
  ADD CONSTRAINT jurnal_materi_jenis_check CHECK (jenis IN ('ngaji', 'klasikal'));

COMMENT ON COLUMN public.jurnal_materi.jenis IS
  '''ngaji'' (default, per-minggu) atau ''klasikal'' (sesi pembukaan KBM: hafalan surat + hafalan doa).';
COMMENT ON COLUMN public.jurnal_materi.klasikal_hafalan_surat IS
  'Teks materi hafalan surat klasikal terpilih (bebas, bukan FK ke kurikulum_prota). NULL utk jenis=''ngaji''.';
COMMENT ON COLUMN public.jurnal_materi.klasikal_hafalan_doa IS
  'Teks materi hafalan doa/asmaul husna klasikal -- ketentuan isi BELUM final, kolom teks bebas sementara.';

COMMIT;
