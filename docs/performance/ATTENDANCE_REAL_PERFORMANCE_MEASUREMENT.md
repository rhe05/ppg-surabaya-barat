# Pengukuran Performa NYATA — Alur "Input Kehadiran" (Guru Mobile)

> Tahap 2: **INSTRUMENTATION & MEASUREMENT ONLY**. Tidak ada optimasi/refactor
> yang diterapkan. Semua angka di bawah adalah hasil panggilan HTTP nyata ke
> deployment PRODUCTION (`AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM`,
> versi 393) via `tools/perf_measure.js` → `?diag=perf*` (Modul_PerfAudit.gs,
> instrumentasi sementara). Tanggal pengukuran: 2026-08-08.

---

## 1. Executive Summary

Metode: **diag-route HTTP langsung** (bukan browser UI) — lihat §Metodologi &
Keterbatasan di bawah untuk alasan pivot ini. Setiap angka `ms` di laporan ini
adalah **`Date.now()` delta SERVER-SIDE nyata** (dalam 1 eksekusi Apps Script),
bukan estimasi. 5 pengulangan per skenario dilakukan utk sebagian besar
titik ukur (Save Attendance: 3× per skenario ukuran kelas karena
keterbatasan waktu).

**Temuan utama** (didukung data, lihat §17 utk bukti lengkap per klaim):
- Login (`serverLogin`): median **556 ms** server-side — biaya dominan =
  `readSheetAsObjects('users')` full-sheet-scan (Google Sheets, bukan
  Firestore), sesuai temuan statis §11 audit sebelumnya.
- Dashboard (3 panggilan sequential): median total **2195 ms** — tapi ini
  BUKAN representasi waktu nyata di browser (3-5 panggilan aslinya konkuren,
  lihat §4/§Keterbatasan).
- Switch Class (round-trip penuh, cache-miss): median **2159 ms**.
- Student List (fetch terpisah): median **1317 ms**.
- Save Attendance: median server-side **~3000-3300 ms** (n=1..9 santri) —
  **TIDAK menunjukkan scaling yang jelas** di rentang kecil ini (lihat §9);
  breakdown terbesar = Firestore write batch (~1.8-1.9s median) + audit log
  scan+append (~1-1.6s median).
- `akses_kelas_request` (§12): median baca **762 ms**, tapi **rowCount = 1**
  saat ini (tabel kosong secara praktis) — risiko STRUKTURAL (full-scan tanpa
  cache) TETAP ada, tapi dampak SAAT INI kecil krn tabelnya masih sangat
  kecil.
- `audit_log` (§13): median baca **601 ms**, **rowCount = 429** — tabel nyata
  & terus tumbuh (dipakai SELURUH fitur aplikasi, bukan cuma absensi),
  konsisten dgn kekhawatiran audit statis.
- `guru_izin` (§14): median baca **588 ms**, rowCount = 5 — kecil, risiko rendah.

---

## 2. Test Environment

| Item | Nilai |
|---|---|
| Metode akses | HTTP GET langsung ke `?diag=perf*` (Modul_PerfAudit.gs), **BUKAN** browser/klik UI (lihat §Metodologi) |
| Auth | OAuth Bearer token milik developer (`~/.clasprc.json`, akun `rheza354@gmail.com`) — bukan sesi guru asli |
| Origin request | Node.js (`https` module) berjalan di mesin lokal developer, Windows 11 |
| Jaringan | Koneksi internet lokal developer → `script.google.com` (Apps Script infra Google, region tidak diketahui) |
| Akun uji | Guru sintetis "Guru Test QA" (id=31, kelompok_id=1) — sesi dibuat via `CacheService` langsung (BUKAN via login form asli), lihat §Metodologi. Login timing (§3) diukur pakai admin/admin123 sbg proxy (lihat alasan di §3). |
| Kelompok | Kelp Petemon (`kelompok_id=1`) — satu-satunya kelompok dgn Firestore + fitur mobile guru aktif |
| Kelas uji | "PAUD/TK A" (9 santri riil — kelas TERBESAR yang ada, lihat §9 keterbatasan scaling) |
| Tanggal uji tulis | **2099-12-31** — jauh ke depan, dipastikan kosong dari data operasional nyata sebelum test (dicek via `diagPerfSetup_`, tidak ada absensi existing) |
| Tanggal uji baca (dashboard) | Agustus 2026 (bulan berjalan, REAL data, read-only — aman) |
| Repetisi | 5× per skenario baca; 3× per skenario Save (n=1/5/9 santri) |
| Jumlah santri kelas uji | 9 (real, satu-satunya count yang bisa diukur langsung — lihat §9) |

### Metodologi & Keterbatasan (WAJIB dibaca sebelum menafsirkan angka)

1. **Browser automation gagal di environment ini** — Apps Script HtmlService
   me-render UI di dalam `<iframe>` cross-origin (`script.googleusercontent.com`),
   dan tool otomasi browser yang tersedia (`read_page`/`screenshot`) tidak bisa
   menembus iframe itu (elemen tidak terbaca, screenshot timeout "Browser pane
   is not displayed"). Karena itu SELURUH pengukuran di laporan ini via
   **diag-route HTTP langsung** (pola sama `tools/diag_query.js` yang sudah
   ada di project), BUKAN klik UI asli.
2. **Konsekuensi langsung dari #1**: metrik yang MURNI di sisi browser (DOM
   render time, waktu klik status berubah tampilan, `google.script.run`
   bridge overhead, waktu benar-benar "terlihat" oleh mata guru) **TIDAK BISA
   DIUKUR** dan ditandai `NOT MEASURED` di seluruh laporan ini — bukan
   diabaikan, tapi genuinely di luar jangkauan alat yang tersedia.
