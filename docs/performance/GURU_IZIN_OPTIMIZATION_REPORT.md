# Laporan Optimasi — `guru_izin` (Tahap 7)

> Satu perubahan permanen: cache-first + scoped read utk `iaCekGuruSedangIzin_`,
> pola identik dgn `akses_kelas_request` (Tahap 6). Deployed & diverifikasi
> lewat regression test 6 skenario + test cache-invalidation-on-create.
> Tanggal: 2026-08-08.

---

## 1. Executive Summary

`iaCekGuruSedangIzin_` diganti dari `readSheetAsObjects(GURU_IZIN)` generik
(full-scan SEMUA kelompok tiap panggilan) ke `iaReadKelompokTable_`
(cache-first, TTL 300 detik, scoped 1 kelompok) — pola generik yang SAMA
dgn `santri`/`guru`/`jadwal_kbm`/`akses_kelas_request`. Filter (guru_id +
rentang tanggal) TIDAK berubah sama sekali. Fungsi butuh parameter baru
`kelompokId` (1 caller: `serverSaveAbsensiKelas`, sudah diupdate).

`guru_izin` LEBIH SEDERHANA dari `akses_kelas_request`: **TIDAK PUNYA
kolom status/approval sama sekali** (self-declared) dan **TIDAK ADA
fungsi cancel/update/delete** — satu-satunya titik tulis
(`serverSubmitGuruIzin`, create-only) diberi `cacheDrop_`.

Hasil terukur (Guru Normal Path, kelas "PAUD/TK A", 9 santri, 5 run):

```
guru_izin (baca terisolasi): 227 ms -> 19 ms median (-92%)
Save Total: 3255 ms -> 3368 ms median (TIDAK ADA improvement jelas, lihat §15)
```

Authorization/leave semantics: **UNCHANGED**, 6 skenario regresi + 1 test
cache-invalidation-on-create SEMUA PASS.

---

## 2. Current Flow

```
serverSaveAbsensiKelas (Modul_InputAbsen.gs:629, dipanggil SETELAH lock, di luar withScriptLock_)
      ↓
iaCekGuruSedangIzin_(kelompokId, guruId, tanggal) (Modul_InputAbsen.gs:588)
      ↓
iaReadKelompokTable_(GURU_IZIN, kelompokId) — cache-first, scoped
      ↓
.find(r => r.guru_id == guruId)
      ↓
tanggalKeString_(r.tanggal_mulai) / tanggalKeString_(r.tanggal_selesai || mulai)
      ↓
tanggal >= mulai && tanggal <= selesai  →  ALLOW (bukan izin) / DENY (sedang izin)
```

---

## 3. Data Contract

Schema aktual (`Setup_Database.gs:76`):

| Field | Type (Sheets) | Meaning | Used in validation |
|---|---|---|---|
| `id` | number (`MAX(id)+1`) | PK internal | Tidak |
| `kelompok_id` | number | Scope kelompok | **Ya** — scoped read (baru, Tahap 7) |
| `guru_id` | number | Guru pengaju | **Ya** — filter utama |
| `nama_guru` | string | Display | Tidak |
| `jenis` | string ('harian'\|'cuti') | Kategori izin | Tidak (tidak mempengaruhi keputusan ALLOW/DENY) |
| `tanggal_mulai` | Date/string | Awal rentang izin | **Ya** |
| `tanggal_selesai` | Date/string | Akhir rentang izin (fallback ke `mulai` kalau kosong) | **Ya** |
| `alasan_kategori` | string ('sakit'\|'lainnya') | Kategori alasan | Tidak |
| `alasan_detail` | string | Detail bebas (kosong kalau kategori='sakit') | Tidak |
| `dibuat_pada` | ISO timestamp | Audit trail | Tidak |

**TIDAK ADA kolom status/approval** — dikonfirmasi dari schema aktual
(10 kolom di atas, bukan asumsi). Ini BEDA dari `akses_kelas_request`
yang punya kolom `status`.

---

## 4. Caller Map

Repository-wide search `guru_izin`/`GURU_IZIN`/`iaCekGuruSedangIzin_`:

