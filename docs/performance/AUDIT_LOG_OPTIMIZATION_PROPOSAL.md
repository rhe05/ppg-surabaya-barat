# Proposal Optimasi — `audit_log` (Tahap 4)

> Mode: **INVESTIGATION ONLY**. Tidak ada kode/data/schema yang diubah pada
> dokumen ini. Semua temuan dari pembacaan kode langsung + data pengukuran
> yang SUDAH ADA (Tahap 2/3) — tidak ada instrumentasi baru dijalankan
> (lihat §8, tidak dibutuhkan approval krn tidak ada perubahan production).
> Tanggal: 2026-08-08.

---

## 1. Executive Summary

`audit_log` (±572ms median di dalam transaksi Save Attendance, ~15% dari
Save Total 3892ms) adalah tabel **append-only, 100% Google Sheets** (tidak
pernah masuk `FIRESTORE_TABLES_`, yang saat ini KOSONG — lihat §2), dibaca
HANYA di 1 tempat di SELURUH codebase: di dalam `generateId(AUDIT_LOG)`
sendiri, untuk menghitung `MAX(id)+1`. **Tidak ada fitur lain (dashboard,
laporan, export, UI) yang membaca isi `audit_log` sama sekali** —
dikonfirmasi lewat pencarian menyeluruh, bukan asumsi (§5/§6).

Temuan tambahan yang PENTING dan TIDAK diminta eksplisit tapi relevan kuat
utk keputusan: `logAudit()` (dan karenanya `generateId(AUDIT_LOG)`)
dipanggil **DI LUAR `withScriptLock_`** di **SEMUA ±40 titik panggilan**
di codebase (dikonfirmasi via pembacaan `serverSaveAbsensiKelas` +
sampling caller lain, §9/§10/§11) — ini bertentangan dengan aturan
permanen project sendiri yang ditetapkan di `ERROR_LOG.md #5`
("`generateId` = max(id)+1 tanpa lock → dua pengguna menyimpan bersamaan
dapat id SAMA" — fix sistemik `withScriptLock_` + "id-dalam-lock" 2026-07-17,
diterapkan ke SEMUA mutasi Guru/Santri/Jadwal KBM/Pengumuman, **TAPI TIDAK
KE `logAudit` ITU SENDIRI**). Artinya `audit_log` MEMILIKI race-condition
duplicate-ID yang SUDAH ADA SEBELUM Tahap 4 ini, independen dari
pertanyaan performa.

Karena **tidak ada dependency apa pun** terhadap nilai/urutan id
`audit_log` (§3/§6), kandidat optimasi yang menghilangkan `MAX(id)+1`
(mis. UUID) berpotensi **sekaligus** menghilangkan biaya full-scan DAN
memperbaiki race-condition yang sudah ada — jarang terjadi 1 perubahan
kecil memperbaiki performa & correctness bersamaan. **Namun sesuai mode
tahap ini, TIDAK ADA implementasi dilakukan** — lihat §14 Decision.

---

## 2. Current Architecture

- `audit_log` **TIDAK PERNAH** masuk `FIRESTORE_TABLES_`
  (`Modul_Utilities.gs:57` — array ini **KOSONG**: `const FIRESTORE_TABLES_
  = [];`) maupun `FIRESTORE_KELOMPOK_TABLES_` (`Modul_Utilities.gs:71-77`,
  hanya berisi `santri`/`guru`/`jadwal_kbm`/`jadwal_kategori_hari`/`absensi`
  utk Kelp Petemon). `audit_log` selalu 100% Google Sheets, utk SEMUA
  kelompok, TIDAK ADA rencana migrasi Firestore yang aktif untuknya.
- Skema: `createSheetIfNotExists(ss, 'audit_log', ['id', 'table_name',
  'record_id', 'action', 'user_id', 'timestamp', 'detail_perubahan'])`
  (`Setup_Database.gs:55`) — **7 kolom**.
- Baca sheet SELALU lewat `getDataRange().getValues()`
  (`readSheetRowsRaw_`, `Modul_Utilities.gs:131-152`) — **1 panggilan
  Sheets API** (bukan row-by-row), sudah O(1) dari sisi jumlah API call,
  TAPI ukuran payload yang ditransfer per panggilan itu tumbuh linear
  terhadap jumlah baris (429 baris × 7 kolom saat ini).
- Tulis SELALU lewat `sheet.appendRow(values)`
  (`appendRowToSheet`, `Modul_Utilities.gs:240-253`) — **1 panggilan
  Sheets API** per baris baru.

---

## 3. Current `audit_log` Flow

