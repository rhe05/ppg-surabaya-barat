# Audit Performa — Alur "Input Kehadiran" (Guru Mobile)

> Metodologi: **STATIC CODE ANALYSIS ONLY**. Tidak ada eksekusi, tidak ada
> instrumentasi, tidak ada akses ke instance production. Semua klaim non-timing
> disertai `file:line`. Semua metrik waktu yang tidak bisa diturunkan dari kode
> ditandai `NOT MEASURED` beserta catatan instrumentasi yang dibutuhkan.
>
> Tanggal audit: 2026-08-08. Repo: `C:\Users\user\Documents\PPG_Surabaya_Barat`.

---

## 1. Executive Summary

Alur Input Kehadiran guru (mobile) sudah melalui **banyak putaran optimasi nyata**
yang tercatat di `ERROR_LOG.md` dan `FILE_MAP.md` (ERROR_LOG #18–#23, #29–#30,
audit performa 2026-08-05/06/07). Sebagian besar area "klasik" penyebab lambat
(N+1 scan sheet, lock global menahan operasi lambat, baca berurutan padahal bisa
paralel) **sudah ditangani dan masih terlihat aktif di kode saat ini** — dikonfirmasi
lewat pembacaan langsung, bukan hanya percaya pada changelog.

Namun audit statis ini menemukan **1 pola berulang yang TIDAK pernah tersentuh
oleh sprint-sprint sebelumnya**: tabel `akses_kelas_request` dan `audit_log`
masih dibaca via `readSheetAsObjects()`/`generateId()` generik — full-table-scan
tanpa cache dan tanpa scoping — dan keduanya berada di jalur permintaan yang
dieksekusi pada **hampir setiap** panggilan server dalam alur ini (lihat §11, §12).
Ini persis pola yang sudah diperbaiki untuk `santri`/`guru`/`jadwal_kbm`/`absensi`,
tapi belum diterapkan ke dua tabel ini.

Karena tidak ada instrumentasi timing di kode maupun akses ke log eksekusi
production, **seluruh angka durasi dalam dokumen ini adalah `NOT MEASURED`**.
Ranking bottleneck di §12 murni berbasis risiko struktural (jumlah panggilan
berurutan, cakupan lock, pola N+1) yang terlihat di kode — bukan pengukuran.

---

## 2. Current Architecture

Aplikasi memakai backend Google Apps Script tunggal (`Code.js` + `Modul_*.gs`)
yang melayani satu halaman `HtmlService` (Index.html shell + Style_Main.html +
Markup_Screens.html + Script_Main.html, lihat `FILE_MAP.md`). Storage bersifat
**hybrid Sheets/Firestore, migrasi per-kelompok**:

- `13_AppsScript\Modul_Utilities.gs:71-77` — `FIRESTORE_KELOMPOK_TABLES_`:
  hanya **Kelp Petemon (`kelompok_id: '1'`)** yang tabel
  `santri`/`guru`/`jadwal_kbm`/`jadwal_kategori_hari`/`absensi`-nya sudah
  pindah ke Firestore (`kelompok/{id}/{tabel}`). **17/18 kelompok lain masih
  100% Google Sheets** untuk tabel-tabel ini — dikonfirmasi langsung dari array
  di baris tersebut, bukan hanya dari dokumentasi.
- `13_AppsScript\Modul_Utilities.gs:172-207` (`readSheetAsObjects`) — fungsi
  generik yang menggabungkan baris Sheets (kelompok belum migrasi) + Firestore
  (kelompok sudah migrasi) supaya 40+ pemanggil lama tetap benar. Untuk alur
  Input Absen, fungsi generik ini **sengaja dihindari** demi
  `iaReadKelompokTable_`/`iaReadKelompokTablesParallel_` yang di-scope ke 1
  kelompok (lihat §11).
- Tabel `akses_kelas_request`, `audit_log`, `guru_izin`, `users`, `quote_harian`
  **TIDAK** ada di `FIRESTORE_KELOMPOK_TABLES_`/`FIRESTORE_TABLES_`
  (`Modul_Utilities.gs:57,71-77`) — selalu 100% Google Sheets untuk semua
  kelompok, dibaca lewat `readSheetAsObjects()` generik (full-sheet read),
  kecuali `quote_harian` yang sudah dicache (`Modul_QuoteHarian.gs:30-38`).
- Cache: `CacheService.getUserCache()` untuk sesi login (`Code.js:370`, TTL 6
  jam) dan `CacheService.getScriptCache()` untuk data master per-kelompok
  (`Modul_Utilities.gs:480-495`, TTL 300 detik via `IA_KELOMPOK_TABLE_CACHE_KEY_`
  di `Modul_Utilities.gs:97-105`).
- Lock: `LockService.getScriptLock()` global (satu lock untuk SELURUH aplikasi,
  semua kelompok, semua fungsi mutasi) — `Modul_Utilities.gs:462-472`. Ini
  eksplisit disebut sebagai "GLOBAL" di komentar kode, artinya sesi tulis dari
  kelompok manapun saling antre satu sama lain.

**Kesimpulan arsitektur**: alur Input Kehadiran Kelp Petemon (satu-satunya
kelompok yang datanya diperiksa di audit ini karena satu-satunya yang punya
Firestore + fitur mobile guru aktif) sudah jauh dari desain awalnya (full sheet
scan berulang) menuju baca ter-scope + paralel + cache. Tapi lock tulis tetap
global lintas-kelompok, dan 2 tabel pendukung (`akses_kelas_request`,
`audit_log`) masih memakai pola lama yang sudah dianggap "solved" untuk
tabel-tabel inti.