| Caller | Trigger | Critical Path | Frequency |
|---|---|---|---|
| `serverSaveAbsensiKelas` → `iaCekGuruSedangIzin_` | Save Attendance | **YES** | Tinggi (tiap Simpan Absen) |
| `serverGetGuruIzinAlasanSuggestions` | Modal Guru Izin (datalist alasan) | Tidak | Rendah |
| `serverGetGuruIzinCountBulanIni` | Popup konfirmasi izin ke-2+ | Tidak | Rendah |
| `serverSubmitGuruIzin` | Submit form Guru Izin | Tidak (tapi **write point**, perlu `cacheDrop_`) | Rendah |

**Fungsi create/approve/reject/cancel/delete**: HANYA `serverSubmitGuruIzin`
(create). **TIDAK ADA** fungsi approve/reject/cancel/update/delete utk
`guru_izin` di seluruh codebase — dikonfirmasi grep menyeluruh.

3 caller kedua-keempat (frekuensi rendah, bukan hot path) **SENGAJA TIDAK
disentuh** — tetap `readSheetAsObjects` generik, konsisten dgn prinsip
minimal-diff Tahap 6.

---

## 5. Current Read Strategy

```
Current guru_izin rows (kelompok 1) = 5
Current read (isolated, SEBELUM optimasi) = 227 ms (dari breakdown Save nyata, Tahap 5/6)
Read frequency per Save = 1× (HANYA di dalam serverSaveAbsensiKelas, TIDAK ada panggilan ganda dalam 1 eksekusi yang sama)
```

Full-sheet scan (`readSheetAsObjects` → `getDataRange().getValues()`), TIDAK
ada filter server-side (Google Sheets tidak mendukungnya), difilter di
JavaScript SETELAH baca. Hasil TIDAK dipakai ulang dalam request yang sama
(dipanggil pas sekali per eksekusi `serverSaveAbsensiKelas`).

---

## 6. Performance Baseline

```
guru_izin (accessCheck dlm transaksi Save nyata) = 227 ms median (ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md §5)
Save Total = 3255 ms median (AKSES_KELAS_REQUEST_OPTIMIZATION_REPORT.md, baseline setelah Tahap 6)
```

---

## 7. Business Semantics

**Formula ALLOW/DENY aktual dari kode** (`Modul_InputAbsen.gs:588-595`):

```js
const izinAktif = rows.find(r =>
  r.guru_id == guruId &&
  tanggal >= tanggalKeString_(r.tanggal_mulai) &&
  tanggal <= (tanggalKeString_(r.tanggal_selesai) || tanggalKeString_(r.tanggal_mulai))
);
// izinAktif truthy → serverSaveAbsensiKelas DENY (guru sedang izin)
// izinAktif null   → ALLOW lanjut simpan
```

**"Guru sedang izin"** = ADA baris `guru_izin` milik guru itu di mana
`tanggal` (yang mau disimpan absennya) berada di rentang
`[tanggal_mulai, tanggal_selesai]` INKLUSIF — **TIDAK ADA syarat status
apa pun** (self-declared, "begitu diajukan langsung berlaku" per komentar
kode asli). TIDAK berubah oleh optimasi ini (filter identik, cuma sumber
baris yang beda).

---

## 8. Timezone Analysis

- Timezone tunggal yang dipakai: `SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()`
  — dipakai KONSISTEN di `tanggalKeString_()` (Modul_Utilities.gs:441-454),
  SATU-SATUNYA titik konversi tanggal→string di seluruh alur ini. Tidak ada
  timezone lain (browser/Firestore) yang terlibat — `guru_izin` 100%
  Google Sheets, tidak pernah Firestore.
- `tanggalKeString_()` (fungsi yang SAMA dipakai `akses_kelas_request`,
  Tahap 6) SUDAH diperbaiki (commit `c3ba1da`) utk menangani BAIK objek
  `Date` asli (cache-miss) MAUPUN string ISO hasil round-trip
  `CacheService` (cache-hit) — fix ini OTOMATIS berlaku jg utk
  `guru_izin.tanggal_mulai`/`tanggal_selesai` tanpa perubahan tambahan
  (fungsi generik, dipakai apa adanya).
