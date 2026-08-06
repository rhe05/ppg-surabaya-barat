# PPG
### Surabaya Barat

Scaffold awal Tahap 21 (Development), dibangun dari seluruh dokumen Tahap 01–20 di folder `PROJECT/`.

**Nama aplikasi:** PPG — dengan subtitle "Surabaya Barat" ditampilkan di header/logo area (lihat Wireframe §1-2 untuk posisi logo, dan Design System §2 untuk token tipografi subtitle).

> ⚠️ **Update (Migration 004, Phase 2 — Development Foundation)**: backend data store untuk
> aplikasi ini sedang bermigrasi dari Google Sheets/Firestore ke **Supabase (PostgreSQL)**.
> Skema Prisma di `prisma/schema.prisma` merepresentasikan desain data lama; skema Supabase yang
> berlaku sekarang ada di `supabase/migrations/` dan mengikuti arsitektur yang sudah di-freeze —
> lihat bagian **Arsitektur & Referensi** di bawah sebelum mengubah apa pun yang berhubungan
> dengan skema data.

## Isi Scaffold Ini

- `prisma/schema.prisma` — skema database lengkap (12 entitas) sesuai `07_Architecture/Database Design.md` (legacy — lihat catatan Migration 004 di atas)
- `src/lib/auth.ts` — logika inti RBAC (verifikasi token, cek scope akses, cek wewenang hapus)
- `src/app/api/kelompok/[id]/status/route.ts` — contoh lengkap: endpoint aktivasi Kelompok (Admin PPG saja)
- `src/app/api/absensi/batch/route.ts` — contoh lengkap: endpoint simpan absensi harian dengan RBAC
- `supabase/` — Supabase project scaffold (config, migrations, seed, functions, storage) — lihat **Supabase Requirements** di bawah

Kedua contoh endpoint ini **berjalan** (bukan pseudocode) jika dijalankan dengan database PostgreSQL dan environment variable yang sesuai — dipilih karena mewakili 2 pola berbeda: aksi berdampak luas dengan konfirmasi (Kelompok) dan aksi frekuensi tinggi (Absensi).

## Yang BELUM Ada di Scaffold Ini (Jujur, Bukan Kelalaian)

Membangun seluruh 13 modul, seluruh halaman UI, dan seluruh endpoint API dalam satu sesi percakapan **tidak realistis untuk hasil berkualitas** — ini akan menghasilkan kode yang terlihat lengkap tapi sebenarnya belum teruji, bertentangan dengan standar "bukan AI slop" yang jadi prinsip proyek ini sejak awal. Yang belum dibangun:

- Halaman UI (React components) — Wireframe (Tahap 13) & UI Spec (Tahap 15) sudah siap jadi acuan
- Endpoint API sisanya (Data Santri, Munaqosah, Kurikulum, Konseling, dll) — API Design (Tahap 18) sudah mendefinisikan kontraknya, tinggal diimplementasikan mengikuti pola 2 contoh di atas
- Sistem autentikasi lengkap (login/register flow)
- Testing otomatis
- Implementasi migration engine Migration 004 (extractor/transformer/validator/loader/verifier) — arsitekturnya sudah selesai dan di-freeze, implementasinya belum dimulai (lihat Development Foundation Report)

## Rekomendasi Langkah Selanjutnya

Untuk melanjutkan pengembangan riil, sesi ini (chat biasa) bukan tempat yang ideal — setiap file butuh iterasi, testing, dan debugging yang jauh lebih efisien dilakukan di **Claude Code** (CLI/desktop), yang bisa membaca-tulis-menjalankan kode langsung di proyek Anda, mengikuti Sprint Planning (Tahap 20) satu-per-satu dengan verifikasi di setiap langkah — konsisten dengan preferensi kerja Anda (audit sebelum patch, satu langkah dikonfirmasi dulu sebelum lanjut).

## Arsitektur & Referensi (Migration 004)

Sebelum mengubah apa pun yang berhubungan dengan migrasi data atau skema Supabase, baca dulu:

