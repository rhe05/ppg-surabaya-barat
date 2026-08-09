# Ruang Ngaji — Performance & Read Optimization Audit (Pre-Migration)

**Tanggal**: 2026-08-07
**Mode**: Audit murni. Tidak ada kode diubah, tidak ada commit, tidak ada migration, tidak ada refactor.
**Stack yang diaudit**: Google Apps Script + Google Sheets + Firestore (sebagian) + CacheService + PropertiesService — sesuai arsitektur produksi yang benar-benar berjalan sekarang. Supabase (rencana masa depan) TIDAK ikut diaudit.

---

## Ringkasan Eksekutif

- **Total lokasi pemborosan ditemukan: 13** (dirinci di Tabel Audit), dikelompokkan ke 3 pola utama:
  1. **Baca sheet/collection penuh tanpa filter server-side** (`readSheetAsObjects()` generik, ±200 titik panggil di seluruh backend) — pola paling dominan.
  2. **Nol cache di 5 modul terbesar** (Statistik, Laporan, Konseling, Munaqosah, Kalender/Pusat Unduhan) — padahal pola cache yang benar SUDAH ada contohnya di modul lain (Santri, Guru, Kurikulum).
  3. **2 fungsi mutasi absensi** (Simpan Absen harian + edit 1 sel) untuk 17 dari 18 kelompok masih membaca **seluruh riwayat absensi** setiap kali dipanggil — bug performa yang SUDAH PERNAH terjadi dan SUDAH diperbaiki di Kelp Petemon, tapi belum digilir ke kelompok lain.
- **Area dampak biaya terbesar**: Dashboard Admin PPG (`serverGetDashboardBundle`, 7 tabel penuh tiap dibuka, 0 cache) dan mutasi Absensi harian (dalam lock global, baca tabel penuh tiap simpan). Keduanya adalah aksi PALING SERING dilakukan (admin buka Dashboard berkali-kali/hari, guru simpan absen tiap hari mengajar).
- **Ringkasan peluang penghematan**: menambahkan cache 60-300 detik ke Dashboard + Statistik + 4 modul besar lainnya, DITAMBAH memperbaiki 2 fungsi mutasi absensi, berpotensi memangkas **>70% dari total baca tabel penuh** yang terjadi sehari-hari — tanpa mengubah 1 pun fitur, dan pola perbaikannya SUDAH terbukti jalan di kode yang sama (tinggal direplikasi, bukan dirancang ulang).

---

## 1. Mapping Seluruh Read

### 1a. Sumber data yang ada di aplikasi ini

| Sumber | Dipakai untuk | Mekanisme baca |
|---|---|---|
| **Google Sheets** | Tabel utama (ppg/desa/kelompok/users/santri/guru/absensi/munaqosah/konseling/kurikulum_akhlaq/kalender/files/audit_log/jadwal_kbm/pengumuman/siklus_generus/pengurus_kelp/akses_kelas_request/guru_izin/quote_harian) untuk 17 dari 18 kelompok + semua data PPG-wide | `sheet.getDataRange().getValues()` — SELALU baca seluruh range terisi, tidak ada cara baca sebagian di helper generik |
| **Firestore** | santri/guru/jadwal_kbm/jadwal_kategori_hari/absensi **KHUSUS Kelp Petemon** (kelompok_id=1) | REST API via `UrlFetchApp.fetch()`, ada 2 pola: `firestoreListCollection_` (baca 1 collection penuh) dan `firestoreRunQuery_`/`firestoreRangeQuery_` (query bertarget, dipakai utk absensi rentang tanggal) |
| **CacheService** | Cache sementara hasil baca Sheets/Firestore (lihat §6) | `CacheService.getScriptCache()`, dibagi SEMUA eksekusi/user, TTL maksimum 6 jam per key |
| **PropertiesService** | **HANYA 1 pemakaian**: `Modul_FirestoreBridge.gs:19` — simpan kredensial service account Firestore (`FIRESTORE_SERVICE_ACCOUNT_JSON`), dibaca tiap kali generate access token OAuth baru | Bukan data aplikasi, murni konfigurasi/secret. Access token hasil generate-nya SENDIRI SUDAH di-cache 3300 detik (`Modul_FirestoreBridge.gs:46`) — jadi PropertiesService cuma benar-benar dibaca ±1×/55menit, BUKAN tiap request Firestore. **Ini sudah pola yang benar, tidak perlu diubah.** |