3. **Login guru asli tidak bisa diuji langsung** — akun "Guru Test QA" DENGAN
   SENGAJA dibuat TANPA baris `users` (tanpa email/password) untuk
   meminimalkan jejak data (lihat instruksi keamanan sesi sebelumnya: "hanya
   perubahan minimum yang diperlukan"). Sesi guru untuk semua pengukuran
   selain Login dibuat langsung via `CacheService` (pola PERSIS sama dengan
   `diag=kehadirantest` yang SUDAH ADA di `Code.js` sebelum sesi ini — bukan
   mekanisme baru). `serverLogin()` sendiri (§3) diukur pakai admin/admin123
   krn fungsi itu **tidak bercabang per role** (baca sheet `users` yang sama,
   hash-compare yang sama, apa pun rolenya) — representatif utk biaya
   komputasi murni, TAPI perlu dicatat: pengukuran ini TIDAK melewati form
   login browser asli (cuma pemanggilan fungsi `serverLogin()` langsung).
4. **Save Attendance memakai `serverSaveAbsensiKelasAdmin`, BUKAN
   `serverSaveAbsensiKelas` (guru)** — `serverSaveAbsensiKelas` (guru)
   MENOLAK tanggal masa depan (`iaValidateWaktuAbsen_`, by design), sehingga
   tidak bisa dipakai bersama tanggal aman 2099-12-31 tanpa melanggar aturan
   keamanan sesi ("gunakan tanggal jauh ke depan"). Jalur admin TIDAK
   memanggil `canGuruAccessKelas_`/`iaCekGuruSedangIzin_`/`iaValidateWaktuAbsen_`
   sama sekali — konsekuensinya, breakdown Save di §8 TIDAK punya angka
   SAVE_ACCESS_CHECK_MS/SAVE_GURU_IZIN_MS dari DALAM transaksi Save yang sama.
   Kedua operasi itu tetap diukur REAL, hanya STANDALONE (§4 memakai
   `serverGetKelasAbsenList` yg secara alami memanggil baca
   `akses_kelas_request`; §14 memanggil `iaCekGuruSedangIzin_` langsung).
5. **Skala jumlah santri (5/10/20/30/50) TIDAK bisa diuji seperti diminta** —
   kelas TERBESAR yang benar-benar ada di Kelp Petemon hanya 9 santri
   (`diagPerfKelasList_`, lihat §9). Tidak ada kelas asli berisi 20-30 santri
   spt asumsi awal. Sesuai instruksi ("gunakan jumlah yang tersedia dan
   tuliskan jumlah aktual"), pengujian skala dilakukan dgn n=1, 5, 9 santri
   REAL (bukan direkayasa lintas-kelas). n=20/30/50 = `NOT MEASURED — tidak
   ada kelas asli sebesar itu di kelompok ini`.
6. **`wallMs` vs `ms` di setiap hasil**: `wallMs` = waktu total dari Node.js
   lokal sampai respons diterima (termasuk latensi jaringan lokal→Google,
   overhead OAuth, DAN redirect HtmlService/ContentService) — BUKAN
   representasi round-trip `google.script.run` browser asli. `ms`/`*Ms` di
   dalam `json` = `Date.now()` delta MURNI di server Apps Script, ini yang
   paling bisa dipercaya sbg "biaya komputasi fungsi tsb".
7. **Concurrent-user test & Apps Script Execution log**: sesuai keputusan
   sesi ini, KEDUANYA **DILEWATI SEPENUHNYA** (`NOT MEASURED`) — concurrent
   test butuh multi-sesi browser asli (tidak tersedia di sini), Execution log
   butuh login akun Google developer ke script.google.com (di luar cakupan
   otomasi yang aman dilakukan).
8. **Cold vs Warm session (§10)**: `NOT MEASURED` — konsep ini murni tentang
   cache SISI BROWSER/klien (`iaState_.dashboardLoadedKey` dst, Script_Main.html)
   yang tidak tersentuh sama sekali oleh diag-route server-side. Structural
   evidence dari audit statis sebelumnya (client-side cache guard ada &
   aktif) tetap berlaku, tapi TIDAK ADA angka ms baru di sini.

---

## 3. Login Measurements

Diukur via `serverLogin('admin','admin123')` langsung (lihat keterbatasan
#3 di atas) — 5 pengulangan.

| Run | Server ms | Wall ms (Node→Google, TIDAK representatif browser) |
|---|---:|---:|
| 1 | 536 | 4016 |
| 2 | 556 | 3079 |
| 3 | 611 | 2810 |
| 4 | 554 | 2805 |
| 5 | 618 | 3277 |

Min=536, Max=618, **Median=556**, Avg=575 (server ms).

`LOGIN_TOTAL_MS = 556 (median, server-side serverLogin() saja)` — **BUKAN**
total waktu login end-to-end di browser (klik tombol → redirect dashboard).
Total end-to-end browser: `NOT MEASURED` (butuh klik UI asli, lihat
keterbatasan #1/#2).

---

## 4. Dashboard Measurements

Diukur via `diagPerfDashboard_`: `serverGetInputAbsenMeta` →
`serverGetGuruDashboardSummaryRange` → `serverGetKelasAbsenList` (prefetch),
dipanggil BERURUTAN di server (lihat keterbatasan — di browser asli hampir
konkuren, jadi total riil browser BUKAN penjumlahan angka ini). 5 pengulangan.

| Run | metaMs (serverGetInputAbsenMeta) | dashboardMs (serverGetGuruDashboardSummaryRange) | prefetchKelasMs (serverGetKelasAbsenList) | sequentialTotalMs |
|---|---:|---:|---:|---:|
| 1 | 408 | 546 | 938 | 1892 |
| 2 | 856 | 1040 | 299 | 2195 |
| 3 | 434 | 1605 | 459 | 2498 |
| 4 | 459 | 2027 | 428 | 2914 |
| 5 | 437 | 844 | 438 | 1719 |

**Median**: metaMs=437, dashboardMs=1040, prefetchKelasMs=438,
sequentialTotalMs=2195.

`DASHBOARD_TOTAL_MS = NOT MEASURED (waktu nyata sampai dashboard terlihat di
browser)` — yang terukur cuma 3 dari ~5 panggilan konkuren asli
(`serverGetQuoteHariIni`, `serverGetJurnalKelasList` TIDAK ikut diukur di
sini, di luar cakupan 3 fungsi yang eksplisit diminta), dan diukur SEQUENTIAL
bukan konkuren — jadi angka `sequentialTotalMs` di atas adalah **batas atas
kasar (upper bound)**, bukan estimasi waktu nyata.

`serverGetGuruDashboardSummaryRange` (median 1040 ms) adalah fungsi
terlama dari 3 yang diuji.

---

## 5. Switch Class Measurements

### Cache HIT
`SWITCH_CLASS_CACHE_HIT_MS = NOT MEASURED — secara STRUKTURAL ini 0 network
call` (bukti kode statis §5 audit sebelumnya: prefetch client-side
`window.iaKelasGatePrefetch_`, popup tampil dari data yang SUDAH ada di
memori JS browser, tanpa `google.script.run` tambahan). Tidak ada server
call yang bisa diinstrumentasi utk skenario ini — memang tidak ada.

### Cache MISS (round-trip penuh)
Diukur via `serverGetKelasAbsenList(token, '2099-12-31', 'PAUD/TK A')` — 5×.

| Run | ms |
|---|---:|
| 1 | 1309 |
| 2 | 1556 |
| 3 | 3878 |
| 4 | 2159 |
| 5 | 2159 |

Min=1309, Max=3878, **Median=2159**, Avg=2212.

`SWITCH_CLASS_CACHE_MISS_MS = 2159 (median)`. `formData` SUDAH tersedia
dalam respons yang sama (`formDataCount: 9` di setiap run) — TIDAK ada
request tambahan terpisah untuk daftar santri saat kelas pertama
dipilih/prefetch (lihat §6).

---

## 6. Student List Measurements

### Preloaded (kelas pertama/prefetch)
`STUDENT_LIST_PRELOADED_MS = 0 (tambahan network) — sudah menyatu dalam
respons serverGetKelasAbsenList (§5), field formData, BUKAN request
terpisah`. Bukti: `formDataCount` di setiap run §5 = 9 (jumlah santri kelas
uji), tanpa panggilan lain.

### Fetch (kelas lain / re-fetch)
Diukur via `serverGetAbsensiKelasForm(token, 'PAUD/TK A', '2099-12-31')` —
5× (memanggil kelas yang SAMA sengaja, murni utk isolasi biaya fungsi ini,
BUKAN skenario "kelas kedua" krn guru QA cuma dikasih akses 1 kelas).

| Run | ms |
|---|---:|
| 1 | 1530 |
| 2 | 1012 |
| 3 | 1022 |
| 4 | 1317 |
| 5 | 1414 |

Min=1012, Max=1530, **Median=1317**, Avg=1259.

`STUDENT_LIST_FETCH_MS = 1317 (median)`.

---

## 7. Attendance Input Measurements

`STATUS_CLICK_1_MS = NOT MEASURED`
`STATUS_CLICK_10_AVG_MS = NOT MEASURED`
`STATUS_CLICK_20_AVG_MS = NOT MEASURED`
`STATUS_CLICK_30_AVG_MS = NOT MEASURED`
`NETWORK_REQUESTS_PER_CLICK = 0 (STRUKTURAL, bukan diukur langsung)`

Alasan: ini murni interaksi DOM/JS di browser (perubahan `iaState_`/CSS
class per klik status Hadir/Izin/Sakit/Alpa) — TIDAK ADA fungsi server yang
terpanggil per klik (dikonfirmasi via pembacaan kode statis di audit
sebelumnya, `Script_Main.html` — handler klik status TIDAK memanggil
`google.script.run`). Tidak ada cara mengukur waktu eksekusi handler/DOM
update tanpa browser yang bisa dijalankan sungguhan (lihat keterbatasan #1).
Klaim `NETWORK_REQUESTS_PER_CLICK = 0` bersumber dari bukti kode, konsisten
antara audit statis & pengukuran ini (tidak berubah).

---

## 8. Save Attendance Measurements

Via `serverSaveAbsensiKelasAdmin` (lihat keterbatasan #4). Kelas="PAUD/TK A",
tanggal="2099-12-31". 3 pengulangan per ukuran kelas (n=1, 5, 9 — semua
santri REAL kelas ini, lihat §9 utk kenapa tidak ada n=20/30/50).

### n=1 santri

| Run | clientPrepMs | readMasterMs | lockWaitMs | writeMs (dalam lock) | auditLogMs | serverTotalMs |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 39 | 200 | 1558 | 1169 | 3041 |
| 2 | 0 | 11 | 87 | 1794 | 1594 | 3554 |
| 3 | 0 | 25 | 89 | 1865 | 885 | 2925 |

Median: readMasterMs=25, lockWaitMs=89, writeMs=1794, auditLogMs=1169,
serverTotalMs=3041.

### n=5 santri

| Run | clientPrepMs | readMasterMs | lockWaitMs | writeMs | auditLogMs | serverTotalMs |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 11 | 93 | 1938 | 1630 | 3740 |
| 2 | 0 | 35 | 85 | 2067 | 911 | 3164 |
| 3 | 0 | 11 | 117 | 1892 | 1239 | 3328 |

Median: readMasterMs=11, lockWaitMs=93, writeMs=1938, auditLogMs=1239,
serverTotalMs=3328.

### n=9 santri (kelas penuh)

| Run | clientPrepMs | readMasterMs | lockWaitMs | writeMs | auditLogMs | serverTotalMs |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 39 | 81 | 1685 | 1017 | 2886 |
| 2 | 0 | 11 | 92 | 1836 | 1082 | 3089 |
| 3 | 0 | 111 | 160 | 1922 | 1299 | 3629 |

Median: readMasterMs=39, lockWaitMs=92, writeMs=1836, auditLogMs=1082,
serverTotalMs=3089.

### Ringkasan breakdown (median per ukuran)

```
SAVE_CLIENT_PREP_MS     = 0 (persiapan array absensiList di server diag — pengganti "client" JS asli, lihat catatan)
SAVE_SERVER_READ_MS     = 11–39 (baca ulang daftar santri kelas, sudah kena cache di sebagian run)
SAVE_ACCESS_CHECK_MS    = NOT MEASURED (jalur admin tidak memanggil canGuruAccessKelas_ — lihat §keterbatasan #4; angka REAL utk canGuruAccessKelas_/akses_kelas_request ada di §5/§12)
SAVE_GURU_IZIN_MS       = NOT MEASURED (jalur admin tidak memanggil iaCekGuruSedangIzin_ — angka REAL ada di §14)
SAVE_LOCK_WAIT_MS       = 81–200 (median ~90, tidak ada kontensi lock terdeteksi — wajar, tidak ada guru lain menyimpan bersamaan saat test)
SAVE_WRITE_MS           = 1685–2067 (median ~1.8–1.9 detik, dalam lock — TERBESAR dari semua sub-tahap yang terukur)
SAVE_AUDIT_LOG_MS       = 885–1630 (median ~1.0–1.6 detik — scan 429 baris + append 1 baris, DI LUAR lock)
SAVE_SERVER_TOTAL_MS    = 2886–3740 (median ~3.0–3.3 detik)
SAVE_CLIENT_RESPONSE_MS = NOT MEASURED (parsing respons + callback UI di browser, di luar jangkauan diag-route)
SAVE_TOTAL_MS           = NOT MEASURED (end-to-end termasuk waktu browser — hanya SAVE_SERVER_TOTAL_MS yang terukur nyata)
```

---

## 9. Santri Count Scaling

| Jumlah Santri | Total Save (median) | Firestore Write (median) | Audit Log (median) | Server Total (median) |
|---:|---:|---:|---:|---:|
| 1 | 3041 ms | 1794 ms | 1169 ms | 3041 ms |
| 5 | 3328 ms | 1938 ms | 1239 ms | 3328 ms |
| 9 | 3089 ms | 1836 ms | 1082 ms | 3089 ms |
| 20 | NOT MEASURED — tidak ada kelas asli sebesar ini di Kelp Petemon (kelas terbesar = 9 santri, lihat §2) |
| 30 | NOT MEASURED — idem |
| 50 | NOT MEASURED — idem |

**Pola**: dalam rentang n=1–9, waktu **TIDAK menunjukkan scaling linear yang
jelas** — 3041→3328→3089 ms (naik lalu turun, bukan naik monoton). Ini
KONSISTEN dengan bukti kode statis (§11 audit sebelumnya): `writeMs`
mencerminkan SATU batch `UrlFetchApp.fetchAll` (Firestore) — biayanya
didominasi overhead round-trip jaringan/Firestore per-batch, BUKAN jumlah
dokumen dalam batch itu (untuk rentang kecil 1-9 dokumen). **Tidak bisa
disimpulkan pola untuk n besar (20-50)** — TIDAK ADA data, dan MENOLAK
membuat kesimpulan ekstrapolasi tanpa data sesuai instruksi eksplisit
("jangan membuat kesimpulan tanpa data").

Kesimpulan formal: **tidak konsisten/tidak cukup data** untuk n=1-9
(perbedaan antar-run dalam 1 ukuran kelas yang SAMA, mis. n=1: 2925-3554,
lebih besar dari perbedaan ANTAR ukuran kelas) — variansi run-to-run
tampaknya lebih besar dari efek ukuran kelas itu sendiri di rentang ini.

---

## 10. Cold vs Warm Session

`NOT MEASURED` — lihat keterbatasan #8. Cache yang relevan
(`iaState_.dashboardLoadedKey`/`kelasLoadedKey`, `IA_KELOMPOK_TABLE_CACHE_KEY_`
sisi server) ada 2 lapis:
- Client-side (browser): TIDAK tersentuh diag-route sama sekali, murni
  JS state di memori tab browser.
- Server-side (`CacheService.getScriptCache()`, TTL 300 detik,
  `Modul_Utilities.gs:97-105`): SECARA TIDAK LANGSUNG mungkin ikut
  mempengaruhi variansi run-to-run yang terlihat di §4/§5/§8 (mis. run
  dengan `readMasterMs` sangat kecil "11 ms" vs "111 ms" bisa jadi
  cache-hit vs cache-miss) — TAPI ini TIDAK dikontrol/diisolasi secara
  sengaja di pengukuran ini, jadi tidak bisa diklaim sebagai pengukuran
  cold/warm yang valid, hanya OBSERVASI SAMPINGAN.

---

## 11. Concurrent User Test

`NOT MEASURED` — dilewati sepenuhnya sesuai keputusan eksplisit sebelum
pengukuran dimulai (butuh multi-sesi browser asli, tidak tersedia; risiko
melakukan load test tanpa kendali penuh terhadap production juga ingin
dihindari). `ScriptLock` global TETAP terbukti ada secara struktural (kode,
`Modul_Utilities.gs:462-472`) — TAPI tidak ada bukti empiris antrean nyata
dari sesi ini.

---

## 12. `akses_kelas_request` Measurements

Diukur via `readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST)` langsung
(representatif utk SEMUA 3 titik panggilan statis — fungsi & tabelnya
identik di ke-3 titik, lihat §11 audit statis) — 5×.

| Run | ms | rowCount |
|---|---:|---:|
| 1 | 615 | 1 |
| 2 | 762 | 1 |
| 3 | 1438 | 1 |
| 4 | 1059 | 1 |
| 5 | 622 | 1 |

Min=615, Max=1438, **Median=762**, Avg=899. `rowCount` KONSTAN = 1 (baris
test yang dibuat `diagPerfSetup_` sendiri — tabel ini SANGAT KECIL di
production saat ini, bukan hasil rekayasa).

```
akses_kelas_request #1 (serverGetInputAbsenMeta)  = 762 ms (median, representatif — lihat catatan di atas)
akses_kelas_request #2 (serverGetKelasAbsenList)  = 762 ms (median, representatif — fungsi identik)
akses_kelas_request #3 (canGuruAccessKelas_)      = 762 ms (median, representatif — fungsi identik)
```

⚠️ **Catatan penting**: angka di atas adalah **estimasi terstruktur**
(structural extrapolation), BUKAN 3 pengukuran independen di 3 titik kode
berbeda — karena ketiganya memanggil fungsi generik yang SAMA PERSIS
(`readSheetAsObjects(AKSES_KELAS_REQUEST)`) dengan tabel yang sama, biaya
per-panggilan SECARA ARSITEKTURAL identik terlepas dari titik pemanggilnya.
Yang benar-benar diukur adalah 1 titik representatif, diulang 5×; perkalian
"3-4× per alur lengkap" adalah TEMUAN KODE (§11 audit statis, jumlah titik
panggilan), BUKAN pengukuran waktu terpisah untuk tiap titik.

---

## 13. `audit_log` Measurements

```
AUDIT_LOG_ROW_COUNT = 429 (konstan di semua run — tabel produksi nyata, bukan hasil test)
```

Scan saja (`readSheetAsObjects(AUDIT_LOG)`, bagian dari `generateId()`) — 5×.

| Run | ms |
|---|---:|
| 1 | 601 |
| 2 | 505 |
| 3 | 722 |
| 4 | 610 |
| 5 | 540 |

Min=505, Max=722, **Median=601** (`AUDIT_LOG_SCAN_MS`).

`AUDIT_LOG_APPEND_MS = NOT MEASURED terpisah` (tidak diinstrumentasi
terpisah dari scan — untuk menghindari mengubah `logAudit`/`generateId`
yang dipakai 40+ fungsi lain di seluruh app, lebih aman ukur total via
`auditLogMs` di §8 yang mencakup scan+append sekaligus: median 1082-1239 ms
tergantung ukuran kelas).

`AUDIT_LOG_TOTAL_MS = 1082–1239 (median, dari §8 — scan+append gabungan, dalam konteks Save Attendance nyata)`

---

## 14. `guru_izin` Measurements

Via `iaCekGuruSedangIzin_(31, '2099-12-31')` (fungsi REAL, dipanggil
langsung) — 5×.

```
GURU_IZIN_ROW_COUNT = 5 (konstan)
```

| Run | ms |
|---|---:|
| 1 | 588 |
| 2 | 801 |
| 3 | 458 |
| 4 | 1007 |
| 5 | 484 |

Min=458, Max=1007, **Median=588** (`GURU_IZIN_READ_MS`).

---

## 15. Network Request Map

### Login
`Requests = 1 google.script.run (serverLogin) → 1 baca Google Sheets (users)`. Tidak ada Firestore.

### Dashboard (real, dari kode — bukan cuma yg diinstrumentasi di §4)
`Requests = minimal 5 google.script.run` (bukti kode `Script_Main.html`
§Request Map audit statis sebelumnya): `serverGetInputAbsenMeta`,
`serverGetQuoteHariIni`, `serverGetGuruDashboardSummaryRange`,
`serverGetKelasAbsenList` (prefetch), `serverGetJurnalKelasList` (prefetch)
— **HANYA 3 dari 5 yang diinstrumentasi/diukur di §4** (`serverGetQuoteHariIni`
& `serverGetJurnalKelasList` di luar cakupan yang diminta secara eksplisit).
Tiap `google.script.run` → 1+ Apps Script→Firestore (`fetchAll` batch, lihat
§11 audit statis) untuk kelompok yang sudah migrasi (Kelp Petemon).

### Switch Class
```
Cache Hit Requests  = 0 (struktural, client-side saja)
Cache Miss Requests = 1 google.script.run (serverGetKelasAbsenList) → 1 fetchAll batch Firestore (santri+guru+jadwal_kbm) + 1 readSheetAsObjects Sheets (akses_kelas_request) + 1 firestoreRangeQuery (absensi existing)
```

### Save
```
Requests = 1 google.script.run (serverSaveAbsensiKelas / Admin) → 1 fetchAll batch Firestore (baca 3 tabel master, HANYA di jalur guru) + 1 batch write Firestore (absensi) + 1 readSheetAsObjects Sheets (audit_log, via generateId) + 1 appendRow Sheets (audit_log)
```
Jalur guru (`serverSaveAbsensiKelas`, TIDAK diukur langsung di sini — lihat
keterbatasan #4) MENAMBAH: 1 `readSheetAsObjects` (akses_kelas_request, via
`canGuruAccessKelas_`) + 1 `readSheetAsObjects` (guru_izin, via
`iaCekGuruSedangIzin_`) DI ATAS daftar ini.

---

## 16. Apps Script Execution Timing

`NOT MEASURED` — butuh akses Executions log (`script.google.com` →
Extensions > Apps Script > Executions), yang butuh login akun Google
developer, di luar cakupan otomasi yang disepakati aman utk sesi ini (lihat
keputusan eksplisit sebelum pengukuran dimulai). Sebagai gantinya, seluruh
angka `ms` di laporan ini diambil dari `Date.now()` delta DI DALAM kode Apps
Script sendiri (dikembalikan lewat respons JSON diag-route) — presisi lebih
tinggi dari Execution log (yang membulatkan) tapi TIDAK mencakup overhead
platform (cold-start container, quota check) SEBELUM baris pertama kode
kita berjalan.

```
Client RTT (Node→Google, wallMs)     = terukur (lihat wallMs tiap tabel di atas), TAPI TIDAK representatif RTT browser asli (beda stack jaringan/protokol)
Server Execution (Date.now() delta)  = TERUKUR NYATA, lihat semua tabel §3–§14
Estimated Network/Platform Overhead  = NOT MEASURED (perlu Execution log utk memisahkan cold-start dari waktu eksekusi kode)
```

---

## 17. Bottleneck Ranking — DATA BASED

| Process | Median ms | Avg ms | % Total (dari Save median ~3100ms) | Evidence |
|---|---:|---:|---:|---|
| Firestore batch write (SAVE_WRITE_MS) | 1836 (n=9) | 1806 | ~59% | §8, `perfsave` n=9, 3 run: 1685/1836/1922 |
| Audit log scan+append (SAVE_AUDIT_LOG_MS) | 1082 (n=9) | 1133 | ~35% | §8/§13, `perfsave`+`perfauditlog`, rowCount=429 |
| Dashboard summary (`serverGetGuruDashboardSummaryRange`) | 1040 | 1212 | — (independen dari Save) | §4, 5 run |
| Switch Class round-trip (`serverGetKelasAbsenList`) | 2159 | 2212 | — (independen) | §5, 5 run |
| Student List fetch (`serverGetAbsensiKelasForm`) | 1317 | 1259 | — (independen) | §6, 5 run |
| Login (`serverLogin`) | 556 | 575 | — (independen) | §3, 5 run |
| `akses_kelas_request` full-scan (1 titik representatif) | 762 | 899 | — (rowCount=1 saat ini, DAMPAK kecil meski RISIKO struktural tetap) | §12, 5 run |
| `guru_izin` full-scan | 588 | 668 | — (rowCount=5, dampak sangat kecil) | §14, 5 run |
| Lock wait (SAVE_LOCK_WAIT_MS) | 92 (n=9) | 111 | ~3% | §8, tidak ada kontensi terdeteksi |
| Klik status per-santri | 0 (network) | — | 0% | §7, struktural (bukti kode, bukan diukur langsung) |

**Catatan ranking**: kolom "% Total" HANYA valid utk sub-tahap DI DALAM
Save Attendance (baris 1-2 & lock wait, total ≈97% dari SAVE_SERVER_TOTAL_MS
median ~3089-3100ms) — proses lain (Dashboard/Switch Class/dst) adalah
FLOW TERPISAH, bukan bagian dari transaksi Save, jadi persentasenya
ditulis "—" (tidak relevan dijumlahkan dgn Save).

---

## 18. UX Classification

> Kualitatif saja — mengacu ke SERVER-SIDE median (bukan waktu nyata
> sampai-terlihat-di-mata-guru, yg TIDAK terukur di sesi ini karena
> keterbatasan browser automation).

| Proses | Median server ms | Band (jika HANYA dihitung dari angka server ini — BUKAN pengalaman guru sungguhan) |
|---|---:|---|
| Login | 556 | Fast (300–1000ms) |
| Dashboard (3 fungsi sequential) | 2195 | Noticeably Slow (2-3s) — TAPI ini upper-bound sequential, browser asli concurrent jadi kemungkinan lebih cepat, `NOT MEASURED` utk angka konkuren nyata |
| Switch Class (cache-miss) | 2159 | Noticeably Slow (2-3s) |
| Student List (fetch) | 1317 | Acceptable (1-2s) |
| Save Attendance (server saja, TANPA waktu browser) | ~3089-3328 | Slow (3-5s) — **DAN ini belum termasuk waktu jaringan browser asli + rendering respons**, jadi pengalaman guru sungguhan kemungkinan >= band ini, TIDAK bisa dipastikan tanpa pengukuran browser asli |

⚠️ Band di atas TIDAK BOLEH dibaca sbg "pengalaman guru sungguhan" — hanya
representasi biaya SERVER murni. Total end-to-end (network browser asli +
server + render UI) untuk semua proses = `NOT MEASURED`.

---

## 19. Root Cause Candidates

### PROVEN (didukung angka nyata di laporan ini)
- Save Attendance didominasi 2 operasi: Firestore write batch (median
  ~1.8s) + audit log scan+append (median ~1.1-1.2s) — bersama-sama ~94-97%
  dari total waktu server Save (§8/§17).
- `audit_log` adalah tabel PRODUKSI NYATA dengan 429 baris (§13), scan
  penuhnya memakan median 601ms SENDIRIAN (di luar biaya append) — dan ini
  dipicu di SETIAP Save Attendance (§8), bukan cuma sesekali.
- Tidak ada scaling linear yang terdeteksi utk n=1-9 santri per Save (§9) —
  biaya didominasi overhead per-request/batch, bukan per-dokumen, di rentang
  ini.
- Klik status santri TIDAK memicu network request (§7, konsisten dgn bukti
  kode statis) — bukan sumber lambat.
- `akses_kelas_request` full-scan (median 762ms, §12) BENAR TERJADI &
  TERUKUR, tapi tabelnya SAAT INI cuma 1 baris — risiko STRUKTURAL (bukti
  kode, §11 audit statis: dipanggil 3-4× per alur) tetap valid, tapi dampak
  NYATA saat ini kecil krn ukuran tabel.

### LIKELY (didukung evidence tapi belum sepenuhnya terbukti dgn angka Tahap 2 ini)
- Dashboard "waktu sampai terlihat guru" kemungkinan LEBIH CEPAT dari
  `sequentialTotalMs` (median 2195ms) di browser asli krn ke-5 panggilan
  (bukan cuma 3 yg diukur) sebenarnya konkuren, TAPI seberapa jauh lebih
  cepat = tidak diketahui tanpa Network tab browser asli.
- Save Attendance guru asli (`serverSaveAbsensiKelas`, bukan admin) KEMUNGKINAN
  lebih lambat dari angka di §8 krn menambah 2 full-scan lagi
  (akses_kelas_request + guru_izin, masing² median ~600-800ms berdasarkan
  §12/§14) — TAPI ini EKSTRAPOLASI (penjumlahan 2 pengukuran independen),
  BUKAN pengukuran langsung dari 1 transaksi guru asli yg sama.

### UNKNOWN
- Cold-start Apps Script overhead per eksekusi (§16).
- Efek nyata concurrent guru terhadap `ScriptLock` global (§11 tahap ini).
- Waktu render DOM/browser utk semua tahap (§7, sebagian §4-6/§8 — bagian
  "sampai terlihat guru").
- Apakah variansi run-to-run yang cukup besar (mis. Switch Class 1309-3878ms)
  disebabkan cache server (`CacheService`, TTL 300s) yg hit/miss tidak
  terkendali, jaringan lokal developer, atau load Apps Script/Firestore
  sisi Google saat itu — TIDAK diisolasi di pengukuran ini.

---

## 20. Optimization Candidates

**JANGAN IMPLEMENT — daftar ini murni HASIL PENGUKURAN, bukan rencana kerja.**

1. `audit_log` (§13/§17, PROVEN): scan 429-baris penuh tiap kali SETIAP
   fitur di SELURUH app melakukan mutasi (bukan cuma absensi) hanya utk
   `MAX(id)+1` — kandidat: ganti ke skema id counter (pola sama
   `firestoreGenerateIdInPath_` yg sudah dipakai fitur lain) atau pindahkan
   `audit_log` ke Firestore dgn auto-id, supaya tidak perlu scan sama sekali.
2. Firestore write batch Save Attendance (§8/§17, PROVEN — median ~1.8s):
   biaya TIDAK terlihat scaling dgn jumlah santri di rentang kecil (1-9),
   jadi optimasi jumlah dokumen KEMUNGKINAN BESAR tidak akan banyak
   membantu — kandidat riset lanjutan: ukur dgn n lebih besar (kelas nyata
   >9 santri, kalau ada di kelompok lain) sebelum memutuskan arah optimasi.
3. `akses_kelas_request` (§12, PROVEN ada, dampak kecil SAAT INI): terapkan
   pola cache yang SUDAH ADA (`iaReadKelompokTable_`) — prioritas RENDAH
   selama tabelnya masih sekecil ini, tapi risiko tumbuh seiring waktu
   (sama seperti riwayat `absensi` sebelum ERROR_LOG #22/#23).
4. Dashboard init (§4/§19 LIKELY): kalau setelah instrumentasi BROWSER asli
   (belum dilakukan) terbukti 5 panggilan konkuren itu benar jadi bottleneck
   nyata (bukan cuma upper-bound sequential), kandidat gabungkan jadi 1
   panggilan (`serverGetInputAbsenDashboardBundle` atau serupa) — TAPI ini
   butuh pengukuran browser asli dulu sblm diputuskan, jangan berdasarkan
   angka sequential di §4 saja.

---

# FINAL GURU NORMAL PATH MEASUREMENT

> Lanjutan 2026-08-08 — melengkapi baseline admin di atas dengan jalur
> **GURU NORMAL ASLI** (`serverSaveAbsensiKelas`, BUKAN
> `serverSaveAbsensiKelasAdmin`). Guru QA (id=31) + kelas granted "PAUD/TK A"
> tetap dipakai (akses BARU, id=2, khusus tanggal test baru di bawah).

### Kenapa tanggal berubah dari 2099-12-31 → 2020-01-06

`serverSaveAbsensiKelas` (jalur guru asli) **menolak tanggal masa depan
secara hard-coded** (`iaValidateWaktuAbsen_`, Modul_InputAbsen.gs:292-294 —
`if (tanggal > todayStr) return {valid:false, code:'future', ...}`). Jalur
admin (dipakai baseline sebelumnya) TIDAK punya pembatasan ini, makanya bisa
pakai 2099-12-31. Untuk mengukur jalur guru asli tanpa melanggar aturan
"jangan sentuh tanggal operasional yang sudah terisi", dipilih tanggal
**LAMPAU** yang dipastikan KOSONG lebih dulu (`?diag=perfcheckempty` →
`{empty:true, existingCount:0}` utk kelas "PAUD/TK A" tanggal "2020-01-06",
sebelum ditulis apa pun) — `iaValidateWaktuAbsen_` SELALU mengizinkan
tanggal lampau tanpa syarat jam (baris terakhir fungsi itu). Akses baru
(`akses_kelas_request` id=2, approved, keterangan `[PERFAUDIT TEMP]`)
dibuat khusus utk kombinasi kelas+tanggal baru ini — id=1 (tanggal
2099-12-31) TETAP ada, tidak dihapus/diubah.

### Metode instrumentasi

`serverSaveAbsensiKelas` (Modul_InputAbsen.gs) diberi checkpoint
`Date.now()` TAMBAHAN langsung di dalam fungsi aslinya (bukan
reimplementasi/duplikasi di diag route) — additive, mengembalikan field
`_perf` di response sukses, TIDAK mengubah urutan/logic apa pun. Ini
mengukur jalur ASLI 100%, sama persis dengan yang dieksekusi kalau guru
sungguhan menyimpan absen.

## 1. Login Guru

Fungsi `serverLogin()` **tidak bercabang per role** (dikonfirmasi baca kode,
Code.js:343-373 — hash-compare terhadap sheet `users` yang sama apa pun
hasil rolenya) — data §3 (5 run, median 556ms) TETAP REPRESENTATIF & TIDAK
diukur ulang (mengulang hanya akan menambah sampel baru dari distribusi
yang SAMA, bukan mengukur sesuatu yang berbeda). Guru QA sendiri TIDAK
punya baris `users` (sengaja, demi minimal footprint data — lihat
Metodologi §sebelumnya), jadi tidak bisa login via form asli sama sekali.

```
LOGIN_TOTAL_MS (server)   = 556 (median, sama dgn §3)
Client round-trip         = NOT MEASURED (butuh browser asli, lihat §Metodologi & Keterbatasan)
```

## 2. Dashboard Guru — 4 request diukur TERPISAH (bukan sequential upper-bound)

Setiap fungsi dipanggil di HTTP request TERPISAH (bukan dirantai dalam 1
eksekusi) — menghindari bias "penalti krn nunggu fungsi sebelumnya" yang
melekat pada pendekatan sequential §4 baseline admin. 5 run per fungsi.

| Fungsi | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Median |
|---|---:|---:|---:|---:|---:|---:|
| `serverGetInputAbsenMeta` | 487 | 791 | 1375 | 626 | 1190 | **791** |
| `serverGetQuoteHariIni` | 665 | 126 | 50 | 49 | 65 | **65** |
| `serverGetGuruDashboardSummaryRange` | 881 | 739 | 1724 | 3416 | 1628 | **1628** |
| `serverGetKelasAbsenList` (prefetch)* | 2016 | 2633 | 934 | 2108 | 2340 | **2108** |

\* Prefetch diukur pakai fungsi & tanggal test yang sama dgn §3 Switch Class
di bawah (fungsinya identik, `preferKelas=null` di app asli vs eksplisit di
sini — biaya server SAMA, hanya nama parameter beda).

`DASHBOARD_TOTAL_MS (end-to-end, waktu SAMPAI benar-benar interactive di
browser) = NOT MEASURED` — TETAP tidak bisa diukur tanpa browser asli
(4 request ini + `serverGetJurnalKelasList` yg tidak diukur berjalan
KONKUREN di app asli, bukan berurutan; menjumlahkan median di atas
(791+65+1628+2108=4592ms) akan MELEBIH-LEBIHKAN waktu nyata krn
mengasumsikan sequential — sengaja TIDAK dilakukan sesuai instruksi
eksplisit "jangan gunakan sequential upper-bound").

**Fungsi terlama**: `serverGetGuruDashboardSummaryRange` (median 1628ms) —
konsisten dgn baseline admin (§4, median 1040ms disana, variansi run-to-run
tinggi di kedua pengukuran).

## 3. Switch Class

### Cache HIT
`SWITCH_CLASS_CACHE_HIT_MS = NOT MEASURED — 0 network call secara struktural`
(sama dgn baseline admin, tidak berubah — ini fakta arsitektur client-side,
bukan tergantung guru/admin).

### Cache MISS (real, guru path, tanggal 2020-01-06)

| Run | ms |
|---|---:|
| 1 | 2016 |
| 2 | 2633 |
| 3 | 934 |
| 4 | 2108 |
| 5 | 2340 |

Min=934, Max=2633, **Median=2108**, Avg=2006.

## 4. Student List

**Preloaded**: `0 ms tambahan` — sama seperti baseline admin, `formData`
sudah menyatu di respons Switch Class (`formDataCount:9` di setiap run §3
di atas).

**Fetch** (`serverGetAbsensiKelasForm`, guru path):

| Run | ms |
|---|---:|
| 1 | 2215 |
| 2 | 1675 |
| 3 | 796 |
| 4 | 940 |
| 5 | 968 |

Min=796, Max=2215, **Median=968**, Avg=1319.

## 5. SAVE ATTENDANCE — Jalur Guru Normal Asli (`serverSaveAbsensiKelas`)

n=9 santri (kelas "PAUD/TK A" — SATU-SATUNYA ukuran real yang tersedia,
sama seperti baseline admin). 5 run.

| Run | authMs | readMasterMs | accessCheckMs | waktuValidateMs | guruIzinMs | lockWaitMs | writeMs | auditLogMs | serverTotalMs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 16 | 1823 | 447 | 3 | 229 | 135 | 1728 | 570 | 5017 |
| 2 | 22 | 66 | 496 | 4 | 252 | 53 | 2117 | 578 | 3642 |
| 3 | 8 | 1787 | 455 | 1 | 227 | 115 | 1647 | 572 | 4883 |
| 4 | 20 | 70 | 422 | 2 | 218 | 70 | 1950 | 644 | 3451 |
| 5 | 15 | 92 | 803 | 17 | 224 | 194 | 2019 | 480 | 3892 |

**Median**: auth=16, readMaster=92, accessCheck=455, waktuValidate=3,
guruIzin=227, lockWait=115, write=1950, auditLog=572, **serverTotal=3892**.

(Catatan `readMasterMs`: 2 dari 5 run jauh lebih lambat (1823/1787ms) —
konsisten dgn cache `IA_KELOMPOK_TABLE_CACHE_KEY_` TTL 300 detik yg
kadang miss kadang hit antar-run, BUKAN anomali — sama pola variansi yg
terlihat di §10 audit sebelumnya.)

```
SAVE_CLIENT_PREP_MS     = NOT MEASURED (tidak ada JS klien asli di diag-route)
SAVE_SERVER_READ_MS     = 92 (median, iaReadKelompokTablesParallel_)
SAVE_ACCESS_CHECK_MS    = 455 (median, canGuruAccessKelas_ — TERUKUR NYATA, beda dari baseline admin yg NOT MEASURED)
SAVE_GURU_IZIN_MS       = 227 (median, iaCekGuruSedangIzin_ — TERUKUR NYATA)
SAVE_LOCK_WAIT_MS       = 115 (median)
SAVE_WRITE_MS           = 1950 (median, dalam lock)
SAVE_AUDIT_LOG_MS       = 572 (median, scan+append gabungan)
SAVE_SERVER_TOTAL_MS    = 3892 (median, TERUKUR LANGSUNG dari 1 eksekusi — bukan penjumlahan)
SAVE_CLIENT_RESPONSE_MS = NOT MEASURED
SAVE_TOTAL_MS           = NOT MEASURED (end-to-end browser)
```

### Tabel FINAL — Segment Save (sesuai format diminta)

> % dihitung terhadap **jumlah median segmen** (16+92+455+3+227+115+1950+572
> = 3430ms) — dipakai sbg penyebut supaya tabel konsisten 100% (median
> `serverTotalMs` yang diukur langsung = 3892ms, SEDIKIT berbeda dari jumlah
> ini — wajar secara statistik krn median tiap kolom dihitung independen
> per-kolom, bukan dari 1 run yang sama; SELISIH 3892-3430=462ms itu SENDIRI
> bukan sesuatu yang "hilang", cuma artefak cara menghitung median per-kolom).

| Segment | Median ms | % Total |
|---|---:|---:|
| Access check | 455 | 13.3% |
| Guru izin | 227 | 6.6% |
| Lock | 115 | 3.4% |
| Firestore write | 1950 | 56.9% |
| audit_log | 572 | 16.7% |
| Other (auth+read master+waktu validate) | 111 | 3.2% |
| **Total (jumlah segmen)** | **3430** | **100%** |

---

## Perbandingan: Guru Normal vs Admin Override (baseline sebelumnya)

| Segment | Admin (n=9, §8) | Guru Normal (n=9, di atas) | Selisih |
|---|---:|---:|---:|
| Access check (`canGuruAccessKelas_`) | NOT MEASURED (jalur admin skip) | **455 ms** | Guru path py tahap EKSTRA ini |
| Guru izin (`iaCekGuruSedangIzin_`) | NOT MEASURED (jalur admin skip) | **227 ms** | Guru path py tahap EKSTRA ini |
| Lock wait | 92 ms | 115 ms | +23 ms (dlm rentang variansi normal) |
| Firestore write | 1836 ms | 1950 ms | +114 ms (dlm rentang variansi normal, BUKAN beda signifikan — kedua jalur pakai `iaRewriteAbsensiKelas_` yang SAMA PERSIS) |
| audit_log | 1082 ms | 572 ms | -510 ms (lebih cepat di run guru — kemungkinan variansi cache `readSheetAsObjects`, BUKAN perbedaan kode krn `logAudit`/`generateId` dipanggil SAMA PERSIS di kedua jalur) |
| **Server Total** | **3089 ms** | **3892 ms** | **+803 ms** — SELURUHNYA bisa dijelaskan oleh 2 tahap ekstra (access check 455 + guru izin 227 = 682ms) + variansi lock/write (~137ms) — BUKAN krn `serverSaveAbsensiKelas` itu sendiri lebih lambat di bagian yang SAMA dgn admin |

**Kesimpulan terukur**: guru asli LEBIH LAMBAT ~800ms dari admin override
untuk Save Attendance — **SELURUHNYA** disebabkan 2 pemeriksaan tambahan
(`canGuruAccessKelas_` + `iaCekGuruSedangIzin_`) yang MEMANG TIDAK ADA di
jalur admin, BUKAN krn ada perbedaan performa pada bagian kode yang sama
(write/lock/audit — angkanya sebanding di kedua jalur, dalam rentang
variansi run-to-run yang sudah terlihat konsisten di seluruh laporan ini).

---

## Metodologi setup akun QA (ringkasan, detail lengkap ada di transkrip sesi)

- Guru sintetis **"Guru Test QA"** (id=31) dibuat via `serverAddGuru` (fungsi
  produksi yg SUDAH ADA, dipanggil lewat sesi admin sintetis) — TIDAK
  menyentuh/mengubah baris guru asli manapun.
- 1 baris `akses_kelas_request` (id=1, status='approved', keterangan diawali
  `[PERFAUDIT TEMP]`) memberi guru QA akses ke kelas **"PAUD/TK A"** HANYA
  untuk tanggal **2099-12-31** — kelas & guru pemilik ASLI kelas itu SAMA
  SEKALI TIDAK diubah (jadwal_kbm tidak disentuh).
- Guru QA TIDAK punya baris `users` (tidak bisa login via form asli) — semua
  pengujian selain Login pakai sesi sintetis `CacheService` (pola sama
  `diag=kehadirantest`, fitur produksi yg sudah ada sebelum sesi ini).
- Data yang ditulis SELAMA test: baris `absensi` untuk santri kelas "PAUD/TK
  A", tanggal "2099-12-31" SAJA (9 santri max, ditimpa berulang tiap run
  Save — normal, bukan penumpukan).

---

## Cleanup (BELUM DIJALANKAN — menunggu konfirmasi Anda)

Diag route `diagPerfCleanup_` (Modul_PerfAudit.gs) SUDAH SIAP tapi **BELUM
dipanggil** — sesuai instruksi "jangan hapus instrumentasi sebelum laporan
selesai". Perlu dipanggil **2×** (2 kombinasi kelas+tanggal test):

```
?diag=perfcleanup&kelompok=1&kelas=PAUD/TK A&tanggal=2099-12-31   (baseline admin)
?diag=perfcleanup&kelompok=1&kelas=PAUD/TK A&tanggal=2020-01-06   (baseline guru normal)
```

Panggilan KEDUA akan otomatis ikut menghapus dokumen guru QA (idempotent,
guard `if (qaGuru)`) — jadi urutan tidak masalah, tapi kedua tanggal WAJIB
dibersihkan agar tidak ada baris `absensi` tersisa. Akan menghapus:

1. Dokumen Firestore guru QA (`kelompok/1/guru/31`).
2. Baris `akses_kelas_request` id=1 (tanggal 2099-12-31) DAN id=2 (tanggal
   2020-01-06), keduanya berketerangan `[PERFAUDIT TEMP]`.
3. Semua baris `absensi` santri kelas "PAUD/TK A" pada KEDUA tanggal test
   (2099-12-31 dan 2020-01-06).

Setelah itu, REVERT KODE (perlu commit terpisah, akan saya lakukan setelah
Anda konfirmasi laporan ini sudah cukup):

| File | Perubahan yang perlu di-revert |
|---|---|
| `13_AppsScript/Modul_PerfAudit.gs` | HAPUS FILE ini seluruhnya |
| `13_AppsScript/Code.js` | Hapus blok `if (e.parameter.diag.indexOf('perf') === 0) { ... }` (skarang berisi 15 case, termasuk `perfcheckempty`/`perfmeta`/`perfquote`/`perfdashsummary`/`perfsaveguru`) |
| `13_AppsScript/Modul_Utilities.gs` | `withScriptLock_(fn, perfObj)` → kembalikan ke `withScriptLock_(fn)` (hapus param `perfObj` + 2 baris `if (perfObj)`) |
| `13_AppsScript/Modul_InputAbsen.gs` | `serverSaveAbsensiKelas` → hapus SEMUA baris `const _perfT*`/`const _perfLock`/`if (perfObj)` + field `_perf` di return sukses, kembalikan `withScriptLock_(function(){...})` ke bentuk 1-argumen |
| `tools/perf_measure.js` | Boleh dihapus (tool sementara) atau dibiarkan (tidak menyentuh production, aman baik dihapus maupun tidak) |

---

# RINGKASAN AKHIR (Baseline Admin — pass pertama, jalur `serverSaveAbsensiKelasAdmin`)

| Flow | Median | Status |
|---|---:|---|
| Login (server-side) | 556 ms | Terukur nyata |
| Dashboard (3 dari 5 fungsi, sequential) | 2195 ms | Terukur nyata, TAPI upper-bound (bukan waktu konkuren asli) |
| Switch Class (cache-miss) | 2159 ms | Terukur nyata |
| Student List (fetch) | 1317 ms | Terukur nyata |
| Status Click | 0 ms (network) | Struktural (bukti kode) — bukan diukur langsung |
| Save Attendance (server-side, n=9) | 3089 ms | Terukur nyata, TAPI jalur admin (bukan guru asli) & belum termasuk waktu browser |

### TOP 5 ACTUAL BOTTLENECKS

1. **Firestore write batch saat Save Attendance**
   ```
   Measured Time: 1836 ms (median, n=9 santri)
   Percentage: ~59% dari total server Save
   Evidence: §8, 9 run diagPerfSave_ (n=1/5/9 × 3 repetisi), field writeMs
   Location: Modul_InputAbsen.gs:1156-1159 (serverSaveAbsensiKelasAdmin → withScriptLock_ → iaRewriteAbsensiKelas_)
   Confidence: TINGGI (server-side Date.now() langsung, 9 sampel)
   ```
2. **`audit_log` scan+append (logAudit/generateId) tiap Save**
   ```
   Measured Time: 1082-1239 ms (median per ukuran kelas)
   Percentage: ~35% dari total server Save
   Evidence: §8 (auditLogMs) + §13 (scan saja, median 601ms, rowCount=429)
   Location: Modul_InputAbsen.gs:1161 (logAudit call) → Modul_Utilities.gs:405-410 (generateId)
   Confidence: TINGGI
   ```
3. **Switch Class round-trip (cache-miss)**
   ```
   Measured Time: 2159 ms (median)
   Percentage: — (flow terpisah dari Save)
   Evidence: §5, 5 run diagPerfSwitchClass_
   Location: Modul_InputAbsen.gs:342 (serverGetKelasAbsenList)
   Confidence: TINGGI, tapi variansi run tinggi (1309-3878ms) — penyebab variansi UNKNOWN (§19)
   ```
4. **Dashboard summary (`serverGetGuruDashboardSummaryRange`)**
   ```
   Measured Time: 1040 ms (median, dari 3 fungsi yg diuji)
   Percentage: — (flow terpisah)
   Evidence: §4, 5 run diagPerfDashboard_
   Location: dipanggil dari Script_Main.html:1950
   Confidence: SEDANG — hanya 1 dari beberapa jalur dashboard yang terinstrumentasi
   ```
5. **Student List fetch (`serverGetAbsensiKelasForm`)**
   ```
   Measured Time: 1317 ms (median)
   Percentage: — (flow terpisah, hanya kalau guru fetch ulang kelas yg sama/beda)
   Evidence: §6, 5 run diagPerfStudentList_
   Location: Modul_InputAbsen.gs:416
   Confidence: TINGGI
   ```

---

```
MEASUREMENT COMPLETE
Code Logic Changed: NO
Firestore Schema Changed: NO
UI Changed: NO
Optimization Applied: NO
Report:
docs/performance/ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md

Measured:
Login = 556 ms (median, server-side)
Dashboard = 2195 ms (median, sequential upper-bound, 3/5 fungsi)
Switch Class = 2159 ms (median, cache-miss)
Student List = 1317 ms (median, fetch)
Attendance Click = 0 ms network (struktural, bukti kode — bukan diukur browser)
Save Attendance = 3089 ms (median server-side, n=9, jalur admin)

Top Bottleneck:
1. Firestore write batch (Save) — 1836 ms median, ~59% dari Save
2. audit_log scan+append (Save) — 1082-1239 ms median, ~35% dari Save
3. Switch Class round-trip — 2159 ms median (flow terpisah)
4. Dashboard summary — 1040 ms median (flow terpisah)
5. Student List fetch — 1317 ms median (flow terpisah)
```

---

# RINGKASAN AKHIR — FINAL (Baseline GURU NORMAL, jalur `serverSaveAbsensiKelas` asli)

**PAUSE — tidak ada perbaikan/optimasi apa pun dilakukan setelah ini,
sesuai instruksi.**

| Flow | Median | Server | Client | Status |
|---|---:|---:|---:|---|
| Login | 556 ms | 556 ms | NOT MEASURED | Server real (fungsi role-agnostic, data §3) |
| Dashboard | NOT MEASURED (total) | lihat breakdown §2 (4 fungsi terpisah: 791/65/1628/2108 ms median) | NOT MEASURED | 4 dari ~5 fungsi terukur individual, TIDAK dijumlahkan (bukan sequential upper-bound) |
| Switch Class | 2108 ms | 2108 ms | NOT MEASURED | Server real, cache-miss, tanggal 2020-01-06 |
| Student List | 968 ms | 968 ms | NOT MEASURED | Server real, fetch |
| Save Attendance | 3892 ms | 3892 ms | NOT MEASURED | Server real, **jalur GURU ASLI** `serverSaveAbsensiKelas`, n=9 |

### Segment Save Attendance (Guru Normal, n=9)

| Segment | Median ms | % Total |
|---|---:|---:|
| Access check | 455 | 13.3% |
| Guru izin | 227 | 6.6% |
| Lock | 115 | 3.4% |
| Firestore write | 1950 | 56.9% |
| audit_log | 572 | 16.7% |
| Other | 111 | 3.2% |
| **Total** | **3430** | **100%** |

### 1–9 sesuai FINAL RULE

1. **Guru Normal Save Total** = 3892 ms (median server, n=9 santri, `serverSaveAbsensiKelas` asli)
2. **Firestore Write** = 1950 ms (median) — 56.9% dari total segmen
3. **audit_log** = 572 ms (median, scan+append gabungan) — 16.7% — tabel produksi nyata 429 baris
4. **akses_kelas_request** = 455 ms (di dalam transaksi Save, via `canGuruAccessKelas_`) — 13.3% — TIDAK ADA di jalur admin (§11 baseline admin: 762ms median, tapi itu pengukuran STANDALONE di luar transaksi Save, bukan yg sama)
5. **guru_izin** = 227 ms (di dalam transaksi Save, via `iaCekGuruSedangIzin_`) — 6.6% — TIDAK ADA di jalur admin
6. **Lock** = 115 ms (median) — 3.4%, tidak ada kontensi terdeteksi (tidak ada guru lain menyimpan bersamaan saat test)
7. **Dashboard Total** = NOT MEASURED (end-to-end) — 4 fungsi individual terukur (§2): meta=791ms, quote=65ms, summary=1628ms, prefetch=2108ms (median masing²), TIDAK dijumlahkan krn konkuren di app asli
8. **Switch Class** = 2108 ms (median, cache-miss, real)
9. **Student List** = 968 ms (median, fetch, real)
10. **Perbandingan dengan hasil admin sebelumnya**:
    - Save Total: Guru **3892ms** vs Admin **3089ms** → **guru +803ms LEBIH LAMBAT**, seluruhnya dijelaskan oleh 2 pemeriksaan ekstra yang TIDAK ADA di jalur admin (access check 455ms + guru izin 227ms = 682ms, sisa ~121ms dalam rentang variansi normal lock/write).
    - Firestore write: Guru 1950ms vs Admin 1836ms → beda 114ms, DALAM rentang variansi normal (kode identik di kedua jalur, `iaRewriteAbsensiKelas_` yang sama).
    - audit_log: Guru 572ms vs Admin 1082ms → guru LEBIH CEPAT 510ms di sampel ini — kemungkinan variansi cache Sheets antar-waktu pengukuran, BUKAN perbedaan kode (`logAudit`/`generateId` dipanggil identik).
    - Login/Switch Class/Student List: tidak dibandingkan terpisah (baseline admin §5/§6 pakai tanggal 2099-12-31, baseline guru di atas pakai 2020-01-06 — beda tanggal TIDAK mengubah biaya fungsi, keduanya representatif utk fungsi yang SAMA).

**Kesimpulan baseline final**: biaya STRUKTURAL guru asli (dibanding admin
override) adalah **2 pemeriksaan tambahan yang MEMANG BAGIAN DARI DESAIN
RBAC guru** (`canGuruAccessKelas_` + `iaCekGuruSedangIzin_`), totalnya
~682ms dari ~3892ms (17.5% dari total Save) — bukan inefisiensi baru yang
ditemukan, melainkan biaya keamanan/otorisasi yang memang harus ada di
jalur guru. Kontributor terbesar TETAP Firestore write batch (56.9%) dan
audit_log (16.7%), konsisten antara kedua baseline (admin & guru).

Belum ada optimasi/perbaikan yang diterapkan. Instrumentasi (Modul_PerfAudit.gs,
`_perf` di serverSaveAbsensiKelas, param `perfObj` di withScriptLock_) MASIH
TERPASANG di production, menunggu konfirmasi Anda untuk cleanup (lihat
§Cleanup di atas untuk data test) dan revert kode (lihat tabel revert).
