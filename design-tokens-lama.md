# Design Tokens — Ruang Ngaji (versi GAS lama)

> Hasil recon Langkah 1. **Belum ada satu baris kode Next.js yang disentuh.**
> Sumber: `13_AppsScript/Style_Main.html` (7234 baris) + `13_AppsScript/Markup_Screens.html` (4847 baris).
> Tanggal recon: 2026-08-16.

---

## 0. Temuan struktural (baca ini dulu — mempengaruhi rencana Langkah 2)

Struktur sumber **berbeda dari dugaan di brief**. Tidak ada `Style_Aplikasi.html`,
`Dashboard.html`, `Absensi.html`, atau `Kelas.html`. Yang ada:

| File | Baris | Isi |
|---|---|---|
| `13_AppsScript/Index.html` | 42 | Shell saja, `include()` 3 file di bawah |
| `13_AppsScript/Style_Main.html` | 7234 | **SELURUH CSS aplikasi**, satu `<style>` tunggal |
| `13_AppsScript/Markup_Screens.html` | 4847 | Seluruh markup 15 screen + modal |
| `13_AppsScript/Script_Main.html` | 11985 | Seluruh JS (3 `<style>` kecil inline) |

Aplikasi lama = **SPA satu halaman** dengan 15 `.screen-wrapper` yang di-toggle,
bukan multi-halaman. Jadi tidak ada "file CSS per halaman" untuk disalin
satu-satu; semua halaman berbagi token & komponen yang sama.

---

## 1. Design tokens (`:root`, Style_Main.html:2-23)

Ini definisi otoritatif, disalin verbatim:

```css
--brass:        #D97706;   /* PRIMARY — tombol utama, focus ring, aksen */
--sage:         #059669;   /* sukses / status hadir */
--brand-green:  #6B9975;   /* judul brand di login */
--volt:         #FBBF24;   /* kuning — status izin (di toggle absensi) */
--red:          #DC2626;   /* bahaya / status alpa */
--indigo:       #4F46E5;   /* status sakit (di toggle) / izin (di ringkasan) */
--teal:         #0D9488;   /* aksen sekunder, gradient avatar */
--panel:        #FFFFFF;   /* permukaan kartu */
--panel-2:      #F9FAFB;   /* permukaan sekunder, header tabel, hover row */
--bg:           #F8FAFC;   /* background halaman */
--border:       #E2E8F0;
--text:         #0F172A;
--text-dim:     #64748B;
--text-faint:   #94A3B8;
--radius:        8px;      /* input, tombol biasa, badge */
--radius-lg:     14px;     /* kartu, panel, modal */
--radius-button: 999px;    /* pill — tombol login, status toggle */
--shadow-card:   0 2px 12px rgba(15, 23, 42, 0.08);
--shadow-subtle: 0 1px 3px rgba(15, 23, 42, 0.06);
--topbar-height: 56px;
```

Catatan: `--radius-md: 10px` dipakai di `.ia-kehadiran-summary-card` sebagai
fallback (`var(--radius-md, 10px)`) tapi **tidak pernah didefinisikan** di
`:root` — jadi nilai efektifnya selalu `10px`.

## 2. Tipografi (Style_Main.html:27-37)

```css
font-family: "Inter", system-ui, -apple-system, sans-serif;
font-size: 14px;
line-height: 1.5;
color: var(--text);
background: var(--bg);
```

⚠️ **Inter tidak pernah dimuat.** Tidak ada `<link>` Google Fonts dan tidak ada
`@font-face` di seluruh `Index.html` / `Style_Main.html` (sudah di-grep). Artinya
di produksi GAS, font yang benar-benar tampil adalah **`system-ui`** — Segoe UI
Variable di Windows, SF Pro di iOS/Mac, Roboto di Android. Lihat Bagian 7 poin A.

Ukuran per elemen:

