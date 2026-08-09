# Ruang Ngaji — Read Budget, Optimization Score & Cost Saving Report

**Tanggal**: 2026-08-07
**Mode**: Analisis lanjutan — **tidak mengulang audit**, seluruh angka & temuan diturunkan dari:
- `AUDIT_READ_PERFORMANCE_2026-08-07.md` ("Audit A")
- `AUDIT_READ_OPTIMIZATION_PRE_MIGRATION_2026-08-07.md` ("Audit B")

Tidak ada kode diubah, tidak ada commit, tidak ada migration, tidak ada refactor. Dokumen ini murni **kuantifikasi & prioritisasi** dari temuan yang sudah ada.

---

## Executive Summary

- **13 lokasi pemborosan terverifikasi** (Audit B §2), mengelompok ke 3 pola: baca tabel penuh tanpa filter (±200 titik `readSheetAsObjects`), nol cache di 5 modul terbesar, dan 2 fungsi mutasi absensi yang membaca seluruh riwayat tiap dipanggil.
- **Modul PALING BOROS (skor efisiensi < 40)**: **Absensi Guru (Simpan)** dan **Absensi Generus (edit sel)** — keduanya membaca **seluruh riwayat `absensi`** (semua kelompok, semua tanggal) untuk operasi yang seharusnya menyentuh 1 hari/1 baris saja, dan yang pertama terjadi **di dalam lock global** yang mengunci semua penulis app lain.
- **Modul PALING LAYAK diperbaiki lebih dulu (ROI tertinggi)**: **Dashboard Admin PPG** — dampak terbesar (layar paling sering dibuka, 7 tabel penuh/buka) dengan perubahan kode TERKECIL (bungkus 1 fungsi dengan cache, pola sudah ada persis di kode yang sama).
- **Estimasi penghematan setelah Sprint 1+2** (§8 di bawah): **±70-80% dari total baca tabel penuh harian** (dari estimasi ±400-680 baca/hari pada 4 kelompok aktif sekarang, menjadi ±100-180/hari) — TANPA migrasi, TANPA mengubah fitur.
- **Urutan pengerjaan terbaik**: cache murni dulu (Sprint 1, risiko nyaris nol) → perbaiki 2 fungsi mutasi absensi (Sprint 2, risiko rendah karena pola solusinya sudah terbukti di Kelp Petemon) → tunda migrasi kelompok baru ke Firestore & perombakan struktural sampai Supabase (Sprint 4).

---

## 1. READ BUDGET per Modul

**Asumsi eksplisit** (diwariskan dari Audit B §3, dipakai konsisten di seluruh dokumen ini): 1 kelompok aktif = ±10 guru + 1-2 admin. Guru buka app 2×/hari, admin buka Dashboard 5×/hari. 4 kelompok aktif sekarang (Kelp Petemon Firestore, 3 kelompok lain Sheets). Ukuran payload dari Audit A §3 (baris×kolom, data riil production: 199 santri, ±1.400 baris absensi, 18 guru).

"Query" di bawah = 1 pemanggilan `readSheetAsObjects`/`firestoreListCollection_`/`firestoreRunQuery_` (1 fungsi server bisa berisi >1 query). "Parsing" = estimasi jumlah iterasi `.filter()`/`.map()`/`.find()` di memori Apps Script (bukan JSON parsing — `getValues()` Sheets sudah berupa array native, tidak perlu di-parse ulang).

