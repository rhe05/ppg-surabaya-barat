-- =====================================================================
-- 20260903120000_tilawati_pelaksanaan.sql
--
-- Owner (2026-09-03): kartu baru "Tilawati" di Pelaksanaan Pembelajaran
-- (guru mobile). Per santri di kelas: Buku Jilid, Halaman, dan status
-- "Naik" / "Tetap" yang dicatat guru saat KBM.
--
-- Satu baris = catatan Tilawati satu santri pada satu TANGGAL (guru
-- mencatat "hari ini"). UNIQUE (santri_id, tanggal) -> upsert langsung,
-- riwayat per hari tersimpan.
--
-- Skema & RLS meniru PERSIS jurnal_materi (20260820120000): SELECT/
-- INSERT/UPDATE dibatasi per peran, cabang guru = "kelas_id baris ini
-- ada di daftar kelas yang saya ampu" (bentuk InitPlan cepat, lihat
-- 20260902120000). kelompok_id TIDAK dipercaya dari klien -> ditimpa
-- trigger dari kelas.kelompok_id. updated_at lewat set_updated_at()
-- yang sudah ada. DELETE tanpa policy (tidak dipakai; kalau perlu,
-- soft-delete kolom nanti).
--
-- Berkas idempoten: aman dijalankan ulang.
-- =====================================================================

begin;

create table if not exists public.tilawati_pelaksanaan (
  id          bigint generated always as identity primary key,
  kelas_id    bigint not null references public.kelas (id),
  kelompok_id bigint not null references public.kelompok (id),
  santri_id   bigint not null references public.santri (id),
  tanggal     date not null,
  buku_jilid  text,
  halaman     text,
  status      text,
  dibuat_oleh uuid references public.profiles (id),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  constraint chk_tilawati_status check (status is null or status in ('naik', 'tetap')),
  constraint uq_tilawati_santri_tanggal unique (santri_id, tanggal)
);
comment on table public.tilawati_pelaksanaan is
  'Catatan Tilawati per santri per tanggal (Buku Jilid / Halaman / Naik|Tetap) -- diisi guru di kartu "Tilawati" pada Pelaksanaan Pembelajaran.';

create index if not exists idx_tilawati_kelas_tanggal
  on public.tilawati_pelaksanaan (kelas_id, tanggal);

-- kelompok_id selalu ditimpa dari kelas (tidak dipercaya dari klien).
create or replace function public.sync_tilawati_kelompok_id()
returns trigger
language plpgsql
as $$
declare
  v_kelompok_id bigint;
begin
  select kl.kelompok_id into v_kelompok_id from public.kelas kl where kl.id = new.kelas_id;
  if v_kelompok_id is null then
    raise exception 'tilawati_pelaksanaan.kelas_id % tidak ada di tabel kelas', new.kelas_id;
  end if;
  new.kelompok_id = v_kelompok_id;
  return new;
end;
$$;

drop trigger if exists trg_tilawati_sync_kelompok_id on public.tilawati_pelaksanaan;
create trigger trg_tilawati_sync_kelompok_id
  before insert or update of kelas_id, kelompok_id on public.tilawati_pelaksanaan
  for each row execute function public.sync_tilawati_kelompok_id();

drop trigger if exists trg_tilawati_updated_at on public.tilawati_pelaksanaan;
create trigger trg_tilawati_updated_at
  before update on public.tilawati_pelaksanaan
  for each row execute function public.set_updated_at();

alter table public.tilawati_pelaksanaan enable row level security;

drop policy if exists "tilawati_select_scoped" on public.tilawati_pelaksanaan;
create policy "tilawati_select_scoped" on public.tilawati_pelaksanaan
  for select to authenticated
  using (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k where k.id = tilawati_pelaksanaan.kelompok_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = tilawati_pelaksanaan.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and tilawati_pelaksanaan.kelas_id in (
        select kl.id from public.kelas kl
        where kl.guru_id = (select p.guru_id from auth_profile() p where p.is_active)
      )
    )
  );

drop policy if exists "tilawati_insert_guru_admin" on public.tilawati_pelaksanaan;
create policy "tilawati_insert_guru_admin" on public.tilawati_pelaksanaan
  for insert to authenticated
  with check (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k
             join public.kelas kl on kl.kelompok_id = k.id
             where kl.id = tilawati_pelaksanaan.kelas_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active)
          = (select kl.kelompok_id from public.kelas kl where kl.id = tilawati_pelaksanaan.kelas_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and tilawati_pelaksanaan.kelas_id in (
        select kl.id from public.kelas kl
        where kl.guru_id = (select p.guru_id from auth_profile() p where p.is_active)
      )
    )
  );

drop policy if exists "tilawati_update_guru_admin" on public.tilawati_pelaksanaan;
create policy "tilawati_update_guru_admin" on public.tilawati_pelaksanaan
  for update to authenticated
  using (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = tilawati_pelaksanaan.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and tilawati_pelaksanaan.kelas_id in (
        select kl.id from public.kelas kl
        where kl.guru_id = (select p.guru_id from auth_profile() p where p.is_active)
      )
    )
  )
  with check (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active)
          = (select kl.kelompok_id from public.kelas kl where kl.id = tilawati_pelaksanaan.kelas_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and tilawati_pelaksanaan.kelas_id in (
        select kl.id from public.kelas kl
        where kl.guru_id = (select p.guru_id from auth_profile() p where p.is_active)
      )
    )
  );

commit;