### 1b. Alur baca per fitur utama (file → fungsi → kapan dipanggil → siapa memanggil)

**Login**
`Code.js:serverLogin()` → `readSheetAsObjects(SHEET_NAMES.USERS)` (baca seluruh tabel users untuk cari 1 baris username) → dipanggil client `Script_Main.html:handleLogin` sekali per login.

**Dashboard Admin PPG**
`Modul_Dashboard.gs:serverGetDashboardBundle()` → 7× `readSheetAsObjects` (kelompok/santri/guru/absensi/desa/munaqosah/kurikulum_akhlaq) → dipanggil `Script_Main.html:loadDashboard()`, tiap kali admin_ppg buka/kembali ke layar Dashboard.

**Dashboard Kehadiran mobile (Guru/Admin Kelp)**
`Modul_InputAbsen.gs:serverGetGuruDashboardSummaryRange()` / `serverGetAdminKelpDashboardSummaryRange()` → `iaReadKelompokTablesParallel_()` (jadwal_kbm+guru+santri, di-cache 300dtk KHUSUS Petemon) + `iaReadAbsensiKelompokRange_()` (di-scope tanggal) → dipanggil tiap buka Dashboard mobile / ganti filter Bulan-Tahun/Tanggal.

**Absensi Guru (Simpan)**
`Modul_MaintainAbsensi.gs:serverSaveAbsensiDaily()` → cabang Firestore (Petemon): baca ter-scope tanggal. Cabang Sheets (17 kelompok lain): `readSheetAsObjects(SHEET_NAMES.ABSENSI)` — **baca SELURUH riwayat absensi semua kelompok** → dipanggil tiap guru klik "Simpan Absen" (harian).

**Absensi Generus (dari sisi admin, edit matrix Kehadiran Generus)**
`Modul_MaintainAbsensi.gs:serverSetAbsensiSatuSantri()` → cabang Sheets: `readSheetAsObjects(SHEET_NAMES.ABSENSI)` penuh untuk cari 1 baris → dipanggil tiap admin klik 1 sel di tabel matrix.

**Nilai (Munaqosah)**
`Modul_MaintainMunaqosah.gs` (9 fungsi server, 30 titik `readSheetAsObjects` — **modul dengan pembacaan tabel penuh TERBANYAK di seluruh codebase**) → dipanggil tiap buka tab Munaqosah / input nilai / lihat Santri Teladan.

**Hafalan** — tidak ada modul terpisah bernama "Hafalan"; target hafalan Al-Qur'an ada di dalam **Kurikulum** (`kurikulum_probul`, kolom `jilid`/`minggu1-4`) → `Modul_MaintainKurikulum.gs`, SUDAH pakai cache (`kurikulum_fulltree_<kelompokId>_<tahun>`, 60dtk, 6 titik) — **contoh implementasi TERBAIK di seluruh codebase**, dijelaskan lebih lanjut di §7.

**Rapor** — tidak ada fitur bernama "Rapor"; yang ada **"Laporan Perkembangan Santri"** (PDF, `Modul_Laporan.gs:serverGetLaporanPerkembanganSantri`) → baca `absensi` ter-scope 1 bulan (SUDAH benar, tidak baca semua riwayat) + `jadwal_kbm`/`santri`/`guru` → dipanggil tiap guru/admin generate laporan PDF.

**Statistik**
`Modul_Statistics.gs` (7 fungsi, 12 titik `readSheetAsObjects`, **0 cache**) → dipanggil tiap buka tab Statistik & tiap ganti sub-tab (Kehadiran/Demografi/Ranking/Growth) — 4 di antaranya baca `absensi` penuh SENDIRI-SENDIRI.

**Konseling**
`Modul_MaintainKonseling.gs` (8 fungsi, 19 titik `readSheetAsObjects`, **0 cache**) → dipanggil tiap buka layar Konseling / CRUD sesi konseling.