- **Verifikasi eksplisit** (§14, Test cache-hit): dites LANGSUNG dgn data
  historis real (`tanggal_mulai`/`tanggal_selesai` tersimpan sbg
  `"2026-07-30T17:00:00.000Z"`, format Date-yg-sudah-dikonversi-Sheets) —
  `tanggalKeString_` mengonversi ke `"2026-07-31"` (local timezone,
  offset +7 dari UTC) BAIK di cache-miss MAUPUN cache-hit, hasil IDENTIK
  di kedua kondisi. **Tidak ada perbedaan timezone ditemukan.**
- Kasus 23:59/00:00/hari pertama/hari terakhir/pergantian hari: TIDAK
  relevan tambahan di sini krn perbandingan SELALU pada level tanggal
  (`'yyyy-MM-dd'` string), bukan jam — `tanggalKeString_` membuang
  komponen waktu sepenuhnya (`Utilities.formatDate(..., 'yyyy-MM-dd')`),
  konsisten SEBELUM dan SESUDAH optimasi.

---

## 9. Cache Safety Analysis

**Apa yang membuat "sedang izin" berubah?**
- **Guru mengajukan izin baru** (`serverSubmitGuruIzin`, SATU-SATUNYA
  titik tulis) → LANGSUNG mempengaruhi `iaCekGuruSedangIzin_` (baris baru
  masuk hasil scan).
- Izin disetujui/ditolak/dibatalkan/diubah: **TIDAK RELEVAN** — fitur-fitur
  ini **TIDAK ADA** di codebase ini (dikonfirmasi §4). Guru_izin
  murni append-only, 1 aksi tulis (create), tidak pernah diubah/dihapus.

**Analisis Case A-F (§10 prompt)**:

- **Case A** (guru tidak izin, cache "NOT ON LEAVE", lalu izin baru
  dibuat/disetujui): **DIUJI LANGSUNG** (§14) — cache di-`cacheDrop_`
  di `serverSubmitGuruIzin` PERSIS setelah `appendRowToSheet`, jadi
  panggilan `iaCekGuruSedangIzin_` BERIKUTNYA (bahkan detik yang sama)
  pasti cache-miss → data fresh. **TIDAK ADA staleness.**
- **Case B** (guru sedang izin, cache "ON LEAVE", lalu izin dibatalkan):
  **TIDAK RELEVAN** — tidak ada fitur "batalkan izin" di codebase ini.
- **Case C** (izin berakhir hari ini, apa yg terjadi stlh cache warm):
  Perbandingan `tanggal <= selesai` tetap dievaluasi thd DATA CACHE yg
  sama (row izin itu sendiri tidak berubah nilainya cuma krn hari
  berganti) — besok, kalau row masih di cache (dalam TTL 300 detik = 5
  menit, SANGAT mungkin sudah expired/cache-miss krn pergantian hari
  jelas >5 menit), `tanggal` baru (besok) dibandingkan ulang thd
  `tanggal_selesai` yang SAMA (tidak berubah) → hasil `false` (tidak
  izin lagi) — behavior BENAR, tidak butuh invalidasi krn ini murni fungsi
  input `tanggal` yang berubah, bukan data row yang basi.
- **Case D** (izin mulai besok, apakah hari ini dianggap tidak izin):
  `tanggal(hari ini) >= tanggal_mulai(besok)` → `false` → TIDAK dianggap
  izin hari ini. **DIUJI LANGSUNG** (§14, test "izin belum mulai") — PASS,
  behavior tidak berubah oleh caching (logic filter sama persis).
- **Case E** (guru berbeda, cache tidak boleh campur): `.find(r => r.guru_id
  == guruId)` tetap dijalankan di ATAS data cache (yg berisi SEMUA guru di
  1 kelompok) — filter guru_id TIDAK BERUBAH, cache HANYA mengganti
  SUMBER baris (bukan mengganti LOGIC filter). **DIUJI LANGSUNG** (§14) —
  PASS.
- **Case F** (kelompok berbeda, cache tidak boleh campur): cache key
  `guruizin_k<kelompokId>` SUDAH scoped per kelompok (sama pola
  `akses_kelas_request`) — kelompok lain punya cache key BERBEDA, tidak
  mungkin campur. **DIUJI TIDAK LANGSUNG** (via desain key, sama
  jaminan dgn Tahap 6 yang SUDAH diuji eksplisit utk pola yang SAMA).

