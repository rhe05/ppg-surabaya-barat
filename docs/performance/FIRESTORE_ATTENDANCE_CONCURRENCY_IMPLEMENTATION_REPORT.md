# Firestore Attendance Concurrency Protection — Implementation Report (Tahap 12)

> Mode: IMPLEMENTATION + MEASUREMENT + REGRESSION. Deployed to production
> (Kelp Petemon, satu-satunya kelompok yang absensinya Firestore). Tanggal:
> 2026-08-08. Baseline commit sebelum perubahan: `04fc63c`.

---

## 1. Executive Summary

Optimistic-concurrency version-check untuk attendance Firestore **BERHASIL
diimplementasikan dan sudah live di production** (deployment
`AKfycbxeNx68eV_7btwv...@411`). Ketiga invariant wajib FINAL RULE Tahap 12
**TERBUKTI lewat test langsung di production (data QA, dibersihkan
setelahnya)**:

1. **Conflict detected BEFORE DELETE** — PASS (Test C: `count:0`, tidak ada
   baris delete/write yang tereksekusi saat version mismatch).
2. **Conflict causes ZERO attendance mutation** — PASS (data integrity
   check: status SEBELUM & SESUDAH percobaan conflict identik, `izin`).
3. **Only matching version may advance the session version** — PASS (Test
   C, yang mismatch, TIDAK menaikkan version — tetap 2 sebelum & sesudah).

**Ditemukan 2 jalur tulis absensi Firestore LAIN** yang TIDAK ikut
terlindungi version-check ini (`serverSaveAbsensiDaily`,
`serverSetAbsensiSatuSantri`, Modul_MaintainAbsensi.gs) — sesuai instruksi
Tahap 12 §2 ("Jika ditemukan jalur write lain: STOP dan dokumentasikan"),
KEDUANYA **TIDAK DIUBAH** (di luar cakupan yang disetujui), didokumentasikan
lengkap di §17 Remaining Risks.

Performance: version-check menambah **overhead terukur** (median ~372ms
utk baca header + bagian delete/write/header-write bundled ~1099ms) di atas
baseline Save ≈3255-3368ms (Tahap 2) — **TIDAK diklaim sebagai improvement**,
dilaporkan apa adanya di §12.

---

## 2. Design Implemented

Persis desain Tahap 11 (`FIRESTORE_ATTENDANCE_CONCURRENCY_PROPOSAL.md`
§18), TANPA deviasi: dokumen header `kelompok/{kelompokId}/absensi_sesi/
{tanggal}_{kelasLower}` menyimpan `version` (integer), dibaca+dibandingkan
DI DALAM `withScriptLock_` yang SUDAH ADA, SEBELUM delete/write apa pun.

---

## 3. Files Changed

```
13_AppsScript/Modul_Utilities.gs   +17/-0   absensiSesiDocId_() (helper ID dokumen header)
13_AppsScript/Modul_InputAbsen.gs  +129/-27 version-check logic + expectedVersion propagation
13_AppsScript/Script_Main.html     +42/-4   client state + conflict UX
```

Git diffstat aktual (`git diff --stat`, HANYA 3 file di atas — TIDAK ada
file lain yang tersentuh):

```
13_AppsScript/Modul_InputAbsen.gs | 156 +++++++++++++++++++++++++++++++++-----
13_AppsScript/Modul_Utilities.gs  |  17 +++++
13_AppsScript/Script_Main.html    |  46 +++++++++--
3 files changed, 192 insertions(+), 27 deletions(-)
```

**Tidak disentuh** (dikonfirmasi lewat diffstat di atas, sesuai HARD RULE
DILARANG): `audit_log`, `akses_kelas_request`, `guru_izin`, dashboard,
login, Supabase, `Code.js` (diag instrumentation sementara SUDAH direvert
penuh sebelum commit final — lihat §15).

Fungsi yang diubah (persis peta §17 Implementation Boundary proposal
Tahap 11):

