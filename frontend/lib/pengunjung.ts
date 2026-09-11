/* Pesan bersama utk peran `pengunjung` (demo aplikasi via link,
   2026-09-11) — READ-ONLY by design, RLS tabel jamaah/jurnal/dst
   SENGAJA tak punya kebijakan tulis utknya. Dipakai di titik simpan/
   hapus SEBELUM query dipanggil, supaya yang tampil pesan yang jelas
   ("Mode Pengunjung...") bukan error Postgres mentah "new row violates
   row-level security policy". */
export const PESAN_PENGUNJUNG_HANYA_LIHAT =
  'Mode Pengunjung hanya untuk melihat — perubahan tidak bisa disimpan.';
