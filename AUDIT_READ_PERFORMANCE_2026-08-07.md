# Ruang Ngaji — Read Performance & Cost Audit

**Tanggal**: 2026-08-07
**Mode**: Audit murni — tidak ada kode yang diubah, tidak ada commit, tidak ada SQL/migration dibuat.
**Cakupan**: SELURUH project (bukan cuma Kelp Petemon), sesuai permintaan.

---

## 0. Koreksi Stack (WAJIB dibaca dulu)

Prompt asli menyebut **Backend: Supabase, Frontend: Flutter**. Setelah dicek, **tidak ada kode Flutter/Dart di mana pun** di repo ini, dan **tidak ada aplikasi Supabase yang berjalan** — yang ada:

| Yang diminta | Yang sebenarnya ada |
|---|---|
| Backend Supabase (Postgres) | **Google Sheets** (tabel utama) + **Firestore** (migrasi bertahap, baru Kelp Petemon) — dijalankan lewat **Google Apps Script** (`13_AppsScript/*.gs`, ~13.000 baris backend) |
| Frontend Flutter | **HTML/CSS/vanilla JavaScript** disajikan sebagai 1 halaman `HtmlService` (`Script_Main.html` ±9.000 baris JS, `Markup_Screens.html`, `Style_Main.html`) |
| Realtime subscription | **Tidak ada** — semua komunikasi client↔server lewat `google.script.run` (request/response biasa, dipanggil manual saat user membuka layar/klik tombol) |
| Provider/Riverpod/`ref.watch` | **Tidak ada** — tidak pakai framework reaktif, render DOM manual (`innerHTML = ...`) tiap kali data baru datang |
| RPC/View/Materialized View (Postgres) | Analognya: **fungsi server Apps Script** (`function serverXxx(...)`, ~180 fungsi total) + **CacheService** (Apps Script cache, mirip materialized view sementara) |
| Row-level index (Postgres) | Sheets **tidak punya index sama sekali** (selalu linear scan penuh); Firestore auto-index per field (composite index baru cuma perlu kalau query gabung >1 field) |

Ada juga proyek migrasi Supabase yang **sedang direncanakan** (`08_Development/tpq-app/`, frontend rencananya Next.js — bukan Flutter juga) — tapi migrasi datanya **belum dieksekusi sama sekali** (baru skema + dokumen arsitektur, 0 baris data dipindah, 0 user memakainya). Jadi audit ini fokus ke **app produksi Apps Script** yang benar-benar dipakai guru/admin tiap hari, sesuai konfirmasi Anda.

Semua istilah di 18 pertanyaan asli saya petakan 1:1 ke istilah Apps Script yang setara di bawah. Section yang benar-benar tidak relevan (mis. "Provider rebuild ala Flutter") saya tandai **N/A** dengan penjelasan padanannya.

---

## 1. Read Mapping

### 1a. Dashboard Admin PPG (desktop, `screenDashboard`)

```
Login (admin/admin123)
  │
  ├─ serverLogin()                                    [1 baca: users]
  │
renderApp() → appLayout tampil
  │
  ├─ (kalau admin_ppg) serverGetSidebarTree()          [cached 300dtk: desa+kelompok]
  │
loadDashboard()
  │
  └─ serverGetDashboardBundle()  ← SATU panggilan, TAPI di baliknya:
        ├─ readSheetAsObjects(kelompok)      [seluruh sheet]
        ├─ readSheetAsObjects(santri)        [seluruh sheet, SEMUA kelompok]
        ├─ readSheetAsObjects(guru)          [seluruh sheet, SEMUA kelompok]
        ├─ readSheetAsObjects(absensi)       [SELURUH RIWAYAT, lalu difilter 7 hari terakhir di memori]
        ├─ readSheetAsObjects(desa)          [seluruh sheet]
        ├─ readSheetAsObjects(munaqosah)     [SELURUH RIWAYAT nilai, semua santri, semua periode]
        └─ readSheetAsObjects(kurikulum_akhlaq) [SELURUH RIWAYAT nilai akhlaq]
```

→ **1 round-trip jaringan**, tapi **7 pembacaan tabel penuh** di server (sudah digabung dari 14 → 7, lihat komentar di `Modul_Dashboard.gs:9-16` — perbaikan lama yang bagus, tapi 7 masih besar & tidak di-cache sama sekali).

### 1b. Dashboard Kehadiran mobile (Guru / Admin Kelp)

```
Login → renderApp()
  │
  ├─ role='guru'      → initInputAbsen_()
  └─ role='admin_kelp'→ initAdminKelpDashboard_()
        │
        ├─ iaLoadBell_()                 [guru saja — cek notifikasi masuk, sekali]
        ├─ iaLoadQuoteHariIni_()         [guru saja — 1 baca quote_harian]
        ├─ iaShowDashboardView_()
        │     └─ iaLoadDashboardSummary_()
        │           ├─ (guru) serverGetGuruDashboardSummaryRange()
        │           │     ├─ iaReadKelompokTablesParallel_([jadwal_kbm, guru, santri])  [PARALEL, di-cache 300dtk utk Petemon]
        │           │     └─ iaReadAbsensiKelompokRange_()  [di-scope tanggal, TIDAK baca semua riwayat]
        │           └─ (admin_kelp) serverGetAdminKelpDashboardSummaryRange()  [pola sama]
        │
        └─ iaPrefetchGateData_()  [guru saja — 2 panggilan TAMBAHAN diam-diam:
              serverGetKelasAbsenList() + serverGetJurnalKelasList(),
              supaya popup "Pilih Kelas" nanti terasa instan]
```

→ Ini **sudah dioptimasi cukup jauh** (riwayat sesi 2026-07-28/08-05/08-06 sudah menangani N+1, double-read, prefetch caching — lihat memory project). Kelp Petemon spesifik sudah pindah ke Firestore + cache tabel master. **17 kelompok lain masih 100% Sheets, tanpa cache** (lihat §2, §4).

