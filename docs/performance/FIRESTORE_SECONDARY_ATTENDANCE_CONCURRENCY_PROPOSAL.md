# Secondary Attendance Write-Path Concurrency Design (Tahap 14)

> Mode: **INVESTIGATION + DESIGN ONLY**. Tidak ada kode/Firestore diubah,
> tidak ada deploy, tidak ada version/collection baru dibuat, tidak ada
> concurrent production test. Tanggal: 2026-08-08. Lanjutan langsung dari
> `FIRESTORE_ATTENDANCE_WRITE_PATH_COVERAGE.md` (Tahap 13).

---

## 1. Executive Summary

Dua jalur bypass (`serverSaveAbsensiDaily`, `serverSetAbsensiSatuSantri`)
punya **granularitas domain data yang BERBEDA SATU SAMA LAIN DAN berbeda
dari Main path** — memaksakan 1 mekanisme version yang sama ("copy paste"
desain Tahap 12) akan **SALAH** utk keduanya (per prinsip §19 prompt).
Analisis domain (§4/§5) membuktikan hubungan **HIERARKIS-BERSARANG**:

```
Daily (kelompok + tanggal, SEMUA kelas)
  ⊇ Class Session (kelas + tanggal)     ← SUDAH dilindungi Tahap 12
      ⊇ Single Student (santri + tanggal, 1 dokumen)
```

**Desain yang direkomendasikan** (§15, TIDAK diimplementasikan tahap
ini): **KEDUANYA memakai HEADER `absensi_sesi/{tanggal}_{kelas}` YANG
SUDAH ADA** (BUKAN collection/field baru — sesuai FINAL RULE) —
"kompatibel", bukan "identik":

- **Daily** → **multiple class versions** (§7 opsi wajib, BUKAN 1
  aggregate) — baca+bandingkan version SEMUA kelas terdampak SEBELUM
  delete, increment SEMUA kelas terdampak SETELAH sukses. Ini membuat
  perubahan Daily OTOMATIS TERLIHAT oleh Main path yang SUDAH ADA (Main
  path TIDAK PERLU diubah lagi) — TAPI Daily SENDIRI butuh N read/write
  (N = jumlah kelas berbeda yang terdampak), bukan 1.
- **Single Student** → bump version kelas terkait SETELAH write (bukan
  SEBELUM/pre-check versi dirinya sendiri, krn operasinya inherently
  1-dokumen non-destruktif-terhadap-santri-lain) — cukup utk membuat
  Main path mendeteksinya, TIDAK butuh mekanisme baru.

**Cross-Path Conflict: CONFIRMED** utk SEMUA pasangan yang domain-nya
overlap (§6) — dibuktikan lewat trace kode aktual (Tahap 13), bukan
spekulasi ulang.

**TIDAK ADA implementasi tahap ini.** Ketiga invariant FINAL RULE
BELUM terpenuhi hari ini (TIDAK ADA proteksi apa pun di 2 jalur ini) —
desain di laporan ini adalah PROPOSAL utk Tahap 15, bukan solusi yang
sudah berjalan.

---

## 2. Daily Write Path (`serverSaveAbsensiDaily`)

Trace lengkap (Modul_MaintainAbsensi.gs:61-124, dibaca ulang tahap ini,
TIDAK berubah sejak Tahap 12/13):

```
UI        : sidebar "Absensi" (window.saveAbsensi) ATAU modal "Tambah
            Kehadiran" (window.saveIkgForm_) -- 2 caller, dikonfirmasi Tahap 13 §5
Caller    : Script_Main.html:6117 & :8712
serverSaveAbsensiDaily(token, kelompokId, tanggal, absensiList)
  ↓
validation: getCurrentUser + validateUserAccess('kelompok', kelompokId)
            + format tanggal (regex)
  ↓
[TIDAK ADA Firestore read SEBELUM lock -- santriIds dibaca dari
 readSheetAsObjects(SANTRI), BUKAN Firestore, krn santri tabel
 Firestore-nya dibaca lewat readSheetAsObjects generik yang OTOMATIS
 gabung Sheets+Firestore, Modul_Utilities.gs]
  ↓
withScriptLock_ {
    upsertList = absensiList yg santri_id-nya ada di kelompok ini
    deleteSantriIds = SEMUA santriId kelompok MINUS upsertList
    iaBulkWriteAbsensiFirestore_(delete SEMUA + upsert SEMUA, 1x fetchAll)
      ← TIDAK ADA Firestore read APA PUN sebelum delete/write (id
        deterministik, sama pola no-read-before-write dgn Main path)
}
  ↓
logAudit('absensi', 'batch_'+tanggal, 'create', ...)   [SELALU, tidak ada cabang conflict]
  ↓
response: {success:true, message:'Absensi N santri berhasil disimpan.'}
```

Jawaban §1 prompt:

```
Seluruh caller                : 2 (window.saveAbsensi, window.saveIkgForm_)
UI yang memanggil              : sidebar "Absensi" (screenAbsensi) + modal
                                  "Tambah Kehadiran" (Kehadiran Generus)
User role                      : admin_kelompok/admin_desa/admin_ppg
                                  (validateUserAccess scope 'kelompok') --
                                  BUKAN guru
Kelompok scope                 : 1 kelompok (parameter eksplisit)
Tanggal scope                  : 1 tanggal (parameter eksplisit)
Seluruh kelas terdampak?       : YA -- santriIds = SEMUA santri kelompok
                                  (readSheetAsObjects(SANTRI).filter(kelompok_id)),
                                  TIDAK ADA filter kelas sama sekali
Data seluruh kelompok
  ditulis ulang?                YA -- deleteSantriIds mencakup SEMUA santri
                                  kelompok yang TIDAK ada di absensiList yang
                                  dikirim (bukan cuma kelas tertentu)
Delete dilakukan?               YA (bagian dari iaBulkWriteAbsensiFirestore_)
Write dilakukan?                YA (upsert, batch sama)
Atomic?                         TIDAK (sama limitation warisan Main path lama
                                  -- fetchAll individual request, tidak ada
                                  rollback partial-failure, TIDAK diperbaiki
                                  di sini sesuai FINAL RULE "jangan
                                  memperbaiki bypass")
Masih dipakai guru?             TIDAK -- role scope-nya admin, guru
                                  memakai serverSaveAbsensiKelas (jalur
                                  terpisah, sudah protected)
```

