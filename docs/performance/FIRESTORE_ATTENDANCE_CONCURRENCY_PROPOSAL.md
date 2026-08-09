# Firestore Attendance Concurrency Protection — Proposal (Tahap 11)

> Mode: **INVESTIGATION + DESIGN ONLY**. Tidak ada kode/Firestore/schema
> diubah. Tidak ada deploy. Tidak ada concurrent production test
> dijalankan. Tanggal: 2026-08-08. Lanjutan langsung dari
> `ATTENDANCE_CONCURRENCY_ANALYSIS.md` (Tahap 10).

---

## 1. Executive Summary

Lost update pada attendance Firestore **CONFIRMED** (Tahap 10) dan
**HARUS diperbaiki di production Firestore SEKARANG**, tanpa menunggu
migrasi Supabase (instruksi eksplisit tahap ini).

**Temuan kunci tahap ini**: attendance TIDAK PUNYA dokumen "header"
per kelas+tanggal — hanya dokumen per-santri-per-tanggal
(`{tanggal}_{santriId}`). Karena itu, **tidak ada tempat alami untuk
menaruh 1 nilai version yang mewakili "1 sesi Save"** kecuali membuat
dokumen header BARU (Option A). Opsi lain (timestamp per-dokumen, hash,
Firestore transaction) semuanya lebih mahal atau lebih rapuh untuk
kasus delete-N-dokumen-sekaligus ini (lihat §8).

**Desain yang direkomendasikan**: dokumen header versi BARU
(`kelompok/{id}/absensi_sesi/{kelas}_{tanggal}`, field `version`
integer) + **memindahkan version-check ke DALAM `withScriptLock_` yang
SUDAH ADA, SEBELUM delete** — bukan Firestore transaction baru. Karena
`LockService.getScriptLock()` sudah men-serialize SELURUH mutasi
aplikasi (dikonfirmasi Tahap 10 §5), read-check-write yang dibungkus
lock yang sama otomatis ATOMIC secara efektif TANPA perlu Firestore
native transaction — lock inilah yang menggantikan peran transaction.
Ini jawaban utk 3 pertanyaan wajib FINAL RULE:

1. **Deteksi data berubah**: baca `version` header SEBELUM delete
   (di dalam lock), bandingkan dgn `expectedVersion` yang guru bawa
   dari saat form dibuka.
2. **Conflict SEBELUM delete**: version check adalah BARIS PERTAMA di
   dalam `withScriptLock_`, delete/write baru dieksekusi kalau match.
3. **Hanya satu Save menang**: lock GLOBAL menjamin hanya SATU eksekusi
   berada "di dalam" blok version-check+delete+write+increment pada
   satu waktu — Save KEDUA yang masuk lock akan membaca `version` yang
   SUDAH di-increment Save PERTAMA, sehingga otomatis terdeteksi
   conflict SEBELUM sempat delete apa pun.

**Field baru diperlukan**: YA, 1 dokumen header per kelas+tanggal
(bukan per-santri) — **BUKAN field baru di 21.000+ dokumen absensi
existing** (dampak lebih kecil dari yang mungkin dikira). Attendance
lama TANPA header (belum pernah ada session Save sejak fitur ini
dibuat) ditangani via **first-save initialization** (§9 Option D) —
tidak perlu migration/backfill.

---

## 2. Current Attendance Architecture

Alur end-to-end (dibaca ulang penuh tahap ini, `Modul_InputAbsen.gs`):

```
serverGetAbsensiKelasForm(token, kelas, tanggal)
  → baca santri kelas ini (iaReadKelompokTable_ SANTRI)
  → baca absensi existing (iaReadAbsensiKelompokRange_, rentang tanggal=tanggal)
  → return { santri_id, nama, status } per santri  ← TIDAK ADA version/timestamp dikirim ke client

Guru edit status di browser (window.iaState_.list, client-side murni)

serverSaveAbsensiKelas(token, kelas, tanggal, absensiList)
  → requireGuruContext_ (auth)
  → iaReadKelompokTablesParallel_ [JADWAL_KBM, GURU, SANTRI]
  → canGuruAccessKelas_ (akses)
  → iaValidateWaktuAbsen_ (jendela waktu)
  → iaCekGuruSedangIzin_ (guru tidak sedang izin)
  → santriIdsKelas = roster kelas SAAT INI (fresh)
  → withScriptLock_ {
        iaRewriteAbsensiKelas_(kelompokId, santriIdsKelas, tanggal, absensiList, userId)
          → iaRewriteAbsensiKelasFirestore_
            → deleteSantriIds = santriIdsKelas MINUS absensiList
            → iaBulkWriteAbsensiFirestore_(delete + upsert, 1x fetchAll)
    }
  → logAudit (DI LUAR lock)
  → return {success:true}
```

**Path kedua yang MEMAKAI FUNGSI TULIS YANG SAMA** (ditemukan tahap
ini, penting untuk §17 Implementation Boundary):
`serverSaveAbsensiKelasAdmin` (Modul_InputAbsen.gs:1165) — admin_ppg
override, memanggil `iaRewriteAbsensiKelas_` PERSIS SAMA, dibungkus
`withScriptLock_` yang SAMA (lock global, bukan lock terpisah). Artinya
proteksi HARUS diletakkan di titik yang dipakai BERSAMA kedua fungsi
(`iaRewriteAbsensiKelas_`/`iaRewriteAbsensiKelasFirestore_`), bukan
diduplikasi di masing-masing caller.

---

## 3. Current Firestore Data Model

```
Firestore path:      kelompok/{kelompokId}/absensi/{docId}
Document identity:   docId = absensiDocId_(tanggal, santriId) = "{tanggal}_{santriId}"
Student identity:    santri_id (field, juga bagian dari docId)
Attendance identity: PER SANTRI PER TANGGAL — TIDAK ADA level "kelas+tanggal" (session)
                      sbg dokumen tersendiri; "kelas" hanya filter santri via
                      santri.kelas_ngaji, tidak pernah jadi bagian docId
Fields tersimpan:    id, santri_id, tanggal, status, dicatat_oleh, kelompok_id
                      (Modul_InputAbsen.gs:543-546, firestoreEncodeFields_)
```

**Pencarian field version/revision/updated_at/dst** (field list di
atas adalah SELURUH field yang benar-benar ditulis
`iaBulkWriteAbsensiFirestore_` — dikonfirmasi baca kode langsung, bukan
grep saja):

```
version       → NOT FOUND
revision      → NOT FOUND
updated_at    → NOT FOUND
updatedAt     → NOT FOUND
lastModified  → NOT FOUND
modifiedAt    → NOT FOUND
updated_by    → NOT FOUND (ADA `dicatat_oleh`, tapi ini "siapa MENULIS
                 terakhir", bukan dipakai/dibaca-balik utk bandingkan —
                 murni informational, sama spt temuan Tahap 10 §11)
```