| Modul | Read/hari (estimasi) | Query/aksi | Payload/aksi | Parsing/aksi (±operasi) | Cache Hit | Cache Miss |
|---|---|---|---|---|---|---|
| **Login** | 11 | 1 (`users`) | <5 KB server-side | ±20-50 (cari 1 baris username) | **0%** — tidak ada cache | **100%** |
| **Dashboard (Admin PPG)** | 35 | 7 (`serverGetDashboardBundle`) | ±600 KB server-side / 5-15 KB respons | ±280.000 (N+1 `.find()` santri↔absensi, Audit A §4) | **0%** — tidak ada cache | **100%** |
| **Absensi Guru (Simpan)** | 10 | 1 (`absensi` PENUH, cabang Sheets) | ±250 KB server-side (tumbuh terus) | ±1.400+ (scan semua baris utk 1 kelas) | **0%** | **100%** (17/18 kelompok) |
| **Absensi Generus (edit sel)** | 3 | 1 (`absensi` PENUH, cabang Sheets) | ±250 KB server-side | ±1.400 (`.find()` 1 baris di seluruh tabel) | **0%** | **100%** (17/18 kelompok) |
| **Statistik** | 3-12 | 1-4 (4 fungsi independen, masing baca `absensi` sendiri) | ±250 KB × jumlah sub-tab dibuka | ±1.400 × jumlah sub-tab | **0%** — tidak ada cache | **100%** |
| **Laporan** | ~5-8 (estimasi, tidak eksplisit di frekuensi Audit B) | 1-3 (mayoritas SUDAH di-scope 1 bulan — pengecualian baik) | ±20-50 KB (sudah di-scope, jauh lebih kecil dari Statistik) | ±100-300 (data sudah difilter tanggal sebelum diproses) | **0%** | **100%**, TAPI query-nya sendiri sudah bertarget (bukan full-scan absensi) |
| **Konseling** | 2-6 | 1-3 (19 titik/8 fungsi, ±2.4 rata-rata) | ±10-40 KB (tabel konseling relatif kecil sekarang) | ±50-200 | **0%** — tidak ada cache | **100%** |
| **Munaqosyah (Nilai)** | 10-20 | 2-4 (30 titik/9 fungsi, ±3.3 rata-rata — **TERBANYAK di codebase**) | ±20-60 KB | ±100-500 | **0%** — tidak ada cache | **100%** |
| **Master Data** (Cabang/Guru/Generus) | 0-10 | 0 (cache HIT) / 1 (cache MISS) | 0 KB (hit) / ±60-70 KB (miss, santri+guru) | 0 (hit) / ±200-400 (filter kelompok_id, miss) | **±70-85%** (TTL 300dtk, dipanggil sering dalam 1 sesi) | **±15-30%** |
| **Jadwal** (`jadwal_kbm`) | ~5-15 (estimasi, bagian dari alur Dashboard mobile + layar Jadwal KBM) | 0 (cache HIT, Petemon) / 1 (cache MISS, 17 kelompok lain SELALU miss) | 0 KB (Petemon hit) / ±5-15 KB (kelompok lain) | 0 (hit) / ±50-150 (miss) | **±70-85% untuk Petemon SAJA** | **100% untuk 17 kelompok lain** (tidak ada cache sama sekali) |
| **Kalender** | ~2-5 (estimasi, fitur dipakai lebih jarang dari Dashboard/Absensi) | 1-2 | ±10-30 KB | ±50-150 | **0%** — tidak ada cache | **100%** |
| **Rapor** ("Laporan Perkembangan Santri") | ~2-4 (estimasi, generate PDF tidak setiap hari) | 1-2, SUDAH di-scope 1 bulan (contoh baik, Audit B §1b) | ±15-30 KB | ±100-200 | **0%** | **100%**, TAPI sama seperti Laporan — query-nya sendiri sudah efisien |

**Total estimasi read/hari (4 kelompok aktif, digabung dari tabel di atas × asumsi jumlah kelompok relevan)**: **±400-680/hari** — angka ini **identik dengan Audit B §3** (diverifikasi konsisten, bukan dihitung ulang dari nol).

---

## 2. OPTIMIZATION SCORE per Modul

Skala 0-100 (90-100 Sangat Efisien, 80-89 Efisien, 70-79 Cukup, 50-69 Kurang Efisien, 0-49 Sangat Boros). Skor diturunkan dari kombinasi: ada/tidaknya cache, ada/tidaknya over-fetch, ada/tidaknya N+1, ada/tidaknya duplikasi, dan tingkat risiko blocking (lock global).