### 1c. Layar admin lain (Data Santri, Data Guru, Laporan, Statistik, Munaqosah, dst)

Pola umum yang berulang di HAMPIR SEMUA modul:

```
Buka layar
  │
  └─ serverGetXxxList(token, kelompokId)
        └─ readSheetAsObjects(SHEET_NAMES.XXX)   [BACA SELURUH SHEET, SEMUA KELOMPOK]
              └─ .filter(row => row.kelompok_id == kelompokId)   [baru difilter DI MEMORI]
```

Santri/Guru sudah dikasih cache per-kelompok (300dtk, §4). **Laporan, Statistik, Munaqosah, Konseling, Kurikulum, Kalender, Pusat Unduhan — TIDAK ADA cache sama sekali.**

---

## 2. Query Audit

Total **~180 fungsi server** (`function serverXxx`), **160 titik panggil `google.script.run`** di client, **~200 titik panggil `readSheetAsObjects`/`readSheetRowsRaw_`** di server (lihat breakdown per file di §4 lampiran).

Tabel contoh titik-titik yang paling berdampak (dipilih karena: dipanggil sering, tabelnya besar/tumbuh terus, atau tanpa cache):

| Lokasi | Fungsi | Dipanggil kapan | Blocking? | Duplikat/Redundan? |
|---|---|---|---|---|
| `Modul_Dashboard.gs:24` | `serverGetDashboardBundle` | Tiap admin_ppg buka Dashboard | Sync (Apps Script semua sync) | Baca `absensi`+`munaqosah`+`akhlaq` PENUH padahal cuma butuh 7 hari terakhir / nilai max per santri |
| `Modul_Dashboard.gs:135` | `serverGetKehadiranChart7Hari` | **TIDAK PERNAH** (dikonfirmasi dead code di komentarnya sendiri) | — | Baca 4 tabel penuh, tapi tidak dipanggil — 0 biaya nyata, tapi kode mati yang berisiko diaktifkan lagi tanpa sadar biayanya |
| `Modul_MaintainAbsensi.gs:171` | `serverSetAbsensiSatuSantri` (cabang Sheets) | Tiap admin edit 1 sel di tabel matrix Kehadiran Generus (kelompok non-Petemon) | Ya, di dalam `withScriptLock_` | Baca SELURUH riwayat absensi (semua kelompok, semua tanggal) cuma untuk cari 1 baris `santri_id+tanggal` |
| `Modul_MaintainAbsensi.gs:93` | `serverSaveAbsensiDaily` (cabang Sheets) | Tiap guru klik "Simpan Absen" (kelompok non-Petemon) | Ya, di dalam `withScriptLock_` (mengunci SEMUA penulis app) | Baca SELURUH riwayat absensi tiap kali simpan 1 kelas 1 hari — pola "hapus-total+insert-ulang" yang SUDAH diketahui jadi bottleneck besar (lihat catatan sejarah di kode + memory project, sudah diperbaiki utk Petemon lewat Firestore, BELUM utk 17 kelompok lain) |
| `Modul_Statistics.gs` (4 fungsi: baris 18,69,162,213) | `serverGetKehadiranTrend`/dst | Tiap buka tab Statistik / ganti filter | Sync | Tiap fungsi baca `absensi` PENUH sendiri-sendiri — kalau user ganti filter 4× di 1 sesi = 4× baca tabel penuh, TANPA cache |
| `Modul_Laporan.gs:128` | (fungsi laporan kehadiran) | Tiap generate laporan / ganti filter bulan | Sync | Baca `absensi` PENUH lalu difilter per bulan di memori — bisa pakai range query kalau kelompoknya Firestore |
| `Modul_MaintainKonseling.gs` (19 titik) | berbagai CRUD Konseling | Tiap buka/simpan | Sync | Modul dengan jumlah `readSheetAsObjects` per-file TERBANYAK kedua (19×) — kandidat kuat utk digabung |
| `Modul_MaintainMunaqosah.gs` (30 titik) | berbagai CRUD Munaqosah | Tiap buka/simpan | Sync | **Jumlah `readSheetAsObjects` PALING BANYAK di seluruh codebase** (30×) — modul terbesar yang belum disentuh optimasi apa pun |
| `Modul_MaintainKurikulum.gs` (29 titik, TAPI 6 di antaranya sudah pakai cache) | CRUD Prota/Promes/Probul | Tiap buka tab Kurikulum | Sync | Modul dengan cache TERBANYAK (`kurikulum_fulltree_*`, 60dtk) — contoh baik yang polanya bisa ditiru modul lain |

**Async?** Semua fungsi `serverXxx` di Apps Script berjalan **sinkron di server** (1 request = 1 eksekusi blocking sampai selesai). Yang "paralel" hanya `UrlFetchApp.fetchAll` (dipakai `iaReadKelompokTablesParallel_` untuk baca beberapa collection Firestore sekaligus) — ini SATU-SATUNYA bentuk paralelisme yang ada di codebase, dan baru dipakai di jalur mobile Kelp Petemon.

---

## 3. Read Frequency (estimasi)

**Asumsi eksplisit** (karena Apps Script tidak mengekspos ukuran payload per-request secara native — tidak ada Chrome DevTools Network tab yang bisa saya jalankan dari sini): ukuran baris dihitung dari jumlah kolom × rata-rata 15-30 karakter/kolom, dan jumlah baris memakai angka **riil production** dari `diag=kelompokdist` (lihat memory project: 199 santri, 890 baris absensi valid + 483 baris yatim, 18 guru — **baru 4 dari 18 kelompok yang punya data nyata**).

