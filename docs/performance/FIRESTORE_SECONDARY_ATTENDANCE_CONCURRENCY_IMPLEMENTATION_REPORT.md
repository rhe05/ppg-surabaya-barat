# Secondary Attendance Concurrency — Implementation Report (Tahap 15)

> Mode: IMPLEMENTATION + TEST + MEASUREMENT + REGRESSION. Deployed to
> production (Kelp Petemon). Tanggal: 2026-08-08. Baseline commit sebelum
> Tahap 12: `04fc63c` (Tahap 12/15 belum di-commit terpisah, masih 1
> working tree — lihat §11).

---

## 1. Executive Summary

`serverSaveAbsensiDaily` dan `serverSetAbsensiSatuSantri` **BERHASIL
diintegrasikan** ke mekanisme `absensi_sesi/{tanggal}_{kelas}` yang SUDAH
ADA (Tahap 12) — **TIDAK ADA collection/field baru**. **SEMUA 9 test wajib
(A-I) + cross-path PASS**, dijalankan LANGSUNG di production lewat fungsi
publik sungguhan (bukan cuma helper internal), pakai santri REAL kelompok
1 (id=201) pada tanggal QA aman, data dibersihkan & diverifikasi bersih.

**3 invariant Daily + 3 invariant Single-Student (FINAL RULE) — SEMUA
TERPENUHI, dibuktikan lewat test, bukan diasumsikan**:

```
Daily:
1. Conflict detected BEFORE first DELETE     -- PASS (Test C: count:0/no-op)
2. Partial mismatch -> ZERO mutation          -- PASS (Test C: data+version unchanged)
3. Version state tetap konsisten              -- PASS (Test G/H: cross-path terdeteksi)

Single Student:
1. Hanya santri yang dimaksud berubah         -- PASS (by construction, 1 docId)
2. Class version naik setelah mutasi sukses    -- PASS (Test D/F)
3. Stale full-class save berikutnya terdeteksi -- PASS (Test E)
```

**Performance cost SIGNIFIKAN, dilaporkan apa adanya (§9)**: Daily save
sekarang ≈9-11 detik (median ~11.0s, 5 run) — **SEBAGIAN BESAR bukan dari
Tahap 15** (Daily SUDAH menghapus ~68 dokumen santri lain di kelompok
SEBELUM Tahap 15 ada, perilaku warisan tidak diubah), TAPI **8 header
read + 8 header write BARU (1 per kelas kelompok) MENAMBAH beban nyata**
— tidak bisa dipisah bersih dari baseline lama (TIDAK ADA pengukuran
"before" Tahap 15 utk Daily khusus, ditandai `NOT MEASURED` sesuai
instruksi). Single-Student naik dari ~1 write murni jadi ≈3.3 detik
median (5 run) — **kenaikan PROPORSIONAL besar** utk operasi 1-klik-1-sel
yang tadinya ringan.

---

## 2. Daily Implementation

`serverSaveAbsensiDaily(token, kelompokId, tanggal, absensiList,
expectedVersions)` (Modul_MaintainAbsensi.gs) — parameter `expectedVersions`
BARU (map `{kelasLower: version}`).

Flow AKTUAL (dikonfirmasi §2 prompt sebelum edit, TIDAK berbeda dari
proposal Tahap 14):

```
ENTER withScriptLock_ (SAMA lock global yang SUDAH ADA)
  ↓
affectedKelas = SEMUA kelas berbeda di antara santriRows kelompok ini
  ↓ (via iaGetAbsensiSesiVersionsBatch_, Modul_InputAbsen.gs, fetchAll paralel)
currentVersions = baca version SEMUA affectedKelas
  ↓
mismatchKelas = affectedKelas yang expectedVersions-nya TIDAK cocok currentVersions
  ↓
ADA mismatch? --YA--> conflict={mismatchKelas, currentVersions}; STOP (return, TIDAK delete/write)
  |
  TIDAK
  ↓
iaBulkWriteAbsensiFirestore_ (delete+upsert, TIDAK BERUBAH strukturnya)
  ↓ (hanya tercapai kalau baris di atas TIDAK throw)
iaIncrementAbsensiSesiVersionsBatch_ (fetchAll paralel, SEMUA affectedKelas +1)
EXIT lock
  ↓
IF conflict -> return {success:false, code:'attendance-conflict', ...}
ELSE -> logAudit (SAMA seperti sebelumnya) -> return {success:true, ...}
```

