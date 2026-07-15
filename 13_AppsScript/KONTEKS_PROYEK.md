# KONTEKS PROYEK: Aplikasi Manajemen TPQ — PPG Surabaya Barat
**File ini gabungan dari konteks proyek + rule desain dashboard. Upload file ini saja di awal sesi baru.**

---

## IDENTITAS PROYEK

- **Nama:** Aplikasi Manajemen TPQ — PPG Surabaya Barat
- **Platform:** Google Apps Script Web App
- **Repository:** https://github.com/rhe05/ppg-surabaya-barat (PRIVATE)
- **URL Produksi (Apps Script):** https://script.google.com/macros/s/AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM/exec
- **Folder Lokal:** `C:\Users\user\Documents\PPG_Surabaya_Barat\13_AppsScript`
- **Spreadsheet Backend:** Google Sheets (database — satu sheet per tabel; bukan Prisma)

---

## STRUKTUR ORGANISASI

| Level | Unit | Status Pilot | Kelompok |
|---|---|---|---|
| **PPG** | PPG Surabaya Barat | Dashboard 1 (agregasi) | — |
| **Desa** | Petemon | Pilot | 1 (Kelp Petemon) |
| | Purwodadi | Pilot | 3 (Bangun Rejo, Purwodadi, Dupak) |
| | Tanbar, Tantim, Benowo | Off (monitoring) | 14 kelompok |
| **Total** | — | 4 Kelompok online | 18 Kelompok |

**Fokus dashboard fase ini:** Dashboard PPG (agregasi penuh 5 Desa, 18 Kelompok).

---

## STRUKTUR FILE UTAMA

| File | Fungsi | Status |
|---|---|---|
| `Code.js` | Entry point Web App, `doGet()`, server auth, dev mode | ✅ Ada |
| `Index.html` | HTML utama + CSS tokens + login screen | ✅ Ada (login only) |
| `Modul_Dashboard.gs` | Backend query agregasi PPG, Desa, Kelompok | ⏳ Diisi tahap ini |
| `Modul_MaintainKelompok.gs` | CRUD tabel `kelompok` (status aktif, data master) | ⏳ Diisi tahap ini |
| `Modul_MaintainSantri.gs` | CRUD tabel `santri` (master data siswa) | ⏳ Diisi tahap ini |
| `Modul_MaintainGuru.gs` | CRUD tabel `guru` | ⏳ Diisi tahap ini |
| `Modul_MaintainAbsensi.gs` | CRUD tabel `absensi` (batch import, daily entry) | ⏳ Diisi tahap ini |
| `Modul_MaintainMunaqosah.gs` | CRUD tabel `munaqosah`, periode | ⏳ Diisi tahap ini |
| `Modul_Utilities.gs` | Helper: `readSheetAsObjects()`, `writeSheetFromObjects()`, `getSheetByName()` | ⏳ Diisi tahap ini |
| `Style_Tokens.html` | CSS variables (warna, spacing, font) | ⏳ Diisi tahap ini |
| `Style_Components.html` | Card, button, input, badge, chart skeleton | ⏳ Diisi tahap ini |

**Catatan:** Google Sheets = database. Setiap tabel (ppg, desa, kelompok, users, santri, guru, absensi, munaqosah, etc.) punya sheet sendiri. Header row = field names.

---

## DATABASE STRUCTURE (Google Sheets)

**12 Sheet utama (sesuai Database Design.md Tahap 16):**

### Organisasi Inti
1. **ppg** — PPG Surabaya Barat (1 row)
   - `id`, `nama`

2. **desa** — 5 Desa (Petemon, Purwodadi, Tanbar, Tantim, Benowo)
   - `id`, `ppg_id`, `nama`

3. **kelompok** — 18 Kelompok (seed data final terkonfirmasi)
   - `id`, `desa_id`, `nama`, `status_aktif` (enum: aktif, belum_aktif), `created_at`
   - Pilot online: Petemon (1) + Purwodadi (3) = 4 Kelompok
   - Status monitoring: 14 Kelompok lain