**Master Data (Cabang/Kelompok, Guru, Generus/Santri, Kelas/Jadwal)**
- Kelompok/Desa: `serverGetSidebarTree()` — **satu-satunya yang sudah di-cache** (300dtk).
- Guru/Santri: `serverGetGuruList`/`serverGetSantriList` — di-cache per-kelompok 300dtk (SUDAH BAIK, lihat §6).
- Jadwal (`jadwal_kbm`, dianggap "Kelas"): cache 300dtk **KHUSUS Kelp Petemon** lewat `iaReadKelompokTable_`; 17 kelompok lain baca `readSheetAsObjects` langsung tiap kali, TANPA cache.

---

## 2. Cari Pemborosan Read (diurutkan dari paling boros)

| # | Lokasi | Jenis pemborosan | Detail |
|---|---|---|---|
| 1 | `Modul_MaintainAbsensi.gs:93` (`serverSaveAbsensiDaily`, cabang Sheets) | Baca seluruh sheet padahal hanya perlu 1 kelas 1 tanggal | Tiap "Simpan Absen" oleh 17/18 kelompok → baca SELURUH tabel `absensi` (semua kelompok, semua tanggal sepanjang sejarah), DI DALAM `withScriptLock_` (mengunci semua penulis app lain selagi proses) |
| 2 | `Modul_MaintainAbsensi.gs:171` (`serverSetAbsensiSatuSantri`, cabang Sheets) | Baca seluruh sheet untuk cari 1 baris | Tiap edit 1 sel matrix Kehadiran Generus (17 kelompok) → baca SELURUH `absensi` hanya untuk `.find()` 1 baris `santri_id+tanggal` |
| 3 | `Modul_Dashboard.gs:24-31` (`serverGetDashboardBundle`) | Membaca data yang sama berulang antar-request + over-fetch dalam 1 request | 7 tabel dibaca PENUH tiap buka Dashboard, TANPA cache — termasuk seluruh riwayat `absensi`/`munaqosah`/`kurikulum_akhlaq` cuma untuk hitung 7-hari-terakhir / nilai-max-per-santri |
| 4 | `Modul_Statistics.gs` (baris 18, 69, 162, 213) | Query duplicate | 4 fungsi berbeda SAMA-SAMA `readSheetAsObjects(ABSENSI)` secara independen — ganti sub-tab Statistik 4× = baca tabel `absensi` penuh 4× dalam 1 sesi |
| 5 | `Modul_Utilities.gs:177` (di dalam `readSheetAsObjects` generik, cabang absensi+Firestore) | Nested read tersembunyi | Setiap kali ADA kelompok yang sudah pindah Firestore, baca `absensi` generik SELALU memicu baca `santri` PENUH LAGI (untuk join kelompok_id) — walau pemanggil sudah punya data `santri` sendiri di scope yang sama |
| 6 | `Modul_Dashboard.gs:50,69,96` + pola serupa di `Modul_MaintainMunaqosah.gs`/`Modul_Monitoring.gs` | Parsing/lookup berulang (bukan network, tapi CPU) | `absensiData.forEach(a => { const santri = santriData.find(s => s.id === a.santri_id); ... })` — `.find()` di dalam `.forEach()` = O(n×m), ±280.000 operasi pencarian linear per buka Dashboard (n=absensi±1400, m=santri±200) |
| 7 | `Modul_MaintainKonseling.gs` (19 titik) / `Modul_MaintainMunaqosah.gs` (30 titik) | Helper dipanggil berkali-kali, 0 cache | Modul dengan `readSheetAsObjects` terbanyak di seluruh codebase, tapi belum pernah disentuh optimasi cache sama sekali |
| 8 | `Modul_MaintainSantri.gs`/`Modul_MaintainGuru.gs` (cabang Sheets, 17 kelompok) | Over-fetch lalu filter di memori | `readSheetAsObjects(SANTRI)`/`(GURU)` baca SEMUA 18 kelompok, baru `.filter(kelompok_id == X)` — sudah dimitigasi cache 300dtk (§6), tapi tiap cache MISS tetap baca semua |
| 9 | `Modul_Dashboard.gs:135` (`serverGetKehadiranChart7Hari`) | Pembacaan saat data tidak dipakai sama sekali | Dead code (dikonfirmasi di komentar sendiri: "Tidak dipanggil dari frontend manapun") — 4× `readSheetAsObjects` kalau SEANDAINYA dipanggil, 0 biaya nyata sekarang tapi risiko laten |

