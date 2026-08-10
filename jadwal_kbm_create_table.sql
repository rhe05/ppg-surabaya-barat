-- Generated from transformed_data.json (jadwal_kbm, 8 rows, Kelp Petemon only).
-- dibuat_oleh is NOT given a FK constraint: all 8/8 rows have
-- dibuat_oleh = 0, which doesn't resolve to any user/profile id — looks like
-- an unset placeholder in the source data, not a real reference.
create table public.jadwal_kbm (
  id bigint primary key,
  kelompok_id bigint not null references public.kelompok(id),
  hari text,
  keterangan text,
  dibuat_oleh bigint,
  dibuat_pada date,
  tanggal date,
  ruangan text,
  kategori text,
  jam_mulai time,
  jam_selesai time,
  santri_count integer not null default 0,
  kelas text,
  guru_id bigint references public.guru(id),
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