| Elemen | Size | Weight | Lain |
|---|---|---|---|
| body | 14px | 400 | line-height 1.5 |
| Judul seksi (`.dash-section-title`) | 20px | 700 | color `--text` |
| Brand login (`.login-brand-title`) | 26px | 700 | color `--brand-green` |
| KPI value | 36px | 700 | `tabular-nums`, line-height 1 |
| KPI label | 12px | 600 | UPPERCASE, letter-spacing .5px, `--text-dim` |
| KPI unit | 13px | 400 | `--text-faint` |
| Tombol `.btn` | 13px | 600 | — |
| Tabel `th` | 12px | 600 | UPPERCASE, letter-spacing .3px, `--text-dim` |
| Tabel `td` / `.data-table` | 13px | 400 | `--text` |
| `.form-label` | 12px | 600 | UPPERCASE, letter-spacing .3px, `--text-dim` |
| `.login-label` | 12px | 500 | **tidak** uppercase, `--text-dim` |
| `.form-input` | 13px | 400 | — |
| `.login-input` | 14px | 400 | — |
| Nama santri (`.ia-santri-nama`) | 14px | 600 | ellipsis 1 baris |
| Status pill (`.ia-status-btn`) | 11px | 700 | — |

## 3. Komponen berulang

### 3.1 Kartu KPI (`.kpi-grid` / `.kpi-card`, :852-893)
```css
.kpi-grid  { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
             gap:16px; margin-bottom:48px; }
.kpi-card  { background:var(--panel); border-radius:var(--radius-lg); padding:24px;
             box-shadow:var(--shadow-card); border:1px solid var(--border);
             text-align:center; }
```
Urutan isi kartu: **label (atas) → value → unit**. Aksen opsional:
`.accent-sage` / `.accent-brass` / `.accent-volt` mewarnai `.kpi-value` saja.

### 3.2 Tombol (`.btn`, :4410-4454)
```css
.btn           { padding:10px 16px; border:none; border-radius:var(--radius);
                 font-size:13px; font-weight:600; transition:all .2s; }
.btn-primary   { background:var(--brass); color:#fff; }
.btn-primary:hover:not(:disabled) { opacity:.9; }          /* bukan ganti warna */
.btn-secondary { background:var(--panel-2); color:var(--text);
                 border:1px solid var(--border); }
.btn-secondary:hover { background:var(--border); }
.btn-icon      { background:transparent; color:var(--text-dim);
                 padding:6px 10px; font-size:16px; }
.btn-icon:hover        { color:var(--text); background:var(--panel-2); }
.btn-icon.danger:hover { color:var(--red); }
```
Radius tombol = **8px**, BUKAN pill. Pill (999px) hanya untuk tombol login dan
status toggle absensi.

### 3.3 Tabel (`.data-table`, :4250-4288)
```css
.data-table-wrapper { background:var(--panel); border-radius:var(--radius-lg);
                      border:1px solid var(--border); box-shadow:var(--shadow-card);
                      overflow-x:auto; margin-bottom:48px; }
.data-table         { width:100%; border-collapse:collapse; font-size:13px; }
.data-table thead   { background:var(--panel-2); border-bottom:1px solid var(--border); }
.data-table th      { padding:14px 16px; text-align:left; font-weight:600;
                      color:var(--text-dim); font-size:12px;
                      letter-spacing:.3px; text-transform:uppercase; }
.data-table td      { padding:14px 16px; border-bottom:1px solid var(--border);
                      color:var(--text); }
.data-table tbody tr:hover { background:var(--panel-2); }
```
Tanpa zebra-striping di tabel umum (striping hanya ada di tabel kurikulum & matrix).

### 3.4 Form (:4366-4401)
```css
.form-group  { margin-bottom:16px; }
.form-label  { display:block; font-size:12px; font-weight:600; color:var(--text-dim);
               margin-bottom:6px; text-transform:uppercase; letter-spacing:.3px; }
.form-input,
.form-select { width:100%; padding:10px 12px; border:1px solid var(--border);
               border-radius:var(--radius); font-size:13px; color:var(--text); }
:focus       { outline:none; border-color:var(--brass);
               box-shadow:0 0 0 3px rgba(217,119,6,.1); }
.search-input{ padding:10px 14px; radius:var(--radius); font-size:13px;
               margin-bottom:24px; }
```
**Focus ring = brass 3px @ 10% opacity** — konsisten di semua input.