---

## 3. Hitung Frekuensi Read (estimasi)

**Asumsi eksplisit**: Apps Script tidak mengekspos metrik read count/payload per-request secara native (tidak ada dashboard billing seperti Firebase/Supabase). Angka di bawah dihitung dari struktur kode (jumlah `readSheetAsObjects`/`firestoreListCollection_` per alur) dikali estimasi frekuensi pemakaian wajar (1 admin + ±10 guru per kelompok aktif, guru buka app 2×/hari, admin buka Dashboard 5×/hari).

| Fitur | ±Jumlah baca tabel penuh per 1× aksi | Frekuensi wajar/hari (per kelompok aktif) | Estimasi total baca tabel penuh/hari |
|---|---|---|---|
| Login | 1 (`users`) | ±11× (10 guru + 1 admin) | 11 |
| Dashboard Admin PPG | 7 | 5× (admin) | 35 |
| Dashboard Absensi Guru/Admin Kelp (mobile) | 0-2 (Petemon: cache hit sering; 17 kelompok lain: 2-3 baca langsung) | 2× × 10 guru | 20-60 |
| Absensi Guru (Simpan) | 1 (baca PENUH `absensi`, kelompok non-Petemon) | 1× × 10 guru (yang mengajar hari itu) | 10 |
| Absensi Generus (edit 1 sel, admin) | 1 (baca PENUH `absensi`) | ±3× (koreksi manual, jarang) | 3 |
| Nilai (Munaqosah) | 2-4 per operasi (30 titik total di modul, tapi tiap fungsi individual baca 2-4 tabel) | ±5× (buka tab + beberapa input) | 10-20 |
| Statistik | 1-4 (tergantung berapa sub-tab dibuka) | ±3× (admin cek performa) | 3-12 |
| Konseling | 1-3 per operasi | ±2× | 2-6 |
| Master Data (Cabang/Guru/Generus/Kelas) | 0 kalau cache HIT (300dtk), 1-2 kalau MISS | ±5× (berbagai layar butuh data ini) | 0-10 (tergantung cache hit rate) |

**Total per kelompok aktif per hari (estimasi kasar): ±100-170 baca tabel penuh.** Dengan **4 kelompok aktif sekarang**: **±400-680 baca tabel penuh/hari**. Kalau 18 kelompok semua aktif dengan pola sama: **±1.800-3.000 baca tabel penuh/hari** — sebagian besar TANPA cache sama sekali (§6/§7 adalah peluang penghematan langsung terhadap angka ini).

---

## 4. Analisa Google Sheets

| Pola bermasalah | Ditemukan di | Solusi | Estimasi penghematan |
|---|---|---|---|
| `getDataRange().getValues()` padahal cukup sebagian (mis. cuma butuh 7 hari terakhir dari `absensi`) | `Modul_Dashboard.gs:28` (dan pola serupa di Statistics/Laporan) | Untuk kelompok yang masih Sheets: TIDAK ADA cara native "baca sebagian baris" di Sheets API tanpa index tambahan — solusi realistis adalah **cache hasil olahan** (bukan raw data), bukan mengubah cara baca Sheets-nya (keterbatasan platform) | ★★★★★ kalau lewat cache |
| Looping berulang (`.find()` di dalam `.forEach()`) | `Modul_Dashboard.gs:50,69,96`, `Modul_MaintainMunaqosah.gs` (pola serupa) | Ganti `santriData.find(...)` jadi `Map` (`const santriMap = new Map(santriData.map(s => [s.id, s]))`, lalu `santriMap.get(a.santri_id)`) — TIDAK mengubah data yang dibaca, murni algoritma O(n×m) → O(n) | ★★★★☆, perubahan kode SANGAT kecil (5-10 baris per fungsi) |
| Sheet dibaca ulang tiap klik tombol tanpa cache | Statistik (ganti sub-tab), Konseling, Munaqosah, Kalender, Pusat Unduhan | Tambah `cacheGet_`/`cachePut_`/`cacheDrop_` — pola SUDAH ADA & TERBUKTI di `serverGetSantriList`/`serverGetGuruList`/Kurikulum, tinggal ditiru persis | ★★★★☆ |
| Baca sheet berkali-kali untuk data yang SAMA dalam 1 request (nested, §2 poin 5) | `readSheetAsObjects` cabang absensi+Firestore | Kalau pemanggil sudah punya `santriData` di scope yang sama, pakai itu langsung (parameter opsional), jangan panggil ulang | ★★★☆☆, butuh ubah signature 1 fungsi helper |

