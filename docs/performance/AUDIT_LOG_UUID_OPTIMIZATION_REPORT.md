# Laporan Optimasi — `audit_log` ID Generation → UUID (Tahap 5)

> Satu perubahan diimplementasikan: `generateId(AUDIT_LOG)` diganti dari
> `MAX(id)+1` (full-table scan) menjadi `Utilities.getUuid()`. Deployed &
> diverifikasi. Tanggal: 2026-08-08.

---

## 1. Executive Summary

`generateId()` (Modul_Utilities.gs) sekarang punya 1 cabang tambahan:
kalau `sheetName === SHEET_NAMES.AUDIT_LOG`, langsung `return
Utilities.getUuid()` — SEBELUM baris full-scan yang lama (yang tetap
dipakai APA ADANYA untuk semua tabel lain). Ini menghilangkan
`readSheetAsObjects(AUDIT_LOG)` (±429-440 baris) dari jalur `logAudit()`
sepenuhnya, dan sekaligus menghilangkan race condition `MAX(id)+1` di
luar lock yang sudah ada sejak lama (`ERROR_LOG.md #5`, tidak pernah
diperbaiki khusus utk `audit_log`).

Diukur nyata (Guru Normal Path, `serverSaveAbsensiKelas`, kelas "PAUD/TK
A", 9 santri, 5 run):

```
audit_log: 572 ms -> 292 ms median  (-49%)
Save Total: 3892 ms -> 3421 ms median (-12%)
```

Historical data (429-440 baris lama, id integer) **tidak disentuh**. Baris
`audit_log` baru sekarang punya id UUID — dikonfirmasi valid & unik lewat
pembacaan langsung baris production yang baru ditulis selama test.

---

## 2. Baseline

```
Save Attendance = 3892 ms median  (ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md §5, n=9, Guru Normal Path)
audit_log       = 572 ms median   (idem, field auditLogMs)
Firestore Write = 1950 ms median  (TIDAK disentuh tahap ini)
akses_kelas_request = 455 ms median (TIDAK disentuh tahap ini)
guru_izin       = 227 ms median   (TIDAK disentuh tahap ini)
```

---

## 3. Root Cause

`generateId(AUDIT_LOG)` (lama) selalu memanggil `readSheetAsObjects(AUDIT_LOG)`
— 1 panggilan `getDataRange().getValues()` yang mentransfer SELURUH baris
`audit_log` (429-440 baris saat pengukuran) — HANYA untuk menghitung
`MAX(id)+1`, walau **tidak ada satu pun kode lain di codebase yang
membaca `audit_log.id`** (dikonfirmasi Tahap 4, `AUDIT_LOG_OPTIMIZATION_PROPOSAL.md`
§4/§6 — no foreign key, no UI, no report, no `WHERE id=...` query).
Selain itu, `logAudit()` (dan `generateId(AUDIT_LOG)` di dalamnya)
dipanggil **DI LUAR** `withScriptLock_` di semua ±40 titik panggilannya —
artinya `MAX(id)+1` juga rawan race condition (dua eksekusi baca `MAX`
yang sama sebelum salah satu sempat `appendRow`).

---

## 4. Change Applied

**File**: `13_AppsScript/Modul_Utilities.gs`, fungsi `generateId(sheetName)`.

```diff
 function generateId(sheetName) {
+  if (sheetName === SHEET_NAMES.AUDIT_LOG) {
+    return Utilities.getUuid();
+  }
   const objects = readSheetAsObjects(sheetName);
   if (objects.length === 0) return 1;
   const maxId = Math.max(...objects.map(obj => parseInt(obj.id) || 0));
   return maxId + 1;
 }
```

Ditambah komentar penjelasan (lihat commit `4ed8060`). **Tidak ada
perubahan lain** — `logAudit()`, ±40 caller-nya, `appendRowToSheet`,
skema Sheets, `withScriptLock_`, dan ID generator utk tabel LAIN (santri,
guru, dst — semua tetap `MAX(id)+1` seperti semula) **tidak disentuh**.

---

## 5. Files Changed

| File | Perubahan |
|---|---|
| `13_AppsScript/Modul_Utilities.gs` | +14 baris (1 percabangan + komentar) di `generateId()` — **satu-satunya perubahan permanen** |

Commit: `4ed8060` — `perf: audit_log -- ganti generateId dari MAX(id)+1 ke UUID, hilangkan full-scan + race condition`.

(Commit lain selama tahap ini — `5f069e0`, `192abbe`, `ff798e4` — SEMUA
instrumentasi SEMENTARA utk before/after measurement, sudah di-revert
sepenuhnya di commit `ff798e4`, TIDAK ada jejak permanen selain `4ed8060`.)

---

## 6. Compatibility Verification

Repository-wide search ulang (Tahap 5, mengonfirmasi ulang temuan Tahap 4):

```
grep "= logAudit(" 13_AppsScript/     → 0 hasil (tidak ada caller yang pakai return value)
grep "generateId(SHEET_NAMES.AUDIT_LOG)" 13_AppsScript/ → 1 hasil (di dalam logAudit() sendiri)
grep "audit_log.id" / pembacaan berdasarkan id audit_log → 0 hasil (selain di generateId() sendiri)
```

**Tidak ditemukan dependency baru** terhadap `id === number` / sequential
/ `MAX(id)` di luar `generateId()` itu sendiri. Semua ±40 caller
`logAudit(tableName, recordId, action, userId, detail)` memanggil dengan
signature yang SAMA PERSIS — tidak ada yang berubah dari sudut pandang
caller manapun (Absensi, Guru, Santri, Kalender, Konseling, Munaqosah,
Jadwal KBM, Pengumuman, Pengurus, Pusat Unduhan, Siklus Generus, Quote
Harian — semua modul yang memanggil `logAudit` tetap berfungsi identik,
verifikasi via `node tools/check_local.js` PASS untuk semua modul ini).

---

## 7. Correctness Verification

### Test A — New audit row (ID harus UUID valid)
**PASS.** Baris baru production (ditulis selama measurement) diperiksa
langsung:
```
id: "0c7013c5-4b58-4d20-bd57-fd4bb191caa8"  (table_name: guru, dari serverAddGuru QA)
id: "b7185627-f5cf-4728-b935-d820a0c93ecc"  (table_name: absensi)
id: "4c21fb7a-e798-4589-9705-7040b8eab7b0"  (table_name: absensi)
id: "6f892b40-26d5-4329-b50f-5ec49613bcc4"  (table_name: absensi)
id: "d32e38e8-5a29-45af-96a2-4b032c1c60c6"  (table_name: absensi)
id: "4fdc37ca-d57c-4b4b-addb-3a7efd9153a9"  (table_name: absensi)
```
Format UUID v4 valid (36 karakter, hyphenated hex) utk SEMUA baris baru
— terlepas dari `table_name` audit event-nya (guru maupun absensi),
konsisten dgn perubahan yang generik di `generateId()`.

### Test B — Multiple audit rows (unik, tidak duplicate, semua tercatat)
**PASS.** 6 baris di atas diperiksa via `Set` uniqueness check server-side:
`idsUnique: true`. Jumlah baris `audit_log` bertambah dari 434 → 440 (persis
+6, sesuai jumlah event yang dipicu selama test: 1 create-guru + 5
save-attendance) — tidak ada baris yang hilang/gagal tercatat.

### Test C — Existing history (ID lama tidak berubah)
**PASS.** Baris 1-10 (id integer 1-10, dari 2026-07-15/07-17) dibaca
ulang via `diag=rows` — SEMUA masih integer, TIDAK berubah jadi UUID atau
termodifikasi apa pun. Sesuai desain (perubahan hanya mempengaruhi baris
BARU, append-only, tidak ada migrasi/rewrite).

### Test D — Concurrent behavior
**NOT MEASURED** (sesuai instruksi eksplisit — "Jangan melakukan load
test production. Static analysis cukup"). Analisis statis: UUID v4
(128-bit random) TIDAK butuh baca shared-state apa pun sebelum generate
— secara arsitektur MENGHILANGKAN kelas race condition `MAX(id)+1` yang
ada sebelumnya (2 eksekusi generate UUID secara independen, probabilitas
collision praktis nol, TIDAK bergantung pada urutan/timing eksekusi lain
sama sekali) — ini kesimpulan LOGIS dari sifat UUID, bukan hasil load-test
nyata.

### Test E — Other `logAudit` callers (tidak break)
**PASS** (static). `node tools/check_local.js` — parse SEMUA modul
(termasuk 15 modul pemanggil `logAudit`: Modul_MaintainGuru.gs,
Modul_MaintainAbsensi.gs, Modul_MaintainKalender.gs,
Modul_MaintainKonseling.gs, Modul_MaintainMunaqosah.gs,
Modul_MaintainJadwalKBM.gs, Modul_MaintainPengumuman.gs,
Modul_MaintainPengurus.gs, Modul_MaintainPustakUnduhan.gs,
Modul_MaintainSiklusGenerus.gs, Modul_MaintainSantri.gs,
Modul_QuoteHarian.gs, Modul_InputAbsen.gs) — **OK**, tidak ada syntax/
signature error. Runtime PASS empiris utk 2 caller yang benar-benar
dieksekusi selama test (`serverAddGuru` → CRUD Guru, `serverSaveAbsensiKelas`
→ Absensi) — keduanya menulis baris `audit_log` dgn benar (Test A/B).
38 caller lain **TIDAK dieksekusi runtime** selama tahap ini (di luar
cakupan "fokus hanya audit_log ID change") — TIDAK ADA alasan struktural
mereka akan gagal (signature `logAudit()` identik), tapi tidak
diverifikasi runtime satu-satu, dicatat sbg `NOT MEASURED` per fitur.

---

## 8. Before/After Measurement

Guru Normal Path (`serverSaveAbsensiKelas`, akun sintetis "Guru Test QA"
id=32, kelas "PAUD/TK A" — 9 santri real, satu-satunya ukuran kelas
tersedia di Kelp Petemon), tanggal test **2020-02-03** (dipastikan kosong
sebelum ditulis, `perfcheckempty` → `existingCount:0`), 5 run.

| Run | audit_log idGenMs | audit_log appendMs | **audit_log totalMs** | **Save serverTotalMs** |
|---|---:|---:|---:|---:|
| 1 | 1 | 303 | 304 | 3421 |
| 2 | 0 | 292 | 292 | 3720 |
| 3 | 2 | 407 | 409 | 4163 |
| 4 | 1 | 207 | 208 | 3393 |
| 5 | 1 | 249 | 250 | 3267 |

**audit_log**: min=208, max=409, **median=292**, avg=292.6
**Save Total**: min=3267, max=4163, **median=3421**, avg=3592.8

```
BEFORE
audit_log       = 572 ms
Save Attendance = 3892 ms

AFTER
audit_log       = 292 ms
Save Attendance = 3421 ms
```

---

## 9. Performance Improvement

```
Audit Improvement = (572 - 292) / 572 * 100 = 48.95% ≈ 49%
Save Improvement  = (3892 - 3421) / 3892 * 100 = 12.10% ≈ 12%
```

**Kekuatan sinyal — dinilai jujur, bukan diklaim seragam**:
- **`audit_log`**: sinyal SANGAT KUAT, tidak overlap sama sekali — SEMUA
  5 sampel AFTER (208-409ms) berada di BAWAH SEMUA 5 sampel BEFORE
  (dari `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md`: 480/570/572/578/644ms).
  Perbaikan ini **bisa diklaim dgn yakin**.
- **Save Total**: sinyal ADA tapi **rentang BEFORE/AFTER overlap sebagian**
  (before min=3451 vs after max=4163 — tumpang tindih). Arah perbaikan
  konsisten (median turun 12%, dan turunnya SEPENUHNYA konsisten dgn
  besarnya penurunan `audit_log` — 572-292=280ms turun di `audit_log`,
  3892-3421=471ms turun di Save Total, selisih 191ms MASIH DALAM rentang
  variansi run-to-run yang sudah terlihat konsisten di semua laporan
  performa sebelumnya, ~150-500ms antar-run pada fungsi yang SAMA). **Tidak
  diklaim sbg "pasti 12% lebih cepat"** — dilaporkan apa adanya sbg median
  terukur, dgn overlap dicatat secara eksplisit, sesuai instruksi "jangan
  mengklaim improvement jika variance terlalu besar".

---

## 10. Race Condition Impact

**MAX(id)+1 race condition (ERROR_LOG #5-class, khusus `audit_log`,
temuan Tahap 4) — DIHILANGKAN utk baris BARU.** `Utilities.getUuid()`
tidak membaca shared state apa pun sebelum generate — 2 eksekusi
manapun (guru A, guru B, admin, dst — 40 caller mana pun) yang memanggil
`logAudit()` hampir bersamaan TIDAK LAGI bisa menghasilkan id yang sama,
terlepas dari urutan/timing eksekusi. Ini perbaikan CORRECTNESS (bukan
cuma performa) sbg efek samping yang diharapkan dari Option A — sesuai
analisis Tahap 4.

Baris LAMA (id integer, ditulis sebelum perubahan ini) TETAP berpotensi
punya duplicate id dari race condition historis (kalau pernah terjadi) —
perubahan ini TIDAK memperbaiki data lama (di luar cakupan, append-only,
tidak ada migrasi) — HANYA mencegah duplicate BARU ke depannya.

---

## 11. Regression Check

| Area | Status |
|---|---|
| Attendance save (fungsi/urutan/validasi) | TIDAK BERUBAH — `serverSaveAbsensiKelas` sendiri tidak disentuh permanen (instrumentasi sementara sudah di-revert, `git diff` terhadap `4ed8060` kosong) |
| Firestore Write | TIDAK BERUBAH — di luar cakupan tahap ini, tidak disentuh sama sekali |
| Access check (`akses_kelas_request`) | TIDAK BERUBAH |
| Guru permission (`guru_izin`) | TIDAK BERUBAH |
| Lock (`withScriptLock_`) | TIDAK DISENTUH sama sekali (bahkan utk instrumentasi sementara — di luar hard scope tahap ini) |
| UI | TIDAK BERUBAH — tidak ada file `.html` yang diedit |
| Admin path (`serverSaveAbsensiKelasAdmin`) | TIDAK BERUBAH — sama-sama diuntungkan otomatis (memanggil `logAudit` yang sama), tidak diukur ulang tahap ini (di luar fokus "Guru Normal Path" yang diminta) |
| Other audit callers (38 caller lain) | Tidak dieksekusi runtime tahap ini, static check PASS, `NOT MEASURED` runtime (lihat §7 Test E) |

**Tidak ada regresi yang terdeteksi** pada area yang diverifikasi.

---

## 12. Deployment

```
DEPLOYED: YES
Commit permanen: 4ed8060 (perf: audit_log -- ganti generateId dari MAX(id)+1 ke UUID)
Deployment version: production, terverifikasi via node tools/verify_served.js (sehat, 5/5 blok script valid) setelah setiap deploy pada tahap ini
```

---

## 13. Cleanup

```
Instrumentation = REMOVED   (Modul_PerfAudit.gs dihapus, dispatch diag=perf* di Code.js dihapus, side-channel LOG_AUDIT_LAST_PERF_ di logAudit() dihapus -- verified: git diff terhadap 4ed8060 kosong)
Test Data       = REMOVED   (guru QA id=32, 1 baris akses_kelas_request, 9 baris absensi test tanggal 2020-02-03 -- semua dihapus & diverifikasi kosong)
QA Access       = REMOVED   (akses_kelas_request test dihapus, verified via re-check)
Production      = CLEAN     (git status bersih -- hanya file .md laporan yang untracked)
```

---

## 14. Remaining Bottlenecks

Urutan berdasarkan kontribusi terhadap Save Total (data dari laporan
sebelumnya + tahap ini):

1. **Firestore Write** (~1950ms median, ~50%+ dari Save Total) — TIDAK
   dioptimasi (Tahap 3: tidak ditemukan perubahan aman, floor latency
   platform-level).
2. **`akses_kelas_request`** (~455ms di dalam transaksi Save guru asli)
   — masih full-scan tanpa cache, DI LUAR cakupan tahap ini.
3. **`guru_izin`** (~227ms di dalam transaksi Save guru asli) — masih
   full-scan tanpa cache, DI LUAR cakupan tahap ini.
4. **Switch Class** (~2108ms median, round-trip terpisah dari Save) —
   belum disentuh tahap optimasi mana pun.

---

## FINAL OUTPUT

```
AUDIT_LOG UUID OPTIMIZATION COMPLETE

Code Changed:
YES — audit_log ID generation only (Modul_Utilities.gs, generateId(), 1 percabangan)

Schema Changed:
NO

Historical Data Changed:
NO

Baseline:
audit_log = 572 ms
Save      = 3892 ms

After:
audit_log = 292 ms
Save      = 3421 ms

Improvement:
audit_log = 49%
Save      = 12% (sinyal ada, TAPI rentang before/after overlap sebagian -- lihat §9 utk kejujuran statistik)

Full Table Scan:
REMOVED

Sequential ID:
REMOVED FOR NEW AUDIT ROWS

Race Condition:
MAX(id)+1 RACE REMOVED (utk baris baru; baris lama tidak terpengaruh/tidak dimigrasi)

Correctness:
PASS

Production:
DEPLOYED

Cleanup:
COMPLETE

Remaining Bottlenecks:
1. Firestore Write (~1950ms, ~50%+ Save Total)
2. akses_kelas_request (~455ms, di dalam transaksi Save guru asli)
3. guru_izin (~227ms, di dalam transaksi Save guru asli)
4. Switch Class (~2108ms, round-trip terpisah)
```