### 3.5 Layout halaman (:700-750)
```css
.dash-header { background:var(--panel); border-bottom:1px solid var(--border);
               padding:0 200px 0 20px; height:56px; box-shadow:var(--shadow-subtle);
               display:flex; align-items:center; position:sticky; top:0; z-index:10; }
```
Konten di-center dengan lebar maksimum **1200px** lewat padding, bukan `max-width`:
```css
padding-left:  max(20px, calc((100% - 1200px) / 2));
padding-right: max(20px, calc((100% - 1200px) / 2));
```
`padding-right:200px` di header = ruang untuk card admin `position:fixed` di pojok
kanan atas. Header tidak ikut scroll; hanya blok konten di bawahnya yang scroll.

### 3.6 Login (:44-138)
```css
.login-card  { background:var(--panel); border-radius:var(--radius-lg);
               box-shadow:var(--shadow-card); padding:40px 36px; max-width:400px; }
.login-brand { flex column, align center, gap:10px, margin-bottom:36px; }
.login-brand-title { 26px/700, color:var(--brand-green); }
.login-input { padding:12px 14px; font-size:14px; radius:var(--radius); }
.login-btn   { width:100%; margin-top:24px; padding:13px; background:var(--brass);
               color:#fff; border-radius:var(--radius-button); 14px/600; }
.login-error { background:#FEF2F2; color:var(--red); radius:var(--radius);
               padding:12px 14px; 13px; margin-top:20px; }
```
Layar login di-center penuh viewport (`min-height:100vh`, padding 20px).

### 3.7 Kartu santri + status toggle absensi (:5760-5825)
```css
.ia-santri-card  { display:flex; align-items:center; gap:12px; background:var(--panel);
                   border-radius:var(--radius-lg); padding:12px 14px; margin-bottom:10px;
                   box-shadow:var(--shadow-subtle);
                   animation:iaCardIn .25s ease both; }
@keyframes iaCardIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
.ia-avatar       { 40×40; border-radius:50%; font 15px/700; color:#fff;
                   background:linear-gradient(135deg, var(--indigo), var(--teal)); }
.ia-status-toggle{ display:flex; gap:3px; background:var(--bg);
                   border-radius:var(--radius-button); padding:3px; }
.ia-status-btn   { border:none; background:transparent; padding:7px 8px;
                   border-radius:var(--radius-button); font-size:11px; font-weight:700;
                   color:var(--text-faint);
                   transition:background .15s, color .15s, transform .1s; }
.ia-status-btn:active { transform:scale(.92); }
```

### 3.8 Kartu ringkasan kehadiran 4-kolom (:5688-5758)
```css
.ia-kehadiran-summary      { background:var(--panel); border-radius:var(--radius-lg);
                             padding:14px 16px; margin-bottom:14px;
                             box-shadow:var(--shadow-subtle); }
.ia-kehadiran-summary-title{ 11px/700; letter-spacing:.05em; UPPERCASE; --text-faint; }
.ia-kehadiran-summary-grid { grid; repeat(4,1fr); gap:8px; }
.ia-kehadiran-summary-card { text-align:center; border-radius:10px;
                             border:1px solid var(--border); padding:10px 4px 9px;
                             position:relative; overflow:hidden; }
.ia-kehadiran-summary-card::before { garis atas 3px, gradient per status }
.ia-ks-value { 20px/800; line-height:1.2; }
.ia-ks-label { 10.5px/600; color:var(--text-dim); margin-top:2px; }
```
Tiap kartu: `background: linear-gradient(160deg, rgba(WARNA,.09), rgba(WARNA,.02))`,
`border-color: rgba(WARNA,.2)`, garis atas `linear-gradient(90deg, WARNA, WARNA-2)`.