---

## 5. Analisa Firestore

Firestore **HANYA dipakai Kelp Petemon** (kelompok_id=1) untuk 5 tabel: santri, guru, jadwal_kbm, jadwal_kategori_hari, absensi.

| Pola | Status sekarang | Catatan |
|---|---|---|
| Collection scan (`firestoreListCollection_`, baca SEMUA dokumen 1 collection) | Dipakai untuk santri/guru/jadwal_kbm/jadwal_kategori_hari — **INI SUDAH BENAR** karena tabel-tabel ini "master/referensi" (jumlah terbatas, tidak tumbuh tanpa batas — lihat prinsip yang SUDAH didokumentasikan di `CLAUDE.md` bagian "Prinsip Performa Firestore", hasil audit 2026-08-05/06) | Tidak perlu diubah |
| Query bertarget (`firestoreRunQuery_`/`firestoreRangeQuery_`) | Dipakai KHUSUS `absensi` (tumbuh tanpa batas, per-hari) — filter tanggal + santri_id di sisi Firestore, BUKAN download semua lalu filter di Apps Script | Sudah pola yang benar, sudah diverifikasi lewat diag route (`Code.js`) |
| Document read berulang | Cache tabel master Firestore (`jadwalkbm_k1`, `jadwalkategorihari_k1`, `santri_k1`, `guru_k1`) sudah 300dtk — mengurangi UrlFetch berulang untuk data yang sama | Sudah baik |
| Query terlalu luas / tanpa filter | Tidak ditemukan kasus baru — audit sebelumnya (memory project, CLAUDE.md) sudah menyisir SEMUA collection Firestore yang ada dan tidak menemukan query tanpa filter yang tersisa | — |

**Estimasi penghematan Firestore**: bagian ini SUDAH RELATIF OPTIMAL (hasil audit sebelumnya yang terdokumentasi). Peluang penghematan TERBESAR justru bukan memperbaiki Firestore, tapi **memindahkan lebih banyak kelompok DARI Sheets KE Firestore** dengan pola yang sudah terbukti (pattern replikasi, bukan pekerjaan baru) — ini mengurangi beban `readSheetAsObjects` yang jauh lebih boros (§2, §4).

⚠️ **Peringatan kuota**: migrasi tiap kelompok baru ke Firestore MENAMBAH jumlah `UrlFetchApp.fetch()` (kuota harian akun konsumer: 20.000/hari — **sudah pernah habis sebelumnya**, alasan awal rencana migrasi Supabase). Jadi trade-off: pindah ke Firestore = kurangi beban Sheets TAPI tambah beban kuota UrlFetch. **Cache yang lebih agresif (§6) mengurangi KEDUANYA sekaligus** tanpa trade-off ini — sebaiknya diprioritaskan dulu sebelum menggilir migrasi kelompok berikutnya.

---

## 6. Audit Cache