---

## 3. Single Student Write Path (`serverSetAbsensiSatuSantri`)

Trace lengkap (Modul_MaintainAbsensi.gs:136-201, dibaca ulang):

```
UI               : matrix "Detail Kehadiran" (Kehadiran Generus), klik 1 sel
Caller           : window.saveKgEditCell_ (Script_Main.html:5969)
  ↓
serverSetAbsensiSatuSantri(token, kelompokId, santriId, tanggal, status)
  ↓
validation: getCurrentUser + validateUserAccess('kelompok', kelompokId)
            + format tanggal + santri harus ada di kelompok ini
            (readSheetAsObjects(SANTRI).find, MENCARI kelas_ngaji santri
             TAPI TIDAK dipakai kecuali utk validasi keberadaan --
             kelas TIDAK PERNAH jadi parameter/dipakai eksplisit
             sepanjang fungsi ini)
  ↓
withScriptLock_ {
    docId = absensiDocId_(tanggal, santriId)   ← 1 dokumen SAJA
    IF status kosong: firestoreDeleteDoc_(path, docId)
    ELSE:              firestoreUpdateDoc_(path, docId, {...})  [upsert via PATCH+mask]
    logAudit(...)   ← DI DALAM lock, TIDAK SEPERTI Main/Daily (yang audit
                       DI LUAR lock) -- perbedaan struktural minor, tidak
                       relevan thd concurrency, dicatat sbg observasi
}
  ↓
response: {success:true, status:...}
```

Jawaban §2 prompt:

```
Caller              : 1 (window.saveKgEditCell_)
Role                : admin (sama scope dgn Daily)
Kelas                : TIDAK ADA sbg parameter -- implisit via santri.kelas_ngaji
                       SAAT INI (bisa berubah kalau santri pindah kelas
                       antara load form & save, TIDAK divalidasi ulang)
Tanggal              : 1 tanggal (parameter eksplisit)
Santri               : 1 santri (parameter eksplisit) -- INI SATU-SATUNYA
                       dari 3 jalur yang scope-nya benar-benar 1 dokumen
Write semantics      : UPSERT (status terisi) ATAU DELETE (status kosong) --
                       TIDAK PERNAH "delete-banyak + write-banyak" seperti
                       Main/Daily
Hanya 1 dokumen?      YA
Ada delete?           KONDISIONAL (hanya kalau status dikosongkan) -- BUKAN
                       delete-lalu-write spt Main/Daily, melainkan
                       EITHER/OR (1 request Firestore per panggilan, bukan batch)
Audit dibuat?         YA, SELALU (delete/update/create, 3 cabang, SEMUA logAudit)
Lock digunakan?       YA (withScriptLock_ membungkus SELURUH body,
                       Modul_MaintainAbsensi.gs:157-198)
```

**Perbedaan struktural penting dari Main/Daily**: operasi ini SECARA
INHEREN "atomic per-invocation" pada level Firestore-request (1 PATCH
ATAU 1 DELETE, bukan kombinasi delete-banyak+write-banyak) — TIDAK
mewarisi masalah non-atomicity delete+write-batch yang dimiliki Main/
Daily. Ini relevan utk §12 di bawah.

---

## 4. Granularity Analysis

```
Main Class Save   : Scope = kelompok + kelas + tanggal
                     (SEMUA santri yang kelas_ngaji-nya = kelas ini, PADA
                      tanggal ini -- ditentukan Tahap 11/12, TIDAK berubah)

Daily Save        : Scope AKTUAL (dikonfirmasi kode §2, BUKAN diasumsikan)
                     = kelompok + tanggal, SEMUA KELAS SEKALIGUS
                     (santriIds = SELURUH santri kelompok, TANPA filter kelas)

Single Student     : Scope AKTUAL (dikonfirmasi kode §3)
                     = kelompok + santri + tanggal, TEPAT 1 DOKUMEN
                     (docId = absensiDocId_(tanggal, santriId) -- kelas
                      TIDAK bagian dari identity write-nya sama sekali,
                      hanya dipakai sbg validasi "santri ini ada di
                      kelompok ini" saat baca)
```

---

## 5. Concurrency Domains

```
Class Session   : {kelas, tanggal}       -- domain Main path (Tahap 12)
Daily Session   : {tanggal}              -- domain Daily (SELURUH kelas
                                             kelompok pada tanggal ini,
                                             kelompok sudah implisit dari
                                             parameter fungsi)
Student Write   : {santri, tanggal}      -- domain Single-Student, TIDAK
                                             terikat kelas eksplisit
```

**Overlap** (evidence, bukan asumsi):

- Setiap `Student Write {santri,tanggal}` **SELALU** berada DI DALAM
  TEPAT SATU `Class Session {kelas,tanggal}` — krn `deleteSantriIds`/
  `upsertList` Main path selalu difilter dari `santri.kelas_ngaji`
  (Modul_InputAbsen.gs), dan `absensiDocId_(tanggal,santriId)` yang
  ditulis Single-Student SAMA PERSIS dgn dokumen yang di-delete/upsert
  Main path utk kelas santri itu. **Overlap: SELALU, kalau kelas
  santri tsb sedang di-save Main path pada tanggal yang sama.**
- Setiap `Class Session {kelas,tanggal}` **SELALU** berada DI DALAM
  `Daily Session {tanggal}` yang SAMA (Daily mencakup SEMUA kelas) —
  krn `deleteSantriIds` Daily = SEMUA santri kelompok, superset dari
  santri kelas mana pun. **Overlap: SELALU, kalau tanggal sama.**

**Kesimpulan struktural (relevan utk §6/§19)**:

```
Daily (kelompok+tanggal)
  ⊇ Class Session (kelas+tanggal)   [setiap kelas pada tanggal itu]
      ⊇ Student Write (santri+tanggal)  [setiap santri di kelas itu]
```

Ini BUKAN 3 domain independen yang "kebetulan overlap" — ini HIRARKI
BERSARANG (nested), di mana operasi pada level LEBIH LUAS (Daily)
SELALU menyentuh SEMUA data yang dilindungi level LEBIH SEMPIT (Class,
Student). Implikasi desain: proteksi HARUS memperhitungkan arah
"turun" (level luas menimpa level sempit) DAN "naik" (level sempit
membuat level luas stale) — dianalisis §7/§8/§9.

---

## 6. Cross-Path Matrix

| Writer A | Writer B | Same Data Domain? | Conflict Possible? | Risk |
|---|---|---:|---:|---|
| Class Save | Daily | YA (Daily ⊇ Class utk tanggal sama) | **YA** | **HIGH** (Tahap 13 Scenario B, blast radius seluruh kelompok) |
| Class Save | Single Student | YA (Student ⊂ Class utk santri di kelas itu) | **YA** | **MEDIUM-HIGH** (Tahap 13 Scenario A) |
| Daily | Single Student | YA (Student ⊂ Daily, transitif via Class) | **YA** | **MEDIUM-HIGH** (Tahap 13 Scenario C) |
| Daily | Daily | YA (2 admin sama-sama menulis kelompok+tanggal sama) | **YA** (mekanisme SAMA dgn masalah asli Tahap 10, TIDAK ADA proteksi apa pun di jalur ini thd dirinya sendiri) | **MEDIUM** (butuh 2 sesi admin Daily-save simultan, likelihood LEBIH RENDAH drpd guru×admin krn Daily biasanya 1 admin per sesi koreksi) |
| Single Student | Single Student | KONDISIONAL -- YA hanya kalau SANTRI+TANGGAL SAMA (2 admin klik SEL YANG SAMA nyaris bersamaan) | **YA, TAPI JENDELA SANGAT SEMPIT** | **LOW** (1 field, self-correcting via klik ulang, blast radius minimal) |
| Admin (Class Save override) | Daily | YA (Admin override memakai `iaRewriteAbsensiKelas_` yang SAMA dgn Main path, §12 Tahap 13, jadi domain-nya identik dgn "Class Save" baris pertama) | **YA** | **HIGH** (sama dgn Class Save × Daily) |

---

## 7. Daily Path — Concurrency Design

### Option A — Multiple class versions (`absensi_sesi/{tanggal}_{kelas}`, SEMUA kelas terdampak)
Baca+bandingkan version SETIAP kelas berbeda di antara santri yang
terdampak (N kelas), SEBELUM delete. Kalau SATU SAJA mismatch → tolak
SELURUH operasi (all-or-nothing, konsisten dgn sifat Daily yang memang
sudah "semua-atau-tidak" secara desain). Setelah sukses, increment
SEMUA N header kelas itu.
- **Kompatibilitas dgn Main path**: SEMPURNA — Main path TIDAK PERLU
  diubah SAMA SEKALI, krn dia SUDAH membaca header yang SAMA PERSIS.
  Perubahan Daily jadi OTOMATIS TERLIHAT oleh Class Save berikutnya.
- **Trade-off**: N read + N write (bukan O(1) spt Main path) — TAPI
  BISA diparalelkan via `UrlFetchApp.fetchAll` (baik utk baca MAUPUN
  tulis header, teknik SAMA yang sudah dipakai `iaBulkWriteAbsensiFirestore_`)
  jadi secara LATENCY NETWORK tetap ~1 round-trip walau N besar (biaya
  Firestore/kuota tetap N request, TAPI waktu tunggu TIDAK bertambah
  linear per kelas).

### Option B — Header terpisah `absensi_harian/{tanggal}`
1 dokumen BARU per tanggal (bukan per kelas), version tunggal utk
SELURUH kelompok+tanggal.
- **Kompatibilitas dgn Main path**: **TIDAK OTOMATIS** — Main path
  (Tahap 12, SUDAH DEPLOY) TIDAK membaca collection ini SAMA SEKALI.
  Class Save yang terjadi SETELAH Daily menulis TIDAK AKAN tahu Daily
  baru saja mengubah data (krn Main path hanya cek header KELAS-nya
  sendiri, bukan header harian ini) — **kecuali Main path DIUBAH LAGI**
  utk JUGA membaca+cek header harian ini (menyentuh kode yang SUDAH
  terverifikasi Tahap 12, risiko regresi + latency tambahan di jalur
  yang PALING SERING dipakai/PALING sensitif — guru).
- **Trade-off**: O(1) read+write (SEDERHANA drpd Option A), TAPI
  proteksinya HANYA melindungi Daily×Daily (§6 baris 4), TIDAK
  melindungi Class×Daily/Student×Daily KECUALI Main path ikut diubah.

### Option C — Kelompok-level version (`kelompok+tanggal`)
**SAMA PERSIS dgn Option B secara konsep** (kelompok sudah implisit di
path Firestore `kelompok/{id}/...`, jadi "kelompok+tanggal" == "tanggal"
di dalam koleksi per-kelompok yang sudah ada) — digabung sbg 1 opsi,
bukan opsi terpisah.

### Option D — Transaction / conditional write
Firestore REST mendukung transaction native — TAPI (sama alasan Tahap
11 §7/§8) `withScriptLock_` yang SUDAH DIPAKAI Daily (dikonfirmasi §2)
SUDAH memberi jaminan mutual-exclusion yang setara SELAMA proteksi
versi (Option A/B) dibaca+ditulis DI DALAM lock yang sama — transaction
native jadi REDUNDAN, menambah round-trip tanpa manfaat correctness
tambahan. **TIDAK DIREKOMENDASIKAN**, konsisten dgn kesimpulan Tahap 11.

