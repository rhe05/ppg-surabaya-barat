-- ============================================================================
-- Migration 002 — Database Foundation
-- Ruang Ngaji (PPG Surabaya Barat)
--
-- Scope: schema foundation ONLY. No data migration, no seed data, no RLS
-- POLICIES (RLS is ENABLED on every table -- default deny, policies deferred
-- to a dedicated security migration), no application/API code.
--
-- Source of truth reviewed: 13_AppsScript/Setup_Database.gs (24 sheets),
-- Modul_Utilities.gs (RBAC), Modul_Maintain*.gs / Modul_Jurnal.gs /
-- Modul_KopSurat.gs (business rules, enums, constraints, which fields are
-- actually editable via serverUpdate* functions -- used to decide audit
-- field / soft-delete additions below, not guessed).
--
-- Naming: snake_case throughout. PK = id (bigint identity, EXCEPT
-- profiles.id which is uuid = auth.users.id). FK = <entity>_id.
-- Timestamps = created_at/updated_at (timestamptz). Soft delete = deleted_at.
-- Booleans = is_<adjective>.
--
-- ARCHITECTURE DECISIONS applied (finalized across prior review rounds,
-- not re-litigated here):
--   AUTH.  Supabase Auth (auth.users) is the SOLE authentication provider.
--          public.profiles (id uuid PK+FK -> auth.users.id, 1:1) holds
--          app-specific fields. No password/username/email/session columns
--          anywhere in public schema. Every "recorded by / approved by"
--          column across the schema references profiles(id) (uuid).
--   PROV.  auth.users rows are auto-provisioned into profiles via an
--          AFTER INSERT trigger on auth.users (Section 6) -- see rationale
--          comment there for why this is DB-level, not application-level.
--   RLS.   Enabled on every table, zero policies yet (secure-by-default).
--   AUDIT. set_updated_at() trigger reused across every table with an
--          updated_at column. Every table individually reviewed for
--          missing created_at/updated_at -- added ONLY where a
--          serverUpdate*/serverSave* (upsert) function in the live Apps
--          Script app actually mutates that row after creation (verified
--          per-table, not assumed) -- see inline comments at each table.
--   DELETE.Soft delete (deleted_at) added ONLY to operational tables with
--          real accidental-deletion/recovery value (absensi, munaqosah,
--          konseling, kurikulum_akhlaq, jurnal_kbm) plus the 4 tables that
--          already had it (guru, santri, kelas, profiles). Master/lookup/
--          historical-ledger/junction tables deliberately do NOT get it --
--          see per-table reasoning at each CREATE TABLE.
--
-- Table order: profiles is created right after guru (Section 5), before
-- kelas/everything else that references it -- avoids deferred
-- ALTER TABLE ... ADD CONSTRAINT statements entirely.
-- ============================================================================


-- ============================================================================
-- SECTION 0 — Extensions
-- ============================================================================

create extension if not exists "pgcrypto"; -- available for future DB-side crypto helpers; not used for PKs (all bigint identity except profiles.id, which mirrors auth.users.id)


