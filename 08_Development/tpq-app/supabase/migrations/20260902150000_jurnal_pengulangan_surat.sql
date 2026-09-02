-- Fondasi "Pengulangan" (Monitoring Pencapaian Materi + kartu baru di
-- Riwayat Pembelajaran), disetujui owner 2026-09-02, Langkah 1-2 dari
-- rencana yang disepakati. HANYA Hafalan Surat -- Hafalan Do'a SENGAJA
-- belum ikut: kategorinya di kurikulum_prota kosong di semua kelas dan
-- tidak ada daftar baku (beda dgn Juz 'Amma yg sudah punya kamus
-- JUZ_AMMA_URUT di lib/hafalanSurat.ts), jadi belum ada dasar utk
-- menghitungnya. Menyusul begitu daftar baku do'a disepakati.
--
-- ── Keputusan penting yang MENGUBAH rancangan awal setelah dipikir ulang ──
--
-- "Sudah dibaca 10x" berarti BENAR-BENAR TERJADI, bukan direncanakan.
-- jurnal_materi punya DUA tanggal (tanggal_rencana vs tanggal_disampaikan)
-- persis utk membedakan itu. Maka baris turunan di sini HANYA dibuat utk
-- materi Klasikal yang status = 'disampaikan', dan tanggalnya adalah
-- tanggal_disampaikan (kapan SUNGGUHAN terjadi), bukan tanggal_rencana.
-- Ini juga yang dipakai mencocokkan kehadiran santri: santri harus HADIR
-- pada tanggal SUNGGUHAN materi itu disampaikan, bukan tanggal rencana
-- yang mungkin berbeda (guru bisa menyusulkan pelaksanaan di hari lain --
-- lihat "Disampaikan pada" di PelaksanaanPembelajaranView.tsx).
--
-- ── Kenapa tabel turunan, bukan mengurai teks tiap kali dibutuhkan ──
--
-- klasikal_hafalan_surat TERNYATA sudah bersih: nilainya selalu daftar
-- nama surat baku dipisah koma (mis. "Al-Lahab, An-Nasr, Al-Kafirun"),
-- karena diisi dari CENTANG atas opsiHafalanSurat (RencanaPembelajaranView
-- .tsx), bukan ketikan bebas. TIDAK perlu memanggil ulang penguraian
-- "s/d" dari hafalanSurat.ts di sini -- itu tugas Kurikulum -> daftar
-- opsi, sudah selesai sebelum sampai ke kolom ini. Tabel turunan
-- (bukan hitung on-the-fly) dipilih karena akan diagregasi berkali-kali
-- lintas periode (bulan/semester/tahun ajaran) oleh dua RPC berbeda --
-- mengurai teks tiap panggilan jauh lebih mahal drpd baca baris yang
-- sudah terurai & terindeks.
--
-- Dipertahankan OTOMATIS lewat trigger (pola yang SAMA PERSIS dgn
-- trg_jurnal_materi_updated_at & sinkron_santri_kelas_riwayat yang sudah
-- ada) -- app/frontend TIDAK PERLU diubah sedikit pun utk fondasi ini.

-- ── Pemecah teks (helper kecil, dipakai trigger) ───────────────────────
create or replace function public.jurnal_split_daftar(teks text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct s.t), array[]::text[])
  from (
    select btrim(x) as t
    from unnest(string_to_array(coalesce(teks, ''), ',')) as x
  ) s
  where s.t <> ''
$$;

comment on function public.jurnal_split_daftar(text) is
  'Pecah "Al-Lahab, An-Nasr, Al-Kafirun" jadi {Al-Lahab,An-Nasr,Al-Kafirun}, dibuang spasi tepi & duplikat. Nilai kolom klasikal_hafalan_surat sudah baku (dari centang, bukan ketikan bebas) -- ini murni pemisah koma, BUKAN pengurai "s/d" (itu tugas lib/hafalanSurat.ts di sisi Kurikulum).';