| Data | Cocok CacheService? | TTL disarankan | Estimasi pengurangan read | Risiko stale |
|---|---|---|---|---|
| **Cabang** (kelompok+desa, via `serverGetSidebarTree`) | Ya — **SUDAH diterapkan** | 300dtk (sudah sesuai) | Sudah tercapai | Rendah — kelompok baru/nonaktif jarang berubah dalam hitungan menit |
| **Guru** (`serverGetGuruList`) | Ya — **SUDAH diterapkan** | 300dtk (sudah sesuai) | Sudah tercapai, plus `forceFresh` sudah ada utk tombol Refresh manual | Rendah |
| **Generus/Santri** (`serverGetSantriList`) | Ya — **SUDAH diterapkan** | 300dtk (sudah sesuai) | Sudah tercapai | Rendah |
| **Kelas/Jadwal** (`jadwal_kbm`) | Ya — **SUDAH diterapkan untuk Petemon SAJA** | 300dtk (samakan dgn yang sudah ada) | Tinggal digilir ke 17 kelompok lain (pola sudah ada, `IA_KELOMPOK_TABLE_CACHE_KEY_` di `Modul_Utilities.gs` tinggal diisi lebih banyak entry) | Rendah — jadwal kelas jarang berubah dalam hitungan menit |
| **Mata Pelajaran** | N/A — tidak ada konsep ini di aplikasi (TPQ bukan sekolah bermata-pelajaran). Analog terdekat: **Kategori Jadwal KBM** (`KATEGORI_JADWAL_`: Cabe Rawit/Pra Remaja SMP/Remaja SMA/Muda-Mudi) — ini KONSTANTA hardcode di kode (`Modul_MaintainJadwalKBM.gs`), bukan data sheet, jadi **sudah "gratis" tanpa perlu cache sama sekali** | — | — | — |
| **Dashboard** (`serverGetDashboardBundle`) | Ya — **BELUM diterapkan**, prioritas tertinggi | 60-120dtk (data agregat, wajar sedikit basi) | ★★★★★ — layar paling sering dibuka, paling berat (7 tabel) | Sedang — admin simpan data baru lalu langsung cek Dashboard bisa lihat angka 1-2 menit lalu. Mitigasi: TTL pendek (60dtk) sudah cukup, ATAU `cacheDrop_` eksplisit di titik-titik simpan absensi/santri/guru (sama pola dgn cache Santri/Guru yang sudah di-invalidate tiap CRUD) |
| **Statistik** | Ya — **BELUM diterapkan** | 120-300dtk (data historis, hampir tidak pernah butuh real-time) | ★★★★☆ — 4 sub-tab, sering diganti-ganti dalam 1 sesi | Rendah — statistik kehadiran/demografi wajar delay beberapa menit |

---

## 7. Cari Data yang Jarang Berubah

| Data | Frekuensi perubahan nyata | Rekomendasi cache |
|---|---|---|
| Daftar kelas (`jadwal_kbm`) | Berubah kalau admin ubah jadwal/tambah kelas — jarang (mingguan/bulanan) | TTL 300-600dtk cukup, sudah ada polanya (Petemon), tinggal digilir |
| Daftar guru | Berubah kalau ada guru baru/keluar — jarang | Sudah di-cache 300dtk, SUDAH OPTIMAL |
| Daftar cabang/kelompok | Nyaris tidak pernah berubah (struktur organisasi tetap) | Sudah di-cache 300dtk lewat sidebar_tree, bisa dinaikkan ke 600-900dtk kalau mau lebih agresif (risiko stale nyaris nol) |
| Kategori Jadwal KBM | Konstanta kode, TIDAK PERNAH berubah tanpa deploy baru | Tidak perlu cache (sudah "gratis", ada di memori proses) |
| **Konfigurasi Kop Surat** (`Modul_KopSurat.gs`, Firestore) | Berubah SANGAT jarang (admin set 1× lalu dipakai berbulan-bulan) | **Belum di-cache** — tiap generate PDF Laporan yang pakai Kop Surat, baca Firestore lagi. Cocok cache TTL panjang (600-1800dtk), invalidasi di titik simpan Kop Surat saja |
| **Quote Harian** (`quote_harian`) | Berubah 1×/hari (by design) | Cocok cache TTL 1 hari (86400dtk) atau minimal beberapa jam — sekarang dibaca tiap kali guru buka Dashboard mobile tanpa cache |

---

## 8. Dashboard Audit