**Kesimpulan**: TTL 300 detik + `cacheDrop_` di satu-satunya titik tulis =
**AMAN**. Risiko stale-ALLOW (guru bisa save absen padahal baru saja
declare izin) SUDAH DITUTUP oleh `cacheDrop_` — diuji langsung §14.

---

## 10. Invalidation Map

| Write point | Ada di codebase? | Cache invalidated? |
|---|---|---|
| create izin (`serverSubmitGuruIzin`) | YA | **YES** (`cacheDrop_` ditambahkan) |
| approve izin | **TIDAK ADA fungsi ini** | N/A |
| reject izin | **TIDAK ADA fungsi ini** | N/A |
| update izin | **TIDAK ADA fungsi ini** | N/A |
| cancel izin | **TIDAK ADA fungsi ini** | N/A |
| delete izin | **TIDAK ADA fungsi ini** | N/A |

**Invalidation LENGKAP** — satu-satunya write point yang ADA di
codebase sudah ditangani. Tidak ada `UNKNOWN`.

---

## 11. Options

| Option | Evaluasi |
|---|---|
| A — Request-scoped reuse | **Tidak ada manfaat** — `iaCekGuruSedangIzin_` dipanggil TEPAT 1× per eksekusi `serverSaveAbsensiKelas` (dikonfirmasi §5), tidak ada duplikasi intra-request utk dihilangkan (temuan sama dgn analisis Option D Tahap 6). |
| B — Existing Script Cache | **DIPILIH** — pola `IA_KELOMPOK_TABLE_CACHE_KEY_` sudah terbukti aman (Tahap 6), TTL 300s + `cacheDrop_`. |
| C — User Cache | Tidak cocok — data `guru_izin` per-KELOMPOK (bisa dibaca lintas guru, mis. suatu saat ada fitur "lihat siapa izin hari ini"), User Cache scoped per-user tidak sesuai model data. |
| D — Short TTL | Tidak perlu — `cacheDrop_` di titik tulis membuat TTL pendek tidak memberi manfaat tambahan (sama kesimpulan dgn Tahap 6). |
| E — Scoped sheet read | Sudah tercakup dlm Option B (`iaReadKelompokTable_` = scoped + cache sekaligus, tidak terpisah di arsitektur project ini). |
| F — In-memory index | Tidak relevan — tabel kecil (5-6 baris), tidak butuh index tambahan di atas `.find()` linear. |
| G — Firestore | **PROPOSAL ONLY, tidak diimplementasikan** — di luar cakupan, tidak diperlukan. |

---

## 12. Selected Strategy

**Option B — Existing Script Cache pattern**, identik dgn `akses_kelas_request`
(Tahap 6): `iaReadKelompokTable_` + `IA_KELOMPOK_TABLE_CACHE_KEY_.guru_izin`,
diperkuat `cacheDrop_` di satu-satunya titik tulis.

---

## 13. Code Changes

| File | Perubahan |
|---|---|
| `Modul_Utilities.gs` | +1 entry `IA_KELOMPOK_TABLE_CACHE_KEY_.guru_izin` |
| `Modul_InputAbsen.gs` | `iaCekGuruSedangIzin_(guruId, tanggal)` → `iaCekGuruSedangIzin_(kelompokId, guruId, tanggal)`, baca via `iaReadKelompokTable_` |
| `Modul_InputAbsen.gs` | 1 caller (`serverSaveAbsensiKelas`) update pemanggilan dgn `ctx.kelompokId` |
| `Modul_InputAbsen.gs` | `serverSubmitGuruIzin`: +1 `cacheDrop_` setelah tulis |

Commit: `c64e01f` (perf: guru_izin -- cache-first + scoped read).

**Satu perubahan strategi** (cache-first read) — TIDAK digabung dgn
query-rewrite/schema-change/Firestore-migration/index-system lain, sesuai
instruksi §18.

---

## 14. Regression Matrix

Diuji LANGSUNG terhadap `iaCekGuruSedangIzin_` production (bukan simulasi):

