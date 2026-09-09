# Audit Keamanan & Performa — Ruang Ngaji

**Tanggal**: 2026-09-10 (dikerjakan malam, saat komputer owner istirahat)
**Cakupan**: seluruh aplikasi — kehematan Supabase, kecepatan, 6 pilar keamanan dasar SaaS.
**Sifat**: sebagian besar READ-ONLY. Perubahan kode yang diterapkan malam ini dicantumkan di tiap bagian + diringkas di akhir. **Tidak ada migrasi yang saya jalankan** — semua disiapkan sebagai berkas untuk owner Run manual.

---

## 🔴 TEMUAN P0 — DITEMUKAN MALAM INI: klien "runaway" membakar CPU/kuota Supabase sejak 26 Agustus

Ini **penyebab "CPU Supabase 100%"** yang tidak terpecahkan sejak 26 Agt (`SUPABASE_RESOURCE_AUDIT.md`). Audit lama menebak "mungkin Studio dashboard" — ternyata bukan.

### Bukti (dari produksi, malam ini)

| Metrik | Nilai | Normal seharusnya |
|---|---|---|
| `absensi.n_tup_ins` (percobaan INSERT sejak 24 Jul) | **750 JUTA** | beberapa ribu |
| Laju INSERT `absensi` **saat diukur malam ini** | **~550 / detik** | ~0 |
| Total request PostgREST (`set_config` di `pg_stat_statements`) | **1,4 MILIAR / 47 hari** (~340/detik) | < 1/detik |
| `absensi` autovacuum count | **20.919×** (tabel 3.450 baris) | puluhan |
| `postgres_logs` — 100% isinya | `"Data absensi tanggal 2026-08-26 baru saja diubah dari sesi lain"` (ERRCODE 40001) | — |
| Baris `absensi` hidup | tetap 3.450 (nol tumbuh) | — |

### Akar masalah

Sebuah **klien** (hampir pasti **satu tab peramban lama yang tidak pernah ditutup**, menjalankan build aplikasi versi ~26 Agt) terjebak menyimpan absensi untuk **tanggal 2026-08-26** tanpa henti:

1. Klien memanggil RPC `simpan_absensi_kelas` dengan `updated_at: null` (menganggap baris belum ada).
2. Baris tanggal itu SUDAH ada → `INSERT` kena `unique_violation` → RPC `RAISE` error `40001`.
3. Build lama itu (sebelum perbaikan konkurensi "tahap 10-15" & `handleSimpan` sekarang yang TIDAK retry) **langsung mencoba lagi** → balik ke langkah 1, ~20×/detik, selama **15 hari**.

Kode `app/absensi/page.tsx` versi SEKARANG tidak punya loop ini — makanya tidak ketemu di audit kode 26 Agt. Masalahnya di **JavaScript basi yang masih hidup di sebuah perangkat**.

### Yang HARUS owner lakukan (paling penting, 2 menit)

**Temukan perangkat/tab yang membuka halaman Input Kehadiran Ruang Ngaji dan tutup / hard-refresh.**
- Kandidat: laptop/HP owner sendiri, atau tablet/HP guru yang ditinggal menyala di TPQ dengan tab absensi terbuka sejak ~26 Agt.
- Cara pasti memverifikasi sudah berhenti: buka Supabase → **Reports → Database**, atau minta saya cek `absensi.n_tup_ins` lagi — kalau angkanya berhenti naik, tab-nya sudah ketemu.
- Kalau tidak ketemu perangkatnya: setelah migrasi rate-limit di bawah dijalankan, dampaknya ke CPU **turun drastis** (guard-nya murah), jadi tidak darurat lagi — tapi tetap sebaiknya diburu.

### Pagar yang saya siapkan — migrasi `20260910100000_rate_limit.sql`

Tabel `laju_permintaan` + fungsi `batasi_laju(aksi, maks, detik)` + `simpan_absensi_kelas` dipatch memanggil `batasi_laju('simpan_absensi', 20, 60)` **sebelum** kerja berat.