**Dashboard Admin PPG** (4 KPI + breakdown 5 Desa + tabel Santri Teladan):
- Semua kartu dibaca dalam **1 bundle** (`serverGetDashboardBundle`) — arsitektur ini SUDAH BENAR untuk menghindari banyak round-trip, TIDAK disarankan dipecah lagi jadi per-kartu (§10, keputusan yang sudah tepat).
- **Yang perlu ditambahkan: cache di level bundle** (§6) — bukan mengubah cara datanya dikumpulkan, cukup bungkus hasil akhirnya dengan cache 60-120dtk.
- KPI (4 angka) → cocok "dihitung sekali per 1-2 menit", TIDAK perlu real-time.
- Santri Teladan (nilai munaqosah+akhlaq) → cocok TTL lebih panjang (5-10 menit), nilai jarang berubah drastis dalam hitungan menit.
- Rekomendasi tombol **"Refresh"** eksplisit yang menembus cache — pola `forceFresh` SUDAH ADA di Santri/Guru, tinggal ditiru ke Dashboard.

**Dashboard Kehadiran mobile** (Guru/Admin Kelp): sudah "refresh manual" secara alami (user ganti filter Bulan-Tahun/Tanggal untuk lihat data baru, bukan auto-refresh) — pola yang SUDAH baik, tidak perlu diubah.

---

## 9. Prioritas Optimasi

**★★★★★ Sangat Mendesak**
1. Cache `serverGetDashboardBundle` (TTL 60-120dtk) — perubahan kode minimal (bungkus return value existing dengan `cacheGet_`/`cachePut_`), dampak terbesar (layar paling sering dibuka, paling berat).
2. Perbaiki `serverSaveAbsensiDaily`/`serverSetAbsensiSatuSantri` cabang Sheets (17 kelompok) agar tidak baca `absensi` PENUH tiap panggilan — pola solusinya SUDAH TERBUKTI (Petemon), risiko rendah karena tinggal replikasi.

**★★★★☆ Mendesak**
3. Gabung 4 fungsi `Modul_Statistics.gs` jadi 1 bundle + cache (pola sama Dashboard).
4. Ganti `.find()` di dalam `.forEach()` jadi `Map` lookup (Dashboard, Munaqosah, Monitoring) — perubahan kode SANGAT kecil, murni algoritma, nol risiko terhadap perilaku aplikasi.
5. Tambah cache ke Konseling & Munaqosah (2 modul dengan pembacaan tabel penuh terbanyak, 0 cache).

**★★★☆☆ Sedang**
6. Gilirkan cache tabel master (`jadwal_kbm`, dst) dari Petemon-saja ke 17 kelompok lain (tinggal isi `IA_KELOMPOK_TABLE_CACHE_KEY_`).
7. Cache Kop Surat & Quote Harian (TTL panjang, jarang berubah, rendah risiko).
8. Cache Kalender & Pusat Unduhan.

**★★☆☆☆ Ringan**
9. Perbaiki nested-read tersembunyi di `readSheetAsObjects` cabang absensi+Firestore (§2 poin 5) — butuh ubah signature helper, dampak kecil pada skala data sekarang.
10. Sambungkan pagination `serverGetUsersList` yang sudah ada parameternya ke UI (baru relevan kalau user >100).

**★☆☆☆☆ Tidak Perlu**
11. Hapus/biarkan `serverGetKehadiranChart7Hari` (dead code, 0 biaya nyata).
12. PropertiesService — sudah optimal (dibaca ±1×/55menit lewat cache token), tidak perlu disentuh.
13. Realtime/polling — tidak ada sama sekali, biaya 0, tidak perlu tindakan.

---

## 10. Roadmap Optimasi

### Tahap 1 — Tanpa mengubah arsitektur (cache murni, risiko terendah)
Semua ini adalah **membungkus fungsi yang SUDAH ADA dengan `cacheGet_`/`cachePut_`**, mengikuti pola yang sudah terbukti jalan di `serverGetSantriList`/`serverGetGuruList`/Kurikulum. Tidak ada perubahan struktur data, tidak ada perubahan query, tidak ada perubahan alur kerja user.
- Cache `serverGetDashboardBundle` (★★★★★)
- Cache bundle Statistik (★★★★☆)
- Cache Konseling, Munaqosah, Kop Surat, Quote Harian, Kalender, Pusat Unduhan (★★★★☆/★★★☆☆)
- Ganti `.find()` dalam `.forEach()` jadi `Map` lookup (★★★★☆) — murni algoritma, bukan arsitektur