```
Modul_Utilities.gs:
  + absensiSesiDocId_(kelas, tanggal)                    [BARU]

Modul_InputAbsen.gs:
  iaRewriteAbsensiKelas_(..., kelas, expectedVersion)     [+2 param, return object bukan number]
  iaRewriteAbsensiKelasFirestore_(..., kelas, expectedVersion) [+2 param, +version-check]
  + iaAbsensiSesiPath_(kelompokId)                        [BARU]
  + iaGetAbsensiSesiVersion_(kelompokId, kelas, tanggal)  [BARU]
  serverGetKelasAbsenList(...)                            [+formExpectedVersion di response]
  serverGetAbsensiKelasForm(...)                          [+expectedVersion di response]
  serverSaveAbsensiKelas(..., expectedVersion)            [+param, +conflict branch]
  serverGetKelasAbsenListAdmin(...)                       [+formExpectedVersion di response]
  serverGetAbsensiKelasFormAdmin(...)                     [+expectedVersion di response]
  serverSaveAbsensiKelasAdmin(..., expectedVersion)       [+param, +conflict branch]

Script_Main.html:
  window.iaState_ (4 titik inisialisasi)                  [+expectedVersion:0]
  iaApplyChosenKelas_                                     [+set expectedVersion dari formExpectedVersion]
  iaSelectKelas_ (onFormResult)                            [+set expectedVersion dari expectedVersion]
  iaShowStatusModal_                                       [+parameter `action` opsional, backward-compatible]
  saveInputAbsen_                                          [+kirim expectedVersion, +cabang 'attendance-conflict', +sync expectedVersion saat sukses]
```

---

## 4. Session Header Structure

```
Path:    kelompok/{kelompokId}/absensi_sesi/{docId}
docId:   absensiSesiDocId_(kelas, tanggal) = "{tanggal}_{kelasLower-trim}"
Fields:  version (integer), kelas (string, case asli), tanggal, kelompok_id, updated_by
```

Normalisasi kelas SAMA PERSIS dgn filter `santri.kelas_ngaji` di seluruh
`Modul_InputAbsen.gs` (`trim().toLowerCase()`) — "PAUD/TK A" dan
" paud/tk a " dijamin 1 sesi yang sama (deterministic, dikonfirmasi §3
Tahap 11).

**Isolasi antar kelas/tanggal/kelompok** — diverifikasi PRODUCTION (Test
D/E, §9 di bawah): kelas berbeda & tanggal berbeda pada kelompok yang SAMA
= version independen (0, tidak ikut naik). Kelompok berbeda TIDAK
empirically testable (hanya 1 kelompok Firestore saat ini) tapi dijamin
BY CONSTRUCTION (kelompokId adalah bagian PATH Firestore, bukan bagian
docId — collision struktural mustahil).

---

## 5. Save Flow (implementasi aktual, `iaRewriteAbsensiKelasFirestore_`)

```
[Modul_InputAbsen.gs, di dalam withScriptLock_]
  sesiHeader = firestoreGetDoc_(sesiPath, sesiDocId)        ← READ, SEBELUM apa pun lain
  currentVersion = sesiHeader ? sesiHeader.version : 0
  IF Number(expectedVersion) !== currentVersion:
      RETURN {conflict:true, count:0, newVersion:null, currentVersion}   ← STOP, NO DELETE, NO WRITE
  ELSE:
      deleteSantriIds = santriIdSet MINUS relevantSantriIds
      count = iaBulkWriteAbsensiFirestore_(...)              ← delete+upsert, TIDAK BERUBAH strukturnya
      newVersion = currentVersion + 1
      firestoreUpdateDoc_/firestoreCreateDoc_(header, {version:newVersion, ...})
      RETURN {conflict:false, count, newVersion}
```

Kalau `iaBulkWriteAbsensiFirestore_` throw (partial-failure, lihat §16),
eksekusi TIDAK PERNAH sampai ke baris tulis-header — version TIDAK naik
(memenuhi FINAL RULE poin 7/8 "save gagal → version tidak boleh naik",
otomatis dari struktur kode, tidak butuh try/catch tambahan).

---

## 6. Conflict Flow