**Perbandingan ringkas**: Option A LEBIH KOMPLEKS TAPI kompatibel
PENUH dgn Main path TANPA menyentuhnya lagi. Option B/C LEBIH
SEDERHANA TAPI TIDAK cukup SENDIRIAN — perlu perubahan Main path
tambahan utk benar-benar menutup celah Class×Daily (risiko/skenario
paling tinggi, §6). **Direkomendasikan Option A** (§15).

---

## 8. Single-Student Path — Concurrency Design

Trace actual behavior (BUKAN nama fungsi, sesuai instruksi §8 prompt):
operasi ini menulis **1 dokumen**, TIDAK PERNAH menghapus/menimpa
dokumen SANTRI LAIN (beda fundamental dgn Main/Daily yang delete-banyak
+write-banyak). Artinya risiko "menimpa data santri lain" **TIDAK ADA**
dari sisi Single-Student SENDIRI — risikonya HANYA 1 arah: **Single-
Student BISA MENJADI KORBAN** ditimpa Main/Daily (sudah dibuktikan §6),
BUKAN sebaliknya (Single-Student TIDAK BISA menimpa santri lain krn
scope-nya memang cuma 1 dokumen).

### Option A — Full class session version (bump `absensi_sesi` milik kelas santri terkait)
Setiap Single-Student write JUGA increment version kelas milik santri
itu (lookup `santri.kelas_ngaji` SAAT write, SUDAH dibaca fungsi ini
utk validasi §3). **Ini MEMBUAT Single-Student TERLIHAT oleh Main path**
(sama logika Daily Option A) — kompatibel PENUH TANPA mengubah Main
path. **TIDAK PERLU pre-write version CHECK** (baca dulu bandingkan)
utk Single-Student SENDIRI, krn operasinya TIDAK destruktif thd santri
lain — cukup POST-write increment (fire-forward, bukan check-then-act)
utk memberi TAHU jalur lain.

### Option B — Student-level version (field version DI DALAM dokumen absensi santri itu sendiri)
Field baru `version` per-dokumen absensi (BUKAN header terpisah). BISA
melindungi 2-admin-klik-sel-sama (§6 baris 5) LEBIH presisi drpd
Option A — TAPI TIDAK otomatis terlihat Main path (Main path TIDAK
membaca field ini per santri, hanya header kelas) KECUALI Main path
diubah lagi (sama masalah Option B/C §7). **Redundant** dgn Option A
utk tujuan cross-path (Class/Daily), hanya relevan utk kasus SEMPIT
Single-Student×Single-Student.

### Option C — Conditional document update (`currentDocument.exists`/`updateTime` precondition Firestore REST)
Sama pola defense-in-depth yang disinggung Tahap 11 §7/§8 — bisa
mencegah 2 klik-sel-sama nyaris bersamaan TANPA field version
tambahan (pakai metadata `updateTime` bawaan Firestore). TIDAK
melindungi Class/Daily overlap (beda masalah, granularitas beda).

### Option D — Firestore transaction
Sama kesimpulan §7 Option D — redundan drpd lock+Option A, TIDAK
direkomendasikan sbg mekanisme utama.

### Option E — Tidak perlu proteksi (semantics-nya memang single-student mutation)
**SEBAGIAN BENAR, SEBAGIAN TIDAK** — evaluasi jujur:
- **thd DIRINYA SENDIRI** (2 Single-Student write bersamaan, santri
  BEDA): **BENAR, tidak perlu proteksi** — dokumen BEDA, TIDAK overlap
  sama sekali (bukan Option E krn "semantics single-student", tapi krn
  domain-nya memang disjoint).
- **thd DIRINYA SENDIRI, santri SAMA**: TIDAK BENAR sepenuhnya (§6
  baris 5) — TAPI risiko RENDAH (jendela sempit, 1 field, self-correcting).
- **thd Main/Daily**: **TIDAK BENAR** — Single-Student BISA jadi
  korban blind-overwrite (§6 baris 2/3, MEDIUM-HIGH risk, CONFIRMED
  Tahap 13).

**Kesimpulan**: Option E TIDAK BISA dipilih scr blanket — HANYA benar
utk sub-kasus "santri berbeda", TIDAK benar utk cross-path & santri-sama.
**Direkomendasikan Option A** (minimal, cukup utk menutup risiko
TERBESAR yaitu cross-path) + catat Option B/C sbg PENYEMPURNAAN
OPSIONAL utk sub-kasus sempit santri-sama (§18 Open Questions, BUKAN
wajib Tahap 15).

---

## 9. Critical Question (§9 prompt) — jawaban berdasarkan KODE SAAT INI

```
Guru A membuka seluruh kelas -> expectedVersion = 10 (dibaca dari
  absensi_sesi/{tanggal}_{kelas} saat form dibuka, Tahap 12)
Guru B (admin) mengubah 1 santri via serverSetAbsensiSatuSantri
  -> firestoreUpdateDoc_ LANGSUNG ke absensi/{tanggal}_{santriId}
  -> absensi_sesi/{tanggal}_{kelas} TIDAK DISENTUH SAMA SEKALI
     (dikonfirmasi §3 -- fungsi ini TIDAK PERNAH menyebut 'absensi_sesi')
  -> version TETAP 10
Guru A Save seluruh kelas -> expectedVersion=10
  -> iaRewriteAbsensiKelasFirestore_ baca header: version MASIH 10
  -> Number(10) === 10 -> MATCH -> TIDAK ADA conflict
  -> lanjut delete+upsert SELURUH kelas berdasarkan snapshot LOKAL guru A
     (yang TIDAK tahu ttg perubahan B, krn A load SEBELUM B edit)
  -> perubahan B utk santri itu TERTIMPA nilai dari form A (KECUALI
     KEBETULAN A juga mengetik nilai yang SAMA PERSIS dgn B)
  -> header naik jadi 11
```

**Ini ADALAH core cross-path scenario yang dibuktikan Tahap 13 (Scenario
A), dikonfirmasi ULANG di sini via pembacaan kode langsung** (BUKAN
diasumsikan dari laporan sebelumnya) — hasilnya **IDENTIK**: guru A
BERHASIL tanpa conflict, perubahan B **HILANG DIAM-DIAM**.

---

## 10. Data Ownership