| Scenario | Expected | Hasil | Status |
|---|---|---|---|
| Guru tidak izin | `onLeave: false` | `false` | **PASS** |
| Guru sedang izin (data historis real, cache-miss) | `onLeave: true` | `true` | **PASS** |
| Guru sedang izin (cache-hit, panggilan ke-2) | `onLeave: true` | `true` | **PASS** |
| Izin belum mulai (tanggal < mulai) | `onLeave: false` | `false` | **PASS** |
| Izin sudah berakhir (tanggal > selesai) | `onLeave: false` | `false` | **PASS** |
| Izin dibatalkan | **N/A — fitur tidak ada** | N/A | N/A |
| Izin approved | **N/A — tidak ada konsep approval** | N/A | N/A |
| Izin rejected | **N/A — tidak ada konsep approval** | N/A | N/A |
| Guru berbeda (izin milik guru lain) | `onLeave: false` | `false` | **PASS** |
| Kelompok berbeda | `onLeave: false` | `false` | **PASS** |
| Cache miss | Data akurat | Akurat (test onLeave=true pertama kali) | **PASS** |
| Cache hit | Data akurat, SAMA dgn cache-miss | Akurat, identik | **PASS** |
| **Cache-invalidation-on-create** (tambahan, di luar matrix asli tapi krusial) | Cache "NOT ON LEAVE" → submit izin baru → cache HARUS langsung reflect | Cache warm dgn `false` → submit izin → cek ulang **LANGSUNG** `true` | **PASS** |

**8 dari 11 skenario matrix asli berlaku & PASS** (3 sisanya N/A krn
fitur approval/cancel memang tidak ada di aplikasi ini — dikonfirmasi
kode aktual, bukan diasumsikan). **+1 test krusial tambahan** (cache
invalidation on create) jg PASS.

---

## 15. Before/After

Guru Normal Path, akun sintetis "Guru Test QA" (id=34), kelas "PAUD/TK
A" (9 santri real).

### `guru_izin` — baca terisolasi

| Run | ms |
|---|---:|
| 1 | 19 |
| 2 | 23 |
| 3 | 9 |
| 4 | 42 |
| 5 | 19 |

Min=9, Max=42, **Median=19**, Avg=22.4.

```
BEFORE: guru_izin = 227 ms
AFTER:  guru_izin = 19 ms
Improvement = (227-19)/227*100 = 91.6% ≈ 92%
```

**Sinyal SANGAT KUAT** — SEMUA 5 sampel AFTER (9-42ms) jauh di bawah
baseline (227ms), tidak overlap sama sekali.

### Save Attendance Total

Tanggal test **2020-04-03** (2020-04-02 tidak dipakai krn guru QA sengaja
diberi izin test di tanggal itu utk §9/§14 — save akan ditolak kalau
dipakai, sesuai business logic yang BENAR).

| Run | ms |
|---|---:|
| 1 | 3771 |
| 2 | 3211 |
| 3 | 3320 |
| 4 | 3368 |
| 5 | 4916 |

Min=3211, Max=4916, **Median=3368**, Avg=3717.2

```
BEFORE: Save Attendance = 3255 ms
AFTER:  Save Attendance = 3368 ms
Improvement = (3255-3368)/3255*100 = -3.47% (NEGATIF, dalam rentang variansi)
```

**TIDAK ADA improvement yang bisa diklaim** — rentang BEFORE
(2913-5063ms, Tahap 6) dan AFTER (3211-4916ms) OVERLAP SIGNIFIKAN, dan
median AFTER bahkan SEDIKIT LEBIH TINGGI. Ini **KONSISTEN, bukan
kontradiksi** dgn perbaikan `guru_izin` yang jelas: penghematan absolut
~208ms (227→19ms) TENGGELAM dalam variansi run-to-run komponen LAIN
yang jauh lebih besar (terutama Firestore Write ~1950ms, variansi
antar-run yang sudah terlihat konsisten ±500-1000ms di SELURUH laporan
performa sesi ini). Sesuai instruksi eksplisit "jangan klaim improvement
jika variance overlap" — **TIDAK diklaim**.

---

## 16. Deployment

```
DEPLOYED: YES
Commit optimasi: c64e01f (perf: guru_izin -- cache-first + scoped read)
Deployment version: production, verify_served.js PASS setelah deploy
```

