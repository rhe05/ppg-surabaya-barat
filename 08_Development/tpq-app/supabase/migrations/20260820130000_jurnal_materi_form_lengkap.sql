-- =====================================================================
-- 20260820130000_jurnal_materi_form_lengkap.sql
--
-- Diminta owner: form "Tambah Materi" di Rencana Pembelajaran diperkaya
-- (screenshot) -- Topik, Tanggal Rencana, Pertemuan ke-, Tujuan
-- Pembelajaran, Referensi/Sumber, Pengingat, selain Materi (judul) &
-- Minggu (minggu_ke) yang sudah ada. Kolom baru semuanya NULLABLE
-- (opsional kecuali judul/minggu_ke yang sudah wajib sejak awal).
--
-- `tanggal_rencana` MENGGANTIKAN pendekatan sebelumnya di
-- RiwayatPembelajaranView.tsx yang memperkirakan tanggal materi "belum
-- disampaikan" dari awal rentang minggunya (rentangMinggu) -- sekarang
-- ada tanggal target sungguhan yang diisi guru sendiri, jadi lebih
-- akurat drpd perkiraan.
--
-- `pengingat_aktif` HANYA menyimpan pilihan togglenya -- APLIKASI INI
-- BELUM PUNYA sistem notifikasi/pengingat push apa pun, jadi toggle ini
-- murni preferensi tersimpan, TIDAK benar-benar mengirim pengingat
-- (di luar cakupan permintaan "buatkan form"; kalau nanti owner mau
-- pengingat sungguhan, itu fitur terpisah -- push notification/cron).
-- =====================================================================

BEGIN;

ALTER TABLE public.jurnal_materi
  ADD COLUMN IF NOT EXISTS topik                 text,
  ADD COLUMN IF NOT EXISTS tanggal_rencana        date,
  ADD COLUMN IF NOT EXISTS pertemuan_ke           text,
  ADD COLUMN IF NOT EXISTS tujuan_pembelajaran    text,
  ADD COLUMN IF NOT EXISTS referensi              text,
  ADD COLUMN IF NOT EXISTS pengingat_aktif        boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jurnal_materi.tanggal_rencana IS
  'Tanggal target guru berniat menyampaikan materi ini -- dipakai Riwayat Pembelajaran sbg tanggal tampil selama belum disampaikan (tanggal_disampaikan masih null).';
COMMENT ON COLUMN public.jurnal_materi.pengingat_aktif IS
  'Preferensi toggle "Ingatkan saya" tersimpan saja -- app ini belum punya sistem notifikasi/pengingat sungguhan.';

COMMIT;
