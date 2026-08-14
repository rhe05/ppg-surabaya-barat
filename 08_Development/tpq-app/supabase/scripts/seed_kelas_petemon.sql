-- ============================================================================
-- SEED KELAS PETEMON — migrasi data jadwal_kbm -> kelas
--
-- BUKAN FILE MIGRASI. Sengaja TIDAK diletakkan di supabase/migrations/.
-- Alasan: baris ini bergantung pada data operasional (kelompok id 1, guru
-- id 21/22/23/25, kategori_kbm id 4/11/13) yang TIDAK dibuat migrasi manapun
-- — seluruh 1646 baris data live masuk lewat jalur di luar migrasi. Kalau
-- dijadikan migrasi, `supabase db push` ke project bersih akan gagal FK.
--
-- CARA PAKAI  : jalankan manual di Supabase Studio > SQL Editor, project
--               fnhqtkqswxsqmjxynldg (live). Wewenang Rheza.
-- PRASYARAT   : migrasi 003 sudah ter-push (kelas punya 4 policy).
-- SUMBER      : 8 baris public.jadwal_kbm per 2026-08-14 (semua kelompok_id=1).
-- IDEMPOTEN   : ON CONFLICT DO NOTHING terhadap uq_kelas_kelompok_nama
--               (kelompok_id, lower(nama)) WHERE deleted_at IS NULL.
--
-- CATATAN PEMETAAN:
--   kategori (teks)   -> kategori_kbm_id : Cabe Rawit=4, Pra Remaja SMP=11,
--                                          Remaja SMA=13
--   dibuat_oleh (0)   -> created_by NULL : bigint 0 tidak bisa dipetakan ke uuid
--   hari, tanggal     -> DIABAIKAN       : kolom mati di sumber (7 baris seragam
--                                          'Senin'/'2026-07-20', 1 NULL); jadwal
--                                          hari yang sah ada di jadwal_kategori_hari
--   status 'Aktif'    -> 'aktif'         : label enum kelas_status
--   id                -> TIDAK di-set    : kelas.id GENERATED ALWAYS AS IDENTITY,
--                                          biarkan auto agar sequence tidak desync
--
-- jadwal_kbm SENGAJA TIDAK DI-DROP. Dibiarkan hidup sebagai cadangan sampai
-- kelas terbukti jalan. Penghapusan = pekerjaan terpisah.
--
-- RLS: kelas relforcerowsecurity=false, jadi role owner (postgres di Studio)
-- melewati policy. Tidak perlu menonaktifkan RLS.
-- ============================================================================

insert into public.kelas
  (kelompok_id, nama, kategori_kbm_id, guru_id, jam_mulai, jam_selesai,
   ruangan, keterangan, santri_count, status, created_by)
values
  -- jadwal_kbm.id=1
  (1, 'PAUD/TK A',      4, 25, '15:45', '16:30', 'Kantor/Ruang Tamu', null, 0, 'aktif', null),
  -- jadwal_kbm.id=4
  (1, '1A',             4, 22, '15:45', '16:45', 'Masjid Lt 1',       null, 0, 'aktif', null),
  -- jadwal_kbm.id=5
  (1, '1B',             4, 23, '15:45', '16:45', 'Aula Lt 2',         null, 0, 'aktif', null),
  -- jadwal_kbm.id=6
  (1, '2 & 3A',         4, 23, '16:45', '17:45', 'Aula Lt 2',         null, 0, 'aktif', null),
  -- jadwal_kbm.id=7
  (1, '4',              4, 21, '15:45', '16:45', 'Masjid Lt 1',       null, 0, 'aktif', null),
  -- jadwal_kbm.id=8
  (1, 'Pra Remaja SMP', 11, 21, '16:45', '17:45', 'Masjid Lt 1',      null, 2, 'aktif', null),
  -- jadwal_kbm.id=9
  (1, 'Remaja SMA',     13, 22, '18:00', '19:00', 'Masjid Lt 1',      null, 0, 'aktif', null),
  -- jadwal_kbm.id=10
  (1, 'PAUD/TK B',      4, 25, '16:30', '17:30', 'Kantor/Ruang Tamu', null, 7, 'aktif', null)
on conflict do nothing;

-- VERIFIKASI SESUDAH JALAN (harus 8):
--   select count(*) from public.kelas;
--   select id, nama, kategori_kbm_id, guru_id, jam_mulai, jam_selesai, ruangan,
--          santri_count, status from public.kelas order by id;
-- BASELINE ABSENSI TIDAK BOLEH BERUBAH (harus tetap 950):
--   select count(*) from public.absensi;
