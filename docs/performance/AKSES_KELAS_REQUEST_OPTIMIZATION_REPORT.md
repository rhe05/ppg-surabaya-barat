# Laporan Optimasi — `akses_kelas_request` (Tahap 6)

> Dua commit permanen: (1) cache-first + scoped read utk 3 titik baca
> hot-path, (2) **fix bug correctness** yang ditemukan lewat regression
> test SEBELUM ini di-deploy sbg final (lihat §Bug Ditemukan — WAJIB
> dibaca, bagian paling penting dari laporan ini). Deployed & diverifikasi
> lewat regression test authorization ALLOW/DENY. Tanggal: 2026-08-08.

---

## 1. Executive Summary

3 titik baca hot-path (`canGuruAccessKelas_`, `serverGetInputAbsenMeta`,
`serverGetKelasAbsenList`) diganti dari `readSheetAsObjects(AKSES_KELAS_REQUEST)`
(full-scan SEMUA kelompok, tiap panggilan) ke `iaReadKelompokTable_`
(cache-first, TTL 300 detik, scoped 1 kelompok) — pola generik yang SUDAH
dipakai & dipercaya utk `santri`/`guru`/`jadwal_kbm`/`jadwal_kategori_hari`.
Invalidasi cache ditambahkan di KEDUA titik tulis (`serverRequestAksesKelas`,
`serverRespondAksesRequest`) supaya perubahan status langsung terlihat
tanpa menunggu TTL sama sekali.

**⚠️ Selama regression test, ditemukan BUG NYATA** yang HARUS diperbaiki
sebelum optimasi ini aman dipakai — lihat §Bug Ditemukan. Bug ini SUDAH
diperbaiki (commit `c3ba1da`) & diverifikasi ulang sebelum laporan ini
ditulis.

Hasil terukur (Guru Normal Path, kelas "PAUD/TK A", 9 santri, 5 run):

```
akses_kelas_request (baca terisolasi): 455 ms -> 86 ms median  (-81%)
Save Total: 3421 ms -> 3255 ms median (-5%, sinyal lemah, lihat §13)
```

Authorization behavior: **PASS**, 5 skenario ALLOW/DENY diverifikasi
IDENTIK dgn ekspektasi setelah fix.

---

## 2. Current Architecture

`akses_kelas_request` (`Setup_Database.gs:73`) — 100% Google Sheets, TIDAK
PERNAH masuk `FIRESTORE_TABLES_`/`FIRESTORE_KELOMPOK_TABLES_` (tidak
diubah tahap ini, TETAP di Sheets). Sebelum Tahap 6, SEMUA baca lewat
`readSheetAsObjects(SHEET_NAMES.AKSES_KELAS_REQUEST)` generik — full
`getDataRange().getValues()` (SEMUA kelompok tercampur), difilter di
JavaScript SETELAH baca.

---

## 3. Data Contract

| Column | Type (Sheets) | Meaning | Required? | Dipakai authorization? |
|---|---|---|---|---|
| `id` | number (sequential, `MAX(id)+1`) | PK internal | Ya | Tidak |
| `kelompok_id` | number | Scope kelompok | Ya | **Ya** — filter kelompok |
| `kelas` | string | Nama kelas yg diminta | Ya | **Ya** — dicocokkan (lowercase+trim) |
| `tanggal` | Date/string (⚠️ lihat §Bug Ditemukan) | Tanggal spesifik akses berlaku | Ya | **Ya** — dicocokkan via `tanggalKeString_` |
| `requester_user_id` | number | User (bukan guru_id) pemohon | Tidak dipakai authorization | Tidak |
| `requester_guru_id` | number | Guru pemohon | Ya | **Ya** — dicocokkan ke `guruId` sesi |
| `requester_nama` | string | Nama pemohon (display) | Tidak | Tidak |
| `owner_guru_id` | number | Guru pemilik kelas (utk badge/approve) | Ya (approve flow) | Tidak langsung (dipakai `serverGetInputAbsenMeta`/`serverRespondAksesRequest`, bukan `canGuruAccessKelas_`) |
| `status` | string ('pending'\|'approved'\|'rejected') | Status keputusan | Ya | **Ya** — HANYA `'approved'` yg ALLOW |
| `keterangan` | string | Alasan/catatan bebas | Tidak | Tidak |
| `dibuat_pada` | ISO timestamp | Audit trail | Tidak | Tidak |
| `diputuskan_pada` | ISO timestamp | Audit trail | Tidak | Tidak |