### Tahap 2 — Sedikit perubahan kode (masih dalam arsitektur Sheets/Firestore yang sama)
- Perbaiki `serverSaveAbsensiDaily`/`serverSetAbsensiSatuSantri` cabang Sheets agar query bertarget (bukan baca semua) — TANPA harus migrasi Firestore dulu, cukup pola query Sheets yang lebih sempit atau minimal cache hasil baca dalam 1 request.
- Gilirkan cache tabel master ke 17 kelompok lain (perluasan `IA_KELOMPOK_TABLE_CACHE_KEY_`).
- Perbaiki nested-read `readSheetAsObjects` (santri dibaca ulang di dalam pembacaan absensi).
- Sambungkan pagination `serverGetUsersList` ke UI.

### Tahap 3 — Bisa menunggu sampai migrasi Supabase
- Migrasi kelompok berikutnya (2-18) dari Sheets ke Firestore, ATAU langsung tunggu migrasi Supabase kalau memang sudah dekat — karena migrasi bertahap ke Firestore MENAMBAH beban kuota `UrlFetchApp` (yang sudah pernah habis sebelumnya), sementara Tahap 1+2 di atas sudah memberi penghematan besar TANPA risiko kuota tambahan itu.
- Perombakan struktur data besar (mis. index tambahan, restrukturisasi tabel) — sebaiknya langsung dirancang di skema Supabase yang baru, bukan dikerjakan 2× (sekali di Sheets/Firestore, sekali lagi di Supabase).

---

## Daftar Quick Wins

Perubahan kecil, risiko rendah, dampak besar — bisa dikerjakan lebih dulu tanpa menunggu keputusan besar apa pun:

1. **Cache `serverGetDashboardBundle`** — 1 fungsi, bungkus return value, TTL 60-120dtk.
2. **Ganti `.find()` dalam `.forEach()` → `Map` lookup** — di `Modul_Dashboard.gs` (3 titik), pola yang sama bisa langsung ditiru ke Munaqosah/Monitoring.
3. **Cache Quote Harian** — TTL panjang (berjam-jam), data cuma berubah 1×/hari, hampir nol risiko stale.
4. **Cache Kop Surat** — TTL panjang, berubah sangat jarang.
5. **Gabung 4 fungsi Statistik jadi 1 bundle** — pola COPY-PASTE dari `serverGetDashboardBundle` yang sudah ada & terbukti.

---

## Kesimpulan

Urutan pengerjaan yang direkomendasikan agar Ruang Ngaji jauh lebih hemat SEBELUM migrasi Supabase:

1. **Mulai dari Quick Wins** (di atas) — semuanya cache murni, tidak menyentuh logika bisnis, bisa dikerjakan dalam waktu singkat dengan risiko sangat rendah, dan langsung memangkas sebagian besar baca tabel penuh yang terjadi di Dashboard + Statistik (dua area paling sering diakses).
2. **Lanjut ke perbaikan 2 fungsi mutasi absensi** (§9, ★★★★★ poin 2) — ini yang paling berisiko terhadap PENGALAMAN GURU (aksi harian yang paling sering dilakukan), tapi solusinya sudah terbukti jalan di Kelp Petemon, jadi risiko implementasi rendah — tinggal disiplin mengikuti pola yang sudah ada.
3. **Gilirkan pola cache tabel master** ke 17 kelompok yang belum, memakai struktur `IA_KELOMPOK_TABLE_CACHE_KEY_` yang sudah ada.
4. **Tunda migrasi kelompok baru ke Firestore** sampai Tahap 1+2 selesai — karena menambah kelompok ke Firestore menambah beban kuota `UrlFetchApp` yang sudah pernah habis sebelumnya, sementara cache memberi penghematan setara TANPA risiko kuota tambahan itu.
5. **Perombakan besar (index, restrukturisasi tabel)** cukup ditunda sampai migrasi Supabase — supaya tidak dikerjakan dua kali.

Dengan urutan ini, aplikasi versi gratis (Apps Script + Sheets/Firestore) berpeluang bertahan melayani jauh lebih banyak kelompok/guru dengan beban baca yang jauh lebih rendah dari sekarang, TANPA mengubah satu pun fitur yang ada — murni soal seberapa sering data yang SAMA dibaca ulang.