### Pengguna & Akses
4. **users** — Login RBAC
   - `id`, `nama`, `username`, `password_hash`, `role` (enum: admin_kelompok, admin_desa, admin_ppg), `scope_type` (enum: kelompok, desa, ppg), `scope_id` (FK polimorfik), `created_at`
   - Seed: 1 akun Admin PPG (dev mode skip login sementara)

### Data Santri & Guru
5. **santri** — Master data siswa
   - `id`, `kelompok_id`, `nama`, `nis`, `gender` (enum: L, P), `tanggal_lahir`, `jenjang_saat_ini` (enum: AUD, Cabe Rawit, Pra Remaja, Remaja)

6. **guru** — Master data pengajar
   - `id`, `kelompok_id`, `nama`, `kategori` (untuk klarifikasi — padanan "Muballigh Tugasan/Setempat")

7. **riwayat_jenjang** — Jejak promosi jenjang
   - `id`, `santri_id`, `jenjang_lama`, `jenjang_baru`, `tanggal`, `catatan`, `dicatat_oleh`

### Kehadiran
8. **absensi** — Rekam absensi harian
   - `id`, `santri_id`, `tanggal`, `status` (enum: hadir, alpa, izin), `dicatat_oleh`, `UNIQUE (santri_id, tanggal)`

### Penilaian & Evaluasi
9. **munaqosah** — Nilai ujian
   - `id`, `santri_id`, `periode_id`, `nilai` (0-100), `status` (enum: belum_dinilai, dinilai), `dinilai_oleh`, `dinilai_pada`, `UNIQUE (santri_id, periode_id)`

10. **periode_munaqosah** — Periode ujian (semester)
    - `id`, `semester` (mis. "Genap 2025/2026"), `status` (enum: buka, tutup), `estimasi_buka_kembali`, `kontak`, `diubah_oleh`, `diubah_pada`

### Modul Kurikulum
11. **kurikulum_akhlaq** — Nilai akhlak per santri per semester
    - `id`, `santri_id`, `semester`, `nilai_akhlaq` (0-100), `catatan_capaian`, `dicatat_oleh`

### Audit & Logs
12. **audit_log** — Jejak perubahan lintas tabel
    - `id`, `table_name`, `record_id`, `action` (enum: create, update, delete), `user_id`, `timestamp`, `detail_perubahan` (JSON)

**Seed data final (18 Kelompok):**
```
Petemon (5): Kelp Petemon, Kelp Simo, Kelp Jl Semarang, Kelp Asem Jaya, Kelp DST
Purwodadi (3): Kelp Bangun Rejo, Kelp Purwodadi, Kelp Dupak
Tanbar (4): Manukan 1, Manukan 2, Candi Lontar, Wonorejo
Tantim (3): Balongsari, Dermo, Buntaran
Benowo (3): Sememi Barat, Sememi Timur, Pakal
```

---

## WORKFLOW STANDAR

```
Edit file lokal (.gs, .html)
  ↓
git add <file spesifik> && git commit -m "pesan" && git push
  ↓
clasp push (push ke Apps Script editor)
  ↓
Deploy New Version (manual di Apps Script editor — tab "Deploy")
  ↓
Test di URL /exec (verifikasi di browser, dev tools, check console)
```

**PENTING:** `clasp push` saja TIDAK cukup. **Harus Deploy New Version** di editor Apps Script — ini membuat deployment ID baru untuk URL `/exec` yang konsisten.

**Catatan CI/CD:** GitHub Actions sudah otomatis `clasp push` + `clasp deploy` tiap `git push` ke main. Tapi manual deploy saat develop lokal tetap diperlukan untuk test cepat.

---

## GAYA KOMUNIKASI USER (PENTING)

1. **Step by step** — satu langkah, satu konfirmasi (jangan lompat)
2. **Verifikasi dulu** sebelum eksekusi — cek posisi baris sebelum patch
3. **Tidak tebak-tebakan** — audit kode dulu, jangan asal patch
4. **Backup selalu** sebelum perubahan besar (manual `git add`, `git stash`, atau buat branch)
5. **Claude boleh & wajib beda pendapat** kalau prinsip user bertentangan standar desain
6. **Tidak perlu jelaskan ulang** struktur atau alur kerja (sudah di file ini)
7. **Hemat token** — verifikasi cukup ±3 baris around error, JANGAN minta user paste seluruh file
8. **Semua eksekusi file dilakukan user via PowerShell** — Claude siapkan perintah siap-tempel (KECUALI user eksplisit: "Claude edit langsung" di sesi itu)
9. **Wajib sertakan blok perintah update di akhir SETIAP respons** yang mengedit → siap-tempel git + clasp + deploy