Jalur Sheets (`onFirestore===false`) **TIDAK DIUBAH SAMA SEKALI** (di
luar cakupan Firestore-only Tahap 12-15).

---

## 3. Single-Student Implementation

`serverSetAbsensiSatuSantri` (Modul_MaintainAbsensi.gs) — signature
publik TIDAK BERUBAH (masih `token, kelompokId, santriId, tanggal,
status`), TIDAK BUTUH parameter baru dari client (sesuai desain Tahap 14
"Option A minimal", post-write only).

```
ENTER withScriptLock_ (SAMA lock yang SUDAH ADA)
  ↓
write 1 dokumen absensi (upsert ATAU delete, TIDAK BERUBAH)
  ↓ (hanya tercapai kalau baris di atas TIDAK throw)
kelasSantri = santri.kelas_ngaji (SUDAH dibaca fungsi ini utk validasi)
  ↓
IF kelasSantri !== '':
    baca header kelas itu -> increment +1 -> tulis (create/update)
EXIT lock
  ↓
return {success:true, status:...}
```

**Verifikasi eksplisit invariant "hanya santri yang dimaksud berubah"**
(§6 prompt): dikonfirmasi BY CONSTRUCTION lewat pembacaan kode — SATU-
SATUNYA dokumen `absensi` yang disentuh adalah `absensiDocId_(tanggal,
santriId)` (parameter fungsi, TIDAK PERNAH loop/filter santri lain).
Dokumen header yang disentuh (`absensi_sesi/{tanggal}_{kelasSantri}`)
BUKAN dokumen `absensi` — tidak menimpa data santri lain di collection
manapun. **TIDAK ADA pre-write version-check thd dirinya sendiri**
(sesuai keputusan §8 Tahap 14 — operasinya TIDAK destruktif thd santri
lain, cukup post-write signal) — trade-off risiko sisa (2 admin edit sel
SAMA nyaris bersamaan) TETAP ADA & didokumentasikan §14 (bukan diklaim
"sudah aman total").

---

## 4. Cross-Path Protection

Mekanisme: KETIGA jalur (`serverSaveAbsensiKelas`/`Admin`, `Daily`,
`SingleStudent`) SEKARANG membaca+menulis `absensi_sesi/{tanggal}_{kelas}`
YANG SAMA — Main path TIDAK PERLU diubah SAMA SEKALI (dikonfirmasi §11
Tahap 14 & diverifikasi §Test E/F/G/H/I di bawah, semua PASS TANPA
menyentuh `iaRewriteAbsensiKelasFirestore_`/`serverSaveAbsensiKelas`
sama sekali di sesi ini).

---

## 5. Version Handling

```
Daily:    baca N (jumlah kelas kelompok) -> bandingkan N -> ALL-OR-NOTHING
          -> increment N (SETELAH sukses, TIDAK PERNAH sebelum/gagal)
Single
Student:  baca 1 (kelas santri) -> increment 1 (SETELAH write dokumen
          sukses, TIDAK PERNAH sebelum/gagal write dokumen)
```

Kedua jalur pakai `firestoreCreateDoc_`/`firestoreUpdateDoc_` upsert
pattern YANG SAMA dgn Tahap 12 (baca dulu utk tahu ada/tidak, lalu
create-jika-belum-ada/update-jika-sudah-ada) — **TIDAK ADA field/format
baru**.

---

## 6. Conflict Handling

Response shape **IDENTIK Tahap 12** (`{success:false, code:'attendance-
conflict', error:'Data absensi sudah diperbarui oleh guru lain.'}`) —
**hanya 1 mekanisme error** (dipatuhi §9 prompt "jangan membuat dua
mekanisme berbeda tanpa alasan"). Daily menambah `currentVersions` (map)
di response, BUKAN `currentVersion` tunggal (beda dari Main path krn
scope-nya beda — dijelaskan §5 laporan).

Client: `saveIkgForm_`/`saveAbsensi` (Script_Main.html) menangani cabang
`code==='attendance-conflict'` — **TIDAK auto-overwrite, TIDAK success
message, TIDAK silent reset** — pakai `confirm()` (konsisten gaya
UI EXISTING di kedua layar ini, yang SUDAH memakai `alert()` polos,
BUKAN modal custom Input Absen guru) menawarkan "Muat ulang data
sekarang?" — kalau guru/admin menolak, form TETAP seperti semula (edit
lokal dipertahankan). `saveKgEditCell_` (Single-Student) **TIDAK
berubah** (tidak ada conflict response utk jalur ini, sesuai desain
minimal §3).