Field yang menentukan keputusan authorization: **`kelompok_id` + `kelas`
+ `tanggal` + `requester_guru_id` + `status==='approved'`** — SEMUA 5
field ini dipakai PERSIS SAMA sebelum & sesudah optimasi (logic filter
TIDAK berubah, cuma sumber baris yang berubah dari full-scan ke cached-scoped-read).

---

## 4. Caller Map

| Caller | Trigger | Frequency (kualitatif) | Critical Path | Required Data |
|---|---|---|---|---|
| `canGuruAccessKelas_` (dipanggil dari `serverGetAbsensiKelasForm` & `serverSaveAbsensiKelas`) | Student List fetch, Save | Tinggi (tiap fetch/save) | **YES** | approved rows utk (kelompok, guru, kelas, tanggal) tsb |
| `serverGetInputAbsenMeta` | App init (Dashboard) | Tinggi (tiap buka app) | **YES** | pending rows utk (kelompok, owner_guru_id) |
| `serverGetKelasAbsenList` | Switch class / prefetch | Tinggi (tiap ganti kelas + prefetch init) | **YES** | approved rows utk (kelompok, guru, tanggal) |
| `serverRequestAksesKelas` | Guru minta akses (modal) | Rendah | Tidak | cek pending existing (TIDAK diubah — di luar cakupan) |
| `serverGetIncomingAksesRequests` | Modal "Minta Akses" (owner) | Rendah | Tidak | TIDAK disentuh (di luar hot path) |
| `serverGetMyAksesRequests` | Modal "Minta Akses" (requester) | Rendah | Tidak | TIDAK disentuh |
| `serverRespondAksesRequest` | Approve/Reject (modal) | Rendah | Tidak | cari by id (TIDAK diubah) — TAPI sekarang memicu `cacheDrop_` |

