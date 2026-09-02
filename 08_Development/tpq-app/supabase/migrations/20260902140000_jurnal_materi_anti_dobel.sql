-- Dilaporkan owner 2026-09-02: di Pelaksanaan Pembelajaran muncul DUA
-- baris Klasikal untuk kelas & tanggal yang sama (1 Sep 2026, kelas 1A),
-- isinya beda. Penyebabnya: tidak ada apa pun yang mencegahnya — borang
-- "Tambah Materi Klasikal" selalu menyisipkan baris baru, dan basis data
-- menerima saja.
--
-- Aturan yang diminta owner, apa adanya:
--   "tanggal sama + materi sama"  -> TIDAK BOLEH
--   "tanggal sama + materi beda"  -> BOLEH
--
-- Terjemahannya ke model data yang ada:
--
-- 1. KLASIKAL. Satu baris klasikal sudah memuat KEDUA materinya sekaligus
--    (kolom klasikal_hafalan_surat + klasikal_hafalan_doa). Jadi "materi
--    sama" di sini berarti barisnya sendiri: cukup SATU baris klasikal per
--    kelas per tanggal. Menambah Hafalan Do'a di tanggal yang sama tetap
--    bisa — diisikan ke baris yang sudah ada, bukan bikin baris kedua.
--
-- 2. MATERI NGAJI. Yang membedakan adalah judulnya, jadi kuncinya
--    (kelas, tanggal, judul). Dibandingkan tanpa peduli huruf besar-kecil
--    dan spasi tepi, supaya "Baca Simak" dan "baca simak " tetap terhitung
--    sama — itu bentuk kedobelan yang paling gampang lolos.
--
-- Kenapa di basis data, bukan cuma di aplikasi: pemeriksaan di aplikasi
-- bisa dilewati dua guru yang menekan Simpan pada detik yang sama, dan
-- kalah begitu ada jalan masuk lain (impor, perbaikan manual, layar admin).
-- Pola ini persis yang sudah dipakai absensi lewat uq_absensi_santri_tanggal
-- — dan itulah alasan absen ganda TIDAK PERNAH terjadi walau layarnya
-- dipakai belasan guru bersamaan.
--
-- Baris yang sudah terlanjur dobel dibereskan dulu (id 18 dihapus lunak
-- atas keputusan owner: yang dipertahankan id 17, "Al-Lahab, An-Nasr,
-- Al-Kafirun", sesuai kurikulum PAUD/TK Semester 2). Indeks di bawah
-- TIDAK akan terpasang kalau masih ada sisa dobel — itu disengaja: lebih
-- baik migrasi gagal keras daripada diam-diam tidak melindungi apa pun.

-- Klasikal: satu per kelas per tanggal.
create unique index if not exists uq_jurnal_klasikal_kelas_tanggal
  on public.jurnal_materi (kelas_id, tanggal_rencana)
  where jenis = 'klasikal' and deleted_at is null and tanggal_rencana is not null;

-- Materi ngaji: satu judul per kelas per tanggal (abai huruf besar-kecil).
create unique index if not exists uq_jurnal_ngaji_kelas_tanggal_judul
  on public.jurnal_materi (kelas_id, tanggal_rencana, lower(btrim(judul)))
  where jenis <> 'klasikal' and deleted_at is null and tanggal_rencana is not null;

comment on index public.uq_jurnal_klasikal_kelas_tanggal is
  'Cegah dua materi Klasikal di kelas & tanggal yang sama. Satu baris klasikal memuat hafalan surat DAN hafalan doa sekaligus, jadi tanggal yang sama cukup satu baris. Lihat migrasi 20260902140000.';

comment on index public.uq_jurnal_ngaji_kelas_tanggal_judul is
  'Cegah materi ngaji berjudul sama di kelas & tanggal yang sama (abai huruf besar-kecil & spasi tepi). Lihat migrasi 20260902140000.';