Evaluasi BERDASARKAN BEHAVIOR AKTUAL (bukan asumsi desain database):

```
Full Class Save : YA, 1 kelas PADA 1 tanggal DIPERLAKUKAN sbg 1 logical
                   aggregate -- dibuktikan operasinya SELALU "hapus
                   SEMUA santri kelas ini yg tdk ada di form, tulis
                   ULANG SEMUA yg ada di form" -- TIDAK PERNAH partial-
                   update 1 santri dlm kelas tanpa menyentuh yg lain
                   (secara LOGIKA operasi, walau secara REQUEST Firestore
                   dipecah per-dokumen).

Single Student   : TIDAK diperlakukan sbg aggregate independen oleh
                   KODE-NYA SENDIRI -- fungsi ini MEMANG hanya menyentuh
                   1 dokumen, TAPI 1 dokumen itu SECARA LOGIS adalah
                   BAGIAN DARI aggregate "Full Class" milik kelas
                   santri itu (dibuktikan §5 -- Student Write SELALU
                   subset Class Session). Jadi: "independent" HANYA
                   scr TEKNIS (1 dokumen), TIDAK scr LOGIS (bagian dari
                   aggregate lebih besar yg dimiliki Class Save).

Daily            : YA, SELURUH kelompok PADA 1 tanggal DIPERLAKUKAN sbg
                   1 logical aggregate OLEH FUNGSI INI SENDIRI (delete-
                   SEMUA+tulis-ulang-SEMUA, TANPA pengecualian kelas) --
                   TAPI ini BERTABRAKAN dgn cara Main path memperlakukan
                   data yang SAMA sbg N aggregate TERPISAH (per kelas).
                   **Konflik model kepemilikan data inilah AKAR MASALAH
                   Tahap 13/14** -- 2 fungsi berbeda punya ASUMSI
                   BERBEDA ttg "siapa pemilik logis 1 baris attendance",
                   dan TIDAK ADA yang salah SECARA TEKNIS (keduanya jalan
                   sesuai desainnya masing-masing) -- masalahnya murni
                   di KOORDINASI ANTAR jalur, yang TIDAK PERNAH dirancang
                   sejak awal (Daily/Single-Student dibuat SEBELUM
                   konsep "class session" Tahap 10-12 ada).
```

---

## 11. Lock Analysis

| Path | Uses ScriptLock? | Lock scope | Lock starts before read? | Lock covers write? |
|---|---|---|---|---|
| Class Save (Main/Admin) | YA | Global (app-wide) | YA (header-read TERMASUK di dalam lock, Tahap 12) | YA |
| Daily | YA | Global (SAMA persis dgn Main -- 1 lock aplikasi) | TIDAK RELEVAN saat ini (TIDAK ADA read version di dalam Daily, hanya read santri di LUAR lock -- read itu bukan bagian critical-section concurrency) | YA (delete+write di dalam lock) |
| Single Student | YA | Global (SAMA) | TIDAK RELEVAN saat ini (tidak ada version read) | YA (1 operasi write di dalam lock) |

**Implikasi penting**: KETIGA jalur memakai **LOCK YANG SAMA PERSIS**
(`LockService.getScriptLock()`, app-wide, BUKAN 3 lock terpisah) — jadi
KALAU proteksi versi (§7/§8) ditambahkan DI DALAM lock yang SUDAH ADA
di masing-masing fungsi (bukan lock baru), maka **check-then-act SELALU
aman** dari interleaving ANTAR SEMUA 3 jalur (Class/Daily/Student)
SEKALIGUS — bukan cuma Class×Class spt Tahap 12, TAPI Class×Daily,
Class×Student, Daily×Student, DAN Daily×Daily/Student×Student SEMUA
otomatis ikut ter-serialisasi oleh LOCK YANG SUDAH ADA. **Tidak perlu
lock baru/diperluas** (dipatuhi FINAL RULE) — lock GLOBAL yang sudah
ada SUDAH cukup luas cakupannya utk skenario ini.

---

## 12. Atomicity

```
Class Save (Main/Admin) : read(header) -> compare -> delete+write(batch) ->
                           write(header) -- SEMUA di dalam 1 lock section --
                           TIDAK atomic thd Firestore native (no transaction),
                           TAPI check-then-act AMAN krn lock (Tahap 11/12,
                           TIDAK diulang analisisnya di sini)

Daily (CURRENT, tanpa    : delete+write(batch) -- TIDAK ADA read/compare/
  proteksi apa pun)         version-write sama sekali saat ini -- risk:
                             SUDAH dibuktikan §9/§6, TIDAK diperbaiki
                             tahap ini

Daily (PROPOSED Option A): read(N header) -> compare(N) -> delete+write(batch)
                            -> write(N header) -- SEMUA HARUS di dalam 1
                            lock section (SAMA prinsip Main path) --
                            TIDAK atomic native, TAPI aman via lock SELAMA
                            urutannya PERSIS spt ini (compare SEBELUM
                            delete, sama invariant #1 FINAL RULE)

Single Student (CURRENT) : 1 write (upsert/delete) -- TIDAK ADA read/
                            compare/version-write -- INHERENTLY atomic
                            per-request (1 dokumen, 1 REST call) TAPI
                            TIDAK melindungi dari cross-path overwrite
                            (§9)

Single Student (PROPOSED : write(1 dokumen) -> write(1 header increment)
  Option A)                 -- 2 write, TIDAK atomic thd satu sama lain
                            SECARA NATIVE, TAPI SELAMA keduanya di dalam
                            1 lock section, urutan tetap terjamin thd
                            jalur LAIN (Class/Daily) yang jg memakai lock
                            yang sama -- risiko HANYA kalau write ke-2
                            (header) gagal SETELAH write ke-1 (dokumen)
                            berhasil: dokumen SUDAH berubah TAPI header
                            TIDAK naik -- balik ke masalah asli (stale
                            version) -- HARUS didesain agar kegagalan
                            partial ini MINIMAL (mis. header-write
                            dicoba SETELAH dokumen-write berhasil, kalau
                            gagal PERLU strategi retry/log terpisah --
                            DIRANCANG Tahap 15, TIDAK diselesaikan di sini)
```