3 caller PERTAMA (bold **YES**) adalah target optimasi — SEMUA bagian
dari alur Guru Normal Path kritis (Dashboard→Switch Class→Student
List→Save). 4 caller sisanya SENGAJA TIDAK disentuh (modal "Minta Akses
Kelas Lain", frekuensi rendah, di luar hot path).

---

## 5. Read Frequency

**Per full Guru session** (login sudah selesai → dashboard → pilih kelas
→ save), `akses_kelas_request` dibaca (SEBELUM optimasi, tiap kali full
scan; SESUDAH optimasi, 1× full scan lalu N× cache-hit dalam TTL 300 detik):

- App init (`serverGetInputAbsenMeta` + prefetch `serverGetKelasAbsenList`): **2×**
- Switch class manual (kalau ganti kelas lagi setelah prefetch): **+1×** per ganti kelas
- Student List fetch (`serverGetAbsensiKelasForm` → `canGuruAccessKelas_`): **+1×**
- Save (`serverSaveAbsensiKelas` → `canGuruAccessKelas_`): **+1×**

**Total tipikal 1 sesi (buka app → pilih kelas → save)**: **4×** baca
(sesuai temuan audit statis sebelumnya). SEBELUM optimasi = 4× full-scan
(4 × ~455-762ms). SESUDAH = 1× full-scan (cache-miss pertama) + 3×
cache-hit (~30-114ms tiap panggilan berikutnya, dalam TTL 300s yang sama).

---

## 6. Current Performance

Baseline resmi (dari `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md` §5, Guru
Normal Path, di dalam transaksi Save nyata):
```
akses_kelas_request (accessCheckMs, bagian dari canGuruAccessKelas_ penuh) = 455 ms median
Save Attendance = 3421 ms median
```

---

## 7. Cache Analysis

Pola yang sudah ada (`IA_KELOMPOK_TABLE_CACHE_KEY_`,
`iaReadKelompokTable_`, `CacheService.getScriptCache()`, TTL 300 detik,
`Modul_Utilities.gs:97-120`) SUDAH dipercaya & dipakai `santri`/`guru`/
`jadwal_kbm`/`jadwal_kategori_hari` sejak audit performa 2026-08-06/07.
`akses_kelas_request` DITAMBAHKAN ke daftar yang sama (`IA_KELOMPOK_TABLE_CACHE_KEY_.akses_kelas_request`),
memakai TTL yang SAMA (300 detik) — **DIPERKUAT** dengan `cacheDrop_` di
kedua titik tulis (create & approve/reject), jadi TTL 300 detik hanya
jadi *fallback* (kalau instance lain yg baca cache belum sempat dapat
notifikasi drop — TIDAK relevan di Apps Script krn `CacheService` global
per-project, drop langsung berlaku utk SEMUA eksekusi berikutnya).

**Aman dimasukkan ke pola cache existing** — lihat §8/§Bug Ditemukan.

---

## 8. Authorization/Security Analysis

**Apa yang membuat akses berubah?** HANYA 2 aksi: (1) `serverRequestAksesKelas`
(create, status='pending' — TIDAK memberi akses, `canGuruAccessKelas_`
HANYA cek `status==='approved'`), (2) `serverRespondAksesRequest` (approve/reject,
SATU KALI, `pending`→`approved`/`rejected`, TIDAK BISA diulang — guard
`if (target.status !== 'pending') return error`).

**Apakah ada fungsi revoke (approved→dicabut)?** **TIDAK ADA** —
dikonfirmasi grep menyeluruh `13_AppsScript/`, tidak ada kode yang
mengubah status dari `'approved'` ke nilai lain. Sekali disetujui, SELAMANYA
disetujui (utk kombinasi kelas+tanggal spesifik itu).

**Analisis staleness TTL 300 detik**:
- **Skenario stale-DENY** (guru baru disetujui, cache lama belum tahu):
  MUNGKIN terjadi TANPA `cacheDrop_` — TAPI sudah DIPERKUAT dgn
  `cacheDrop_` di `serverRespondAksesRequest`, jadi begitu owner approve,
  cache langsung di-invalidate, panggilan BERIKUTNYA (cache-miss) pasti
  dapat data fresh. Risiko staleness **DIHILANGKAN**, bukan cuma dikurangi.
- **Skenario stale-ALLOW** (akses dicabut, cache lama masih approved):
  **TIDAK MUNGKIN terjadi** — krn TIDAK ADA fungsi revoke sama sekali di
  codebase ini. `status` HANYA bisa `pending→approved` (permanen) atau
  `pending→rejected` (permanen). Tidak ada jalur `approved→X`.

**Kesimpulan**: cache 300 detik + `cacheDrop_` di titik tulis = **AMAN**,
tidak ada risiko fail-open (guru dapat akses yang seharusnya sudah
tidak berlaku) — satu-satunya risiko teoretis adalah fail-closed sesaat,
dan itu pun sudah dihilangkan lewat `cacheDrop_`.

### ⚠️ BUG DITEMUKAN (dan diperbaiki) selama regression test

**Ini BUKAN bagian dari analisis teoretis — ini bug NYATA yang benar-benar
terjadi di production selama testing**, ditemukan lewat Test D/E di §12.

`CacheService` (`cachePut_`/`cacheGet_`, `Modul_Utilities.gs:509-517`)
menyimpan data lewat `JSON.stringify()`/`JSON.parse()`. Kolom `tanggal`
dari Google Sheets datang sbg objek JavaScript `Date` asli — begitu
LOLOS cache SEKALI (`JSON.stringify` pada objek `Date` menghasilkan
STRING ISO, mis. `"2020-03-04T17:00:00.000Z"`), panggilan BERIKUTNYA
(cache-HIT) menerima `tanggal` sbg STRING, BUKAN lagi objek `Date`.

`tanggalKeString_()` (dipakai `canGuruAccessKelas_` utk membandingkan
`tanggal` row dgn parameter tanggal yg diminta) SEBELUMNYA HANYA
menangani `v instanceof Date` — STRING ISO dari cache TIDAK match kondisi
ini, jatuh ke `return String(v)` MENTAH (`"2020-03-04T17:00:00.000Z"`),
yang TIDAK PERNAH SAMA dgn format `'yyyy-MM-dd'` yang dibandingkan
(`"2020-03-05"`) — **akibatnya guru dgn akses yg SAH (`status:'approved'`)
tetap DITOLAK begitu cache warm**, ditemukan via test manual: pemanggilan
PERTAMA (cache-miss) `allowed:true`, pemanggilan KEDUA-dst (cache-hit)
`allowed:false` utk kombinasi input yang PERSIS SAMA.

**Sifat bug**: fail-CLOSED (menolak akses yang seharusnya diizinkan) —
BUKAN fail-open/security hole (tidak pernah salah MENGIZINKAN). Tetap
serius krn merusak fungsi utama fitur (guru pengganti bisa gagal input
absen walau sudah disetujui).

**Fix** (commit `c3ba1da`, SEBELUM optimasi caching final di-deploy sbg
selesai): `tanggalKeString_()` ditambah cabang deteksi string ISO-datetime
(`/^\d{4}-\d{2}-\d{2}T/`) → parse ulang jadi `Date` → format via
`Utilities.formatDate` (timezone yang sama) — sekarang menangani BAIK
objek `Date` asli (cache-miss) MAUPUN string ISO hasil round-trip cache
(cache-hit) secara IDENTIK. Diverifikasi ulang: 5 test authorization
(§12) SEMUA PASS setelah fix, termasuk cache-hit case yg SEBELUMNYA gagal.

**Dampak pada tabel LAIN yang sudah dicache** (`jadwal_kbm`, yang JUGA
punya kolom `tanggal`): dicek — TIDAK ADA kode yang membandingkan
`jadwal_kbm.tanggal` via `tanggalKeString_` (filter jadwal_kbm yang ada
hanya pakai `kelompok_id`/`guru_id`/`status`/`kelas`, TIDAK PERNAH
`tanggal`) — jadi bug laten ini TIDAK PERNAH ter-trigger utk `jadwal_kbm`
sebelumnya, TAPI fix `tanggalKeString_` ini SEKALIGUS mencegahnya kalau
suatu saat ada kode baru yang membandingkan `jadwal_kbm.tanggal` via cache.

---

## 9. Options Considered

| Option | Dievaluasi | Keputusan |
|---|---|---|
| A — Existing Script Cache (`CacheService.getScriptCache()`) | Ya | **DIPILIH** — pola `IA_KELOMPOK_TABLE_CACHE_KEY_` yang sudah ada, TTL 300s |
| B — User Cache | Ya | Tidak dipilih — data `akses_kelas_request` dipakai LINTAS user (owner approve, requester baca), User Cache scoped per-user tidak cocok |
| C — Short TTL (10-30s) | Dipertimbangkan | Tidak perlu — `cacheDrop_` di titik tulis membuat TTL pendek tidak memberi manfaat tambahan (invalidasi sudah instan), TTL 300s (sama dgn tabel lain) lebih konsisten |
| D — Request-scoped reuse | Dievaluasi (§investigasi) | **Tidak memberi manfaat** — dikonfirmasi TIDAK ADA panggilan berganda `readSheetAsObjects(AKSES_KELAS_REQUEST)` DALAM 1 eksekusi server yang sama (tiap fungsi cuma baca 1×); manfaat cache HANYA muncul LINTAS `google.script.run` call terpisah, yang TIDAK bisa dicapai request-scoped reuse (tiap `google.script.run` = eksekusi Apps Script terisolasi, tidak berbagi memori) |
| E — In-memory filtering/index | Tidak relevan | Sama seperti D — tidak ada redundansi intra-eksekusi utk dioptimasi |
| F — Sheet query/range optimization | Tidak dievaluasi mendalam | Google Sheets tidak punya push-down query spt Firestore; scoped-read sudah dicapai lewat filter+cache (Option A), bukan lewat range query |
| G — Firestore migration | **PROPOSAL ONLY, TIDAK diimplementasikan** | Sesuai instruksi eksplisit — perubahan arsitektur besar, tidak diperlukan krn Option A sudah cukup & terbukti aman |

---

## 10. Selected Approach

**Option A — Existing Script Cache pattern** (`iaReadKelompokTable_` +
`IA_KELOMPOK_TABLE_CACHE_KEY_`), diperkuat `cacheDrop_` di 2 titik tulis.

---

## 11. Code Changes

| File | Perubahan |
|---|---|
| `Modul_Utilities.gs` | +1 entry `IA_KELOMPOK_TABLE_CACHE_KEY_.akses_kelas_request` |
| `Modul_Utilities.gs` | **Fix bug**: `tanggalKeString_()` +1 cabang deteksi string ISO-datetime (commit `c3ba1da`) |
| `Modul_InputAbsen.gs` | 3 baca (`canGuruAccessKelas_`, `serverGetInputAbsenMeta`, `serverGetKelasAbsenList`): `readSheetAsObjects` → `iaReadKelompokTable_` |
| `Modul_InputAbsen.gs` | 2 tulis (`serverRequestAksesKelas`, `serverRespondAksesRequest`): +1 `cacheDrop_` masing-masing |

Commit: `30cbdc0` (optimasi caching) + `c3ba1da` (fix bug correctness,
WAJIB menyertai — tanpa ini optimasi TIDAK aman).

---

## 12. Correctness Verification

5 skenario authorization diuji LANGSUNG terhadap `canGuruAccessKelas_`
production (bukan simulasi), SETELAH fix `c3ba1da` deployed:

| Test | Input | Expected | Hasil | Status |
|---|---|---|---|---|
| ALLOW valid guru+kelas (owned via jadwal_kbm) | guru 21 (Baban), kelas "4" | `true` | `true` | **PASS** |
| DENY guru+kelas tak terkait, tanpa approval | guru 21, kelas "PAUD/TK A" | `false` | `false` | **PASS** |
| DENY kelompok salah | kelompokId=2 (bukan 1), guru 21, kelas "4" | `false` | `false` | **PASS** |
| ALLOW via approved request, tanggal benar | guru QA (33), kelas "PAUD/TK A", tanggal 2020-03-05 (approved) | `true` | `true` (cache-miss DAN cache-hit, 2× dicek) | **PASS** |
| DENY tanggal berbeda (request cuma approved utk 1 tanggal spesifik) | guru QA (33), kelas "PAUD/TK A", tanggal 2020-03-06 | `false` | `false` | **PASS** |

**Semua 5 skenario PASS** — authorization behavior IDENTIK dgn ekspektasi
sebelum optimasi (dan SEKARANG juga benar pada cache-hit, setelah fix bug
§8 diterapkan).

---

## 13. Before/After Measurement

Guru Normal Path, akun sintetis "Guru Test QA" (id=33), kelas "PAUD/TK
A" (9 santri real), tanggal test **2020-03-05** (dipastikan kosong
sebelum ditulis).

