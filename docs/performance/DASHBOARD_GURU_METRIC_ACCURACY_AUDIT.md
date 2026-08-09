# Dashboard Guru — Metric Accuracy Audit (Tahap 19)

> Mode: **INVESTIGATION ONLY**. Tidak ada kode/Firestore/cache/UI diubah,
> tidak ada deploy, tidak ada data test production ditulis. Semua angka
> "second test case" diperoleh via diag route READ-ONLY yang SUDAH ADA
> (`?diag=listkelompok`, permanent). Tanggal: 2026-08-08. Lanjutan dari
> Tahap 16-18.

---

## 1. Executive Summary

Dashboard Guru (mobile, `iaDashboardView` non-`admin_kelp`) **HANYA
memiliki 1 sumber data per kartu kelas** — `serverGetGuruDashboardSummaryRange`
(Modul_InputAbsen.gs:1048-1093) — yang menghasilkan **6 metric**: Hari
Aktif, Total Santri, Hadir, Izin, Sakit, Alpa (+ Persentase turunan dari
4 status). **SEMUA metric attendance (Hari Aktif/Hadir/Izin/Sakit/Alpa)
BERASAL DARI SUMBER & PERIODE YANG SAMA PERSIS** (1 query, 1 rentang
tanggal) — TIDAK ADA metric yang diam-diam pakai periode/sumber
BERBEDA. **Total Santri TERPISAH** — bukan dari attendance, PERIODE-
INDEPENDEN (snapshot roster SAAT INI, bukan "santri yang ada di kelas
pada bulan yang dipilih").

**Klasifikasi akhir** (§15): **5 metric VERIFIED CORRECT/CORRECT BY
DESIGN**, **0 calculation bug ditemukan**, **1 temuan struktural BARU**
(bukan bug yang SUDAH terjadi, tapi risiko nyata) — attendance record
TIDAK menyimpan `kelas` pada dokumennya sendiri, jadi kalau santri
pindah kelas, riwayat attendance-nya SECARA RETROAKTIF ikut pindah
kepemilikan kartu (Filter Risk, kategori E) — **TIDAK terbukti terjadi
di kasus Neiza**, dicatat sbg risiko struktural utk masa depan.

Ditemukan jg **1 anomali data kualitas** (BUKAN bug Dashboard): 2 baris
`users` berbeda (id=2 dan id=4) SAMA-SAMA memetakan ke `guru_id=21`
("Baban Achmad Intiyas") — TIDAK mempengaruhi akurasi metric Dashboard
(formula TIDAK memakai `dicatat_oleh`), TAPI dicatat sbg temuan
tersendiri.

**Neiza regression: PASS** (Hari Aktif=7, Juli 2026, dikonfirmasi ulang
dari data production TERKINI, TIDAK berubah sejak Tahap 16). **Second
test case (kelas Pra Remaja SMP, guru Baban Achmad Intiyas)**: formula
diverifikasi KONSISTEN pada data BERBEDA, TIDAK dipilih krn hasilnya
"pas" (dijelaskan §14).

---

## 2. Dashboard Metric Inventory

| Metric | UI Element | Source Function | Source | Period | Formula |
|---|---|---|---|---|---|
| Hari Aktif | `.ia-dash-stat.hariaktif .ia-dash-stat-num` | `serverGetGuruDashboardSummaryRange` | Firestore `kelompok/1/absensi` | `dashboardFilter.mulai..selesai` (default bulan berjalan) | `COUNT(DISTINCT tanggal)` dari record santri kelas ini dlm rentang, APAPUN status |
| Total Santri | `.ia-dash-card-info` (teks "{N} Santri") | `serverGetGuruDashboardSummaryRange` | Firestore/Sheets `santri` (via `iaReadKelompokTablesParallel_`) | **TIDAK ADA** (snapshot roster SAAT query dijalankan, BUKAN period-scoped) | `COUNT(santri WHERE kelas_ngaji=kelas ini)` |
| Hadir | `.ia-dash-stat.hadir .ia-dash-stat-num` | `serverGetGuruDashboardSummaryRange` | Firestore `absensi` | SAMA dgn Hari Aktif | `COUNT(record WHERE status='hadir')` dlm rentang, kelas ini |
| Izin | `.ia-dash-stat.izin .ia-dash-stat-num` | idem | idem | idem | `COUNT(record WHERE status='izin')` |
| Sakit | `.ia-dash-stat.sakit .ia-dash-stat-num` | idem | idem | idem | `COUNT(record WHERE status='sakit')` |
| Alpa | `.ia-dash-stat.alpa .ia-dash-stat-num` | idem | idem | idem | `COUNT(record WHERE status='alpa')` |
| Persentase (per status) | `.ia-dash-stat-percent` (di bawah tiap angka Hadir/Izin/Sakit/Alpa) | client-side, `window.iaRenderDashboardCards_` | turunan dari 4 angka status di atas (TIDAK query baru) | SAMA dgn induknya | `round(status_count / (hadir+izin+sakit+alpa) × 100)` — **BUKAN** dibagi Total Santri |
| Period Label (Tahap 18) | `.ia-dash-card-period` | client-side, `window.iaRenderDashboardCards_` | `window.iaState_.dashboardFilter` (state client, BUKAN query baru) | N/A (presentation) | String format `{namaBulan} {tahun}` |

**Tidak ada metric lain** di Dashboard Guru (role `guru`, BUKAN
`admin_kelp`) — 7-kartu-KPI (`Total Kelas`/`Kls Cbr`/dst.) HANYA muncul
utk `admin_kelp` (dikonfirmasi markup "khusus Admin Kelp",
Markup_Screens.html:276), TIDAK ditampilkan sama sekali di layar guru
biasa.

---

## 3. Metric Data Flow

**Chain TUNGGAL utk 5 metric attendance** (Hari Aktif/Hadir/Izin/Sakit/
Alpa/Persentase) — SEMUA dari 1 fetch, TIDAK ADA fetch terpisah per
metric:

```
UI (kartu kelas, Dashboard Kehadiran guru)
  ↓
window.iaLoadDashboardSummary_ (Script_Main.html:1918)
  ↓
filter = window.iaState_.dashboardFilter || iaCurrentMonthFilter_()
  ↓
google.script.run.serverGetGuruDashboardSummaryRange(token, filter.mulai, filter.selesai)
  ↓
Modul_InputAbsen.gs:1048 requireGuruContext_ → iaReadKelompokTablesParallel_
  ([JADWAL_KBM, GURU, SANTRI]) → getKelasOwnedByGuru_(kelompokId, guruId)
  → iaReadAbsensiKelompokRange_(kelompokId, santriAll.ids, mulai, selesai)
  ↓
iaReadAbsensiKelompokRange_ → firestoreRangeQuery_('absensi','tanggal',mulai,selesai)
  → firestoreRunQuery_ (structured query, filter DI Firestore)
  ↓
per kelas: loop absensiRange → filter santriIdsKelas → akumulasi
  hadir/izin/sakit/alpa (COUNT records) + tanggalDiisi (COUNT DISTINCT tanggal)
  ↓
return { data: [{kelas, total, hadir, izin, sakit, alpa, hariAktif, ...}] }
  ↓
window.iaRenderDashboardCards_(result.data) → render kartu, HITUNG
  pct() client-side dari 4 angka status (TIDAK query baru), + periodLabel
  (Tahap 18, dari state client) → DOM
```

`Total Santri` (`item.total`) dihitung DI FUNGSI SERVER YANG SAMA
(1 request yang sama), TAPI dari `santriIdsKelas.length` — **DIHITUNG
SEBELUM loop `absensiRange`**, TIDAK terpengaruh rentang tanggal
(§9 detail).

---

## 4. Period Consistency

```
Hari Aktif   : Period = filter.mulai..filter.selesai (default bulan berjalan)
Hadir        : Period = SAMA PERSIS (1 query yang sama)
Izin         : Period = SAMA PERSIS
Sakit        : Period = SAMA PERSIS
Alpa         : Period = SAMA PERSIS
Persentase   : Period = SAMA (turunan, tidak query ulang)
Total Santri : Period = TIDAK ADA (roster SAAT INI, independen tanggal)
```

**Ditemukan 1 metric dgn period BERBEDA dari yang lain** (`Total
Santri`) — **INI ADALAH DESAIN, BUKAN BUG** (dikonfirmasi kode:
`santriIdsKelas` dihitung SEBELUM `absensiRange` diproses, TIDAK ADA
filter tanggal diterapkan padanya SAMA SEKALI) — masuk akal SECARA
PRODUK (jumlah santri terdaftar TIDAK seharusnya berubah tiap ganti
filter bulan, itu representasi ROSTER bukan AKTIVITAS) — **TAPI**
berpotensi membingungkan guru dgn cara YANG MIRIP kasus Neiza kalau
tidak disadari — dicatat sbg **kandidat UX tahap depan** (§17), BUKAN
diperbaiki sekarang.

**Inklusif/eksklusif**: `firestoreRangeQuery_` SELALU inklusif kedua
ujung (`GREATER_THAN_OR_EQUAL`/`LESS_THAN_OR_EQUAL`, dikonfirmasi Tahap
16 §8, TIDAK berubah).

**Timezone**: TIDAK ADA perbedaan timezone ANTAR metric (SEMUA pakai
string 'yyyy-MM-dd' murni, TIDAK ADA objek Date lintas-metric — SAMA
kesimpulan Tahap 16 §14, berlaku utk SEMUA metric krn semuanya lewat
`iaReadAbsensiKelompokRange_` yang SAMA).

---

## 5. Data Source Consistency

| Metric | Source | Collection/Sheet | Cache | Freshness |
|---|---|---|---|---|
| Hari Aktif | Firestore | `kelompok/1/absensi` | **TIDAK ADA** (dikonfirmasi Tahap 16 §5, `absensi` sengaja TIDAK di `IA_KELOMPOK_TABLE_CACHE_KEY_`) | SELALU real-time (baca langsung tiap request) |
| Hadir/Izin/Sakit/Alpa | Firestore | `kelompok/1/absensi` | TIDAK ADA | SELALU real-time |
| Persentase | (turunan client) | — | Client-side murni (bukan cache server, hasil hitung ulang tiap render) | Selalu sinkron dgn 4 angka status di atas (1 render pass) |
| **Total Santri** | Firestore/Sheets | `kelompok/1/santri` (via `iaReadKelompokTablesParallel_` → `IA_KELOMPOK_TABLE_CACHE_KEY_.santri`) | **YA — TTL 300 detik (5 menit)** | **BISA STALE hingga 5 menit** kalau santri BARU ditambah/dipindah kelas oleh admin sesaat sebelum guru buka Dashboard |

**Temuan BARU §5**: `Total Santri` adalah **SATU-SATUNYA** dari 6
metric yang melalui cache (`IA_KELOMPOK_TABLE_CACHE_KEY_.santri`,
TTL 300s) — SEMUA metric attendance TIDAK PERNAH cache. Ini KONSISTEN
dgn desain umum project (santri = tabel MASTER, boleh cache; absensi =
time-series, TIDAK boleh cache — sesuai "Prinsip Performa Firestore"
CLAUDE.md) — **BUKAN bug**, TAPI relevan dicatat sbg PERBEDAAN
freshness antar metric yang tampil BERSAMAAN di 1 kartu.

---

## 6. Guru Identity Mapping

```
requireGuruContext_(token) → getCurrentUser(token) → user.guru_id
  (kolom `users.guru_id`, BUKAN `users.id`)
serverGetGuruDashboardSummaryRange: ctx.user.guruId → getKelasOwnedByGuru_(
  kelompokId, ctx.user.guruId, jadwalRowsAll) → filter jadwal_kbm.guru_id == guruId
```
**KONSISTEN di SELURUH chain** — `guru_id` (BUKAN `users.id`) dipakai
SAMA PERSIS di `getKelasOwnedByGuru_`/`getKelasSessionInfo_`/
`getAllKelasInKelompok_` (dikonfirmasi baca kode ketiga fungsi ini,
Modul_InputAbsen.gs:209-223, 231-250, 1268+) — **TIDAK DITEMUKAN
mismatch** `users.id` vs `guru_id` di jalur Dashboard Guru.

**TEMUAN TERPISAH (data quality, BUKAN bug Dashboard)**: `users.id=2`
DAN `users.id=4` **SAMA-SAMA** memetakan ke `guru_id=21` ("Baban Achmad
Intiyas") — **2 akun login BERBEDA utk 1 guru yang SAMA**. Dikonfirmasi
lewat data `dicatat_oleh` kelas Pra Remaja SMP: tanggal 07-13 & 08-03
dicatat `dicatat_oleh=2`, tanggal 08-04/05/07 dicatat `dicatat_oleh=4`
— **KEDUANYA guru yang SAMA (Baban), login dari 2 akun BERBEDA di
waktu BERBEDA**. **TIDAK MEMPENGARUHI akurasi Dashboard** (formula
Hari Aktif/Hadir/dkk TIDAK PERNAH memakai `dicatat_oleh` sbg filter/
identity — hanya `santri_id`/`tanggal`/`status`/`kelas_ngaji` yang
relevan) — dicatat sbg observasi TERPISAH, di luar cakupan
"metric accuracy", MUNGKIN relevan utk audit user-management terpisah.

---

## 7. Class Scope

```
Dashboard Guru menampilkan : SEMUA kelas yang di-assign ke guru ini
                              (getKelasOwnedByGuru_ → array, BISA >1)
                              -- "multiple assigned classes", BUKAN
                              single/current-class
```
Neiza HANYA punya 1 kelas (Remaja SMA, jadwal_kbm.id=9) — tapi guru
LAIN (mis. Baban, guru_id=21) punya **2 kelas** ("4" dan "Pra Remaja
SMP", dikonfirmasi jadwal_kbm id=7 & id=8) — Dashboard-nya akan
menampilkan **2 kartu terpisah**, masing-masing dgn 6 metric
independen (TIDAK digabung/dijumlah lintas kelas).

---

## 8. Attendance Compatibility

**Pertanyaan inti §7 prompt**: apakah SEMUA 4 jalur tulis operasional
(`serverSaveAbsensiKelas`/`Admin`/`Daily`/`SetAbsensiSatuSantri`)
menghasilkan data yang dihitung SAMA oleh Dashboard?

```
Struktur dokumen YANG DITULIS oleh KEEMPAT jalur (dikonfirmasi Tahap 13/15):
  {id, santri_id, tanggal, status, dicatat_oleh, kelompok_id}
  -- IDENTIK PERSIS, TIDAK ADA field tambahan/berbeda per jalur
```
**JAWABAN: YA, KOMPATIBEL PENUH** — `iaReadAbsensiKelompokRange_`
(sumber Dashboard) membaca collection `absensi` TANPA membedakan
`dicatat_oleh`/jalur asal SAMA SEKALI (query HANYA filter `tanggal`
range, `santri_id` difilter DI CALLER) — dokumen dari `serverSaveAbsensiKelas`,
`Admin`, `Daily`, ATAU `SetAbsensiSatuSantri` **SAMA-SAMA TERHITUNG**
selama `tanggal`+`santri_id` cocok kriteria. **TIDAK ADA celah
kompatibilitas** ditemukan.

**Catatan penting** (terkait §6 laporan sebelumnya, Firestore write-path
coverage, Tahap 13): dokumen absensi **TIDAK MENYIMPAN field `kelas`**
— Dashboard MENENTUKAN kelas HANYA lewat lookup `santri.kelas_ngaji`
SAAT QUERY DIJALANKAN (bukan kelas SAAT attendance itu direkam) — lihat
§16 utk implikasinya.

---

## 9. Metric-by-Metric Reconciliation

### 9a. Hari Aktif — `COUNT(DISTINCT date)`
Formula persis: `tanggalDiisi[tanggalKeString_(a.tanggal)] = true` per
record dlm rentang (santri kelas ini), lalu `Object.keys(tanggalDiisi).length`.
**Dedup di level TANGGAL, BUKAN dokumen** — `10 dokumen` (bbrp santri,
tanggal sama) TETAP bisa jadi `hariAktif` LEBIH KECIL dari 10 (dikonfirmasi
§9b — 8 dokumen/tanggal utk Pra Remaja SMP Agustus TETAP hariAktif=4,
BUKAN 8, krn 2 santri/tanggal).

### 9b. Hadir/Izin/Sakit/Alpa — `COUNT(documents WHERE status=X)`
**BUKAN distinct-date** — kalau 1 santri "hadir" di 3 tanggal berbeda
dlm rentang, itu **3** ke penghitungan `hadir`, BUKAN 1. **Formula
BERBEDA dari Hari Aktif SECARA SENGAJA** (Hari Aktif = "berapa hari
sesi berjalan", Hadir/dkk = "berapa CATATAN kehadiran individual") —
**KEDUANYA BENAR utk tujuan masing-masing**, TIDAK saling menggantikan.

### 9c. Persentase — `status_count / (hadir+izin+sakit+alpa) × 100`, `Math.round()`
**BUKAN** `hadir/total_santri` (yang akan memberi arti "berapa persen
SANTRI yang hadir SEMUA hari") — **JUGA BUKAN** `hadir/(total_santri × hari)`
(yang akan memberi "attendance rate" akademis standar). Formula AKTUAL
= "dari SEMUA catatan berstatus apa pun dlm periode, berapa persen yang
berstatus X" — **valid SEBAGAI metric "komposisi status"**, TAPI **BISA
disalahpahami** sbg "tingkat kehadiran" standar kalau guru
mengharapkan definisi akademis (dicatat §17 sbg kandidat klarifikasi,
BUKAN bug).

**Rounding artifact** (§12 prompt) — dikonfirmasi lewat data real §14:
4 persentase independen di-`Math.round()` MASING-MASING, jadi **jumlah
4 persentase BISA TIDAK PERSIS 100%** (contoh nyata §14: 38+25+0+38 =
**101%**, bukan 100%) — **KOSMETIK, BUKAN bug** (setiap rounding
matematis independen bisa menghasilkan ini, fenomena universal, TIDAK
spesifik project ini).

### 9d. Total Santri — `COUNT(santri WHERE kelas_ngaji = kelas ini)`
**TIDAK ADA filter status/aktif-tidak-aktif** (dikonfirmasi: tabel
`santri` di kelompok 1 TIDAK PUNYA kolom "status aktif"/"nonaktif" yang
dicek fungsi ini — SEMUA santri dgn `kelas_ngaji` cocok DIHITUNG,
apa pun kondisinya). Formula = **"students assigned to class"** (§9
prompt, opsi ketiga), BUKAN "students with attendance"/"active
students" (2 opsi lain TIDAK relevan krn TIDAK ADA filter tsb di kode).

---

## 10. Cache Analysis

**Pertanyaan utama (§13 prompt)**: "Setelah guru menyimpan attendance,
apakah metric Dashboard dapat membaca data terbaru?"

```
JAWABAN: YA, utk 5 metric attendance (Hari Aktif/Hadir/Izin/Sakit/Alpa/
Persentase) -- TIDAK ADA cache server yang bisa membuatnya stale
(§5). Client-side dashboardLoadedKey (Tahap 16 §13) di-invalidate
SETIAP kali serverSaveAbsensiKelas/Admin sukses.

JAWABAN BERBEDA utk Total Santri: TIDAK LANGSUNG TERKAIT save
attendance SAMA SEKALI -- yang relevan utk metric ini adalah CRUD
santri (tambah/pindah kelas santri), BUKAN save attendance. Kalau
admin memindahkan santri ke kelas lain, cache santri (TTL 300s) BISA
membuat "Total Santri" Dashboard guru TERTINGGAL hingga 5 menit --
TIDAK terkait insiden Neiza (yang murni soal Hari Aktif/attendance),
TAPI relevan sbg observasi TERPISAH.
```

**Save → Dashboard stale?** (§14 prompt) — utk 5 metric attendance:
**TIDAK ADA skenario "save berhasil tapi Dashboard stale"** yang
ditemukan (dikonfirmasi TIDAK ADA cache di jalur baca attendance SAMA
SEKALI — beda dari kekhawatiran umum yang biasanya krn cache, di sini
justru TIDAK ADA cache yang bisa jadi penyebab).

---

## 11. Date/Timezone Analysis

**Diaudit ulang utk SEMUA metric** (bukan cuma Hari Aktif spt Tahap
16): SEMUA 5 metric attendance melalui **fungsi baca YANG SAMA PERSIS**
(`iaReadAbsensiKelompokRange_`, 1x panggilan per request Dashboard) —
**TIDAK ADA kemungkinan 1 metric pakai timezone berbeda dari metric
lain** krn SEMUA berasal dari 1 array `absensiRange` yang SAMA,
diproses dlm 1 loop yang SAMA (Modul_InputAbsen.gs:1080-1087). Total
Santri TIDAK melibatkan tanggal SAMA SEKALI (§4), jadi TIDAK relevan
utk analisis timezone.

---

## 12. Edge Cases (analisis kode, TIDAK ADA data test dibuat)

```
No attendance (0 record dlm periode)  : SEMUA metric = 0 (hariAktif=0,
  hadir/izin/sakit/alpa=0, pct()=0 krn guard totalCatatan>0 eksplisit
  -- TIDAK ADA divide-by-zero crash)
One day (1 tanggal, N santri)          : hariAktif=1, hadir/dkk = jumlah
  record hari itu (bisa >1 kalau >1 santri)
Duplicate attendance documents          : TIDAK MUNGKIN TERJADI (docId
  deterministik absensiDocId_, upsert SELALU menimpa dokumen yang SAMA
  -- dikonfirmasi arsitektur sejak Tahap 3, berlaku semua 4 jalur tulis)
Missing date (tanggal di-skip guru)     : TIDAK muncul di tanggalDiisi
  SAMA SEKALI (bukan 0/null eksplisit, HANYA tidak ada entry) -- hariAktif
  TIDAK menghitungnya, KONSISTEN dgn definisi "distinct-date YANG ADA"
Student removed from class / Class      : **RISIKO NYATA** (dijelaskan
  changed                                  detail §16 di bawah) --
  dokumen absensi TIDAK menyimpan kelas, lookup kelas SELALU dari
  santri.kelas_ngaji SAAT QUERY (bukan saat rekam) -- attendance lama
  bisa "berpindah kartu" kalau santri pindah kelas
Guru changed (jadwal_kbm.guru_id diubah): kartu kelas akan pindah ke
  guru BARU (getKelasOwnedByGuru_ selalu baca guru_id TERKINI dari
  jadwal_kbm) -- guru LAMA TIDAK LAGI melihat kartu itu, TIDAK ADA
  "riwayat" yang tertinggal di guru lama -- KONSISTEN dgn desain
  (jadwal_kbm = source-of-truth kepemilikan kelas SAAT INI, BUKAN
  historis)
Month boundary                          : DIBUKTIKAN LANGSUNG kasus
  Neiza (2026-08-07 di luar Juli) -- BEKERJA SESUAI DESAIN (§4 Tahap 16)
Year boundary (mis. Des→Jan)             : TIDAK ADA data real utk
  diverifikasi (kelompok 1 baru migrasi Firestore 2026-07-28, belum
  lintas tahun) -- SECARA STRUKTUR string 'yyyy-MM-dd' comparison
  TETAP benar lintas tahun (leksikografis = kronologis utk format ISO
  penuh) -- TIDAK DITEMUKAN bug POTENSIAL, TAPI BELUM teruji data nyata
Empty class (0 santri)                   : total=0, SEMUA metric attendance
  =0 (santriIdsKelas kosong, TIDAK ADA record yang bisa match) --
  TIDAK ADA crash (dikonfirmasi guard pct())
```

---

## 13. Neiza Regression

```
Guru      : Neiza (users.id=3, guru_id=22)
Kelas     : Remaja SMA (jadwal_kbm.id=9)
Data      : DIKONFIRMASI ULANG hari ini (§Filter fresh absensi_raw2.json)
            -- 8 tanggal unik TIDAK BERUBAH sejak Tahap 16:
            07-20,21,22,23,27,30,31, 08-07
Juli 2026  : hariAktif = 7 (7 dari 8 tanggal, 08-07 di luar rentang)
Period label (Tahap 18) : "Hari Aktif & kehadiran periode: Juli 2026"
```
**PASS** — TIDAK ADA perubahan data/formula yang mempengaruhi kasus ini
sejak Tahap 16/18.

---

## 14. Second Real-Data Reconciliation

**Kelas dipilih: Pra Remaja SMP** (jadwal_kbm.id=8, guru_id=21/Baban
Achmad Intiyas) — **dipilih krn**: (a) kelas KEDUA yang ADA datanya
selain Remaja SMA (bukan dipilih krn hasilnya diinginkan — dipilih
SEBELUM tahu hasilnya, murni "kelas lain yang punya jadwal_kbm aktif +
santri assigned"), (b) santri count kecil (2) memudahkan verifikasi
manual PENUH tanpa sampling, (c) datanya tersebar di 2 bulan (Juli DAN
Agustus) — kebetulan BAGUS utk menguji boundary period SEKALI LAGI dgn
kasus INDEPENDEN dari Neiza.

**Raw Firestore** (dikonfirmasi `?diag=listkelompok&table=absensi&kelompok=1`,
difilter santri_id ∈ {223,226}):
```
2026-07-13: 223=hadir, 226=hadir
2026-08-03: 223=izin,  226=alpa
2026-08-04: 223=izin,  226=hadir
2026-08-05: 223=alpa,  226=alpa
2026-08-07: 223=hadir, 226=hadir
```

**Reconciliation "Agustus 2026" (2026-08-01..2026-08-31)**:
```
Raw Source     : 10 dokumen (2 santri x 5 tanggal TOTAL, all-time)
Filtered Source : 8 dokumen (4 tanggal x 2 santri -- 08-03,04,05,07;
                  07-13 DIKECUALIKAN krn di luar Agustus)
Calculated Value:
  hariAktif = 4 (COUNT DISTINCT: 08-03,04,05,07)
  hadir     = 3 (223@08-07, 226@08-04, 226@08-07)
  izin      = 2 (223@08-03, 223@08-04)
  sakit     = 0
  alpa      = 3 (223@08-05, 226@08-03, 226@08-05)
  total     = 3+2+0+3 = 8 -- COCOK dgn Filtered Source (8 dokumen)
  pct(hadir)=round(3/8*100)=38%, pct(izin)=round(2/8*100)=25%,
  pct(sakit)=0%, pct(alpa)=round(3/8*100)=38%
  -- JUMLAH 4 PERSEN = 101% (rounding artifact, dikonfirmasi §9c/§12,
     BUKAN bug)
Displayed Value : SAMA (formula DITELUSURI dari kode, TIDAK ada
                  transformasi tambahan antara Calculated → Displayed
                  selain `${...}` template literal langsung)
Total Santri (period-independen) : 2 (roster kelas ini, TIDAK berubah
                  dgn filter Agustus/Juli)
```

**Reconciliation "Juli 2026" (2026-07-01..2026-07-31)**:
```
Filtered Source : 2 dokumen (07-13, 2 santri)
Calculated Value: hariAktif=1, hadir=2, izin=0, sakit=0, alpa=0
                  pct(hadir)=100%, sisanya 0% (JUMLAH = 100%, TIDAK ada
                  rounding artifact di kasus INI -- krn hanya 1 status
                  terisi)
```

**Kesimpulan §14**: formula **KONSISTEN & BENAR** pada kasus KEDUA yang
SEPENUHNYA independen dari Neiza (guru beda, kelas beda, pola data
beda — termasuk kasus BARU yang TIDAK muncul di Neiza: rounding-sum
≠100%). **Raw = Filtered = Calculated = Displayed TERPENUHI** utk KEDUA
periode yang diuji.

---

## 15. Accuracy Classification

| Metric | Classification | Evidence |
|---|---|---|
| Hari Aktif | **A — VERIFIED CORRECT** | Tahap 16 (Neiza) + §14 (Pra Remaja SMP, 2 periode) — raw=filtered=calculated=displayed KONSISTEN pada 2 kasus independen |
| Hadir/Izin/Sakit/Alpa | **A — VERIFIED CORRECT** | §14 — verifikasi manual PENUH (2 santri, 5 dokumen, dihitung tangan) COCOK 100% dgn formula kode |
| Persentase | **B — CORRECT BY DESIGN** (dgn catatan) | Formula BENAR sesuai definisinya SENDIRI ("komposisi status", §9c) — TAPI berpotensi disalahartikan sbg "attendance rate" akademis kalau definisi tidak dikomunikasikan (BUKAN classification F, formula TIDAK salah, HANYA berpotensi disalahpahami — sama pola dgn Hari Aktif SEBELUM Tahap 18) |
| Total Santri | **B — CORRECT BY DESIGN** (dgn catatan) | Formula BENAR sbg "roster count" — TAPI period-independence-nya TIDAK terkomunikasikan di UI (kandidat UX serupa Tahap 17/18, §17) |
| Period Label (Tahap 18) | **C — PRESENTATION ONLY** | Verifikasi ulang §13 — TIDAK mengubah angka, murni teks tambahan, SUDAH diverifikasi Tahap 18 |

**0 metric** masuk kategori D (Cache Risk langsung ke akurasi angka —
cache HANYA relevan ke Total Santri dan itu pun TIDAK terbukti pernah
menyebabkan angka salah, hanya POTENSI staleness 5 menit), **0 metric
F (Calculation Bug)**, **0 metric G (Source Data Issue LANGSUNG)** —
TAPI **1 risiko STRUKTURAL dicatat §16** (santri pindah kelas) yang
BELUM terbukti terjadi TAPI SECARA TEKNIS bisa mempengaruhi akurasi
historis kalau terpicu.

---

## 16. Root Causes (temuan struktural, BUKAN bug yang SUDAH terjadi)

**Root cause**: dokumen `kelompok/{id}/absensi` **TIDAK menyimpan
field `kelas`** — atribusi kelas SELALU dihitung ULANG saat query
(`santri.kelas_ngaji` SAAT INI), BUKAN disimpan sbg bagian catatan
historis.

**Impact** (HIPOTETIS, BELUM terbukti terjadi di data manapun yang
diperiksa tahap ini): kalau santri X pindah dari kelas A ke kelas B
DI TENGAH bulan, SELURUH riwayat attendance-nya (termasuk yang direkam
SAAT MASIH di kelas A) akan **RETROAKTIF** dihitung sbg milik kelas B
saat Dashboard di-query SETELAH perpindahan — kartu kelas A "kehilangan"
hari-hari itu dari `hariAktif`/`hadir`/dkk-nya (walau SUDAH benar
direkam saat itu), kartu kelas B "mendapat tambahan" hari yang
sebenarnya BUKAN kelas B saat itu.

**Recommended fix** (PREVIEW SAJA, TIDAK diimplementasikan): kalau
suatu saat masalah ini TERBUKTI terjadi (guru melapor kejanggalan
serupa Neiza TAPI penyebabnya perpindahan kelas), opsi teknis:
(a) simpan `kelas` sbg field TAMBAHAN saat rekam attendance (perubahan
skema, di luar cakupan investigasi ini), (b) terima sbg
keterbatasan/desain yang SUDAH ADA (mengikuti prinsip "kelas_ngaji
= status TERKINI santri" yang KONSISTEN dgn cara SELURUH fitur lain
di app ini bekerja, BUKAN cuma Dashboard).

---

## 17. Recommended Fixes (PREVIEW, TIDAK DIIMPLEMENTASI tahap ini)

1. **Total Santri period-independence** — pertimbangkan label serupa
   Tahap 18 (mis. teks kecil "(saat ini)" di sebelah "N Santri") biar
   guru tidak bingung kenapa angka ini TIDAK berubah saat filter bulan
   diganti, sementara 4 metric lain berubah.
2. **Persentase definisi** — pertimbangkan tooltip/penjelasan singkat
   ("% dari total catatan kehadiran periode ini") biar tidak
   disalahartikan sbg tingkat kehadiran vs total santri terdaftar.
3. **Duplicate user login** (Baban, id=2 & id=4) — di luar cakupan
   audit Dashboard, TAPI layak diteruskan ke audit user-management
   terpisah kalau relevan bagi user.
4. **Kelas-pindah retroaktif** (§16) — TIDAK direkomendasikan
   diperbaiki KECUALI benar-benar terbukti jadi masalah nyata (belum
   ada evidence terjadi) — dicatat sbg pengetahuan arsitektur, bukan
   item kerja.

**TIDAK ADA satu pun dari ini diimplementasikan tahap ini** (investigation-
only, dipatuhi).

---

## 18. Performance Candidates (dicatat, TIDAK dioptimasi)

- `serverGetGuruDashboardSummaryRange` membaca `JADWAL_KBM`+`GURU`+`SANTRI`
  PARALEL (`iaReadKelompokTablesParallel_`, sudah dioptimasi sesi-sesi
  sebelumnya) + 1x `iaReadAbsensiKelompokRange_` — **TIDAK ditemukan
  duplicate read/sequential request/full-scan baru** dlm audit tahap ini
  (fungsi ini SUDAH melalui optimasi 2026-08-05/06/07 per komentar kode
  eksisting) — `Candidate for separate performance stage`: **TIDAK
  ADA kandidat baru ditemukan**, murni konfirmasi status quo sudah baik.

---

## 19. Open Questions

- Apakah user PERNAH mengalami laporan serupa Neiza utk metric SELAIN
  Hari Aktif (mis. guru bingung kenapa "Total Santri" tidak berubah
  saat ganti bulan)? Belum ada laporan, TAPI risiko UX-nya STRUKTURAL
  SAMA dgn kasus Neiza (§17 poin 1).
- Apakah 2 akun `users.id=2`/`id=4` utk Baban Achmad Intiyas (§6)
  DISENGAJA (mis. 1 akun lama tidak dihapus) atau kesalahan input? Di
  luar cakupan audit ini, perlu ditanyakan ke user/admin kalau relevan.
- Apakah santri PERNAH benar-benar pindah kelas di kelompok 1 sejak
  migrasi Firestore (2026-07-28)? Kalau BELUM PERNAH, risiko §16 murni
  teoretis sejauh ini — TIDAK diverifikasi tahap ini (di luar cakupan
  "metric Dashboard Guru", butuh audit riwayat `santri.kelas_ngaji`
  terpisah kalau ingin dipastikan).

---

## FINAL OUTPUT

```
TAHAP 19 — DASHBOARD GURU METRIC ACCURACY AUDIT

Metrics Found:
6 (Hari Aktif, Total Santri, Hadir, Izin, Sakit, Alpa) + 1 turunan
(Persentase) + 1 presentation-only (Period Label, Tahap 18)

Verified Correct:
2 (Hari Aktif; Hadir/Izin/Sakit/Alpa sbg 1 kelompok formula yang sama)

Correct By Design:
2 (Persentase; Total Santri) -- keduanya dgn catatan UX (§17)

Presentation Only:
1 (Period Label)

Cache Risk:
0 langsung ke akurasi angka (Total Santri PUNYA cache TTL 300s tapi
TIDAK terbukti pernah menyebabkan angka salah -- potensi staleness,
bukan bug terkonfirmasi)

Filter Risk:
1 STRUKTURAL (atribusi kelas retroaktif via kelas_ngaji TERKINI, §16
-- BELUM terbukti terjadi, dicatat sbg risiko bukan bug aktif)

Calculation Bug:
0

Source Data Issue:
0 langsung ke Dashboard (1 anomali TERPISAH ditemukan: 2 akun login
utk 1 guru yang sama, TIDAK mempengaruhi akurasi metric)

Unknown:
0

Hari Aktif:
VERIFIED

Neiza July 2026:
7 hari

Period Label:
PASS

Other Metric Issues:
Persentase = "komposisi status" (bukan "tingkat kehadiran" akademis),
berpotensi disalahpahami spt Hari Aktif sebelum Tahap 18. Total Santri
= period-independent (roster saat ini), TIDAK ikut berubah saat filter
bulan diganti, TIDAK dikomunikasikan di UI. Rounding 4-persentase bisa
tidak persis 100% (kosmetik).

Most Important Root Cause:
TIDAK ADA bug aktif ditemukan. Risiko struktural TERBESAR: dokumen
absensi tidak menyimpan kelas, atribusi selalu dari kelas_ngaji SAAT
INI -- berpotensi retroaktif salah-atribusi kalau santri pindah kelas
(belum terbukti terjadi).

Code Changed:
NO

Firestore Changed:
NO

Production:
UNCHANGED

Recommended Next Stage:
UX klarifikasi Total Santri (period-independence) + Persentase
(definisi) mengikuti pola Tahap 18 -- ATAU investigasi terpisah kalau
user ingin memastikan risiko §16 (kelas-pindah) belum pernah terpicu.
```