### Buka Dashboard Admin PPG 1× (kondisi SEKARANG, data kecil)

| Tabel | ±baris (semua kelompok) | ±ukuran |
|---|---|---|
| kelompok | 18 | 2 KB |
| santri | ~200 | 60 KB |
| guru | ~18 | 6 KB |
| absensi (SELURUH riwayat, bukan cuma 7 hari) | ~1.400 | 250 KB |
| desa | 5 | 1 KB |
| munaqosah (SELURUH riwayat) | belum ada data riil, asumsi ~500 saat mulai dipakai | ~150 KB |
| kurikulum_akhlaq | belum ada data riil, asumsi ~500 | ~150 KB |
| **Total per 1× buka Dashboard** | | **≈ 600 KB dibaca server** (bukan yang dikirim ke browser — hasil olahan yang dikirim jauh lebih kecil, ±5-10 KB JSON) |

→ Kalau admin buka Dashboard **20×/hari**: **≈ 12 MB dibaca server**, 20 eksekusi fungsi (masing-masing hitung CPU/quota Apps Script sendiri, lihat §16).

### Proyeksi kalau data tumbuh ke skala "puluhan ribu user" (asumsi 10.000 santri aktif, 5 tahun riwayat absensi harian)

- absensi: 10.000 santri × ±20 hari aktif/bulan × 60 bulan = **±12.000.000 baris**. `sheet.getDataRange().getValues()` pada sheet sebesar ini **akan gagal / timeout** (Apps Script punya batas 6 menit eksekusi + batas ukuran respons ~50MB) — ini bukan lagi soal "boros", tapi **akan benar-benar error**.
- Ini adalah alasan teknis paling kuat kenapa migrasi ke Firestore/Postgres (yang mendukung query bertarget, bukan baca-semua-lalu-filter) memang perlu untuk skala itu — arsitektur `readSheetAsObjects` generik **secara struktural tidak scalable** melewati puluhan-ribu baris per tabel, terlepas dari optimasi kecil apa pun.

---

## 4. Duplicate Read

### Ditemukan konkret:

1. **`Modul_Statistics.gs`**: 4 fungsi berbeda (baris 18, 69, 162, 213) sama-sama `readSheetAsObjects(SHEET_NAMES.ABSENSI)` secara independen. Kalau user membuka tab Statistik dan berpindah antar 4 sub-tab (Kehadiran/Demografi/Ranking/Growth), berpotensi 4× baca tabel absensi penuh dalam satu sesi, padahal datanya sama — bisa digabung 1× baca + proses di memori (pola PERSIS yang sudah dipakai `serverGetDashboardBundle` di Modul_Dashboard.gs, tinggal ditiru).
2. **`readSheetAsObjects(SHEET_NAMES.SANTRI)` dipanggil di dalam `readSheetAsObjects(SHEET_NAMES.ABSENSI)` sendiri** (`Modul_Utilities.gs:177`) — setiap kali ada kelompok yang sudah pindah Firestore, baca `absensi` generik SELALU ikut memicu baca `santri` PENUH lagi (untuk join kelompok_id). Ini duplikat tersembunyi: banyak fungsi yang sudah baca `santri` sendiri lalu MEMANGGIL `readSheetAsObjects(ABSENSI)` yang di baliknya baca `santri` LAGI.
3. **N+1 klasik** di `Modul_Dashboard.gs` baris 50, 69, 96 (dan pola serupa di `Modul_MaintainMunaqosah.gs`, `Modul_Monitoring.gs`): `absensiData.forEach(a => { const santri = santriData.find(s => s.id === a.santri_id); ... })` — `.find()` di dalam `.forEach()` = O(n×m). Untuk 1.400 baris absensi × 200 santri = ±280.000 operasi pencarian linear per buka Dashboard. Bukan network N+1 (masih 1 request), tapi CPU N+1 — kandidat mudah diperbaiki pakai `Map` lookup O(1), TANPA mengubah struktur query sama sekali.
4. **`iaPrefetchGateData_`** (`Script_Main.html:571`) sengaja memanggil 2 fungsi TAMBAHAN (`serverGetKelasAbsenList`, `serverGetJurnalKelasList`) setiap kali guru ganti tanggal — ini BUKAN pemborosan tersembunyi (sudah didokumentasikan sengaja, untuk mempercepat popup berikutnya), tapi tetap tercatat sebagai "2× baca tambahan per ganti tanggal" untuk kelengkapan estimasi biaya.

**Repeated Future/Stream/Provider/Notifier**: N/A — arsitektur ini tidak punya konsep tersebut (tidak ada state management framework). Padanan terdekat: variabel global `window.iaState_`/`window.currentUser` di client — sudah dipakai sebagai cache in-memory sesi (tidak fetch ulang selama SPA tidak reload), jadi risiko "duplicate fetch akibat widget rebuild" yang biasa terjadi di Flutter **tidak berlaku** di sini.

---

## 5. Over Fetching

| Lokasi | Masalah | Detail |
|---|---|---|
| `Modul_Dashboard.gs:28` | Baca SELURUH `absensi` untuk hitung kehadiran **7 hari terakhir saja** | Kalau data absensi sudah 5 tahun, ini baca 100% data untuk memakai <1% (7 hari / ±1800 hari kalau 5 tahun) |
| `Modul_Dashboard.gs:30-31` | Baca SELURUH `munaqosah` + `kurikulum_akhlaq` untuk cari **nilai MAX per santri** | Sama pola: seharusnya bisa query bertarget per santri_id kalau sudah di Firestore, atau minimal di-cache karena nilai jarang berubah |
| `readSheetAsObjects` generik (semua pemanggil) | Selalu ambil **SEMUA kolom** tiap baris (`sheet.getDataRange().getValues()`) walau pemanggil cuma butuh 2-3 field (mis. `id`, `nama`, `status`) | Padanan "SELECT *" — Google Sheets API memang tidak punya cara pilih kolom parsial semudah SQL `SELECT col1,col2`, jadi ini agak melekat pada keterbatasan platform, BUKAN murni kesalahan kode. Firestore (`firestoreListCollection_`) SAMA — ambil semua field dokumen, tidak ada field selection di helper yang ada |
| `serverGetSantriList`/`serverGetGuruList` (kelompok non-Firestore) | Baca `santri`/`guru` SEMUA 18 kelompok lalu `.filter()` ke 1 kelompok | Firestore-nya (`/kelompok/{id}/santri`) SUDAH benar (baca scoped), tapi cabang Sheets (17 kelompok) masih baca semua |