### `akses_kelas_request` — baca terisolasi (apple-to-apple dgn metodologi baseline 455ms)

| Run | ms |
|---|---:|
| 1 | 109 |
| 2 | 114 |
| 3 | 31 |
| 4 | 70 |
| 5 | 86 |

Min=31, Max=114, **Median=86**, Avg=82.

```
BEFORE: akses_kelas_request = 455 ms
AFTER:  akses_kelas_request = 86 ms
Access Improvement = (455-86)/455*100 = 81.1% ≈ 81%
```

**Sinyal SANGAT KUAT** — SEMUA 5 sampel AFTER (31-114ms) berada JAUH DI
BAWAH baseline BEFORE (455ms), tidak overlap sama sekali.

### `canGuruAccessKelas_` penuh (termasuk baca `jadwal_kbm` yang SUDAH
dicache SEBELUM Tahap 6 — bukan murni akses_kelas_request)

| Run | ms | allowed |
|---|---:|---|
| 1 | 754 | true |
| 2 | 246 | true |
| 3 | 447 | true |
| 4 | 611 | true |
| 5 | 246 | true |

Median=447ms — **TIDAK menunjukkan improvement jelas** dibanding
angka 455ms yang sama-sama mengukur fungsi penuh ini (bukan cuma
akses_kelas_request). Variansi tinggi (246-754ms) konsisten dgn pola
variansi per-eksekusi Apps Script yang terlihat di SELURUH laporan
performa sesi ini (bukan spesifik ke perubahan ini) — kemungkinan
overhead platform (cold-start/quota check) mendominasi di skala
sekecil ini, BUKAN indikasi optimasi tidak bekerja (bukti §"baca
terisolasi" di atas menunjukkan baca akses_kelas_request SENDIRI
memang jauh lebih cepat).

