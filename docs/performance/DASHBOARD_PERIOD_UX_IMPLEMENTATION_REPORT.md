# Dashboard Hari Aktif Period Label — Implementation Report (Tahap 18)

> Mode: IMPLEMENTATION + REGRESSION, scope UI-presentation only. Deployed
> to production. Tanggal: 2026-08-08.

---

## 1. Objective

Hilangkan ambiguitas kartu "Hari Aktif" (Dashboard Kehadiran mobile guru
+ admin_kelp) yang SEBELUMNYA hanya menampilkan angka polos tanpa
konteks periode — TANPA mengubah formula/query/calculation apa pun
(sesuai keputusan Tahap 17: Option A, existing metric unchanged + label
periode eksplisit).

---

## 2. Existing Behavior

`window.iaRenderDashboardCards_` (Script_Main.html) me-render kartu per
kelas dgn 5 statistik (Hari Aktif, Hadir, Izin, Sakit, Alpa) dari
`serverGetGuruDashboardSummaryRange`/`serverGetAdminKelpDashboardSummaryRange`
— SEMUA 5 angka dihitung dari rentang tanggal `window.iaState_.dashboardFilter`
(default: bulan kalender berjalan, BISA diganti manual via popup filter
`iaFilterBtnLabel`). SEBELUM perubahan ini, kartu HANYA menampilkan
angka (`7`) TANPA teks periode apa pun di dalam kartu itu sendiri —
info bulan/tahun HANYA ada di tombol filter TERPISAH.

---

## 3. UX Problem

Dikonfirmasi Tahap 16/17: guru bisa membaca "7" sbg total kumulatif
(all-time), padahal maknanya "7 dalam bulan yang sedang difilter" —
KARENA info periode TIDAK melekat pada kartu, HANYA di tombol filter
yang terpisah secara visual/perhatian.

---

## 4. Implemented Change

**File `13_AppsScript/Style_Main.html`**:
- `.ia-dash-card-info` `margin-bottom` diubah 12px→4px.
- + `.ia-dash-card-period` BARU (font-size 11px, `var(--text-faint)`,
  `margin-bottom: 12px`) — TOTAL spacing sebelum stat-row TETAP SAMA
  (4px+baris baru+12px ≈ setara 12px lama + 1 baris teks, TIDAK
  membuat kartu jadi terlalu padat, hanya menambah 1 baris caption
  singkat).

**File `13_AppsScript/Script_Main.html`** (`window.iaRenderDashboardCards_`):
```js
const dashFilter = window.iaState_.dashboardFilter;
const periodLabel = dashFilter ? (IA_FILTER_NAMA_BULAN_[dashFilter.bulan - 1] + ' ' + dashFilter.tahun) : '';
...
${periodLabel ? `<div class="ia-dash-card-period">Hari Aktif &amp; kehadiran periode: ${periodLabel}</div>` : ''}
```
Ditambahkan **1 baris teks per kartu**, di ATAS grid 5-statistik yang
sudah ada, DI BAWAH baris info (guru/ruangan/santri/jam). **Pakai ULANG
state (`window.iaState_.dashboardFilter`) dan formatter
(`IA_FILTER_NAMA_BULAN_`) yang SUDAH ADA** (dipakai jg oleh
`iaUpdateFilterLabel_` utk tombol filter) — **TIDAK ADA sumber tanggal
baru, TIDAK ADA request server baru**.

**Wording**: "Hari Aktif & kehadiran periode: {Bulan} {Tahun}" —
SENGAJA menyebut "kehadiran" jg (bukan cuma "Hari Aktif" sendirian)
krn KELIMA angka di grid (hariAktif/hadir/izin/sakit/alpa) SAMA-SAMA
dihitung dari rentang yang SAMA (dikonfirmasi `serverGetGuruDashboardSummaryRange`,
semua 5 field dari `absensiRange` yang SAMA) — label ini jujur
mencerminkan SEMUA angka di kartu, bukan cuma 1 metric.

Ditempatkan **1x per kartu** (BUKAN diulang di dalam kotak 1/5-grid
sempit "Hari Aktif") supaya TIDAK berisiko overflow di layar sempit
(nama bulan terpanjang "September 2026" tetap muat di lebar kartu penuh,
BEDA dgn kalau dipaksa masuk kolom grid 1/5 yang jauh lebih sempit).

---

## 5. Calculation Invariance