- **[MAS — Master Architecture Specification](../../docs/architecture/MAS.md)** — Single Source
  of Truth untuk seluruh desain Migration 004. Baca ini duluan.
- [Task 1 — Folder Structure & Architecture](../../docs/architecture/Task01_Architecture.md)
- [Task 2 — Migration Execution Flow](../../docs/architecture/Task02_ExecutionFlow.md)
- [Task 3 — Data Extraction Strategy](../../docs/architecture/Task03_Extraction.md)
- [Task 4 — Transformation Strategy](../../docs/architecture/Task04_Transformation.md)
- [Task 5 — Validation Strategy](../../docs/architecture/Task05_Validation.md)
- [Task 6 — Loading Strategy](../../docs/architecture/Task06_Loading.md)
- [Task 7 — Verification Strategy](../../docs/architecture/Task07_Verification.md)
- [Task 8 — Rollback & Recovery Strategy](../../docs/architecture/Task08_Recovery.md)
- [Task 9 — Operational Runbook & Production Cutover](../../docs/architecture/Task09_Runbook.md)

**Status arsitektur**: Task 1–9 dan MAS sudah **di-freeze** (tag
`migration004-architecture-freeze-v1.0.0`). Tidak ada perubahan arsitektur tanpa ADR baru.
Implementasi migration engine (extractor/transformer/loader/dst.) **belum dimulai** — repo ini
saat ini di tahap Development Foundation (Phase 2).

## Supabase Requirements

Proyek ini menggunakan [Supabase](https://supabase.com) sebagai backend Postgres untuk Migration
004. Environment yang tersedia saat ini **hanya Development** (`ruang-ngaji-dev`) — belum ada
Staging maupun Production.

### Prasyarat lokal
- [Supabase CLI](https://supabase.com/docs/guides/cli) terpasang (`npm install -g supabase`, atau lihat dokumentasi resmi untuk cara instalasi lain)
- Akses ke project Supabase `ruang-ngaji-dev` (minta akses ke pemilik org jika belum ada)

### Environment variables

Buat file `.env.local` (jangan pernah commit file ini — sudah masuk `.gitignore`) berisi:

```bash
SUPABASE_URL=              # Project Settings → API → Project URL
SUPABASE_ANON_KEY=         # Project Settings → API → anon public key
SUPABASE_SERVICE_ROLE_KEY= # Project Settings → API → service_role key (SANGAT SENSITIF, jangan expose ke client)
```

Untuk CI/CD (GitHub Actions), nilai yang setara disimpan sebagai **GitHub Secrets**, bukan file
`.env` — lihat Development Foundation Report untuk daftar lengkap secret yang dibutuhkan.

### Menyambungkan CLI ke project (sudah dilakukan di environment development saat ini)

```bash
supabase login
supabase link --project-ref <project-ref>
```

## Developer Onboarding

1. Baca [MAS](../../docs/architecture/MAS.md) dulu untuk memahami arsitektur migrasi secara utuh.
2. Baca `CLAUDE.md` di root repo untuk konvensi kerja proyek ini (minimal diff, verifikasi wajib, dll).
3. Clone repo, `cd 08_Development/tpq-app`.
4. `npm install` (lockfile `package-lock.json` sudah di-freeze — pakai `npm ci` untuk instalasi deterministik di CI).
5. Minta akses Supabase project `ruang-ngaji-dev` ke pemilik org, lalu `supabase login` + `supabase link`.
6. Salin variabel environment yang dibutuhkan ke `.env.local` (jangan commit).
7. `npm run dev` untuk menjalankan aplikasi secara lokal.

## Setup Lokal (Untuk Kelanjutan Development)

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Perlu file `.env` dengan `DATABASE_URL` (PostgreSQL) dan `JWT_SECRET`. Catatan: setelah migrasi ke
Supabase selesai, alur ini akan digantikan oleh `supabase/migrations/` + environment variable
Supabase di atas — bagian ini akan diperbarui saat implementasi migration engine berjalan.