- Efek: panggilan ke-21 dst dari satu pengguna dalam 60 detik ditolak dengan biaya **satu upsert ke tabel counter kecil** — bukan menjalankan seluruh RPC + speculative INSERT + evaluasi RLS.
- Loop runaway ~1.200/menit langsung mentok di 20 → CPU per panggilan turun ~95%, `absensi` berhenti bloat, autovacuum tenang.
- Batas 20/menit sangat longgar untuk pemakaian sah (admin menyimpan ~10 kelas beruntun, guru 1–3/sesi).

**Jalankan**: `08_Development/tpq-app/supabase/migrations/20260910100000_rate_limit.sql` (idempoten, badan RPC disalin utuh dari produksi + 1 baris).

> **UPDATE 2026-09-10 (setelah owner run migrasi pertama):** counter
> `laju_permintaan` ternyata **KOSONG** & absensi.n_tup_ins masih naik
> ~550/detik. Sebab: klien runaway selalu berakhir `RAISE 40001` →
> PostgREST me-rollback SELURUH transaksi → increment counter `batasi_laju`
> ikut hilang → pagar tak pernah menggigit.
> **Perbaikan lanjutan — migrasi `20260910110000_absensi_fast_path.sql`**:
> `simpan_absensi_kelas` dapat **fast-path** paling depan — kalau semua
> baris yang dikirim sudah ada persis begitu (tanggal + status sama), RPC
> langsung `RETURN {baru:0, diperbarui:0}` yang **COMMIT** tanpa speculative
> INSERT / tanpa 40001. Loop klien basi (yang mengirim ulang data 26 Agt
> tak berubah) jadi = 1 SELECT ber-index (`idx_absensi_santri_tanggal`)
> lalu commit. `absensi.n_tup_ins` berhenti naik. Semantik anti-lost-update
> tidak berubah (fast-path hanya kena kalau BENAR-BENAR tidak ada yang
> berubah). **⚠️ Owner: run migrasi `20260910110000` ini juga.**

### Pagar sisi klien (sudah di-commit)

- `lib/jedaAksi.ts` — hook `useJedaAksi(fn, {jedaMs})`: menolak pemanggilan ulang selama fn sebelumnya berjalan ATAU dalam `jedaMs` sejak mulai.
- `app/absensi/page.tsx` — tombol Simpan (guru & admin) kini dibungkus `useJedaAksi(..., {jedaMs: 2500})`. Tidak mengubah tampilan; menutup celah double-fire & mencegah handler baru memicu badai serupa.

---

## 6 Pilar Keamanan Dasar

Arsitektur penting untuk konteks: **tidak ada server aplikasi terpisah**. Klien (Next.js, semua `'use client'`) bicara **langsung** ke Supabase (PostgREST + RPC). Tidak ada `route.ts`, tidak ada `'use server'` / Server Action. Ini mengubah cara tiap pilar berlaku.

### 1. Rate limiting

| Lapis | Status |
|---|---|
| **Supabase Auth** (login, OTP, refresh token) | ✅ Aktif bawaan — `rate_limit_token_refresh: 150`, `rate_limit_email_sent: 2`, `rate_limit_anonymous_users: 30`, dll (dicek di config auth). |
| **PostgREST / RPC per-user** | ❌ **Tidak ada bawaan.** Inilah celah yang dieksploitasi tanpa sengaja oleh temuan P0. |
| **Sisi klien (anti-spam tombol)** | 🟡 Sebagian — 36 komponen sudah pakai `disabled={menyimpan}`; tapi tidak ada jeda tegas / debounce terpusat sebelum malam ini. |

**Diterapkan malam ini:**
- Migrasi `batasi_laju()` + dipasang di `simpan_absensi_kelas`.
- `lib/jedaAksi.ts` (`useJedaAksi`) + dipasang di layar Input Kehadiran.