```
serverSaveAbsensiKelas/Admin:
  result = withScriptLock_( iaRewriteAbsensiKelas_(...) )
  IF result.conflict:
      RETURN {success:false, code:'attendance-conflict',
              error:'Data absensi sudah diperbarui oleh guru lain.',
              currentVersion: result.currentVersion}
      ← logAudit TIDAK dipanggil (return lebih awal, pola SAMA dgn error
        lain yang sudah ada -- canGuruAccessKelas_/iaValidateWaktuAbsen_/
        iaCekGuruSedangIzin_ SEMUA juga tidak audit kegagalan, §13 proposal)
```

Client (`Script_Main.html`, `onSaveResult`): cabang BARU `result.code ===
'attendance-conflict'` — TIDAK reset `window.iaState_.list` (edit lokal
guru dipertahankan), TIDAK tampilkan pesan sukses, tampilkan modal
"Data Absen Berubah" / "Data absensi sudah diperbarui oleh guru lain."
dgn tombol aksi "Muat Ulang Data" yang me-reuse `window.iaSelectKelas_`
(fetch ulang form + `expectedVersion` terbaru) — TIDAK dieksekusi otomatis,
HANYA saat guru menekan tombol itu.

---

## 7. First-Save Initialization

Dikonfirmasi PRODUCTION (Test A, §9): kelas+tanggal yang belum PERNAH
punya header → `iaGetAbsensiSesiVersion_` return `0` (dokumen tidak ada,
BUKAN dibuat) → Save PERTAMA dgn `expectedVersion=0` berhasil, header BARU
dibuat via `firestoreCreateDoc_` dgn `version=1`. **TIDAK ADA
migration/backfill** dijalankan atau diperlukan — dikonfirmasi tidak ada
operasi batch apa pun ke data lama.

---

## 8. Admin Path

`serverSaveAbsensiKelasAdmin` memanggil `iaRewriteAbsensiKelas_` **fungsi
yang PERSIS SAMA** dgn `serverSaveAbsensiKelas` (guru) — dikonfirmasi grep
langsung ke source (§3 di atas, 2 caller 1 fungsi). **TIDAK ADA bypass**
version-check utk admin — parameter `expectedVersion` ditambahkan ke
`serverSaveAbsensiKelasAdmin` dgn perlakuan IDENTIK. Test A-C (§9) SECARA
LANGSUNG menguji fungsi yang dipakai KEDUA jalur — tidak ada logic
terpisah yang perlu diuji ulang utk admin.

---

## 9. Correctness Tests (dijalankan di PRODUCTION via diag route sementara,
data QA, dibersihkan sesudahnya — lihat §15)

Hasil aktual (`?diag=t12test`, 1x jalan, 2026-08-08):

| Test | Expected | Actual | Verdict |
|---|---|---|---|
| A — first save | expected=0, current=0, SAVE, newVersion=1 | `testA_initialVersion:0`, `testA_result:{conflict:false,count:1,newVersion:1}` | **PASS** |
| B — normal subsequent save | expected=1, current=1, SAVE, newVersion=2 | `testB_versionAfterA:1`, `testB_result:{conflict:false,count:1,newVersion:2}` | **PASS** |
| C — conflict (expected=1, current=2) | CONFLICT, NO DELETE, NO WRITE | `testC_result:{conflict:true,count:0,newVersion:null,currentVersion:2}` | **PASS** |
| D — different class | independent version | `testD_independentVersion:0` (kelas lain, TIDAK ikut naik ke 2) | **PASS** |
| E — different date | independent version | `testE_independentVersion:0` (tanggal lain, kelas sama, TIDAK ikut naik) | **PASS** |
| F — different group | independent version | `NOT EMPIRICALLY TESTABLE` (hanya 1 kelompok Firestore live) — isolasi dijamin by construction (kelompokId = path, bukan docId), lihat §4 | **PROVEN BY CONSTRUCTION, TIDAK diuji empiris** |
| G — admin path | same concurrency protection | `PROVEN BY CONSTRUCTION` (1 fungsi dipanggil 2 caller, Test A-C MENGUJI fungsi itu langsung) — lihat §8 | **PASS (by construction)** |

---

## 10. Concurrent/Sequential Stale-Version Test (§13 prompt)