| Modul | Skor | Kategori | Alasan |
|---|---|---|---|
| **Master Data** (Guru/Santri/Cabang) | **82** | Efisien | Cache 300dtk + `forceFresh` SUDAH diterapkan (Audit A §6/B §6) — satu-satunya kelompok modul yang benar-benar "selesai" dioptimasi. Poin minus: cabang Sheets tetap baca 18 kelompok lalu filter (over-fetch ringan, dimitigasi cache) |
| **Rapor** (Laporan Perkembangan Santri) | **76** | Cukup | Query SUDAH di-scope 1 bulan (bukan full-scan), TAPI 0 cache — kalau digenerate berkali-kali dalam sesi yang sama tetap baca ulang |
| **Laporan** (lainnya, non-Rapor) | **58** | Kurang Efisien | Sebagian fungsi sudah scoped (kutip di atas), TAPI setidaknya 1 titik (`Modul_Laporan.gs:128`) baca `absensi` PENUH lalu filter di memori — campuran baik & buruk |
| **Jadwal** (`jadwal_kbm`) | **58** | Kurang Efisien | Cache HANYA utk Petemon (1/18 kelompok) — 94% populasi kelompok TIDAK dapat manfaat cache sama sekali walau polanya sudah ada & tinggal digilir |
| **Dashboard Kehadiran mobile** (Guru/Admin Kelp) | **65** | Kurang Efisien (mendekati Cukup) | Sudah dioptimasi signifikan (N+1, double-read, prefetch — riwayat sesi Audit B), TAPI hanya utk Kelp Petemon; 17/18 kelompok masih baca langsung tanpa cache |
| **Konseling** | **42** | Sangat Boros | 19 titik baca tabel penuh/8 fungsi, 0 cache, tidak ada bundling — belum pernah disentuh optimasi sama sekali |
| **Kalender** | **45** | Sangat Boros | 0 cache, data (jadwal kalender akademik) sebenarnya SANGAT jarang berubah — kandidat cache paling "aman" tapi belum diterapkan |
| **Statistik** | **40** | Sangat Boros | 4 fungsi independen baca `absensi` PENUH sendiri-sendiri (duplikasi), 0 cache, 0 bundling — padahal pola bundling SUDAH ada contohnya (Dashboard) |
| **Munaqosyah (Nilai)** | **35** | Sangat Boros | Jumlah pembacaan tabel penuh TERBANYAK di seluruh codebase (30 titik), 0 cache — modul terbesar yang paling terabaikan |
| **Dashboard (Admin PPG)** | **32** | Sangat Boros | 7 tabel penuh/buka (termasuk seluruh riwayat absensi/munaqosah/akhlaq untuk kebutuhan 7-hari/nilai-max), 0 cache, N+1 CPU ±280.000 operasi/buka — layar PALING SERING dibuka dengan skor PALING RENDAH kedua |
| **Login** | **68** | Kurang Efisien (mendekati Cukup) | Baca `users` penuh untuk 1 baris — tapi tabel kecil, dipanggil 1×/sesi (bukan berulang), jadi dampak riil kecil meski polanya sama seperti modul lain |
| **Absensi Generus (edit sel)** | **28** | Sangat Boros | Baca `absensi` PENUH (semua kelompok, semua tanggal) untuk `.find()` 1 baris — rasio kerja:hasil paling timpang di seluruh codebase |
| **Absensi Guru (Simpan)** | **22** | Sangat Boros (TERENDAH) | Sama seperti di atas DITAMBAH terjadi di dalam `withScriptLock_` global (mengunci SEMUA penulis app lain) — operasi PALING SERING dilakukan guru (harian) dengan skor PALING RENDAH di seluruh aplikasi |

**Rata-rata skor tertimbang aplikasi (dibobot frekuensi pemakaian)**: **±42/100** — Sangat Boros secara keseluruhan, TAPI didorong oleh segelintir modul dengan frekuensi pemakaian tinggi (Dashboard, Absensi), bukan merata di semua modul. Master Data (yang paling sering diakses tidak langsung, lewat cache) justru sudah 82/100 — bukti bahwa perbaikan itu MUNGKIN dan polanya sudah terbukti.

---

## 3. COST SAVING ESTIMATION

Karena Apps Script tidak mengekspos angka biaya rupiah langsung (§16 Audit A), penghematan dinyatakan dalam **persentase pengurangan** relatif terhadap kondisi sekarang.

