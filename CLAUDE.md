# PPG Surabaya Barat — "Ruang Ngaji"

> Aplikasi manajemen TPQ (Taman Pendidikan Quran) untuk PPG Surabaya Barat.
> **Stack aktif: Next.js 16 (App Router) + Supabase (Postgres + RLS + Auth).**
> Di-deploy ke Vercel. PWA (installable, manifest + service worker).
>
> ⚠️ App lama berbasis Google Apps Script + Google Sheets **sudah mati sejak
> 2026-08-18**. Kodenya masih ada di `13_AppsScript/` sebagai arsip — lihat
> bagian "Sejarah / arsip" di bawah. Jangan kerjakan di sana.

**Repo**: https://github.com/rhe05/ppg-surabaya-barat (privat, akun rhe05)
**Owner**: rheza354@gmail.com
**Supabase project ref**: `fnhqtkqswxsqmjxynldg`
**Last Updated**: 2026-09-09

---

## Arsitektur

### Frontend — `frontend/`
- **Next.js 16 App Router** (baca `frontend/AGENTS.md` + `node_modules/next/dist/docs/`
  sebelum menulis kode Next — versi ini punya breaking changes dari yang kamu tahu).
- **Vanilla React + Tailwind v4** (⚠️ Tailwind v4: kelas bisa diam-diam tidak
  ter-generate walau build hijau — grep CSS hasil build).
- Route per fitur di `frontend/app/<fitur>/` (absensi, jurnal, kurikulum,
  monitoring, tabungan, santri, guru, dashboard, data-master, peringkat,
  konseling, munaqosah, pengumuman, kalender, siklus-generus, dst).
- Helper bersama di `frontend/lib/` (`supabase.ts` klien, `auth-context.tsx`,
  `dataGuru.ts`, `kelasGabungGilir.ts`, `pedomanTilawati.ts`, …).
- Komponen di `frontend/components/<fitur>/`.
- Nav: `GuruBottomNav` / `AdminBottomNav` + `AksiCepat*`. Toast global `useToast`.
  Offline: `useKoneksi` / `BannerOffline` / `TarikUntukSegarkan`.

### Backend — Supabase
- **Postgres** dengan **RLS di semua tabel** (tidak ada server app terpisah;
  klien bicara langsung ke PostgREST + RPC).
- **Auth**: Supabase Auth (Login Google). Profil & peran di tabel `profiles`
  (`role`, `scope_ppg_id/desa_id/kelompok_id`, `guru_id`, `is_active`).
- **RBAC**: 4 peran — `admin_ppg`, `admin_desa`, `admin_kelompok`, `guru`.
  Fungsi `auth_profile()` (SECURITY DEFINER, STABLE) dipakai semua policy;
  pola cepat: subquery skalar tanpa korelasi = InitPlan, bukan per-baris
  (lihat migrasi `20260902100000`/`120000` & memory `ppg-rls-initplan-jurnal`).
- **Migrasi**: `08_Development/tpq-app/supabase/migrations/` (±75 file).
- Struktur wilayah: 5 desa / 18 kelompok (sidebar dinamis dari DB).

---

## Formula Kerja AI (standar senior developer — WAJIB)

1. **Minimal diff**: perbaiki HANYA error/fitur yang diminta. Dilarang menulis
   ulang fungsi/section yang tidak berhubungan, dilarang "sekalian merapikan".
2. **Langkah kecil**: kerjakan bertahap, "fokus di X" diartikan literal. Jangan
   perencanaan berat di depan.
3. **Diagnosis berbasis bukti**: reproduksi/ukur dulu (SQL diagnostik ke
   produksi, `read` output, console browser), baru simpulkan. Dilarang menebak
   lalu mengedit. Prompt gaya spec panjang / `#ISSUE` → verifikasi kode dulu,
   balik ke minimal-diff.
