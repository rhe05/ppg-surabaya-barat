-- Pelaksanaan Pembelajaran (guru mobile): satu materi kini bisa ditandai
-- "Tidak Tersampaikan" -- bukan cuma tersampaikan / belum. Diminta owner
-- 2026-09-03: "sangat dimungkinkan di kelas ada kendala sehingga materi
-- tidak bisa tersampaikan". Alasannya diisi guru dan disimpan di kolom
-- `catatan` yang SUDAH ADA (tidak perlu kolom baru) -- supaya masih
-- terlihat saat materi itu dijadwalkan ulang di hari lain.
--
-- Dua CHECK constraint pada public.jurnal_materi disetel ulang:
--   1. status: tambah nilai 'tidak_tersampaikan'
--   2. chk_jurnal_materi_tanggal_disampaikan: 'tidak_tersampaikan' tidak
--      wajib punya tanggal_disampaikan (materi itu memang tidak jadi
--      disampaikan). 'disampaikan' tetap wajib bertanggal, 'belum' tetap
--      wajib tanpa tanggal.
--
-- Trigger sinkron jurnal_materi_hafalan_surat / _doa memfilter
-- `status = 'disampaikan'`, jadi materi 'tidak_tersampaikan' otomatis
-- TIDAK ikut terhitung sebagai pengulangan -- tidak ada perubahan lain
-- yang diperlukan di sisi turunan.

alter table public.jurnal_materi
  drop constraint if exists jurnal_materi_status_check;

alter table public.jurnal_materi
  add constraint jurnal_materi_status_check
  check (status in ('belum', 'disampaikan', 'tidak_tersampaikan'));

alter table public.jurnal_materi
  drop constraint if exists chk_jurnal_materi_tanggal_disampaikan;

alter table public.jurnal_materi
  add constraint chk_jurnal_materi_tanggal_disampaikan check (
    (status = 'disampaikan' and tanggal_disampaikan is not null)
    or (status = 'tidak_tersampaikan')
    or (status = 'belum' and tanggal_disampaikan is null)
  );