---

## 6. Under Fetching

Pola ini **jarang** ditemukan di codebase ini — kebalikannya (over-fetching) jauh lebih dominan. Satu kandidat:

- `Modul_MaintainAbsensi.gs:171` (`serverSetAbsensiSatuSantri`, cabang Firestore) sudah BENAR pakai 1 dokumen per edit (`firestoreGetDoc_`/`firestoreUpdateDoc_`) — TAPI dipanggil dari UI matrix (~20 kolom tanggal × N santri) yang secara alami memicu **banyak panggilan kecil** kalau admin edit banyak sel berurutan (1 sel = 1 round-trip). Ini bisa digabung jadi 1 panggilan batch kalau admin sering edit >1 sel sekaligus — tapi pola pemakaian nyatanya (edit sesekali, koreksi manual) membuat ini prioritas rendah (lihat §17).

---

## 7. Cache Opportunity

Cache yang **SUDAH ADA** (`cacheGet_`/`cachePut_`, `CacheService` Apps Script — mirip Redis dgn TTL, dibagi semua eksekusi/user):

| Data | TTL | File |
|---|---|---|
| `sidebar_tree` (desa+kelompok) | 300dtk | `Modul_Dashboard.gs:258` |
| `santri_k<kelompokId>` | 300dtk | `Modul_MaintainSantri.gs:65` |
| `guru_k<kelompokId>` | 300dtk | `Modul_MaintainGuru.gs` |
| `jadwalkbm_k<id>`/`jadwalkategorihari_k<id>` (Kelp Petemon mobile) | 300dtk | `Modul_Utilities.gs:97-102` |
| `kurikulum_fulltree_<kelompokId>_<tahun>` | 60dtk | `Modul_MaintainKurikulum.gs` (6 titik) |

**Yang BELUM di-cache sama sekali** (peluang terbesar):

| Data | Kenapa cocok di-cache | Keuntungan | Risiko | Estimasi hemat |
|---|---|---|---|---|
| `serverGetDashboardBundle` (Dashboard Admin PPG) | Data agregat, wajar "agak basi" 1-5 menit — tidak butuh real-time | Buka Dashboard 2× berturut-turut dalam 5 menit = 1× baca tabel, bukan 2× | Admin baru simpan data lalu buka Dashboard langsung → lihat angka lama sampai cache habis (mitigasi: invalidasi cache di titik simpan, ATAU TTL pendek 60-120dtk) | ★★★★★ — ini yang paling sering dibuka & paling berat |
| `serverGetKehadiranTrend`/dst (Statistik) | User sering ganti filter berkali-kali dalam 1 sesi tanpa data berubah | Ganti filter 4× = 1× baca, bukan 4× | Sama seperti di atas | ★★★★☆ |
| Laporan/Konseling/Munaqosah/Kalender/Pusat Unduhan | Modul dengan `readSheetAsObjects` terbanyak (19-30× per file) TAPI 0 cache | Turunkan beban baca signifikan tiap re-render UI yang sama | Data mutasi (nilai baru, sesi konseling baru) — WAJIB `cacheDrop_` di titik simpan, sama seperti pola `santri_k`/`guru_k` yang sudah ada | ★★★★☆ |

**SharedPreferences/Hive/Isar/Drift/Offline Cache/HTTP Cache**: N/A murni Flutter-side, tidak ada padanannya di Apps Script HtmlService (tidak ada local storage besar bawaan selain `sessionStorage` yang SUDAH dipakai untuk token sesi). **Browser HTTP cache**: N/A juga — `google.script.run` bukan HTTP fetch biasa yang bisa di-cache browser (selalu POST ke endpoint Apps Script internal).

---

## 8. Pagination Opportunity

| List | Status sekarang | Rekomendasi |
|---|---|---|
| Data Santri / Data Guru (desktop, per kelompok) | Load SEMUA baris kelompok itu sekaligus (`serverGetSantriList` tanpa `limit`/`offset`) | Untuk skala sekarang (±70 santri/kelompok terbesar) TIDAK masalah. Untuk skala "puluhan ribu user" (kelompok bisa punya ratusan santri) → WAJIB pagination/infinite scroll |
| `serverGetUsersList` (User Management) | **Satu-satunya fungsi yang SUDAH punya parameter `page`/`limit`** (`Modul_UserManagement.gs:13`) — tapi client (`window.loadUserManagement`) memanggilnya dengan `1, 100` hardcode, bukan navigasi halaman sungguhan | Pagination server SUDAH ada, tinggal disambungkan ke UI kalau user > 100 |
| Tabel matrix Kehadiran Generus (~20 kolom tanggal × N santri) | Load semua santri kelompok sekaligus dalam 1 matrix | Wajar untuk 1 bulan 1 kelompok (data terbatas alami oleh rentang bulan) — prioritas rendah |
| Laporan/Riwayat Absensi mobile | Sudah di-scope per tanggal/bulan (bukan "load semua") — **ini contoh yang SUDAH benar** | — |

---

## 9. Realtime Audit

