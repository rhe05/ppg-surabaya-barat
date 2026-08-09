# Attendance Concurrency & Lost Update Analysis (Tahap 10)

> Mode: **INVESTIGATION ONLY**. Tidak ada kode/Firestore/Sheets/schema
> yang diubah. Tidak ada lock/version field ditambahkan. Tidak ada
> concurrent write production dijalankan. Tanggal: 2026-08-08.

---

## 1. Executive Summary

**Lost update: CONFIRMED secara code-level** (bukan spekulasi) — 2 guru
(atau 1 guru dari 2 sesi/tab berbeda) yang menyimpan **kelas + tanggal
yang SAMA** akan menghasilkan **last-write-wins TANPA deteksi konflik
apa pun**. Mekanismenya BUKAN race-condition-korup (lock global sudah
men-SERIALISASI kedua operasi tulis Firestore, jadi tidak ada
interleaving byte-level) — melainkan **blind overwrite berurutan**:
guru KEDUA yang berhasil dapat lock akan menghapus+menulis ulang absensi
kelas itu berdasarkan STATE LOKAL DI BROWSERNYA SENDIRI (yang tidak tahu
apa-apa tentang perubahan guru pertama), sehingga perubahan guru pertama
utk santri yang overlap **hilang permanen, tanpa notifikasi ke guru
mana pun**.

**Scope risiko TERBATAS**: HANYA terjadi kalau 2 sesi (guru mana pun)
punya akses SIMULTAN ke KELAS+TANGGAL yang SAMA. Kelas berbeda ATAU
tanggal berbeda = AMAN (dibuktikan via `absensiDocId_` = `tanggal_santriId`,
scope disjoint). Skenario paling realistis: (a) guru pemilik kelas +
guru pengganti yang dapat akses via `akses_kelas_request` approved utk
tanggal yang sama, keduanya menyimpan tanpa koordinasi; (b) 1 guru
membuka 2 tab/device bersamaan (Tahap 9's client guard TIDAK melindungi
lintas-tab).

**Tidak ada mekanisme deteksi konflik apa pun** ditemukan di codebase
(`version`/`updated_at`/`revision`/`ETag`/Firestore transaction/conditional
write — SEMUA `NOT FOUND`, dikonfirmasi grep menyeluruh). `audit_log`
MENCATAT kedua save (2 baris terpisah, user berbeda), TAPI **tidak
menyimpan nilai per-santri yang di-overwrite** — cukup utk FORENSIK
("siapa & kapan"), TIDAK CUKUP utk RECOVERY ("apa yang hilang").

---

## 2. Current Attendance Write Flow

Trace kode aktual (`Modul_InputAbsen.gs`, TIDAK berubah sejak Tahap 3/9):

```
Guru A: buka kelas → serverGetKelasAbsenList/serverGetAbsensiKelasForm
        → baca absensi existing (iaReadAbsensiKelompokRange_) → tampil di browser A
Guru B: buka kelas (SAMA) → baca ULANG absensi existing (independen dari A)
        → tampil di browser B (snapshot terpisah, TIDAK sinkron dgn A)
Guru A: edit status di browser (client-side, window.iaState_.list, TIDAK ada
        komunikasi ke server sampai klik Simpan)
Guru B: edit status di browser (SAMA, independen)
Guru A: klik Simpan → saveInputAbsen_ (client) → google.script.run
        → serverSaveAbsensiKelas(token, kelas, tanggal, absensiListA)
          → requireGuruContext_ (auth)
          → canGuruAccessKelas_ (baca cached akses_kelas_request/jadwal_kbm)
          → iaValidateWaktuAbsen_ (waktu sesi)
          → iaCekGuruSedangIzin_ (baca cached guru_izin)
          → santriIdsKelas = SEMUA santri kelas ini SAAT INI (fresh read)
          → withScriptLock_ { iaRewriteAbsensiKelas_(... absensiListA ...) }
              → deleteSantriIds = santriIdsKelas MINUS santri_id di absensiListA
              → iaBulkWriteAbsensiFirestore_: DELETE deleteSantriIds + PATCH absensiListA
                (SEMUA dlm 1 UrlFetchApp.fetchAll, dokumen id = tanggal_santriId)
          → logAudit (DI LUAR lock)
          → return {success:true}
Guru B: klik Simpan (kapan pun, SEBELUM atau SESUDAH Guru A) → ALUR SAMA PERSIS
        dgn absensiListB (state browser B, TIDAK tahu ttg absensiListA)
```

**Titik krusial**: `santriIdsKelas` (line 639-641) SELALU dihitung ULANG
dari data SANTRI TERKINI (bukan dari snapshot yang guru muat), TAPI
`absensiList` (nilai STATUS per santri) SELALU berasal dari STATE
LOKAL BROWSER guru yang menyimpan — **tidak pernah dibandingkan dengan
apa yang SUDAH ADA di server saat ini**.

---

## 3. Attendance Identity

**"Satu attendance session" secara AKTUAL** (bukan konsep, dari kode):

- **Level record individual**: `kelompok_id + tanggal + santri_id` —
  document ID Firestore = `absensiDocId_(tanggal, santriId)` =
  **`tanggal_santriId`** (Modul_Utilities.gs:451), path
  `kelompok/{kelompokId}/absensi/{tanggal_santriId}`. **TIDAK ADA
  `kelas` dalam document ID** — kelas HANYA dipakai utk MENENTUKAN
  santri MANA yang termasuk dlm operasi (via `santri.kelas_ngaji`),
  BUKAN bagian dari identitas dokumen itu sendiri.