-- ============================================================================
-- SECTION 1 — Enum types
--
-- Reserved for values that are genuinely part of the APPLICATION'S code
-- logic (changing them requires a code deploy anyway). Anything an admin
-- might reasonably want to add/edit from a UI screen later is a lookup
-- TABLE instead (Section 2), not an enum.
--
-- app_role reviewed again this round (explicit task): CONFIRMED to stay an
-- ENUM. Every value is tied 1:1 to a hardcoded branch in
-- validateUserAccess() (Modul_Utilities.gs) -- a new role is USELESS
-- without a matching code branch to grant it any actual permission, so a
-- lookup table would add JOIN overhead on every permission check with zero
-- real flexibility gained (you still can't "add a role from the UI" in any
-- meaningful sense -- the authorization logic for it wouldn't exist).
-- ============================================================================

create type app_role as enum ('admin_ppg', 'admin_desa', 'admin_kelompok', 'guru');
create type kelompok_status as enum ('aktif', 'belum_aktif');
create type kelas_status as enum ('aktif', 'tidak_aktif');
create type gender_type as enum ('L', 'P');
create type absensi_status as enum ('hadir', 'izin', 'sakit', 'alpa');
create type konseling_status as enum ('aktif', 'selesai', 'pending');
create type konseling_kategori as enum ('akademik', 'perilaku', 'emosional', 'sosial', 'kesehatan', 'lainnya');
create type munaqosah_status as enum ('dinilai', 'belum_dinilai');
create type pencapaian_status as enum ('pending', 'in_progress', 'completed');
create type akses_kelas_status as enum ('pending', 'approved', 'rejected');
create type guru_izin_jenis as enum ('izin', 'cuti');
create type santri_jenjang as enum ('AUD', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja');
create type siklus_generus_jenis as enum ('Kerja', 'Kuliah', 'Pindah', 'Mondok', 'Tugas', 'Tidak Aktif');
create type audit_action as enum ('create', 'update', 'delete');

comment on type santri_jenjang is 'Nilai persis sama dgn validasi Modul_MaintainSantri.gs baris ~349 (array literal) -- ubah keduanya bersamaan kalau berubah.';
comment on type app_role is 'CONFIRMED enum (bukan lookup table) -- setiap nilai terikat langsung ke cabang kode di validateUserAccess(), lookup table tidak menambah fleksibilitas nyata.';


-- ============================================================================
-- SECTION 2 — Lookup tables
-- ============================================================================

create table kategori_kbm (
  id          bigint generated always as identity primary key,
  nama        text not null unique,
  urutan      smallint not null,
  created_at  timestamptz not null default now()
);
comment on table kategori_kbm is 'Sumber: KATEGORI_JADWAL_ (Modul_MaintainJadwalKBM.gs). Lookup table (bukan enum) krn punya metadata urutan & masuk akal admin-editable. Tidak ada deleted_at -- lookup table, kalau nilai jadi obsolete cukup berhenti ditawarkan di dropdown, bukan "dihapus".';

create table hari (
  id      smallint primary key, -- 1=Senin .. 7=Minggu, cocok ISO-8601 dow
  nama    text not null unique
);
comment on table hari is 'Sumber: HARI_URUTAN_JKH_ (Modul_MaintainJadwalKBM.gs). Tabel statis, id = ISO day-of-week. Tidak ada deleted_at -- 7 hari dalam seminggu tidak pernah berubah.';

create table jabatan_pengurus (
  id                bigint generated always as identity primary key,
  nama              text not null unique,
  is_multi_holder   boolean not null default false,
  urutan            smallint not null,
  created_at        timestamptz not null default now()
);
comment on table jabatan_pengurus is 'Sumber: JABATAN_PENGURUS_ + MULTI_HOLDER_JABATAN_ (Modul_MaintainPengurus.gs). Tidak ada deleted_at -- lookup table.';

create table kategori_pengumuman (
  id      bigint generated always as identity primary key,
  nama    text not null unique,
  urutan  smallint not null
);
comment on table kategori_pengumuman is 'Sumber: KATEGORI_PENGUMUMAN_ (Modul_MaintainPengumuman.gs). Tidak ada deleted_at -- lookup table.';


-- ============================================================================
-- SECTION 3 — Core organizational hierarchy (ppg -> desa -> kelompok)
-- ============================================================================

create table ppg (
  id            bigint generated always as identity primary key,
  nama          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table ppg is 'Master data (root org, 1 baris). created_at/updated_at ditambah utk konsistensi audit walau source Sheets aslinya tidak punya (Setup_Database.gs: cuma [id,nama]) -- murah ditambah sekarang, tidak ada downside. Tidak ada deleted_at -- record singleton, tidak ada skenario "hapus PPG" yang realistis.';

create table desa (
  id            bigint generated always as identity primary key,
  ppg_id        bigint not null references ppg (id),
  nama          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_desa_ppg_id on desa (ppg_id);
comment on table desa is 'Master data (5 baris tetap). created_at/updated_at ditambah utk konsistensi (source tidak punya). Tidak ada deleted_at -- tidak ada fitur nonaktifkan/hapus desa di aplikasi source, dan desa di-RESTRICT oleh FK kelompok.desa_id kalau ada kelompok anak (hapus desa yg masih dipakai akan otomatis ditolak DB).';

create table kelompok (
  id            bigint generated always as identity primary key,
  desa_id       bigint not null references desa (id),
  nama          text not null,
  status_aktif  kelompok_status not null default 'belum_aktif',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_kelompok_desa_id on kelompok (desa_id);
create index idx_kelompok_status_aktif on kelompok (status_aktif) where status_aktif = 'aktif';
comment on table kelompok is 'Master data. updated_at DITAMBAH (source cuma created_at) -- status_aktif genuinely berubah dari waktu ke waktu (kelompok baru dibuka), layak dilacak kapan. Tidak ada deleted_at -- status_aktif SUDAH menyediakan semantik "sembunyikan tanpa hapus data"; deleted_at terpisah akan jadi 2 flag "apakah kelompok ini terlihat" yang tumpang tindih & ambigu (beda dgn kelas di bawah, yang punya alasan jelas kenapa dua-duanya perlu -- lihat komentar tabel kelas).';


-- ============================================================================
-- SECTION 4 — Guru (sebelum profiles/kelas karena keduanya rujuk ke guru)
-- ============================================================================

create table guru (
  id                bigint generated always as identity primary key,
  kelompok_id       bigint not null references kelompok (id),
  nama              text not null,
  kategori          text, -- free text di source ('Muballigh Tugasan'/'Guru Bantu'/dst) -- TIDAK di-enum-kan, nilainya observasional dari data bukan konstanta kode
  tempat_lahir      text,
  tanggal_lahir     date,
  jenis_kelamin     gender_type,
  mulai_mengajar    date,
  alamat            text,
  nomor_wa          text,
  pendidikan        text,
  rt                text,
  rw                text,
  kelurahan         text,
  kode_pos          text,
  kabupaten_kota    text,
  provinsi          text,
  kecamatan         text,
  lama_mengajar     text, -- computed/display string di source, dipertahankan apa adanya (bukan generated column -- formatnya "1 tahun 10 bulan 17 hari", bukan interval murni)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index idx_guru_kelompok_id on guru (kelompok_id) where deleted_at is null;

comment on column guru.kategori is 'Free text di aplikasi asal (bukan array konstanta di kode) -- TIDAK di-FK-kan sekarang. Jadikan lookup table kalau nanti terbukti nilainya memang tetap/terbatas.';
comment on table guru is 'Master data (Operational Data via Task 3 lens juga cocok -- guru bisa berhenti mengajar). deleted_at: SUDAH ADA -- master data, YES per aturan default.';


-- ============================================================================
-- SECTION 5 — Profiles — SATU-SATUNYA sumber identitas aplikasi, 1:1 dgn
-- auth.users. TIDAK ADA password/username/email/session -- 100% Supabase Auth.
-- ============================================================================

create table profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text, -- lihat Task 4 -- auth.users TIDAK reliable punya nama (signup email+password saja), app source SELALU tampilkan nama user ("Halo, {nama}") -- field ini WAJIB ada, bukan opsional, tapi NULLABLE krn diisi belakangan saat wizard onboarding (pola sama dgn scope_*)
  role                app_role, -- NULLABLE -- lihat chk_profiles_scope: profil baru (auto-provisioned, Section 6) BELUM py role sampai onboarding selesai. NOT NULL akan membuat trigger auto-provisioning gagal insert.
  guru_id             bigint references guru (id) on delete set null,
  scope_ppg_id        bigint references ppg (id),
  scope_desa_id       bigint references desa (id),
  scope_kelompok_id   bigint references kelompok (id),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  constraint chk_profiles_scope check (
    (role is null
      and scope_ppg_id is null and scope_desa_id is null and scope_kelompok_id is null)
    or
    (role = 'admin_ppg'
      and scope_ppg_id is not null and scope_desa_id is null and scope_kelompok_id is null)
    or
    (role = 'admin_desa'
      and scope_desa_id is not null and scope_ppg_id is null and scope_kelompok_id is null)
    or
    (role in ('admin_kelompok', 'guru')
      and scope_kelompok_id is not null and scope_ppg_id is null and scope_desa_id is null)
  )
);
create index idx_profiles_guru_id on profiles (guru_id) where guru_id is not null and deleted_at is null;
create index idx_profiles_scope_kelompok_id on profiles (scope_kelompok_id) where scope_kelompok_id is not null and deleted_at is null;

comment on table profiles is 'Identitas aplikasi 1:1 dgn auth.users (Supabase Auth). TIDAK ADA kolom password/username/email/session -- itu tanggung jawab auth.users, jangan pernah ditambah lagi di sini. Level scope diturunkan dari role (chk_profiles_scope), tidak ada kolom scope_type terpisah. Baris pertama kali dibuat OTOMATIS oleh trigger di Section 6 dgn role=NULL (belum lengkap) -- match pola pendaftaran 2-tahap yang SUDAH ada di app source (serverRegisterGuru: daftar cuma email+password, identitas lengkap diisi lewat wizard onboarding terpisah setelah login pertama).';
comment on column profiles.id is 'BUKAN bigint identity spt tabel lain -- WAJIB sama persis dgn auth.users.id (uuid), diisi trigger (Section 6) saat auth.users baru dibuat, bukan digenerate manual.';
comment on column profiles.deleted_at is 'Task 3: DIPERTAHANKAN (master/identity data -> normally YES). Sengaja BEDA dari is_active: is_active = suspend sementara (reversible, akun tetap valid FK target di mana pun, admin bisa toggle balik), deleted_at = penutupan akun (lebih permanen, harus hilang dari semua UI listing). Dua state yang genuinely berbeda, bukan flag ganda yang tumpang tindih.';


-- ============================================================================
-- SECTION 6 — Auth provisioning trigger (Task 1)
--
-- Setiap baris auth.users HARUS selalu py TEPAT SATU baris profiles yang
-- cocok. Trigger DB-level dipilih drpd pembuatan profil di application
-- layer krn:
--   1. GARANSI, bukan konvensi -- di-enforce di titik SATU-SATUNYA tempat
--      baris auth.users bisa lahir (insert ke auth.users itu sendiri),
--      terlepas dari JALUR mana yang memicunya: signup API, magic link,
--      OAuth, admin invite lewat Supabase Dashboard, atau import massal --
--      semua jalur itu SAMA-SAMA cuma insert ke auth.users, aplikasi tidak
--      perlu (dan tidak bisa) tahu/menangani semuanya secara terpisah.
--   2. BEBAS RACE CONDITION -- tidak ada jendela waktu di mana auth.users
--      ada tapi profiles belum, jadi kode aplikasi yang query profiles
--      SEGERA setelah signup tidak akan pernah dapat baris kosong.
--   3. Pola resmi yang didokumentasikan Supabase sendiri utk kasus persis
--      ini -- bukan solusi custom.
--   4. Idempoten by design (ON CONFLICT DO NOTHING) -- aman dipanggil ulang
--      kalau somehow trigger ke-fire dobel utk id yang sama.
-- ============================================================================

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, is_active, created_at, updated_at)
  values (new.id, null, true, now(), now())
  on conflict (id) do nothing;

  return new;
end;
$$;
comment on function handle_new_auth_user() is 'Task 1 -- provisioning otomatis profiles dari auth.users. security definer + search_path terkunci ke public (mencegah search_path hijacking, celah klasik SECURITY DEFINER di Postgres) supaya trigger ini SELALU bisa insert ke public.profiles apa pun role Postgres yang memicu insert auth.users (biasanya supabase_auth_admin, yang defaultnya TIDAK py grant ke tabel public). role=NULL (bukan role tertentu spt "guru") -- "role paling aman" yang sesungguhnya adalah TIDAK PUNYA PERMISSION SAMA SEKALI sampai onboarding menetapkan role+scope yang benar, bukan role bernama tapi scope kosong (yang bahkan tidak valid menurut chk_profiles_scope kalau role diisi "guru" tanpa scope_kelompok_id).';

create trigger trg_auth_user_provision_profile
after insert on auth.users
for each row execute function handle_new_auth_user();


-- ============================================================================
-- SECTION 7 — Kelas (pengganti jadwal_kbm)
--
-- KEPUTUSAN TERKONFIRMASI (sesi sebelumnya): model lama "sesi per tanggal"
-- TIDAK PERNAH terisi di data production nyata -- satu baris jadwal_kbm
-- SELALU dipakai sbg definisi kelas statis. Kolom tanggal/hari/legacy TIDAK
-- dibawa.
-- ============================================================================

create table kelas (
  id              bigint generated always as identity primary key,
  kelompok_id     bigint not null references kelompok (id),
  nama            text not null,
  kategori_kbm_id bigint not null references kategori_kbm (id),
  guru_id         bigint references guru (id) on delete set null, -- nullable: kelas boleh belum punya guru ditentukan
  jam_mulai       time not null,
  jam_selesai     time not null,
  ruangan         text not null,
  keterangan      text,
  santri_count    integer not null default 0, -- cache tampilan -- SUMBER KEBENARAN tetap COUNT(santri WHERE kelas_id=...); belum ada trigger sinkronisasi (di luar cakupan migrasi ini)
  status          kelas_status not null default 'aktif',
  created_by      uuid references profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint chk_kelas_jam check (jam_selesai > jam_mulai)
);
create index idx_kelas_kelompok_id on kelas (kelompok_id) where deleted_at is null;
create index idx_kelas_kelompok_status on kelas (kelompok_id, status) where deleted_at is null;
create index idx_kelas_guru_id on kelas (guru_id) where deleted_at is null;
create unique index uq_kelas_kelompok_nama on kelas (kelompok_id, lower(nama)) where deleted_at is null;

comment on table kelas is 'Pengganti jadwal_kbm (Apps Script). Definisi kelas statis, BUKAN sesi per tanggal. deleted_at + status dua-duanya SENGAJA ada (beda dari kelompok, lihat komentar di sana): status = kelas sedang berjalan/tidak (operasional, guru/admin toggle musiman), deleted_at = kelas ini dihapus permanen dari semua listing (mis. admin bikin kelas duplikat by mistake) tapi historinya (jurnal/absensi lama) tetap valid via FK.';
comment on column kelas.santri_count is 'Kolom cache/denormalisasi. Belum ada trigger sinkronisasi di migrasi ini.';

create table jadwal_kategori_hari (
  id              bigint generated always as identity primary key,
  kelompok_id     bigint not null references kelompok (id),
  kategori_kbm_id bigint not null references kategori_kbm (id),
  diubah_oleh     uuid references profiles (id),
  created_at      timestamptz not null default now(), -- DITAMBAH -- konsistensi audit-field (Task 2), sebelumnya cuma py 1 timestamp
  updated_at      timestamptz not null default now(), -- DIGANTI NAMA dari diubah_pada -- konsisten dgn standar penamaan created_at/updated_at yang dipakai di seluruh skema, bukan Bahasa Indonesia campuran di kolom ini saja

  unique (kelompok_id, kategori_kbm_id)
);
comment on table jadwal_kategori_hari is 'Header "hari aktif per kategori". Daftar harinya sendiri ada di jadwal_kategori_hari_aktif (normalisasi 1NF vs kolom CSV hari_aktif di source).';

create table jadwal_kategori_hari_aktif (
  jadwal_kategori_hari_id  bigint not null references jadwal_kategori_hari (id) on delete cascade,
  hari_id                  smallint not null references hari (id),

  primary key (jadwal_kategori_hari_id, hari_id)
);
comment on table jadwal_kategori_hari_aktif is 'Junction table pengganti jadwal_kategori_hari.hari_aktif (CSV string di source). Tidak ada audit field/deleted_at -- baris di sini cuma penanda keanggotaan (ada/tidak ada), tidak pernah di-UPDATE, dan siklus hidupnya sepenuhnya ikut parent (INSERT saat dicentang, DELETE saat dilepas) -- audit timestamp di sini tidak menambah nilai query yang nyata.';


-- ============================================================================
-- SECTION 8 — Santri
-- ============================================================================

create table santri (
  id                  bigint generated always as identity primary key,
  kelompok_id         bigint not null references kelompok (id),
  kelas_id            bigint references kelas (id) on delete set null, -- pengganti kelas_ngaji free-text
  nama                text not null,
  nama_panggilan      text,
  nis                 text,
  gender              gender_type not null,
  tanggal_lahir       date,
  tempat_lahir        text,
  jenjang_saat_ini    santri_jenjang not null,
  pendidikan          text,
  kelas_sekolah       text, -- kelas di sekolah FORMAL -- BEDA KONSEP dari kelas_id (kelas ngaji)
  alamat              text,
  nama_ayah           text,
  nama_ibu            text,
  rt                  text,
  rw                  text,
  kelurahan           text,
  kode_pos            text,
  kabupaten_kota      text,
  provinsi            text,
  kecamatan           text,
  nomor_wa            text,
  nomor_wa_ayah       text,
  nomor_wa_ibu        text,
  status_nikah        text, -- free text di source, tidak di-enum-kan
  mulai_ngaji         date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index idx_santri_kelompok_id on santri (kelompok_id) where deleted_at is null;
create index idx_santri_kelas_id on santri (kelas_id) where deleted_at is null;

comment on column santri.kelas_sekolah is 'Kelas SEKOLAH FORMAL (mis. "5 SD") -- jangan tertukar dgn santri.kelas_id (kelas NGAJI TPQ).';

create table riwayat_jenjang (
  id            bigint generated always as identity primary key,
  santri_id     bigint not null references santri (id),
  jenjang_lama  santri_jenjang,
  jenjang_baru  santri_jenjang not null,
  tanggal       date not null,
  catatan       text,
  dicatat_oleh  uuid references profiles (id),
  created_at    timestamptz not null default now()
);
create index idx_riwayat_jenjang_santri_id on riwayat_jenjang (santri_id);
comment on table riwayat_jenjang is 'Historical Snapshot Table (Task 3) -- ledger append-only, tidak ada fungsi update di source. Tidak ada updated_at (tidak ada jalur mutasi) & tidak ada deleted_at (kalau ada baris salah, koreksinya nambah baris baru dgn catatan, bukan hapus -- pola ledger akuntansi, bukan pola CRUD biasa).';

create table siklus_generus (
  id            bigint generated always as identity primary key,
  kelompok_id   bigint not null references kelompok (id),
  santri_id     bigint not null references santri (id),
  nama          text not null, -- snapshot nama santri pada saat dicatat
  jenis_siklus  siklus_generus_jenis not null,
  tanggal       date not null,
  lokasi        text,
  instansi      text,
  keterangan    text,
  dicatat_oleh  uuid references profiles (id),
  created_at    timestamptz not null default now()
);
create index idx_siklus_generus_santri_id on siklus_generus (santri_id);
create index idx_siklus_generus_kelompok_id on siklus_generus (kelompok_id);

comment on column siklus_generus.nama is 'Snapshot nama santri PADA SAAT dicatat, BUKAN sumber kebenaran nama (itu di santri.nama).';
comment on table siklus_generus is 'Historical Snapshot Table (Task 3) -- sama alasan dgn riwayat_jenjang: append-only ledger, tidak ada updated_at/deleted_at.';

create table pengurus_kelp (
  id              bigint generated always as identity primary key,
  kelompok_id     bigint not null references kelompok (id),
  jabatan_id      bigint not null references jabatan_pengurus (id),
  nama            text not null, -- BEBAS diketik (bukan FK ke guru/santri)
  mulai_dapukan   date,
  keterangan      text,
  dicatat_oleh    uuid references profiles (id),
  created_at      timestamptz not null default now(),
  diubah_oleh     uuid references profiles (id),
  updated_at      timestamptz not null default now()
);
create index idx_pengurus_kelp_kelompok_id on pengurus_kelp (kelompok_id);

comment on table pengurus_kelp is 'UNIQUE (kelompok_id, jabatan_id) SENGAJA TIDAK ditegakkan di DB -- jabatan multi-holder boleh >1 baris. Task 3: tidak ada deleted_at -- mutasi utama adalah UPDATE (upsert ganti pejabat), bukan DELETE; peristiwa hapus jarang & administratif, tidak ada nilai bisnis nyata dari "undo hapus jabatan".';


-- ============================================================================
-- SECTION 9 — Absensi
-- ============================================================================

create table absensi (
  id            bigint generated always as identity primary key,
  santri_id     bigint not null references santri (id),
  kelompok_id   bigint not null references kelompok (id), -- DITAMBAH vs source -- denormalisasi SADAR, dijaga konsisten oleh trigger (Section berikutnya)
  tanggal       date not null,
  status        absensi_status not null,
  dicatat_oleh  uuid references profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz -- DITAMBAH (Task 3, Operational Data dievaluasi individual) -- catatan kehadiran py nilai akademik/historis, guru bisa TIDAK SENGAJA menimpa/menghapus banyak baris sekaligus (rewrite-per-kelas-per-tanggal, lihat pola simpan absen live app) -- deleted_at memberi jalur pemulihan tanpa perlu restore dari backup
);
create unique index uq_absensi_santri_tanggal on absensi (santri_id, tanggal) where deleted_at is null; -- DIUBAH dari table CONSTRAINT ke PARTIAL UNIQUE INDEX -- constraint UNIQUE biasa tidak bisa py WHERE, dan tanpa WHERE, baris yang di-soft-delete akan PERMANEN memblokir pembuatan ulang santri+tanggal yang sama (gagal total tujuan soft-delete)
create index idx_absensi_kelompok_tanggal on absensi (kelompok_id, tanggal) where deleted_at is null;
create index idx_absensi_santri_tanggal on absensi (santri_id, tanggal) where deleted_at is null;

comment on column absensi.kelompok_id is 'Denormalisasi SADAR vs skema Sheets/Firestore asal -- dijaga konsisten dgn santri.kelompok_id oleh trigger trg_absensi_sync_kelompok_id, BUKAN cuma aturan aplikasi.';
comment on column absensi.deleted_at is 'Task 3 -- lihat catatan inline di CREATE TABLE. WAJIB pakai partial unique index (uq_absensi_santri_tanggal), BUKAN table constraint, supaya baris yang dihapus tidak memblokir pembuatan ulang.';


-- ============================================================================
-- SECTION 10 — Munaqosah
-- ============================================================================

create table periode_munaqosah (
  id                      bigint generated always as identity primary key,
  semester                text not null,
  status                  text not null default 'buka', -- nilai persis blm terkonfirmasi jadi enum tetap di source -- text dgn default, TINJAU ULANG saat migrasi data nyata
  estimasi_buka_kembali   date,
  kontak                  text,
  diubah_oleh             uuid references profiles (id),
  created_at              timestamptz not null default now(), -- DITAMBAH -- periode dibuat sbg peristiwa diskrit yang layak dilacak kapan, sebelumnya cuma updated_at
  updated_at              timestamptz not null default now()
);

create table munaqosah (
  id            bigint generated always as identity primary key,
  santri_id     bigint not null references santri (id),
  periode_id    bigint not null references periode_munaqosah (id),
  tanggal       date,
  kelas         text, -- SNAPSHOT dari santri.jenjang_saat_ini PADA SAAT dinilai -- BUKAN FK
  wilayah       text, -- SNAPSHOT dari desa.nama PADA SAAT dinilai -- BUKAN FK
  nilai         numeric(5,2),
  status        munaqosah_status not null default 'belum_dinilai',
  catatan       text,
  dinilai_oleh  uuid references profiles (id),
  dinilai_pada  timestamptz, -- TIDAK disatukan dgn updated_at -- ini timestamp bisnis spesifik ("kapan resmi dinilai"), beda makna dari "kapan baris terakhir diubah" (baris bisa diedit tanpa mengubah status penilaian)
  created_at    timestamptz not null default now(), -- DITAMBAH (Task 2, gap nyata -- source tidak py ini sama sekali walau serverUpdateMunaqosah() ada, artinya baris BISA berubah tapi sebelumnya tidak terlacak kapan dibuat maupun diubah)
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz, -- DITAMBAH (Task 3) -- nilai ujian resmi, kesalahan hapus (sengaja/tidak) harus bisa dipulihkan

  constraint chk_munaqosah_nilai check (nilai is null or (nilai >= 0 and nilai <= 100))
);
create index idx_munaqosah_santri_id on munaqosah (santri_id) where deleted_at is null;
create index idx_munaqosah_periode_id on munaqosah (periode_id, status) where deleted_at is null;

comment on column munaqosah.kelas is 'SNAPSHOT, bukan FK. JANGAN "diperbaiki" jadi kelas_id, itu akan merusak akurasi historis nilai ujian.';
comment on column munaqosah.wilayah is 'SNAPSHOT nama desa, bukan FK.';


-- ============================================================================
-- SECTION 11 — Konseling
-- ============================================================================

create table konseling (
  id                      bigint generated always as identity primary key,
  santri_id               bigint not null references santri (id),
  kelompok_id             bigint not null references kelompok (id),
  tanggal                 date not null,
  kategori                konseling_kategori not null,
  masalah                 text not null,
  status                  konseling_status not null default 'pending',
  aksi                    text,
  pencatat_id             uuid references profiles (id),
  catatan_tindak_lanjut   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz -- DITAMBAH (Task 3) -- data SENSITIF (masalah perilaku/personal santri); ditimbang vs risiko "soft-delete menggagalkan permintaan hapus yang memang disengaja" -- diputuskan TETAP ditambah krn nilai perlindungan-dari-hapus-tidak-sengaja lebih besar utk skala org internal ini (bukan aplikasi consumer dgn kewajiban right-to-be-forgotten eksplisit); kalau ada kebutuhan hapus permanen sungguhan, itu operasi TERPISAH (hard DELETE manual oleh admin_ppg), bukan lewat jalur normal aplikasi
);
create index idx_konseling_santri_id on konseling (santri_id) where deleted_at is null;
create index idx_konseling_kelompok_status on konseling (kelompok_id, status) where deleted_at is null;


-- ============================================================================
-- SECTION 12 — Kurikulum (Akhlaq, Prota/Promes/Probul, Pencapaian)
-- ============================================================================

create table kurikulum_akhlaq (
  id                bigint generated always as identity primary key,
  santri_id         bigint not null references santri (id),
  semester          text not null,
  nilai_akhlaq      numeric(5,2),
  catatan_capaian   text,
  dicatat_oleh      uuid references profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(), -- DITAMBAH (Task 2) -- nilai skor, sejenis dgn munaqosah yang terkonfirmasi editable; CATATAN: tidak ada modul CRUD aktif utk tabel ini di source saat ini (cuma dibaca di Modul_Dashboard.gs utk Santri Teladan) -- ditambah demi konsistensi kolom skor lainnya, bukan krn ada bukti langsung fungsi edit yang jalan
  deleted_at        timestamptz, -- DITAMBAH (Task 3) -- data nilai akademik, sama kelasnya dgn munaqosah

  constraint chk_kurikulum_akhlaq_nilai check (nilai_akhlaq is null or (nilai_akhlaq >= 0 and nilai_akhlaq <= 100))
);
create index idx_kurikulum_akhlaq_santri_id on kurikulum_akhlaq (santri_id) where deleted_at is null;

create table kurikulum_prota (
  id              bigint generated always as identity primary key,
  kelompok_id     bigint not null references kelompok (id),
  tahun           smallint not null,
  kategori_kbm_id bigint not null references kategori_kbm (id),
  kelas_id        bigint references kelas (id), -- nullable: kosong = berlaku semua kelas
  urutan          smallint not null default 0,
  target          text,
  deskripsi       text,
  created_by      uuid references profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_kurikulum_prota_kelompok_tahun on kurikulum_prota (kelompok_id, tahun);
comment on table kurikulum_prota is 'Task 3: tidak ada deleted_at -- dokumen rencana kurikulum yang hidup/sering direvisi (bukan record historis final), hapus-permanen sesuai alur kerja nyata; anak-anaknya (promes/probul) sudah ON DELETE CASCADE, mencampur itu dgn soft-delete parent akan bikin semantik ambigu.';

create table kurikulum_promes (
  id            bigint generated always as identity primary key,
  prota_id      bigint not null references kurikulum_prota (id) on delete cascade,
  semester      smallint not null,
  target        text,
  deskripsi     text,
  created_by    uuid references profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint chk_kurikulum_promes_semester check (semester in (1, 2))
);
create index idx_kurikulum_promes_prota_id on kurikulum_promes (prota_id);

create table kurikulum_probul (
  id              bigint generated always as identity primary key,
  promes_id       bigint not null references kurikulum_promes (id) on delete cascade,
  kelompok_id     bigint not null references kelompok (id),
  kategori_kbm_id bigint not null references kategori_kbm (id),
  tahun           smallint not null,
  bulan           smallint not null,
  jilid           text,
  target          text,
  deskripsi       text,
  created_by      uuid references profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chk_kurikulum_probul_bulan check (bulan between 1 and 12)
);
create index idx_kurikulum_probul_promes_id on kurikulum_probul (promes_id);
create index idx_kurikulum_probul_kelompok_tahun_bulan on kurikulum_probul (kelompok_id, tahun, bulan);

create table kurikulum_probul_minggu (
  id            bigint generated always as identity primary key,
  probul_id     bigint not null references kurikulum_probul (id) on delete cascade,
  minggu_ke     smallint not null,
  target        text,
  created_at    timestamptz not null default now(), -- DITAMBAH (Task 2) -- confirmed editable independen per-minggu lewat serverUpdateProbul() (minggu1..4 params terpisah), beda dari kop_surat_baris (lihat catatan di sana) yang selalu diedit bersamaan sbg 1 unit konfigurasi
  updated_at    timestamptz not null default now(),

  constraint chk_kurikulum_probul_minggu_ke check (minggu_ke between 1 and 4),
  constraint uq_kurikulum_probul_minggu unique (probul_id, minggu_ke)
);
comment on table kurikulum_probul_minggu is 'Pengganti kolom minggu1..minggu4 di kurikulum_probul (source) -- flattening itu akibat keterbatasan Firestore, TIDAK relevan lagi di Postgres.';

create table kurikulum_pencapaian_santri (
  id              bigint generated always as identity primary key,
  kelompok_id     bigint not null references kelompok (id),
  santri_id       bigint not null references santri (id),
  probul_id       bigint not null references kurikulum_probul (id) on delete cascade,
  status          pencapaian_status not null default 'pending',
  catatan_guru    text,
  created_at      timestamptz not null default now(), -- DITAMBAH (Task 2) -- sebelumnya cuma updated_at, tidak ada jejak kapan baris pencapaian pertama kali dibuat vs terakhir statusnya berubah
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles (id),

  constraint uq_kurikulum_pencapaian unique (santri_id, probul_id)
);
create index idx_kurikulum_pencapaian_probul_id on kurikulum_pencapaian_santri (probul_id);


-- ============================================================================
-- SECTION 13 — Kalender & Pusat Unduhan
-- ============================================================================

create table calendar_events (
  id            bigint generated always as identity primary key,
  kelompok_id   bigint not null references kelompok (id),
  tanggal       date not null,
  judul_event   text not null,
  deskripsi     text,
  tipe_event    text, -- nilainya tidak terkonfirmasi jadi enum tetap di source -- text bebas dipertahankan
  lokasi        text,
  pukul_mulai   time,
  pukul_selesai time,
  dibuat_oleh   uuid references profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_calendar_events_kelompok_tanggal on calendar_events (kelompok_id, tanggal);
comment on table calendar_events is 'Task 3: tidak ada deleted_at -- konten rutin/kalender, hapus event lama adalah tindakan normal, bukan skenario yang butuh pemulihan.';

create table files (
  id                bigint generated always as identity primary key,
  kategori          text,
  nama_file         text not null,
  deskripsi         text,
  url_file          text not null, -- akan jadi Supabase Storage path saat migrasi data
  ukuran_bytes      bigint,
  dibuat_oleh       uuid references profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  download_count    integer not null default 0
);
comment on table files is 'Task 3: tidak ada deleted_at -- siklus hidup baris ini terikat ke objek Storage sesungguhnya (app-layer concern utk bersihkan file fisik); soft-delete di DB saja tidak menyelesaikan masalah file yatim di Storage, jadi tidak menambah nilai nyata di sini.';


-- ============================================================================
-- SECTION 14 — Pengumuman
-- ============================================================================

create table pengumuman (
  id                      bigint generated always as identity primary key,
  kelompok_id             bigint not null references kelompok (id),
  kategori_pengumuman_id  bigint references kategori_pengumuman (id), -- nullable: source terima kategori kosong ("Lainnya")
  judul                   text not null,
  isi                     text not null,
  tanggal                 date not null,
  dibuat_oleh             uuid references profiles (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now() -- DITAMBAH (Task 2) -- confirmed editable lewat serverUpdatePengumuman()
);
create index idx_pengumuman_kelompok_tanggal on pengumuman (kelompok_id, tanggal desc);
comment on table pengumuman is 'Task 3: tidak ada deleted_at -- konten rutin, hapus pengumuman lama adalah tindakan normal.';


-- ============================================================================
-- SECTION 15 — Jurnal KBM (Firestore-only di source)
-- ============================================================================

create table jurnal_kbm (
  id              bigint generated always as identity primary key,
  kelompok_id     bigint not null references kelompok (id),
  kelas_id        bigint not null references kelas (id),
  tanggal         date not null,
  guru_id         bigint references guru (id) on delete set null,
  materi          text not null,
  catatan         text,
  dicatat_oleh    text, -- source simpan NAMA (ctx.user.nama), bukan user id -- dipertahankan apa adanya (snapshot)
  created_at      timestamptz not null default now(), -- DITAMBAH (Task 2) -- pola upsert-by-tanggal (spt absensi) berarti baris bisa ditimpa; created_at melacak kapan PERTAMA ditulis, beda dari updated_at (kapan TERAKHIR ditimpa)
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz -- DITAMBAH (Task 3) -- serverDeleteJurnalAdmin() ada di source; catatan mengajar py nilai historis/pembuktian KBM berjalan, sama kelasnya dgn absensi
);
create unique index uq_jurnal_kbm_kelas_tanggal on jurnal_kbm (kelas_id, tanggal) where deleted_at is null; -- DIUBAH dari table CONSTRAINT ke PARTIAL UNIQUE INDEX -- alasan sama persis dgn uq_absensi_santri_tanggal
create index idx_jurnal_kbm_kelompok_tanggal on jurnal_kbm (kelompok_id, tanggal) where deleted_at is null;
create index idx_jurnal_kbm_guru_id on jurnal_kbm (guru_id) where deleted_at is null;

comment on column jurnal_kbm.dicatat_oleh is 'Source (Modul_Jurnal.gs) simpan STRING NAMA guru, bukan user_id -- dipertahankan sbg text di migrasi ini utk kompatibilitas data lama.';


-- ============================================================================
-- SECTION 16 — Kop Surat (Firestore-only, 1 dokumen per kelompok+kategori)
-- ============================================================================

create table kop_surat (
  id            bigint generated always as identity primary key,
  kelompok_id   bigint not null references kelompok (id),
  kategori_slug text not null,
  logo_url      text, -- source simpan logo_base64 langsung (workaround limit Firestore) -- di Supabase HARUS jadi Storage URL
  pakai_garis   boolean not null default false,
  garis_atas    boolean not null default false,
  diubah_oleh   uuid references profiles (id),
  created_at    timestamptz not null default now(), -- DITAMBAH (Task 2) -- config dibuat sekali lalu diedit (serverSaveKopSurat = upsert), created_at melacak kapan letterhead pertama disiapkan
  updated_at    timestamptz not null default now(),

  constraint uq_kop_surat_kelompok_kategori unique (kelompok_id, kategori_slug)
);
comment on table kop_surat is 'Task 3: tidak ada deleted_at -- config singleton per kelompok+kategori, versi lama tidak py nilai historis begitu diganti.';

create table kop_surat_baris (
  id            bigint generated always as identity primary key,
  kop_surat_id  bigint not null references kop_surat (id) on delete cascade,
  baris_ke      smallint not null,
  teks          text not null default '',
  font          text not null default 'Roboto',
  is_bold       boolean not null default false,
  ukuran        smallint not null default 10,
  warna         text not null default '#0F172A',
  align         text not null default 'left',

  constraint chk_kop_surat_baris_ke check (baris_ke between 1 and 3),
  constraint chk_kop_surat_baris_align check (align in ('left', 'center', 'right')),
  constraint uq_kop_surat_baris unique (kop_surat_id, baris_ke)
);
comment on table kop_surat_baris is 'Pengganti kolom b1_teks/../b3_align (18 kolom flat di source). Tidak ada created_at/updated_at (Task 2) -- BEDA dari kurikulum_probul_minggu: 3 baris di sini SELALU diedit BERSAMAAN sbg 1 aksi konfigurasi letterhead (bukan diisi bertahap dari waktu ke waktu spt target mingguan kurikulum), jadi kop_surat.updated_at (parent) sudah cukup mewakili "kapan letterhead terakhir diubah" -- timestamp per-baris tidak menambah nilai query nyata.';


-- ============================================================================
-- SECTION 17 — Akses kelas & izin guru
-- ============================================================================

create table akses_kelas_request (
  id                  bigint generated always as identity primary key,
  kelompok_id         bigint not null references kelompok (id),
  kelas_id            bigint not null references kelas (id),
  tanggal             date not null,
  requester_user_id   uuid references profiles (id),
  requester_guru_id   bigint not null references guru (id),
  owner_guru_id       bigint not null references guru (id),
  status              akses_kelas_status not null default 'pending',
  keterangan          text,
  created_at          timestamptz not null default now(),
  diputuskan_pada     timestamptz, -- timestamp bisnis spesifik (kapan disetujui/ditolak) -- TIDAK disatukan dgn updated_at generik, sama alasan dgn munaqosah.dinilai_pada

  constraint chk_akses_kelas_requester_not_owner check (requester_guru_id <> owner_guru_id)
);
create index idx_akses_kelas_request_owner on akses_kelas_request (owner_guru_id, status);
create index idx_akses_kelas_request_lookup on akses_kelas_request (kelompok_id, kelas_id, tanggal, status);

comment on table akses_kelas_request is 'Kolom requester_nama DIHAPUS vs source -- redundan dgn requester_guru_id, cukup JOIN ke guru.nama. Task 2: tidak ada updated_at generik -- created_at + diputuskan_pada SUDAH mewakili 2 peristiwa bermakna dlm siklus hidup record ini (diajukan, diputuskan), tidak ada mutasi lain. Task 3: tidak ada deleted_at -- record workflow yang selesai tidak py nilai guna ulang di luar audit_log.';

create table guru_izin (
  id                bigint generated always as identity primary key,
  kelompok_id       bigint not null references kelompok (id),
  guru_id           bigint not null references guru (id),
  jenis             guru_izin_jenis not null,
  tanggal_mulai     date not null,
  tanggal_selesai   date not null,
  alasan_kategori   text,
  alasan_detail     text,
  created_at        timestamptz not null default now(),

  constraint chk_guru_izin_tanggal check (tanggal_selesai >= tanggal_mulai)
);
create index idx_guru_izin_guru_tanggal on guru_izin (guru_id, tanggal_mulai, tanggal_selesai);
comment on table guru_izin is 'Task 2/3: tidak ada updated_at/deleted_at -- source ("guru_izin TIDAK ADA approval -- self-declared") tidak py fungsi edit sama sekali, murni append-only sekali catat.';


-- ============================================================================
-- SECTION 18 — Quote harian & audit log
-- ============================================================================

create table quote_harian (
  id            bigint generated always as identity primary key,
  teks          text not null,
  dibuat_oleh   uuid references profiles (id),
  created_at    timestamptz not null default now()
);
comment on table quote_harian is 'Task 2/3: tidak ada updated_at/deleted_at -- Modul_QuoteHarian.gs cuma py serverAddQuote/serverDeleteQuote, TIDAK ADA fungsi update -- dikonfirmasi dari kode, bukan diasumsikan.';

create table audit_log (
  id                bigint generated always as identity primary key,
  table_name        text not null, -- generik lintas-tabel by design -- TIDAK di-FK-kan
  record_id         text not null, -- text, bukan bigint: harus tetap terbaca walau baris aslinya sudah di-hard-delete
  action            audit_action not null,
  user_id           uuid references profiles (id),
  detail_perubahan  jsonb, -- UPGRADE vs source (text bebas) -- jsonb query-able
  created_at        timestamptz not null default now()
);
create index idx_audit_log_table_record on audit_log (table_name, record_id);
create index idx_audit_log_user_id on audit_log (user_id);

comment on column audit_log.detail_perubahan is 'jsonb (bukan text spt source) -- native Postgres, query-able.';
comment on table audit_log is 'Task 2/3: tidak ada updated_at/deleted_at by design -- log audit yang bisa "diubah" atau "dihapus" (bahkan soft) kehilangan nilai sbg bukti tamper-evident.';


-- ============================================================================
-- SECTION 19 — Trigger: set_updated_at() (reusable)
--
-- SATU fungsi dipakai ulang di SEMUA tabel yang py kolom updated_at.
-- ============================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
comment on function set_updated_at() is 'Reusable BEFORE UPDATE trigger. Dipakai ulang di semua tabel bawah, JANGAN duplikasi jadi fungsi per-tabel.';

create trigger trg_ppg_updated_at                          before update on ppg                          for each row execute function set_updated_at();
create trigger trg_desa_updated_at                         before update on desa                         for each row execute function set_updated_at();
create trigger trg_kelompok_updated_at                     before update on kelompok                     for each row execute function set_updated_at();
create trigger trg_guru_updated_at                         before update on guru                         for each row execute function set_updated_at();
create trigger trg_profiles_updated_at                     before update on profiles                     for each row execute function set_updated_at();
create trigger trg_kelas_updated_at                        before update on kelas                        for each row execute function set_updated_at();
create trigger trg_jadwal_kategori_hari_updated_at         before update on jadwal_kategori_hari         for each row execute function set_updated_at();
create trigger trg_santri_updated_at                       before update on santri                       for each row execute function set_updated_at();
create trigger trg_pengurus_kelp_updated_at                before update on pengurus_kelp                for each row execute function set_updated_at();
create trigger trg_absensi_updated_at                      before update on absensi                      for each row execute function set_updated_at();
create trigger trg_periode_munaqosah_updated_at            before update on periode_munaqosah            for each row execute function set_updated_at();
create trigger trg_munaqosah_updated_at                    before update on munaqosah                    for each row execute function set_updated_at();
create trigger trg_konseling_updated_at                    before update on konseling                    for each row execute function set_updated_at();
create trigger trg_kurikulum_akhlaq_updated_at             before update on kurikulum_akhlaq             for each row execute function set_updated_at();
create trigger trg_kurikulum_prota_updated_at              before update on kurikulum_prota              for each row execute function set_updated_at();
create trigger trg_kurikulum_promes_updated_at             before update on kurikulum_promes             for each row execute function set_updated_at();
create trigger trg_kurikulum_probul_updated_at             before update on kurikulum_probul             for each row execute function set_updated_at();
create trigger trg_kurikulum_probul_minggu_updated_at      before update on kurikulum_probul_minggu      for each row execute function set_updated_at();
create trigger trg_kurikulum_pencapaian_santri_updated_at  before update on kurikulum_pencapaian_santri  for each row execute function set_updated_at();
create trigger trg_calendar_events_updated_at              before update on calendar_events              for each row execute function set_updated_at();
create trigger trg_files_updated_at                        before update on files                        for each row execute function set_updated_at();
create trigger trg_pengumuman_updated_at                   before update on pengumuman                   for each row execute function set_updated_at();
create trigger trg_jurnal_kbm_updated_at                   before update on jurnal_kbm                   for each row execute function set_updated_at();
create trigger trg_kop_surat_updated_at                    before update on kop_surat                    for each row execute function set_updated_at();


-- ============================================================================
-- SECTION 20 — Trigger: sinkronisasi absensi.kelompok_id
--
-- Memaksa absensi.kelompok_id SELALU sama dgn santri.kelompok_id -- nilai
-- dari klien DIABAIKAN dan DITIMPA, bukan cuma divalidasi.
-- ============================================================================

create or replace function sync_absensi_kelompok_id()
returns trigger
language plpgsql
as $$
declare
  v_kelompok_id bigint;
begin
  select kelompok_id into v_kelompok_id from santri where id = new.santri_id;

  if v_kelompok_id is null then
    raise exception 'absensi.santri_id % tidak ditemukan di tabel santri', new.santri_id;
  end if;

  new.kelompok_id = v_kelompok_id;
  return new;
end;
$$;
comment on function sync_absensi_kelompok_id() is 'absensi.kelompok_id TIDAK PERNAH dipercaya dari input klien, selalu ditimpa dari santri.kelompok_id di sini.';

create trigger trg_absensi_sync_kelompok_id
before insert or update of santri_id on absensi
for each row execute function sync_absensi_kelompok_id();


-- ============================================================================
-- SECTION 21 — Row Level Security
--
-- DIAKTIFKAN di SEMUA tabel, TANPA policy sama sekali di migrasi ini --
-- default deny yang aman (peran service_role tetap bypass RLS spt biasa).
-- Kebijakan sungguhan menyusul di migrasi keamanan terpisah.
--
-- Task 6 -- fungsi helper yang KEMUNGKINAN BESAR dibutuhkan migrasi RLS
-- berikutnya (BELUM dibuat di sini -- migrasi ini cuma py placeholder
-- ENABLE, sesuai instruksi "jangan implementasikan policy dulu"; fungsi
-- helper HANYA bermakna kalau dipakai policy, jadi menulisnya sekarang
-- berarti kode mati sampai policy-nya ada):
--   - auth_profile()        -- STABLE, SELECT * FROM profiles WHERE id = auth.uid(), dipakai sbg dasar semua fungsi lain di bawah (1 lookup, bukan diulang di tiap fungsi)
--   - auth_role()           -- STABLE, ambil role dari auth_profile()
--   - auth_kelompok_id()    -- STABLE, ambil scope_kelompok_id (utk role admin_kelompok/guru)
--   - auth_desa_id()        -- STABLE, ambil scope_desa_id (utk role admin_desa)
--   - is_admin_ppg()        -- STABLE, shortcut auth_role() = 'admin_ppg' -- dipakai di HAMPIR SETIAP policy sbg klausa "OR is_admin_ppg()" (admin_ppg akses semua)
--   - can_access_kelompok(target_kelompok_id bigint) -- STABLE, gabungkan is_admin_ppg() OR (scope match via desa/kelompok) -- 1 fungsi dipanggil di setiap policy USING/WITH CHECK drpd menulis ulang logika percabangan scope yang sama di puluhan tempat
-- Semua fungsi di atas SEBAIKNYA `STABLE` (bukan VOLATILE) supaya planner
-- Postgres bisa cache hasilnya dalam 1 statement, dan TIDAK PERLU
-- `SECURITY DEFINER` (beda dari handle_new_auth_user()) krn cuma baca baris
-- milik auth.uid() sendiri via RLS yang berlaku normal utk pemanggilnya.
-- ============================================================================

alter table kategori_kbm                    enable row level security;
alter table hari                            enable row level security;
alter table jabatan_pengurus                enable row level security;
alter table kategori_pengumuman             enable row level security;
alter table ppg                             enable row level security;
alter table desa                            enable row level security;
alter table kelompok                        enable row level security;
alter table guru                            enable row level security;
alter table profiles                        enable row level security;
alter table kelas                           enable row level security;
alter table jadwal_kategori_hari            enable row level security;
alter table jadwal_kategori_hari_aktif      enable row level security;
alter table santri                          enable row level security;
alter table riwayat_jenjang                 enable row level security;
alter table siklus_generus                  enable row level security;
alter table pengurus_kelp                   enable row level security;
alter table absensi                         enable row level security;
alter table periode_munaqosah               enable row level security;
alter table munaqosah                       enable row level security;
alter table konseling                       enable row level security;
alter table kurikulum_akhlaq                enable row level security;
alter table kurikulum_prota                 enable row level security;
alter table kurikulum_promes                enable row level security;
alter table kurikulum_probul                enable row level security;
alter table kurikulum_probul_minggu         enable row level security;
alter table kurikulum_pencapaian_santri     enable row level security;
alter table calendar_events                 enable row level security;
alter table files                           enable row level security;
alter table pengumuman                      enable row level security;
alter table jurnal_kbm                      enable row level security;
alter table kop_surat                       enable row level security;
alter table kop_surat_baris                 enable row level security;
alter table akses_kelas_request             enable row level security;
alter table guru_izin                       enable row level security;
alter table quote_harian                    enable row level security;
alter table audit_log                       enable row level security;


-- ============================================================================
-- SECTION 22 — Sanity check penutup (gagal migrasi kalau ada yang salah hitung)
-- ============================================================================

do $$
declare
  tbl_count int;
  rls_count int;
begin
  select count(*) into tbl_count
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE';

  select count(*) into rls_count
  from pg_tables
  where schemaname = 'public' and rowsecurity = true;

  if rls_count <> tbl_count then
    raise exception 'RLS belum aktif di semua tabel: % dari % tabel public.', rls_count, tbl_count;
  end if;

  raise notice 'Migration 002 selesai -- % tabel di schema public, semuanya RLS-enabled.', tbl_count;
end $$;