**Firestore native metadata**: setiap dokumen Firestore SEBENARNYA
punya `updateTime` bawaan (dikembalikan REST API di `doc.updateTime`
pada response GET/PATCH) — **TAPI `firestoreDocToObject_`
(Modul_FirestoreBridge.gs:167-174) TIDAK PERNAH membaca/menyimpan
field ini**, hanya `doc.fields` yang dipetakan. Jadi walau Firestore
"punya" versioning implisit per-dokumen, **aplikasi ini sama sekali
tidak memanfaatkannya saat ini** (dianalisis lebih lanjut §6 Option C).

**Kesimpulan §3**: tidak ada field existing yang bisa dipakai langsung
utk concurrency di level "kelas+tanggal" — field baru (via dokumen
header, BUKAN field baru di 21rb dokumen per-santri) TIDAK TERHINDARKAN
kalau ingin proteksi di level yang sesuai dgn UX (1 tombol Simpan = 1
sesi kelas+tanggal, bukan 1 sesi per santri).

---

## 4. Current Save Flow (urutan aktual, dgn titik proteksi ditandai)

```
1. authorization      requireGuruContext_(token)                         [tidak berubah]
2. permission         canGuruAccessKelas_, iaValidateWaktuAbsen_,
                       iaCekGuruSedangIzin_                               [tidak berubah]
3. lock                withScriptLock_ { ... }                            [SUDAH ADA — dipakai ulang]
4. validation          format tanggal, roster kelas fresh                 [tidak berubah]
5. read current?       ⚠️ TITIK BARU — baca version header DI SINI,
                       DI DALAM lock, SEBELUM delete
6. delete              iaBulkWriteAbsensiFirestore_ (delete request)      [HANYA jalan kalau version match]
7. write               iaBulkWriteAbsensiFirestore_ (upsert request)      [sama batch dgn delete]
8. audit               logAudit (DI LUAR lock, tidak berubah)             [+field conflict opsional, §12]
9. response             {success:true/false, code:'conflict'?}            [+cabang baru utk conflict]
```

**Titik terbaik utk conflict detection**: **AWAL BLOK `withScriptLock_`,
SEBELUM `iaRewriteAbsensiKelas_` dipanggil** — persis antara langkah 4
(validation) dan langkah 6 (delete). Ini adalah SATU-SATUNYA titik yang
memenuhi syarat FINAL RULE #2 ("conflict harus terjadi SEBELUM DELETE")
sekaligus FINAL RULE #3 (karena berada DI DALAM lock yang sudah
men-serialize semua eksekusi, tidak ada window race antara check dan
delete).

---

## 5. Confirmed Lost Update Mechanism

(Ringkasan ulang dari Tahap 10, dikonfirmasi ulang kode belum berubah)
Root cause: `iaRewriteAbsensiKelas_` menghitung `deleteSantriIds` HANYA
dari `santriIdsKelas` (fresh) vs `absensiList` (state browser pengirim)
— **tidak pernah membaca/membandingkan apa yang SUDAH ADA di Firestore
saat ini**. `iaBulkWriteAbsensiFirestore_` PATCH tanpa precondition
apa pun (`updateMask` saja, tidak ada `currentDocument.updateTime`) —
selalu berhasil menimpa apa pun yang ada. Detail lengkap: lihat
`ATTENDANCE_CONCURRENCY_ANALYSIS.md` §5-§8 (tidak diulang penuh di
sini, hanya dirujuk sesuai instruksi "referensi wajib").

---

## 6. Delete-Then-Write Constraint

**Mengapa delete-then-write tetap dibutuhkan** (tidak diusulkan
dihapus): santri yang DIKELUARKAN dari form (mis. pindah kelas
di-tengah proses, atau guru sengaja uncheck) harus BENAR-BENAR hilang
dari Firestore, bukan cuma "tidak di-upsert" (kalau dokumen lama
dibiarkan, dia akan tetap muncul di query/rekap lain sbg
"absen tercatat" padahal seharusnya tidak ada).

**Bagaimana optimistic concurrency bekerja BERSAMA mekanisme ini**:

```
[DI DALAM withScriptLock_, SEBELUM apa pun lain]
  currentHeader = firestoreGetDoc_('absensi_sesi', headerId)   ← 1 READ, O(1)
  currentVersion = currentHeader ? currentHeader.version : 0
  IF expectedVersion !== currentVersion:
      → ABORT. TIDAK ADA delete. TIDAK ADA write. TIDAK ADA increment.
      → return {success:false, code:'conflict', ...}
  ELSE:
      → lanjut delete (santri yang dikeluarkan)
      → lanjut write (upsert absensiList)
      → tulis header BARU dgn version = currentVersion + 1
```

**Required semantics dari prompt** (§7) — dipenuhi PERSIS:

```
CHECK VERSION (baca header, 1 read)
       ↓
MATCH?
 ┌─────┴─────┐
 YES         NO
 ↓            ↓
DELETE+WRITE  CONFLICT
+ increment   NO DATA CHANGE (delete TIDAK dieksekusi sama sekali)
```