| Rekomendasi | ↓ Read | ↓ Query | ↓ Parsing | ↓ Bandwidth (server-side) | ↓ Waktu Loading |
|---|---|---|---|---|---|
| Cache `serverGetDashboardBundle` (TTL 60-120dtk) | **-85 s/d -95%** (dari 35 read/hari → ±2-5 read/hari, hanya saat cache MISS) | -85% s/d -95% | -85% s/d -95% (N+1 280.000 operasi ikut hilang saat cache HIT) | -85% s/d -95% dari ±600KB/buka | **-60% s/d -80%** (500ms-2detik → <100ms saat cache HIT) |
| Map lookup ganti `.find()` dalam `.forEach()` | 0% (query TIDAK berkurang) | 0% | **-99%** (O(n×m)→O(n), 280.000→±1.600 operasi) | 0% | **-10% s/d -20%** (CPU time Apps Script berkurang, terasa di request yang cache-nya MISS) |
| Perbaiki `serverSaveAbsensiDaily`/`serverSetAbsensiSatuSantri` (query bertarget, bukan full-scan) | **-95%+** (dari baca ±1.400 baris → baca ±5-30 baris relevan) | Tetap 1 query, TAPI query-nya jauh lebih sempit | -95%+ | -95%+ dari ±250KB/aksi | **-40% s/d -70%**, DAN menghilangkan risiko lock global memblokir penulis lain |
| Bundle + cache 4 fungsi Statistik | **-75% s/d -90%** (4 query independen → 1 query + cache) | -75% (4→1 per sesi, plus cache antar-sesi) | -75% s/d -90% | -75% s/d -90% | -50% s/d -70% (khusus saat ganti sub-tab) |
| Cache Konseling/Munaqosah/Kalender/Pusat Unduhan/Kop Surat/Quote Harian | **-60% s/d -90%** tergantung pola akses (semakin sering dibuka ulang dalam TTL, semakin besar penghematan) | Sebanding dengan cache hit rate | Sebanding | Sebanding | -30% s/d -60% saat cache HIT |
| Gilirkan cache tabel master ke 17 kelompok lain | **-70% s/d -85%** untuk kelompok yang sebelumnya 100% cache MISS | Sebanding | Sebanding | Sebanding | -40% s/d -60% |

---

## 4. ROI (Return On Improvement)

| Optimasi | Kesulitan | Estimasi Waktu | Risiko | Manfaat | Klasifikasi |
|---|---|---|---|---|---|
| Cache `serverGetDashboardBundle` | Sangat rendah — bungkus 1 fungsi | 15-30 menit | Sangat rendah (pola sudah ada 5× di kode yang sama) | Sangat besar (layar paling sering dibuka) | **Quick Win** |
| Map lookup ganti `.find()` dalam `.forEach()` (Dashboard) | Sangat rendah — 3 titik, ubah lokal | 20-40 menit | Nyaris nol (murni algoritma, hasil identik) | Sedang-besar (CPU time, terasa saat cache miss) | **Quick Win** |
| Cache Quote Harian (TTL panjang) | Sangat rendah | 10-15 menit | Nyaris nol (data berubah 1×/hari) | Kecil-sedang (modul kecil, tapi dipanggil tiap buka mobile) | **Quick Win** |
| Cache Kop Surat (TTL panjang) | Sangat rendah | 10-15 menit | Nyaris nol | Kecil (dipanggil hanya saat generate PDF) | **Quick Win** |
| Naikkan TTL `sidebar_tree` 300→600-900dtk | Sangat rendah — ubah 1 angka | 5 menit | Nyaris nol | Kecil | **Quick Win** |
| Bundle + cache 4 fungsi Statistik | Rendah-sedang — copy pola Dashboard bundle | 1-2 jam | Rendah (pola sudah terbukti) | Besar (4× duplikasi hilang) | **High Impact** |
| Cache Konseling | Rendah — tiru pola Santri/Guru | 1-2 jam | Rendah, WAJIB `cacheDrop_` di titik simpan | Sedang-besar | **High Impact** |
| Cache Munaqosah | Rendah — tiru pola Santri/Guru | 1-2 jam | Rendah, WAJIB `cacheDrop_` di titik simpan | Besar (modul dengan baca terbanyak) | **High Impact** |
| Perbaiki `serverSaveAbsensiDaily` (cabang Sheets, query bertarget) | Sedang — perlu desain query Sheets yang lebih sempit ATAU replikasi pola Firestore Petemon | 1-2 hari (per kelompok, atau sekali kalau digeneralisasi) | Sedang — menyentuh alur mutasi data harian yang kritikal, PERLU testing hati-hati | Sangat besar (operasi paling sering + risiko lock global) | **High Impact** |
| Perbaiki `serverSetAbsensiSatuSantri` (cabang Sheets) | Sedang | 4-8 jam | Sedang | Besar | **High Impact** |
| Gilirkan cache tabel master ke 17 kelompok | Rendah — isi entry baru di struktur yang sudah ada | 2-4 jam | Rendah | Sedang-besar | **Medium Impact** |
| Cache Kalender & Pusat Unduhan | Rendah | 1-2 jam total | Rendah | Sedang | **Medium Impact** |
| Perbaiki nested-read `readSheetAsObjects` (santri dibaca ulang di dalam absensi) | Sedang — ubah signature helper generik yang dipakai ±200 titik | 2-4 jam + testing regresi lebih luas | Sedang (helper generik, dampak luas kalau salah) | Kecil-sedang (hanya kelompok yang sudah Firestore) | **Medium Impact** |
| Sambungkan pagination `serverGetUsersList` ke UI | Rendah | 2-3 jam | Rendah | Kecil (baru relevan >100 user) | **Low Priority** |
| Batch multi-cell edit matrix Kehadiran Generus | Sedang — perlu UI batching + endpoint baru | 1 hari | Rendah-sedang | Kecil (jarang dipakai untuk banyak sel sekaligus) | **Low Priority** |
| Hapus/beri peringatan `serverGetKehadiranChart7Hari` | Sangat rendah | 5-10 menit | Nyaris nol | Nyaris nol (0 biaya nyata sekarang) | **Low Priority** |
| Migrasi kelompok 2-18 ke Firestore | Tinggi — per kelompok, perlu extraction+validasi data | Berhari-hari per kelompok | Sedang-tinggi (kuota UrlFetch bisa habis lagi, §5 Audit B) | Besar TAPI trade-off kuota | **Long Term** |