| Stage | File:Line | Operation |
|---|---|---|
| Save | `Modul_InputAbsen.gs:635` (dalam `serverSaveAbsensiKelas`) | Panggil `logAudit('absensi', 'kelas_'+kelas+'_'+tanggal, 'create', ctx.user.id, ...)` — **DI LUAR `withScriptLock_`** (lock berakhir di baris 633, `logAudit` baris 635) |
| logAudit | `Modul_MaintainSantri.gs:278-283` | `function logAudit(tableName, recordId, action, userId, detail) { const id = generateId(SHEET_NAMES.AUDIT_LOG); const timestamp = new Date().toISOString(); appendRowToSheet(SHEET_NAMES.AUDIT_LOG, [id, tableName, recordId, action, userId, timestamp, detail]); }` |
| generateId | `Modul_Utilities.gs:405-410` | `function generateId(sheetName) { const objects = readSheetAsObjects(sheetName); if (objects.length===0) return 1; const maxId = Math.max(...objects.map(o=>parseInt(o.id)\|\|0)); return maxId+1; }` |
| Full read | `Modul_Utilities.gs:172-200` (`readSheetAsObjects`) → `Modul_Utilities.gs:131-152` (`readSheetRowsRaw_`) | `sheet.getDataRange().getValues()` — 1 panggilan Sheets API, transfer SELURUH 429×7 sel, lalu filter+map jadi array of object di memori Apps Script |
| MAX(id) | `Modul_Utilities.gs:408` | `Math.max(...objects.map(...))` — operasi memori murni, biaya diabaikan (<1ms utk 429 elemen) |
| appendRow | `Modul_Utilities.gs:251` (`appendRowToSheet`, cabang Sheets — `audit_log` bukan `FIRESTORE_TABLES_` jadi selalu masuk cabang ini) | `sheet.appendRow(values)` — 1 panggilan Sheets API |

**Ringkas**: `logAudit()` = **2 panggilan Sheets API total** (1 read penuh
+ 1 append), TIDAK ADA loop/panggilan berulang per baris. Biaya bukan dari
banyaknya PANGGILAN API (sudah O(1)), tapi dari UKURAN payload panggilan
read pertama yang tumbuh linear terhadap jumlah baris `audit_log`.

---

## 4. `generateId()` Dependency Analysis

1. **Mengapa ID harus `MAX(id)+1`?** — Konvensi konsisten dgn SEMUA tabel
   lain di project ini (santri, guru, dst — semua pakai pola sama,
   `Modul_Utilities.gs:405-410`, 1 implementasi generik dipakai bersama).
   Tidak ada alasan KHUSUS utk `audit_log` — ini murni WARISAN pola
   generik yang sama, bukan requirement audit_log secara spesifik.
2. **Apakah ID harus sequential?** — **NO DEPENDENCY FOUND.** Tidak ada
   kode yang mengurutkan/membandingkan `audit_log.id` sbg sequence
   (timestamp ISO 8601 sudah ada di kolom terpisah utk urutan waktu kalau
   dibutuhkan suatu saat).
3. **Apakah ID dipakai sebagai foreign key?** — **NO DEPENDENCY FOUND.**
   Tidak ada tabel lain yang menyimpan referensi ke `audit_log.id`.
4. **Apakah ada fungsi lain yang mencari `audit_log` berdasarkan ID?** —
   **NO DEPENDENCY FOUND** (lihat §5 — pembacaan `audit_log` HANYA di
   dalam `generateId` sendiri, tidak ada `find`/`filter` by id di tempat
   lain).
5. **Apakah ID ditampilkan kepada user?** — **NO DEPENDENCY FOUND** —
   dikonfirmasi grep `audit_log`/`auditLog`/`Audit Log` di seluruh
   `Script_Main.html`/`Markup_Screens.html` = 0 hasil. Tidak ada layar UI
   yang menampilkan riwayat audit.
6. **Apakah ada laporan/export yang bergantung pada urutan ID?** —
   **NO DEPENDENCY FOUND** — tidak ada fungsi `serverExport*`/`serverGet*Laporan*`
   yang mereferensikan `AUDIT_LOG`.
7. **Query `WHERE id = ...`?** — **NO DEPENDENCY FOUND.**
8. **Dependency terhadap monotonic/sequential ID?** — **NO DEPENDENCY
   FOUND.** Kesimpulan keseluruhan §4: `audit_log.id` adalah **primary
   key murni internal**, tidak pernah dibaca/dirujuk oleh kode lain
   SELAIN `generateId` itu sendiri saat menghitung nilai berikutnya.

---

## 5. All Callers (`logAudit`)

Repository-wide search `logAudit(` — **40 titik panggilan, 16 modul**:

| Caller (fungsi) | Feature/Module | Frequency (perkiraan kualitatif, TIDAK diukur) | Critical Path? |
|---|---|---|---|
| `serverSaveAbsensiKelas` | Input Absen (guru) | Tinggi (tiap Simpan Absen) | **YES** — di jalur yang diukur Tahap 2/3 |
| `serverSaveAbsensiKelasAdmin` | Input Absen (admin override) | Rendah (jarang dipakai) | YES (jalur admin, sama fungsi) |
| `serverSubmitGuruIzin` | Guru Izin | Rendah | Tidak diukur, di luar cakupan |
| `serverAddGuru`/`serverUpdateGuru`/`serverDeleteGuru` | CRUD Guru | Rendah-Sedang | Tidak |
| `serverSaveAbsensiDaily`/edit-1-sel/bulk-import (`Modul_MaintainAbsensi.gs`) | Absensi (desktop admin) | Sedang | Tidak (di luar cakupan Guru Mobile) |
| `serverAdd/Update/DeleteCalendarEvent` | Kalender Akademik | Rendah | Tidak |
| `serverAdd/Update/Delete/BulkImportKonseling` | Bimbingan Konseling | Rendah | Tidak |
| `serverAdd/Update/DeleteMunaqosah` | Munaqosah | Rendah | Tidak |
| `serverAdd/Update/DeleteJadwalKBM`, kategori hari | Jadwal KBM | Rendah | Tidak |
| `serverAdd/Update/DeletePengumuman` | Pengumuman | Rendah | Tidak |
| `serverUpsertPengurus`/`serverDeletePengurus` | Data Pengurus | Rendah | Tidak |
| `serverUpload/DeleteFile` | Pusat Unduhan | Rendah | Tidak |
| `serverAdd/Update/DeleteSiklusGenerus` | Siklus Generus | Rendah | Tidak |
| `serverAdd/Update/DeleteSantri`, bulk import | CRUD Santri | Sedang | Tidak |
| `serverAddQuote`/`serverDeleteQuote` | Kelola Quote | Rendah | Tidak |

**Catatan Frequency**: kolom ini **kualitatif** (berdasarkan seberapa
sering fitur itu dipakai secara natural dalam alur kerja TPQ — Input Absen
dipakai TIAP HARI oleh tiap guru, CRUD master data jauh lebih jarang) —
**BUKAN** angka terukur (tidak ada log akses per-fungsi yang bisa dibaca
tanpa instrumentasi baru). Menandai `NOT MEASURED` utk frequency numerik.

**Dampak lintas-aplikasi kalau mekanisme ID diubah**: `logAudit()` adalah
**1 fungsi tunggal** yang dipakai SEMUA 40 caller di atas — perubahan pada
`generateId(AUDIT_LOG)` ATAU pada `logAudit()` sendiri otomatis berlaku
utk SEMUA fitur ini SEKALIGUS (tidak perlu ubah 40 titik panggilan
individual, krn caller tidak pernah memakai return value `logAudit()` —
dikonfirmasi tidak ada satu pun `= logAudit(...)` di seluruh grep).

---

## 6. All Readers

**Hasil pencarian `readSheetAsObjects(SHEET_NAMES.AUDIT_LOG)` /
`readSheetAsObjects('audit_log')` di seluruh `13_AppsScript/`: SATU
hasil — di dalam `generateId()` sendiri (`Modul_Utilities.gs:406`, dipanggil
dari `generateId(SHEET_NAMES.AUDIT_LOG)` di `logAudit`).**

### READ BY ID
**TIDAK ADA** — tidak ditemukan kode yang mencari 1 baris `audit_log`
spesifik berdasarkan id.

### FULL/HISTORY READ
**HANYA 1**: di dalam `generateId()`, dan HANYA untuk menghitung
`MAX(id)+1` — bukan untuk ditampilkan/dianalisis/diekspor. Tidak dipakai
dashboard, laporan, audit history viewer, filtering, troubleshooting UI,
atau export apa pun.