4. **Bug baru = entri baru `ERROR_LOG.md`** dalam commit yang sama dengan fix-nya.
5. **Verifikasi wajib sebelum "selesai"**: `npx tsc --noEmit` di `frontend/`
   (+ pre-commit hook `tools/check_local.js` yang masih jalan — tapi itu cuma
   memvalidasi tree GAS arsip, bukan frontend). Untuk perubahan RLS: SQL
   diagnostik + impersonasi ke produksi (lihat di bawah).
6. **Deploy**: full autonomy commit/push tanpa tanya (memory
   `feedback-deploy-workflow`). Push ke `main` = auto-deploy Vercel. TIDAK ada
   CI frontend.

---

## Prinsip Data Supabase / RLS (WAJIB — tiap tambah/ubah fitur yang menyaring
per-kelompok atau per-guru)

### 1. Kurikulum = data BERSAMA di `kelompok_id = 1`
- SELURUH baris `kurikulum_prota` / `kurikulum_promes` / `kurikulum_probul`
  (+ turunannya) hidup di `kelompok_id = 1` saja (sejak migrasi
  `20260822100000`). Kelompok lain memakai baris yang sama.
- Membaca kurikulum: **SELALU** pakai konstanta `1`
  (`KELOMPOK_KURIKULUM_BERSAMA_ID`), **JANGAN** `profile.scope_kelompok_id` —
  kalau pakai scope guru, daftar jadi kosong utk kelompok ≠ 1 (cek-list tak
  bisa dipencet / target hilang). ERROR_LOG #34.
- Pedoman statis (`lib/pedomanTilawati.ts`) di-key per KODE KELAS kurikulum
  (`'1'..'12'`/`'PAUD-TK'`), bukan kelompok — aman.

### 2. Kelas punya DUA guru: `guru_id` + `guru_id_2` (gilir)
- `kelas.guru_id_2` = guru gilir kedua (Data Kelas, migrasi `20260827110000`).
  `guruGiliran()` (`lib/kelasGabungGilir.ts`) menghitung giliran per-tanggal —
  TAPI itu HANYA utk TAMPILAN pengumuman.
- Utk AKSES (lihat kelas, isi jurnal/tilawati/tabungan, edit santri): KEDUA
  guru berhak PENUH atas kelas itu, tanpa cek tanggal giliran.
- Pola WAJIB di query frontend:
  `.or('guru_id.eq.<id>,guru_id_2.eq.<id>')`, bukan `.eq('guru_id', <id>)`.
- Pola WAJIB di policy/RPC RLS:
  `p.guru_id IN (kl.guru_id, kl.guru_id_2)`, bukan `kl.guru_id = p.guru_id`.
  ERROR_LOG #35, migrasi `20260909100000`/`110000`/`120000`.
- `absensi` PENGECUALIAN: cabang guru-nya se-kelompok
  (`p.scope_kelompok_id = absensi.kelompok_id`), tidak per-kelas — sudah benar.

### 3. Aturan mutasi Firestore/DB (peninggalan, konsep tetap berlaku)
- Tulis: bungkus dalam `withScriptLock_()` (GAS) / andalkan RLS + RPC atomik
  (Supabase). ID deterministik kalau ada composite key alami → upsert langsung
  tanpa baca-dulu. ID sekuensial → dokumen counter O(1), jangan scan-cari-max.
- Baca: collection MASTER (santri/guru/jadwal) → full read OK. TIME-SERIES
  (absensi/jurnal) + butuh sebagian → query `where` di sisi server, JANGAN
  full read lalu `.filter()`.
- Setiap RPC baru: `REVOKE ... FROM PUBLIC`, sisakan `TO authenticated`.
- `CREATE OR REPLACE FUNCTION` gagal (42P13) kalau tipe kembalian berubah →
  `DROP FUNCTION` dulu (menghapus GRANT lama juga).

### 4. Migrasi = dijalankan owner MANUAL di Supabase SQL Editor
- CLI `supabase db push` TIDAK dipakai (backlog drift — banyak migrasi
  "pending" sebenarnya sudah live). Tulis SATU file migrasi idempoten
  (`BEGIN; … COMMIT;`), minta owner paste + Run. Memory
  `feedback-migrasi-satu-file-isolasi-dari-backlog`.