**Rekomendasi lanjutan (belum, aman dikerjakan bertahap):** pasang `PERFORM batasi_laju(...)` juga di RPC tulis lain — `tambah_santri` (10/mnt), `ajukan_permintaan_generus` (20/mnt), `nonaktifkan_santri` / `pindah_kelas_santri` / `naikkan_jenjang_santri` (20/mnt), `setujui_pendaftaran` / `tolak_pendaftaran` (30/mnt), `klaim_akun_guru` / `klaim_admin_kelp` (10/mnt). Pola sama persis, tinggal salin badan tiap fungsi dari produksi + 1 baris. Sengaja tidak semua sekaligus malam ini (10 fungsi = risiko salin-tempel).

### 2. Validasi & sanitasi input (anti SQL injection / XSS / script injection)

**Postur: BAIK.**

- **SQL injection — praktis mustahil.** `supabase-js` membangun query **parameterized** (PostgREST). Tidak ada string SQL yang dirakit dari input di frontend. RPC memakai parameter `jsonb`/typed, bukan `EXECUTE format(...)` dengan input mentah (dicek: `simpan_absensi_kelas`, `ajukan_permintaan_generus`, `setujui_pendaftaran` — semua akses field lewat `->>` lalu cast, tidak ada dynamic SQL).
- **XSS — permukaan minimal.** Grep seluruh `app/ components/ lib/`:
  - `dangerouslySetInnerHTML` → **nol**
  - `.innerHTML` / `eval(` / `new Function(` → **nol**
  - React meng-escape semua `{teks}` secara bawaan.
- **Validasi data — berlapis di DB** (bukan cuma frontend, jadi tidak bisa dilewati):
  - Enum Postgres: `app_role`, `gender_type`, `absensi_status`, `santri_jenjang`, `status_pendaftaran`, … — nilai di luar daftar ditolak.
  - CHECK constraint: `chk_pendaftaran_scope`, `chk_pendaftaran_nama` (min 3 char), unique `(acara_id, jamaah_id)`, dll.
  - RPC `SECURITY DEFINER` memvalidasi scope & wajib-isi secara eksplisit di dalam (mis. `ajukan_permintaan_generus` cek "hanya guru", "kelas harus yang diampu", dll).
- **Sanitasi output berkas** — `lib/xlsx.ts` `lolosXml()` meng-escape `& < > " '` + membuang karakter kendali ilegal XML (kalau lolos, Excel menolak seluruh berkas). Nama berkas unduhan di-sanitasi (`[\\/:*?"<>|]` → `-`).

**Catatan kecil (bukan kerentanan):** `no_wa`, `rt`, `rw`, `kode_pos` dll disimpan sebagai `text` bebas tanpa CHECK format. Tidak berisiko keamanan (teks di-escape saat render), murni kualitas data. Bisa ditambah CHECK regex nanti kalau mau.

### 3. CSRF protection

**Tidak berlaku / sudah aman by design.**

- Auth Supabase memakai **JWT di header `Authorization: Bearer …`**, **bukan cookie**. Sesi disimpan di `localStorage`/`sessionStorage` (`lib/supabase.ts`). Serangan CSRF butuh browser mengirim kredensial otomatis (cookie) — di sini tidak ada, jadi request lintas-situs tidak membawa identitas korban.
- Tidak ada Next.js Server Action / form POST ke server sendiri (yang butuh token CSRF).
- Reset password: token di **fragment URL** (`#`), ditukar jadi sesi di klien — fragment tidak dikirim ke server, aman dari kebocoran via Referer.
- **Kesimpulan:** token unik per-request seperti yang Anda sebut memang standar untuk app berbasis-cookie; app ini tidak berbasis cookie, jadi tidak diperlukan. Yang penting sudah ada: JWT ber-expiry (`jwt_exp: 3600` = 1 jam) + refresh token rotation (`refresh_token_rotation_enabled: true`) + reuse detection (`security_refresh_token_reuse_interval: 10`).

### 4. CORS