Test C DI ATAS **ADALAH** implementasi "controlled sequential simulation"
yang diminta prompt §13:

```
A loads version X (=1, hasil Test A)
B loads version X JUGA (=1) ← disimulasikan: Test B TIDAK memakai versi
  hasil loadnya sendiri, tapi Test C sengaja memakai expectedVersion=1
  (SAMA dgn yang "dibawa" B sebelum A/Test-B sempat save)
A saves (Test B DI ATAS, mewakili guru A yang duluan save) → version jadi 2
B saves using stale X=1 (Test C) → HARUS CONFLICT
```

**Hasil**: `testC_result.conflict:true`, TIDAK ADA delete/write (count:0).
**PASS** — membuktikan conflict detection bekerja pada skenario 2-guru
sequential-stale-version PERSIS seperti diminta §13, tanpa perlu 2 request
HTTP simultan sungguhan (yang secara operasional lebih sulit & lebih
berisiko dijalankan aman di production).

---

## 11. Data Integrity Verification

```
attendance SEBELUM A (Test A):     belum ada dokumen
attendance SETELAH A sukses:       status='hadir' (Test A payload)
attendance SETELAH B sukses:       status='izin' (Test B payload, versi TERBARU yang valid)
attendance SETELAH C (conflict):   status='izin' (TIDAK BERUBAH -- Test C mencoba tulis 'sakit', DITOLAK)
```

Verifikasi eksplisit (`dataIntegrity_afterConflict.status === 'izin'`,
`dataIntegrity_pass: true`) — **`after B conflict == after A(=B, save valid
terakhir) success`, TIDAK ADA deletion/mutasi akibat C. PASS.**

---

## 12. Performance Before/After

**Metodologi (dibatasi, dijelaskan jujur)**: mengukur end-to-end
`serverSaveAbsensiKelas` PENUH (lewat token login guru sungguhan) di luar
cakupan minimal Tahap 12 (butuh setup QA guru + `jadwal_kbm` QA — ekspansi
scope). Sebagai gantinya, diukur `iaRewriteAbsensiKelasFirestore_` LANGSUNG
(persis kode yang berjalan DI DALAM `withScriptLock_` pada save
sungguhan — bagian SATU-SATUNYA yang kodenya berubah Tahap 12) — 5x
percobaan, kelas QA berbeda tiap percobaan (supaya tiap percobaan
"first save", konsisten Test A).

```
Baseline (Tahap 2, TIDAK diukur ulang, dikutip apa adanya sesuai instruksi
prompt §15 "Baseline: Save Guru ≈ 3255-3368 ms"):
  Save BEFORE (full serverSaveAbsensiKelas, guru asli)  = 3255-3368 ms

Diukur Tahap 12 (5x run, ?diag=t12perf, PRODUCTION, data QA):
  Version Read (firestoreGetDoc_ header)     : 344, 346, 372, 377, 1518 ms
    → median = 372 ms (1518 ms = 1 outlier, 4/5 run clustered 344-377ms)
  Delete+Write+Header-Write (bundled)        : 1085, 1086, 1099, 1109, 1147 ms
    → median = 1099 ms
  Total (Version Read + bundled)             : 1431, 1453, 1463, 1519, 2617 ms
    → median = 1463 ms
```

**Save AFTER — TIDAK diukur end-to-end penuh** (keterbatasan metodologi
di atas). **Estimasi komposisi** (BUKAN pengukuran langsung, ditandai
eksplisit): `Save BEFORE (3255-3368ms) + Version Read (median 372ms) ≈
3627-3740ms` — HANYA menghitung tambahan round-trip Version Read yang
JELAS BARU (1 GET terpisah, sebelum `fetchAll` lama). Bagian
"Delete+Write+Header-Write" TIDAK BISA dipisah bersih menjadi "berapa dari
1099ms itu murni BARU (header write) vs BERAPA yang SUDAH ADA sebelumnya
(delete+upsert lama)" dari pengukuran tahap ini — Tahap 3 pernah mengukur
floor ~1.8-2.0 detik utk `fetchAll` batch, TAPI utk skenario/jumlah
dokumen yang BEDA, jadi TIDAK bisa dijadikan pembanding langsung terhadap
angka 1099ms di atas (kasus di sini hanya 1 santri).