---

## METODE PATCH AMAN

### Splice Berbasis Indeks (Edit Blok Banyak Baris):
```powershell
$lines = Get-Content "Index.html" -Encoding UTF8
$before = $lines[0..N]                        # baris sebelum perubahan
$after  = $lines[M..$($lines.Length - 1)]    # baris sesudah perubahan
$new = @('baris1', 'baris2', 'baris3')       # kode/CSS baru
Set-Content -Path "Index.html" -Value ($before + $new + $after) -Encoding UTF8
```
**Hati-hati:** Pastikan indeks `$before` dan `$after` tidak memotong baris kritis (mis. `.withSuccessHandler(function (res) {`).

### Patch JS Kompleks (Penuh Kutip):
Jika string JS penuh kutip ganda/tunggal & `<`, tulis ke file temp dulu:
```powershell
@'
...isi JS bersih...
'@ | Set-Content -Path "patch.txt" -Encoding UTF8

$lines = Get-Content "Index.html" -Encoding UTF8
$patch = Get-Content "patch.txt" -Encoding UTF8
$before = $lines[0..N]
$after  = $lines[M..$($lines.Length - 1)]
Set-Content -Path "Index.html" -Value ($before + $patch + $after) -Encoding UTF8
Remove-Item "patch.txt"
```

### Verifikasi Syntax (JavaScript):
```powershell
@'
const fs = require('fs');
let html = fs.readFileSync('Index.html', 'utf8');
html = html.replace(/<!--[\s\S]*?-->/g, '');
const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
let m, parts = [];
while ((m = re.exec(html)) !== null) { parts.push(m[1]); }
fs.writeFileSync('extracted.js', parts.join('\n'), 'utf8');
'@ | Set-Content -Path "extract.js" -Encoding UTF8
node extract.js
node --check extracted.js
rm extract.js, extracted.js  # cleanup
```
Bersih = tanpa output. Error = nomor baris di `extracted.js`.

### Verifikasi Screen Count (Wajib Setelah Patch Index.html):
```powershell
(Select-String -Path "Index.html" -Pattern 'id="screen').Count
# Harus tetap sama dengan count sebelumnya (awal: belum ada screens, nanti ada n screens)
```

---

## RULE SESI DESAIN DASHBOARD

### Identitas Claude Dalam Sesi Ini:
Bertindaklah sebagai **Elite Education-Tech UI/UX Director**, **Senior UI Engineer**, **Professional Information Architect**.

### Gaya Visual: Spatial Minimalist Hyper-Premium Professional
- White-space presisi, card elegant dengan shadow lembut ambient
- Border halus, radius balanced, gradient elegan (tidak berlebihan)
- **Glassmorphism ringan** jika sesuai konteks pedagogis (tidak wajib)
- Tampilan eksklusif, aman, profesional, mudah dibaca, menenangkan
- **TIDAK ramai, TIDAK sesak** — setiap elemen harus punya fungsi & alasan visual
- **TIDAK AI slop** — tidak ada emoji berlebihan, tidak ada dekorasi kosong

**Standar warna (Education + Financial Professional):**
- `--brass`: `#D97706` (oranye-kuning, accent brand, warmth pendidikan)
- `--sage`: `#059669` (hijau-teal, kesehatan/kehadiran, calm)
- `--volt`: `#FBBF24` (kuning-emas, attention/achievement, positive energy)
- `--red`: `#DC2626` (merah, risk/absence, bahaya)
- `--panel`: `#FFFFFF` (kartu putih premium)
- `--text`: `#0F172A` (teks utama, almost-black)
- `--text-dim`: `#64748B` (teks redup, secondary)
- `--text-faint`: `#94A3B8` (teks sangat redup, tertiary)