---

## 3. Login Timing

Alur: `Script_Main.html:119-153` (`handleLogin`) → 1x `google.script.run` →
`Code.js:343-373` (`serverLogin`).

- `Code.js:344` — `readSheetAsObjects(SHEET_NAMES.USERS)`. `users` **tidak**
  ada di `FIRESTORE_TABLES_`/`FIRESTORE_KELOMPOK_TABLES_`
  (`Modul_Utilities.gs:57,71-77`), jadi ini selalu **full read Google Sheets**
  (`readSheetRowsRaw_`, `Modul_Utilities.gs:131-152`, tanpa cache) atas
  SELURUH baris tabel `users` (semua kelompok/role), lalu `.find()` linear di
  memori (`Code.js:345`) — tidak ter-scope ke satu kelompok maupun di-cache.
  Untuk jumlah user aplikasi saat ini (order puluhan) biaya ini kemungkinan
  kecil, tapi ini scan-tanpa-batas yang tumbuh seiring jumlah user, sama
  seperti pola yang sudah diperbaiki di tabel lain.
- `Code.js:334-337` — `hashPassword_` memanggil `Utilities.computeDigest`
  (SHA-256 native Apps Script) sekali per login, CPU murah.
- `Code.js:370` — sukses → tulis sesi ke `CacheService.getUserCache()`, TTL
  21600 detik (6 jam).
- Tidak ada write-path (login tidak melewati `withScriptLock_`).

`Login Total = NOT MEASURED (would require: performance.now() bracket around google.script.run(...).serverLogin(...) call in Script_Main.html:134-152, or Apps Script execution transcript for serverLogin in Code.js:343)`

---

## 4. Guru Dashboard Timing

Alur: `renderApp` → `initInputAbsen_` (`Script_Main.html:515-532`) memicu
**4 panggilan google.script.run konkuren dari klien** (lihat §10 untuk urutan
detail): `iaLoadBell_`, `iaLoadQuoteHariIni_`, `iaShowDashboardView_` →
`iaLoadDashboardSummary_`, dan `iaPrefetchGateData_`.

Fungsi utama kartu Dashboard: `serverGetGuruDashboardSummaryRange`
(`Modul_InputAbsen.gs:832-877`):
- `Modul_InputAbsen.gs:844` — `iaReadKelompokTablesParallel_([JADWAL_KBM, GURU, SANTRI], kelompokId)`
  — 1 batch (cache-hit langsung dari `CacheService`, atau kalau cache-miss,
  `UrlFetchApp.fetchAll` paralel — `Modul_InputAbsen.gs:181`) untuk 3 tabel
  sekaligus, BUKAN 3 round-trip berurutan. Ini adalah fix ERROR_LOG #19-21
  yang terverifikasi masih aktif di kode saat ini.
- `Modul_InputAbsen.gs:849` — `iaReadAbsensiKelompokRange_` di-scope ke rentang
  tanggal filter (default 1 bulan berjalan, `Script_Main.html:1903-1910`) lewat
  `firestoreRangeQuery_` (`Modul_InputAbsen.gs:93`, query `where` sisi
  Firestore) — bukan download seluruh riwayat absensi kelompok.
- Sisanya murni komputasi in-memory (`.filter`/`.map`/`.forEach`).

Sementara itu, panggilan konkuren lain di init yang **sama-sama** menyentuh
tabel yang belum ter-cache/ter-scope:
- `iaLoadBell_` → `serverGetInputAbsenMeta` (`Modul_InputAbsen.gs:312-330`) →
  baris 317 `readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST)` — full sheet
  scan tanpa cache (lihat §11).
- `iaPrefetchGateData_` (`Script_Main.html:628` dst.) memicu
  `serverGetKelasAbsenList` (lihat §5) di background — juga menyentuh
  `AKSES_KELAS_REQUEST` full-scan (`Modul_InputAbsen.gs:360`).

Karena keempatnya dikirim sebagai `google.script.run` terpisah dari browser,
mereka **berjalan sebagai eksekusi Apps Script independen** (bukan 1 eksekusi
paralel di sisi server) — masing-masing punya overhead cold-start/quota sendiri;
browser mengirimnya konkuren tapi Apps Script per-user execution quota bisa
membuat efek antrean tidak deterministik. Ini adalah karakteristik platform GAS,
bukan bug di kode aplikasi ini.

`Dashboard Total = NOT MEASURED (would require: console.time('ia_dashboard') di awal initInputAbsen_ Script_Main.html:515 sampai callback iaLoadDashboardSummary_ onResult Script_Main.html:1927, plus Apps Script execution log utk serverGetGuruDashboardSummaryRange)`

---

## 5. Switch Class Timing

Alur: guru buka menu "Pilih Kelas" → `iaMenuGoPilihKelas_` → `iaOpenKelasGate_`.

- **Prefetch nyata dan aktif**: `iaPrefetchGateData_` (`Script_Main.html:628`
  dst., dipanggil dari `initInputAbsen_:531` dan `iaOnTanggalChange_:2196-2197`)
  memanggil `serverGetKelasAbsenList` diam-diam di background dan menyimpan
  hasilnya ke `window.iaKelasGatePrefetch_`. `iaOpenKelasGate_` mengecek cache
  ini dulu (guard `!iaState_.kelas`, dijelaskan di `FILE_MAP.md` baris
  "Perf popup pilih kelas — prefetch") — kalau cocok tanggal, popup kelas
  tampil **tanpa** `google.script.run` tambahan sama sekali. Terverifikasi ada
  di kode (bukan cuma dokumentasi) via `Script_Main.html:797`
  (`.serverGetKelasAbsenList(...)` dipanggil dari fungsi prefetch, bukan hanya
  dari klik user).