**Tidak diperbaiki** (sesuai FINAL RULE) — murni analisis risiko utk
INPUT desain Tahap 15.

---

## 13. Performance Impact

```
Baseline Tahap 12 (Main path): Version Read ≈ 372 ms median (1 header, 1 kelas)

Daily (Option A, PROPOSED):
  Additional reads       : N (N = jumlah kelas BERBEDA di antara santri
                            terdampak Daily -- bisa 1 sampai ~10 kelas
                            tergantung struktur kelompok, TIDAK ditentukan
                            di sini)
  Additional writes      : N (increment N header, SETELAH delete+upsert sukses)
  Expected round trips   : SECARA TEKNIS BISA diparalelkan (fetchAll utk
                            N read DAN N write, sama teknik yg sudah
                            dipakai iaBulkWriteAbsensiFirestore_) --
                            TAPI TETAP round-trip TAMBAHAN drpd Daily
                            CURRENT (yang 0 version-read/write sama sekali)
  Performance impact     : UNKNOWN UNTIL BENCHMARKED -- TIDAK BOLEH
                            dikarang angka. Kualitatif: KEMUNGKINAN LEBIH
                            BESAR drpd 372ms Main path (N>1 vs N=1),
                            TAPI BISA ditekan mendekati ~1 round-trip
                            network via fetchAll paralel (dampak
                            KUOTA/BIAYA Firestore tetap N request,
                            BUKAN N× LATENCY).

Single Student (Option A, PROPOSED):
  Additional reads       : 0 (Option A tahap ini = POST-write increment,
                            TIDAK perlu baca version dulu utk proteksi
                            cross-path -- lihat §8)
  Additional writes      : 1 (increment 1 header kelas terkait)
  Expected round trips   : +1 (dari 1 write murni menjadi 2 write
                            berurutan: dokumen santri + header kelas)
  Performance impact     : UNKNOWN UNTIL BENCHMARKED -- SECARA
                            PROPORSIONAL LEBIH BESAR drpd Main/Daily
                            (operasi dasarnya SANGAT ringan -- 1 klik 1
                            sel -- menambah 1 round-trip PENUH bisa
                            terasa signifikan RELATIF thd baseline-nya
                            sendiri, WALAU absolut-nya kemungkinan lebih
                            kecil drpd 372ms Main path krn hanya 1
                            dokumen kecil, bukan header+delete+upsert
                            batch)
```

**Tidak ada angka dikarang** — SEMUA ditandai `UNKNOWN UNTIL
BENCHMARKED` sesuai instruksi §13/§18 prompt.

---

## 14. Existing Data Compatibility

- **First-save initialization**: SAMA persis pola Main path (Tahap 12
  §9) — kalau header kelas belum ada saat Daily/Single-Student PERTAMA
  kali menaikkannya, `currentVersion` dianggap 0, header BARU dibuat.
  **TIDAK ADA migration/backfill** diperlukan (konsisten FINAL RULE
  "jangan migration").
- **Existing attendance TANPA header** (kelas+tanggal lama yang belum
  pernah di-save lewat Main path SEJAK Tahap 12 aktif): Daily/Single-
  Student yang menyentuhnya PERTAMA KALI (dgn proteksi Option A) akan
  membuat header BARU dgn version=1 — SAMA seperti kalau Main path yang
  membuatnya duluan. TIDAK ada perbedaan perlakuan.
- **Existing headers** (kelas yang SUDAH punya header dari Main path
  save sebelumnya): Daily/Single-Student HARUS baca version TERKINI
  (bukan asumsi 0) sebelum increment — desain §7/§8 SUDAH memperhitungkan
  ini (baca dulu, BUKAN blind-increment tanpa baca, KECUALI utk arah
  "post-write increment" Single-Student Option A yang TIDAK perlu tahu
  nilai LAMA, cukup +1 dari APA PUN nilai SAAT INI — perlu 1 read utk
  tahu nilai saat ini SEBELUM +1, TIDAK BISA blind-increment tanpa baca
  sama sekali kecuali pakai Firestore native increment operator --
  DI LUAR cakupan desain tahap ini, dicatat sbg detail implementasi
  Tahap 15).
- **Old clients** (browser guru/admin yang belum reload setelah Tahap
  15 di-deploy, MASIH menjalankan JS versi LAMA tanpa expectedVersion
  utk Daily/Single-Student): akan mengirim request TANPA parameter versi
  baru — server (Tahap 15) HARUS menangani ini GRACEFULLY (mis. anggap
  `expectedVersion=undefined` sbg "tidak ada proteksi, lewati check" UTK
  MASA TRANSISI, ATAU wajibkan semua client update dulu — **KEPUTUSAN
  INI BELUM DIAMBIL, dicatat sbg Open Question §18, bukan diputuskan
  sepihak di sini**).
- **Mixed clients** (sebagian guru pakai Input Absen versi Tahap 12
  yang SUDAH protected, admin memakai Daily versi LAMA yang BELUM
  protected sampai Tahap 15 deploy): ini ADALAH state SAAT INI
  (SEKARANG, sebelum Tahap 15) — TIDAK ADA yang berubah dari kondisi
  ini sampai Tahap 15 benar-benar diimplementasikan.
- **Rollback**: SAMA prinsip Tahap 12 (§16 laporan implementasi) —
  header `absensi_sesi` bersifat ADDITIVE, TIDAK ada perubahan skema
  attendance UTAMA yang diusulkan di sini, rollback kode Tahap 15 (kalau
  nanti diimplementasikan) TIDAK memerlukan migrasi data balik apa pun.

---

## 15. Recommended Design