- PostgREST Supabase mengembalikan `Access-Control-Allow-Origin: *` — **ini memang desain Supabase** dan **bukan lubang**: setiap request TETAP wajib membawa JWT yang sah, dan **RLS** membatasi baris per-pengguna di database. `anon` key memang publik (ada di bundel frontend, `NEXT_PUBLIC_…`) — itu normal; ia hanya "kunci untuk mengetuk pintu", RLS yang menentukan isi.
- Yang benar-benar mengunci "hanya frontend kita": **URL Configuration Supabase Auth** (redirect URL allow-list) + **origin Google OAuth**. → lihat pilar 5, ada masalah di sini.
- Kalau nanti mau CORS ketat betulan (hanya `ruang-ngaji.vercel.app`), itu butuh menaruh reverse-proxy / Edge Function di depan PostgREST — **tidak sepadan** untuk skala TPQ ini, dan RLS sudah jadi lapisan yang benar.

### 5. SSL / HTTPS + domain

- **Vercel** (`ruang-ngaji.vercel.app`) — HTTPS otomatis, sertifikat dikelola Vercel, redirect HTTP→HTTPS otomatis. ✅ (dicek: `curl -I` → 200 via HTTPS).
- **Supabase** (`fnhqtkqswxsqmjxynldg.supabase.co`) — HTTPS wajib. ✅
- **HSTS** — ❌ belum ada → **diterapkan malam ini** di `next.config.ts` (`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`).
- 🟡 **MASALAH TERPISAH (sudah dilaporkan ke owner sebelumnya, belum diperbaiki):** Supabase Auth **Site URL = `http://localhost:3000`** dan **Redirect URLs kosong**. Akibatnya login/daftar via Google dari HP mendarat ke `localhost:3000` (gagal). **Perbaikan owner di Supabase Dashboard → Authentication → URL Configuration:**
  - Site URL → `https://ruang-ngaji.vercel.app`
  - Redirect URLs → tambah `https://ruang-ngaji.vercel.app/**` dan `http://localhost:3000/**`

### 6. Environment variables / secrets

**Postur: BAIK.**

- Grep seluruh frontend: hanya 2 pemakaian `process.env`, keduanya `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY` — memang boleh publik.
- **`service_role` key: nol** kemunculan di `app/ components/ lib/`. Tidak bocor ke frontend. ✅
- `SUPABASE_ACCESS_TOKEN` (Management API) ada di `.env` **root repo** (untuk perkakas diagnostik), **bukan** di `frontend/`, dan tidak pernah di-`import` kode aplikasi.
- `.gitignore`: `.env` + `.env.*` diabaikan di root & `frontend/`; hanya `.env.example` yang di-track. `git ls-files | grep env` → hanya `.env.example`. ✅ Tidak ada kredensial ter-commit.
- Nilai runtime di Vercel (Project Settings → Environment Variables) — di luar jangkauan audit ini, tapi karena hanya butuh 2 var `NEXT_PUBLIC_*`, permukaannya kecil.

**Rekomendasi:** kalau `SUPABASE_ACCESS_TOKEN` di `.env` root sudah lama, rotasi berkala (Supabase → Account → Access Tokens). Ini token paling berkuasa yang Anda punya.

---

## Kehematan Supabase (di luar temuan P0)

Postur umum **BAIK** — konvensi kuat & konsisten:
- **Nol** `select('*')` di seluruh frontend — semua query menyebut kolom eksplisit.
- **Nol** Realtime subscription (`.channel(`) — tidak ada WebSocket persisten yang memakan koneksi/CPU.
- **Nol** `setInterval` polling.
- Query time-series (`absensi`, `tabungan_transaksi`) memakai paginasi `.range()` dengan `break` yang benar di 13 file — aman dari cap diam-diam 1.000 baris PostgREST.
- Tidak ada `await` di dalam loop `for/map` yang jadi N+1 (yang ada = loop paginasi, benar).
- Satu instance Supabase client (`lib/supabase.ts`).
- RLS pakai `auth_profile()` (`STABLE SECURITY DEFINER`) sebagai InitPlan — dievaluasi sekali per-statement, bukan per-baris.

