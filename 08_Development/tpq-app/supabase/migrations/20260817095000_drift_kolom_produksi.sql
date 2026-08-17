-- =====================================================================
-- 20260817095000_drift_kolom_produksi.sql
--
-- Menutup selisih KOLOM antara `supabase/migrations/` dan DB produksi
-- (fnhqtkqswxsqmjxynldg).
--
-- Ditemukan 2026-08-17 saat menguji migrasi santri di project test
-- qaqhoibxcotjzgxdthfl: migrasi lolos dipasang, tapi `tambah_santri()`
-- langsung gagal "column santri.kelas_ngaji does not exist". Diff penuh
-- information_schema.columns produksi vs test: 359 kolom vs 351 —
-- 8 kolom hanya ada di produksi, 0 kolom hanya ada di test, jumlah tabel
-- sama (37). Artinya kedelapan kolom ini pernah ditambahkan langsung ke
-- produksi lewat ALTER TABLE tanpa pernah masuk berkas migrasi.
--
-- Kenapa ini serius: gerbang kerja "test push ke project test dulu, baru
-- produksi" hanya bermakna kalau project test benar-benar replika produksi.
-- Selama selisih ini ada, migrasi bisa lolos di test lalu gagal (atau
-- lebih buruk: merusak) di produksi. Berkas ini mengembalikan properti itu.
--
-- Catatan: pemeriksaan parity 2026-08-15 (migrasi ...000_sync_dari_produksi)
-- membandingkan enum, fungsi, CHECK, index, trigger, RLS, dan policy —
-- KOLOM TABEL tidak ikut dibandingkan. Jadi selisih ini lolos bukan karena
-- pemeriksaannya salah, tapi karena cakupannya lebih sempit.
--
-- Seluruh kolom di bawah nullable tanpa default, persis seperti di produksi,
-- sehingga:
--   - di PRODUKSI berkas ini no-op (kolomnya sudah ada),
--   - di DB baru/test kolomnya dibuat dengan definisi yang sama,
--   - tidak ada baris lama yang perlu di-backfill.
-- Idempoten, aman dijalankan ulang.
--
-- Timestamp SENGAJA lebih awal dari 20260817100000_santri_nis_unik_dan_rpc:
-- fungsi tambah_santri() di berkas itu menulis ke santri.kelas_ngaji, jadi
-- kolomnya harus sudah ada saat migrasi dijalankan berurutan dari nol.
-- =====================================================================

BEGIN;

-- santri.kelas_ngaji — diisi form Generus (Markup_Screens.html) dan ditulis
-- serverAddSantri/serverUpdateSantri (Modul_MaintainSantri.gs:107, :204).
ALTER TABLE public.santri
  ADD COLUMN IF NOT EXISTS kelas_ngaji text;

-- jadwal_kategori_hari — dipakai Modul_MaintainJadwalKBM.gs
-- (serverGetJadwalKategoriHari / serverSaveJadwalKategoriHari).
ALTER TABLE public.jadwal_kategori_hari
  ADD COLUMN IF NOT EXISTS hari_aktif text;
ALTER TABLE public.jadwal_kategori_hari
  ADD COLUMN IF NOT EXISTS diubah_pada timestamptz;

-- kurikulum_probul.minggu1-4 — rincian materi per minggu dalam satu bulan,
-- ditambahkan saat redesign Kurikulum Bulanan (Modul_MaintainKurikulum.gs,
-- serverSetProbulBulan). Empat kolom ini yang selama ini tercatat sebagai
-- migrasi "belum dikonfirmasi jalan" — ternyata sudah ada di Postgres,
-- hanya belum pernah tercatat di berkas migrasi.
ALTER TABLE public.kurikulum_probul
  ADD COLUMN IF NOT EXISTS minggu1 text;
ALTER TABLE public.kurikulum_probul
  ADD COLUMN IF NOT EXISTS minggu2 text;
ALTER TABLE public.kurikulum_probul
  ADD COLUMN IF NOT EXISTS minggu3 text;
ALTER TABLE public.kurikulum_probul
  ADD COLUMN IF NOT EXISTS minggu4 text;

-- kurikulum_promes.kelompok_id — kolom inilah yang dulu membuat test push
-- migrasi 003 gagal di statement 70 (policy kurikulum_promes_select_scoped
-- merujuk kolom yang belum ada di skema migrasi).
ALTER TABLE public.kurikulum_promes
  ADD COLUMN IF NOT EXISTS kelompok_id bigint;

COMMIT;