- **Level operasi "Save"**: `kelompok_id + kelas + tanggal` — inilah
  yang menentukan SCOPE `deleteSantriIds`/`upsertList` dalam 1 panggilan
  `serverSaveAbsensiKelas` (komentar kode eksplisit: "Hanya
  menghapus/menulis ulang baris absensi milik santri DI KELAS INI").

**Konsekuensi penting**: karena identity SEBENARNYA adalah PER-SANTRI
(bukan per-kelas), 2 "Save" DENGAN KELAS BERBEDA otomatis AMAN (santri
disjoint, lihat §7 Scenario B) — TAPI 2 "Save" DENGAN KELAS+TANGGAL
YANG SAMA beroperasi pada **HIMPUNAN DOKUMEN YANG IDENTIK** (santri yang
sama, tanggal yang sama) — inilah akar `lost update`.

---

## 4. Delete-Then-Write Mechanism

Trace `iaBulkWriteAbsensiFirestore_` (Modul_InputAbsen.gs:526-569,
TIDAK berubah sejak Tahap 3):

1. **Kapan delete dilakukan?** Dalam BATCH YANG SAMA dgn write (SEMUA
   request — DELETE dan PATCH — dimasukkan ke SATU array `requests[]`,
   dikirim via SATU `UrlFetchApp.fetchAll(requests)`). **TIDAK ADA fase
   "delete dulu, baru write"** yang terpisah secara temporal — keduanya
   dikirim PARALEL dlm 1 panggilan jaringan.
2. **Scope delete**: HANYA santri yang ADA di `santriIdsKelas` (roster
   kelas SAAT INI) TAPI TIDAK ADA di `absensiList` yang dikirim guru
   yang MENYIMPAN SAAT ITU — scope ini dihitung ULANG SETIAP save,
   TIDAK mempedulikan apakah ADA guru lain yang baru saja mengubah data.
3. **Kapan write (patch) dilakukan?** SAMA — dalam batch `fetchAll`
   yang sama dgn delete.
4. **Apakah delete dan write atomic?** **TIDAK** (lihat §6).
5. **Apakah dalam 1 transaction?** **TIDAK** — TIDAK ADA
   `runTransaction`/`:commit`/`:batchWrite` Firestore dipakai (dikonfirmasi
   grep `Modul_FirestoreBridge.gs`: 0 hasil utk `transaction`/`:commit`/
   `batchWrite`). Murni N request `DELETE`/`PATCH` individual paralel.
6. **Apakah Firestore batch/commit digunakan?** **TIDAK** (sama seperti
   poin 5 — `iaBulkWriteAbsensiFirestore_` memakai endpoint dokumen
   individual, `{baseUrl}/kelompok/{id}/absensi/{docId}`, BUKAN
   `:commit`).
7. **Apakah failure di tengah proses bisa meninggalkan partial state?**
   **YA** — kalau salah satu dari N request gagal (network/quota/dll),
   request LAIN yang SUDAH terkirim paralel TETAP diproses Firestore
   (tidak ada rollback), sementara `serverSaveAbsensiKelas` MELEMPAR
   exception (lihat `iaBulkWriteAbsensiFirestore_` baris 558-566: `if
   (code<200||code>=300) throw new Error(...)` — dicek SETELAH semua
   response diterima, TIDAK bisa mencegah request lain yang sudah jalan).

**TIDAK diubah** — trace murni observasi, konsisten dgn temuan Tahap 3.

---

## 5. Lock Analysis

`withScriptLock_` (Modul_Utilities.gs:462-472, TIDAK berubah):

```js
function withScriptLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { throw new Error(...); }
  try { return fn(); } finally { lock.releaseLock(); }
}
```

- **Apakah `serverSaveAbsensiKelas` memakai lock?** YA.
- **Kapan diperoleh?** TEPAT SEBELUM `iaRewriteAbsensiKelas_` dipanggil
  (Modul_InputAbsen.gs:650) — SETELAH SEMUA validasi (auth, akses,
  waktu, izin) selesai.
- **Kapan dilepas?** SEGERA SETELAH `iaRewriteAbsensiKelas_` selesai
  (termasuk Firestore write-nya, `finally` block) — SEBELUM `logAudit`
  dipanggil.
- **Apakah lock mencakup delete?** YA (bagian dari
  `iaRewriteAbsensiKelas_` yang dibungkus lock).
- **Apakah lock mencakup Firestore write?** YA (SAMA, delete+write
  dikirim bersamaan dlm 1 `fetchAll`, SEMUA di dalam lock).
- **Global atau scoped?** **GLOBAL** — `LockService.getScriptLock()`
  SATU lock utk **SELURUH APLIKASI** (semua kelompok, semua kelas,
  semua fungsi mutasi yang memakai `withScriptLock_`, TIDAK HANYA
  attendance) — dikonfirmasi TIDAK ADA parameter/key apa pun ke
  `getScriptLock()`.
- **Apakah lock mencegah 2 guru menyimpan KELAS YANG SAMA saling
  menimpa?** **TIDAK** — lock HANYA menjamin `iaRewriteAbsensiKelas_`
  guru A SELESAI TOTAL (termasuk Firestore write-nya) SEBELUM guru B
  MULAI `iaRewriteAbsensiKelas_`-nya (mencegah interleaving REQUEST
  Firestore individual dari A dan B tercampur) — **TAPI TIDAK
  MEMBANDINGKAN** apakah state yang B tulis konsisten dgn apa yang A
  BARU SAJA tulis. B tetap BEBAS menimpa SELURUH hasil A begitu
  gilirannya tiba, krn `iaRewriteAbsensiKelas_` TIDAK PERNAH membaca
  "apa yang baru ditulis guru lain" — hanya mengeksekusi
  `absensiList`-nya SENDIRI secara BUTA.
- **Apakah lock mencegah 2 guru BEDA KELAS bersamaan?** SECARA
  DATA: TIDAK PERLU dicegah (dokumen disjoint, aman scr korrektness) —
  TAPI lock GLOBAL tetap MEMAKSA mereka antre (satu tunggu yang lain
  selesai, walau operasinya independen) — **efek SAMPING NEGATIF pada
  LATENCY, bukan pada correctness** (temuan konsisten dgn Tahap 2/3).

**⚠️ Kesimpulan eksplisit sesuai instruksi**: **"ADA lock" TIDAK SAMA
DENGAN "concurrency aman"** — lock ini menyelesaikan masalah
INTERLEAVING (byte-level corruption antar-request), TAPI TIDAK
menyelesaikan masalah LOST UPDATE (blind sequential overwrite).

---

## 6. Atomicity Analysis

**Delete + Write = NON-ATOMIC** (dikonfirmasi §4 poin 4-6). Analisis
skenario kegagalan (TANPA perbaikan, murni dokumentasi):

| Skenario | Dampak |
|---|---|
| Failure during delete | Request DELETE lain (paralel) + SEMUA request PATCH TETAP diproses Firestore (tidak ter-rollback) — hasil: sebagian santri "seharusnya dihapus" (dikeluarkan dari form) TAPI masih ada datanya di Firestore |
| Failure during write | Request PATCH lain + SEMUA DELETE TETAP diproses — hasil: sebagian santri "seharusnya di-upsert" TAPI datanya TIDAK berubah/tidak ada |
| Partial write | Kombinasi keduanya — state akhir Firestore BISA jadi campuran "sebagian sesuai form baru, sebagian sesuai form lama, sebagian kosong" — TIDAK ADA cara klien tahu KOMBINASI PERSIS mana yang terjadi dari 1 pesan error generik |
| Timeout SETELAH server-side sukses | Server SUDAH selesai (data benar tersimpan), TAPI respons tidak sampai ke klien (network drop pulang) — guru MELIHAT error, MUNGKIN retry — retry AMAN dari sisi KONTEN (idempotent, upsert nilai sama) TAPI TIDAK AMAN dari sisi LOST-UPDATE kalau ADA guru LAIN yang sempat save DI ANTARA kegagalan-response dan retry guru ini |
| Client disconnect | Eksekusi Apps Script server TETAP JALAN SAMPAI SELESAI (dikonfirmasi Tahap 8/9) — data TETAP tersimpan benar, guru hanya tidak melihat konfirmasi |
| Retry (manual, TIDAK ADA retry otomatis) | Aman dari sisi KONTEN (idempotent per-guru), TAPI **retry SETELAH guru lain sempat save DI TENGAH** = re-introduce lost-update thd perubahan guru lain itu (guru yang retry akan MENIMPA LAGI, kali ini menimpa hasil guru lain yang menyimpan sela waktu itu) |

---

## 7. Concurrency Scenarios

### Scenario A — Same class, same date

```
Guru A → load (snapshot A)
Guru B → load (snapshot B, independen)
Guru A → edit lokal
Guru B → edit lokal
Guru A → save → lock diperoleh → delete+write (versi A) → lock lepas → sukses
Guru B → save → lock diperoleh → delete+write (versi B, TIDAK tahu ttg versi A) → lock lepas → sukses
```

**Final state**: **VERSI B** utk SEMUA santri yang ada di `absensiList`
B (menimpa versi A sepenuhnya utk santri overlap). Kalau B TIDAK
menyertakan santri tertentu yang ADA di versi A (mis. B loading SEBELUM
santri itu ditambah ke kelas), santri itu malah **TERHAPUS** (masuk
`deleteSantriIds` versi B, krn tidak ada di `absensiList` B). **Guru A
TIDAK MENDAPAT NOTIFIKASI APA PUN** bahwa hasilnya tertimpa — Guru A
sudah menerima respons "sukses" SEBELUM Guru B menyimpan, tidak ada
mekanisme push/refresh yang memberi tahu A belakangan.

### Scenario B — Different classes

```
Guru A → Kelas A (santri set X)
Guru B → Kelas B (santri set Y, DISJOINT dari X — 1 santri hanya 1 kelas_ngaji)
```

**TIDAK saling memengaruhi secara DATA** — `absensiDocId_(tanggal,
santriId)` utk santri di X vs Y SELALU BERBEDA (santri_id berbeda).
**HANYA saling memengaruhi via LOCK GLOBAL** (satu menunggu yang lain
selesai memegang `withScriptLock_`, dampak LATENCY bukan correctness).

### Scenario C — Same class, different dates

```
Guru A → Kelas A, tanggal T1
Guru B → Kelas A, tanggal T2 (T1 ≠ T2)
```

**TIDAK saling memengaruhi** — `absensiDocId_` menyertakan `tanggal`
sbg bagian id (`tanggal_santriId`), jadi T1 dan T2 menghasilkan
DOCUMENT ID YANG BERBEDA TOTAL utk SETIAP santri, walau kelas & santri
sama. AMAN scr data (sama dgn Scenario B, hanya beririsan di lock
global utk latency).

### Scenario D — Same teacher, two browser sessions

```
Guru X → Tab/Device 1, Kelas A tanggal T
Guru X → Tab/Device 2 (SAMA guru_id), Kelas A tanggal T (SAMA)
```

**IDENTIK secara mekanisme dgn Scenario A** — server TIDAK PEDULI
apakah 2 sesi berasal dari guru yang SAMA atau BERBEDA; yang menentukan
hasil HANYA kelas+tanggal (dokumen target) + urutan siapa dapat lock
LEBIH DULU. **POSSIBLE**, dan REALISTIS terjadi (guru buka app di HP +
laptop bersamaan, atau 2 tab krn lupa sudah buka sebelumnya) — bahkan
MUNGKIN LEBIH SERING terjadi drpd Scenario A murni (2 guru berbeda
butuh koordinasi akses eksplisit via `akses_kelas_request`, sedangkan
guru yang sama di 2 device tidak butuh apa-apa, bisa terjadi tanpa
sadar).

### Scenario E — Double submit from same browser

**Client guard Tahap 9 (`window.iaState_.saving`) MENCEGAH ini PADA 1
TAB YANG SAMA** — dikonfirmasi kode `Script_Main.html:saveInputAbsen_`,
guard `if (window.iaState_.saving) return;` di baris paling awal fungsi,
`window.iaState_` adalah state JS DALAM 1 EKSEKUSI HALAMAN (1 tab), jadi
klik ganda pada TAB YANG SAMA tidak akan pernah menghasilkan 2 panggilan
`google.script.run`. **NAMUN, sesuai instruksi eksplisit tahap ini**:
**client guard BUKAN concurrency-control server** — guard ini TIDAK
berlaku LINTAS TAB/DEVICE (Scenario D) DAN TIDAK berlaku LINTAS GURU
(Scenario A) krn `window.iaState_` adalah memori JavaScript LOKAL per
tab-browser, TIDAK PERNAH disinkronkan ke server atau ke sesi lain.

---

## 8. Lost Update Determination

```
Lost Update:
CONFIRMED
```

**Exact code path yang membuktikan** (SEMUA baris di bawah TIDAK
berubah sejak awal, dikonfirmasi via pembacaan langsung tahap ini):

1. `Modul_InputAbsen.gs:639-641` — `santriIdsKelas` dihitung dari data
   SANTRI TERKINI (fresh), TAPI **`absensiList` (parameter fungsi,
   BUKAN dibaca ulang dari server) adalah STATE BROWSER PENGIRIM
   SEMATA** — tidak ada perbandingan dgn state Firestore SAAT INI.
2. `Modul_InputAbsen.gs:503-513` (`iaRewriteAbsensiKelasFirestore_`) —
   `deleteSantriIds` dihitung HANYA dari `santriIdsKelas` vs
   `absensiList` PENGIRIM — **TIDAK PERNAH membaca dokumen Firestore
   yang SUDAH ADA sebelum memutuskan apa yang dihapus/ditulis** (upsert
   tanpa read, by design — Tahap 3 dokumentasikan ini sbg OPTIMASI YANG
   DISENGAJA, TAPI efek sampingnya adalah TIDAK ADA titik utk deteksi
   konflik).
3. `Modul_InputAbsen.gs:526-556` (`iaBulkWriteAbsensiFirestore_`) —
   `PATCH` per dokumen TANPA `currentDocument.updateTime`/precondition
   apa pun di query string (hanya `updateMask.fieldPaths`, TIDAK ADA
   parameter precondition Firestore REST spt
   `currentDocument.updateTime=...` yang BISA dipakai utk conditional
   write) — **setiap PATCH SELALU berhasil menimpa APA PUN yang ada di
   dokumen itu saat ini**, terlepas kapan terakhir diubah/oleh siapa.

**Kesimpulan**: TIDAK ADA satu pun titik kode di jalur ini yang
membandingkan "apa yang guru INGIN ubah" dgn "apa yang SUDAH ada di
server saat write terjadi" — LOST UPDATE BUKAN edge-case yang mungkin
lolos, melainkan **behavior yang PASTI terjadi** setiap kali 2 sesi
menyimpan kelas+tanggal yang sama dgn nilai BERBEDA utk santri yang
sama, TERLEPAS dari timing PERSISNYA (asal keduanya AKHIRNYA
mendapat giliran lock, hasilnya SELALU "yang terakhir menang").

---

## 9. User/Data Impact

### Data
- **Absensi guru pertama hilang?** YA, utk SEMUA santri yang statusnya
  BERBEDA antara submission A dan B (di-overwrite oleh nilai B).
- **Sebagian data hilang?** BISA sebagian (kalau HANYA sebagian santri
  overlap dgn status berbeda) ATAU **seluruh kelas** (kalau B submit
  utk SEMUA santri dgn nilai berbeda dari A, atau bahkan kalau B
  submit absensiList yang TIDAK menyertakan sebagian santri yang ADA
  di versi A → santri itu **DIHAPUS**, bukan cuma "status lama
  bertahan").
- **Audit log tetap mencatat kedua save?** YA — lihat §10.

### UX
**Guru TIDAK PERNAH diberi tahu bahwa datanya ditimpa.** Guru A
menerima modal sukses ("Alhamdulillah, Absen Berhasil Disimpan") SAAT
ITU JUGA — respons ini 100% JUJUR pada saat diterima (data A memang
benar tersimpan SAAT itu), TAPI TIDAK ADA mekanisme apa pun (push
notification, polling, refresh-check) yang memberi tahu A BELAKANGAN
kalau datanya sudah ditimpa guru lain. Guru A akan MENGIRA absennya
tersimpan dgn benar SELAMANYA, kecuali dia SECARA MANUAL membuka
kembali kelas itu & memperhatikan nilainya BERBEDA dari yang dia
inginkan.

### Recovery
**Data lama TIDAK DAPAT DIPULIHKAN dari sistem** — Firestore PATCH
menimpa field, TIDAK ADA versioning/history dokumen yang disimpan
aplikasi ini (Firestore SENDIRI punya "document history" internal di
level infrastruktur GCP untuk keperluan tertentu, TAPI aplikasi ini
TIDAK mengakses/memakai fitur itu — di luar cakupan/pengetahuan kode
yang diaudit). Satu-satunya jejak adalah `audit_log` (lihat §10),
**yang TIDAK menyimpan nilai status per-santri**, hanya jumlah santri
& siapa/kapan.

### Detection
Dicari eksplisit di kode (§11) — **NOT FOUND** utk SEMUA dari:
`version`/`updated_at`/`updated_by` (field `dicatat_oleh` ADA TAPI
HANYA overwrite biasa, bukan dipakai utk bandingkan)/`revision`/
`conflict detection`/`optimistic concurrency`.

---

## 10. Audit Log Analysis

**YA, 2 concurrent save menghasilkan 2 baris `audit_log` terpisah**
(`Modul_InputAbsen.gs:654`, dipanggil SEKALI per eksekusi
`serverSaveAbsensiKelas`, SETELAH lock dilepas — TIDAK ADA deduplikasi/
merge apa pun antara panggilan A dan B).

Isi tiap baris: `table_name='absensi'`, `record_id='kelas_{kelas}_{tanggal}'`
(**SAMA PERSIS utk A dan B** — record_id BUKAN per-santri, jadi
TIDAK BISA membedakan "yang mana yang di-overwrite ke siapa" dari
record_id saja), `action='create'`, `user_id` (BEDA, A vs B — **INI
SATU-SATUNYA petunjuk siapa yg mana**), `timestamp` (BEDA, urutan
waktu), `detail_perubahan` = string `Input Absen kelas "X": N santri`
(**HANYA JUMLAH, bukan isi/nilai status per santri**).

**Apakah audit log dapat menunjukkan siapa yang overwrite terakhir?**
**YA** — baris dgn `timestamp` PALING BARU utk `record_id` yang sama =
guru yang "menang" (hasil akhir Firestore). Ini BISA dideteksi MANUAL
(kalau seseorang secara sengaja membuka sheet `audit_log` dan mencari
`record_id` yang sama muncul >1× berdekatan waktu) — **TAPI TIDAK ADA
UI/fitur apa pun yang menyajikan ini** (dikonfirmasi Tahap 4: `audit_log`
TIDAK PERNAH dibaca oleh fitur apa pun selain `generateId` sendiri).

**Apakah audit log cukup utk reconstruct previous attendance?**
**TIDAK** — `detail_perubahan` hanya angka jumlah santri, BUKAN
daftar status per santri. **Ini adalah LIMITATION nyata**, didokumentasikan
di sini per instruksi eksplisit §10 prompt.

---

## 11. Existing Protection

Repository-wide search (`Modul_InputAbsen.gs`, `Modul_FirestoreBridge.gs`,
istilah: `version`/`ETag`/`revision`/`optimistic`/`conflict`/`updated_at`/
`transaction`/`:commit`/`batchWrite`/`conditional`/`currentDocument`):

```
NOT FOUND
```

**Evidence**: 0 hasil grep utk SEMUA istilah di atas pada kedua file.
Field `dicatat_oleh` (Modul_InputAbsen.gs:544, `iaBulkWriteAbsensiFirestore_`)
ADA di setiap dokumen absensi, TAPI **HANYA data audit pasif** (mencatat
SIAPA YANG TERAKHIR menulis), **TIDAK PERNAH DIBACA/DIBANDINGKAN**
sebelum menulis (bukan optimistic-lock field, murni informational,
di-overwrite jg tiap save spt field lain).

**Kesimpulan §11**: **NOT FOUND** — TIDAK ADA mekanisme deteksi konflik
apa pun (lock/version/transaction/conditional-write) yang melindungi
dari lost update pada level DATA. Lock yang ADA (`withScriptLock_`)
HANYA melindungi dari INTERLEAVING REQUEST, bukan dari OVERWRITE
BERURUTAN (§5/§7).

---

## 12. Proposed Solutions — PROPOSAL ONLY (TIDAK diimplementasikan)

### Option A — Global Script Lock (SUDAH ADA, dianalisis sbg baseline)
- **Correctness**: TIDAK menyelesaikan lost update (§5/§7) — hanya
  interleaving.
- **Performance**: Sudah dianalisis Tahap 2/3 — MEMPERLAMBAT save
  kelas LAIN yang TIDAK PERLU antre (dampak negatif tanpa manfaat
  correctness tambahan utk kasus itu).
- **Scalability**: Buruk kalau jumlah guru aktif bertambah (semua
  antre 1 lock, terlepas relevan/tidak).
- **UX**: Guru B menunggu LEBIH LAMA dari seharusnya kalau kelasnya
  BEDA dari yang sedang disimpan guru lain, TANPA manfaat correctness.

### Option B — Scoped Lock (`attendance:{kelompok}:{kelas}:{tanggal}`)
- **Analisis dukungan Apps Script**: `LockService` Apps Script HANYA
  menyediakan `getScriptLock()`/`getUserLock()`/`getDocumentLock()` —
  **TIDAK ADA API utk lock dgn KEY KUSTOM/NAMED LOCK** (dikonfirmasi
  ERROR_LOG.md, dicatat sbg "catatan arsitektur permanen" — sudah
  diinvestigasi & disimpulkan TIDAK MUNGKIN dgn API bawaan Apps
  Script). **Scoped lock TIDAK BISA diimplementasikan murni via
  `LockService`** tanpa mekanisme tambahan (mis. dokumen "lock" custom
  di Firestore/Sheets sbg semaphore manual — INI SENDIRI beresiko race
  condition kalau tidak dirancang hati-hati, DAN menambah 1+ round-trip
  lagi ke biaya Save yang sudah 3.3+ detik).
- **Kesimpulan**: SECARA TEKNIS mungkin (via semaphore custom), TAPI
  effort & risiko tambahan TIDAK SEPADAN dibanding Option C/D di bawah
  yang lebih idiomatik.

### Option C — Optimistic Concurrency (revision/version check)
Konsep: simpan `version` (atau `updated_at`) saat form dibuka, kirim
balik saat Save, server BANDINGKAN dgn versi TERKINI SEBELUM menulis —
kalau beda → CONFLICT, JANGAN overwrite.
- **Correctness**: KUAT — SECARA LANGSUNG menyelesaikan akar masalah
  §5/§8 (deteksi eksplisit, bukan cuma serialisasi).
- **Kompleksitas**: SEDANG — butuh: (1) field `version`/`updated_at`
  BARU di setiap dokumen absensi (**PERUBAHAN SCHEMA**, di luar
  cakupan tahap ini), (2) logic baca-versi-saat-ini SEBELUM tulis
  (menambah 1 read Firestore per Save — trade-off latency, TAPI
  jumlahnya kecil dibanding floor 1.8-2s yang sudah ada), (3) UX BARU
  utk menangani CONFLICT (guru harus tahu "data berubah sejak Anda
  buka, refresh dulu?").
- **Cocok utk arsitektur Firestore SAAT INI**: YA, bisa diterapkan
  TANPA migrasi (per-dokumen `version` field kompatibel dgn model
  dokumen individual yang sudah ada).

### Option D — Firestore Transaction (read-verify-write)
- **Analisis**: Firestore REST API MENDUKUNG transaction
  (`:beginTransaction`, `:commit` dgn `transaction` id, atau
  `runQuery`+`commit` dlm 1 transaksi) — TAPI ini `:commit`-FAMILY
  endpoint yang SAMA yang sudah dianalisis Tahap 3 & DITOLAK (evidence
  tidak mendukung perbaikan PERFORMA, DAN sekarang scope-nya bertambah
  lagi jadi "correctness fix" — analisis performa Tahap 3 TETAP
  berlaku: floor latency TIDAK hilang, TAPI manfaat CORRECTNESS di sini
  LEBIH LANGSUNG relevan drpd Tahap 3 (yang cuma bicara atomicity
  N-request, BUKAN cross-request conflict detection).
- **Kompleksitas**: TINGGI — Firestore REST transaction API
  memerlukan flow multi-step (begin→read→commit-with-precondition),
  BELUM PERNAH dipakai di codebase ini (`Modul_FirestoreBridge.gs`
  TIDAK punya implementasi transaction SAMA SEKALI, perlu dibangun dari
  nol).
- **Cocok utk arsitektur SAAT INI**: SECARA TEKNIS MUNGKIN, TAPI
  effort-nya TINGGI utk arsitektur yang (per Tahap 8) SUDAH DIPUTUSKAN
  "WAIT FOR SUPABASE" — sama alasan Migration Alignment LOW spt `:commit`
  di Tahap 8.

### Option E — Supabase Optimistic Lock (proposal only, arsitektur masa depan)
Konsep: kolom `attendance_version`/`updated_at`/`updated_by` di tabel
Postgres, ATAU pakai `xmin` system column Postgres (built-in row
version, GRATIS tanpa kolom tambahan) utk optimistic concurrency native.
Postgres SECARA ALAMI mendukung `UPDATE ... WHERE xmin = :expected_xmin`
sbg pola optimistic-lock STANDAR & TERUJI LUAS — jauh lebih idiomatik
drpd mereplikasi pola sama di Firestore REST.

---

## 13. Supabase Migration Impact

> **Apakah concurrency control sebaiknya dirancang SEKARANG atau SAAT
> migrasi?**

**Jawaban**: **DESIGN DURING SUPABASE MIGRATION** utk MEKANISME
FINAL-nya (Option D/E, transaction-based) — TAPI **Option C
(optimistic version, level konsep/kontrak API) BOLEH mulai
didokumentasikan SEKARANG** sbg REQUIREMENT yang harus dibawa ke desain
Supabase, TANPA implementasi Firestore paralel yang akan dibuang (sama
prinsip dgn Tahap 8: hindari investasi kode Firestore-specific yang
tidak terbawa migrasi).

| Approach | Current Firestore | Supabase Migration |
|---|---|---|
| Global lock | SUDAH ADA (efek samping negatif latency utk kelas tak terkait) | TIDAK RELEVAN LANGSUNG (Postgres row-level locking native jauh lebih granular, tidak perlu meniru global lock Apps Script) |
| Scoped lock | TIDAK BISA murni via `LockService` (API terbatas), perlu semaphore custom BERISIKO | TIDAK PERLU — Postgres native mendukung row-level lock (`SELECT ... FOR UPDATE`) per baris, granularitas SEMPURNA tanpa perlu semaphore buatan |
| Optimistic version | BISA diterapkan (field tambahan + baca-sebelum-tulis), TAPI PERUBAHAN SCHEMA + effort SEDANG utk arsitektur yang segera diganti | **SANGAT COCOK** — Postgres `xmin` built-in ATAU kolom `updated_at`/`version` eksplisit, pola SANGAT UMUM & idiomatik di ekosistem Postgres/Supabase |
| Transaction | Mungkin TAPI belum pernah diimplementasikan, effort TINGGI, endpoint sama yg sudah ditolak Tahap 8 utk alasan performa (di sini utk correctness, TAPI tetap effort tinggi utk arsitektur sementara) | **NATIVE & MUDAH** — Postgres ACID transaction adalah fitur INTI (bukan tambahan), attendance save (read-verify-write ATAU delete+insert) BISA dibungkus 1 `BEGIN...COMMIT` STANDAR, jauh lebih sederhana drpd REST transaction Firestore |

**Rekomendasi**: **Postgres/Supabase adalah tempat yang JAUH lebih
tepat utk menyelesaikan masalah ini** — baik row-level lock native
maupun optimistic-version (`xmin`) adalah fitur BAWAAN, bukan yang
perlu "dibangun ulang" spt di Firestore REST. Menyelesaikannya di
Firestore SEKARANG (Option C/D) akan jadi kode yang **DIBUANG** saat
migrasi (sama prinsip Tahap 8 Migration Alignment).

---

## 14. Safe Test Strategy (RANCANGAN SAJA, TIDAK DIEKSEKUSI)

**TIDAK ADA concurrent production write dijalankan tahap ini** —
berikut RANCANGAN test yang AMAN utk tahap implementasi mendatang
(kalau/ketika conflict-detection benar-benar dibangun):

```
Setup:
- Guru QA A (akun sintetis terpisah, bukan guru asli)
- Guru QA B (akun sintetis KEDUA, terpisah dari A)
- SAMA kelas, SAMA tanggal (tanggal jauh ke depan/kosong, spt pola tahap sebelumnya)
- A load form → set beberapa santri ke status berbeda (mis. semua 'hadir')
- B load form (setelah A load, SEBELUM A save) → set santri YANG SAMA
  ke status BERBEDA (mis. semua 'izin')
- A save (tunggu sukses)
- B save (tunggu sukses)
- Baca ulang state Firestore utk kelas+tanggal itu
```

**Expected differentiation**:
```
LAST WRITE WINS   → state akhir = status versi B utk SEMUA santri overlap (HASIL SAAT INI, dikonfirmasi §8 code-level, TIDAK PERLU dieksekusi utk membuktikan krn sudah CONFIRMED via code path)
FIRST WRITE WINS  → state akhir = status versi A (TIDAK mungkin dgn kode SAAT INI, hanya relevan KALAU nanti optimistic-lock diimplementasikan dgn prioritas "penulis pertama menang")
CONFLICT          → B save GAGAL dgn pesan "data sudah berubah, refresh dulu" (HANYA mungkin SETELAH Option C/D diimplementasikan)
MERGE             → state akhir gabungan cerdas antar A & B (TIDAK ADA mekanisme ini di rencana mana pun, dicatat sbg opsi TEORITIS yang TIDAK direkomendasikan krn kompleksitas tinggi utk manfaat tidak jelas)
```

**Test ini `NOT EXECUTED`** — sesuai instruksi eksplisit tahap ini
(investigation-only, tidak boleh concurrent production write). Rancangan
di atas disiapkan utk DIPAKAI tahap implementasi mendatang (Firestore
ATAU Supabase), BUKAN dijalankan sekarang.

---

## 15. Risk Classification

### Severity: **HIGH**
Alasan: Data hilang PERMANEN tanpa recovery (§9), tanpa notifikasi ke
korban (guru pertama), tanpa jejak yang bisa direkonstruksi (§10).
BUKAN "CRITICAL" krn tidak menyebabkan korupsi SISTEM/keamanan/akses
tidak sah — murni kehilangan DATA OPERASIONAL 1 kelas/1 tanggal, bisa
diperbaiki MANUAL (guru input ulang) KALAU ketahuan.

### Likelihood: **LOW-MEDIUM**
Alasan: butuh 2 sesi AKTIF menyimpan KELAS+TANGGAL YANG SAMA dlm
rentang waktu berdekatan. Skenario paling umum di TPQ: 1 kelas = 1 guru
pemilik, jarang 2 guru aktif menyimpan bersamaan KECUALI ada guru
pengganti (`akses_kelas_request`, FITUR YANG ADA & DIPAKAI, jadi
skenarionya BUKAN teoretis) ATAU guru sama buka 2 device (§7 Scenario D
— PLAUSIBLE, tidak butuh koordinasi khusus, bisa "tidak sengaja").
TIDAK "HIGH" krn workflow normal TPQ tidak mendorong 2-guru-1-kelas
rutin, TAPI TIDAK "LOW" krn fitur guru-pengganti MEMANG ada & dipakai.

### Data Impact: **HIGH**
Alasan: bisa kehilangan SELURUH data kehadiran 1 kelas/1 tanggal (§9 —
"seluruh kelas tertimpa" MUNGKIN), berdampak ke laporan/statistik
turunan (Laporan Perkembangan Santri, Kehadiran Generus, dashboard) yang
membaca data absensi yang SUDAH SALAH tanpa tahu itu salah.

### Detectability: **LOW**
Alasan: TIDAK ADA UI/alert/notifikasi apa pun (§9 UX, §10) — SATU-SATUNYA
cara mendeteksi adalah membuka `audit_log` Sheet SECARA MANUAL & mencari
`record_id` duplikat berdekatan waktu (tidak ada yang melakukan ini
scr rutin, dikonfirmasi Tahap 4: `audit_log` tidak pernah dibaca fitur
apa pun). Guru korban TIDAK PUNYA cara mengetahui KECUALI kebetulan
membuka ulang & membandingkan scr manual dgn ingatannya sendiri.

---

## 16. Recommendation

```
CURRENT SYSTEM:
ACCEPTABLE WITH RISK

MIGRATION:
DESIGN DURING SUPABASE MIGRATION (dgn requirement optimistic-concurrency
DIDOKUMENTASIKAN SEKARANG sbg bagian dari kontrak desain, TIDAK
diimplementasikan Firestore-side)
```

**Alasan "ACCEPTABLE WITH RISK" (bukan "SAFE" ataupun "NEEDS FIX
segera")**: Likelihood LOW-MEDIUM (bukan skenario harian tipikal),
recovery MANUAL tetap mungkin (guru bisa input ulang KALAU ketahuan),
DAN — sesuai Tahap 8 — arsitektur SEDANG MENUJU Supabase di mana
solusi NATIVE (row-lock/optimistic-version Postgres) jauh lebih murah
dibangun drpd mereplikasi mekanisme serupa di Firestore REST yang akan
dibuang. **TIDAK "NEEDS FIX" SEGERA** krn effort Option C/D di Firestore
(§12) tidak sepadan usia arsitektur ini (sama logika Tahap 8).

**NAMUN** — severity HIGH + detectability LOW berarti risiko ini
**TIDAK BOLEH DIABAIKAN SELAMANYA** — direkomendasikan MINIMAL:
dokumentasikan sbg **KNOWN LIMITATION** yang dikomunikasikan ke
pengurus/admin (guru pengganti SEBAIKNYA dikoordinasikan manual/lisan
"jangan simpan bersamaan dgn guru asli" sampai ada perbaikan teknis) —
INI BUKAN perubahan kode, murni REKOMENDASI OPERASIONAL, di luar
cakupan implementasi tahap ini juga (dicatat sbg saran, bukan
tindakan).

---

## 17. Open Questions

- Seberapa SERING fitur "Minta Akses Kelas Lain" (`akses_kelas_request`)
  benar-benar dipakai di produksi? (Menentukan LIKELIHOOD sebenarnya —
  TIDAK ADA data pemakaian yang diukur tahap mana pun, hanya tahu
  fiturnya ADA & fungsional.)
- Apakah PERNAH terjadi laporan guru "kehadiran yang saya isi hilang"
  di masa lalu? (Kalau YA, itu BUKTI EMPIRIS lost-update SUDAH terjadi,
  bukan cuma risiko teoretis — TIDAK ADA data ini di ERROR_LOG.md yang
  dibaca tahap ini.)
- Kapan timeline migrasi Supabase? (Menentukan URGENSI relatif — kalau
  migrasi MASIH JAUH, "ACCEPTABLE WITH RISK" mungkin perlu ditinjau
  ulang jadi lebih proaktif.)
- Apakah Firestore document history/audit trail level-infrastruktur GCP
  (di luar kode aplikasi ini) BISA dipakai utk recovery darurat kalau
  lost-update PARAH terjadi? (Di luar pengetahuan kode yang diaudit,
  butuh investigasi terpisah ke tooling GCP/Firestore Console.)

---

## FINAL OUTPUT

```
TAHAP 10 — CONCURRENCY ANALYSIS

Code Changed:
NO

Firestore Changed:
NO

Production Data Changed:
NO

Lost Update:
CONFIRMED

Atomic Delete+Write:
NON-ATOMIC

Current Lock:
GLOBAL (LockService.getScriptLock(), seluruh aplikasi) -- mencegah
interleaving request, TIDAK mencegah blind sequential overwrite

Same Class Concurrent Save:
UNSAFE -- last-write-wins tanpa deteksi konflik, data guru pertama bisa
hilang sebagian/seluruhnya tanpa notifikasi

Different Class Concurrent Save:
SAFE secara data (document ID disjoint) -- HANYA terpengaruh latency
akibat lock global (antre, bukan korupsi data)

Existing Conflict Detection:
NOT FOUND

Risk:
HIGH (severity HIGH, likelihood LOW-MEDIUM, data impact HIGH,
detectability LOW)

Recommended Protection:
Optimistic concurrency (version/updated_at check) -- TAPI desain
mekanisme FINAL sebaiknya dilakukan saat migrasi Supabase (Postgres
row-lock/xmin native jauh lebih murah drpd replikasi di Firestore REST)

Current Production:
UNCHANGED

Supabase Recommendation:
DESIGN DURING MIGRATION -- dokumentasikan requirement optimistic-
concurrency SEKARANG (kontrak, bukan kode), implementasi native
Postgres saat migrasi terjadi

Next Action:
Tidak ada tindakan kode. Pertimbangkan mengomunikasikan known
limitation ini scr operasional (koordinasi manual guru pengganti)
sampai migrasi Supabase membawa solusi native.
```