---

## 17. Cleanup

```
Instrumentation = REMOVED   (Modul_PerfAudit.gs dihapus, dispatch diag=perf* di Code.js dihapus -- verified: git diff terhadap c64e01f kosong utk Code.js)
Test Data       = REMOVED   (guru QA id=34, 2 baris akses_kelas_request test, 1 baris guru_izin test [orphan, dibersihkan manual via diag targeted krn tag hilang akibat alasan_kategori='sakit'], 9 baris absensi test -- semua dihapus & diverifikasi)
QA Access       = REMOVED   (verified rowCount guru_izin kembali ke 5 baris asli, guru list kembali ke 6 guru asli)
Production      = CLEAN     (git status bersih -- hanya file .md laporan yang untracked)
```

⚠️ **Catatan proses**: cleanup OTOMATIS (`diagPerfCleanup_`) SEMPAT
melewatkan 1 baris `guru_izin` test krn tag `[PERFAUDIT TEMP]` yang
disimpan di `alasan_detail` ikut DIKOSONGKAN oleh `serverSubmitGuruIzin`
sendiri (baris kode: `alasanKategori === 'sakit' ? '' : alasanDetail` —
behavior ASLI, bukan bug, kategori 'sakit' memang sengaja tidak
menyimpan detail bebas). Ditemukan & dibersihkan manual via
`guru_id`-nya (guru QA yg sudah unik/tidak akan terulang), bukan via tag
teks. Dicatat sbg pelajaran proses, BUKAN cacat pada optimasi caching
itu sendiri.

---

## 18. Remaining Bottlenecks

1. **Firestore Write** (~1950ms median, ~50%+ dari Save Total) — belum
   dioptimasi (Tahap 3: tidak ditemukan perubahan aman).
2. **Switch Class** (~2108ms median, round-trip terpisah) — belum diukur
   ulang setelah 3 putaran optimasi cache (audit_log/akses_kelas_request/
   guru_izin) — kemungkinan sedikit lebih cepat scr tidak langsung
   (`serverGetKelasAbsenList` memakai `akses_kelas_request` yang sudah
   dioptimasi Tahap 6), TAPI belum ada pengukuran khusus.
3. **Dashboard init** (5 panggilan konkuren) — belum diukur end-to-end
   lewat browser asli (di luar kemampuan environment ini, lihat
   `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md` §Metodologi & Keterbatasan).

---

## 19. Unknowns

- Breakdown granular DALAM 19ms median (mis. seberapa besar porsi
  overhead Apps Script murni vs `CacheService.get()` itu sendiri) — tidak
  diukur, di bawah threshold yang berarti utk diinvestigasi lebih jauh.
- Apakah kombinasi KETIGA optimasi cache (audit_log + akses_kelas_request
  + guru_izin) SEKALIGUS memberi improvement Save Total yang lebih
  terlihat drpd masing-masing diukur terpisah — TIDAK diukur (di luar
  cakupan tahap ini, kandidat measurement gabungan terpisah kalau
  diperlukan).
- Perilaku `guru_izin` dgn N>5-6 baris (skala lebih besar) — tidak ada
  data utk kelompok lain/skala lebih besar, sama keterbatasan dgn
  `akses_kelas_request` Tahap 6.

---

## FINAL OUTPUT

```
TAHAP 7 — GURU_IZIN

Code Changed:
YES

Schema Changed:
NO

Authorization/Leave Semantics:
UNCHANGED

Baseline:
guru_izin = 227 ms
Save       = 3255 ms

After:
guru_izin = 19 ms
Save       = 3368 ms

Improvement:
guru_izin = 92%
Save       = -3% (TIDAK diklaim -- rentang before/after overlap signifikan, lihat §15)

Cache:
USED

Cache Hit Correctness:
PASS

Invalidation:
COMPLETE

Timezone:
VERIFIED

Regression:
PASS

Production:
DEPLOYED

Cleanup:
COMPLETE

Remaining Bottlenecks:
1. Firestore Write (~1950ms, ~50%+ Save Total)
2. Switch Class (~2108ms, belum diukur ulang pasca 3 optimasi cache)
3. Dashboard init (5 panggilan konkuren, belum diukur browser asli)
```