**Kesimpulan §6**: `audit_log` adalah **append-only historical data yang
TIDAK PERNAH dibaca kembali oleh fitur apa pun** — satu-satunya "pembaca"
adalah mekanisme internal penghitung ID berikutnya. Ini **kandidat kuat**
sesuai kriteria yang diminta prompt ("Jika `audit_log` hanya append-only
historical data dan tidak pernah digunakan sebagai sequence source oleh
fitur lain, catat sebagai kandidat penting").

---

## 7. Current Data Size

```
Current row count = 429   (diukur real, ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md §13, 5× pengukuran, KONSTAN di semua run)
Column count       = 7     (Setup_Database.gs:55 — id, table_name, record_id, action, user_id, timestamp, detail_perubahan)
Approx payload      = ~429 × 7 = 3.003 sel ditransfer per full read — UKURAN BYTE PERSIS TIDAK DIUKUR (perkiraan kasar: rata-rata ~20-80 karakter/sel tergantung kolom (`timestamp` ISO ~24 char, `detail_perubahan` bervariasi bebas) → total transfer kemungkinan puluhan KB, TIDAK DIUKUR PRESISI)
```

**Pertumbuhan latency vs ukuran tabel (100/200/300/400/429 baris)**:
`DATA TIDAK TERSEDIA` — hanya ADA 1 snapshot ukuran (429 baris, saat ini).
Tidak ada data historis ukuran tabel di titik lain, dan TIDAK BOLEH
membuat data dummy production utk mengujinya (sesuai hard rule). Yang
BISA dinyatakan dari bukti tidak langsung: `getDataRange().getValues()`
adalah operasi yang SECARA UMUM (dokumentasi Google Apps Script &
pengalaman project ini di modul lain — mis. `readSheetAsObjects` generik
utk tabel besar lain di app ini) **tumbuh terhadap ukuran data**, jadi
SECARA LOGIKA arsitektur (bukan pengukuran langsung di titik data
berbeda) latency `generateId(AUDIT_LOG)` **akan terus naik** seiring
`audit_log` bertambah (ditulis oleh SEMUA 40 caller di §5, tidak pernah
dibersihkan/di-archive) — pola PERSIS yang sudah "disembuhkan" utk
`absensi` (`ERROR_LOG.md #22`) tapi belum utk `audit_log`.

---

## 8. Latency Analysis

Breakdown granular (`readSheetAsObjects` vs `getValues` vs konversi
object vs `MAX(id)` vs `appendRow`) TIDAK tersedia dari data yang sudah
ada — instrumentasi Tahap 2 HANYA mengukur `auditLogMs` GABUNGAN (scan
`generateId` + `appendRowToSheet`, `Modul_InputAbsen.gs` versi
terinstrumentasi Tahap 2, SUDAH di-revert) dan, terpisah, `AUDIT_LOG_SCAN_MS`
(scan SAJA, via diag route khusus Tahap 2, JUGA sudah di-revert).

```
audit_log total (scan+append, di dalam transaksi Save nyata) = 572 ms median (ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md §5)
├── readSheetAsObjects (scan SAJA, diukur terpisah/standalone)  = 601 ms median (§13, 5 run: 601/505/722/610/540)
├── getValues / sheet read (bagian DALAM readSheetAsObjects)    = NOT MEASURED (tidak dipisah dari readSheetAsObjects secara terpisah)
├── object conversion (filter+map di memori)                    = NOT MEASURED (secara logika <1ms utk 429 baris — operasi in-memory murni, TIDAK ada bukti pengukuran langsung)
├── MAX(id) (Math.max atas 429 angka)                            = NOT MEASURED (secara logika <1ms, operasi in-memory murni)
└── appendRow (1 panggilan Sheets API)                           = NOT MEASURED terpisah dari total (perkiraan kasar dari selisih 572-601=... TIDAK VALID krn kedua angka dari SESI PENGUKURAN BERBEDA (satu di dalam transaksi Save nyata, satu standalone) — TIDAK BISA dikurangkan langsung, akan mengarang angka. Ditulis NOT MEASURED apa adanya.)
```

**Sesuai instruksi eksplisit**: tidak dilakukan instrumentasi baru pada
tahap ini (akan menjadi perubahan production code, butuh approval
terpisah) — breakdown granular lebih lanjut dari `readSheetAsObjects` vs
`appendRow` murni **NOT MEASURED**, bukan diasumsikan/dikarang.

**Kesimpulan yang BISA dinyatakan dgn evidence yang ADA**: mayoritas
biaya `logAudit()` (≥85% berdasarkan §13 scan-saja 601ms vs total
gabungan 572-644ms di berbagai sampel — angka scan SAJA kadang MELEBIHI
angka gabungan krn keduanya dari sesi/kondisi jaringan berbeda, TAPI
keduanya sama-sama menunjukkan skala ratusan ms yang SAMA) berasal dari
`readSheetAsObjects(AUDIT_LOG)` (full scan), BUKAN dari `appendRow`
(operasi append 1-baris yang secara arsitektur jauh lebih murah — pola
yang SAMA sudah terbukti di seluruh app ini, append tunggal selalu jauh
lebih cepat dari full-table read).

---

## 9. Concurrency Analysis

**Skenario** (sesuai contoh prompt):
```
Guru A → Save Attendance   (memicu logAudit setelah lock lepas)
Guru B → Save Attendance   (memicu logAudit setelah lock lepas)
Admin  → Edit Santri       (memicu logAudit setelah lock lepas)
Guru C → Save Attendance   (memicu logAudit setelah lock lepas)
```

**Trace `withScriptLock_`** (`Modul_Utilities.gs:462-472`, versi
production SAAT INI setelah revert Tahap 2 — dikonfirmasi via `git diff`
kosong terhadap versi sebelum instrumentasi):
```js
function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { throw new Error(...); }
  try { return fn(); } finally { lock.releaseLock(); }
}
```

**Race condition ANALYSIS (skenario prompt)**:
```
Request A: withScriptLock_ (tulis absensi) → LEPAS LOCK → logAudit() → generateId() baca MAX=429
Request B: (mulai kapan saja, TIDAK menunggu lock A krn logAudit A sudah DI LUAR lock)
           withScriptLock_ (tulis absensi) → LEPAS LOCK → logAudit() → generateId() baca MAX=429 (SAMA!)
Request A: appendRow([430, ...])
Request B: appendRow([430, ...])   ← ID GANDA, DUA BARIS DGN id=430
```

**Apakah kondisi ini MUNGKIN terjadi dengan locking existing?** **YA,
MUNGKIN** — karena `logAudit()` (dan `generateId(AUDIT_LOG)` di
dalamnya) dipanggil **SETELAH** blok `withScriptLock_` selesai/lock
sudah dilepas (`Modul_InputAbsen.gs:631-635` — lock lepas baris 633,
`logAudit` baris 635), **TIDAK ADA proteksi lock APA PUN** yang mencegah
2 eksekusi (dari Guru A, Guru B, Admin, Guru C — SEMUA 40 caller di §5)
memanggil `generateId(AUDIT_LOG)` HAMPIR BERSAMAAN dan membaca `MAX(id)`
yang SAMA sebelum salah satunya sempat `appendRow`.

**Ini BUKAN temuan baru murni** — `ERROR_LOG.md #5` (2026-07-17) SUDAH
mendokumentasikan persis pola bug ini secara umum ("`generateId` =
max(id)+1 tanpa lock → dua pengguna menyimpan bersamaan dapat id SAMA")
dan fix sistemiknya (`withScriptLock_` + id-dalam-lock) SUDAH diterapkan
ke SEMUA mutasi tabel utama (Guru/Santri/Jadwal KBM/Pengumuman/dst — lihat
pola `serverAddGuru` yg mengikuti "lock + id-dalam-lock"). **TAPI
`logAudit()` ITU SENDIRI TIDAK PERNAH ikut diperbaiki** — kemungkinan
karena dianggap "bukan data kritis" (append-only log, bukan record yang
di-edit/dihapus kembali), TAPI tetap berisiko id GANDA (dua baris log
dgn id sama, walau isinya beda) kalau 2 mutasi (fitur mana pun dari §5,
tidak harus sama-sama Absensi) terjadi hampir bersamaan.

**Dampak duplicate id `audit_log`**: karena `audit_log.id` TIDAK PERNAH
dibaca ulang oleh siapa pun (§4/§6), duplicate id di `audit_log` **TIDAK
menyebabkan bug fungsional yang terlihat pengguna** (beda dgn tabel lain
spt `santri`/`guru` yang di-edit/dihapus by-id — di situ duplicate id
BISA bikin "edit/hapus mengenai data yang salah", persis kekhawatiran asli
ERROR_LOG #5). Untuk `audit_log` spesifik, dampaknya HANYA kosmetik
(kolom `id` tidak lagi unik sbg audit trail), bukan korupsi data
fungsional — TAPI tetap best practice yang seharusnya diikuti sesuai
aturan permanen project sendiri.

---

## 10. Lock Analysis

| Fungsi | Di dalam lock? | Lock yang dipakai |
|---|---|---|
| `serverSaveAbsensiKelas` (tulis absensi) | **YA** — `withScriptLock_` membungkus `iaRewriteAbsensiKelas_` SAJA (`Modul_InputAbsen.gs:631-633`) | `LockService.getScriptLock()` (global, 1 aplikasi) |
| `logAudit()` (caller: `serverSaveAbsensiKelas`, baris 635) | **TIDAK** — dipanggil SETELAH blok lock berakhir | Tidak pakai lock APA PUN |
| `generateId(AUDIT_LOG)` (di dalam `logAudit`) | **TIDAK** (konsekuensi dari atas) | Tidak pakai lock |

Pola ini **KONSISTEN di semua ±40 caller `logAudit`** (dikonfirmasi
sampling: `Modul_MaintainGuru.gs` — `logAudit` dipanggil setelah
`withScriptLock_(function(){...})` block yang membungkus tulis
guru/santri selesai, pola yang SAMA persis).

**Kesimpulan §10/§11**: `generateId(AUDIT_LOG)` **TIDAK PERNAH** dilindungi
lock di seluruh codebase — bukan spesifik ke fungsi absensi saja. Ini
konsisten dgn temuan §9 (race condition sudah ada, sistemik, bukan
kasus khusus).

---

## 11. Correctness Contract (WAJIB dipertahankan apa pun opsi yang dipilih)

- Semua audit event **tetap tercatat** — tidak boleh ada `logAudit()` call
  yang silently gagal/di-skip.
- **Urutan timestamp** tetap valid (`timestamp` kolom terpisah, ISO 8601,
  TIDAK bergantung pada `id` — aman, kolom ini independen dari skema id).
- **ID existing (429 baris lama) tidak berubah** — apa pun skema ID baru
  dipilih, HANYA berlaku utk baris BARU, baris lama tetap dgn id integer
  sequential aslinya (tidak perlu migrasi krn tidak ada yang membaca id).
- **Historical records tidak berubah** — TIDAK ADA operasi UPDATE/DELETE
  pada `audit_log` di TIAP proposal opsi (§12) — semua append-only.
- **Caller tidak rusak** — `logAudit(tableName, recordId, action, userId,
  detail)` **signature TIDAK BOLEH berubah** (40 caller memanggilnya
  dengan signature ini, tidak pakai return value — aman diubah internal
  selama signature dipertahankan).
- **Append tidak hilang** — mekanisme baru HARUS tetap menulis 1 baris
  baru per panggilan `logAudit`, tidak boleh drop/batch-delay tanpa
  jaminan tertulis.
- **Concurrent mutation tetap aman** — idealnya opsi baru MENGURANGI
  (bukan menambah) risiko race condition yang sudah ada (§9).
- **Audit tidak boleh silent failure** — kalau `appendRow`/write gagal,
  HARUS tetap melempar error sama seperti sekarang (implisit — GAS
  melempar exception kalau Sheets API gagal, tidak ada try/catch yang
  meredam di `logAudit()` saat ini, jadi kegagalan MEMANG akan terlihat/
  menggagalkan seluruh request pemanggil — perilaku ini harus
  dipertahankan, bukan malah ditambah try/catch yang menelan error diam-diam).

---

## 12. Optimization Options (evaluasi TANPA implementasi)

### Option A — UUID (`Utilities.getUuid()`)
- **Correctness**: aman — `id` tetap unik (kemungkinan collision UUID v4
  praktis nol), append-only tetap dipertahankan.
- **Compatibility**: `id` kolom berubah dari integer string ("430") jadi
  UUID string ("a1b2c3d4-..."), TAPI kolom sudah bertipe teks bebas di
  Sheets (tidak ada validasi tipe) — TIDAK ADA yang membaca/mem-parse
  `audit_log.id` sbg angka di tempat lain (§4).
- **Historical data**: 429 baris lama TETAP id integer, TIDAK disentuh
  (append-only, tidak ada migrasi).
- **Collision risk**: praktis nol (128-bit random, standar industri).
- **Caller dependency**: TIDAK ADA caller yang bergantung pada format id
  (§5, tidak ada yang pakai return value `logAudit()`).
- **Migration requirement**: **TIDAK ADA** — perubahan murni di dalam
  `logAudit()`/`generateId` cabang `AUDIT_LOG`, tanpa migrasi data.
- **Performa**: menghilangkan `readSheetAsObjects(AUDIT_LOG)` SEPENUHNYA
  (tidak perlu baca apa pun utk generate UUID) — `logAudit()` jadi
  **1 panggilan Sheets API** (append saja) alih-alih 2.
- **Efek samping positif**: SEKALIGUS menghilangkan race condition §9
  (UUID tidak butuh baca state bersama, collision-free tanpa lock).

### Option B — Timestamp-based ID
- **Collision**: BERISIKO — 2 event pada milidetik yang SAMA (mis. bulk
  import santri, banyak `logAudit` berurutan cepat dalam 1 loop — lihat
  `Modul_MaintainSantri.gs` bulk import) bisa dapat timestamp identik
  kalau resolusi tidak cukup halus.
- **Concurrent writes**: 2 EKSEKUSI SCRIPT berbeda (guru A & B) yang
  memanggil `new Date().toISOString()` pada milidetik yang sama (jarang
  tapi mungkin di infrastruktur cloud) → id sama.
- **Ordering**: timestamp SUDAH ADA sbg kolom terpisah — kalau id JUGA
  timestamp, redundan tanpa manfaat tambahan.
- **Timezone**: `new Date().toISOString()` selalu UTC — aman dari
  ambiguitas timezone, TAPI resolusi milidetik tidak menjamin uniqueness
  di concurrent writes (lihat poin Collision).
- **Uniqueness**: TIDAK DIJAMIN tanpa kombinasi tambahan (mis.
  timestamp+random suffix — pada titik itu sama saja lebih rumit dari
  Option A tanpa manfaat lebih).

### Option C — Counter (in-memory/dedicated counter tanpa cache)
- **Concurrency**: sama seperti `MAX(id)+1` SAAT INI kalau tidak dikunci
  — TIDAK menyelesaikan race condition kecuali dibungkus lock.
- **Locking**: kalau DIBUNGKUS `withScriptLock_`, MEMPERPANJANG waktu
  lock dipegang (saat ini `logAudit` sengaja DI LUAR lock, kemungkinan
  BUKAN kebetulan — memperpendek durasi lock adalah prinsip yang sudah
  dipegang project ini, `ERROR_LOG.md#22`/catatan "PERPENDEK durasi pegang
  kunci sedrastis mungkin"). Membungkus `logAudit` ke DALAM lock
  `serverSaveAbsensiKelas` akan menambah antrean bagi guru lain — counter
  effect thd tujuan optimasi performa.
- **Contention**: kalau TIDAK dikunci, sama saja dgn `MAX(id)+1` skrg
  (masih race).
- **Failure recovery**: perlu pertimbangan tambahan (di mana counter
  disimpan, apa yang terjadi kalau gagal baca/tulis counter).
- Secara umum: TIDAK lebih baik dari Option A pada SEMUA dimensi
  (performa, correctness, kompleksitas) UNTUK KASUS `audit_log` SPESIFIK
  (yang terbukti tidak butuh id sequential sama sekali).

### Option D — Cached counter (mis. `CacheService`, TTL pendek)
- **Cache eviction**: `CacheService` PUNYA TTL & bisa di-evict Google
  kapan saja (tidak ada garansi persistence) — counter BISA "reset ke
  versi lama" kalau cache di-evict lalu di-reconstruct dari `MAX(id)+1`
  ulang → risiko id ganda TETAP ADA di titik reconstruction.
- **Duplicate ID**: risiko MASIH ADA pada window race antara baca-cache
  dan tulis-balik-cache (`CacheService` TIDAK atomik utk read-increment-
  write tanpa lock eksplisit) — TIDAK menyelesaikan akar masalah §9 tanpa
  lock tambahan.
- **Concurrent execution**: sama seperti Option C, butuh lock utk benar-
  benar aman, dgn trade-off sama (memperpanjang critical path kalau
  digabung ke `withScriptLock_` yang sudah ada, atau butuh lock TERPISAH
  yang menambah kompleksitas).
- **Recovery**: perlu logic tambahan utk "cache kosong → rebuild dari
  scan" — balik lagi ke biaya full-scan pada kondisi tertentu (cache-miss).
- Kompleksitas lebih tinggi dari Option A tanpa manfaat tambahan utk
  kasus `audit_log` yang TIDAK butuh id bermakna apa pun.

### Option E — Firestore counter (`firestoreGenerateIdInPath_` pattern, sudah dipakai tabel lain)
- **Architecture impact**: `audit_log` akan pindah dari Google Sheets ke
  Firestore — **PERUBAHAN ARSITEKTUR BESAR** (bukan sekadar ganti skema
  id) — audit_log PPG-wide (bukan per-kelompok), butuh keputusan struktur
  path Firestore baru (`Modul_FirestoreBridge.gs` pola saat ini utamanya
  utk `/kelompok/{id}/{tabel}` per-kelompok; `audit_log` lintas-kelompok
  butuh pola top-level collection berbeda).
- **Additional Firestore latency**: MENAMBAH 1 write Firestore ke jalur
  Save (bukan mengurangi) — kecuali menggantikan `appendRow` Sheets
  sepenuhnya dgn Firestore create (mungkin, tapi itu migrasi data
  penuh utk 429 baris histori + SEMUA 40 caller lintas modul).
- **Schema change**: YA — keluar dari cakupan yang diizinkan tahap ini
  ("jangan mengubah schema").
- **Migration**: DIPERLUKAN (429 baris histori + keputusan apakah
  dipertahankan di Sheets sbg arsip atau dipindah semua).
- **Kesimpulan**: DI LUAR cakupan yang diizinkan (`❌ jangan mengubah
  schema`) — **TIDAK dievaluasi lebih lanjut, otomatis tidak
  direkomendasikan utk tahap ini**.

### Option F — Sheet-native append / apakah ID sebenarnya diperlukan?
Pertanyaan: apakah kolom `id` di `audit_log` BENAR-BENAR diperlukan sama
sekali (mengingat §4: tidak ada dependency apa pun)? Secara TEORI,
`sheet.appendRow()` sendiri TIDAK butuh kolom `id` eksplisit (row Sheets
sudah punya identitas implisit = nomor baris). **NAMUN**: menghapus kolom
`id` = **PERUBAHAN SCHEMA** (kolom dihapus dari struktur 7-kolom yang
sudah ditetapkan `Setup_Database.gs:55`) — **DI LUAR cakupan yang
diizinkan tahap ini**. Dicatat sbg observasi, BUKAN opsi yang dievaluasi
utk implementasi (melanggar hard rule "jangan mengubah schema").

### Option G — Tetap sequential ID, tapi hilangkan full scan
Pertanyaan: bisakah tetap punya id sequential-looking TANPA baca seluruh
tabel? Kemungkinan: cached-counter (= Option D, sudah dievaluasi, punya
risiko yang sama) ATAU counter tersimpan di lokasi terpisah yang di-update
ATOMIK bersamaan dgn append (butuh transaksi 2 langkah yang TIDAK atomik
tanpa lock — balik ke masalah Option C/D). **Tidak ditemukan cara
mempertahankan "sequential-looking id" TANPA salah satu dari: (a) full
scan spt sekarang, (b) lock tambahan yang memperpanjang critical path,
atau (c) risiko race condition yang sama/lebih rumit dari sekarang.**
Karena §4 membuktikan `audit_log` TIDAK PERNAH butuh id sequential SAMA
SEKALI, mempertahankan sifat "sequential-looking" ini tidak
memberi manfaat apa pun yang sepadan dgn kompleksitas tambahannya —
Option G **tidak direkomendasikan** dibanding Option A yang lebih
sederhana & sama-sama behavior-preserving (dari sudut pandang SEMUA
caller & correctness contract §11).

---

## 13. Risk Matrix

| Option | Performance Potential | Risk | Schema Change | Migration | Recommendation |
|---|---|---|---|---|---|
| A — UUID | HIGH (hilangkan full scan sepenuhnya) | LOW | NO | NO | **1. Preferred** |
| B — Timestamp | MEDIUM (hilangkan full scan, TAPI ada risiko collision) | MEDIUM | NO | NO | 3. Do Not Recommend |
| C — Counter (tanpa lock tambahan) | HIGH (kalau tanpa lock) | HIGH (race condition TIDAK terselesaikan) | NO | NO | 3. Do Not Recommend |
| C — Counter (dgn lock tambahan) | LOW (menambah waktu critical path) | MEDIUM | NO | NO | 3. Do Not Recommend |
| D — Cached counter | MEDIUM (tergantung cache-hit rate) | MEDIUM (edge-case race condition tetap ada saat cache-miss/rebuild) | NO | NO | 3. Do Not Recommend |
| E — Firestore counter | UNKNOWN (belum diukur, arsitektur beda total) | HIGH (perubahan arsitektur besar) | **YES** | **YES** | 3. Do Not Recommend (di luar cakupan) |
| F — Hapus kolom id | N/A (di luar cakupan) | N/A | **YES** | N/A | Tidak dievaluasi (melanggar hard rule) |
| G — Sequential tanpa full-scan | LOW-MEDIUM (tergantung mekanisme) | MEDIUM-HIGH (sama dgn C/D) | NO | NO | 2. Alternative (kalah dari A, tidak direkomendasikan kecuali id sequential ternyata dibutuhkan di masa depan) |

Catatan: kolom "Performance Potential" adalah **penilaian kualitatif
berbasis evidence kode** (LOW/MEDIUM/HIGH), **BUKAN angka ms terukur** —
sesuai instruksi "jangan mengarang angka performance".

---

## 14. Recommendation

```
1. Preferred:    Option A — UUID (Utilities.getUuid())
2. Alternative:  Option G — sequential tanpa full-scan (HANYA jika suatu
                 saat ditemukan dependency id sequential yang belum
                 terlihat sekarang — saat ini TIDAK ADA evidence
                 dependency tsb, jadi Option G kalah dari A)
3. Do Not Recommend: B, C, D, E, F (alasan masing-masing di §12/§13)
```

**Keputusan formal** (§14 kriteria prompt):

### B. PROPOSAL ONLY

Option A (UUID) **secara teknis** memenuhi kriteria "SAFE TO OPTIMIZE"
(perubahan kecil, behavior-preserving, tanpa schema migration, evidence
kuat dari §4/§6/§12) — **NAMUN** sesuai **FINAL RULE tahap ini yang
eksplisit** ("PAUSE setelah proposal selesai. Jangan ... mengganti ID ...
Jangan ... deploy ... commit optimization"), implementasi TIDAK dilakukan
pada Tahap 4 ini terlepas dari kekuatan evidence-nya. Proposal ini
DISERAHKAN sbg dasar keputusan tahap SELANJUTNYA (implementasi, kalau
disetujui, akan jadi Tahap 5 terpisah dengan sesi measurement before/
after-nya sendiri).

---

## 15. Rollback Strategy (utk Option A, KALAU diimplementasikan di tahap mendatang)

Karena TIDAK ADA migrasi data (429 baris lama tidak disentuh) dan TIDAK
ADA perubahan signature `logAudit()`, rollback = **revert 1 fungsi**
(`generateId`, cabang khusus `AUDIT_LOG`, ATAU ubah `logAudit()` langsung
utk pakai `Utilities.getUuid()` alih-alih `generateId(SHEET_NAMES.AUDIT_LOG)`)
kembali ke `const id = generateId(SHEET_NAMES.AUDIT_LOG);` — 1 baris kode,
tidak ada state/data yang perlu dikembalikan krn baris `audit_log` baru
(dgn id UUID) TETAP VALID secara struktural (kolom sama, cuma format id
berbeda, tidak ada yang membacanya).

---

## 16. Unknowns

- Ukuran payload byte persis per full-read `audit_log` (§7) — hanya
  estimasi kasar, tidak diukur presisi.
- Breakdown granular `readSheetAsObjects` vs `appendRow` di dalam 572ms
  (§8) — TIDAK diukur terpisah tanpa instrumentasi baru (butuh approval).
- Pertumbuhan latency riil terhadap ukuran tabel (100/200/300/400 baris,
  §7) — tidak ada data historis, TIDAK BOLEH dibuat data dummy.
- Frequency numerik tiap caller `logAudit` (§5) — tidak ada log akses
  yang bisa dibaca tanpa instrumentasi baru, dinilai kualitatif saja.
- Apakah `UrlFetchApp`/Sheets API punya karakteristik latency berbeda utk
  `audit_log` (Sheets, 429 baris) dibanding tabel Sheets lain yang lebih
  besar/kecil di app ini — tidak dibandingkan lintas-tabel pada tahap ini.