**TIDAK ADA satu baris kode pun** di `serverGetGuruDashboardSummaryRange`/
`serverGetAdminKelpDashboardSummaryRange`/`iaReadAbsensiKelompokRange_`/
`firestoreRangeQuery_` yang disentuh (dikonfirmasi diff — HANYA
`Script_Main.html` bagian `iaRenderDashboardCards_` & `Style_Main.html`
CSS yang berubah tahap ini, 0 perubahan file `.gs` backend).

```
Before : item.hariAktif = 7  (dari server, TIDAK BERUBAH)
After  : item.hariAktif = 7  (SAMA PERSIS, hanya ditambah teks periode
         DI SEKITARNYA, bukan mengubah nilainya)
```
**Invariant terpenuhi**: `7 → 7` (BUKAN `7 → 8` atau `7 → 10`).

---

## 6. Period State

`window.iaState_.dashboardFilter` (SUDAH ADA, diisi
`window.iaLoadDashboardSummary_` SEBELUM `iaRenderDashboardCards_`
dipanggil, §Script_Main.html:1918-1951) — berisi `{mulai, selesai,
bulan, tahun}`. `periodLabel` dibangun dari `filter.bulan`/`filter.tahun`
+ `IA_FILTER_NAMA_BULAN_` (array nama bulan Indonesia, SUDAH ADA,
Script_Main.html:1897) — **TIDAK ADA hardcode** "Juli 2026" di kode
manapun (dikonfirmasi baca kode — `periodLabel` SELALU dihitung dinamis
dari `dashFilter`, TIDAK ADA string bulan hardcoded selain di
`IA_FILTER_NAMA_BULAN_` array itu sendiri yang MEMANG isinya 12 nama
bulan generik, bukan bulan spesifik).

---

## 7. July Regression