**Tidak ada realtime subscription sama sekali** di seluruh codebase (dikonfirmasi: nol `setInterval` yang memanggil `google.script.run`, nol WebSocket, nol Firestore `onSnapshot`). Semua data diambil **on-demand** (saat user buka layar / klik tombol), bukan didorong terus-menerus.

- **Apakah perlu realtime?** Tidak — untuk aplikasi absensi TPQ, data tidak perlu update live antar-user (guru A input absen tidak perlu langsung terlihat guru B tanpa refresh).
- **Apakah polling lebih murah?** Tidak relevan — tidak ada polling juga.
- **Apakah cache lebih baik?** Ya (sudah dibahas §7) — cache jauh lebih murah daripada realtime UNTUK KASUS INI.
- **Kesimpulan**: ★☆☆☆☆ — bagian ini sudah optimal secara struktural (biaya realtime = 0), tidak perlu tindakan.

---

## 10. Dashboard Optimization

**Dashboard Admin PPG**: 7 kartu/tabel (4 KPI, breakdown 5 Desa, tabel Santri Teladan) semua dimuat sekaligus tiap buka layar, tidak ada lazy-load per kartu. Karena sudah 1 round-trip (§1a), memecah jadi lazy-load per kartu JUSTRU menambah jumlah request (trade-off buruk) — **rekomendasi: TETAP 1 bundle, tapi tambah cache** (lihat §7) daripada dipecah.

**Dashboard Kehadiran mobile (guru/admin_kelp)**: sudah pakai filter Bulan-Tahun manual (guru) — user harus sengaja ganti filter untuk refresh, bukan auto-refresh terus-menerus. Ini pola yang bagus (setara "refresh manual").

**Rekomendasi konkret**:
- Kartu KPI utama (4 angka) → cocok cache TTL pendek (60-120dtk), karena jarang dilihat berubah drastis dalam 1-2 menit.
- Tabel Santri Teladan → cocok cache lebih panjang (5-10 menit), nilai munaqosah/akhlaq TIDAK berubah tiap menit.
- Tambahkan tombol "Refresh" eksplisit yang menembus cache (pola `forceFresh` SUDAH ADA di `serverGetSantriList`/`serverGetGuruList` — tinggal ditiru ke Dashboard).

---

## 11. Image Optimization

Ditemukan **3 gambar**, SEMUA disematkan sebagai `data:image/png;base64,...` langsung di HTML (`Markup_Screens.html`, `Script_Main.html` header mobile) — logo brand "Ruang Ngaji" & "Kop Surat".

