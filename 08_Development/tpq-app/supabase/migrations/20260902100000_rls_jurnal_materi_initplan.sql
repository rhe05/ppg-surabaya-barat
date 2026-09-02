-- Audit jurnal 2026-09-02, temuan 06: kebijakan SELECT jurnal_materi
-- memanggil auth_profile() SEKALI PER BARIS.
--
-- Buktinya dari EXPLAIN (ANALYZE) yang dijalankan sambil menyamar sebagai
-- seorang guru di produksi:
--
--   Index Scan on jurnal_materi ... Filter: EXISTS(SubPlan 5)
--     SubPlan 5
--       ->  Function Scan on auth_profile p_1 ... loops=5      <-- per baris
--             InitPlan 4
--               ->  Index Scan on kelas kl ... Filter: EXISTS(SubPlan 3)
--                     SubPlan 3
--                       ->  Function Scan on auth_profile p ... loops=5   <-- lagi
--
-- Jadi tiap baris jurnal_materi membayar DUA pencarian profil: satu untuk
-- kebijakan tabel ini, satu lagi untuk kebijakan tabel `kelas` yang ikut
-- terpanggil dari subquery pemilik kelas. Pada 12 baris ini tidak terasa
-- (20 ms), tapi biayanya tumbuh linier terhadap jumlah baris yang dipindai.
--
-- PERBAIKAN: pindahkan bagian yang TIDAK bergantung pada baris (profil
-- penggunanya sendiri) ke subquery skalar tanpa korelasi. Postgres
-- mengangkatnya jadi InitPlan — dievaluasi SEKALI per pernyataan, bukan
-- per baris. Ini pola yang sama dengan anjuran resmi Supabase
-- "(select auth.uid())" untuk kebijakan RLS.
--
-- SEMANTIKNYA TIDAK BERUBAH sedikit pun; keempat cabang peran, syarat
-- is_active, dan penjagaan guru_id IS NOT NULL dipertahankan apa adanya.
-- Kesetaraannya diuji dengan matriks keterlihatan enam peran + anon,
-- sebelum & sesudah (lihat catatan di bawah).
--
-- ⚠️ CATATAN JUJUR: langkah ini SAJA belum menyelesaikan masalahnya.
-- Pada 12 baris produksi, waktu eksekusi sebelum & sesudah sama-sama ada
-- di rentang derau (11-20 ms) sehingga tidak bisa dipakai sebagai bukti.
-- Yang pasti berubah hanyalah BENTUK RENCANA: pencarian profil naik dari
-- SubPlan (per baris) jadi InitPlan (sekali per pernyataan). Sisa biaya
-- per baris -- subquery pemilik kelas yang ikut memicu RLS tabel kelas --
-- baru dibereskan di migrasi 20260902120000, setelah diukur pada 20.000
-- baris. Angka pembanding yang benar ada di berkas migrasi itu.
--
-- Cakupan sengaja dibatasi ke kebijakan SELECT. Kebijakan INSERT/UPDATE/
-- DELETE menyentuh satu baris lewat id sehingga tidak punya masalah
-- per-baris yang sama.

drop policy if exists jurnal_materi_select_scoped on public.jurnal_materi;

create policy jurnal_materi_select_scoped on public.jurnal_materi
for select
using (
  (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
  or (
    (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
    and (select p.scope_desa_id from auth_profile() p where p.is_active)
        = (select k.desa_id from kelompok k where k.id = jurnal_materi.kelompok_id)
  )
  or (
    (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
    and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = jurnal_materi.kelompok_id
  )
  or (
    (select p.role from auth_profile() p where p.is_active) = 'guru'
    and (select p.guru_id from auth_profile() p where p.is_active) is not null
    and (select p.guru_id from auth_profile() p where p.is_active)
        = (select kl.guru_id from kelas kl where kl.id = jurnal_materi.kelas_id)
  )
);

comment on policy jurnal_materi_select_scoped on public.jurnal_materi is
  'Cakupan baca per peran. Bagian profil ditulis sebagai subquery skalar tanpa korelasi supaya jadi InitPlan (sekali per pernyataan), bukan SubPlan per baris — lihat migrasi 20260902100000.';