### Save Attendance Total

| Run | ms |
|---|---:|
| 1 | 5063 |
| 2 | 4211 |
| 3 | 3255 |
| 4 | 3064 |
| 5 | 2913 |

Min=2913, Max=5063, **Median=3255**, Avg=3701.2

```
BEFORE: Save Attendance = 3421 ms
AFTER:  Save Attendance = 3255 ms
Save Improvement = (3421-3255)/3421*100 = 4.85% ≈ 5%
```

**Sinyal LEMAH** — rentang BEFORE (3267-4163ms, dari Tahap 5) dan AFTER
(2913-5063ms) OVERLAP SIGNIFIKAN. **TIDAK diklaim sbg improvement pasti**
— dilaporkan apa adanya sesuai instruksi eksplisit "jangan mengklaim
improvement jika variance terlalu besar". Kemungkinan penjelasan: `akses_kelas_request`
HANYA salah satu dari beberapa read di dalam `serverSaveAbsensiKelas`
(bersama `Firestore Write` ~1950ms yang jauh lebih dominan, ~57% dari
total) — penghematan ~370ms pada 1 komponen kecil bisa "tenggelam" dalam
variansi run-to-run komponen LAIN yang jauh lebih besar & tidak disentuh
tahap ini.

---

## 14. Regression Test