Karena check terjadi SEBELUM baris kode delete mana pun dieksekusi
(bukan "dicek lalu tetap lanjut jika gagal"), **tidak ada skenario di
mana delete sempat jalan lalu ketahuan version mismatch** — desain ini
VALID sesuai kriteria FINAL RULE §7 ("Jika version mismatch ditemukan
setelah delete: DESIGN INVALID").

---

## 7. Atomicity Analysis

**Apakah Firestore native (`:commit` transaction) DIPERLUKAN utk
menyatukan check+delete+write+increment jadi 1 atomic operation?**
**TIDAK, dgn syarat**: seluruh urutan itu (baca header → cek → delete →
write → tulis header baru) dieksekusi SELURUHNYA DI DALAM
`withScriptLock_` yang SAMA (sudah menyerialisasi SEMUA mutasi
aplikasi, dikonfirmasi Tahap 10 §5). Karena TIDAK ADA eksekusi lain
yang bisa "menyisip" antara baca-header dan tulis-header-baru pada
proses yang sama (Apps Script + `LockService.getScriptLock()` bersifat
mutual exclusion utk SELURUH aplikasi, bukan hanya per-baris),
**Firestore native transaction menjadi REDUNDAN** utk skenario
concurrency yang REALISTIS di aplikasi ini (semua mutasi HARUS lewat
`withScriptLock_` per aturan CLAUDE.md — "Aturan mutasi data").

**Perbandingan opsi**:

| Mekanisme | Cocok di sini? | Alasan |
|---|---|---|
| Firestore transaction (`:beginTransaction`+`:commit`) | TIDAK PERLU | Lock Apps Script SUDAH memberi jaminan mutual-exclusion yang sama; transaction native menambah 2+ round-trip HTTP (`begin` + `commit`) tanpa manfaat correctness tambahan SELAMA semua caller disiplin lewat `withScriptLock_` |
| Batch write (`:commit` non-transactional, banyak write 1 request) | TIDAK PERLU utk correctness (sudah pakai `fetchAll` paralel yg setara secara network), TAPI native `:commit` MENDUKUNG precondition per-write (`currentDocument.updateTime`) yang BISA jadi lapisan pertahanan TAMBAHAN (defense-in-depth) — lihat catatan risiko di bawah |
| Conditional update (`currentDocument.updateTime`/`exists` per-request) | OPSIONAL, defense-in-depth | Bisa ditambahkan di request PATCH header itu sendiri sbg pengaman KEDUA (kalau suatu saat ada jalur tulis lain yg lupa pakai lock) — TIDAK WAJIB kalau lock didisiplinkan, tapi MURAH utk ditambahkan (tidak menambah round-trip, hanya query-param tambahan) |
| Existing REST API implementation (`firestoreRequest_` per-doc) | SUDAH CUKUP | Selama version-check dilakukan SEBELUM memanggil `iaBulkWriteAbsensiFirestore_`, DI DALAM lock yang sama, pola existing (individual PATCH/DELETE via `fetchAll`) tidak perlu diubah strukturnya |

**Risiko yang perlu dicatat SECARA JUJUR (bukan diabaikan)**: keamanan
desain ini BERGANTUNG PENUH pada disiplin "SEMUA jalur tulis absensi
HARUS lewat `withScriptLock_`" — ini SUDAH menjadi aturan wajib
CLAUDE.md project ini ("Aturan mutasi data ... bungkus tulis-sheet
dalam `withScriptLock_()`"), dan dikonfirmasi §2 bahwa KEDUA jalur
(guru + admin override) SUDAH mematuhi ini. Kalau di masa depan ada
jalur tulis BARU ke collection `absensi` yang lupa memakai lock, desain
version-check ini TIDAK melindungi jalur itu — inilah alasan
`currentDocument.updateTime` precondition (defense-in-depth di atas)
layak dipertimbangkan sbg lapisan kedua, WALAU tidak wajib utk
menjawab 3 pertanyaan FINAL RULE.

---

## 8. Candidate Concurrency Strategies

### Option A — Attendance Header/Session Version — **DIREKOMENDASIKAN**
Dokumen baru `kelompok/{id}/absensi_sesi/{kelas}_{tanggal}`,
field `version` (integer, mulai dari 1).
- Correctness: KUAT — 1 titik baca/tulis mewakili PERSIS 1 sesi Save
  (selaras dgn UX, 1 tombol Simpan = 1 kelas+tanggal).
- Kompleksitas: RENDAH-SEDANG — 1 collection baru (subcollection, pola
  SAMA seperti collection lain yg sudah ada, tidak perlu API baru),
  1 read tambahan (O(1), by-id, bukan scan) SEBELUM lock section lama.
- Trade-off: field `version` ini TIDAK OTOMATIS terhubung ke isi
  attendance (bukan hash dari data) — hanya PENANDA "sudah berapa kali
  disimpan", cukup utk deteksi conflict (yang dibutuhkan), TIDAK cukup
  utk audit "apa yang berubah" (sudah diketahui sbg limitation
  `audit_log` sejak Tahap 10 §10, TIDAK diperbaiki tahap ini).

### Option B — Existing Metadata
**TIDAK TERSEDIA** — dikonfirmasi §3, TIDAK ADA dokumen/header level
kelas+tanggal yang sudah ada saat ini. Opsi ini GUGUR by evidence
(bukan oleh preferensi desain), sesuai instruksi "jika sudah ada,
JANGAN membuat field baru" — TAPI karena TIDAK ADA yg sudah ada, syarat
itu tidak berlaku di sini.

### Option C — Updated Timestamp
Precision: `Utilities.formatDate`/server timestamp Apps Script
punya resolusi detik-ke-milidetik cukup utk membedakan 2 save berbeda
DALAM PRAKTIK (jarak waktu antar-guru save realistis dalam hitungan
detik-menit, bukan sub-milidetik) — TAPI **exact-match comparison pada
timestamp lebih rapuh** drpd integer version: kalau timestamp disimpan
via 2 representasi berbeda (mis. Apps Script `new Date()` vs Firestore
native `updateTime`), risiko FALSE MISMATCH (dua representasi "waktu
yang sama" tapi string/precision berbeda) lebih tinggi drpd
membandingkan integer murni. **Jangan pakai client clock** (prompt
eksplisit melarang) — kalaupun dipakai, HARUS timestamp
SERVER-GENERATED (Apps Script `new Date()` saat tulis, BUKAN dari
browser). **Kesimpulan**: integer version (Option A) LEBIH SIMPLE &
LEBIH ROBUST drpd timestamp utk tujuan spesifik "apakah sudah berubah
sejak X" — timestamp lebih cocok utk "kapan terakhir diubah" (informational),
bukan comparison token yang presisi.

### Option D — Hash Snapshot
- Payload size: hash dari SELURUH `absensiList` (N santri × status) —
  utk kelas besar (~30-40 santri) tetap kecil (~beberapa ratus byte
  sebelum hash), TIDAK jadi masalah ukuran.
- Computational cost: RENDAH (hash sederhana, sekali per Save) — BUKAN
  faktor penentu.
- **False conflict**: TINGGI RISIKO — hash HARUS dihitung dari
  representasi yang PERSIS SAMA antara client (saat load) dan server
  (saat compare) — urutan santri, tipe data (string vs number utk
  santri_id), whitespace, dst. semuanya bisa membuat hash berbeda
  PADAHAL isinya "sama secara makna" → conflict PALSU yang membuat guru
  frustasi ("kok bilang berubah, saya tidak ubah apa-apa").
- **Missing fields**: kalau field BARU ditambahkan ke record absensi
  di masa depan (skema berubah), hash lama vs baru otomatis TIDAK
  COCOK walau tidak ada perubahan users-facing — FRAGILE terhadap
  evolusi skema.
- **Ordering**: HARUS di-sort deterministik sebelum hash (santri_id
  ASC mis.) — kalau lupa, urutan berbeda = hash berbeda walau isi sama.
- **Kesimpulan**: Option D SECARA TEKNIS BISA, TAPI punya PROFIL RISIKO
  YANG SALAH ARAH (menambah false-positive conflict yg mengganggu UX,
  utk masalah yg SEBENARNYA sudah terselesaikan LEBIH SEDERHANA dgn
  Option A integer version). **TIDAK DIREKOMENDASIKAN.**

### Option E — Firestore Transaction
Firestore REST API MENDUKUNG transaction native
(`:beginTransaction` → operasi → `:commit` dgn transaction-id), BISA
scr TEKNIS melakukan read-verify-write-in-1-atomic-unit TANPA
bergantung pada Apps Script lock sama sekali. **NAMUN** (lihat §7):
lock Apps Script yg SUDAH ADA dan SUDAH WAJIB dipakai (CLAUDE.md) sudah
memberi jaminan setara utk SEMUA mutasi yg disiplin — menambah
Firestore transaction di atas itu adalah REDUNDAN utk correctness DAN
menambah round-trip HTTP (`begin`+`commit` terpisah dari `fetchAll`
paralel yg sudah dipakai) yg BERPOTENSI menambah latency pada operasi
yg SUDAH lambat (~3.3 detik, Tahap 2). **TIDAK DIREKOMENDASIKAN** sbg
mekanisme UTAMA — dicatat sbg opsi TEORITIS yg lebih cocok KALAU
suatu saat lock Apps Script terbukti tidak lagi cukup (mis. arsitektur
berubah jadi multi-process yg lock-nya tidak lagi otomatis mencakup).

---

## 9. Existing Data Compatibility

**Attendance records LAMA (sebelum fitur ini ada) tidak punya header
version APAPUN** — karena `absensi_sesi` adalah collection BARU,
"tidak punya version" BERLAKU UNTUK SEMUA kelas+tanggal yang PERNAH
disimpan sebelum fitur ini di-deploy (bukan sebagian, sesuai
sifat "belum pernah ada" bukan "field kosong pada dokumen yang ada").

**Strategi yang direkomendasikan: Option D — First-Save Initialization**
(bukan Option A "version default"/B "migration"/C "derive dari
existing"):

```
serverGetAbsensiKelasForm (saat form dibuka):
  headerDoc = firestoreGetDoc_('absensi_sesi', headerId)
  expectedVersion = headerDoc ? headerDoc.version : 0   ← 0 = "belum pernah ada session tercatat"
  return { ..., expectedVersion }

serverSaveAbsensiKelas (saat Save, di dalam lock):
  currentHeader = firestoreGetDoc_('absensi_sesi', headerId)
  currentVersion = currentHeader ? currentHeader.version : 0
  IF expectedVersion !== currentVersion → CONFLICT
  ELSE:
    delete+write seperti biasa
    firestoreUpdateDoc_/firestoreCreateDoc_('absensi_sesi', headerId, {version: currentVersion+1, ...})
```

**Mengapa ini BUKAN migration**: tidak ada operasi backfill/batch-write
ke data lama yang perlu dijalankan SEBELUM fitur aktif — dokumen header
PERTAMA utk setiap kelas+tanggal otomatis TERCIPTA pada Save PERTAMA
SETELAH fitur ini deploy (baik itu kelas+tanggal yg SUDAH punya
attendance lama dari SEBELUM fitur ini ada, MAUPUN kelas+tanggal yang
benar-benar baru). Kelas+tanggal yang absen-nya SUDAH ADA (data lama)
tapi belum pernah punya header akan diperlakukan `currentVersion = 0`
sampai Save PERTAMA setelah fitur ini aktif, LALU header baru
dibuat — attendance data LAMA-nya sendiri (per-santri) TIDAK disentuh/
tidak perlu diubah SAMA SEKALI.

**Kenapa Option A/B/C prompt (version default/migration/derive)
TIDAK DIPILIH**: Option A prompt ("version default", spt field default
tanpa proses) pada dasarnya SAMA dgn first-save-init di atas (0 sbg
default IMPLISIT via "dokumen tidak ada" — TIDAK PERLU field default
eksplisit krn `firestoreGetDoc_` sudah return `null` utk dokumen yg
belum ada, direpresentasikan sbg version 0 di level logic, BUKAN
ditulis eksplisit ke Firestore). Migration/backfill (Option B prompt)
TIDAK PERLU krn tidak ada data yg perlu "diisi duluan" — cukup
biarkan first-save yang membuatnya secara alami. Derive-dari-existing
(Option C prompt, mis. hitung dari COUNT record attendance lama)
DITOLAK krn TIDAK RELIABLE (jumlah record BUKAN indikator "sudah
berapa kali di-Save" — bisa saja 1x Save utk 30 santri = tetap
"1 sesi", bukan "30").

---

## 10. Lock Interaction

**Global lock (`LockService.getScriptLock()`) tetap DIPERTAHANKAN,
TIDAK dihapus, TIDAK diganti** (sesuai FINAL RULE §13 prompt).

**Apakah lock masih diperlukan utk**:
- **Compatibility**: YA — SEMUA mutasi lain di aplikasi ini (bukan
  hanya absensi) bergantung pada lock yang SAMA (aturan CLAUDE.md
  berlaku app-wide, bukan cuma attendance) — menghapusnya utk absensi
  saja akan MEMATAHKAN jaminan yang justru dipakai proposal ini sbg
  DASAR correctness (§7).
- **Firestore request**: YA — read-header + delete + write + tulis
  header baru SEMUA harus tetap DI DALAM 1 blok lock yang sama supaya
  tidak ada eksekusi lain menyisip di antaranya (§6/§7).
- **Sheets audit**: `logAudit` TETAP DI LUAR lock (tidak berubah, sesuai
  pola existing yang sudah dianalisis Tahap 10 §10 — audit log bukan
  bagian dari correctness-critical path, hanya pencatatan pasif).
- **Operasi lain**: TIDAK terpengaruh — proposal ini HANYA menambah
  1 read + 1 write kecil (header doc) DI DALAM blok lock yang SUDAH
  ADA utk absensi, tidak mengubah lock utk fungsi/tabel lain.

**Recommendation**: **PERTAHANKAN lock APA ADANYA** — desain proposal
ini justru BERGANTUNG pada lock tetap seperti sekarang (global, meliputi
seluruh blok tulis). Tidak ada perubahan pada `withScriptLock_` itu
sendiri yang diperlukan; yang berubah HANYA isi fungsi yang dipanggil
DI DALAM lock (`iaRewriteAbsensiKelas_` dst., ditambah version-check di
awalnya).

---

## 11. Conflict UX Contract

**Behavior EXACT saat conflict** (desain, TIDAK diimplementasikan
tahap ini):

```
Server (serverSaveAbsensiKelas) mendeteksi conflict (§6):
  → return { success: false, code: 'attendance-conflict',
             error: 'Data absensi sudah diperbarui oleh guru lain.' }
  → TIDAK ADA data Firestore yang berubah (delete/write TIDAK dieksekusi)
  → TIDAK ADA logAudit entry conflict-related ditulis (§12 — dianalisis
    sbg "NO audit" utk versi awal, lihat alasan di §12)

Client (window.saveInputAbsen_, pola SAMA dgn error-handling Tahap 9):
  → endSaving_() dipanggil (guard direset, tombol aktif lagi — SAMA
    persis pola existing utk error lain, TIDAK ADA state baru
    diperlukan di sisi ini)
  → TAMPILKAN pesan KHUSUS (bukan generic error) — pola modal/alert yg
    SUDAH ADA di aplikasi (dipakai utk error lain spt 'guru-izin'),
    HANYA teks & 'code' yang baru
  → JANGAN tampilkan "berhasil" dalam bentuk apa pun (tidak ada
    optimistic-success, konsisten dgn prinsip Tahap 9)
  → OPSI yang ditawarkan ke guru: "Muat Ulang Data" (memanggil ULANG
    serverGetAbsensiKelasForm, mendapat expectedVersion TERBARU + data
    TERBARU) — edit lokal guru yg BELUM tersimpan TIDAK otomatis hilang
    dari layar SAMPAI guru MEMILIH utk muat ulang (lihat §12 Data
    Preservation)
```

**Ini adalah DESAIN, bukan implementasi** — UI/JS konkret (pesan modal,
tombol, dst.) TIDAK dibuat/diedit tahap ini, sesuai instruksi prompt
§10 ("jangan implement UI pada tahap ini").

---

## 12. Data Preservation

- **Firestore attendance saat conflict = UNCHANGED**: DIJAMIN oleh
  desain §6 (check terjadi SEBELUM delete apa pun dieksekusi — kalau
  mismatch, TIDAK ADA baris kode delete/write yang berjalan sama
  sekali, BUKAN "dijalankan lalu dibatalkan").
- **Client local edits saat conflict**: **PRESERVED, TIDAK dihapus
  otomatis** — client TIDAK melakukan reload paksa setelah menerima
  respons conflict; guru TETAP MELIHAT apa yang sudah dia ketik SAMPAI
  dia secara EKSPLISIT menekan "Muat Ulang Data" (§11). Ini konsisten
  dgn prinsip Tahap 9 ("no optimistic success, no automatic state
  change tanpa aksi guru").
- **Tidak ada auto-merge**: desain ini SENGAJA TIDAK mengusulkan
  merge otomatis (mis. "gabungkan status yang beda per-santri") — akar
  masalahnya adalah 2 SUMBER KEBENARAN yang TIDAK BISA didamaikan
  otomatis TANPA mengetahui NIAT guru (siapa yang benar kalau guru A
  bilang "hadir" dan guru B bilang "izin" utk santri yang sama?) — ini
  BUKAN keputusan teknis yang aman diotomatisasi, HARUS keputusan
  manusia (guru memilih Muat Ulang lalu input ULANG secara sadar).

---

## 13. Audit Log

**Rekomendasi: NO audit event BARU utk conflict** (pada versi desain
ini) — alasan berdasarkan arsitektur existing:

- `logAudit` SAAT INI hanya dipanggil SETELAH save BERHASIL
  (Modul_InputAbsen.gs:654, DI LUAR lock, SETELAH `iaRewriteAbsensiKelas_`
  selesai TANPA error) — conflict berarti fungsi RETURN LEBIH AWAL
  (SEBELUM baris `logAudit` tercapai), jadi POLA EXISTING SECARA ALAMI
  SUDAH "tidak audit percobaan yang gagal" (sama seperti error lain:
  `canGuruAccessKelas_` gagal, `iaValidateWaktuAbsen_` gagal,
  `iaCekGuruSedangIzin_` gagal — SEMUA TIDAK menghasilkan audit entry
  saat ini, dikonfirmasi baca ulang kode §4).
- **Menambahkan audit KHUSUS utk conflict** akan jadi PERUBAHAN POLA
  (baris pertama di codebase ini yg meng-audit KEGAGALAN, bukan cuma
  KEBERHASILAN) — di luar cakupan "minimal diff" tahap ini, dan TIDAK
  esensial utk menjawab 3 pertanyaan FINAL RULE.
- **Trade-off yang JUJUR dicatat**: tanpa audit conflict, TIDAK ADA
  jejak "berapa kali conflict ini benar-benar terjadi di production" —
  kalau nanti ingin MENGUKUR seberapa sering fitur ini terpakai
  (validasi Tahap 10 Open Questions "seberapa sering lost-update
  benar-benar terjadi"), audit conflict AKAN BERGUNA. **Dicatat sbg
  Open Question §20, BUKAN diputuskan sekarang** (mengubah `audit_log`
  eksplisit DILARANG tahap ini oleh FINAL RULE §12: "Jangan mengubah
  audit pada tahap ini").

---

## 14. Failure Scenarios

### A — No conflict
```
expectedVersion=10, currentVersion=10 → MATCH → delete+write → header version=11
```
Sama seperti flow normal saat ini, HANYA tambah 1 read (header) di awal
+ 1 write (header) di akhir blok lock.

### B — Conflict
```
expectedVersion=10, currentVersion=11 → MISMATCH → return conflict, NO DATA CHANGE
```
Sesuai §6/§11/§12 di atas.

### C — Two simultaneous saves (A expected 10, B expected 10)
Karena SELURUH urutan check→delete→write→increment ada DI DALAM
`withScriptLock_` yang SAMA (global, mutual-exclusion app-wide):
- Siapa pun yang MENDAPAT lock LEBIH DULU (misal A) akan: baca
  version=10 (match) → delete+write → tulis header version=11 → lepas
  lock.
- B (menunggu lock) BARU mendapat giliran SETELAH A selesai TOTAL
  (termasuk tulis header) — saat B akhirnya masuk, B baca
  currentVersion=11 (BUKAN 10 lagi) vs `expectedVersion`=10 (B) →
  MISMATCH → B CONFLICT, TIDAK delete/write apa pun.
- **HANYA SATU (yang pertama dapat lock) yang commit** — dijamin oleh
  urutan lock, BUKAN oleh race yang "kebetulan".

### D — Delete succeeds, write fails (SAMA seperti Tahap 10 §6, TIDAK
berubah oleh proposal ini)
Version-check TIDAK mengubah sifat non-atomic ANTARA delete-request dan
write-request DALAM 1 `fetchAll` batch yang SAMA (itu limitation
terpisah, sudah dianalisis Tahap 3/Tahap 10, DI LUAR cakupan proposal
concurrency ini — proposal ini menyelesaikan concurrency ANTAR-SAVE,
bukan atomicity DALAM 1 save, yang merupakan 2 masalah BERBEDA). Kalau
partial-failure terjadi, header version TETAP TIDAK di-increment
(exception dilempar SEBELUM baris tulis-header, kalau ditempatkan
SETELAH `iaBulkWriteAbsensiFirestore_` sesuai desain) — artinya
`currentVersion` di Firestore TIDAK BERUBAH walau SEBAGIAN data
mungkin sudah berubah (partial), guru berikutnya masih akan
membandingkan thd version LAMA (yg MUNGKIN sudah tidak 100% cocok dgn
realita Firestore krn partial-failure) — **INI ADALAH INTERAKSI ANTARA
2 MASALAH BERBEDA yang PERLU DICATAT SBG OPEN QUESTION** (§20), bukan
diselesaikan diam-diam di sini.

### E — Client timeout after successful server write
Server SUDAH selesai (termasuk increment header version), client TIDAK
menerima respons. Guru retry Save DENGAN `expectedVersion` LAMA (yang
dia bawa dari SEBELUM save pertama yang "hilang" responsnya) →
`iaRewriteAbsensiKelas_` versi lama (BUKAN proposal ini) akan
langsung sukses lagi (idempotent). **DENGAN proposal ini**: retry
tsb akan DIANGGAP CONFLICT (krn header version SUDAH naik dari save
pertama yang sebenarnya sukses) — **PERUBAHAN PERILAKU YANG DISENGAJA
DAN BENAR**: guru akan melihat "Data absensi sudah diperbarui" (oleh
DIRINYA SENDIRI, secara teknis) dan disuruh Muat Ulang — SEDIKIT
LEBIH RIBET drpd sebelumnya (yang diam-diam sukses lagi tanpa guru
sadar), TAPI ini adalah trade-off yang BENAR & AMAN: mencegah retry
"menimpa" perubahan guru LAIN yang mungkin sempat save DI ANTARA
timeout dan retry (persis skenario yang diidentifikasi Tahap 10 §6
tabel "Retry"). Muat Ulang akan menunjukkan data yang SUDAH benar
tersimpan (dari save pertama yang sebenarnya sukses), guru akan
melihat datanya SUDAH sesuai tanpa perlu save ulang.

### F — User reloads after conflict
`serverGetAbsensiKelasForm` (dipanggil ulang oleh "Muat Ulang Data")
SELALU membaca data TERKINI langsung dari Firestore (`iaReadAbsensiKelompokRange_`,
TIDAK ADA cache utk collection `absensi` itu sendiri — dikonfirmasi
tidak ada di `IA_KELOMPOK_TABLE_CACHE_KEY_`) + `expectedVersion` BARU
dari header TERKINI — **YA, data terbaru SELALU bisa diperoleh** via
jalur yang SUDAH ADA, tidak perlu endpoint baru.

---

## 15. Performance Impact

**Tambahan operasi per Save**:
- 1 Firestore READ tambahan (`firestoreGetDoc_`, GET by-id — O(1),
  BUKAN scan) di AWAL blok lock, SEBELUM delete/write.
- 1 Firestore WRITE tambahan (`firestoreUpdateDoc_`/`firestoreCreateDoc_`
  header) — BISA digabung ke `fetchAll` batch YANG SAMA dgn
  delete+upsert absensi (menambah 1 request ke array `requests[]` yang
  SUDAH ADA), **TIDAK PERLU round-trip network TERPISAH** utk write
  ini.
- Utk READ header: **1 round-trip TERPISAH** (Firestore REST tidak
  mendukung "GET 1 dokumen" digabung ke `fetchAll` yang isinya
  DELETE/PATCH tulis) — ini SATU-SATUNYA penambahan latency yang TIDAK
  bisa dihindari, terjadi SEBELUM `fetchAll` yang sudah ada.

**Perbandingan dgn baseline** (Tahap 2, Save ≈ 3.3-3.9 detik, floor
Firestore ~1.8-2.0 detik/request-batch independen dari jumlah dokumen —
Tahap 3):
- Tambahan 1 GET request (header, dokumen TUNGGAL kecil) diperkirakan
  MENAMBAH round-trip network SEJENIS dgn read lain yang SUDAH ADA di
  jalur ini (`iaReadKelompokTablesParallel_` sudah melakukan 3 read
  paralel) — **TAPI GET header ini TIDAK BISA diparalelkan dgn
  read-read AWAL fungsi** (karena harus terjadi DI DALAM lock, SETELAH
  validasi, SEBELUM delete — beda fase dari read-read di langkah 1
  fungsi) → **kemungkinan menambah SATU round-trip SERIAL BARU** yang
  belum ada saat ini.
- **Angka pasti**: `UNKNOWN UNTIL BENCHMARKED` — tidak boleh dikarang
  (instruksi eksplisit prompt §14). Berdasarkan pola latency Firestore
  REST individual document GET yang teramati di analisis-analisis
  sebelumnya (jauh lebih kecil dari floor 1.8-2.0 detik utk BATCH
  fetchAll, krn GET tunggal biasa lebih cepat dari batch multi-request),
  DIPERKIRAKAN dampaknya KECIL RELATIF thd total 3.3+ detik — TAPI ini
  TETAP PERKIRAAN, BUKAN pengukuran, dan HARUS diverifikasi dgn
  before/after benchmark yang sesungguhnya pada Tahap implementasi
  (Tahap 12), bukan diasumsikan di sini.

---

## 16. Security Considerations

- **Version bukan authorization**: `expectedVersion` HANYA dipakai
  utk deteksi "apakah data berubah sejak dibuka" — TIDAK PERNAH
  dipakai sbg pengganti `canGuruAccessKelas_`/`requireGuruContext_`
  (proposal ini TIDAK mengubah/menghapus SATU PUN pemeriksaan
  otorisasi yang sudah ada, HANYA menambah 1 pemeriksaan BARU yang
  terjadi SETELAH semua pemeriksaan otorisasi existing selesai —
  urutan §4 poin 1-2 TETAP SEBELUM poin 5 version-check).
- **Version mismatch TIDAK BOLEH jadi bypass**: kalau guru TIDAK
  berhak akses kelas itu, `canGuruAccessKelas_` SUDAH menolak SEBELUM
  version-check pernah dijalankan — version-check TIDAK PERNAH jadi
  jalur alternatif yang bisa "melewati" pemeriksaan akses (karena
  letaknya SETELAH, bukan MENGGANTIKAN, pemeriksaan itu).
- **Header document TIDAK menyimpan data attendance/santri APAPUN** —
  hanya `version` (integer) + metadata minimal (opsional: `updatedAt`/
  `updatedBy` utk debugging, TIDAK WAJIB) — TIDAK membuka informasi
  santri/attendance baru lewat jalur baca header (guru yang TIDAK
  berhak tetap TIDAK BISA baca header krn `firestoreGetDoc_` dipanggil
  DARI SERVER, guru tidak pernah query Firestore langsung — pola
  existing app ini, SEMUA akses Firestore lewat server-side Apps
  Script, TIDAK ADA client-side Firestore SDK).
- **`expectedVersion` dari client TIDAK PERLU divalidasi format ketat**
  di luar "harus berupa angka" — nilai yang salah/dipalsukan HANYA bisa
  menyebabkan FALSE CONFLICT (guru disuruh reload, TIDAK BERBAHAYA) atau
  FALSE MATCH KEBETULAN (kalau guru "menebak" version yang benar — TAPI
  ini TIDAK memberi akses APAPUN yang tidak sudah dia punya lewat
  pemeriksaan otorisasi normal; paling buruk dia berhasil save TANPA
  terdeteksi conflict, sama seperti PERILAKU SAAT INI tanpa proposal
  ini SAMA SEKALI — bukan regresi keamanan, hanya "proteksi baru ini
  tidak aktif" utk kasus itu).

---

## 17. Safe Test Plan (RANCANGAN, TIDAK DIJALANKAN tahap ini)

```
Setup: QA Guru A, QA Guru B (akun sintetis terpisah, pola sama Tahap 2/6/7),
       QA class, QA date (tanggal jauh ke depan/kosong)

Scenario 1 — Same class, same date, conflict:
  A load (expectedVersion=X) → B load (expectedVersion=X, SAMA)
  A save → expected: SUCCESS, header version = X+1
  B save (masih bawa expectedVersion=X) → expected: CONFLICT
  Verifikasi: Firestore final state = punya A punya B, B TIDAK overwrite A

Scenario 2 — Different class, same date:
  A (kelas P) load+save, B (kelas Q) load+save, urutan bebas
  Expected: KEDUANYA SUCCESS (header berbeda per kelas, tidak saling ganggu)

Scenario 3 — Same class, different date:
  A (tanggal T1), B (tanggal T2) — kelas SAMA
  Expected: KEDUANYA SUCCESS (header berbeda per tanggal)

Scenario 4 — Retry after conflict:
  B menerima conflict → B klik "Muat Ulang" → dapat expectedVersion BARU (X+1)
  B save lagi → expected: SUCCESS, header version = X+2

Scenario 5 — First-save initialization:
  Kelas+tanggal yang BELUM PERNAH punya header (data attendance lama
  ada, header belum ada) → load → expectedVersion=0 → save → expected:
  SUCCESS, header BARU dibuat dgn version=1

Scenario 6 — Admin override path (serverSaveAbsensiKelasAdmin):
  Verifikasi conflict detection JUGA berlaku utk jalur admin (krn
  berbagi iaRewriteAbsensiKelas_ yang sama, §2) — admin save kelas yg
  SEDANG di-edit guru (versi guru belum di-save) → TIDAK relevan
  (admin save independen tetap PAKAI version-check yang sama)
```

**TIDAK DIJALANKAN tahap ini** — rancangan disiapkan utk Tahap 12
(implementasi), sesuai instruksi eksplisit prompt §18/FINAL RULE.

---

## 18. Recommended Design

```
RECOMMENDED: Attendance Header Version (Option A) + Lock-Enclosed Check
```

### Why
Satu-satunya opsi yang (a) punya titik data alami sesuai granularitas
UX (1 Save = 1 kelas+tanggal, BUKAN 1 Save = 1 santri), (b) TIDAK
menambah field ke puluhan-ribu dokumen absensi existing, (c) TIDAK
butuh Firestore transaction native (memanfaatkan lock existing yang
SUDAH WAJIB dipakai app-wide), (d) risiko false-conflict RENDAH
(integer counter murni, bukan hash yang rapuh thd urutan/skema).

### Exact save flow
```
serverSaveAbsensiKelas / serverSaveAbsensiKelasAdmin (TAMBAH parameter expectedVersion)
  ... [auth/permission/validation TIDAK BERUBAH] ...
  withScriptLock_ {
    headerId = kelas + '_' + tanggal   (dalam path kelompok/{id}/absensi_sesi/)
    currentHeader = firestoreGetDoc_('kelompok/{id}/absensi_sesi', headerId)
    currentVersion = currentHeader ? currentHeader.version : 0
    IF expectedVersion !== currentVersion → THROW/RETURN conflict, STOP DI SINI
    count = iaRewriteAbsensiKelas_(...)   [TIDAK BERUBAH strukturnya]
    firestoreUpdateDoc_/firestoreCreateDoc_ header, version = currentVersion + 1
  }
  logAudit (TIDAK BERUBAH, hanya jalan kalau TIDAK conflict)
  return success
```

### Conflict condition
`expectedVersion` (dari client, diperoleh saat `serverGetAbsensiKelasForm`)
!== `currentVersion` (dibaca ULANG dari Firestore, DI DALAM lock, SAAT
Save, BUKAN saat form dibuka).

### Conflict response
`{success:false, code:'attendance-conflict', error:'Data absensi sudah
diperbarui oleh guru lain.'}` — TIDAK ADA perubahan Firestore apa pun
(§6/§12).

### Existing data strategy
First-save initialization (§9) — TIDAK ADA migration/backfill, header
tercipta otomatis pada Save pertama setelah fitur aktif.

### Lock interaction
TIDAK ADA perubahan pada `withScriptLock_` itu sendiri — version-check
+ header-write ditambahkan DI DALAM blok yang SUDAH ADA (§10).

### Performance implication
+1 read serial (header, sebelum fetchAll) +1 write digabung ke fetchAll
existing (§15) — angka pasti `UNKNOWN UNTIL BENCHMARKED`, HARUS diukur
Tahap 12 sebelum/sesudah, bukan diasumsikan.

### Rollback strategy
Lihat §19 di bawah (bagian laporan terpisah sesuai struktur wajib).

---

## 19. Implementation Boundary (TIDAK DIEDIT tahap ini)

```
Client (Script_Main.html):
  - window.saveInputAbsen_ — kirim expectedVersion (didapat dari load form),
    tangani cabang response code:'attendance-conflict' (pesan + tombol
    "Muat Ulang", pola SAMA seperti cabang error lain yg sudah ada)
  - fungsi load form (pemanggil serverGetAbsensiKelasForm) — simpan
    expectedVersion dari response ke state lokal (window.iaState_)

Server (Modul_InputAbsen.gs):
  - serverGetAbsensiKelasForm — tambah baca header, return expectedVersion
  - serverSaveAbsensiKelas — tambah parameter expectedVersion, tambah
    version-check di awal blok withScriptLock_
  - serverSaveAbsensiKelasAdmin — SAMA (berbagi iaRewriteAbsensiKelas_,
    §2) — TAMBAH parameter expectedVersion jg, ATAU (alternatif desain
    yg lebih clean) pindahkan version-check KE DALAM
    iaRewriteAbsensiKelas_ itu sendiri sbg parameter tambahan, supaya
    KEDUA caller otomatis konsisten tanpa duplikasi logic — KEPUTUSAN
    detail ini utk Tahap 12, bukan diputuskan final di sini.
  - iaRewriteAbsensiKelas_ / iaRewriteAbsensiKelasFirestore_ — TITIK
    PALING MUNGKIN utk taruh version-check kalau opsi "pindah ke sini"
    di atas dipilih (satu tempat, dipakai 2 caller).

Firestore helper (Modul_Utilities.gs / Modul_FirestoreBridge.gs):
  - TIDAK PERLU fungsi generik baru — firestoreGetDoc_/firestoreUpdateDoc_/
    firestoreCreateDoc_ yang SUDAH ADA cukup utk baca/tulis header
    (collection BARU `absensi_sesi`, TAPI helper GENERIK-nya sudah ada,
    tidak perlu fungsi khusus per-collection baru).
  - Setup_Database.gs — TIDAK PERLU perubahan (collection Firestore
    baru TIDAK memerlukan "sheet header" acuan skema spt tabel Sheets
    biasa — pola existing collection Firestore-only spt `kop_surat`
    sudah membuktikan ini, lihat FILE_MAP.md).
```

**JANGAN EDIT** — daftar di atas murni PETA utk Tahap 12, TIDAK ADA
satu baris kode pun diubah tahap ini.

---

## 20. Rollback Strategy

Kalau Tahap 12 (implementasi) ternyata bermasalah setelah deploy:
- **Rollback KODE**: `git revert`/checkout ke commit SEBELUM Tahap 12
  (pola sama seperti tahap-tahap optimasi sebelumnya, Tahap 5/6/7 semua
  pernah di-cleanup-revert sepenuhnya dgn `git diff` sbg verifikasi).
- **Rollback DATA**: collection `absensi_sesi` (header) BOLEH
  DIBIARKAN/DIHAPUS setelah revert kode — TIDAK ADA data attendance
  ASLI (collection `absensi`, per-santri) yang bergantung padanya utk
  DIBACA (`iaReadAbsensiKelompokRange_` TIDAK PERNAH membaca
  `absensi_sesi`, hanya `absensi`) — artinya **collection header BOLEH
  DIHAPUS TOTAL tanpa merusak data attendance yang sudah ada**, membuat
  rollback SANGAT AMAN & RENDAH RISIKO drpd perubahan skema yang
  mengubah struktur data UTAMA.
- **Rollback PARSIAL** (kode di-revert TAPI header terlanjur dibuat):
  TIDAK BERBAHAYA — kode versi lama (tanpa version-check) SAMA SEKALI
  TIDAK MEMBACA collection `absensi_sesi`, jadi keberadaannya (dokumen
  "yatim" tanpa pembaca) TIDAK MEMPENGARUHI FUNGSI APAPUN — bisa
  dibersihkan kapan pun tanpa urgensi.

---

## 21. Supabase Migration Compatibility

Field `version` (integer counter) ADALAH pola yang SANGAT UMUM &
mudah dibawa ke Postgres/Supabase — baik sbg kolom eksplisit
(`attendance_sesi.version INTEGER`) MAUPUN digantikan native Postgres
`xmin` system column saat migrasi nanti terjadi (Tahap 10 §12 Option E
sudah menyinggung ini). **Desain Firestore ini TIDAK menyulitkan
migrasi** — konsep "1 counter per sesi kelas+tanggal" mudah diterjemahkan
jadi baris tabel `attendance_sessions` di Postgres dgn `version INTEGER`
atau bahkan dihapus sepenuhnya (diganti `xmin` bawaan) tanpa kehilangan
semantik. Sesuai instruksi prompt §19: **correctness Firestore SEKARANG
tetap prioritas di atas elegansi migrasi masa depan** — keputusan §18
TIDAK dikompromikan demi migration-friendliness, kebetulan saja
KEDUANYA selaras di sini.

---

## 22. Open Questions

- Interaksi Scenario D (§14) — kalau partial-failure (delete sukses,
  write gagal, ATAU sebaliknya) terjadi BERSAMAAN dgn window version
  belum di-increment, apakah perlu mekanisme tambahan (mis. retry
  logic/reconciliation) di luar cakupan proposal murni-concurrency
  ini? Belum dijawab, TIDAK esensial utk 3 pertanyaan FINAL RULE
  (yang fokus pada concurrency ANTAR-guru, bukan atomicity DALAM 1
  save yang sudah masalah terpisah sejak Tahap 3).
- Apakah conflict layak diaudit (§13) sbg data monitoring jangka
  panjang ("seberapa sering ini terjadi")? Diputuskan TIDAK sekarang
  (di luar cakupan/dilarang prompt), tapi PERLU dipertimbangkan ulang
  di Tahap 12 atau tahap observability terpisah.
- Nama collection `absensi_sesi` — perlu dikonfirmasi TIDAK bentrok
  dgn rencana penamaan Firestore lain (cek `FIRESTORE_KELOMPOK_TABLES_`
  dan pola penamaan existing) sebelum implementasi Tahap 12.
- Apakah `expectedVersion` sebaiknya juga dikirim balik ke
  `serverGetKelasAbsenList` (daftar kelas, BUKAN hanya
  `serverGetAbsensiKelasForm`, BUKAN form 1 kelas) — perlu ditelusuri
  APAKAH ada jalur load lain yang butuh version jg (di luar cakupan
  telusur tahap ini, `serverGetAbsensiKelasForm` sudah dikonfirmasi
  §2, TAPI belum menelusuri SEMUA client caller).

---

## FINAL OUTPUT

```
TAHAP 11 — FIRESTORE CONCURRENCY PROPOSAL

Code Changed:
NO

Firestore Changed:
NO

Production Data Changed:
NO

Lost Update:
CONFIRMED

Current Protection:
GLOBAL LOCK ONLY (mencegah interleaving, TIDAK mencegah blind overwrite)

Conflict Detection:
NOT FOUND

Recommended Strategy:
Attendance Header/Session Version (Option A) -- dokumen baru per
kelas+tanggal, integer version, dibaca+ditulis DI DALAM withScriptLock_
yang sudah ada (bukan Firestore native transaction)

Version Source:
Dokumen header BARU kelompok/{kelompokId}/absensi_sesi/{kelas}_{tanggal},
field `version` (integer) -- TIDAK ADA field version existing yang bisa
dipakai (dikonfirmasi, §3)

Conflict Point:
BEFORE DELETE (baris pertama di dalam withScriptLock_, sebelum
iaRewriteAbsensiKelas_ dipanggil)

Atomicity:
DIJAMIN OLEH LOCK APLIKASI (withScriptLock_ existing, BUKAN Firestore
transaction) -- valid selama SEMUA jalur tulis absensi tetap disiplin
lewat lock yang sama (dikonfirmasi keduanya, guru & admin, sudah begitu)

Existing Data Strategy:
First-save initialization -- currentVersion dianggap 0 kalau header
belum ada, header baru tercipta otomatis pada Save pertama setelah
fitur aktif, TIDAK ADA migration/backfill

Conflict UX:
Pesan "Data absensi sudah diperbarui oleh guru lain." + opsi Muat Ulang
Data -- TIDAK overwrite, TIDAK bilang berhasil, edit lokal guru
dipertahankan sampai guru memilih reload (desain only, UI TIDAK
diimplementasikan tahap ini)

Performance Impact:
+1 Firestore read serial (header, sebelum fetchAll existing) +1 write
digabung ke fetchAll existing -- angka pasti UNKNOWN UNTIL BENCHMARKED

Production Risk:
RENDAH untuk desain (perubahan additive, collection baru terpisah dari
data attendance utama, rollback aman -- lihat §20) -- TAPI implementasi
aktual (Tahap 12) tetap perlu before/after measurement disiplin spt
tahap-tahap sebelumnya sebelum dianggap selesai

Implementation Files:
Script_Main.html (client save+load), Modul_InputAbsen.gs
(serverGetAbsensiKelasForm, serverSaveAbsensiKelas,
serverSaveAbsensiKelasAdmin, iaRewriteAbsensiKelas_/
iaRewriteAbsensiKelasFirestore_) -- TIDAK PERLU helper Firestore baru
(firestoreGetDoc_/firestoreUpdateDoc_/firestoreCreateDoc_ generik sudah
cukup)

Rollback:
Git revert kode -- collection absensi_sesi (header) aman dibiarkan atau
dihapus, TIDAK ADA data attendance utama yang bergantung padanya (lihat
§20)

Supabase Compatibility:
SELARAS -- integer version mudah dibawa jadi kolom Postgres eksplisit
atau digantikan xmin native, tidak menyulitkan migrasi

Next:
TAHAP 12 — IMPLEMENTATION
```