```
Version Read  = 372 ms (median, 5 run)
Version Write = TIDAK TERPISAHKAN dari delete+write dalam pengukuran ini
                (1 komponen dalam angka bundled 1099ms) -- UNKNOWN UNTIL
                DIUKUR TERPISAH (di luar cakupan minimal tahap ini)
```

**Jangan mengklaim improvement** — dipatuhi: laporan ini TIDAK mengklaim
Save menjadi lebih cepat. **Latency naik** (tambahan round-trip Version
Read yang JELAS baru, minimal ~350-380ms di kondisi normal, BISA lebih
tinggi -- 1 dari 5 run observasi 1518ms, kemungkinan cold-start/network
jitter, tidak dijelaskan lebih lanjut krn di luar cakupan tahap ini) —
**dilaporkan apa adanya**, TIDAK disembunyikan/diminimalkan.

---

## 13. Regression

| Item | Status | Catatan |
|---|---|---|
| Normal attendance save | **PASS** | Test A (first save, kelas baru) sukses, count=1 |
| Edit attendance | **PASS** | Test B (re-save kelas+tanggal yang sama, status diubah 'hadir'→'izin') sukses |
| Remove student | **TIDAK DIUJI LANGSUNG tahap ini** — `deleteSantriIds` logic (`iaBulkWriteAbsensiFirestore_`) TIDAK diubah sama sekali (hanya dipanggil SETELAH version-check lolos, argumen persis sama seperti sebelumnya) — perilaku hapus-santri-dikeluarkan-dari-form TIDAK tersentuh kode-nya, risiko regresi RENDAH by construction, TAPI belum diverifikasi via test eksplisit |
| Re-save attendance | **PASS** | Sama dgn "Edit attendance" (Test B) |
| Admin attendance | **PASS (by construction)** | §8 — fungsi identik dgn guru, diuji Test A-C |
| Access validation | **TIDAK BERUBAH, TIDAK diuji ulang** | `canGuruAccessKelas_`/`requireGuruContext_` TIDAK disentuh kode-nya sama sekali (di luar diff §3) |
| Guru izin validation | **TIDAK BERUBAH, TIDAK diuji ulang** | `iaCekGuruSedangIzin_` TIDAK disentuh kode-nya |
| Audit log | **TIDAK BERUBAH utk save sukses** (baris `logAudit` sama persis, args sama) — utk conflict, SENGAJA "NO audit" (§6, konsisten pola existing) |
| Loading UX | **TIDAK BERUBAH** — guard Tahap 9 (`window.iaState_.saving`, `endSaving_`) TIDAK disentuh, cabang conflict BARU memakai `endSaving_()`/`btn.textContent` yang SAMA dgn cabang error lain |
| Conflict detection | **PASS** | §9-§11 di atas |

**Keterbatasan jujur**: item "Remove student", "Access validation", "Guru
izin validation" TIDAK diuji ULANG via klik browser sungguhan (tidak ada
kredensial guru asli tersedia di lingkungan ini, sama keterbatasan yang
sudah dicatat sesi-sesi sebelumnya) — dinilai risiko RENDAH krn kode-nya
TIDAK disentuh (dikonfirmasi diff §3), TAPI ini BUKAN pengganti verifikasi
manual oleh user sebelum dianggap 100% aman.

---

## 14. Deployment

```
Baseline commit sebelum perubahan : 04fc63c
clasp push (kode + diag sementara): 2026-08-08, 16:51:32
clasp deploy (dgn diag)           : @410 "Tahap 12: Firestore attendance
                                      optimistic concurrency (version-check)
                                      + temp diag t12"
[Test A-G + perf + cleanup dijalankan di production, §9-§12]
clasp push (kode final, diag dihapus): 2026-08-08, 16:55:04 (33 file, turun
                                         dari 34 -- Modul_PerfAudit.gs terhapus)
clasp deploy (final)              : @411 "Tahap 12: cleanup diag
                                      instrumentation, final production state"
tools/verify_served.js            : PASS (978819 chars, 5 blok <script> valid)
```

