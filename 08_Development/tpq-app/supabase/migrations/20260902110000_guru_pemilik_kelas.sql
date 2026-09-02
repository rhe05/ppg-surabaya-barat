-- Lanjutan migrasi 20260902100000 (audit jurnal, temuan 06).
--
-- Setelah bagian profil diangkat jadi InitPlan, sisa biaya per-baris ada
-- di subquery pemilik kelas:
--
--   SubPlan 12
--     ->  Index Scan on kelas kl ... Filter: EXISTS(SubPlan 11)   loops=5
--           SubPlan 11
--             ->  Function Scan on auth_profile p_8 ...           loops=5
--
-- Sebabnya: subquery `select kl.guru_id from kelas kl where kl.id = ...`
-- di dalam kebijakan dijalankan sebagai pengguna yang bertanya, jadi
-- kebijakan RLS tabel `kelas` IKUT dievaluasi — sekali lagi per baris
-- jurnal_materi. Jadi satu baris jurnal membayar dua pencarian profil.
--
-- Fungsi kecil SECURITY DEFINER di bawah memutus rantai itu: ia melihat
-- satu kolom `kelas.guru_id` tanpa memicu kebijakan `kelas`.
--
-- Batas kebocoran yang disengaja & dipertimbangkan: fungsi ini hanya
-- mengembalikan ANGKA guru_id untuk satu id kelas — tidak ada nama, tidak
-- ada data santri, tidak ada kolom lain. EXECUTE dicabut dari PUBLIC dan
-- anon (aturan proyek: tiap fungsi baru WAJIB REVOKE ... FROM PUBLIC),
-- disisakan untuk `authenticated` saja karena kebijakan RLS memang
-- dievaluasi sebagai peran itu.

create or replace function public.guru_pemilik_kelas(p_kelas_id bigint)
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select guru_id from kelas where id = p_kelas_id
$$;

revoke all on function public.guru_pemilik_kelas(bigint) from public;
revoke all on function public.guru_pemilik_kelas(bigint) from anon;
grant execute on function public.guru_pemilik_kelas(bigint) to authenticated;

comment on function public.guru_pemilik_kelas(bigint) is
  'Pemilik (guru_id) satu kelas, tanpa memicu RLS tabel kelas. Dipakai kebijakan SELECT jurnal_materi supaya tiap baris tidak membayar dua pencarian profil — lihat migrasi 20260902110000.';

-- ⚠️ Kebijakan DIBATASI ke peran `authenticated`. Ini bukan hiasan:
-- percobaan pertama (tanpa TO authenticated) membuat pengunjung yang
-- BELUM login mendapat error "permission denied for function
-- guru_pemilik_kelas", bukan nol baris seperti sebelumnya — sebab
-- Postgres tidak menjamin cabang OR dihubung-singkat, jadi fungsinya
-- tetap disentuh walau cabang perannya jelas tidak cocok.
--
-- Dua jalan keluar; yang dipilih adalah yang kedua:
--   (a) beri EXECUTE ke anon  -> siapa pun tanpa login bisa memanggil
--       fungsinya lewat RPC dan memetakan kelas_id -> guru_id. Ditolak.
--   (b) batasi kebijakannya ke `authenticated` -> untuk anon tidak ada
--       kebijakan yang cocok sama sekali, jadi tabel ini tertutup rapat
--       (default deny) dan fungsinya tidak pernah tersentuh. Dipilih.
-- Hasilnya sama persis dengan perilaku lama: anon = nol baris, tanpa
-- error.
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
    and (select p.guru_id from auth_profile() p where p.is_active) is not null
    and (select p.guru_id from auth_profile() p where p.is_active)
        = public.guru_pemilik_kelas(jurnal_materi.kelas_id)
  )
);

comment on policy jurnal_materi_select_scoped on public.jurnal_materi is
  'Cakupan baca per peran. Bagian profil = subquery skalar tanpa korelasi (InitPlan, sekali per pernyataan); pemilik kelas lewat guru_pemilik_kelas() supaya RLS tabel kelas tidak ikut dievaluasi per baris. Lihat migrasi 20260902100000 & 20260902110000.';