---

## 5. HEAT MAP Pemborosan

Panjang bar merepresentasikan tingkat pemborosan relatif (kombinasi frekuensi pemakaian × besarnya over-read per aksi × ketiadaan cache). Skala kualitatif, bukan linear presisi.

```
Absensi Guru (Simpan)         ████████████████████████████  (skor 22 — TERBOROS, blocking + full-scan)
Absensi Generus (edit sel)    ██████████████████████████    (skor 28 — full-scan utk 1 baris)
Dashboard (Admin PPG)         █████████████████████████     (skor 32 — paling sering dibuka, 7 tabel)
Munaqosyah (Nilai)            ██████████████████████        (skor 35 — baca tabel terbanyak di codebase)
Statistik                     █████████████████████         (skor 40 — 4× duplikasi, 0 cache)
Konseling                     ███████████████████            (skor 42 — 19 titik, 0 cache)
Kalender                      ██████████████████             (skor 45 — 0 cache, data statis)
Laporan (non-Rapor)           ██████████████                 (skor 58 — sebagian sudah baik)
Jadwal                        ██████████████                 (skor 58 — cache cuma 1/18 kelompok)
Dashboard mobile (Guru/AdminKelp) ████████████               (skor 65 — sudah lumayan, 17/18 kelompok blm)
Login                         ██████████                     (skor 68 — kecil, jarang jadi masalah nyata)
Rapor                         ███████                        (skor 76 — query sudah scoped)
Master Data                   █████                          (skor 82 — SUDAH cache, contoh terbaik)
```

---

## 6. TOP 20 PRIORITAS

Diurutkan berdasarkan (Manfaat) ÷ (Perubahan kode). Nomor kecil = ROI tertinggi.