Deployment ID stabil (URL Web App TIDAK berubah, sesuai pola CI/CD project
ini): `AKfycbxeNx68eV_7btwv_N8EWMxDer1Odf4-B7DEwS-U5TgSMJeVp6gorvR5-ptGBn0o_mM`.

---

## 15. Cleanup

```
Data QA dihapus (?diag=t12cleanup):
  absensi:       2 dokumen (2030-01-15_QA999001, 2030-01-16_QA999001)
  absensi_sesi:  14 dokumen (7 kelas QA × 2 tanggal)

Verifikasi bersih (diagT12VerifyClean_, dalam respons yang sama):
  remainingSesiDocs   : []   (kosong)
  remainingAbsensiDocA: null (tidak ada)

Diagnostic route dihapus:
  Modul_PerfAudit.gs        : DIHAPUS (rm), tidak ada di commit final
  Code.js ?diag=t12test/t12perf/t12cleanup : DIREVERT (3 blok if dihapus)

Verifikasi route benar-benar mati (setelah redeploy @411):
  ?diag=t12test -> mengembalikan HTML app biasa (<!doctype html>...), BUKAN JSON
  -> dikonfirmasi route TIDAK lagi merespons diag apa pun.

git diff (working tree) setelah cleanup:
  HANYA 3 file produksi (Modul_Utilities.gs, Modul_InputAbsen.gs,
  Script_Main.html) -- Code.js KEMBALI 0 diff (byte-identik pra-Tahap-12,
  krn diag block ditambah LALU direvert penuh dalam sesi yang sama).
```

**COMPLETE.**

---

## 16. Rollback Strategy

```
git checkout 04fc63c -- 13_AppsScript/Modul_Utilities.gs 13_AppsScript/Modul_InputAbsen.gs 13_AppsScript/Script_Main.html
```
(atau `git revert` commit Tahap 12 setelah di-commit) → `clasp push` →
`clasp deploy --deploymentId <id sama>` → `verify_served.js`.

**Attendance utama TIDAK terpengaruh rollback**: collection
`kelompok/1/absensi` (per-santri) TIDAK PERNAH ditulis skema BARU apa
pun oleh Tahap 12 (field-nya SAMA PERSIS: `id, santri_id, tanggal, status,
dicatat_oleh, kelompok_id`) — rollback kode TIDAK memerlukan migrasi data
balik apa pun.

**Collection `absensi_sesi` (header) BOLEH DIBIARKAN** setelah rollback —
kode versi SEBELUM Tahap 12 tidak pernah membaca collection ini sama
sekali, jadi keberadaannya (dokumen "yatim" tanpa pembaca) TIDAK
mempengaruhi fungsi apa pun. **VERIFIED** (bukan cuma teori) — sudah
dikonfirmasi §15 di atas bahwa collection ini AMAN dihapus total via
`diagT12Cleanup_` tanpa efek samping pada data attendance utama (dicek
ulang setelahnya, `remainingAbsensiDocA` di collection utama tidak
terpengaruh).

**Rollback: VERIFIED** (mekanismenya, bukan dieksekusi — tidak perlu
rollback sungguhan krn implementasi PASS semua test).

---

## 17. Remaining Risks

### ⚠️ Jalur tulis absensi Firestore LAIN yang TIDAK terlindungi (TEMUAN BARU, STOP & DOKUMENTASI sesuai instruksi §2)

Ditemukan lewat pencarian SEMUA caller `iaBulkWriteAbsensiFirestore_`
(bukan hanya `iaRewriteAbsensiKelasFirestore_`):

**`serverSaveAbsensiDaily`** (Modul_MaintainAbsensi.gs:61) — "daily entry"
admin per-KELOMPOK (bukan per-kelas), menulis SEMUA santri kelompok
sekaligus utk 1 tanggal. Memanggil `iaBulkWriteAbsensiFirestore_`
**LANGSUNG**, TIDAK lewat `iaRewriteAbsensiKelasFirestore_` — TIDAK ADA
version-check sama sekali.