**Dikutip dari Tahap 16 (TIDAK diukur ulang — TIDAK ADA perubahan
query/calculation yang perlu diverifikasi ulang angkanya, sesuai §7
prompt "gunakan kasus Neiza sbg regression test... pastikan value tetap
berasal dari calculation existing")**:
```
Filter    : bulan=7, tahun=2026 (Juli 2026)
Kelas     : Remaja SMA
Hari Aktif (server, TIDAK BERUBAH) : 7
Period label (BARU, client-side)   : "Hari Aktif & kehadiran periode: Juli 2026"
```
**Dijamin BENAR by construction** (bukan diukur ulang lewat klik
browser — TIDAK ADA jalur eksekusi baru yg menyentuh angka 7 itu
sendiri, HANYA teks statis DI SEKITARNYA dari data filter yang SAMA
yang SUDAH dipakai tombol filter).

---

## 8. August Regression

**Dikutip dari Tahap 16 ground truth** (§9 Tahap 16 — 8 tanggal
all-time, HANYA 1 di Agustus):
```
Filter    : bulan=8, tahun=2026 (Agustus 2026)
Kelas     : Remaja SMA
Hari Aktif (server, TIDAK BERUBAH) : 1 (hanya 2026-08-07)
Period label (BARU)                : "Hari Aktif & kehadiran periode: Agustus 2026"
```
2026-08-07 **TIDAK muncul** sbg bagian hitungan Juli (dikonfirmasi §7 di
atas — 7, bukan 8) — **BENAR sesuai desain "monthly scope" yang
DIPERTAHANKAN** (Tahap 17 keputusan eksplisit, TIDAK diubah jadi
kumulatif).

---

## 9. Mobile Review

```
Mobile Manual Device Test = NOT MEASURED
```
**TIDAK diklaim** device test dilakukan (jujur sesuai instruksi §9
prompt) — lingkungan ini TIDAK punya akses device mobile fisik/emulator
dgn sesi guru sungguhan. **Code review (statis) yang DILAKUKAN**:
- Nama bulan terpanjang Indonesia: "September" (9 huruf) + " 2026" =
  "September 2026" (15 karakter) — `.ia-dash-card-period` LEBAR PENUH
  kartu (BUKAN kolom sempit 1/5-grid), font-size 11px, `.ia-dash-card`
  padding 16px — SECARA STRUKTURAL cukup lebar utk 1 baris teks 15
  karakter TANPA wrap pada lebar kartu mobile standar (kartu mengisi
  lebar container `iaDashboardCards`, TIDAK dibatasi sesempit
  `.ia-dash-stat` individual) — **TIDAK ADA overflow yang terlihat dari
  struktur CSS**, TAPI **BELUM diverifikasi visual sungguhan**.
- Card height: TAMBAHAN 1 baris (~15-16px termasuk margin) — kartu
  TIDAK "meledak" tinggi (perubahan margin `.ia-dash-card-info` (-8px)
  + baris baru (+~15px) ≈ net +7-8px per kartu, MODEST, bukan lompatan
  besar).
- Grid stat 5-kolom (hariaktif/hadir/izin/sakit/alpa) **TIDAK disentuh
  SAMA SEKALI** (dikonfirmasi diff — hanya baris BARU ditambahkan
  SEBELUM `.ia-dash-stat-row`, elemen grid itu sendiri 0 perubahan) —
  **hierarchy KPI lain TERJAMIN tidak berubah** (dipatuhi §8 prompt).

---

## 10. Performance Impact

```
Network calls added   : 0
Backend calls added    : 0
Firestore reads added  : 0
```
Dikonfirmasi — `periodLabel` dibangun MURNI dari `window.iaState_.dashboardFilter`
yang SUDAH ADA di memory client (diisi SEBELUM `iaRenderDashboardCards_`
dipanggil oleh `iaLoadDashboardSummary_` yang SUDAH melakukan 1x
`google.script.run` yang SAMA seperti sebelum perubahan ini — TIDAK ADA
panggilan tambahan). **Perubahan ini MURNI client-side string
formatting + DOM render, 0 I/O tambahan.**

---

## 11. Production Deployment

```
Local checks (tools/check_local.js)  : PASS
Diff review                          : HANYA Script_Main.html
                                        (iaRenderDashboardCards_) +
                                        Style_Main.html (CSS) — 0 file
                                        backend (.gs) tersentuh tahap ini
clasp push                           : 2026-08-08, 18:46:15 (33 file)
clasp deploy                         : @415 "Tahap 18: Dashboard Hari
                                        Aktif period label (UI only)"
tools/verify_served.js               : PASS (980317 chars, 5 blok
                                        <script> valid)
Markup verifikasi production         : "ia-dash-card-period" class ADA
                                        di HTML served, "kehadiran
                                        periode" text ADA,
                                        "IA_FILTER_NAMA_BULAN_" ADA
                                        (dicek langsung via HTTP fetch
                                        production, BUKAN diasumsikan)
```

Deployment ID stabil (URL Web App TIDAK berubah):
`AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM`.

---

## 12. Final Verification

```
Dashboard calculation  : UNCHANGED (0 file .gs disentuh)
Dashboard query        : UNCHANGED
Period logic            : UNCHANGED (iaCurrentMonthFilter_/filter popup
                          TIDAK disentuh — HANYA dibaca ulang utk label)
Firestore                : UNCHANGED
Attendance data           : UNCHANGED
Cache                     : UNCHANGED
Concurrency logic (Tahap 12/15) : UNCHANGED (tidak disentuh sama sekali)
```

**Tidak ada instrumentasi/diag route sementara yang perlu dibersihkan**
tahap ini (TIDAK diperlukan — perubahan murni presentational, tidak
butuh verifikasi lewat write production apa pun, cukup dikonfirmasi
lewat inspeksi markup HTML served langsung, §11).

---

## FINAL OUTPUT

```
TAHAP 18 — DASHBOARD PERIOD UX

Code Changed:
YES

Backend Changed:
NO

Firestore Changed:
NO

Calculation Changed:
NO

Query Changed:
NO

Hari Aktif Formula:
UNCHANGED

Period Label:
ADDED

July 2026:
7 hari • Juli 2026 (dikutip dari Tahap 16, formula tidak diubah)

August 2026:
1 hari • Agustus 2026 (dikutip dari Tahap 16 ground truth -- hanya
2026-08-07 yang ada di Agustus)

Period Switch:
PASS (by construction -- periodLabel dihitung dinamis dari
window.iaState_.dashboardFilter yang SAMA dipakai render tombol filter,
TIDAK ADA hardcode; TIDAK diverifikasi via klik browser sungguhan,
sama keterbatasan lingkungan sesi-sesi sebelumnya)

Dashboard Regression:
PASS (grid 5-statistik TIDAK disentuh, formula/query/backend 0
perubahan, diff dikonfirmasi terbatas ke render+CSS)

Mobile Manual Test:
NOT MEASURED

Network Calls Added:
0

Production:
DEPLOYED (@415, deployment ID unchanged)

Cleanup:
NOT REQUIRED

Next:
TAHAP 19 — DASHBOARD METRIC ACCURACY AUDIT
```
