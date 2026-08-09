# Dashboard Metric Semantics UX Clarification (Tahap 20)

> Mode: IMPLEMENTATION + INVESTIGATION, scope terbatas ke label Persentase
> + Total Santri. Deployed to production. Tanggal: 2026-08-08.

---

## 1. Objective

Hilangkan 2 ambiguitas makna yang ditemukan Tahap 19 (formula BENAR,
TAPI maknanya berpotensi disalahpahami) — Persentase (dikira "tingkat
kehadiran akademik" padahal "komposisi status") dan Total Santri
(dikira "santri periode ini" padahal "roster saat ini, period-
independent") — **TANPA mengubah formula/angka SAMA SEKALI**, mengikuti
pola Tahap 18.

---

## 2. Persentase Existing Semantics (verifikasi ulang, TIDAK diubah)

```js
const totalCatatan = item.hadir + item.izin + item.sakit + item.alpa;
const pct = function (n) { return totalCatatan > 0 ? Math.round((n / totalCatatan) * 100) : 0; };
```
**Dikonfirmasi ULANG (Script_Main.html:2150-2151, TIDAK disentuh tahap
ini)**: formula AKTUAL = `status_count / (hadir+izin+sakit+alpa) × 100`
— **BUKAN** `Hadir/Total_Santri`, **BUKAN** `Hadir/(Total_Santri×Hari)`.
`Math.round()` dipakai (BUKAN floor/ceil/toFixed).

---

## 3. Persentase UX Problem

Formula = "dari SEMUA catatan yang PERNAH terisi dlm periode, berapa %
berstatus X" (**komposisi status**) — BUKAN "attendance rate" akademik
standar (yang biasanya `hadir / total_hari_sesi` atau
`hadir / total_santri`). Tanpa label, guru BISA membaca angka
persentase sbg "tingkat kehadiran kelas saya X%" — **SALAH PAHAM**,
sama pola dgn kasus Neiza (Hari Aktif sebelum Tahap 18).

**Rounding artifact** (§4 prompt) — dikonfirmasi ULANG lewat data real
Tahap 19 §14 (kelas Pra Remaja SMP, Agustus 2026): `38%+25%+0%+38% =
101%` (BUKAN 100%) — **MURNI kosmetik** (4 pembulatan independen,
fenomena matematis universal, BUKAN bug) — **TIDAK ditambahkan
tooltip terpisah "Persentase dibulatkan"** (dinilai TIDAK diperlukan
utk clarity setelah label komposisi ditambahkan — pengguna yang paham
"ini komposisi, bukan 1 angka tunggal" secara alami tidak akan
mengharapkan jumlah PERSIS 100%, konsisten instruksi §4 "jangan
implement jika tidak diperlukan").

---

## 4. Total Santri Existing Semantics (verifikasi ulang, TIDAK diubah)

```js
const summary = { kelas: kelas, total: santriIdsKelas.length, ... };
```
**Dikonfirmasi ULANG** (Modul_InputAbsen.gs:1069-1074, TIDAK disentuh
tahap ini): `santriIdsKelas` dihitung dari `santriAll.filter(kelas_ngaji
=== kelas ini)` — **SEBELUM** loop `absensiRange` diproses, **TIDAK
ADA filter tanggal apa pun** diterapkan. **Roster SAAT QUERY DIJALANKAN**
(current), **BUKAN** "santri yang assigned pada bulan yang dipilih" —
dikonfirmasi §5 Tahap 19, TIDAK ada perubahan sejak itu.

**TIDAK ADA kolom "status aktif/nonaktif"** di tabel `santri` yang
dicek fungsi ini (dikonfirmasi Tahap 19 §9d) — istilah **"Total Santri"
DIPERTAHANKAN** (BUKAN diganti "Santri Aktif", sesuai instruksi §6
prompt "jangan mengganti terminology jika status active tidak identik
dgn source query" — memang TIDAK ADA konsep "aktif" di query ini).

---

## 5. Total Santri UX Problem

Tanpa label, angka "N Santri" di baris info kartu terlihat SAMA formatnya
dgn info lain yang BERUBAH per-bulan (jam, ruangan) — guru BISA
mengharapkan angka ini IKUT BERUBAH saat filter bulan diganti (SAMA
pola miskonsepsi kasus Neiza), padahal formula-nya TIDAK terikat
tanggal SAMA SEKALI.

---

## 6. Implemented Labels

**File yang diubah: HANYA `Script_Main.html`** (`window.iaRenderDashboardCards_`)
— **0 file CSS baru** (reuse class `.ia-dash-card-period` yang SUDAH
ADA dari Tahap 18, styling identik — TIDAK ada CSS baru ditambahkan
tahap ini).

### Total Santri
```diff
- infoParts.push(item.total + ' Santri');
+ infoParts.push(item.total + ' Santri (saat ini)');
```
Muncul di baris info kartu YANG SUDAH ADA (`.ia-dash-card-info`,
digabung dgn ruangan/jam via ` · `) — **TIDAK diberi format
"N Santri • Bulan Tahun"** (dipatuhi §7 prompt — metric ini TIDAK
period-scoped, format period-label TIDAK dipaksakan ke sini).

### Persentase
```diff
  ${periodLabel ? `<div class="ia-dash-card-period">Hari Aktif &amp; kehadiran periode: ${periodLabel}</div>` : ''}
+ <div class="ia-dash-card-period">Persentase = komposisi status, bukan tingkat kehadiran</div>
  <div class="ia-dash-stat-row">
```
Baris caption BARU, 1x per kartu (BUKAN diulang per kotak grid sempit),
posisi DI ATAS grid 5-statistik (SAMA prinsip Tahap 18 — hindari
overflow di kolom 1/5-grid sempit). **Tidak memakai label kandidat
"Komposisi Kehadiran"/"Status Kehadiran" sbg HEADER GANTI** (yang akan
butuh restrukturisasi grid 5-kolom existing — risiko "redesign") —
sebagai gantinya dipakai **kalimat penjelas singkat SEBAGAI CAPTION**,
lebih aman scr struktural TAPI tetap memenuhi tujuan §3 prompt
("guru harus memahami komposisi status, bukan 1 angka tingkat
kehadiran") — kata **"Tingkat Kehadiran" SENGAJA TIDAK dipakai sbg
LABEL METRIC** (dipatuhi larangan eksplisit §3 prompt), HANYA muncul
dlm kalimat NEGASI ("bukan tingkat kehadiran") utk kontras makna.

---

## 7. Calculation Invariance

```
Before : item.hariAktif=7, item.total=2/7 (tergantung kelas), item.hadir/
         izin/sakit/alpa = angka server, pct()=hasil formula existing
After  : SEMUA angka DI ATAS SAMA PERSIS -- 0 baris kode
         server (.gs) disentuh, 0 formula client (`pct`, `totalCatatan`)
         disentuh -- HANYA teks string BARU ditambahkan/digabung DI
         SEKITAR angka yang SAMA
```
Dikonfirmasi via diff: **HANYA `Script_Main.html`, HANYA di dalam
`.map()` template literal `iaRenderDashboardCards_`** — 0 file `.gs`
tersentuh (dikonfirmasi `git diff --stat`, Modul_InputAbsen.gs/
Modul_MaintainAbsensi.gs/Modul_Utilities.gs = 0 perubahan baru sejak
Tahap 15).

---

## 8. Neiza Regression

```
Guru      : Neiza (guru_id=22), Kelas Remaja SMA
Filter    : Juli 2026
Hari Aktif : 7 (TIDAK BERUBAH — dikutip Tahap 16/18/19, formula HariAktif
             TIDAK disentuh tahap ini sama sekali)
Period label (Tahap 18) : "Hari Aktif & kehadiran periode: Juli 2026"
             (TIDAK BERUBAH, baris kode-nya utuh, HANYA baris BARU
             ditambahkan SETELAHNYA)
Total Santri : 7 (jumlah santri Remaja SMA, dikonfirmasi Tahap 16 §7 —
             7 santri: id 205,217,218,224,227,228,229) → tampil
             "7 Santri (saat ini)" (angka SAMA, label BARU ditambahkan)
Persentase   : dari data raw Tahap 16 (§9): 8 dokumen dlm rentang Juli
             utk 1 santri overlap [santri Remaja SMA lain jg punya
             banyak dokumen -- TIDAK dihitung ulang detail di sini krn
             DI LUAR cakupan verifikasi (angka pct() TIDAK disentuh,
             HANYA labelnya) -- caption BARU "Persentase = komposisi
             status, bukan tingkat kehadiran" tampil DI ATAS grid
             hadir/izin/sakit/alpa Neiza TANPA mengubah angka-angkanya]
Hadir/Izin/Sakit/Alpa : SEMUA angka TIDAK BERUBAH (0 baris formula
             disentuh)
```
**PASS** — SEMUA nilai numerik Neiza TETAP SAMA, HANYA label/caption
BARU yang tampil.

---

## 9. Mobile Review

```
Mobile Manual Device Test = NOT MEASURED
```
**Code review statis dilakukan**:
- "N Santri (saat ini)" — tambahan 10 karakter ke baris `.ia-dash-card-info`
  yang SUDAH FLOW TEXT (bukan grid sempit), font-size 12.5px, lebar
  penuh kartu — risiko overflow RENDAH (baris ini SUDAH biasa memuat
  teks lebih panjang, mis. "Kak {namaGuru} · {ruangan} · N Santri ·
  jam–jam · Durasi N Menit").
- "Persentase = komposisi status, bukan tingkat kehadiran" (54 karakter)
  — DI DALAM `.ia-dash-card-period` yang SUDAH diverifikasi Tahap 18
  cukup lebar utk 1 baris teks pendek (kartu penuh, BUKAN kolom
  1/5-grid) — SECARA STRUKTURAL AMAN, TAPI BELUM diverifikasi visual
  sungguhan.
- Card height: **+1 baris tambahan** (`.ia-dash-card-period` kedua,
  ~15-16px termasuk margin) — DI ATAS penambahan Tahap 18 (yang jg +1
  baris) — TOTAL kartu SEKARANG +2 baris dari SEBELUM Tahap 18 (BUKAN
  cuma +1) — **dicatat sbg observasi jujur**, kartu SEDIKIT lebih
  tinggi drpd sebelum seri klarifikasi UX ini dimulai, TAPI masih
  MODEST (2 baris caption pendek, BUKAN redesign besar).
- Grid 5-statistik (`.ia-dash-stat-row` & isinya) **TIDAK disentuh SAMA
  SEKALI** (dikonfirmasi diff) — hierarchy KPI (ukuran angka,
  urutan, warna) **TIDAK berubah**.

---

## 10. Performance Impact

```
Network Calls Added   : 0
Firestore Reads Added  : 0
Backend Calls Added     : 0
```
Dikonfirmasi — `periodLabel`/caption komposisi/`item.total` SEMUA dari
data yang **SUDAH ADA** di response `serverGetGuruDashboardSummaryRange`
yang SAMA (1x panggilan, TIDAK BERTAMBAH) + state client
`window.iaState_.dashboardFilter` (SUDAH ADA sejak Tahap 18). **Murni
client-side string formatting.**

---

## 11. Class Transfer Risk — Deferred

**TIDAK DIPERBAIKI tahap ini** (dipatuhi §13 prompt eksplisit). Temuan
Tahap 19 §16 (dokumen absensi tidak menyimpan `kelas`, atribusi SELALU
dari `kelas_ngaji` TERKINI — berpotensi retroaktif salah-atribusi kalau
santri pindah kelas) **TETAP sbg risiko STRUKTURAL, BELUM TERBUKTI
terjadi** — **TIDAK ADA perubahan schema/query/cara-simpan-attendance**
dibuat tahap ini utk mengantisipasinya. Dicatat sbg **Future
Investigation**, direkomendasikan jadi fokus Tahap 21 (`TAHAP 21 —
CLASS TRANSFER HISTORICAL ATTRIBUTION AUDIT`).

---

## 12. Production Verification

```
Local checks (tools/check_local.js)   : PASS
Diff review                            : HANYA Script_Main.html
                                          (iaRenderDashboardCards_) — 0
                                          file backend (.gs), 0 file CSS
                                          baru (reuse class Tahap 18)
clasp push                             : 2026-08-08, 19:04:30 (33 file)
clasp deploy                           : @416 "Tahap 20: Dashboard
                                          Persentase + Total Santri
                                          semantics labels (UI only)"
tools/verify_served.js                 : PASS (980481 chars, 5 blok
                                          <script> valid)
Markup verifikasi production           : "Santri (saat ini)" ADA di HTML
                                          served, "komposisi status,
                                          bukan tingkat kehadiran" ADA
                                          (dicek langsung via HTTP fetch
                                          production, BUKAN diasumsikan)
```

Deployment ID stabil (URL Web App TIDAK berubah):
`AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM`.

**Tidak ada instrumentasi/diag route sementara** yang perlu dibersihkan
(perubahan murni presentational, diverifikasi via inspeksi markup HTML
served langsung).

---

## FINAL OUTPUT

```
TAHAP 20 — DASHBOARD METRIC SEMANTICS UX

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

Hari Aktif:
UNCHANGED

Persentase Formula:
UNCHANGED

Persentase Semantics:
CLARIFIED ("Persentase = komposisi status, bukan tingkat kehadiran")

Total Santri Formula:
UNCHANGED

Total Santri Semantics:
CLARIFIED ("N Santri (saat ini)")

Neiza Regression:
PASS (semua angka tetap sama, hanya label baru muncul)

Mobile:
NOT MEASURED (code review statis dilakukan, tidak ada device test
sungguhan)

Network Calls Added:
0

Production:
DEPLOYED (@416, deployment ID unchanged)

Class Transfer Risk:
DEFERRED

Next:
TAHAP 21 — CLASS TRANSFER HISTORICAL ATTRIBUTION AUDIT
```