```
Daily Path:
  Strategy = Option A -- Multiple class versions (baca+bandingkan SEMUA
  header kelas terdampak SEBELUM delete, increment SEMUA header itu
  SETELAH sukses; all-or-nothing conflict -- SATU kelas mismatch = TOLAK
  SELURUH operasi Daily)

Single Student Path:
  Strategy = Option A minimal -- POST-write increment 1 header kelas
  terkait (TANPA pre-write check thd dirinya sendiri, krn operasinya
  TIDAK destruktif thd santri lain) -- CUKUP utk membuat perubahan
  TERLIHAT oleh Main/Daily berikutnya. Sub-kasus santri-sama-diedit-2-
  admin-bersamaan TIDAK tertutup penuh oleh strategi minimal ini (dicatat
  §18, prioritas RENDAH, LOW risk).

Cross-path protection:
  MEKANISME: SEMUA jalur (Main, Daily, Single-Student) membaca/menulis
  header `absensi_sesi/{tanggal}_{kelas}` YANG SAMA (Tahap 12, TIDAK ADA
  collection baru) -- "kompatibel" (§19 prinsip desain), BUKAN "identik"
  (Daily/Single-Student TIDAK memakai mekanisme check-before-write yang
  SAMA PERSIS dgn Main path, krn kebutuhan atomicity-nya beda -- lihat
  §7/§8/§12).
```

### Why
Hierarki bersarang (§5) membuktikan SEMUA 3 jalur pada akhirnya
menyentuh DOKUMEN yang SAMA di collection `absensi` — header PER-KELAS
yang SUDAH ADA (Tahap 12) adalah SATU-SATUNYA sumber kebenaran yang
sudah TERVERIFIKASI (PASS semua test) dan TIDAK PERLU diubah lagi kalau
Daily/Single-Student ikut menulis/membacanya dgn cara yang SESUAI
domain masing-masing.