---

## 4. ⚠️ Warna status hadir/izin/sakit/alpa — TIDAK KONSISTEN di app lama

Ini temuan paling penting untuk "sama persis". Ada **tiga komponen** yang memetakan
status ke warna, dan **ketiganya berbeda**:

| Status | Toggle input absensi<br>`.ia-status-btn.active` (:5821-5824) | Kartu ringkasan<br>`.ia-ks-*` (:5740-5757) | Stat dashboard<br>`.ia-dash-stat` (:5452-5460) |
|---|---|---|---|
| hadir | `--sage` #059669, teks putih | `--sage` #059669 | `--sage` #059669 |
| **izin** | **`--volt` #FBBF24**, teks #78350F | **`--indigo` #4F46E5** | **`--indigo` #4F46E5** |
| **sakit** | **`--indigo` #4F46E5**, teks putih | **`--brass` #D97706** | **#B45309** (hardcode) |
| alpa | `--red` #DC2626, teks putih | `--red` #DC2626 | `--red` #DC2626 |

Jadi izin & sakit **bertukar warna** antara toggle input dan kartu ringkasan, dan
"sakit" punya tiga nilai berbeda (#4F46E5 / #D97706 / #B45309) tergantung komponen.

**Ini butuh keputusan Anda sebelum Langkah 2.** Pilihan:
- **(a) Replikasi apa adanya** — paling setia pada instruksi "tidak boleh ada
  perubahan sedikit pun", tapi inkonsistensinya ikut terbawa ke aplikasi baru.
- **(b) Samakan ke satu peta** (mis. versi kartu ringkasan: hadir=sage,
  izin=indigo, sakit=brass, alpa=red) — lebih bersih, tapi tampilan toggle
  input absensi akan **beda** dari GAS lama.

Default saya kalau tidak ada instruksi: **(a)**, sesuai kata-kata Anda sendiri.

---

## 5. Breakpoint (:4566-4772)

Lima breakpoint, mobile-first bertingkat:

| Nama | Range | Perubahan utama |
|---|---|---|
| xs | 320–479px | `.kpi-grid` → 1 kolom; `.btn` mengecil; modal full-screen |
| sm | 480–767px | `.kpi-grid` → 1 kolom |
| md | 768–1023px | `.kpi-grid` → 2 kolom |
| lg | 1024–1279px | `.kpi-grid` → 3 kolom |
| xl | 1280px+ | `.kpi-grid` → 4 kolom |

Plus blok `@media (hover:none)` / touch (:4773-4805): target sentuh diperbesar,
efek `:hover` dimatikan, `.btn:active` dapat feedback. Input di mobile
dipaksa `font-size:16px` (:4806-4820) supaya iOS tidak auto-zoom.

Modal di mobile jadi hampir full-screen (:4329+). Tabel dapat scroll horizontal,
kolom ke-6 dst disembunyikan di layar kecil (:4841).

---

## 6. Kondisi styling Next.js sekarang (titik awal)

| Item | GAS lama | Next.js sekarang |
|---|---|---|
| Sistem | CSS tulis tangan, custom properties | Tailwind v4 (`@import "tailwindcss"`), **tanpa file config** |
| Token | 21 variabel di `:root` | 2 variabel (`--background`, `--foreground`) |
| Font | `"Inter", system-ui` (Inter tak dimuat) | **`Arial, Helvetica, sans-serif`** |
| Warna primer | brass `#D97706` | `text-blue-700` (default Tailwind) |
| Background | `#F8FAFC` | `bg-gray-50` (`#F9FAFB`) — mirip, tidak sama |
| Radius kartu | 14px | `rounded-lg` (8px) |
| Shadow | `0 2px 12px rgba(15,23,42,.08)` | `shadow` (default Tailwind) |
| Dark mode | tidak ada | **ADA** — `@media (prefers-color-scheme: dark)` di `globals.css:15-20` |

Semua halaman memakai utility class Tailwind (bukan inline style), jadi
perubahan visual = ganti `className`, tidak menyentuh logic. Jumlah titik sentuh:
dashboard 19, absensi 39, kelas 29, login 9, reports 6.

⚠️ `globals.css` punya blok dark mode. Aplikasi GAS lama **light-only**. Selama
blok itu ada, tampilan di HP dengan dark mode aktif tidak akan pernah sama.
Rekomendasi: hapus blok tersebut di Langkah 2.

---

## 7. Hal yang harus Anda putuskan sebelum Langkah 2

**A. Font.** Aplikasi lama menulis `"Inter"` tapi tidak pernah memuatnya — yang
tampil di produksi adalah font sistem. Mana yang Anda maksud "sama persis"?
1. Tiru **hasil nyatanya**: pakai `system-ui, -apple-system, sans-serif` (tanpa
   Inter). Ini yang benar-benar dilihat pengguna selama ini. ← rekomendasi saya
2. Tiru **niatnya**: muat Inter sungguhan lewat `next/font`. Hasilnya akan
   terlihat **berbeda** dari GAS lama di semua perangkat.

**B. Peta warna status** — lihat Bagian 4, pilih (a) atau (b).

**C. Halaman tanpa padanan lama.** 15 screen GAS: Login, Onboarding, InputAbsen,
Dashboard, Santri, Guru, GuruDashboard, Absensi, Munaqosah, Konseling, Kalender,
PustakUnduhan, Laporan, Statistics, UserManagement.

| Halaman Next.js | Padanan GAS | Status |
|---|---|---|
| `app/auth/login/page.tsx` | `#screenLogin` | ✅ 1:1 |
| `app/absensi/page.tsx` | `#screenInputAbsen` | ✅ 1:1 |
| `app/dashboard/page.tsx` | `#screenDashboard` | ⚠️ sebagian — dashboard lama jauh lebih kaya (KPI + chart + submenu) |
| `app/kelas/page.tsx` | **tidak ada** | ❌ tidak ada `#screenKelas`; yang mirip = panel "Daftar Kelas" di dalam Jadwal KBM |
| `app/reports/page.tsx` | `#screenLaporan` | ⚠️ sebagian |

Untuk `/kelas` tidak ada desain lama yang bisa disalin. Sesuai constraint Anda
("jangan menebak-nebak desain dari ingatan"), saya akan menerapkan **token dan
komponen umum** saja (kartu, tabel, tombol dari Bagian 3) — bukan mereka-reka
layout khusus. Konfirmasi kalau ini tidak sesuai maksud Anda.

**D. Urutan pengerjaan** (1 halaman = 1 sesi = 1 commit). Usulan, dari fondasi
ke daun:
1. `globals.css` — tanam 21 token + font + hapus dark mode (prasyarat semua halaman)
2. `app/auth/login/page.tsx` — paling kecil, padanan 1:1, gampang divalidasi
3. `app/absensi/page.tsx` — paling kritis (ada logic insert/upsert yang tidak boleh tersenggol)
4. `app/dashboard/page.tsx`
5. `app/kelas/page.tsx`
6. `app/reports/page.tsx`

Langkah 1 sengaja saya jadikan commit tersendiri karena mengubah token global
akan menggeser tampilan **semua** halaman sekaligus — jadi tidak mungkin
benar-benar "atomic per halaman" tanpa memisahkannya lebih dulu.

---

## 8. Catatan soal verifikasi screenshot

Brief meminta screenshot side-by-side GAS lama vs Next.js baru. Saya belum punya
kredensial login ke web app GAS maupun ke `ruang-ngaji.vercel.app`, jadi saya
belum bisa mengambil screenshot sisi lama. Dua opsi: Anda kirim screenshot
halaman GAS-nya, atau Anda beri akses login. Tanpa itu, verifikasi saya terbatas
pada pembandingan nilai CSS terhadap dokumen ini.