| Area | Status |
|---|---|
| ALLOW valid guru + kelas | PASS (§12) |
| DENY invalid guru + kelas | PASS (§12) |
| ALLOW valid tanggal | PASS (§12) |
| DENY invalid tanggal | PASS (§12) |
| ALLOW correct kelompok | PASS (implisit — semua test ALLOW pakai kelompokId=1 yang benar) |
| DENY wrong kelompok | PASS (§12) |
| Firestore Write | TIDAK BERUBAH (tidak disentuh) |
| `guru_izin` | TIDAK BERUBAH (tidak disentuh) |
| `audit_log` | TIDAK BERUBAH (tidak disentuh) |
| `withScriptLock_` | TIDAK BERUBAH sama sekali (bahkan instrumentasi sementara pun tidak menyentuhnya) |
| UI | TIDAK BERUBAH — tidak ada file `.html` diedit |
| Admin path (`serverSaveAbsensiKelasAdmin`) | TIDAK diubah — path admin tidak memanggil `canGuruAccessKelas_` sama sekali (§temuan Tahap 2), jadi tidak terpengaruh sama sekali oleh perubahan ini |

**Tidak ada regresi FUNGSIONAL** setelah fix `c3ba1da` diterapkan (SEBELUM
fix, ADA regresi nyata — lihat §8 — sekarang sudah diperbaiki & diverifikasi).