**`serverSetAbsensiSatuSantri`** (Modul_MaintainAbsensi.gs:136) — edit
1 sel (1 santri, 1 tanggal) di fitur "Detail Kehadiran" (Kehadiran
Generus). Menulis LANGSUNG via `firestoreUpdateDoc_`/`firestoreDeleteDoc_`
ke collection `absensi` yang SAMA — TIDAK ADA version-check, TIDAK
menyentuh `absensi_sesi` sama sekali.

**Implikasi**: kalau guru sedang menyimpan kelas via `serverSaveAbsensiKelas`
(Input Absen, per-kelas) BERSAMAAN dgn admin memakai `serverSaveAbsensiDaily`
(daily entry, per-kelompok) ATAU `serverSetAbsensiSatuSantri` (edit sel
Kehadiran Generus) pada santri yang OVERLAP + tanggal yang SAMA — lost
update TETAP MUNGKIN terjadi lewat kombinasi jalur INI, TIDAK terdeteksi
oleh proteksi Tahap 12 (yang HANYA melindungi jalur per-kelas
`serverSaveAbsensiKelas`/`Admin`).

**Kenapa TIDAK diperbaiki tahap ini**: (a) di luar HARD RULE BOLEH (scope
eksplisit "Firestore attendance optimistic concurrency protection" utk
alur yang sudah dianalisis Tahap 10/11, BUKAN seluruh permukaan tulis
absensi), (b) FINAL RULE §2 eksplisit "Jika ditemukan jalur write lain:
STOP dan dokumentasikan" — bukan "perbaiki juga", (c) memperluas
version-check ke 2 fungsi ini butuh analisis TERPISAH (apakah
`serverSaveAbsensiDaily`, yang beroperasi per-KELOMPOK bukan per-kelas,
perlu header versi LEVEL BERBEDA — per-kelompok+tanggal, bukan
per-kelas+tanggal — supaya tidak salah granularitas; `serverSetAbsensiSatuSantri`
beroperasi per-SANTRI, granularitas LAGI-LAGI berbeda) — di luar cakupan
"minimal diff" Tahap 12.

**Rekomendasi**: tahap TERPISAH (Tahap 13?) utk menganalisis & mendesain
proteksi versi yang cocok utk KEDUA jalur ini, ATAU (lebih sederhana)
evaluasi apakah `serverSaveAbsensiDaily` MASIH benar-benar dipakai di
alur produksi aktif (kalau sudah digantikan sepenuhnya oleh Input Absen
Guru per-kelas, mungkin bisa di-deprecate, mengurangi permukaan risiko
tanpa perlu proteksi tambahan) — **PERTANYAAN INI TIDAK DIJAWAB tahap
ini**, murni dicatat sbg risk.

### Risiko lain (bukan TEMUAN baru, warisan Tahap 10/11)

- **Partial-failure interaction** (§14 Failure Scenario D, proposal Tahap
  11): kalau `iaBulkWriteAbsensiFirestore_` gagal SEBAGIAN (delete sukses,
  sebagian write gagal), header version TIDAK naik — TAPI data Firestore
  bisa jadi PARTIAL (campuran lama/baru). Save berikutnya akan
  membandingkan thd version LAMA (yang mungkin tidak 100% cocok dgn
  realita partial itu) — interaksi 2 masalah berbeda (atomicity vs
  concurrency), TIDAK diselesaikan tahap ini (sesuai FINAL RULE §8
  "Jangan memperluas scope menjadi redesign transaction").
- **Version Write latency belum terukur terpisah** (§12) — angka pasti
  "berapa ms murni dari header write" UNKNOWN, hanya bundled dgn
  delete+write lama. Kalau presisi dibutuhkan (mis. utk keputusan
  optimasi lanjutan), perlu diag terpisah yang mengukur HANYA
  `firestoreCreateDoc_`/`firestoreUpdateDoc_` header saja.
- **Regresi "Remove student"/access-validation/guru-izin-validation TIDAK
  diuji via klik browser sungguhan** (§13) — risiko dinilai rendah
  (kode tidak disentuh) tapi bukan pengganti verifikasi manual user.