### Conflict Point
- **Daily**: SEBELUM delete SELURUH kelompok (baca N header, bandingkan,
  tolak SEBELUM 1 pun request delete dikirim — SAMA prinsip invariant
  #1 Tahap 12, diperluas ke N kelas).
- **Single Student**: TIDAK ADA conflict-point pre-write utk versi
  minimal (§8) — HANYA post-write signal. (Kalau Open Question §18
  perihal santri-sama-2-admin dijawab "perlu diperbaiki" di masa depan,
  conflict point-nya akan SEBELUM 1 write dokumen itu sendiri.)

### Version Source
`absensi_sesi/{tanggal}_{kelas}` (SAMA PERSIS collection/dokumen Tahap
12, TIDAK ADA collection/field baru — dipatuhi FINAL RULE).

### Atomicity
Dijamin `withScriptLock_` yang SUDAH ADA di KETIGA jalur (§11) — BUKAN
Firestore native transaction (konsisten kesimpulan Tahap 11).

### Existing Data
First-save initialization, TIDAK ADA migration (§14).

### Performance
UNKNOWN UNTIL BENCHMARKED utk KEDUANYA (§13) — Daily berpotensi LEBIH
MAHAL drpd Main path (N>1), Single-Student berpotensi LEBIH RINGAN
absolut TAPI LEBIH BERAT PROPORSIONAL (dari 1 write jadi 2).

### UX
Lihat §16 di bawah — BEDA per jalur, TIDAK bisa 1 kontrak UX yang sama
persis dgn Main path (Tahap 12 §10/§11).

### Rollback
Additive, aman (§14) — sama prinsip Tahap 12.

---

## 16. UI/UX Contract

```
Daily Path:
  expectedVersion  : DIPERLUKAN, TAPI bentuknya BEDA dari Main path --
                      BUKAN 1 angka, melainkan MAP {kelas: version}
                      (krn Daily menyentuh N kelas sekaligus) -- client
                      (window.saveIkgForm_/window.saveAbsensi) perlu
                      membawa snapshot versi SEMUA kelas yang relevan,
                      diperoleh dari server saat form dibuka
                      (serverGetAbsensiForm perlu diperluas -- BELUM
                      didesain detailnya, Tahap 15)
  Conflict response : YA diperlukan -- "Sebagian data absensi sudah
                      diperbarui pihak lain sejak form ini dibuka."
                      (bahasa BERBEDA dari Main path krn scope-nya
                      lintas-kelas, TIDAK bisa bilang "kelas ini" saja)
  Reload action     : YA -- "Muat Ulang Data" (pola SAMA Main path,
                      reuse konsep, TIDAK harus reuse KODE persis krn
                      UI-nya beda -- modal vs screen)
  Local preservation: YA -- SAMA prinsip Main path (jangan reset
                      otomatis, guru/admin pilih kapan reload)

Single Student Path:
  expectedVersion  : TIDAK DIPERLUKAN di sisi CLIENT utk strategi minimal
                      (§8/§15 -- POST-write increment tidak butuh client
                      membawa versi apa pun, krn tidak ada pre-write
                      check)
  Conflict response : TIDAK ADA (strategi minimal TIDAK PERNAH menolak
                      write Single-Student itu sendiri)
  Reload action     : TIDAK RELEVAN utk strategi minimal
  Local preservation: TIDAK RELEVAN (operasi 1-klik-1-sel, tidak ada
                      "form" dgn state lokal yang perlu dipertahankan
                      lintas waktu spt Main/Daily)
```

**Catatan**: KALAU Open Question §18 (santri-sama-2-admin) suatu saat
diputuskan perlu diperbaiki, Single-Student AKAN butuh
expectedVersion/conflict-response/reload SENDIRI (per-dokumen, bukan
per-kelas) — DI LUAR cakupan rekomendasi minimal tahap ini.

---

## 17. Safe Test Plan (RANCANGAN, TIDAK DIEKSEKUSI)

```
Daily (proteksi PROPOSED, hipotetis -- belum ada kode utk diuji):
  QA A loads daily (snapshot versi N-kelas)
  QA B loads daily (snapshot SAMA)
  A save -> expected: SUCCESS, SEMUA N header naik
  B save (masih bawa snapshot lama) -> expected: CONFLICT, NO DELETE

Single Student (proteksi PROPOSED):
  QA A loads class (expectedVersion=X, Main path)
  QA B changes 1 student (serverSetAbsensiSatuSantri, PROPOSED: header
    kelas ikut naik ke X+1)
  A saves class dgn expectedVersion=X (stale, krn B sudah menaikkannya)
  -> expected: CONFLICT (BEDA dari behavior SAAT INI yang MATCH, §9) --
     INI PERBAIKAN UTAMA yang diharapkan Tahap 15

Cross-path -- Class Save vs Single Student:
  (sama skenario di atas, tapi verify SPESIFIK: apakah Main path
   MENOLAK dgn benar SETELAH Single-Student proteksi ditambahkan)

Cross-path -- Daily vs Class Save:
  QA A loads class X (expectedVersion=Y)
  QA B (admin) Daily-save mencakup kelas X dgn snapshot header LAMA
  -> PROPOSED: Daily HARUS baca header kelas X SEBELUM delete -> kalau
     A belum save, header X BELUM berubah -> Daily lolos, naikkan
     header X -> Y+1
  A save dgn expectedVersion=Y (sekarang stale krn Daily) -> expected:
     CONFLICT (Main path SUDAH otomatis mendeteksi ini TANPA perlu
     diubah, krn header yg dibaca SAMA)
```

**TIDAK DIEKSEKUSI tahap ini** (investigation+design only, sesuai FINAL
RULE) — rancangan disiapkan utk Tahap 15.

---

## 18. Recommendation Matrix

| Path | Recommended Strategy | Why | Added Reads | Added Writes | Risk (setelah proteksi, ESTIMASI KUALITATIF) |
|---|---|---|---:|---:|---|
| Main Class | Existing session version (Tahap 12, TIDAK berubah) | Sudah PASS semua test, tidak perlu desain baru | 1 (sudah ada) | 1 (sudah ada) | LOW (sudah protected thd sesama Main/Admin) |
| Admin Class | Existing session version (Tahap 12, sama fungsi dgn Main) | Sama fungsi persis, tidak perlu desain terpisah | 1 (sudah ada) | 1 (sudah ada) | LOW |
| Daily | Option A -- Multiple class versions | Satu-satunya opsi yang kompatibel PENUH dgn Main path TANPA mengubahnya lagi | N (paralel via fetchAll) | N (paralel via fetchAll) | MEDIUM (turun dari HIGH SAAT INI -- TIDAK bisa full LOW krn kompleksitas N-kelas tetap ada) |
| Single Student | Option A minimal -- post-write increment | Cukup utk menutup risiko TERBESAR (cross-path dgn Main/Daily) TANPA over-engineering utk sub-kasus sempit | 0 | 1 | LOW-MEDIUM (turun dari MEDIUM-HIGH SAAT INI -- sub-kasus santri-sama-2-admin TETAP tersisa, LOW likelihood) |

---

## 19. Implementation Boundary (PREVIEW, TIDAK DIEDIT)

```
Daily:
  Modul_MaintainAbsensi.gs -> serverSaveAbsensiDaily
    + logic: kelompokkan santriIds terdampak per kelas_ngaji, baca N
      header (fetchAll GET), bandingkan expectedVersions (map dari
      client), tolak SEBELUM delete kalau ADA mismatch, increment N
      header (fetchAll PATCH/POST) SETELAH delete+upsert sukses
  Modul_MaintainAbsensi.gs -> serverGetAbsensiForm
    + return snapshot versi per-kelas (map) utk dibawa client balik

Single Student:
  Modul_MaintainAbsensi.gs -> serverSetAbsensiSatuSantri
    + logic: SETELAH write dokumen berhasil, baca+increment 1 header
      kelas (lookup kelas_ngaji santri, SUDAH dibaca fungsi ini)

Client:
  Script_Main.html -> window.saveIkgForm_/window.saveAbsensi (Daily)
    + bawa map expectedVersion per-kelas, tangani cabang conflict BARU
  Script_Main.html -> window.saveKgEditCell_ (Single-Student)
    + TIDAK PERLU perubahan signifikan (strategi minimal TIDAK
      menambah conflict response di jalur ini)

Shared helper:
  Modul_InputAbsen.gs -> iaAbsensiSesiPath_/absensiSesiDocId_ (Tahap 12,
    SUDAH ADA) -- REUSE LANGSUNG, TIDAK PERLU helper baru krn collection/
    format id-nya SUDAH ADA & SUDAH TERVERIFIKASI
```

**JANGAN EDIT** — murni peta preview Tahap 15, TIDAK ada kode diubah
tahap ini.

---

## 20. Open Questions

- **Old/mixed client handling** (§14) — bagaimana server memperlakukan
  request Daily/Single-Student TANPA `expectedVersion` (client belum
  update)? Perlu keputusan eksplisit sebelum Tahap 15 (grace period vs
  wajib update serentak).
- **Single-Student santri-sama-2-admin** (§8/§18) — apakah risiko LOW
  ini cukup rendah utk DITERIMA tanpa proteksi tambahan (Option B/C
  §8), atau user ingin ditutup juga? Keputusan PRODUK, bukan teknis
  murni.
- **Sidebar "Absensi" masih dipakai?** (warisan Open Question Tahap 13,
  BELUM terjawab) — kalau ternyata TIDAK dipakai lagi, salah satu dari
  2 UI Daily bisa di-deprecate, MENGURANGI urgensi/scope Tahap 15 utk
  jalur itu (walau modal "Tambah Kehadiran" TETAP perlu proteksi
  independen dari keputusan ini).
- **Partial-failure header-increment Single-Student** (§12) — kalau
  write dokumen sukses TAPI write header increment gagal (network),
  strategi retry/reconciliation BELUM dirancang — perlu keputusan
  desain eksplisit di Tahap 15, bukan diasumsikan "jarang terjadi".
- **Firestore native increment operator** (`fieldTransforms`,
  disinggung §14) — BISA menyederhanakan Single-Student's post-write
  increment (TANPA perlu baca versi lama dulu) TAPI belum diverifikasi
  apakah REST API bridge project ini (`Modul_FirestoreBridge.gs`)
  mendukungnya — perlu investigasi TERPISAH sebelum Tahap 15
  mengasumsikan ini tersedia.