-- ── Tabel turunan ───────────────────────────────────────────────────
create table if not exists public.jurnal_materi_hafalan_surat (
  id bigint generated always as identity primary key,
  materi_id bigint not null references public.jurnal_materi(id) on delete cascade,
  -- kelas_id/kelompok_id disalin (BUKAN join ke jurnal_materi tiap baca)
  -- supaya kebijakan RLS di tabel ini bisa langsung memakai kolomnya
  -- sendiri (pola InitPlan yang terbukti cepat di migrasi 20260902120000),
  -- tanpa correlated subquery ke jurnal_materi.
  kelas_id bigint not null,
  kelompok_id bigint not null,
  -- Tanggal SUNGGUHAN disampaikan (tanggal_disampaikan), BUKAN rencana.
  tanggal date not null,
  nama_surat text not null,
  created_at timestamptz not null default now(),
  unique (materi_id, nama_surat)
);

create index if not exists idx_jurnal_hafalan_surat_kelas_tanggal
  on public.jurnal_materi_hafalan_surat (kelas_id, tanggal);

comment on table public.jurnal_materi_hafalan_surat is
  'Satu baris = satu surat pada satu materi Klasikal yang SUDAH disampaikan. Dipertahankan otomatis oleh trg_jurnal_materi_hafalan_surat -- jangan ditulis manual dari aplikasi. Dasar RPC jurnal_pengulangan_kelas & jurnal_pengulangan_santri.';

alter table public.jurnal_materi_hafalan_surat enable row level security;

-- Baca-saja untuk pengguna; tulis HANYA lewat trigger SECURITY DEFINER
-- di bawah (persis pola santri_kelas_riwayat: "RLS baca-saja, tulis
-- hanya lewat trigger"), jadi TIDAK ADA kebijakan INSERT/UPDATE/DELETE
-- di sini sama sekali -- itu otomatis berarti ditolak utk peran mana pun.
create policy jurnal_materi_hafalan_surat_select_scoped
  on public.jurnal_materi_hafalan_surat
  for select
  to authenticated
  using (
    (select p.role from auth_profile() p where p.is_active) = 'admin_ppg'
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_desa'
      and (select p.scope_desa_id from auth_profile() p where p.is_active)
          = (select k.desa_id from kelompok k where k.id = jurnal_materi_hafalan_surat.kelompok_id)
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'admin_kelompok'
      and (select p.scope_kelompok_id from auth_profile() p where p.is_active) = jurnal_materi_hafalan_surat.kelompok_id
    )
    or (
      (select p.role from auth_profile() p where p.is_active) = 'guru'
      and jurnal_materi_hafalan_surat.kelas_id in (
        select kl.id from public.kelas kl
        where kl.guru_id = (select p.guru_id from auth_profile() p where p.is_active)
      )
    )
  );

comment on policy jurnal_materi_hafalan_surat_select_scoped on public.jurnal_materi_hafalan_surat is
  'Bentuk sama persis dgn jurnal_materi_select_scoped (migrasi 20260902120000, "bentuk C" yg diukur 5,9x lebih cepat dari EXISTS berkorelasi) -- profil sbg subquery skalar (InitPlan), kepemilikan kelas sbg daftar (bukan tanya-per-baris).';

-- ── Trigger: pertahankan tabel turunan otomatis ────────────────────────
create or replace function public.sync_jurnal_materi_hafalan_surat()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Selalu bersihkan turunan lama dulu -- baik utk UPDATE (materi
  -- diedit/dibatalkan) maupun DELETE. Pendekatan "hapus lalu susun ulang"
  -- dipilih drpd UPDATE selektif krn lebih sederhana & tidak py kondisi
  -- tepi tersembunyi (kokoh > rapi).
  delete from public.jurnal_materi_hafalan_surat where materi_id = coalesce(old.id, new.id);

  if TG_OP = 'DELETE' then
    return old;
  end if;

  if new.jenis = 'klasikal'
     and new.status = 'disampaikan'
     and new.deleted_at is null
     and new.klasikal_hafalan_surat is not null
     and new.tanggal_disampaikan is not null
  then
    insert into public.jurnal_materi_hafalan_surat (materi_id, kelas_id, kelompok_id, tanggal, nama_surat)
    select new.id, new.kelas_id, new.kelompok_id, new.tanggal_disampaikan, s
    from unnest(public.jurnal_split_daftar(new.klasikal_hafalan_surat)) as s;
  end if;

  return new;