| # | Optimasi | Kenapa di urutan ini |
|---|---|---|
| 1 | Cache `serverGetDashboardBundle` | Manfaat TERBESAR (layar paling sering dibuka, 7 tabel/buka) dengan perubahan TERKECIL (bungkus 1 fungsi, pola sudah ada 5× di kode yang sama) — rasio ROI tertinggi di seluruh daftar |
| 2 | Map lookup ganti `.find()` dalam `.forEach()` (Dashboard, 3 titik) | Perubahan lokal 5-10 baris/titik, nol risiko (hasil identik, murni algoritma), langsung memangkas 99% operasi CPU N+1 |
| 3 | Cache Quote Harian | 1 fungsi, TTL panjang (data berubah 1×/hari) — risiko stale nyaris tidak ada |
| 4 | Cache Kop Surat | Sama seperti di atas, data berubah sangat jarang |
| 5 | Naikkan TTL `sidebar_tree` | Ubah 1 angka, dampak kecil tapi effort juga nyaris nol — "gratis" |
| 6 | Bundle + cache 4 fungsi Statistik | Effort sedang (copy pola Dashboard bundle yang sudah terbukti), manfaat besar (hilangkan 4× duplikasi) |
| 7 | Cache Munaqosah | Modul dengan pembacaan tabel penuh TERBANYAK — dampak besar, effort rendah (tiru pola Santri/Guru) |
| 8 | Cache Konseling | Sama seperti di atas, modul terbesar kedua |
| 9 | Perbaiki `serverSaveAbsensiDaily` (cabang Sheets) | Manfaat SANGAT besar (aksi harian tersering + hilangkan risiko lock global), tapi effort lebih tinggi (perlu desain query bertarget/replikasi Firestore) — turun beberapa peringkat dari #1-2 karena kerumitan implementasi, TAPI tetap wajib dikerjakan lebih dulu dari optimasi "medium" lain karena risikonya paling nyata |
| 10 | Perbaiki `serverSetAbsensiSatuSantri` (cabang Sheets) | Pola sama seperti #9, dampak sedikit lebih kecil (dipakai lebih jarang — koreksi manual, bukan harian) |
| 11 | Gilirkan cache tabel master ke 17 kelompok | Effort rendah (isi entry baru di struktur yang sudah ada), manfaat sedang-besar tergantung berapa kelompok yang benar-benar aktif |
| 12 | Cache Kalender | Data kalender akademik nyaris statis — effort rendah, manfaat sedang |
| 13 | Cache Pusat Unduhan | Sama seperti Kalender |
| 14 | Tambahkan tombol "Refresh" eksplisit (forceFresh) ke Dashboard | Pelengkap #1 — pola sudah ada di Santri/Guru, tinggal disambungkan, mitigasi risiko stale dari cache Dashboard |
| 15 | Perbaiki nested-read `readSheetAsObjects` (santri terbaca ulang di dalam absensi) | Manfaat sedang, tapi effort & risiko lebih tinggi (ubah signature helper generik yang dipakai ±200 titik) — WAJIB testing regresi lebih luas |
| 16 | Sambungkan pagination `serverGetUsersList` ke UI | Server sudah siap (parameter sudah ada), effort rendah, TAPI manfaat kecil di skala user sekarang |
| 17 | Turunkan risiko N+1 di Munaqosah/Monitoring (Map lookup, pola sama #2) | Effort rendah, manfaat sedang — sudah terbukti pola di Dashboard, tinggal direplikasi |
| 18 | Hapus/beri peringatan tegas `serverGetKehadiranChart7Hari` (dead code) | Effort sangat rendah, manfaat nyaris nol (0 biaya nyata sekarang) — masuk daftar krn "gratis dikerjakan", bukan krn urgensi |
| 19 | Batch multi-cell edit matrix Kehadiran Generus | Effort sedang (perlu UI+endpoint baru), manfaat kecil (jarang dipakai untuk banyak sel sekaligus) |
| 20 | Cache `serverGetDashboardBundle` — bagian "Santri Teladan" dengan TTL LEBIH PANJANG dari KPI (differentiated TTL) | Penyempurnaan lanjutan dari #1 — nilai munaqosah/akhlaq jarang berubah drastis, bisa di-cache lebih agresif daripada KPI harian — manfaat marjinal setelah #1 selesai, effort kecil |

---

## 7. BEFORE vs AFTER

| Optimasi | Sebelum | Sesudah | Estimasi Penghematan |
|---|---|---|---|
| **Cache Dashboard Admin PPG** | 7 tabel penuh dibaca TIAP buka (±600KB server-side, 500ms-2detik) | 7 tabel dibaca 1× per 60-120dtk, sisanya dari cache (±50ms) | ↓85-95% read, ↓60-80% waktu loading pada cache HIT |
| **Map lookup Dashboard** | ±280.000 operasi `.find()` linear per buka | ±1.600 operasi `Map.get()` O(1) per buka | ↓99% operasi CPU (khusus jalur perhitungan, tidak mengubah query) |
| **Simpan Absensi Guru (17 kelompok)** | Baca `absensi` PENUH (±1.400+ baris, tumbuh terus) di dalam lock global tiap simpan | Baca hanya baris relevan (1 kelas, 1 tanggal, ±5-30 baris) | ↓95%+ read & waktu, HILANGKAN risiko lock global memblokir penulis lain |
| **Edit 1 sel Kehadiran Generus (17 kelompok)** | Baca `absensi` PENUH untuk `.find()` 1 baris | Query/lookup bertarget 1 baris | ↓95%+ read |
| **Statistik (4 sub-tab)** | 4× baca `absensi` PENUH independen, 0 cache | 1× baca + cache, dipakai ulang antar sub-tab & antar sesi (dalam TTL) | ↓75-90% read saat ganti sub-tab |
| **Konseling/Munaqosah** | Setiap buka layar/CRUD = baca tabel penuh, 0 cache | Baca sekali per TTL (60-300dtk), invalidasi otomatis saat ada simpan baru | ↓60-90% read tergantung frekuensi akses ulang |
| **Jadwal 17 kelompok non-Petemon** | 100% cache MISS, baca langsung tiap kali | Cache 300dtk (pola sama Petemon) | ↓70-85% read utk kelompok yang sebelumnya tidak punya cache sama sekali |
| **Quote Harian / Kop Surat** | Baca ulang tiap kali dipanggil (harian utk Quote, tiap generate PDF utk Kop Surat) | Cache TTL panjang (jam-jaman) | ↓80-95%, risiko stale nyaris nol (data memang jarang berubah) |

---

## 8. IMPLEMENTATION ROADMAP

### Sprint 1 — Quick Wins (estimasi total: 2-4 jam kerja)
- Cache `serverGetDashboardBundle` (#1)
- Map lookup Dashboard, 3 titik (#2)
- Cache Quote Harian (#3)
- Cache Kop Surat (#4)
- Naikkan TTL `sidebar_tree` (#5)
- **Target**: penghematan read Dashboard ±85-95%, tanpa risiko berarti.

### Sprint 2 — Medium Improvements (estimasi total: 1-2 hari kerja)
- Bundle + cache Statistik (#6)
- Cache Munaqosah (#7)
- Cache Konseling (#8)
- Gilirkan cache tabel master ke 17 kelompok (#11)
- Cache Kalender & Pusat Unduhan (#12, #13)
- Tombol Refresh eksplisit Dashboard (#14)
- Map lookup Munaqosah/Monitoring (#17)
- **Target**: penghematan read total harian ±60-75% dari kondisi awal (kumulatif dengan Sprint 1).

### Sprint 3 — Major Optimization (estimasi total: 2-4 hari kerja, PERLU testing lebih hati-hati)
- Perbaiki `serverSaveAbsensiDaily` cabang Sheets — query bertarget (#9)
- Perbaiki `serverSetAbsensiSatuSantri` cabang Sheets (#10)
- Perbaiki nested-read `readSheetAsObjects` (#15)
- Sambungkan pagination `serverGetUsersList` (#16)
- **Target**: hilangkan risiko lock global pada operasi absensi harian — INI yang paling menyentuh pengalaman guru, kerjakan setelah Sprint 1+2 terbukti stabil.

### Sprint 4 — Persiapan Migrasi Supabase
- **Jangan** migrasi kelompok baru ke Firestore dulu (menambah beban kuota `UrlFetchApp` yang sudah pernah habis) — cukup pertahankan Sprint 1-3 sampai migrasi Supabase siap.
- Rancang skema Supabase dengan mempertimbangkan pola akses yang SUDAH terpetakan di 2 audit sebelumnya (mis. `absensi` butuh index tanggal+santri_id, `users`/`profiles` butuh index username — ini SUDAH ada di rencana Migration 002, lihat memory project).
- Perombakan struktur besar (index, restrukturisasi tabel) ditunda ke sini — supaya tidak dikerjakan 2× (sekali di Apps Script, sekali lagi di Supabase).

---

## 9. STOP LIST

Hal-hal yang **TIDAK PERLU** dioptimasi sekarang:

| Item | Alasan tidak diprioritaskan |
|---|---|
| Query Firestore (Kelp Petemon) | Sudah relatif optimal — hasil audit sebelumnya (CLAUDE.md "Prinsip Performa Firestore") sudah menyisir semua collection, tidak ada query tanpa filter tersisa |
| Gambar/logo (base64 inline) | Sudah efisien untuk ukuran sekarang (puluhan KB), tidak ada fetch berulang; risiko cuma muncul kalau nanti ada upload gambar besar (belum ada) |
| Realtime/polling | Tidak ada sama sekali di codebase — biaya sudah 0, tidak ada yang perlu dioptimasi |
| PropertiesService | Sudah optimal (1 pemakaian, dilindungi cache token 55 menit) |
| Hapus dead code `serverGetKehadiranChart7Hari` | Penghematannya nyaris nol (0 biaya nyata sekarang) — boleh dikerjakan "iseng" kapan saja tapi bukan prioritas |
| Batch multi-cell edit matrix Kehadiran Generus | Frekuensi pemakaian rendah (koreksi manual, jarang), risiko implementasi (perlu endpoint+UI baru) tidak sepadan dengan manfaatnya sekarang |
| Migrasi kelompok 2-18 ke Firestore | **Lebih tepat ditunda ke migrasi Supabase** — menambah kelompok ke Firestore menambah beban kuota `UrlFetchApp` yang sudah pernah habis, sementara cache (Sprint 1-2) memberi penghematan setara TANPA risiko kuota tambahan |
| Pagination UI penuh untuk Santri/Guru | Baru relevan kalau 1 kelompok punya >100-200 santri — skala sekarang (±70 santri/kelompok terbesar) belum butuh |
| Field selection / SELECT parsial di Sheets | Keterbatasan platform (Sheets API tidak punya cara pilih kolom parsial semudah SQL) — bukan sesuatu yang bisa "dioptimasi" di sisi kode, biarkan apa adanya |

---

## 10. FINAL RECOMMENDATION

**5 optimasi dengan dampak terbesar:**
1. Cache `serverGetDashboardBundle`
2. Perbaiki `serverSaveAbsensiDaily` (hilangkan full-scan + risiko lock global)
3. Cache Munaqosah (modul dengan baca tabel terbanyak)
4. Bundle + cache Statistik
5. Perbaiki `serverSetAbsensiSatuSantri`

**5 optimasi termudah (Quick Wins, effort <1 jam masing-masing):**
1. Cache Quote Harian
2. Cache Kop Surat
3. Naikkan TTL `sidebar_tree`
4. Map lookup Dashboard (3 titik)
5. Hapus/beri peringatan dead code `serverGetKehadiranChart7Hari`

**5 optimasi yang sebaiknya DITUNDA sampai migrasi Supabase:**
1. Migrasi kelompok 2-18 ke Firestore
2. Perombakan struktur/index besar
3. Field selection/parsial read di Sheets (keterbatasan platform, bukan hal yang bisa "diperbaiki" di sisi Apps Script)
4. Batch multi-cell edit matrix Kehadiran Generus (manfaat kecil, effort tidak sepadan sekarang)
5. Pagination UI penuh (belum relevan di skala data sekarang)

**Estimasi total penghematan yang mungkin dicapai sebelum migrasi Supabase** (kumulatif Sprint 1-3, dibandingkan kondisi audit hari ini):
- **Read tabel penuh harian**: dari ±400-680/hari (4 kelompok aktif) → **±100-180/hari** (↓ ±70-80%)
- **Waktu loading Dashboard**: dari 500ms-2detik → **<100-300ms** pada cache HIT (↓ ±60-85%)
- **Risiko lock global pada Simpan Absensi**: **dihilangkan total** (bukan cuma dikurangi) — ini yang paling berdampak pada pengalaman guru sehari-hari
- **Kuota `UrlFetchApp`**: TIDAK bertambah sama sekali (semua optimasi Sprint 1-3 murni cache/algoritma di sisi Sheets, tidak menambah kelompok baru ke Firestore) — aman dari risiko 429 yang sudah pernah terjadi

Dengan pencapaian ini, aplikasi Ruang Ngaji versi Apps Script/Sheets/Firestore gratis berpeluang tetap stabil melayani seluruh 18 kelompok dengan beban baca yang jauh lebih rendah, memberi waktu yang cukup untuk migrasi Supabase berjalan tanpa tekanan kuota atau performa dari sisi produksi yang sedang berjalan.