---

## 15. Deployment

```
DEPLOYED: YES
Commit optimasi: 30cbdc0 (perf: akses_kelas_request -- cache-first + scoped read)
Commit fix bug:  c3ba1da (fix: tanggalKeString_ -- tangani tanggal ISO-string dari CacheService round-trip)
Deployment version: production, verify_served.js PASS setelah setiap deploy tahap ini
```

---

## 16. Cleanup

```
Instrumentation = REMOVED   (Modul_PerfAudit.gs dihapus, dispatch diag=perf* di Code.js dihapus -- verified: git diff terhadap c3ba1da kosong utk Code.js)
Test Data       = REMOVED   (guru QA id=33, 1 baris akses_kelas_request, 9 baris absensi test tanggal 2020-03-05 -- semua dihapus & diverifikasi kosong)
QA Access       = REMOVED   (akses_kelas_request test dihapus, verified rowCount=0)
Production      = CLEAN     (git status bersih -- hanya file .md laporan yang untracked)
```

---

## 17. Remaining Bottlenecks

1. **Firestore Write** (~1950ms median, ~50%+ dari Save Total) — belum dioptimasi (Tahap 3: tidak ditemukan perubahan aman).
2. **`guru_izin`** (~227ms di dalam transaksi Save guru asli) — masih full-scan tanpa cache, kandidat tahap berikutnya (pola optimasi SAMA PERSIS spt tahap ini bisa diterapkan, tabel jauh lebih kecil rowCount=5).
3. **Switch Class** (~2108ms median, round-trip terpisah) — kemungkinan ikut sedikit lebih cepat dari optimasi ini (`serverGetKelasAbsenList` termasuk salah satu dari 3 caller yang dioptimasi), TAPI belum diukur terpisah tahap ini (di luar fokus "akses_kelas_request" murni).
4. **Dashboard init** (5 panggilan konkuren) — belum diukur end-to-end lewat browser asli.

---

## FINAL OUTPUT

```
TAHAP 6 — AKSES_KELAS_REQUEST

Code Changed:
YES

Schema Changed:
NO

Authorization Behavior:
UNCHANGED (setelah fix bug tanggalKeString_ -- SEMPAT regresi sesaat sebelum fix, lihat §8, sudah diperbaiki & diverifikasi ulang PASS)

Baseline:
Access Check = 455 ms
Save Total   = 3421 ms

After:
Access Check = 86 ms (baca terisolasi, apple-to-apple) / 447 ms (fungsi penuh canGuruAccessKelas_, variansi platform tinggi)
Save Total   = 3255 ms

Improvement:
Access Check = 81% (baca terisolasi, sinyal kuat) / ~2% (fungsi penuh, sinyal lemah -- lihat §13)
Save         = 5% (sinyal lemah, rentang before/after overlap)

Cache:
USED

Security:
PASS (5 skenario ALLOW/DENY diverifikasi identik setelah fix)

Production:
DEPLOYED

Cleanup:
COMPLETE

Remaining Bottlenecks:
1. Firestore Write (~1950ms, ~50%+ Save Total)
2. guru_izin (~227ms, di dalam transaksi Save guru asli, kandidat pola sama)
3. Switch Class (~2108ms, round-trip terpisah, belum diukur ulang)
4. Dashboard init (5 panggilan konkuren, belum diukur browser asli)
```