end;
$$;

comment on function public.sync_jurnal_materi_hafalan_surat() is
  'SECURITY DEFINER supaya penulisan ke jurnal_materi_hafalan_surat tidak dihalangi RLS-nya sendiri (tabel itu sengaja tanpa kebijakan INSERT utk peran mana pun) -- pola yang sama dgn sinkron_santri_kelas_riwayat. Panggilan SEKALI per baris jurnal_materi yang ditulis, BUKAN dipanggil di dalam kebijakan RLS tabel lain -- beda situasi dari percobaan guru_pemilik_kelas kemarin (migrasi 20260902110000/120000) yang lambat karena dipanggil PER BARIS di dalam RLS.';

drop trigger if exists trg_jurnal_materi_hafalan_surat on public.jurnal_materi;
create trigger trg_jurnal_materi_hafalan_surat
  after insert or update of klasikal_hafalan_surat, jenis, status, tanggal_disampaikan, kelas_id, kelompok_id, deleted_at
  or delete
  on public.jurnal_materi
  for each row
  execute function public.sync_jurnal_materi_hafalan_surat();

-- ── Backfill: jalankan pemicunya utk baris yang sudah ada ──────────────
-- "UPDATE OF kolom" pada trigger di atas menyala kalau kolom itu
-- DISEBUT di klausa SET, terlepas nilainya berubah atau tidak -- jadi
-- ini memicu sinkronisasi tanpa perlu menyalin logikanya kedua kali.
update public.jurnal_materi
set status = status
where jenis = 'klasikal' and deleted_at is null;

-- ── RPC 1: pengulangan per KELAS (Riwayat Pembelajaran) ────────────────
-- SECURITY INVOKER (bawaan) -- sengaja TIDAK didefinisikan ulang.
-- Cukup mengandalkan RLS tabel di atas: kalau kelas itu bukan milik
-- pemanggil, hasilnya nol baris apa adanya, tanpa kode pemeriksaan
-- tambahan -- satu tabel, satu kebijakan, tidak ada komposisi lintas
-- tabel yang bisa meleset diam-diam.
create or replace function public.jurnal_pengulangan_kelas(
  p_kelas_id bigint,
  p_awal date,
  p_akhir date
)
returns table (nama_surat text, jumlah int, terakhir date)
language sql
stable
as $$
  select nama_surat, count(*)::int as jumlah, max(tanggal) as terakhir
  from public.jurnal_materi_hafalan_surat
  where kelas_id = p_kelas_id
    and tanggal between p_awal and p_akhir
  group by nama_surat
  order by jumlah desc, nama_surat;
$$;

revoke all on function public.jurnal_pengulangan_kelas(bigint, date, date) from public;
revoke all on function public.jurnal_pengulangan_kelas(bigint, date, date) from anon;
grant execute on function public.jurnal_pengulangan_kelas(bigint, date, date) to authenticated;

comment on function public.jurnal_pengulangan_kelas(bigint, date, date) is
  'Jumlah "sudah diulang berapa kali" per surat, satu kelas, satu rentang tanggal (bulan/semester/tahun ajaran dihitung di klien -- lib/mingguBulan.ts pola yg sama). Murni informasi, TIDAK ADA ambang tercapai/belum (diminta owner 2026-09-02).';