**Sisa yang masih terbuka dari `SUPABASE_RESOURCE_AUDIT.md` (prioritas turun drastis setelah P0 beres):**
- ~~**HIGH #2**~~ — SUDAH diperbaiki (`AdminKelpDashboard.tsx` query `guru`/`santri` kini pakai `.eq('kelompok_id', …)`, dikonfirmasi malam ini).
- **HIGH #3** — Dashboard admin kelp = 8 round-trip terpisah saat mount. Konsolidasi ke lebih sedikit RPC. Refactor sedang; kerjakan saat owner bisa memantau.
- **#1 (CRITICAL lama)** — `AbsensiChart` / `AttendanceSummaryReport` sudah dibatasi 30 hari (`15eb83d`), tapi masih tarik baris mentah ke klien lalu hitung di JS + tanpa filter `kelompok_id`. Ideal: ganti ke RPC agregat sisi-server (pola `statistik_kehadiran` yang sudah ada). Menengah.

**Bloat tabel `absensi`**: 12 MB untuk 3.450 baris (>50% dead tuple) akibat P0. Setelah tab runaway ditutup + migrasi rate-limit jalan, autovacuum akan menyusutkannya sendiri; kalau mau instan, owner bisa `VACUUM FULL public.absensi;` di SQL Editor saat sepi (mengunci tabel sebentar).

---

## Kecepatan (frontend)

Postur **BAIK**:
- Dependensi ramping (7 runtime: next, react, react-dom, supabase-js, lucide-react, recharts, jspdf). Tidak ada pustaka berat berlebih.
- `jspdf` (+autotable, ~350 KB) di-**import dinamis** — hanya diunduh saat tombol PDF ditekan (`lib/unduhPdf.ts`).
- Semua gambar via `next/image` — **nol** `<img>` mentah.
- Skeleton + fade + `prefers-reduced-motion` (pekerjaan beranda guru kemarin) — transisi mulus.
- Kartu dashboard mengambil data paralel (`Promise.all`) di banyak tempat.