- **Tidak ada network fetch untuk gambar apa pun** (tidak ada `<img src="https://...">` eksternal) — jadi tidak ada biaya "berulang kali download gambar yang sama".
- **Trade-off**: base64 inline berarti gambar ini **ikut terkirim ulang setiap kali halaman HTML di-load** (tidak bisa memanfaatkan browser image cache seperti file `.png` biasa), dan memperbesar ukuran HTML awal setiap kali. Untuk ukuran logo kecil (puluhan KB) ini dampaknya minor, tapi structural — kalau nanti ditambah gambar lebih besar (foto profil guru/santri, banner), pola base64-inline yang sama akan JAUH lebih mahal.
- **Upload logo Kop Surat** sudah benar dikompres client-side sebelum dikirim (`Script_Main.html`, `window.onKsLogoFileChange_`, dibatasi ~350KB base64 — perbaikan dari bug lama ERROR_LOG #26). Ini **contoh penanganan gambar yang SUDAH baik**, pola yang sama sebaiknya dipakai kalau nanti ada fitur upload foto profil santri/guru.

---

## 12. Provider Audit

**N/A** — tidak ada Riverpod/Provider/`ref.watch`, tidak ada framework reaktif sama sekali. Render UI di client 100% manual: `document.getElementById(...).innerHTML = ...` dipanggil eksplisit setelah setiap `google.script.run` selesai.

**Padanan terdekat yang relevan** (rebuild besar yang tidak perlu):
- `window.renderUserTable`, `window.renderDataTable_` (tabel generik Santri/Guru), dan render kartu Dashboard mobile (`iaRenderDashboardCards_`) semuanya **replace total `innerHTML`** tiap kali data baru datang — bukan diff/patch parsial. Untuk ukuran list saat ini (puluhan-ratusan baris) ini tidak masalah performa browser. Untuk ribuan baris (skala besar), full-innerHTML-replace mulai terasa (browser reflow/repaint besar) — tapi ini murni masalah RENDER (CPU browser user), BUKAN pemborosan biaya server/read seperti fokus audit ini.

---

## 13. RPC Opportunity

Arsitektur ini **SUDAH 100% berbasis "RPC"** secara alami (tiap `function serverXxx()` = 1 RPC endpoint) — jadi pertanyaan "apakah query sebaiknya digabung jadi RPC" sudah punya banyak CONTOH BAIK yang sudah diterapkan:
- `serverGetDashboardBundle` (gabungan 3→1, didokumentasikan eksplisit sebagai optimasi)
- `serverGetKelasAbsenList` (mengembalikan `formKelas`+`formData` sekaligus, gabung 2 round-trip → 1)
- `serverGetKurikulumFullTree` (1 panggilan Prota→Promes→Probul bersarang)

**Padanan "Materialized View"**: CacheService (§7) berfungsi persis sebagai materialized view sementara (hasil agregasi disimpan, di-refresh berkala/manual) — rekomendasi terbesar di sini adalah **memperluas pola yang SUDAH terbukti jalan** (Dashboard bundle, Kurikulum fulltree) ke modul yang belum (Statistik, Laporan, Konseling, Munaqosah) — BUKAN membangun pendekatan baru.

**Kandidat gabungan baru yang belum ada**:
- 4 fungsi `Modul_Statistics.gs` (Kehadiran/Demografi/Ranking/Growth) → bisa digabung 1 fungsi `serverGetStatisticsBundle()`, pola sama seperti Dashboard.

---

## 14. Index Audit

**Google Sheets**: tidak punya index sama sekali (secara arsitektur) — SETIAP baca lewat `getDataRange().getValues()` = full table scan, tidak peduli seberapa spesifik filternya. Ini bukan "index yang kurang", tapi **keterbatasan platform** — Sheets bukan database yang bisa diindeks. Implikasinya: waktu baca akan **linear terhadap total baris sheet**, dan ini SATU-SATUNYA cara memperbaikinya adalah pindah ke sistem yang mendukung index sungguhan (Firestore/Postgres) — sudah jalan sebagian (Kelp Petemon → Firestore).

**Firestore** (sudah dipakai Kelp Petemon): auto-index per field tunggal sudah cukup untuk SEMUA query yang ada sekarang (`firestoreRunQuery_`/`firestoreRangeQuery_` di `absensi` pakai `where` range tanggal + equality santri_id — 2 kondisi tapi HANYA SATU field yang di-range, field lain equality, jadi TIDAK butuh composite index baru; sudah dikonfirmasi valid di CLAUDE.md "Prinsip Performa Firestore", diaudit 2026-08-05/06).

**Kesimpulan**: index bukan celah performa di sini — masalah utamanya "baca semua lalu filter" (Sheets) yang solusinya bukan index, tapi migrasi struktur data (§1, §4, §5).

---

## 15. Network Audit

**Asumsi eksplisit** (Apps Script tidak expose metrik network per-request secara native, ini estimasi dari struktur payload JSON):

| Aksi | ±Request | ±Response payload (JSON terkirim ke browser, BUKAN data mentah server) | Latency tipikal Apps Script |
|---|---|---|---|
| Login | 1 | <1 KB | 300-800ms (cold start Apps Script bisa >1detik) |
| Buka Dashboard Admin PPG | 1 | 5-15 KB (hasil olahan, bukan 600KB mentah §3) | 500ms-2detik (7× baca sheet server-side, TANPA cache) |
| Buka Dashboard Kehadiran mobile | 1-2 | 2-8 KB | 300ms-1detik (Petemon: cache; kelompok lain: baca langsung) |
| Simpan 1 kelas absensi (non-Petemon) | 1 | <1 KB | **Berpotensi lambat** — baca absensi PENUH di dalam lock global (§2) |
| Ganti filter Statistik | 1 (×4 kalau ganti 4 sub-tab) | 3-10 KB tiap panggilan | 500ms-1.5detik tiap ganti (tanpa cache) |

**Bandwidth**: karena response yang dikirim ke browser SUDAH berupa hasil olahan JSON kecil (bukan raw sheet), bandwidth ke DEVICE user sebenarnya **tidak jadi masalah utama**. Biaya sesungguhnya ada di sisi SERVER Apps Script: CPU time + jumlah baris dibaca dari Sheets/Firestore, yang berbanding lurus dengan **latency** (makin lama Apps Script "berpikir", makin lambat dirasakan user), bukan makin banyak "data terkirim".

**Potensi penghematan terbesar** bukan bandwidth, tapi **latency + CPU quota Apps Script** — lihat §16.

---

## 16. Cost Audit

**Model biaya Apps Script BEDA TOTAL dari Supabase** — tidak ada tagihan per-read seperti Firebase/Supabase. Apps Script (akun Google Workspace/consumer) punya **kuota harian** (bukan biaya rupiah langsung), yang paling relevan:
- **Execution time**: total 6 menit/eksekusi (batas keras), dan kuota total menit eksekusi/hari (bervariasi per jenis akun — konsumer vs Workspace).
- **UrlFetchApp calls/hari** (dipakai untuk Firestore REST API): 20.000/hari (akun konsumer) — **INI YANG SUDAH PERNAH HABIS** (lihat memory: "aplikasi produksi kena kuota Firestore harian habis 429 RESOURCE_EXHAUSTED berulang kali di paket Spark", jadi alasan migrasi Supabase mulai direncanakan).
- **Firestore read/write ops** (kalau nanti upgrade ke Blaze/pay-as-you-go): free tier 50.000 read + 20.000 write/hari, lalu $0.036/100.000 read.

**Asumsi eksplisit untuk estimasi di bawah**: 1 kelompok aktif = ±10 guru + 1-2 admin, tiap guru buka app rata-rata 2×/hari (pagi cek jadwal, sore input absen), tiap admin buka Dashboard 5×/hari.

| Skala | Estimasi panggilan `UrlFetchApp`/hari (Firestore REST) | Estimasi baca Sheets (full-scan) /hari |
|---|---|---|
| Per Login | 0 (Sheets, bukan UrlFetch) | 1 |
| Per buka Dashboard Admin PPG | 0 | 7 |
| Per buka Dashboard mobile (Petemon, Firestore) | 2-6 (tergantung cache hit) | 0 |
| Per buka Dashboard mobile (17 kelompok lain, Sheets) | 0 | 2-3 |
| Per Simpan Absensi (Petemon) | 1-3 | 0 |
| Per Simpan Absensi (17 kelompok lain) | 0 | 1 (TAPI baca PENUH, lihat §2) |
| **1.000 user aktif/hari** (asumsi rasio sama seperti sekarang: ±5% Petemon-like/Firestore, 95% Sheets) | ±3.000-8.000 UrlFetch/hari | ±2.500-4.000 full-scan Sheets/hari — **kalau sheet sudah besar (§3), ini yang paling berisiko timeout/lambat, BUKAN Firestore quota** |
| **10.000 user aktif/hari** | Bisa **melebihi 20.000 UrlFetch/hari** kalau makin banyak kelompok pindah Firestore tanpa naik ke Blaze — ulangi insiden 429 yang sudah pernah terjadi | Sheets full-scan pada skala ini **berisiko nyata timeout 6 menit** (§3) |
| **100.000 user aktif/hari** | Wajib Blaze (pay-as-you-go) + arsitektur query bertarget (bukan `readSheetAsObjects` generik) — Apps Script sendiri (bukan cuma Firestore) mulai jadi bottleneck karena kuota total menit eksekusi/hari akun juga terbatas | Sheets **tidak lagi viable** sebagai database utama di skala ini, terlepas dari optimasi kode apa pun |

**Kesimpulan cost**: pada skala SEKARANG (4 kelompok aktif, <1000 baris per tabel), biaya read masih kecil & tidak mendesak. Titik kritis ada di **10.000+ user**, di mana pola `readSheetAsObjects` generik (baca-semua-lalu-filter) akan mulai gagal secara struktural — bukan "boros", tapi **berhenti berfungsi** (timeout). Ini validasi teknis bahwa rencana migrasi ke Postgres/Supabase (query bertarget + index sungguhan) memang diperlukan untuk skala jangka panjang, TAPI untuk skala SEKARANG sampai ~1.000-2.000 user, perbaikan cache (§7) + hilangkan over-fetch (§5) di app Apps Script yang ada SUDAH CUKUP tanpa migrasi besar.

---

## 17. Optimization Priority

**★★★★★ Penghematan sangat besar, risiko rendah**
- Cache `serverGetDashboardBundle` (TTL 60-120dtk) — dibuka paling sering, paling berat (7 tabel penuh), pola cache SUDAH ada contohnya di kode yang sama (`santri_k`, `sidebar_tree`).
- Perbaiki `serverSetAbsensiSatuSantri`/`serverSaveAbsensiDaily` cabang Sheets (17 kelompok non-Petemon) agar TIDAK baca `absensi` PENUH tiap simpan — ini pola YANG SAMA yang sudah terbukti jadi bottleneck besar di Petemon dan sudah ada solusinya (Firestore + query di-scope tanggal), tinggal digilir ke kelompok lain.

**★★★★☆ Penghematan besar**
- Gabung 4 fungsi `Modul_Statistics.gs` jadi 1 bundle (pola sama `serverGetDashboardBundle`).
- Tambah cache ke Laporan/Konseling/Munaqosah/Kalender/Pusat Unduhan (0 cache sekarang, modul paling banyak baca tabel penuh).
- Ganti `absensiData.forEach(a => santriData.find(...))` (N+1 CPU, §4) jadi `Map` lookup di semua tempat yang pakai pola ini (Dashboard, Statistik, Munaqosah) — perubahan kode kecil, TIDAK mengubah query sama sekali, murni algoritma.

**★★★☆☆ Penghematan sedang**
- `serverGetDashboardBundle`: batasi baca `absensi` ke rentang 7 hari SAJA lewat query bertarget (untuk kelompok yang sudah Firestore) daripada baca semua lalu filter.
- Sambungkan parameter `page`/`limit` yang SUDAH ADA di `serverGetUsersList` ke UI navigasi halaman sungguhan (server-side sudah siap, tinggal client).

**★★☆☆☆ Penghematan kecil**
- Batch-kan edit multi-sel di matrix Kehadiran Generus (jarang dipakai untuk banyak sel sekaligus).
- Hapus `serverGetKehadiranChart7Hari` (dead code, 0 biaya real, tapi berisiko kalau tanpa sadar diaktifkan lagi).

**★☆☆☆☆ Tidak perlu dioptimalkan**
- Realtime/polling — sudah 0 biaya (tidak ada sama sekali), sudah optimal secara struktural.
- Gambar/logo — base64 inline, tidak ada network fetch berulang.
- Bell notification — dipanggil sekali per init + sekali per aksi, bukan polling.

---

## 18. Final Report

| Lokasi | Masalah | Dampak | Solusi | Estimasi Penghematan | Prioritas |
|---|---|---|---|---|---|
| `Modul_MaintainAbsensi.gs:93` (`serverSaveAbsensiDaily`, cabang Sheets) | Baca SELURUH riwayat `absensi` (semua kelompok, semua tanggal) di dalam lock global, tiap 1× "Simpan Absen" oleh 17/18 kelompok yang belum pindah Firestore | Operasi paling sering dilakukan guru (harian), akan makin lambat seiring tabel tumbuh, MENGUNCI semua penulis app lain selama proses | Terapkan pola yang SUDAH terbukti di Petemon: migrasi kelompok berikutnya ke Firestore + query di-scope tanggal, ATAU minimal query Sheets bertarget (bukan baca semua) | ★★★★★ | Sangat Tinggi |
| `Modul_MaintainAbsensi.gs:171` (`serverSetAbsensiSatuSantri`, cabang Sheets) | Baca SELURUH `absensi` untuk cari 1 baris santri_id+tanggal | Tiap edit 1 sel di matrix Kehadiran Generus (17 kelompok) makin lambat seiring data tumbuh | Sama seperti di atas — query bertarget/Firestore, atau index in-memory per (santri_id+tanggal) yang di-cache pendek | ★★★★★ | Sangat Tinggi |
| `Modul_Dashboard.gs:24` (`serverGetDashboardBundle`) | 0 cache, baca 7 tabel penuh (termasuk SELURUH riwayat absensi/munaqosah/akhlaq) tiap buka Dashboard | Layar paling sering dibuka admin_ppg, paling berat secara agregat | Tambah cache 60-120dtk (pola sama `santri_k`/`sidebar_tree` yang sudah ada) | ★★★★★ | Sangat Tinggi |
| `Modul_Statistics.gs` (4 fungsi, baris 18/69/162/213) | 4× baca `absensi` penuh terpisah, 0 cache, tanpa gabungan | Ganti filter/sub-tab berkali-kali = baca ulang tabel penuh berkali-kali | Gabung jadi `serverGetStatisticsBundle()` (pola sama Dashboard) + cache | ★★★★☆ | Tinggi |
| `Modul_Dashboard.gs:50,69,96` + pola serupa di Munaqosah/Monitoring | N+1 CPU: `.find()` di dalam `.forEach()` untuk join santri↔absensi | ±280.000 operasi pencarian linear per buka Dashboard (CPU time Apps Script, bukan network) | Ganti ke `Map` lookup O(1) — perubahan lokal, tidak mengubah query | ★★★★☆ | Tinggi |
| Laporan/Konseling/Munaqosah/Kalender/Pusat Unduhan (modul dgn 19-30× `readSheetAsObjects`/file, 0 cache) | Tidak ada cache sama sekali di 5 modul terbesar | Baca tabel penuh berulang tiap navigasi/render ulang layar yang sama | Terapkan pola cache `cacheGet_`/`cachePut_`/`cacheDrop_` yang SUDAH ada contohnya (Kurikulum, Santri, Guru) | ★★★★☆ | Tinggi |
| `Modul_Dashboard.gs:28,30,31` | Over-fetch: baca SELURUH riwayat `absensi`/`munaqosah`/`kurikulum_akhlaq` untuk hitung 7-hari-terakhir / nilai-max-per-santri | Data yang dipakai <1% dari yang dibaca begitu riwayat sudah bertahun-tahun | Query bertarget (Firestore range query) untuk kelompok yang sudah migrasi; untuk Sheets, minimal cache hasil olahannya | ★★★☆☆ | Sedang |
| `serverGetSantriList`/`serverGetGuruList` (cabang Sheets, 17 kelompok) | Baca `santri`/`guru` SEMUA 18 kelompok lalu filter 1 kelompok di memori | Makin banyak kelompok/santri = makin berat, walau sudah di-cache 300dtk | Sudah dikurangi risikonya oleh cache; migrasi Firestore per-kelompok (pola Petemon) akan menghilangkan over-fetch ini total | ★★★☆☆ | Sedang |
| `serverGetUsersList` (`Modul_UserManagement.gs:13`) | Parameter `page`/`limit` SUDAH ADA di server, tapi client hardcode `1, 100` — tidak ada navigasi halaman sungguhan | Aman untuk sekarang (user masih sedikit), jadi masalah nyata begitu total user >100 | Sambungkan UI pagination ke parameter yang sudah ada | ★★☆☆☆ | Sedang-Rendah |
| Matrix Kehadiran Generus (edit multi-sel) | 1 sel = 1 round-trip, tidak ada batch edit | Kalau admin edit banyak sel sekaligus, banyak request kecil berurutan | Kumpulkan perubahan, kirim 1 batch saat admin selesai edit | ★★☆☆☆ | Rendah |
| `Modul_Dashboard.gs:135` (`serverGetKehadiranChart7Hari`) | Dead code (dikonfirmasi tidak dipanggil dari mana pun), baca 4 tabel penuh kalau SEANDAINYA dipanggil | 0 biaya nyata sekarang, tapi risiko laten kalau tanpa sadar disambungkan lagi ke UI | Hapus, atau beri komentar peringatan lebih tegas | ★☆☆☆☆ | Rendah |
| Realtime/polling | Tidak ada sama sekali | 0 biaya | Tidak perlu tindakan | ★☆☆☆☆ | Tidak perlu |
| Gambar/logo (base64 inline) | Tidak bisa memanfaatkan browser image cache, tapi ukuran kecil & tidak ada fetch berulang | Minor, hanya memperbesar ukuran HTML awal sedikit | Prioritas rendah untuk sekarang; jaga pola ini kalau nanti ada upload gambar besar (foto profil) | ★☆☆☆☆ | Tidak perlu |

---

## Ringkasan Eksekutif

1. **Masalah struktural terbesar**: `readSheetAsObjects()` generik (dipanggil ±200× di seluruh backend) selalu baca SELURUH sheet tanpa filter server-side, tanpa cache di sebagian besar pemanggil. Ini bukan bug satu tempat, tapi **pola arsitektur yang berulang** — perbaikannya juga harus pola berulang (tiru cache yang sudah terbukti di Santri/Guru/Kurikulum ke modul lain), bukan tambal 1-2 titik.
2. **Yang PALING mendesak** (★★★★★): dua fungsi mutasi absensi (`serverSaveAbsensiDaily`, `serverSetAbsensiSatuSantri`) untuk 17 kelompok non-Petemon MASIH punya bug performa yang SAMA seperti yang sudah pernah menyebabkan masalah nyata di Petemon (didokumentasikan di memory project & ERROR_LOG) — dan solusinya SUDAH ADA & TERBUKTI (migrasi Firestore + query bertarget), tinggal digilir.
3. **Kabar baik**: tidak ada realtime/polling yang boros (biaya 0 di area itu), gambar sudah efisien, dan pola cache yang bagus SUDAH ada di beberapa modul (Kurikulum, Santri, Guru, Dashboard bundle) — tinggal direplikasi, bukan dirancang dari nol.
4. **Untuk skala "puluhan ribu user"**: perbaikan cache saja TIDAK CUKUP — arsitektur `readSheetAsObjects` generik akan gagal (timeout) begitu tabel `absensi` mencapai jutaan baris, terlepas dari cache. Ini justifikasi teknis nyata untuk rencana migrasi Supabase yang sedang berjalan (§0) — tapi untuk skala SEKARANG sampai ~1.000-2.000 user, optimasi di app Apps Script yang ada (§17, prioritas ★★★★★/★★★★☆) sudah cukup dan JAUH lebih murah/cepat dieksekusi daripada menunggu migrasi besar selesai.