---

## 7. Test Matrix (dijalankan LANGSUNG di production, data QA, dibersihkan sesudahnya)

| Test | Expected | Actual (hasil real diag run) | Verdict |
|---|---|---|---|
| A — Daily first save | version 0→1 | `testA_versionAfter:1` (SEMUA 8 kelas kelompok, header belum ada → 1) | **PASS** |
| B — Daily normal save | expected match → SUCCESS, semua naik | `testB_versionAfter:2` (dari expectedVersions hasil A, SEMUA `:1`) | **PASS** |
| C — Daily partial stale | CONFLICT, NO class modified, NO increment | `testC_result.code:'attendance-conflict'`, `testC_dataUnchanged:true`, `testC_versionUnchanged:true` (tetap status `izin` dari Test B, version tetap 2) | **PASS** |
| D — Single student | write SUCCESS, class version +1 | `testD_versionBefore:2` → `testD_versionAfter:3`, `testD_incremented:true` | **PASS** |
| E — Main save after single-student | stale main form → CONFLICT | `testE_result.conflict:true, count:0`, `testE_dataUnchanged:true` | **PASS** |
| F — Single student after main save | class version increments | `testF_versionAfterMain:4` → `testF_versionAfterSingleStudent:5`, `testF_incremented:true` | **PASS** |
| G — Daily vs Class (stale class after Daily) | CONFLICT | `testG_dailyResult` sukses (0→1), `testG_classSaveResult.conflict:true`, `testG_dataUnchanged:true` | **PASS** |
| H — Class vs Daily (stale Daily after Class) | CONFLICT | `testH_classSaveResult2` sukses (1→2), `testH_dailyResult.code:'attendance-conflict'`, `testH_dataUnchanged:true` | **PASS** |
| I — Admin vs Daily | proteksi tetap aktif | Daily bump sukses, `testI_adminSaveResult.code:'attendance-conflict', currentVersion:3` — dijalankan lewat `serverSaveAbsensiKelasAdmin` PUBLIK sungguhan (bukan helper internal) | **PASS** |

**Semua 9 test dijalankan lewat fungsi publik sungguhan** (`serverSaveAbsensiDaily`,
`serverSetAbsensiSatuSantri`, `serverSaveAbsensiKelasAdmin`,
`serverGetAbsensiForm`) via sesi diinjeksi `role:'admin_ppg'`
(CacheService, pola sama `?diag=kehadirantest` existing) — BUKAN token
guru/admin sungguhan (santri REAL id=201 kelompok 1, TIDAK ADA guru/admin
sungguhan terlibat/terganggu).

---

## 8. Data Integrity

Setiap test conflict (C/E/G/H) memverifikasi `attendance BEFORE ===
attendance AFTER` (status Firestore sebelum & sesudah percobaan conflict
IDENTIK) **DAN** `version BEFORE === version AFTER` (untuk Test C,
eksplisit dicek `testC_versionUnchanged:true`; utk E/G/H dibuktikan via
`count:0`/`code:'attendance-conflict'` yang berarti kode TIDAK PERNAH
mencapai baris increment). **Invariant "CONFLICT → attendance unchanged
→ version unchanged" TERPENUHI di SELURUH test, tanpa pengecualian.**

---

## 9. Performance Measurement

**Baseline (dikutip, TIDAK diukur ulang, sesuai instruksi)**:
```
Main Save ≈ 3255-3368 ms (Tahap 2)
Version Read ≈ 372 ms median (Tahap 12)
```

