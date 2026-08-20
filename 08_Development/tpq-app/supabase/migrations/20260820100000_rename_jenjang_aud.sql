-- Ganti label enum santri_jenjang 'AUD' -> 'PAUD/TK' (diminta owner 20 Agt,
-- fokus Data Generus): istilah "AUD" tidak familiar bagi admin, "PAUD/TK"
-- lebih dikenal. ALTER TYPE ... RENAME VALUE mengubah SEMUA baris santri
-- yang sudah punya jenjang_saat_ini='AUD' sekaligus (di level katalog enum,
-- bukan UPDATE per-baris) -- tidak ada risiko sebagian baris tertinggal.
-- Baca komentar type santri_jenjang (20260805080137_database_foundation.sql
-- baris 85-89): nilai enum ini harus cocok persis dgn frontend (JENJANG di
-- components/santri/SantriForm.tsx dkk) -- diubah bersamaan di commit yang
-- sama.
alter type santri_jenjang rename value 'AUD' to 'PAUD/TK';
