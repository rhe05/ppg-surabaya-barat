-- Audit kehadiran 2026-09-02, temuan 01: kebijakan SELECT `absensi`
-- punya penyakit yang sama dengan jurnal_materi kemarin — auth_profile()
-- dievaluasi SEKALI PER BARIS karena EXISTS-nya berkorelasi dengan kolom
-- barisnya sendiri.
--
-- Taruhannya jauh lebih besar di sini: `absensi` tabel TERBESAR di
-- aplikasi (2.043 baris / 11 MB saat audit, bertambah tiap hari KBM), dan
-- layar Riwayat Kehadiran membaca sebulan penuh × seluruh santri satu
-- kelas sekaligus.
--
-- Diukur pada 20.000 baris (tabel sementara di dalam transaksi yang
-- di-rollback, menyamar sebagai guru, 3× jalan, nilai tengah):
--   A. bentuk sekarang (EXISTS berkorelasi)  66 ms
--   B. profil sebagai InitPlan               40 ms   (-39%)
--
-- Perbaikannya lebih sederhana daripada jurnal_materi: cabang guru di
-- sini cuma membandingkan kelompok_id, tidak perlu daftar kelas. Cabang
-- 'admin_kelompok' dan 'guru' digabung karena syaratnya memang identik
-- (keduanya: scope_kelompok_id = absensi.kelompok_id) — penggabungan ini
-- TIDAK mengubah siapa yang boleh melihat apa, cuma menghemat satu
-- pemanggilan InitPlan.
--
-- ⚠️ `TO authenticated` disertakan sejak awal: pelajaran dari migrasi
-- 20260902110000 kemarin, di mana kebijakan tanpa pembatasan peran
-- membuat pengunjung anon mendapat error, bukan nol baris. Di sini tidak
-- ada fungsi ber-GRANT terbatas, tapi membatasi ke authenticated tetap
-- lebih benar: untuk anon tidak ada kebijakan yang cocok sama sekali,
-- jadi tabel tertutup rapat tanpa perlu mengevaluasi apa pun.
--
-- Semantik TIDAK berubah. Matriks keterlihatan (2 guru kelp-1, 1 guru
-- kelp-6, 2 admin_kelompok beda kelompok, admin_ppg, anon) diperiksa
-- identik sebelum & sesudah.
--
-- Cakupan: kebijakan SELECT saja. UPDATE/DELETE menyentuh baris lewat id
-- (satu baris) sehingga tidak punya masalah per-baris yang sama.

drop policy if exists absensi_select_scoped on public.absensi;

create policy absensi_select_scoped on public.absensi
for select
to authenticated
using (
  (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
  or (
    (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
    and (select p.scope_desa_id from auth_profile() p where p.is_active)
        = (select k.desa_id from kelompok k where k.id = absensi.kelompok_id)
  )
  or (
    (select p.role from auth_profile() p where p.is_active) in ('admin_kelompok', 'guru')
    and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = absensi.kelompok_id
  )
);

comment on policy absensi_select_scoped on public.absensi is
  'Cakupan baca per peran. Bagian profil ditulis sebagai subquery skalar tanpa korelasi supaya jadi InitPlan (sekali per pernyataan), bukan SubPlan per baris — 40 ms vs 66 ms pada 20.000 baris. Lihat migrasi 20260902130000.';
