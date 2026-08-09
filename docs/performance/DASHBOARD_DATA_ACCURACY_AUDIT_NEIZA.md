# Dashboard Data Accuracy Audit — Guru Neiza, Kelas Remaja SMA (Tahap 16)

> Mode: **INVESTIGATION ONLY**. Tidak ada kode/Firestore/cache diubah,
> tidak ada deploy, tidak ada write production, tidak ada data dihapus.
> Semua angka di laporan ini diperoleh via diag route READ-ONLY yang
> SUDAH ADA (`?diag=listkelompok`/`rows`, Code.js, permanent, "who has
> access: MYSELF"). Tanggal: 2026-08-08.

---

## 1. Incident Summary

Guru Neiza (username `neizaadindanazalia@gmail.com`, `users.id=3`,
`guru_id=22`, kelompok 1/Kelp Petemon) melaporkan kartu "Hari Aktif"
utk kelasnya (Remaja SMA) menampilkan **7 hari**, padahal dia mengira
seharusnya **10 hari**.

---

## 2. Expected Result

```
Teacher Expected = 10 hari
```
**Belum diverifikasi benar** — TIDAK diasumsikan benar tanpa bukti,
sesuai instruksi eksplisit. Dibandingkan dgn ground truth di §9.

---

## 3. Dashboard Metric Definition

Ditemukan **DUA implementasi terpisah** dari metric "Hari Aktif" utk
guru (BUKAN 1, penting utk investigasi ini):

**(A) Dashboard Kehadiran — kartu per kelas** (`serverGetGuruDashboardSummaryRange`,
Modul_InputAbsen.gs:1048-1093):
```js
// Hari Aktif = jumlah tanggal BERBEDA yang sudah diisi guru utk kelas ini
const tanggalDiisi = {};
absensiRange.forEach(function (a) {
  if (santriIdsKelas.indexOf(Number(a.santri_id)) === -1) return;
  ...
  tanggalDiisi[tanggalKeString_(a.tanggal)] = true;
});
summary.hariAktif = Object.keys(tanggalDiisi).length;
```
Formula: **COUNT(DISTINCT tanggal)** dari SELURUH record absensi milik
santri kelas ini, DALAM rentang `tanggalMulai..tanggalSelesai` yang
dikirim client — **APAPUN statusnya** (hadir/izin/sakit/alpa SEMUA
dihitung, TIDAK ADA status filter).

**(B) Riwayat Kehadiran — layar terpisah** (`serverGetRiwayatKehadiranGuru`,
Modul_InputAbsen.gs:1518-1578): formula IDENTIK (`tanggalDiisi`, COUNT
DISTINCT tanggal, semua status dihitung), TAPI rentang tanggalnya
DIHITUNG BERBEDA (§8) — 1 BULAN KALENDER spesifik (parameter `year,
month`), BUKAN range bebas dari client.

**Kesimpulan §3**: definisi "Hari Aktif" (distinct-date, semua status)
**KONSISTEN** di kedua layar — TIDAK ADA perbedaan formula. Perbedaan
HANYA di rentang tanggal (§8), yang menjadi fokus investigasi ini.

---

## 4. Dashboard Data Flow

```
Guru buka layar "Dashboard Kehadiran" (mobile, home view Input Absen)
  ↓
window.iaShowDashboardView_ → window.iaLoadDashboardSummary_
  (Script_Main.html:1918-1951)
  ↓
filter = window.iaState_.dashboardFilter
  || window.iaCurrentMonthFilter_() (DEFAULT: bulan KALENDER SAAT INI,
     dihitung dari `new Date()` di BROWSER guru -- lihat §8)
  ↓
google.script.run.serverGetGuruDashboardSummaryRange(token, filter.mulai, filter.selesai)
  ↓
Modul_InputAbsen.gs: requireGuruContext_ → iaReadKelompokTablesParallel_
  (JADWAL_KBM/GURU/SANTRI) → getKelasOwnedByGuru_ (kelas milik guru_id=22)
  → iaReadAbsensiKelompokRange_(kelompokId, santriIds, tanggalMulai, tanggalSelesai)
  ↓
iaReadAbsensiKelompokRange_ (Modul_InputAbsen.gs:91-102):
  isKelompokTableOnFirestore_('absensi','1') === true
  → firestoreRangeQuery_('absensi','tanggal', tanggalMulai, tanggalSelesai)
  → firestoreRunQuery_ (STRUCTURED QUERY, filter tanggal DI SISI FIRESTORE)
  ↓
hitung tanggalDiisi per kelas (§3) → summary.hariAktif
  ↓
window.iaRenderDashboardCards_(result.data) → tampil di kartu "Hari Aktif"
```

**TIDAK ADA cache server-side** di jalur ini (`absensi` SENGAJA TIDAK
ada di `IA_KELOMPOK_TABLE_CACHE_KEY_`, dikonfirmasi komentar eksplisit
Modul_InputAbsen.gs:130-132 — "selalu baca langsung"). **ADA cache
client-side** (`window.iaState_.dashboardLoadedKey`, in-memory JS,
BUKAN persisten) — dianalisis §13, DIKESAMPINGKAN sbg penyebab (tidak
relevan utk insiden ini).

---

## 5. Data Source

```
Collection Firestore : kelompok/1/absensi
Query                : firestoreRunQuery_ (structured query, filter tanggal
                        range di sisi server Firestore, BUKAN download-semua-lalu-filter)
Sheets               : TIDAK DIPAKAI (kelompok 1 = Firestore utk absensi,
                        readSheetAsObjects generik TIDAK dipanggil di jalur ini)
Cache                : TIDAK ADA (server-side); client-side TIDAK relevan (§13)
```

---

## 6. Neiza Identity

```
users.id            = 3
users.nama           = "Neiza Adinda Nazalia"
users.username        = neizaadindanazalia@gmail.com
users.role            = guru
users.scope_type      = kelompok
users.scope_id        = 1
users.guru_id         = 22
guru.id (Modul_MaintainGuru)  = 22, nama = "Neiza Adinda Nazalia", kelompok_id=1
```
**Identity TUNGGAL, TIDAK ADA duplikat nama/ID ganda** ditemukan (grep
`guru` sheet utk "neiza" → 1 hasil; `users` sheet utk id=3 → 1 hasil,
guru_id=22 cocok). `dicatat_oleh` pada SELURUH 8 tanggal attendance
kelas Remaja SMA (§9) = **3** — cocok PERSIS dgn `users.id` Neiza
sendiri (BUKAN admin/guru lain yang menginput atas namanya).

---

## 7. Remaja SMA Identity

```
jadwal_kbm.id=9: guru_id="22", kelas="Remaja SMA", kategori="Remaja SMA",
  kelompok_id=1, hari="Senin", jam 18:00-19:00
santri.kelas_ngaji === "Remaja SMA" (exact match, case sensitive AS STORED):
  7 santri -- id 205, 217, 218, 224, 227, 228, 229
```
**TIDAK ADA variasi penulisan** ("REMAJA SMA"/"Remaja-SMA"/dll) ditemukan
di data SANTRI/JADWAL_KBM kelompok 1 — kelas + kategori KEBETULAN sama
persis string-nya di kasus ini ("Remaja SMA" == "Remaja SMA"), TIDAK
menjadi sumber ambiguitas identity utk insiden ini (dicatat sbg
POTENSI kebingungan MASA DEPAN kalau kelas≠kategori di kelas lain,
BUKAN penyebab insiden ini).

---

## 8. Dashboard Date Range

**Ini KUNCI temuan investigasi ini.**

```
Dashboard Kehadiran (kartu per kelas, serverGetGuruDashboardSummaryRange):
  Start Date = tanggalMulai (parameter BEBAS dari client)
  End Date   = tanggalSelesai (parameter BEBAS dari client)
  Timezone   = TIDAK RELEVAN LANGSUNG (tanggal SELALU string 'yyyy-MM-dd',
               perbandingan lexicographic, BUKAN objek Date) -- TAPI
               PENGHITUNGAN filter DEFAULT (`iaCurrentMonthFilter_`)
               memakai `new Date()` DI BROWSER GURU (client-side JS,
               timezone device guru, TIDAK bisa diverifikasi dari sini --
               lihat §14/§16 Open Questions)
  Inclusive/exclusive = INKLUSIF kedua ujung (firestoreRangeQuery_ pakai
               GREATER_THAN_OR_EQUAL/LESS_THAN_OR_EQUAL, Modul_FirestoreBridge.gs:258-277)
  Default    = BULAN KALENDER SAAT INI (window.iaCurrentMonthFilter_,
               Script_Main.html:1903-1910) -- dihitung dari `new Date()`
               SAAT PAGE DIBUKA, BUKAN tanggal sistem server, BUKAN
               tanggal input terakhir, BUKAN "rolling N hari", BUKAN
               semester/tahun ajaran
  Bisa diubah = YA, via tombol filter Bulan-Tahun (popup, `iaFilterBtnLabel`)
               -- guru BISA memilih bulan LAIN secara manual
```

**Bukan diasumsikan** — dikonfirmasi langsung dari kode
`window.iaCurrentMonthFilter_` (Script_Main.html:1903-1910): default
SELALU "bulan 1 (tanggal awal) s/d bulan lastDay (tanggal akhir)" dari
BULAN & TAHUN `new Date()` browser SAAT ITU.

---

## 9. Firestore Ground Truth

Dibaca LANGSUNG via `firestoreListCollection_('kelompok/1/absensi')`
(diag route permanen `?diag=listkelompok`, FULL READ, TIDAK dipotong
pagination — dikonfirmasi loop `nextPageToken` di
`firestoreListCollection_`, Modul_FirestoreBridge.gs), difilter
`santri_id` ∈ {205,217,218,224,227,228,229} (7 santri Remaja SMA, §7):

```
Total dokumen absensi kelompok 1 : 170
Dokumen Remaja SMA (7 santri x N tanggal) : 56 (= 7 x 8, SEMUA santri
  punya record persis di 8 tanggal yang SAMA -- tidak ada santri yang
  "bolong" 1 tanggal drpd yang lain)

Unique tanggal (ALL-TIME, TANPA batas bulan apa pun):
  2026-07-20, 2026-07-21, 2026-07-22, 2026-07-23, 2026-07-27,
  2026-07-30, 2026-07-31, 2026-08-07
  = 8 tanggal BERBEDA
```

```
Expected reported by teacher = 10
Actual Firestore (all-time)  = 8
Difference                    = 2 (BUKAN 3 -- lihat §22)
```

**Guru Neiza's expectation "10" TIDAK COCOK bahkan dgn ground truth
all-time (8)** — sudah ada selisih 2 SEBELUM periode/filter apa pun
diterapkan. **Angka "10" TIDAK diasumsikan benar** (sesuai instruksi).

---

## 10. Date-by-Date Reconciliation

| Date (2026) | Hari | Attendance Exists (Firestore) | Guru | Kelas | Included by "Juli 2026" filter | Included by "Agustus 2026" filter (default kalender saat ini) | Reason |
|---|---|---:|---|---|---:|---:|---|
| 07-20 | Senin | YA (7 santri, dicatat_oleh=3) | Neiza (22) | Remaja SMA | INCLUDED | EXCLUDED | dalam rentang 07-01..07-31 |
| 07-21 | Selasa | YA | Neiza (22) | Remaja SMA | INCLUDED | EXCLUDED | idem |
| 07-22 | Rabu | YA | Neiza (22) | Remaja SMA | INCLUDED | EXCLUDED | idem |
| 07-23 | Kamis | YA | Neiza (22) | Remaja SMA | INCLUDED | EXCLUDED | idem |
| 07-27 | Senin | YA | Neiza (22) | Remaja SMA | INCLUDED | EXCLUDED | idem |
| 07-30 | Kamis | YA | Neiza (22) | Remaja SMA | INCLUDED | EXCLUDED | idem |
| 07-31 | Jumat | YA | Neiza (22) | Remaja SMA | INCLUDED | EXCLUDED | idem |
| 08-07 | Jumat | YA | Neiza (22) | Remaja SMA | **EXCLUDED** | INCLUDED | **08-07 di LUAR rentang 07-01..07-31** (ini bulan BERBEDA) |

**Total "Juli 2026" filter = 7** (PERSIS cocok dgn "Dashboard
menampilkan: 7 hari" — MATCH EKSAK, bukan kebetulan mendekati). **Total
"Agustus 2026" filter (default kalender saat ini, 2026-08-08) = 1.**

**TIDAK ADA tanggal dgn `Raw=YES, Query=EXCLUDED-secara-tidak-sengaja`**
di LUAR batas bulan yang dipilih — SEMUA exclusion (08-07 dari filter
Juli) **DIJELASKAN PENUH** oleh batas periode yang SAH (bukan bug
query/filter kelas/guru).

---

## 11. Query Result

```
Firestore range query (tanggal >= '2026-07-01' AND tanggal <= '2026-07-31'):
  RETURN 7 tanggal unik (kelas Remaja SMA) -- SESUAI EKSPEKTASI struktural
  query (7 dari 8 raw dates ada di rentang Juli)
```
**Query BENAR** — tidak ada bug di `firestoreRangeQuery_`/
`firestoreRunQuery_` (perbandingan string lexicographic pada format
'yyyy-MM-dd' SELALU benar utk rentang tanggal SATU bulan, tidak ada
edge-case boundary yang salah di sini).

---

## 12. Calculation Result

```
tanggalDiisi = {2026-07-20,...,2026-07-31} (7 entries, dari 7 dokumen
  UNIK tanggal x SEMUA 7 santri per tanggal -- Object.keys().length
  MENGHITUNG TANGGAL, BUKAN dokumen, jadi 49 dokumen dalam rentang Juli
  [7 tanggal x 7 santri] TETAP menghasilkan 7 -- deduplication BEKERJA
  BENAR, dikonfirmasi §16)
summary.hariAktif = 7
```
**Calculation BENAR** — formula distinct-date sudah dijalankan sesuai
definisi §3, TIDAK ADA bug di logic penghitungan.

---

## 13. Cache Analysis

```
Cache key    : window.iaState_.dashboardLoadedKey ('range:'+mulai+':'+selesai)
TTL          : TIDAK ADA (in-memory JS variable, BUKAN CacheService,
               reset ke undefined tiap page load/reload penuh)
What cached  : HANYA mencegah re-fetch REDUNDAN saat pindah-pindah view
               dalam 1 SESI BROWSER TANPA filter berubah (Script_Main.html:1491)
When invalidated : diset null SETIAP kali serverSaveAbsensiKelas/Admin
               SUKSES (Script_Main.html:2608, bagian dari onSaveResult
               yang SUDAH ADA sejak Tahap 9), DAN otomatis ke-reset
               (undefined) tiap reload halaman
Absensi save invalidate cache? YA (utk jalur Input Absen guru,
               serverSaveAbsensiKelas) -- Daily/SingleStudent (Tahap 15)
               TIDAK relevan di sini (layar BERBEDA, state JS BERBEDA,
               `dicatat_oleh=3` di data mengindikasikan Neiza input via
               Input Absen guru-nya sendiri, BUKAN via layar admin)
```

**Pertanyaan utama prompt**: "Apakah Neiza sudah menyimpan 10 hari
tetapi Dashboard masih pakai cache yang hanya berisi 7?" **JAWABAN:
TIDAK** — (a) TIDAK ADA cache server-side sama sekali utk `absensi`
(dikonfirmasi §5), (b) cache client-side SELALU reset tiap reload
halaman (jadi TIDAK BISA "nyangkut" lintas sesi), (c) bahkan KALAU
cache client BELUM reset, cache itu HANYA MENYIMPAN HASIL RENDER
sebelumnya utk filter yang SAMA PERSIS ('range:2026-07-01:2026-07-31')
— TIDAK ADA mekanisme yang bisa membuat 10 dokumen ASLI ter-cache
jadi "7" (cache MEREKAM APA YANG SERVER KEMBALIKAN, bukan
memotong/mengubah angka). **Cache DIKESAMPINGKAN sbg penyebab.**

---

## 14. Date/Timezone Analysis

```
Firestore date representation : SELALU stringValue 'yyyy-MM-dd'
  (dikonfirmasi firestoreEncodeValue_, Modul_FirestoreBridge.gs:126-141 --
  komentar eksplisit "kolom tanggal ... SELALU disimpan sebagai teks
  string, TIDAK PERNAH pakai timestampValue")
8 dokumen raw (§9) : SEMUA field `tanggal` berupa string polos
  ("2026-07-20", dst) -- TIDAK ADA jejak objek Date/ISO-timestamp yang
  "bocor" (BEDA dgn bug ERROR_LOG.md #7/#8 yang PERNAH terjadi di Sheets
  -- TIDAK terulang di sini, Firestore path SUDAH imun sejak awal
  desain, dikonfirmasi §Aturan penting Modul_FirestoreBridge.gs)
tanggalKeString_ dipanggil di titik penghitungan (Modul_InputAbsen.gs:1086)
  -- AMAN dipanggil pada string 'yyyy-MM-dd' polos (branch pertama
  `instanceof Date` = false, branch kedua regex ISO-datetime = false
  [krn TIDAK ada 'T' di string], JATUH ke `return v ? String(v) : ''`
  -- HASILNYA STRING SAMA PERSIS, TIDAK ADA transformasi/pergeseran)
Midnight boundary / D-1/D+1 shift : TIDAK DITEMUKAN BUKTI -- SEMUA 8
  tanggal raw match PERSIS dgn tanggal yang guru INPUT (dicatat_oleh=3,
  tidak ada indikasi pergeseran 1 hari krn SEMUA operasi tanggal dari
  awal-akhir memakai string murni, bukan objek Date lintas timezone)
```

**KEKHAWATIRAN SATU-SATUNYA yang TERSISA** (§16 Open Questions): default
filter Dashboard (`iaCurrentMonthFilter_`) memakai `new Date()` DI SISI
BROWSER GURU — kalau device Neiza diset ke timezone SALAH/BERBEDA
(bukan WIB), TEORINYA bisa membuat "bulan berjalan" versi browser BEDA
dari yang diasumsikan — **TAPI ini TIDAK MENJELASKAN "7"** (kalau
timezone browser bergeser signifikan, hasilnya akan mengubah TANGGAL
AWAL/AKHIR by 1 hari, BUKAN mengubah "bulan yang dipilih" dari
Agustus→Juli sepenuhnya) — **date/timezone BUKAN penyebab utama insiden
ini**, dicatat HANYA sbg kemungkinan residual kecil, TIDAK terverifikasi
krn TIDAK ADA akses ke device Neiza.

---

## 15. Root Cause

**Klasifikasi: J — Multiple causes** (2 kontributor BERBEDA, TERPISAH,
dgn tingkat kepastian BERBEDA):

**Kontributor #1 (TERBUKTI PENUH, evidence konklusif)**:
**I — Period/date-range**. Dashboard Kehadiran (kartu per kelas)
di-scope ke SATU RENTANG TANGGAL (default: 1 bulan kalender, ATAU bulan
yang dipilih manual via filter). Kalau guru melihat kartu dgn filter
"Juli 2026" (baik sbg default SEBELUM tanggal sistem berpindah ke
Agustus, ATAU dipilih manual), 1 DARI 8 tanggal attendance REAL
(2026-08-07) JATUH DI LUAR rentang itu — bukan hilang dari Firestore,
HANYA tidak termasuk hitungan bulan yang sedang dilihat. Ini
**menjelaskan PERSIS selisih 8→7** (raw ground truth vs displayed).

**Kontributor #2 (BELUM TERKONFIRMASI, evidence TIDAK CUKUP utk
menyimpulkan)**: kemungkinan **A — Data tidak pernah tersimpan**.
Selisih "10" (klaim guru) vs "8" (raw ground truth all-time) = 2
tanggal yang TIDAK ADA jejaknya SAMA SEKALI di Firestore. **TIDAK ADA
bukti dari sistem** (Firestore/audit_log) yang bisa membuktikan APAKAH
2 sesi itu (a) memang tidak pernah diinput guru (murni human/proses,
BUKAN bug), (b) pernah dicoba disimpan tapi GAGAL tanpa guru sadar
(mis. gagal network, sebelum Tahap 9's duplicate-guard/loading-UX ada —
TIDAK ADA cara memverifikasi kejadian masa lalu yang TIDAK meninggalkan
dokumen), atau (c) guru salah ingat jumlah sesi yang dia ajar. **TIDAK
BISA diklasifikasi lebih presisi tanpa konfirmasi LANGSUNG dari Neiza**
mengenai tanggal SPESIFIK mana yang dia yakini sudah diinput tapi tidak
muncul.

---

## 16. Evidence

```
- jadwal_kbm.id=9 (guru_id=22, kelas="Remaja SMA", kategori="Remaja SMA")
- users.id=3 = Neiza (guru_id=22) -- identity chain lengkap & konsisten
- santri kelas_ngaji="Remaja SMA": 7 santri (id 205,217,218,224,227,228,229)
- absensi kelompok 1: 170 dokumen total, 56 dokumen utk 7 santri Remaja
  SMA, SEMUA dicatat_oleh=3 (Neiza sendiri)
- 8 unique tanggal all-time: 07-20,21,22,23,27,30,31, 08-07
- "Juli 2026" filter -> 7 tanggal (07-20..07-31) -- MATCH EKSAK dgn "7 hari" dilaporkan
- window.iaCurrentMonthFilter_ (Script_Main.html:1903-1910): default filter
  = bulan kalender client-side `new Date()`
- serverGetGuruDashboardSummaryRange (Modul_InputAbsen.gs:1048-1093): formula
  distinct-date, semua status, TIDAK ADA bug ditemukan di query/calculation
- Cache: TIDAK ADA server-side utk absensi (dikonfirmasi tidak ada di
  IA_KELOMPOK_TABLE_CACHE_KEY_); client-side reset tiap reload, TIDAK
  relevan dgn insiden
- Firestore date storage: SELALU string 'yyyy-MM-dd', TIDAK ADA jejak
  Date-object contamination di 8 dokumen yang diperiksa
```

---

## 17. Impact

**Dampak LANGSUNG**: kartu "Hari Aktif" menampilkan angka yang BENAR
utk SCOPE yang sedang dilihat (7 hari dalam Juli 2026) — **BUKAN data
yang salah/korup**, HANYA berpotensi **MEMBINGUNGKAN** guru yang TIDAK
menyadari kartu ini di-scope per-bulan (bukan kumulatif all-time),
apalagi kalau dia mengharapkan "total sepanjang mengajar". **Data
attendance ASLI (8 dokumen Firestore) TIDAK HILANG/RUSAK** — SEMUA 8
dokumen utuh, terverifikasi status masing-masing.

**Dampak POTENSIAL** (kalau kontributor #2/A benar): kalau memang ADA
2 sesi yang guru yakin sudah diinput tapi gagal tersimpan, itu berarti
absensi santri utk 2 tanggal TIDAK PERNAH tercatat SAMA SEKALI (bukan
"salah tampil", tapi "benar-benar tidak ada") — berpotensi mempengaruhi
laporan/statistik turunan (Laporan Perkembangan Santri, dsb.) utk
periode itu. **BELUM DIKONFIRMASI**, TIDAK diasumsikan terjadi.

---

## 18. Recommended Fix

**TIDAK diimplementasikan tahap ini** (investigation-only). Preview
rekomendasi (utk Tahap 17, PROPOSAL SAJA):

1. **UX klarifikasi scope periode** — tambahkan indikator visual lebih
   jelas di kartu "Hari Aktif" (mis. label "7 hari (Juli 2026)"
   eksplisit menyebut bulan, bukan cuma angka polos) supaya guru tidak
   salah paham kartu ini per-bulan, BUKAN kumulatif. (Kategori:
   UX/komunikasi, BUKAN bug-fix data.)
2. **Konfirmasi LANGSUNG ke Neiza** tanggal spesifik mana (dari total
   yang dia klaim 10) yang dia yakini sudah diinput — BARU bisa
   ditentukan apakah kontributor #2 (A) valid atau murni miskomunikasi/
   salah ingat. TANPA info ini, Tahap 17 TIDAK BISA menutup investigasi
   kontributor #2 dgn evidence.
3. **PERTIMBANGKAN** (bukan keputusan) kartu tambahan "Total Hari Aktif
   (Semua Waktu)" TERPISAH dari kartu per-bulan yang sudah ada, kalau
   user MEMANG menginginkan pandangan kumulatif — Keputusan PRODUK, di
   luar cakupan audit teknis ini.

---

## 19. Safe Fix Scope (PREVIEW SAJA)

```
Jika UX klarifikasi (#1 di atas) dipilih:
  File   : Script_Main.html (iaRenderDashboardCards_)
  Scope  : HANYA label/tampilan kartu, TIDAK menyentuh
           serverGetGuruDashboardSummaryRange/query/calculation SAMA
           SEKALI (sudah TERBUKTI benar, §11/§12)
  Risk   : RENDAH (UI-only, additive)
```

---

## 20. Regression Test Plan (PREVIEW SAJA, TIDAK DIEKSEKUSI)

```
Kalau Tahap 17 mengimplementasikan #1 (label bulan eksplisit):
  - Verify kartu kelas LAIN (bukan Remaja SMA) tetap benar
  - Verify filter Bulan-Tahun manual (pindah bulan) label ikut update
  - Verify admin_kelp dashboard (serverGetAdminKelpDashboardSummaryRange,
    formula/UI SAMA) juga ikut diupdate KONSISTEN kalau perubahan di
    komponen shared
  - TIDAK PERLU test data-accuracy ulang (query/calculation SUDAH
    terbukti benar tahap ini, TIDAK diubah)
```

---

## FINAL OUTPUT

```
TAHAP 16 — DASHBOARD DATA ACCURACY AUDIT

Case:
Guru Neiza (users.id=3, guru_id=22), Kelas Remaja SMA (jadwal_kbm.id=9, kelompok 1)

Teacher Expected:
10 hari

Raw Firestore:
8 hari (all-time, TIDAK dibatasi periode apa pun)

Dashboard Query:
7 hari (structured query tanggal 2026-07-01..2026-07-31, BENAR sesuai rentang)

Calculation:
7 hari (distinct-date, formula BENAR, TIDAK ADA bug)

Displayed:
7 hari (cocok PERSIS dgn Calculation -- TIDAK ADA presentation bug)

Missing Dates:
2026-08-07 (1 tanggal REAL, ADA di Firestore, di LUAR rentang Juli 2026
yang sedang dilihat -- MENJELASKAN selisih 8->7 SEPENUHNYA).
2 tanggal LAIN (selisih 10->8) TIDAK DAPAT DITUNJUK -- TIDAK ADA jejak
di Firestore/audit_log, evidence TIDAK CUKUP utk memastikan apakah
pernah ada percobaan simpan atau murni tidak pernah diinput.

Root Cause:
(1) TERBUKTI: kartu "Hari Aktif" di-scope PER-BULAN (default kalender
berjalan/filter manual), 1 tanggal real (08-07) jatuh di bulan
berikutnya sehingga tidak terhitung dalam rentang Juli. (2) BELUM
TERKONFIRMASI: kemungkinan 2 sesi yang guru yakini sudah diinput
sebenarnya tidak pernah tersimpan (tidak ada bukti sistem yang bisa
memastikan/menyangkal ini).

Classification:
J (Multiple causes -- I proven, A unconfirmed)

Evidence:
Lihat §16 -- date-by-date reconciliation §10, query/calculation trace §11/§12,
identity chain §6/§7, cache ruled out §13, date/timezone ruled out §14.

Data Integrity:
PASS (8 dokumen Firestore utuh & konsisten, TIDAK ADA korupsi/kehilangan
data yang terverifikasi -- query & calculation TERBUKTI benar utk data
yang ADA)

Code Changed:
NO

Firestore Changed:
NO

Production:
UNCHANGED

Recommended Fix:
(1) Klarifikasi UX -- label kartu sebutkan periode eksplisit ("7 hari --
Juli 2026") supaya tidak disalahpahami sbg kumulatif. (2) WAJIB
konfirmasi langsung ke Neiza tanggal spesifik yang dia yakini hilang,
SEBELUM Tahap 17 bisa menutup kontributor #2. (3) Pertimbangkan (bukan
putuskan) kartu kumulatif terpisah kalau user memang inginkan itu.

Next:
TAHAP 17 — ROOT CAUSE FIX (SETELAH konfirmasi tanggal spesifik dari Neiza)
```
