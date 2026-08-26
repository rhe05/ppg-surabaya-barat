-- Kategori "Remaja Pra Nikah" + kolom kelas.hari_ngaji (2026-08-26)
--
-- Diminta owner: kelas berkategori "Remaja Pra Nikah" jadwalnya SELALU
-- Selasa/Rabu/Kamis/Jumat (checklist, bukan satu jam_mulai/jam_selesai
-- tetap spt kategori lain -- kolom itu tetap wajib diisi di form utk
-- kelas ini, cuma tidak dipakai buat menentukan hari), DAN kelas
-- kategori ini TIDAK punya satu Guru Pengampu tetap (gurunya gilir
-- beda-beda tiap hari ngaji) -- jadi guru_id kelas utk kategori ini
-- sengaja dikosongkan dari FORM (components/kelas/KelasForm.tsx),
-- bukan lewat constraint DB (kolom guru_id kelas sudah nullable sejak
-- migrasi 20260805080137_database_foundation.sql).
--
-- kategori_kbm SUDAH didokumentasikan "admin-editable" (lihat komentar
-- tabel di 20260805080137), jadi INSERT baris baru di sini konsisten
-- dgn desain aslinya -- bukan penyimpangan.

insert into kategori_kbm (nama, urutan)
values ('Remaja Pra Nikah', (select coalesce(max(urutan), 0) + 1 from kategori_kbm))
on conflict (nama) do nothing;

alter table kelas add column if not exists hari_ngaji text[];
comment on column kelas.hari_ngaji is 'Checklist hari ngaji mingguan (nilai teks nama hari, mis. {Selasa,Rabu,Kamis,Jumat}) -- HANYA diisi utk kelas berkategori "Remaja Pra Nikah". NULL utk kelas kategori lain (jadwalnya sudah cukup lewat jam_mulai/jam_selesai per kelas).';