-- ── RPC 2: pengulangan per SANTRI (Monitoring Pencapaian Materi) ───────
-- SECURITY DEFINER dgn pemeriksaan wewenang EKSPLISIT di baris pertama --
-- BEDA dari RPC 1. Alasannya: fungsi ini menggabungkan TIGA tabel
-- (jurnal_materi_hafalan_surat, santri_kelas_riwayat, absensi, santri).
-- Mengandalkan RLS keempatnya utk saling menyusun dengan benar itu
-- rawan: kalau satu kebijakan (mis. RLS santri) diam-diam lebih sempit
-- dari yang dikira, hasilnya kurang tanpa galat -- salah yang PALING
-- sulit ketahuan (data terlihat masuk akal, cuma kurang). Satu
-- pemeriksaan eksplisit di sini jauh lebih mudah diaudit & dipercaya.
--
-- Dipanggil SEKALI per permintaan (bukan per baris di dalam kebijakan
-- RLS tabel lain), jadi TIDAK kena masalah performa yg sama dgn
-- percobaan guru_pemilik_kelas kemarin -- itu lambat krn dipanggil
-- ribuan kali (satu per baris yg dipindai RLS), ini dipanggil sekali.
create or replace function public.jurnal_pengulangan_santri(
  p_kelas_id bigint,
  p_awal date,
  p_akhir date
)
returns table (
  santri_id bigint,
  nama_santri text,
  nama_surat text,
  jumlah_efektif int,
  jumlah_kelas int
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_boleh boolean;
begin
  select exists (
    select 1
    from auth_profile() p
    where p.is_active
      and (
        p.role = 'admin_ppg'
        or (
          p.role = 'admin_kelompok'
          and p.scope_kelompok_id = (select k.kelompok_id from public.kelas k where k.id = p_kelas_id)
        )
        or (
          p.role = 'guru'
          and p.guru_id = (select k.guru_id from public.kelas k where k.id = p_kelas_id)
        )
      )
  ) into v_boleh;

  if not v_boleh then
    raise exception 'Tidak berwenang melihat data kelas ini.' using errcode = '42501';
  end if;

  return query
  with repetisi as (
    select jhs.nama_surat, jhs.tanggal
    from public.jurnal_materi_hafalan_surat jhs
    where jhs.kelas_id = p_kelas_id
      and jhs.tanggal between p_awal and p_akhir
  ),
  total_kelas as (
    select r.nama_surat, count(*)::int as jumlah_kelas
    from repetisi r
    group by r.nama_surat
  ),
  -- Anggota kelas ini KAPAN SAJA selama periode -- daftar KANDIDAT,
  -- keanggotaan per TANGGAL diperiksa ulang di bawah (santri yang
  -- pindah kelas di tengah periode tidak boleh dapat kredit utk
  -- repetisi SEBELUM dia bergabung -- lihat lib/riwayatKelas.ts utk
  -- alasan periode-sadar yang sama).
  anggota as (
    select distinct skr.santri_id
    from public.santri_kelas_riwayat skr
    where skr.kelas_id = p_kelas_id
      and skr.mulai <= p_akhir
      and (skr.selesai is null or skr.selesai >= p_awal)
  ),
  hadir as (
    select r.nama_surat, skr.santri_id, count(*)::int as jumlah_efektif
    from repetisi r
    join public.santri_kelas_riwayat skr
      on skr.kelas_id = p_kelas_id
     and skr.mulai <= r.tanggal
     and (skr.selesai is null or skr.selesai >= r.tanggal)
    join public.absensi a
      on a.santri_id = skr.santri_id
     and a.tanggal = r.tanggal
     and a.status = 'hadir'
     and a.deleted_at is null
    group by r.nama_surat, skr.santri_id
  )
  select
    sa.id as santri_id,
    coalesce(nullif(btrim(sa.nama_panggilan), ''), sa.nama) as nama_santri,
    tk.nama_surat,
    coalesce(h.jumlah_efektif, 0) as jumlah_efektif,
    tk.jumlah_kelas
  from anggota an
  join public.santri sa on sa.id = an.santri_id
  cross join total_kelas tk
  left join hadir h on h.nama_surat = tk.nama_surat and h.santri_id = an.santri_id
  order by nama_santri, tk.nama_surat;
end;
$$;

revoke all on function public.jurnal_pengulangan_santri(bigint, date, date) from public;
revoke all on function public.jurnal_pengulangan_santri(bigint, date, date) from anon;
grant execute on function public.jurnal_pengulangan_santri(bigint, date, date) to authenticated;

comment on function public.jurnal_pengulangan_santri(bigint, date, date) is
  'Per santri per surat: jumlah_efektif (santri HADIR saat surat itu diulang) dari jumlah_kelas (total pengulangan kelas -- PENYEBUT WAJIB ditampilkan bersama pembilang di layar, jangan pernah angka tunggal: santri rajin di kelas yang jarang mengulang akan terlihat buruk tanpa itu). Tidak ada ambang tercapai/belum, murni informasi (diminta owner 2026-09-02).';