- Salin badan fungsi/policy lama dari DB PRODUKSI (`pg_get_functiondef` /
  `pg_policies` via Management API), BUKAN dari ingatan / berkas migrasi lama.
- Setiap perubahan skema → update file migrasi + ingatkan owner jalankan manual.

---

## Debugging & Verifikasi (WAJIB — jangan tebak-tebak)

1. **Ada error/bug? Baca `ERROR_LOG.md` DULU** — riwayat bug + akar masalah +
   penanganan. Cocokkan gejala sebelum investigasi baru.
2. **SQL diagnostik ke produksi** (bypass RLS, inspeksi saja) via Management API —
   token `SUPABASE_ACCESS_TOKEN` di `.env` ROOT repo. Pola di memory
   `ppg-supabase-sql-diag-management-api`. Auto-mode classifier memblok
   query yang MENULIS ke DB — untuk itu minta owner jalankan sendiri.
3. **Verifikasi RLS**: impersonasi di dalam transaksi yang di-rollback —
   `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}'; <query>; rollback;`
   Bandingkan hasil sebelum & sesudah perubahan.
4. **Verifikasi visual tanpa login**: pratinjau statis di `frontend/public/` +
   cek gaya terhitung. Untuk komponen bergulir, screenshot TIDAK cukup — cek
   `scrollLeft` & `getBoundingClientRect`. Memory
   `feedback-verifikasi-visual-tanpa-login`.
5. **PostgREST diam-diam memotong di 1000 baris** → paginasi wajib untuk daftar
   besar. `.upsert` `onConflict` gagal 42P10 pada partial unique index.

---

## Code Standards

- **Git**: pesan deskriptif, `feat:` / `fix:` / `refactor:` / `docs:` /
  `style:`. Akhiri commit dengan `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Naming**: camelCase untuk JS/fungsi, snake_case untuk kolom Postgres.
- **Komentar**: hanya untuk logika non-obvious (kenapa, bukan apa) — dan
  komentar di repo ini padat menjelaskan keputusan; ikuti gayanya.
- **JANGAN** `prettier --write` (merusak gaya kutip) — memory
  `ppg-guru-saas-polish-2026-08-28`.
- **RLS**: selalu tegakkan di DB, jangan percaya frontend.
- **Navigasi**: satu jalan per tujuan, jangan duplikasi menu.
- **No `cd &&` compound** di shell — pakai absolute path.

---

## Sejarah / arsip (JANGAN dikerjakan)

- **`13_AppsScript/`** — app GAS + Google Sheets, mati 2026-08-18. `FILE_MAP.md`,
  `tools/check_local.js`, `tools/verify_served.js`, `tools/diag_query.js`,
  `ERROR_LOG.md #1–#9` mengacu ke era ini. Bug kritis historis: menulis `//`
  (termasuk `http://`) di dalam string JS pada file HtmlService → layar putih
  (ERROR_LOG #1).
- **Migrasi GAS→Supabase** (Agustus 2026): `AUDIT_MIGRASI_GAS_KE_SUPABASE_*.md`,
  `MIGRATION_GUIDE.md`, `RUANG_NGAJI_AUDIT_REPORT.md`, banyak skrip ETL
  sekali-pakai di root & `tools/`.
- **Era Firestore bridge** (sebelum Supabase): `Modul_FirestoreBridge.gs`,
  `Modul_FirestoreMigration.gs`, audit performa Firestore. Konsep performa-nya
  (composite key, query vs full read, counter O(1)) tetap dipakai — sudah
  diringkas di "Prinsip Data Supabase / RLS §3".

**Related docs**: `frontend/AGENTS.md` (aturan Next.js versi ini),
`frontend/AUTH_SETUP.md`, memory `~/.claude/projects/.../memory/MEMORY.md`
(indeks riwayat sesi).