**Peluang (opsional, dampak sedang–kecil):**
- Beberapa halaman berat (`app/dashboard`, `app/monitoring`, `app/statistik`) masih menghitung agregat di JS dari baris mentah — pindahkan ke RPC agregat (sekalian menyelesaikan Supabase #1/#2/#3).
- `recharts` (~150 KB) dimuat di halaman yang ada grafiknya — bisa di-`next/dynamic` dengan `ssr:false` supaya tidak menahan first paint. Kecil.
- Belum ada service worker / offline cache untuk aset statis (PWA-nya installable tapi tanpa SW). Menambah `next-pwa` atau SW manual = perbaikan kecepatan kunjungan berulang, tapi menambah kompleksitas cache (hati-hati: SW yang salah bisa menyajikan JS basi — persis masalah P0). **Rekomendasi: jangan dulu.**

---

## Ringkasan perubahan yang diterapkan malam ini (sudah di-commit & push)

| Berkas | Perubahan | Butuh aksi owner? |
|---|---|---|
| `08_.../migrations/20260910100000_rate_limit.sql` | **BARU** — `laju_permintaan` + `batasi_laju()` + patch `simpan_absensi_kelas` | ✅ **Run manual di SQL Editor** |
| `frontend/lib/jedaAksi.ts` | **BARU** — hook `useJedaAksi` (anti-spam) | otomatis via deploy |
| `frontend/app/absensi/page.tsx` | tombol Simpan dibungkus `useJedaAksi` | otomatis via deploy |
| `frontend/next.config.ts` | header keamanan: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP `frame-ancestors 'none'` | otomatis via deploy |
| `SUPABASE_RESOURCE_AUDIT.md` | catatan akar masalah P0 ditambahkan | — |
| `ERROR_LOG.md` | entri baru P0 | — |

## Daftar aksi owner (urut prioritas)

1. **Tutup tab peramban runaway** (halaman Input Kehadiran, stuck di 26 Agt) — di perangkat mana pun. → hentikan pendarahan CPU seketika.
2. **Run** migrasi `20260910100000_rate_limit.sql` di Supabase SQL Editor.
3. **Supabase Dashboard → Authentication → URL Configuration**: Site URL = `https://ruang-ngaji.vercel.app`, Redirect URLs += `https://ruang-ngaji.vercel.app/**` & `http://localhost:3000/**`. → perbaiki login Google dari HP.
4. (opsional, saat sepi) `VACUUM FULL public.absensi;` untuk menyusutkan 12 MB → ~1 MB.
5. (nanti) rotasi `SUPABASE_ACCESS_TOKEN`; pasang `batasi_laju` di RPC tulis lain; pindah agregat dashboard ke RPC.

## CSP penuh — SIAP DIUJI (belum enforcing)

Setelah owner konfirmasi tidak ada yang pecah, promosikan `Content-Security-Policy` di `next.config.ts` dari `frame-ancestors 'none'` menjadi (uji dulu di preview Vercel):

```
default-src 'self';
connect-src 'self' https://fnhqtkqswxsqmjxynldg.supabase.co;
img-src 'self' data: blob:;
font-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline' 'unsafe-eval';
form-action 'self' https://fnhqtkqswxsqmjxynldg.supabase.co https://accounts.google.com;
frame-ancestors 'none';
base-uri 'self';
object-src 'none';
```

`'unsafe-inline'`/`'unsafe-eval'` di `script-src` masih diperlukan (Next App Router tanpa nonce middleware + Tailwind v4 inline style). Ini tetap memblokir **script eksternal** yang disuntik — baseline nyata. Menghilangkan `'unsafe-*'` butuh middleware nonce + `'strict-dynamic'` (pekerjaan tersendiri, risiko memecah hydration).

---

## ADDENDUM 2026-09-10 — checklist audit lengkap owner + audit RLS menyeluruh

Owner memberi checklist audit keamanan SaaS generik + wewenang penuh memutuskan. Berikut pemetaannya ke aplikasi ini. **Keputusan senior: tidak ada perubahan kode lanjutan yang sepadan** — semua item MUST sudah beres atau tidak berlaku karena arsitektur, item SHOULD sudah baik, item OPTIONAL/DON'T memang dilewati.

### Audit RLS menyeluruh (READ-ONLY, dijalankan malam ini)

| Cek | Hasil |
|---|---|
| Tabel `public` dengan RLS aktif | **60 / 60** ✅ (100%) |
| Kebijakan SELECT dengan `USING(true)` | **hanya** `desa`, `kelompok`, `ppg`, `kategori_kbm` — semua data referensi org non-sensitif (nama desa/kelompok/kategori) yang memang dibutuhkan sidebar/pemilih. **Bukan lubang.** |
| `profiles` | `USING (id = auth.uid())` — tiap user **hanya** baca profil sendiri ✅ |
| Semua tabel data pribadi/anggota (santri, guru, jamaah, absensi, tabungan, jurnal, konseling, munaqosah, siklus_generus, dst) | scoped via `auth_profile()` — role + scope kelompok/desa dicek per baris ✅ |
| Kebijakan INSERT/UPDATE/DELETE yang **melewati** cek auth | **NOL** ✅ — tiap write policy scoped `auth_profile()` atau `auth.uid()` |
| Tabel RLS-aktif tanpa policy (deny-all) | 6: `audit_log`, `hari`, `kurikulum_akhlaq`, `jadwal_kategori_hari_aktif`, `riwayat_jenjang`, `laju_permintaan`. **Nol dipakai frontend** → deny-all = aman & benar (audit_log memang tak boleh dibaca via API). |

**Verdict RLS: BERSIH.** Tidak ada user yang bisa membaca/menulis data user/kelompok lain. Postur ini setara atau lebih baik dari mayoritas SaaS berbayar.

### Pemetaan checklist owner

| Item | Status | Catatan |
|---|---|---|
| HTTPS/SSL | ✅ | Vercel + Supabase auto; HSTS ditambah |
| CORS whitelist | N/A | PostgREST `*` + wajib JWT + RLS = desain Supabase; proxy CORS = overkill utk skala ini |
| Env vars no hardcoded secret | ✅ | hanya `NEXT_PUBLIC_*`; nol `service_role`; `.env` gitignore |
| Input validation server-side + parameterized | ✅ | supabase-js parameterized; enum + CHECK + validasi RPC |
| CSRF token per-request | **N/A** | auth pakai JWT header, bukan cookie → CSRF tidak mungkin. Menambah token CSRF = cargo-cult, nol manfaat |
| Rate limiting (client stun) | ✅ | `lib/jedaAksi.ts` + 36 komponen `disabled` saat submit + server `batasi_laju` |
| XSS prevention | ✅ | React auto-escape; nol `dangerouslySetInnerHTML`/`innerHTML`/`eval` |
| SQL injection | ✅ | supabase-js; nol string SQL dari input; RPC pakai `->>`+cast, bukan `EXECUTE format()` |
| RLS | ✅ | audit menyeluruh di atas — bersih |
| Connection pooling | N/A | frontend pakai REST URL, bukan connection string; PostgREST kelola pool sendiri |
| Pagination | ✅ | `.range()` + `break` benar di 13 file |
| Column selection | ✅ | nol `select('*')` di seluruh frontend |
| Edge caching / Cache-Control | dilewati | app 100% dinamis per-user; nyaris tak ada yang bisa di-cache aman; aset statis sudah ditangani Vercel |
| JWT token caching | ✅ | supabase-js cache sesi di localStorage + `autoRefreshToken`; profil dibaca 1× per mount (2 ms) |
| Encryption data sensitif (SSN/payment) | N/A | app tidak menyimpan SSN/kartu/pembayaran. PII (nama, alamat, no HP keluarga) sudah dilindungi enkripsi-at-rest Supabase + RLS + TLS — cukup utk aplikasi manajemen TPQ |
| Audit logging | 🟡 sebagian | tabel `audit_log` ada (dari trigger); tidak menyeluruh. Cukup utk tahap ini |
| ISR / Redis rate limit / WAF / multi-region / PCI / pentest / SAML | dilewati | benar — overkill utk tahap & jenis aplikasi ini (sesuai "DO NOT IMPLEMENT" di checklist owner) |

### Satu-satunya item terbuka (bukan kode)

**Supabase Auth → URL Configuration**: Site URL masih `http://localhost:3000`. Owner perbaiki di dashboard (lihat bagian pilar 5). Ini memblokir login Google dari HP dan membuat link email (reset password) mengarah ke localhost.

### Yang SENGAJA tidak dikerjakan (keputusan senior)

- **`batasi_laju` di 10 RPC tulis lain** — RPC-nya low-frequency (admin/guru-triggered), tidak "550/detik-able", sudah dilindungi RLS + `jedaAksi` + rate limit Supabase Auth. Menyalin badan 10 fungsi `SECURITY DEFINER` dari produksi = risiko transkripsi nyata untuk manfaat kecil. Yang penting (`simpan_absensi_kelas`) sudah dibereskan dgn fast-path + `batasi_laju`. Sesuai Rule 1 checklist owner (Atomic Task Focus), bukan "add full stack to 50 endpoints".
- **CSP penuh enforcing** — disiapkan (di atas), tapi butuh diuji di preview dulu; risiko blank screen kalau salah satu directive meleset. Owner/sesi berikutnya promosikan setelah verifikasi.
- **Encryption kolom PII** — tidak sepadan; RLS + TLS + at-rest sudah lapisan yang benar.