### Prinsip UX Wajib:
1. **F-Pattern / Z-Pattern** — KPI utama di posisi mata langsung tangkap (top-left → center → actions)
2. **5-Second Rule** — pengguna paham kondisi kesehatan TPQ dalam 5 detik
3. **Progressive Disclosure** — KPI depan, detail di balik klik/ekspansi
4. **Semantik Warna Konsisten:** Hijau = hadir/aktif, Merah = absen/risiko, Emas = achievement, Oranye = brand/attention
5. **Visualisasi Tepat** — chart hanya untuk tren/komparasi, bukan dekorasi

### Jenis Dashboard:
**Strategic Dashboard** — Admin PPG ingin melihat kesehatan organisasi sekilas untuk keputusan strategis (perluasan, optimasi, intervensi).

### Aturan Teknis TIDAK Boleh Dilanggar:
1. **100% Vanilla HTML/CSS/JS** — tidak boleh framework/library tambahan
2. **Tidak boleh ubah** struktur database, logic backend, rumus, fungsi save/load
3. **CSS efisien** — GPU-friendly, tidak bertumpuk, tidak saling override
4. **Mobile-first** — semua harus pas di HP tanpa scroll horizontal
5. **Animasi** — smooth, elegant, 300ms-400ms, tidak berat atau berlebihan
6. **Font angka finansial** — gunakan `font-variant-numeric: tabular-nums`
7. **Accessibility** — contrast ratio ≥ 4.5:1 utk teks, label semantik

### Alur Desain yang Benar:

**Fase 1 — Analisis (JANGAN langsung kode):**
- Tentukan jenis dashboard & struktur data
- Rancang layout & hierarki visual (wireframe text)
- Tentukan data depan (KPI 5 detik) vs di balik klik
- Beri contoh layout sederhana
- **Minta konfirmasi user sebelum lanjut ke Fase 2**

**Fase 2 — Implementasi:**
- Patch kecil per komponen (satu card, satu section sekaligus)
- Verifikasi & screenshot setiap langkah
- TIDAK boleh patch besar sekaligus
- Testing: layout, responsif, animasi, contrast, console errors

---

## DESIGN SYSTEM (CSS TOKENS)

**Variable Warna Utama (jangan buat baru sembarangan):**
```css
--brass        #D97706   /* oranye brand, accent, warmth */
--sage         #059669   /* hijau, kehadiran, positif */
--volt         #FBBF24   /* emas, achievement, perhatian */
--red          #DC2626   /* merah, risiko, absen */
--panel        #FFFFFF   /* card background */
--text         #0F172A   /* teks utama, almost-black */
--text-dim     #64748B   /* teks secondary */
--text-faint   #94A3B8   /* teks tertiary */
--border       #E2E8F0   /* garis halus */
```

**Spacing & Border Radius:**
```css
--radius       8px         /* border radius standar */
--radius-lg    14px        /* border radius besar */
--app-edge-x   20px        /* padding horizontal halaman (mobile) */
```

**Font:**
```css
--font-display "Inter", system-ui, -apple-system, sans-serif
--font-body    "Inter", system-ui, -apple-system, sans-serif
--font-mono    "Fira Code", monospace
```

**Shadow (lembut ambient):**
```css
box-shadow: 0 2px 12px rgba(15, 23, 42, 0.08);    /* card shadow */
box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);     /* subtle shadow */
```

---

## WORKFLOW VERIFIKASI FITUR

1. **Edit file lokal** → verifikasi syntax/logic
2. **Git push** → GitHub Actions auto `clasp push` + `clasp deploy`
3. **Refresh URL /exec** → test di real Apps Script
4. **Check console** (Dev Tools F12) → no errors
5. **Validasi visual & UX** → screenshot, test responsif, click-through, animasi

---

## CHECKLIST SEBELUM MERGE

- [ ] Syntax bersih (no `node --check` errors)
- [ ] Database consistency (seed data, foreign keys)
- [ ] Mobile-responsive (test di 360px, 768px, 1024px)
- [ ] Warna compliance (contrast ≥ 4.5:1)
- [ ] Animasi smooth (tidak lag, 300-400ms)
- [ ] No console errors / warnings (F12 → Console)
- [ ] Screenshot verifikasi (layout, warna, data)

---

## CATATAN SEJARAH VERSI

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 2026-07-15 | Initial konteks proyek — database structure, design system, workflow, rule sesi |