- Kalau prefetch belum selesai / cache-miss → `serverGetKelasAbsenList`
  (`Modul_InputAbsen.gs:342-411`):
  - baris 352 — `iaReadKelompokTablesParallel_` (1 batch, sama seperti §4).
  - baris 360 — `readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST)` — **full
    sheet scan tanpa cache**, tidak ter-scope kelompok (lihat §11 — ini yang
    paling sering terpanggil di seluruh alur).
  - baris 401 — `iaReadAbsensiKelompokRange_` untuk 1 tanggal (query
    ter-scope Firestore, sama seperti §4).
  - Fungsi ini SEKALIGUS menyiapkan `formKelas`/`formData` (baris 389-408) —
    gabungan "list kelas" + "form santri kelas pertama" dalam 1 round-trip,
    bukan 2 terpisah (fix ERROR_LOG #18/#19, terverifikasi masih aktif).

`Switch Class Total = NOT MEASURED (would require: console.time bracket di iaOpenKelasGate_ — cari fungsi ini di Script_Main.html sekitar baris 780-800 — dari klik menu sampai popup #iaKelasGateOverlay tampil; kalau mau pisahkan cache-hit vs cache-miss, tambah 2 titik ukur terpisah tergantung window.iaState_.kelas)`

---

## 6. Student List Timing

Daftar santri untuk kelas terpilih datang dari **salah satu** dari 2 jalur:

1. **Sudah termasuk dalam respons `serverGetKelasAbsenList`** (§5, field
   `formData`, `Modul_InputAbsen.gs:404`) — klien pakai langsung tanpa
   round-trip tambahan (`Script_Main.html:797` result handler, `if (result.formData
   && cocok kelas)` — lihat catatan ERROR_LOG #18/#19 di `FILE_MAP.md`).
2. Kalau guru pindah ke kelas LAIN (bukan yang di-preload) →
   `serverGetAbsensiKelasForm` (`Modul_InputAbsen.gs:416-442`):
   - baris 422 — `canGuruAccessKelas_` → baris 270 `readSheetAsObjects(AKSES_KELAS_REQUEST)`
     full scan (lagi — lihat §11).
   - baris 427 — `iaReadKelompokTable_(SANTRI, kelompokId)` — 1 tabel,
     cache-first (`Modul_Utilities.gs:45-64`).
   - baris 431 — `iaReadAbsensiKelompokRange_` untuk 1 tanggal, ter-scope
     Firestore.

Tidak ada indikasi N+1 per-santri di jalur ini — santri dibaca sebagai 1
koleksi/1 filter sheet, bukan 1 baca per siswa.

`Student List Total = NOT MEASURED (would require: timing terpisah dari Switch Class jika ingin isolasi — dalam praktiknya jalur 1 di atas membuat ini SELALU 0 round-trip tambahan untuk kelas pertama/preferKelas; untuk kelas lain, bracket di sekitar pemanggilan serverGetAbsensiKelasForm, Script_Main.html:2376)`

---

## 7. Attendance Input Timing (per-klik status)

`Script_Main.html:2426-2434` (`window.iaSetStatus_`):
```js
window.iaSetStatus_ = function (santriId, status, btnEl) {
  const item = window.iaState_.list.find(...);
  if (item) item.status = status;
  ... // toggle class .active pada tombol
  window.iaUpdateProgress_();
};
```
Dipanggil dari `onclick` tombol Hadir/Izin/Sakit/Alpa
(`Script_Main.html:2400-2403`). **Tidak ada `google.script.run` di fungsi ini
maupun di `iaUpdateProgress_` (`Script_Main.html:2436-2443`)** — keduanya
murni mutasi state JS lokal (`window.iaState_.list`) + update DOM
(`textContent`/`classList`). Setiap klik status per santri adalah operasi
klien murni, nol network round-trip, sampai guru menekan "Simpan Kehadiran".

`Attendance Input Total (per klik) = NOT MEASURED (tidak relevan diukur via network — ini murni operasi DOM/JS lokal; kalau ingin verifikasi tidak ada jank, ukur pakai performance.mark di awal/akhir iaSetStatus_ Script_Main.html:2426, bukan Network tab)`

---

## 8. Attendance Save Timing

Alur: tombol "Simpan Kehadiran" → `window.saveInputAbsen_`
(`Script_Main.html:2534-2608`) → 1x `google.script.run` →
`serverSaveAbsensiKelas` (`Modul_InputAbsen.gs:584-637`, guru) atau
`serverSaveAbsensiKelasAdmin` (mode admin override).

Urutan kerja server (guru, non-admin):
1. `Modul_InputAbsen.gs:596` — `iaReadKelompokTablesParallel_([JADWAL_KBM, GURU, SANTRI], kelompokId)`, 1 batch (cache-first).
2. `Modul_InputAbsen.gs:601` — `canGuruAccessKelas_` → **`readSheetAsObjects(AKSES_KELAS_REQUEST)` full scan** (§11) — di luar lock, tapi tetap menambah latensi permintaan guru ini sendiri.
3. `Modul_InputAbsen.gs:605` — `iaValidateWaktuAbsen_`, murni komputasi (in-memory, pakai data yang sudah dibaca).
4. `Modul_InputAbsen.gs:610` — `iaCekGuruSedangIzin_` → `readSheetAsObjects(SHEET_NAMES.GURU_IZIN)` full scan (`GURU_IZIN` juga tidak ada di daftar Firestore/cache — tabel kecil per app tapi pola sama).
5. `Modul_InputAbsen.gs:631-633` — **`withScriptLock_`** membungkus HANYA `iaRewriteAbsensiKelas_` (baris 632) — cakupan lock SUDAH DIPERSEMPIT ke operasi tulis saja (bukan mencakup langkah 1-4 di atas). Ini adalah fix ERROR_LOG #22, terverifikasi kode saat ini benar-benar hanya membungkus 1 baris pemanggilan, bukan seluruh fungsi.
6. Di dalam `iaRewriteAbsensiKelas_` (`Modul_InputAbsen.gs:454-489`): kalau kelompok sudah Firestore (Kelp Petemon) → `iaRewriteAbsensiKelasFirestore_` → `iaBulkWriteAbsensiFirestore_` (`Modul_InputAbsen.gs:517-560`) — **1 batch `UrlFetchApp.fetchAll`** berisi N request delete + M request PATCH (upsert, id dokumen deterministik `absensiDocId_`, TANPA baca-dulu — `Modul_Utilities.gs:451-453`). Ini fix dari analisis performa 2026-08-05 opsi A, terverifikasi aktif.
   Kalau kelompok belum Firestore → jalur Sheets (`Modul_InputAbsen.gs:462-488`): 1x `getRange().getValues()` baca semua baris absensi, 1x `clearContent()`, 1x `setValues()` — juga sudah batch, bukan N kali `deleteRowByQuery`/`appendRow`.
7. **Setelah lock dilepas**: `Modul_InputAbsen.gs:635` — `logAudit('absensi', ..., ctx.user.id, ...)` → `Modul_MaintainSantri.gs:278-283` → **`generateId(SHEET_NAMES.AUDIT_LOG)`** (`Modul_Utilities.gs:405-410`) memanggil `readSheetAsObjects(AUDIT_LOG)` — **full scan SELURUH tabel `audit_log`** (tabel ini dicatat oleh SEMUA mutasi di SELURUH aplikasi — Absensi, Guru, Santri, Kurikulum, dll — jadi tumbuh cepat dan tanpa batas) hanya untuk menghitung `MAX(id)+1`, lalu `appendRowToSheet` (`Modul_Utilities.gs:240-253`, `sheet.appendRow`). Ini di LUAR lock (tidak memblokir guru lain), tapi tetap 1 full-table-scan pada **jalur kritis** simpan absen milik guru itu sendiri, dan biayanya tumbuh seiring waktu berjalan — persis pola yang sudah "disembuhkan" untuk `absensi` sendiri (ERROR_LOG #22) tapi belum diterapkan ke `audit_log`. Lihat §11 dan §12.

`Jumlah Santri = NOT MEASURED (tergantung jumlah santri per kelas riil di sheet — kode tidak membatasi angka ini secara eksplisit)`
`Jumlah Write = 1 batch UrlFetchApp.fetchAll berisi (jumlah santri dihapus + jumlah santri di-upsert) request paralel, lihat Modul_InputAbsen.gs:517-560 (jalur Firestore, Kelp Petemon) — ATAU 1 batch clearContent+setValues (jalur Sheets, kelompok lain), Modul_InputAbsen.gs:482-487 — PLUS 1 appendRow terpisah ke audit_log (Modul_Utilities.gs:252) di luar batch manapun`
`Total Write Time = NOT MEASURED`
`Average Write/Santri = NOT MEASURED`
`Save Attendance Total = NOT MEASURED (would require: console.time bracket di window.saveInputAbsen_ Script_Main.html:2534 sampai onSaveResult Script_Main.html:2558, plus Apps Script execution transcript untuk serverSaveAbsensiKelas — idealnya pecah jadi sub-segmen: langkah 1-4 [baca+validasi] vs langkah 5-6 [lock+tulis] vs langkah 7 [logAudit] agar kontribusi logAudit_ ke total waktu terlihat terpisah)`

---

## 9. Refresh/Reload Timing

Guard cache klien: `window.iaState_.dashboardLoadedKey`/`kelasLoadedKey` +
`iaDashboardCacheKey_()`/`iaKelasCacheKey_()`.

- `Script_Main.html:1491` — `iaShowDashboardView_`: `if (window.iaState_.dashboardLoadedKey === iaDashboardCacheKey_()) return;` — kalau kunci (kombinasi filter tanggal/bulan) sama dengan load terakhir, **skip total `google.script.run`**, DOM lama (disembunyikan via `display:none`, bukan dihapus) langsung ditampilkan lagi.
- `Script_Main.html:1506` — pola identik untuk `iaShowKelasView_`.
- `Script_Main.html:2567` — setelah **Simpan Kehadiran sukses**, `window.iaState_.dashboardLoadedKey = null;` secara eksplisit — guard diputus sengaja supaya Dashboard yang dibuka berikutnya TIDAK memakai data basi (absen yang baru saja disimpan wajib ter-refresh).

Jadi: buka ulang Dashboard/Kelas dengan filter yang SAMA di sesi yang sama =
0 network round-trip (cache klien). Buka dengan filter BERBEDA, atau setelah
Simpan sukses = fetch penuh seperti biasa (§4/§5/§6).

`Refresh Total (cache-hit) = 0 google.script.run calls (verified via guard logic Script_Main.html:1491/1506) — durasi render DOM murni NOT MEASURED (would require performance.now() di awal/akhir iaShowDashboardView_/iaShowKelasView_)`
`Refresh Total (cache-miss, mis. ganti filter) = sama seperti §4/§5, NOT MEASURED`

---

## 10. Request Map

Urutan `google.script.run` dari app dibuka sampai Simpan Kehadiran sukses
(kondisi: token sesi sudah ada di `sessionStorage`, guru langsung ke Dashboard,
prefetch belum pernah dipanggil sesi ini):

| # | Trigger (klien) | Server function | File:line (client call) | File:line (server def) |
|---|---|---|---|---|
| 1 | `window.onload` | `serverCheckDevMode` | `Script_Main.html:51` | `Code.js:311` |
| 2 | (devMode false, token tersimpan) `verifySession(token)` | `serverGetSession` | `Script_Main.html:155-170` | `Code.js:609` |
| 3 | `renderApp` → `initInputAbsen_` → `iaLoadBell_` | `serverGetInputAbsenMeta` | `Script_Main.html:2193` | `Modul_InputAbsen.gs:312` |
| 4 | `initInputAbsen_` → `iaLoadQuoteHariIni_` | `serverGetQuoteHariIni` | `Script_Main.html:2460` | `Modul_QuoteHarian.gs:26` |
| 5 | `initInputAbsen_` → `iaShowDashboardView_` → `iaLoadDashboardSummary_` | `serverGetGuruDashboardSummaryRange` | `Script_Main.html:1950` | `Modul_InputAbsen.gs:832` |
| 6 | `initInputAbsen_` → `iaPrefetchGateData_` (background, kelas) | `serverGetKelasAbsenList` | `Script_Main.html:797` | `Modul_InputAbsen.gs:342` |
| 6b | `initInputAbsen_` → `iaPrefetchGateData_` (background, jurnal — di luar cakupan absen tapi dipicu bersamaan) | `serverGetJurnalKelasList` | `Script_Main.html:994` | `Modul_Jurnal.gs` (tidak dibaca detail, di luar cakupan) |
| 7 | Guru klik "Pilih Kelas" → `iaOpenKelasGate_` | *(0 call kalau prefetch #6 sudah selesai & tanggal cocok — cache-hit)* | `Script_Main.html` (fungsi `iaOpenKelasGate_`, dekat baris 780-800) | — |
| 7b | (fallback, prefetch belum selesai) | `serverGetKelasAbsenList` | sama seperti #6 | `Modul_InputAbsen.gs:342` |
| 8 | Guru klik status Hadir/Izin/Sakit/Alpa per santri (0..N kali) | *(tidak ada — state lokal JS)* | `Script_Main.html:2426` (`iaSetStatus_`) | — |
| 9 | Guru klik "Simpan Kehadiran" | `serverSaveAbsensiKelas` | `Script_Main.html:2606` | `Modul_InputAbsen.gs:584` |

Catatan: langkah #3, #4, #5, #6 ditembak sebagai `google.script.run` terpisah
secara berurutan di kode (`initInputAbsen_`, `Script_Main.html:528-531`)
tanpa saling menunggu (`.withSuccessHandler` async) — browser mengirimkannya
mendekati bersamaan, tapi ini BUKAN 1 permintaan gabungan di sisi server
(beda dengan pola batch `UrlFetchApp.fetchAll` di dalam 1 fungsi server yang
dipakai di §4/§8).

Total distinct server functions dari app-open sampai save-success (jalur
tercepat, semua cache-hit di langkah #7): **6** (`serverCheckDevMode`,
`serverGetSession`, `serverGetInputAbsenMeta`, `serverGetQuoteHariIni`,
`serverGetGuruDashboardSummaryRange`, `serverGetKelasAbsenList`,
`serverSaveAbsensiKelas`) — koreksi: **7** fungsi berbeda kalau prefetch
kelas (#6) dihitung terpisah dari klik Simpan.

---

## 11. Firestore Read/Write Analysis

**Sequential vs parallel** — dikonfirmasi lewat grep `fetchAll` di
`Modul_InputAbsen.gs`:
- `Modul_InputAbsen.gs:181` — `iaReadKelompokTablesParallel_`: baca >1 tabel
  Firestore (`santri`/`guru`/`jadwal_kbm`/`jadwal_kategori_hari`) dalam **1**
  `UrlFetchApp.fetchAll` batch, dipakai oleh `serverGetKelasAbsenList` (§5),
  `serverGetGuruDashboardSummary(Range)` (§4), `serverSaveAbsensiKelas` (§8).
  Verified: bukan `UrlFetchApp.fetch` satu-satu di loop.
- `Modul_InputAbsen.gs:550` — `iaBulkWriteAbsensiFirestore_`: SEMUA
  delete+patch (upsert) absensi 1 kelas/1 tanggal dikirim dalam **1**
  `UrlFetchApp.fetchAll` batch — bukan N request berurutan.
- `Modul_InputAbsen.gs:93-95` (`iaReadAbsensiKelompokRange_`) —
  `firestoreRangeQuery_`/`firestoreRunQuery_` (`where` di sisi Firestore) untuk
  baca absensi ter-scope tanggal, BUKAN `firestoreListCollection_` (full
  collection) yang lalu difilter di Apps Script. Ini query push-down asli,
  bukan simulasi.

**N+1 patterns yang MASIH ADA** (tidak tersentuh sprint-sprint sebelumnya):
- `Modul_InputAbsen.gs:270` (`canGuruAccessKelas_`) — `readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST)`, full Sheets read (bukan Firestore — tabel ini tidak ada di `FIRESTORE_KELOMPOK_TABLES_`), tanpa cache, tanpa scope kelompok. Dipanggil dari:
  - `serverGetAbsensiKelasForm` (`Modul_InputAbsen.gs:422`, §6)
  - `serverSaveAbsensiKelas` (`Modul_InputAbsen.gs:601`, §8) — pada **setiap klik Simpan**
- `Modul_InputAbsen.gs:317` (`serverGetInputAbsenMeta`) dan `:360` (`serverGetKelasAbsenList`) — masing-masing panggilan terpisah lagi ke `readSheetAsObjects(AKSES_KELAS_REQUEST)` (tidak berbagi hasil satu sama lain, tidak berbagi dengan `canGuruAccessKelas_`) — dalam SATU alur "buka app → pilih kelas → simpan", tabel `akses_kelas_request` **penuh dibaca ulang dari nol minimal 3-4 kali** (langkah #3, #6/#7b, dan di dalam §6/§8 lewat `canGuruAccessKelas_`), tidak ada cache maupun scoping seperti yang sudah diterapkan ke `santri`/`guru`/`jadwal_kbm` (`IA_KELOMPOK_TABLE_CACHE_KEY_`, `Modul_Utilities.gs:97-105`, sengaja TIDAK menyertakan `akses_kelas_request`).
- `Modul_InputAbsen.gs:570` (`iaCekGuruSedangIzin_`) — `readSheetAsObjects(SHEET_NAMES.GURU_IZIN)` full scan, dipanggil di setiap `serverSaveAbsensiKelas` (§8 langkah 4). Sama polanya, tabel lebih kecil secara alami (1 baris per periode izin per guru) sehingga risikonya lebih rendah dibanding `akses_kelas_request`/`audit_log`.
- `Modul_Utilities.gs:405-410` (`generateId`) dipanggil dari `logAudit` (`Modul_MaintainSantri.gs:279`) → `readSheetAsObjects(AUDIT_LOG)` full scan SETIAP mutasi di SELURUH APLIKASI (bukan cuma absensi) untuk hitung `MAX(id)+1` — pada alur ini, terpicu 1x di akhir `serverSaveAbsensiKelas` (§8 langkah 7), DI LUAR `withScriptLock_` (jadi tidak menahan guru lain), tapi tabelnya tumbuh tanpa batas dan tanpa TTL/pruning yang terlihat di kode.

**Lock scope** (`withScriptLock_`, `Modul_Utilities.gs:462-472`):
- **Global** — 1 `LockService.getScriptLock()` untuk SELURUH aplikasi/semua
  kelompok/semua fungsi mutasi (bukan per-kelompok atau per-tabel).
- Di `serverSaveAbsensiKelas` (`Modul_InputAbsen.gs:584-637`), cakupan lock
  **dipersempit** ke `iaRewriteAbsensiKelas_` saja (baris 631-633) —
  memverifikasi fix ERROR_LOG #22 masih berlaku: baca (langkah 1-2),
  validasi waktu (langkah 3), cek izin guru (langkah 4), dan `logAudit`
  (langkah 7, setelah lock) **semuanya DI LUAR lock**. Hanya operasi tulis
  batch (Firestore `fetchAll` atau Sheets `clearContent`+`setValues`) yang
  memegang lock. Ini adalah pola yang benar dan sudah diterapkan dengan
  konsisten.

---

## 12. Bottleneck Ranking (berbasis RISIKO STRUKTURAL, bukan waktu terukur)

> ⚠️ **Tidak ada data Durasi/Persentase Total nyata** — kolom-kolom ini
> `NOT MEASURED` untuk semua baris. Ranking di bawah murni dari jumlah
> panggilan sekuensial, cakupan lock, dan pola N+1/full-table-scan yang
> terlihat di kode — BUKAN dari profiling.

| Proses | Durasi | Persentase Total | Penyebab | Dampak |
|---|---|---|---|---|
| `akses_kelas_request` full-scan berulang (§11) | NOT MEASURED | NOT MEASURED | 3 fungsi berbeda (`serverGetInputAbsenMeta`, `serverGetKelasAbsenList`, `canGuruAccessKelas_`) masing-masing memanggil `readSheetAsObjects(AKSES_KELAS_REQUEST)` sendiri-sendiri, tanpa cache/scope — tabel ini SATU-SATUNYA di alur ini yang belum ikut pola optimasi `IA_KELOMPOK_TABLE_CACHE_KEY_` | Terpicu di HAMPIR SETIAP request dalam alur (init, pilih kelas, simpan) — risiko tertinggi karena frekuensinya, bukan karena 1 request lambat |
| `audit_log` full-scan tiap Simpan (§8 langkah 7, §11) | NOT MEASURED | NOT MEASURED | `generateId(AUDIT_LOG)` baca SELURUH tabel audit lintas-fitur (bukan cuma absensi) untuk `MAX(id)+1`, tabel ini tumbuh oleh SEMUA mutasi di seluruh app, tanpa batas/pruning terlihat | Di luar lock (tidak memblokir guru lain) tapi menambah latensi ke request Simpan milik guru itu sendiri, dan biayanya TUMBUH seiring waktu — pola persis yang sudah "disembuhkan" utk `absensi` sendiri (ERROR_LOG #22) tapi belum untuk `audit_log` |
| `guru_izin` full-scan tiap Simpan (§8 langkah 4) | NOT MEASURED | NOT MEASURED | `iaCekGuruSedangIzin_` full scan tanpa cache | Sama pola dengan di atas tapi tabel secara alami kecil (1 baris/periode izin/guru) — risiko lebih rendah |
| Lock global lintas-kelompok (§11) | NOT MEASURED | NOT MEASURED | `withScriptLock_` satu lock untuk SEMUA kelompok & SEMUA fungsi mutasi aplikasi (bukan cuma absensi) — Simpan Kehadiran Kelp Petemon bisa antre di belakang mutasi TIDAK TERKAIT dari kelompok lain (mis. CRUD Santri/Guru kelompok lain) | Cakupan DALAM lock sudah dipersempit ke operasi tulis saja (mitigasi kuat), tapi lock itu sendiri tetap 1 titik antrean untuk SELURUH app — risiko struktural sisa, bukan regresi baru |
| 4 `google.script.run` konkuren saat init (§4/§10) | NOT MEASURED | NOT MEASURED | `initInputAbsen_` menembak `serverGetInputAbsenMeta`/`serverGetQuoteHariIni`/`serverGetGuruDashboardSummaryRange`/prefetch kelas sebagai 4 eksekusi Apps Script terpisah, bukan 1 batch gabungan | Setiap eksekusi GAS punya overhead cold-start/kuota sendiri; efeknya pada waktu-sampai-Dashboard-terlihat tidak bisa dipastikan tanpa pengukuran nyata — potensi tapi TIDAK terverifikasi sebagai bottleneck nyata |
| Baca tabel inti (santri/guru/jadwal_kbm/absensi) | NOT MEASURED | NOT MEASURED | Sudah paralel (`fetchAll`) + cache-first + Firestore range-query ter-scope | **Bukan** bottleneck struktural saat ini — sudah melalui perbaikan berlapis dan terverifikasi masih aktif |
| Klik status per-santri (§7) | NOT MEASURED (secara logika: nol network) | NOT MEASURED | Murni state JS lokal, tanpa `google.script.run` | Tidak ada risiko — dikonfirmasi bukan sumber lambat jaringan |

---

## 13. User Experience Impact

**Bagian ini bersifat kualitatif saja — TIDAK ADA data timing nyata untuk
memetakan tahap manapun ke pita UX (<300ms/300-1000ms/1-2s/2-3s/3-5s/>5s).**
Memetakan tanpa pengukuran akan berupa tebakan, bukan analisis — sengaja tidak
dilakukan di sini. Yang bisa dinyatakan berbasis kode (bukan band waktu):

- Klik status per-santri (§7): secara logika struktural HARUS terasa instan
  (nol network round-trip) — konsisten dengan band tercepat mana pun, tapi
  ini kesimpulan dari membaca kode, bukan dari mengukur jam.
- Dashboard/Kelas dengan cache-hit (§9): 0 `google.script.run`, jadi secara
  struktural jauh lebih cepat dari cache-miss — tapi seberapa cepat dalam
  detik nyata tidak diketahui.
- Simpan Kehadiran (§8): jumlah kerja per-request (baca 3 tabel paralel +
  validasi + full-scan `akses_kelas_request`/`guru_izin` + tulis batch + full-scan
  `audit_log`) secara struktural adalah tahap TERBANYAK operasinya di seluruh
  alur — tapi tanpa angka nyata, tidak bisa disimpulkan masuk band UX yang mana.

---

## 14. Recommended Optimization Priority

> Ditulis sebagai **kandidat untuk sprint optimasi terpisah di masa depan**,
> bukan sebagai instruksi yang sudah dikerjakan dalam audit statis ini
> (mandat audit ini adalah analisis, bukan eksekusi perubahan).

1. **`akses_kelas_request`: tambahkan ke pola `iaReadKelompokTable_`/cache** —
   sama seperti `santri`/`guru`/`jadwal_kbm` sudah dapat
   (`Modul_Utilities.gs:97-105`). Saat ini dibaca full-scan tanpa cache di 3
   titik berbeda (`Modul_InputAbsen.gs:317,360,270`), semuanya di jalur yang
   dieksekusi hampir setiap request dalam alur Input Kehadiran. Ini
   prioritas tertinggi karena FREKUENSI pemanggilannya, bukan ukuran
   tabelnya.
2. **`logAudit`/`generateId(AUDIT_LOG)`: ganti dari scan-MAX(id) ke skema id
   yang tidak butuh baca-dulu** (mis. counter Firestore-style seperti yang
   sudah dipakai `firestoreGenerateIdInPath_` untuk collection non-composite,
   atau `Utilities.getUuid()` kalau id tidak perlu sekuensial) —
   `Modul_MaintainSantri.gs:278-283`, `Modul_Utilities.gs:405-410`. Tabel ini
   dipakai oleh SEMUA fitur aplikasi (bukan cuma absensi), jadi perbaikan di
   sini punya efek lintas-fitur, bukan cuma Input Kehadiran.
3. **`iaCekGuruSedangIzin_`: pertimbangkan cache pendek (TTL kecil, mis. 60
   detik) atau scoping per-guru** — `Modul_InputAbsen.gs:569-577`. Risiko
   lebih rendah dari #1/#2 karena ukuran tabel alami kecil, tapi pola yang
   sama layak diseragamkan kalau #1/#2 sudah dikerjakan.
4. **`serverLogin`: pertimbangkan cache singkat untuk lookup `users` by
   username**, atau index by-username kalau jumlah user bertambah signifikan
   — `Code.js:344-345`. Saat ini risikonya rendah (jumlah user kemungkinan
   masih puluhan), tapi pola scan-linear-tanpa-cache sama dengan yang sudah
   diperbaiki di tempat lain.
5. **Evaluasi konsolidasi 4 `google.script.run` konkuren saat init**
   (`serverGetInputAbsenMeta`/`serverGetQuoteHariIni`/`serverGetGuruDashboardSummaryRange`/
   prefetch kelas, `Script_Main.html:528-531`) menjadi kurang dari 4 eksekusi
   Apps Script terpisah — TAPI ini harus didahului pengukuran nyata (§15)
   dulu untuk memastikan overhead multi-eksekusi memang signifikan sebelum
   menambah kompleksitas kode untuk manfaat yang belum terbukti.

---

## 15. Evidence & Measurement Method (Instrumentasi yang Dibutuhkan)

Tidak ada `performance.now()`/`performance.mark()`/`console.time()` di
Script_Main.html untuk alur ini saat ini (dicek via grep, tidak ditemukan
pola tersebut di sekitar fungsi-fungsi yang disebut di dokumen ini). Untuk
mendapatkan angka nyata pada audit berikutnya, titik instrumentasi yang
dibutuhkan:

| Metrik | Titik mulai | Titik selesai |
|---|---|---|
| Login Total | `Script_Main.html:134` (sebelum `google.script.run...serverLogin`) | `Script_Main.html:135` (awal `withSuccessHandler` callback) |
| Dashboard Total | `Script_Main.html:515` (awal `initInputAbsen_`) | `Script_Main.html:1927` (awal `onResult` di `iaLoadDashboardSummary_`) |
| Switch Class Total (cache-hit vs miss terpisah) | awal `iaOpenKelasGate_` (`Script_Main.html`, dekat baris 780) | saat popup `#iaKelasGateOverlay` tampil (`display` di-set) |
| Student List Total | sama seperti Switch Class kalau jalur `serverGetAbsensiKelasForm` terpisah dipakai (`Script_Main.html:2376`) | callback `onFormResult` (`Script_Main.html:2374`) |
| Save Attendance Total (+ sub-segmen) | `Script_Main.html:2534` (awal `saveInputAbsen_`) | `Script_Main.html:2558` (awal `onSaveResult`) — untuk sub-segmen server, tambah `console.log(new Date())`/timestamp manual di `Modul_InputAbsen.gs` sebelum baris 596 (baca), 631 (lock+tulis), dan 635 (logAudit) lalu diffing dari Stackdriver/Apps Script execution log |
| Server-side breakdown | Apps Script "Executions" log (Extensions > Apps Script > Executions) per fungsi di atas — beri nama fungsi unik supaya mudah difilter | — |

Untuk isolasi biaya `akses_kelas_request`/`audit_log` (§11/§12) secara
spesifik: tambahkan log sementara (`console.log`/`Logger.log`) sebelum &
sesudah tiap `readSheetAsObjects(AKSES_KELAS_REQUEST)`/`generateId(AUDIT_LOG)`
call di baris yang disebutkan, jalankan skenario nyata, baca durasi dari
Apps Script execution transcript, lalu **hapus log sementara itu** setelah
selesai (pola sama seperti diag-route sementara yang dijelaskan di
`CLAUDE.md` bagian "Prinsip Performa Firestore" — jangan biarkan
instrumentasi debug menumpuk permanen di kode production).

---

## 16. Unknown / Not Yet Measured

Semua item berikut TIDAK dapat ditentukan dari pembacaan kode statis saja —
butuh instrumentasi (§15) atau akses ke Apps Script Executions log /
Firestore metrics production:

- Waktu nyata (ms) untuk SETIAP tahap di §3–§9 — tidak ada satupun angka
  nyata di dokumen ini.
- Latensi jaringan aktual `UrlFetchApp.fetchAll` ke Firestore REST API dari
  Apps Script (tergantung region GCP project, load Firestore saat itu, dll —
  tidak terlihat dari kode).
- Overhead cold-start Apps Script per eksekusi (`serverLogin`,
  `serverGetInputAbsenMeta`, dll) — karakteristik platform, tidak
  terinstrumentasi di kode aplikasi.
- Efek nyata dari 4 `google.script.run` konkuren saat init (§4/§10/§14 item 5)
  terhadap waktu total sampai Dashboard terlihat guru — apakah signifikan
  atau diabaikan oleh concurrency browser+GAS, tidak diketahui tanpa profiling.
- Ukuran riil tabel `akses_kelas_request`/`audit_log`/`guru_izin`/`users` saat
  ini (jumlah baris) — audit ini tidak mengakses spreadsheet production,
  jadi tidak bisa memastikan berapa besar biaya full-scan itu SEKARANG (bisa
  saja kecil hari ini tapi jadi masalah nyata seiring waktu, sama seperti
  riwayat `absensi` sebelum ERROR_LOG #22/#23 diperbaiki).
- Perilaku Apps Script quota/concurrent-execution limit saat banyak guru
  membuka Input Kehadiran bersamaan (disebutkan sebagai "platform ceiling"
  di memory sesi 2026-07-28 — executeAs:USER_DEPLOYING shared quota — tapi
  tidak ada cara memverifikasi ini dari kode statis).
- Apakah `verifySession`/`serverGetSession` (`Code.js:609`, dipakai di
  langkah #2 §10) punya biaya tersembunyi — fungsi ini TIDAK dibaca detail
  dalam audit ini (di luar 7 area fokus eksplisit yang diminta), disebut di
  Request Map tapi implementasinya belum diverifikasi baris-per-baris.
- Implementasi lengkap `serverGetJurnalKelasList` (dipicu bersamaan oleh
  prefetch init, §10 langkah 6b) — di luar cakupan "Input Kehadiran", tidak
  dibaca detail, disebut hanya karena ia berbagi jalur init yang sama dan
  bisa memengaruhi kontensi eksekusi konkuren di §4.