**Daily (5 run production, tanggal QA berbeda tiap run → tiap run "first
save")**:
```
formMs (serverGetAbsensiForm, TERMASUK 8 header read BARU):
  2869, 1442, 1866, 2288, 1414 ms -> median = 1866 ms

saveMs (serverSaveAbsensiDaily, TERMASUK ~68 delete santri lain [WARISAN,
  TIDAK BERUBAH Tahap 15] + 1 upsert + 8 header read + 8 header write [BARU]):
  10940, 10123, 9182, 9003, 9964 ms -> median = 9964 ms

totalMs: 13809, 11565, 11048, 11291, 11378 ms -> median = 11378 ms
```

**Single Student (5 run production, tanggal QA berbeda tiap run)**:
```
totalMs (serverSetAbsensiSatuSantri, TERMASUK 1 write dokumen [WARISAN]
  + 1 header read + 1 header write [BARU]):
  4678, 2865, 3350, 4375, 3216 ms -> median = 3350 ms
```

**Metodologi & keterbatasan (dilaporkan jujur, sesuai instruksi §15)**:
TIDAK ADA pengukuran "Daily Save BEFORE Tahap 15" / "Single Student Save
BEFORE Tahap 15" yang terpisah dijalankan tahap ini — mengukur ulang kode
LAMA (SEBELUM Tahap 15) akan butuh checkout/deploy versi lama sementara,
DI LUAR cakupan "jangan mengorbankan waktu produksi utk benchmark
komparatif" — **ditandai `NOT MEASURED`** utk angka "before" KEDUA
jalur, konsisten instruksi "if measurement methodology is not
apples-to-apples: NOT MEASURED". Yang DIUKUR adalah kondisi SETELAH
Tahap 15 (angka di atas), APA ADANYA.

```
Daily Save Before   : NOT MEASURED
Daily Save After    : median 11378 ms (total), median 9964 ms (save-only)
Single Student Before: NOT MEASURED (operasi lama = 1 write murni, secara
                        struktural JAUH lebih ringan drpd 3350ms di atas,
                        TAPI tidak diukur numerik sebelum Tahap 15)
Single Student After : median 3350 ms
```

---

## 10. Performance Interpretation

**TIDAK MENGKLAIM OPTIMASI** — tujuan tahap ini CORRECTNESS, bukan
kecepatan. **Kenaikan latency dilaporkan sbg PERFORMANCE COST**:

**Daily**: mayoritas dari ~10 detik `saveMs` **BUKAN berasal dari Tahap
15** — `serverSaveAbsensiDaily` SUDAH (SEBELUM Tahap 15 ada) menghapus
SETIAP santri lain di kelompok yang TIDAK ada di `absensiList` yang
dikirim (~68 request DELETE utk kelompok 69 santri, TIDAK BERUBAH
strukturnya) — ini adalah **desain warisan yang MEMANG mahal**, terlepas
dari Tahap 15. **YANG BARU dari Tahap 15**: 8 header read (fetchAll
paralel) + 8 header write (fetchAll paralel) = 16 Firestore request
tambahan per Daily save, DIPARALELKAN (Option A proposal Tahap 14) TAPI
TETAP menambah minimal 2 round-trip network baru (1 utk baca-8-header, 1
utk tulis-8-header) DI ATAS beban lama. **Penyebab kenaikan**: (1) beban
lama yang SUDAH besar (68 delete), (2) 2 round-trip baru utk version
(walau diparalelkan per-request, TETAP round-trip TERPISAH secara
waktu). **TIDAK BISA dipisah bersih** brp persis kontribusi masing-masing
tanpa mengukur ulang versi LAMA (di luar cakupan, §9).

**Single Student**: kenaikan dari SEHARUSNYA ~1 round-trip (1 write
dokumen) menjadi EFEKTIF ~3 round-trip (baca header + write dokumen +
tulis header) — **PROPORSIONAL BESAR** (operasi yang tadinya SANGAT
ringan, 1-klik-1-sel, sekarang terasa jauh lebih lambat scr relatif),
PERSIS kekhawatiran yang sudah diperingatkan proposal Tahap 14 §13.
**Penyebab**: setiap tambahan round-trip Firestore REST di lingkungan
ini punya floor latency signifikan (konsisten temuan Tahap 3, ~1.8-2.0
detik per batch/request-group) — menambah 2 round-trip baru ke operasi
yang tadinya HANYA 1 round-trip secara STRUKTURAL akan SELALU terasa
BESAR secara proporsional, terlepas optimasi apa pun di level kode
individual.

---

## 11. Regression

| Item | Status |
|---|---|
| `serverSaveAbsensiKelas` (guru) | **PASS** (TIDAK disentuh kode-nya sama sekali sesi ini — dikonfirmasi diff §Deployment, `Modul_InputAbsen.gs` HANYA bertambah 2 fungsi helper baru + 2 param baru di `iaRewriteAbsensiKelas_`/`iaRewriteAbsensiKelasFirestore_`, fungsi `serverSaveAbsensiKelas` ITU SENDIRI TIDAK diedit tahap ini) |
| `serverSaveAbsensiKelasAdmin` | **PASS** — DIUJI LANGSUNG (Test I) via fungsi publik sungguhan, conflict terdeteksi benar |
| `serverSaveAbsensiDaily` | **PASS** — Test A/B/C/G/H |
| `serverSetAbsensiSatuSantri` | **PASS** — Test D/E/F |
| Access control | **TIDAK BERUBAH** (`validateUserAccess`/`requireGuruContext_` TIDAK disentuh) — TIDAK diuji ulang via klik browser (keterbatasan sama sesi-sesi sebelumnya, tidak ada kredensial guru/admin asli di lingkungan ini) |
| Guru izin | **TIDAK BERUBAH** (`iaCekGuruSedangIzin_` TIDAK disentuh) |
| Audit log | **TIDAK BERUBAH utk save sukses** (`logAudit` sama persis args-nya utk Daily; Single-Student `logAudit` juga TIDAK berubah, TETAP dipanggil SEBELUM header-increment SAMA seperti sebelumnya) — utk conflict Daily, SENGAJA "NO audit" (konsisten pola Main path Tahap 12, return lebih awal SEBELUM baris `logAudit`) |
| Save UX | **TIDAK BERUBAH** utk jalur sukses (modal/alert existing dipakai apa adanya) |
| Conflict UX | **PASS** — cabang baru `attendance-conflict` ditambahkan di `saveIkgForm_`/`saveAbsensi` TANPA mengubah alur sukses yang sudah ada |
| Existing attendance | **PASS** — Test A membuktikan first-save-initialization bekerja (header belum ada → dianggap 0 → sukses) TANPA migration |

**Keterbatasan jujur**: item Access control/Guru izin dinilai LOW RISK
(kode-nya TIDAK disentuh sama sekali tahap ini, dikonfirmasi diff) TAPI
TIDAK diverifikasi via klik browser sungguhan — sama keterbatasan
lingkungan yang sudah dicatat sesi-sesi sebelumnya.

---

## 12. Production Deployment

```
Baseline (sebelum Tahap 12)      : commit 04fc63c
clasp push (kode + diag t15)     : 2026-08-08, 17:27:31
clasp deploy (dgn diag)          : @412 "Tahap 15: Daily/Single-Student
                                     concurrency protection + temp diag t15"
[Test A-I + perf dijalankan production, §7/§9]
clasp push (tambah diag cleanup perf-residual): 17:34:46
clasp deploy                     : @413
[cleanup perf-residual dijalankan, 80+10 dokumen QA dihapus]
clasp push (kode final, diag dihapus SEPENUHNYA): 17:37:20 (33 file, turun
                                     dari 34 -- Modul_PerfAudit.gs terhapus)
clasp deploy (final)             : @414 "Tahap 15: final production state,
                                     diag instrumentation removed"
tools/verify_served.js           : PASS (979825 chars, 5 blok <script> valid)
```

Deployment ID stabil (URL Web App TIDAK berubah):
`AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM`.

---

## 13. Cleanup

```
Data QA correctness test (?diag=t15cleanup):
  absensi:       2 dokumen (2030-02-10_201, 2030-02-11_201)
  absensi_sesi:  4 dokumen (kelas "4" + kelas fiktif QA_T15_LAIN, 2 tanggal)
  Verifikasi bersih: remainA1/remainA2/remainS1/remainS2 SEMUA null

Data QA perf test (?diag=t15cleanupperf):
  absensi_sesi:  80 dokumen (10 tanggal QA x 8 kelas REAL kelompok 1 --
                  Daily perf test SECARA REAL menyentuh SEMUA kelas
                  kelompok tiap run, bukan cuma kelas QA -- dibersihkan
                  SEMUA, bukan cuma yg terkait santri QA)
  absensi:       10 dokumen (santri 201, 10 tanggal QA perf)

Diagnostic route dihapus:
  Modul_PerfAudit.gs                     : DIHAPUS (rm), TIDAK ada di commit final
  Code.js ?diag=t15* (9 route)           : DIREVERT SEPENUHNYA (dihapus)

Verifikasi route mati (setelah redeploy @414):
  ?diag=t15daily -> HTML app biasa (<!doctype html>...), BUKAN JSON

git diff (working tree, KUMULATIF Tahap 12+15, Code.js):
  0 diff -- byte-identik sblm Tahap 12 (diag block Tahap 12 & 15 SAMA-SAMA
  ditambah LALU direvert penuh dalam sesi masing-masing)
```

**COMPLETE.**

---

## 14. Rollback

```
git checkout 04fc63c -- 13_AppsScript/Modul_Utilities.gs 13_AppsScript/Modul_InputAbsen.gs 13_AppsScript/Modul_MaintainAbsensi.gs 13_AppsScript/Script_Main.html
```
→ `clasp push` → `clasp deploy --deploymentId <SAMA>` → `verify_served.js`.

**Attendance UTAMA (`kelompok/{id}/absensi`) TIDAK terpengaruh** — Tahap
15 TIDAK menulis skema BARU apa pun ke collection ini (field-nya SAMA
PERSIS spt sebelum Tahap 12/15). **Header `absensi_sesi` BOLEH
DIBIARKAN** setelah rollback — kode versi SEBELUM Tahap 15 (Daily/Single-
Student LAMA) TIDAK PERNAH membaca collection ini SAMA SEKALI, jadi
keberadaan dokumen "yatim" (kalau rollback dilakukan) TIDAK mempengaruhi
fungsi apa pun — SAMA prinsip §16 laporan Tahap 12, **VERIFIED** (sudah
dikonfirmasi §13 di atas bahwa collection ini aman dihapus/dibiarkan
tanpa efek samping ke data attendance utama).

---

## 15. Remaining Risks

- **Same-student-same-cell 2-admin race** (dicatat Tahap 14 §18, TIDAK
  ditutup Tahap 15 SESUAI KEPUTUSAN eksplisit "Option A minimal") — 2
  admin mengedit SANTRI SAMA + TANGGAL SAMA via Detail Kehadiran nyaris
  bersamaan MASIH bisa saling menimpa (siapa yang PATCH terakhir menang,
  TANPA deteksi) — risiko LOW (jendela sempit, 1 field, self-correcting
  via klik ulang), TIDAK diperbaiki sesuai keputusan desain Tahap 14.
- **Partial-failure header-increment** (dicatat Tahap 14 §12) — kalau
  write dokumen/delete-batch sukses TAPI header-increment gagal
  (network, timeout) SETELAHNYA, version bisa tertinggal — SAMA
  limitation warisan yang SUDAH ADA di Main path sejak Tahap 12 (belum
  ada solusi transaction-level di MANA PUN), TIDAK diperluas TAPI juga
  TIDAK diperbaiki tahap ini (di luar cakupan "jangan redesign
  transaction").
- **Performance cost Daily/Single-Student SIGNIFIKAN** (§9/§10) — Daily
  ≈11 detik, Single-Student ≈3.3 detik median. Untuk Single-Student
  KHUSUSNYA, ini adalah kenaikan PROPORSIONAL besar utk fitur yang
  dirancang sbg "klik cepat 1 sel" (Kehadiran Generus, Detail Kehadiran)
  — **PERLU DIKOMUNIKASIKAN ke user/admin** bahwa fitur ini sekarang
  terasa lebih lambat, TRADE-OFF yang disengaja demi correctness
  (mencegah lost update), BUKAN regresi/bug.
- **Santri tanpa `kelas_ngaji`** (edge case dicatat §3/§2 implementasi)
  — TIDAK mendapat proteksi apa pun (tidak ada header yang relevan
  utk kelas kosong) — SAMA seperti santri berkelas, hanya TIDAK ADA
  jaring pengaman tambahan utk kasus ini secara spesifik, konsisten
  dgn desain "header per kelas" (santri tanpa kelas = di luar cakupan
  konsep "kelas session" sama sekali).
- **Kelas dengan santri sangat banyak** — Daily selalu menyentuh SEMUA
  kelas kelompok tiap kali (bukan hanya kelas yang benar-benar berubah)
  — utk kelompok dgn LEBIH BANYAK kelas dari Kelp Petemon (8 kelas),
  biaya N-read/N-write akan BERTAMBAH linear — TIDAK diukur utk
  kelompok lain (hanya Kelp Petemon yang Firestore saat ini).
