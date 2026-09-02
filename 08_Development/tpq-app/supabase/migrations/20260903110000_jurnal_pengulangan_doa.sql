-- =====================================================================
-- 20260903110000_jurnal_pengulangan_doa.sql
--
-- Lanjutan "Pengulangan" untuk KLASIKAL HAFALAN DO'A -- diminta owner
-- 2026-09-03: "munculkan klasikal - hafalan do'a letakan di bawah
-- tampilan hafalan surat" di Monitoring > Pencapaian Materi.
--
-- Migrasi 20260902150000 sengaja MENUNDA Hafalan Do'a ("kategorinya di
-- kurikulum_prota kosong ... belum ada daftar baku"). Itu sudah TIDAK
-- berlaku: sejak 2026-09-02 owner mengisi Prota kategori Hafalan Do'a
-- dan RencanaPembelajaranView mengisi kolom `klasikal_hafalan_doa` dari
-- CENTANG cek-list (bukan ketikan bebas) -- daftar koma yang sama
-- bersihnya dgn klasikal_hafalan_surat. Jadi pola yang sama bisa
-- dipakai apa adanya.
--
-- Struktur (tabel turunan + trigger SECURITY DEFINER + RPC per-kelas
-- SECURITY INVOKER + backfill) MENIRU PERSIS
-- 20260902150000_jurnal_pengulangan_surat.sql -- lihat komentar panjang
-- di berkas itu utk semua alasan rancangannya (kenapa tabel turunan,
-- kenapa tanggal_disampaikan bukan tanggal_rencana, kenapa RLS baca-
-- saja + tulis lewat trigger, bentuk kebijakan InitPlan, dst).
--
-- BEDA dari versi surat: HANYA sisi per-KELAS (RPC
-- jurnal_pengulangan_kelas_doa). Sisi per-SANTRI belum diminta owner --
-- tidak dibuat, biar tidak ada RPC 4-tabel-join yang tidak dipakai.
--
-- Asmaul Husna: nilai bisa "Asmaul Husna (1 sampai 20)" dgn angka yang
-- diketik guru per hari (lihat asmaulHusnaRentang di
-- RencanaPembelajaranView) -- rentang berbeda jadi baris nama_doa
-- berbeda. Dibiarkan APA ADANYA utk v1 (sama sederhananya dgn surat);
-- kalau owner minta digabung, itu perubahan terpisah.
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

begin;

-- ── Tabel turunan ───────────────────────────────────────────────────
create table if not exists public.jurnal_materi_hafalan_doa (
  id bigint generated always as identity primary key,
  materi_id bigint not null references public.jurnal_materi(id) on delete cascade,
  kelas_id bigint not null,
  kelompok_id bigint not null,
  tanggal date not null,
  nama_doa text not null,
  created_at timestamptz not null default now(),
  unique (materi_id, nama_doa)
);

create index if not exists idx_jurnal_hafalan_doa_kelas_tanggal
  on public.jurnal_materi_hafalan_doa (kelas_id, tanggal);

comment on table public.jurnal_materi_hafalan_doa is
  'Satu baris = satu do''a pada satu materi Klasikal yang SUDAH disampaikan. Dipertahankan otomatis oleh trg_jurnal_materi_hafalan_doa -- jangan ditulis manual dari aplikasi. Dasar RPC jurnal_pengulangan_kelas_doa. Kembar dari jurnal_materi_hafalan_surat (migrasi 20260902150000).';

alter table public.jurnal_materi_hafalan_doa enable row level security;

drop policy if exists jurnal_materi_hafalan_doa_select_scoped on public.jurnal_materi_hafalan_doa;
create policy jurnal_materi_hafalan_doa_select_scoped
  on public.jurnal_materi_hafalan_doa
  for select
  to authenticated
  using (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k where k.id = jurnal_materi_hafalan_doa.kelompok_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = jurnal_materi_hafalan_doa.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and jurnal_materi_hafalan_doa.kelas_id in (
        select kl.id from public.kelas kl
        where kl.guru_id = (select p.guru_id from auth_profile() p where p.is_active)
      )
    )
  );

-- ── Trigger: pertahankan tabel turunan otomatis ────────────────────────
create or replace function public.sync_jurnal_materi_hafalan_doa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.jurnal_materi_hafalan_doa where materi_id = coalesce(old.id, new.id);

  if TG_OP = 'DELETE' then
    return old;
  end if;

  if new.jenis = 'klasikal'
     and new.status = 'disampaikan'
     and new.deleted_at is null
     and new.klasikal_hafalan_doa is not null
     and new.tanggal_disampaikan is not null
  then
    insert into public.jurnal_materi_hafalan_doa (materi_id, kelas_id, kelompok_id, tanggal, nama_doa)
    select new.id, new.kelas_id, new.kelompok_id, new.tanggal_disampaikan, s
    from unnest(public.jurnal_split_daftar(new.klasikal_hafalan_doa)) as s;
  end if;

  return new;
end;
$$;

comment on function public.sync_jurnal_materi_hafalan_doa() is
  'Kembar dari sync_jurnal_materi_hafalan_surat (migrasi 20260902150000) untuk kolom klasikal_hafalan_doa. SECURITY DEFINER supaya bisa menulis ke tabel turunan yang RLS-nya baca-saja.';

drop trigger if exists trg_jurnal_materi_hafalan_doa on public.jurnal_materi;
create trigger trg_jurnal_materi_hafalan_doa
  after insert or update of klasikal_hafalan_doa, jenis, status, tanggal_disampaikan, kelas_id, kelompok_id, deleted_at
  or delete
  on public.jurnal_materi
  for each row
  execute function public.sync_jurnal_materi_hafalan_doa();

-- ── Backfill baris yang sudah ada ─────────────────────────────────────
update public.jurnal_materi
set status = status
where jenis = 'klasikal' and deleted_at is null;

-- ── RPC: pengulangan per KELAS (Hafalan Do'a) ─────────────────────────
create or replace function public.jurnal_pengulangan_kelas_doa(
  p_kelas_id bigint,
  p_awal date,
  p_akhir date
)
returns table (nama_doa text, jumlah int, terakhir date)
language sql
stable
as $$
  select nama_doa, count(*)::int as jumlah, max(tanggal) as terakhir
  from public.jurnal_materi_hafalan_doa
  where kelas_id = p_kelas_id
    and tanggal between p_awal and p_akhir
  group by nama_doa
  order by jumlah desc, nama_doa;
$$;

revoke all on function public.jurnal_pengulangan_kelas_doa(bigint, date, date) from public;
revoke all on function public.jurnal_pengulangan_kelas_doa(bigint, date, date) from anon;
grant execute on function public.jurnal_pengulangan_kelas_doa(bigint, date, date) to authenticated;

comment on function public.jurnal_pengulangan_kelas_doa(bigint, date, date) is
  'Jumlah "sudah diulang berapa kali" per do''a, satu kelas, satu rentang tanggal. Kembar dari jurnal_pengulangan_kelas (surat). Murni informasi, tanpa ambang.';

commit;
