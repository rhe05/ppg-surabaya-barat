-- Koreksi atas migrasi 20260902110000 (audit jurnal, temuan 06).
--
-- Migrasi sebelumnya mengganti subquery pemilik kelas dengan fungsi
-- SECURITY DEFINER guru_pemilik_kelas(). Alasannya masuk akal di atas
-- kertas (memutus evaluasi RLS tabel `kelas` per baris) — TAPI SETELAH
-- DIUKUR, itu justru MEMPERLAMBAT. Fungsi SECURITY DEFINER tidak bisa
-- di-inline oleh perencana Postgres, jadi tiap baris membayar pemanggilan
-- fungsi sungguhan lengkap dengan pergantian konteks keamanan.
--
-- Pengukuran: 20.000 baris di tabel sementara, di dalam transaksi yang
-- di-rollback (nol dampak ke data produksi), menyamar sebagai guru,
-- tiga kali jalan, diambil nilai tengahnya:
--
--   A. bentuk lama (EXISTS berkorelasi)        269 ms
--   B. InitPlan + guru_pemilik_kelas per baris 763 ms   <-- 2,8x LEBIH LAMBAT
--   C. InitPlan + daftar kelas sekali           46 ms   <-- 5,9x lebih cepat
--
-- Bentuk C dipakai. Kuncinya: cabang guru tidak lagi menanyakan "siapa
-- pemilik kelas baris ini?" per baris, melainkan "kelas_id baris ini ada
-- di daftar kelas yang saya ampu?" — daftarnya tidak berkorelasi dengan
-- baris, jadi Postgres menghitungnya SEKALI per pernyataan lalu
-- mencocokkan lewat hash. Biaya per baris turun jadi satu pencarian hash.
--
-- Pelajaran yang dicatat di sini supaya tidak terulang: perbaikan RLS
-- WAJIB diukur pada jumlah baris yang realistis. Pada 12 baris produksi,
-- ketiga bentuk terlihat "sama saja" (11-17 ms, semuanya derau).
--
-- Semantik TIDAK berubah di ketiga bentuk; matriks keterlihatan enam
-- peran + anon diperiksa identik sebelum & sesudah tiap langkah.

drop policy if exists jurnal_materi_select_scoped on public.jurnal_materi;

create policy jurnal_materi_select_scoped on public.jurnal_materi
for select
to authenticated
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
    and jurnal_materi.kelas_id in (
      select kl.id from kelas kl
      where kl.guru_id = (select p.guru_id from auth_profile() p where p.is_active)
    )
  )
);

comment on policy jurnal_materi_select_scoped on public.jurnal_materi is
  'Cakupan baca per peran. Semua bagian yang tidak bergantung baris ditulis sebagai subquery tanpa korelasi supaya jadi InitPlan (sekali per pernyataan): profil pengguna, dan daftar kelas yang diampu. Diukur pada 20.000 baris: 46 ms vs 269 ms bentuk lama. Lihat migrasi 20260902120000.';

-- Fungsi bantu dari migrasi 20260902110000 tidak terpakai lagi. Dibuang
-- supaya tidak meninggalkan fungsi SECURITY DEFINER menganggur (permukaan
-- serang tanpa manfaat).
drop function if exists public.guru_pemilik_kelas(bigint);
