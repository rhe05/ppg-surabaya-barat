# Firestore Attendance Write-Path Coverage Audit (Tahap 13)

> Mode: **INVESTIGATION ONLY**. Tidak ada kode/Firestore diubah, tidak ada
> deploy, tidak ada test tulis production. Tanggal: 2026-08-08. Lanjutan
> langsung dari `FIRESTORE_ATTENDANCE_CONCURRENCY_IMPLEMENTATION_REPORT.md`
> (Tahap 12).

---

## 1. Executive Summary

**Jawaban langsung atas pertanyaan inti tahap ini**: **YA** — kedua jalur
(`serverSaveAbsensiDaily`, `serverSetAbsensiSatuSantri`) **BENAR-BENAR
AKTIF di production** (BUKAN legacy/unused — dikonfirmasi lewat trace
sampai ke sidebar menu & modal yang masih ter-render dan ter-wire penuh,
§4/§5) **DAN dapat merusak concurrency protection Tahap 12** dgn mekanisme
yang KONKRET, bukan spekulasi (§10).

Root cause: KEDUA jalur ini menulis LANGSUNG ke collection `absensi`
(dokumen per-santri) **TANPA PERNAH membaca atau menulis
`absensi_sesi`** (header version Tahap 12). Ini berarti:

1. Data attendance BISA berubah lewat jalur ini TANPA version session
   ikut naik — **stale-version blind spot** persis seperti yang
   dihipotesiskan prompt §8 ("attendance berubah, version tetap").
2. Jalur guru (`serverSaveAbsensiKelas`, TERLINDUNGI Tahap 12) yang
   menyimpan SETELAH salah satu bypass ini menulis — version check-nya
   akan **MATCH** (krn version memang tidak berubah), lalu **MENIMPA
   SELURUH kelas** (delete+rewrite semua santri di kelas itu berdasarkan
   snapshot LOKAL guru yang TIDAK tahu tentang perubahan bypass) —
   perubahan dari bypass path **HILANG, TANPA CONFLICT TERDETEKSI SAMA
   SEKALI**. Version protection Tahap 12 memberi **FALSE CONFIDENCE**:
   terlihat sukses bersih, padahal data dari jalur lain baru saja hilang.

`serverSaveAbsensiDaily` KHUSUSNYA berisiko lebih besar dari
`serverSetAbsensiSatuSantri`: dia menghapus+menulis ulang **SELURUH
absensi 1 kelompok pada 1 tanggal (SEMUA KELAS SEKALIGUS)**, bukan cuma
1 santri — blast radius jauh lebih luas.

**Cross-Path Lost Update: CONFIRMED** (bukan "possible" — dibuktikan lewat
trace kode langsung, §9/§10, tanpa perlu test tulis production).

**Risk: HIGH** untuk kombinasi guru (Input Absen, protected) × admin
(Absensi/Kehadiran Generus, TIDAK protected) yang menyentuh kelas+tanggal
overlap. Rekomendasi: **Tahap 14 diperlukan** — lihat §13/§16.

---

## 2. Complete Attendance Write Inventory

Pencarian menyeluruh (bukan hanya 2 fungsi yang sudah diketahui) untuk
SEMUA operasi tulis ke collection Firestore `absensi` (create/update/
delete/fetchAll/REST write):

| # | Function | File | Firestore write | Kategori |
|---|---|---|---|---|
| 1 | `iaBulkWriteAbsensiFirestore_` | Modul_InputAbsen.gs:604 | delete+upsert batch (`fetchAll`), id deterministik | **Shared write primitive** — dipanggil #2 & #4 |
| 2 | `iaRewriteAbsensiKelasFirestore_` | Modul_InputAbsen.gs:542 | via #1, + version-check (Tahap 12) | Dipanggil `serverSaveAbsensiKelas`/`Admin` |
| 3 | `serverSaveAbsensiDaily` | Modul_MaintainAbsensi.gs:61 | via #1 LANGSUNG (skip #2) | **BYPASS — TIDAK ADA version-check** |
| 4 | `serverSetAbsensiSatuSantri` | Modul_MaintainAbsensi.gs:136 | `firestoreUpdateDoc_`/`firestoreDeleteDoc_` langsung, 1 dokumen | **BYPASS — TIDAK ADA version-check** |
| 5 | `migrateAbsensiKelompokToFirestore_` | Modul_FirestoreMigration.gs:83 | `firestoreCreateDoc_` (create-only, skip kalau sudah ada) | **Migration tool, one-time bootstrap** — TIDAK dipanggil dari UI apa pun, hanya via `?diag=migrate&table=absensi&mode=copy` |
| 6 | `migrateAbsensiRekeyToDeterministic_` | Modul_FirestoreMigration.gs:128 | `firestoreCreateDoc_`+`firestoreDeleteDoc_` (rekey id lama→baru) | **Migration tool, "SATU KALI SAJA (2026-08-05)"** — sudah dijalankan, TIDAK ADA lagi di dispatch `Code.js` (dikonfirmasi grep, tidak reachable via diag route apa pun saat ini) |
| 7 | `testAbsensiFirestorePilot_` | Modul_FirestoreMigration.gs:572 | via #3 (`serverSaveAbsensiDaily`) | Test harness pilot migrasi (2026-07-28), BUKAN jalur tulis independen |

**Tidak ditemukan** operasi tulis `absensi` lain (create/update/delete/
batch) di luar 4 baris pertama tabel di atas + 2 tool migrasi historis.
Pencarian mencakup SELURUH `13_AppsScript/*.gs` untuk pola
`firestoreCreateDoc_('kelompok`, `firestoreUpdateDoc_('kelompok`,
`firestoreDeleteDoc_('kelompok`, `fetchAll`, `absensiDocId_(`.

---

## 3. Write-Path Matrix

| Function | File | Caller (client) | Writes absensi | Uses Lock | Uses Version | Production |
|---|---|---|---:|---:|---:|---:|
| `serverSaveAbsensiKelas` | Modul_InputAbsen.gs:713 | `Script_Main.html:2624` (`saveInputAbsen_`, Input Absen guru) | YA | YA | **YA (Tahap 12)** | **ACTIVE** |
| `serverSaveAbsensiKelasAdmin` | Modul_InputAbsen.gs:1264 | `Script_Main.html:2619` (`saveInputAbsen_`, mode admin override) | YA | YA | **YA (Tahap 12, fungsi SAMA persis)** | **ACTIVE** |
| `serverSaveAbsensiDaily` | Modul_MaintainAbsensi.gs:61 | `Script_Main.html:6117` (`saveIkgForm_`, modal "Tambah Kehadiran") **DAN** `Script_Main.html:8712` (`saveAbsensi`, screen sidebar "Absensi") | YA | YA (lock sendiri, TIDAK terkait header) | **TIDAK** | **ACTIVE (2 UI berbeda)** |
| `serverSetAbsensiSatuSantri` | Modul_MaintainAbsensi.gs:136 | `Script_Main.html:5969` (`saveKgEditCell_`, matrix "Detail Kehadiran" klik-sel) | YA | YA (lock sendiri) | **TIDAK** | **ACTIVE** |
| `migrateAbsensiKelompokToFirestore_` | Modul_FirestoreMigration.gs:83 | TIDAK ADA caller UI — hanya `?diag=migrate&table=absensi` | YA (create-only) | TIDAK (tidak perlu, create-only idempotent) | TIDAK | **Migration tool, bukan operational path** |
| `migrateAbsensiRekeyToDeterministic_` | Modul_FirestoreMigration.gs:128 | TIDAK ADA caller ditemukan (tidak ada di `Code.js` dispatch) | YA (rekey, one-time) | TIDAK diverifikasi (di luar cakupan — sudah dieksekusi historis) | TIDAK | **Historis, sudah dijalankan, TIDAK reachable lagi** |

---

## 4. Main Save Path (`serverSaveAbsensiKelas`)

Sudah diverifikasi lengkap Tahap 12 (Test A-G, PASS semua). Ringkasan
(TIDAK diuji ulang tahap ini, investigation-only):

```
UI       : Input Absen guru (mobile-first, role='guru')
Caller   : window.saveInputAbsen_ (Script_Main.html:2621-2624)
Lock     : YA (withScriptLock_, mencakup baca-header→delete→write→tulis-header)
Version  : YA (absensi_sesi/{tanggal}_{kelas}, Tahap 12)
Scope    : per kelas+tanggal (bukan per kelompok, bukan per santri tunggal)
```

## 5. Daily Save Path (`serverSaveAbsensiDaily`)

**Trace caller sampai UI** (§3 prompt):

**Caller 1 — Modal "Tambah Kehadiran"** (`window.openModalInputKehadiranGenerus`,
Script_Main.html:6017, dipanggil dari tab "Kehadiran Generus" di
Dashboard Kelompok — konfirmasi via `window.saveIkgForm_`,
Script_Main.html:6093-6118): admin memilih tanggal+kelas, edit status
per santri di kelas itu, klik simpan → `merged` dibangun dari
`window.lastIkgFormData_` (SELURUH santri kelompok, bukan cuma kelas
terpilih — dikonfirmasi komentar eksplisit baris 6009-6014: "WAJIB merge
dgn seluruh santri kelompok saat simpan") → `serverSaveAbsensiDaily`.

**Caller 2 — Sidebar "Absensi"** (`Markup_Screens.html:1021`,
`onclick="window.switchScreen('absensi')"`, **TANPA `style="display:none"`
— SELALU TERLIHAT di sidebar**, mengarah ke `#screenAbsensi`
(`Markup_Screens.html:3672`) — screen Phase 1-4 ORIGINAL (checkbox
hadir/alpa + dropdown per santri, `window.loadAbsensiForm`/
`window.saveAbsensi`, Script_Main.html:8619-8713). Guru/admin memilih
tanggal → isi status semua santri kelompok → `window.saveAbsensi()` →
`serverSaveAbsensiDaily`.

```
Dipanggil dari UI mana?     2 tempat: sidebar "Absensi" (screen tersendiri)
                              DAN modal "Tambah Kehadiran" (dalam Kehadiran Generus)
Siapa yang menggunakan?     Role dgn akses `validateUserAccess(token,'kelompok',kelompokId)`
                              -- admin_kelompok/admin_desa/admin_ppg (BUKAN guru,
                              guru pakai Input Absen/serverSaveAbsensiKelas)
Guru?                        TIDAK (guru tidak punya sidebar screen 'Absensi')
Admin?                       YA
Mobile?                      TIDAK dikonfirmasi sbg UI mobile-first -- sidebar
                              desktop-style, BUKAN bagian shell mobile guru/admin_kelp
Dashboard?                   Modal "Tambah Kehadiran" ADA di dalam Dashboard Kelompok
                              (tab Kehadiran Generus)
Maintenance/background?      TIDAK -- keduanya dipicu klik user langsung
Masih aktif?                 YA -- KEDUA UI entry point ADA di markup TANPA
                              display:none, TANPA komentar "disembunyikan
                              sementara" (beda dari pola "+ Minta Akses" yang
                              memang sengaja disembunyikan, dikonfirmasi tidak
                              ada penanda serupa di sini)
Legacy?                       Sidebar "Absensi" KEMUNGKINAN legacy Phase 1-4
                              (sebelum Kehadiran Generus ada) TAPI TIDAK
                              ditemukan bukti eksplisit sudah dinonaktifkan --
                              status: AKTIF SECARA KODE, historinya legacy,
                              TIDAK BOLEH diasumsikan unused tanpa konfirmasi user
```

**KESIMPULAN §3 prompt**: **BUKAN ORPHAN/UNUSED** — 2 entry point UI
nyata, keduanya ter-render tanpa gate visibilitas.

## 6. Single-Student Save Path (`serverSetAbsensiSatuSantri`)

**Trace caller** (§4 prompt):

**Caller — matrix "Detail Kehadiran"** (`window.saveKgEditCell_`,
Script_Main.html:5954-5970, dipicu `window.openModalKgEditCell_` yang
di-klik dari sel tabel matrix santri×tanggal, Script_Main.html:5917-5931,
bagian tab "Kehadiran Generus" Dashboard Kelompok — komentar eksplisit
baris 5934-5938 mengonfirmasi ini fitur AKTIF "admin klik sel santri×tanggal
utk edit/hapus langsung").

```
Seluruh caller?              1 (window.saveKgEditCell_)
UI source?                   Matrix Detail Kehadiran, tab Kehadiran Generus
User role?                   Admin (sama scope dgn Daily path di atas)
Class/date scope?            TIDAK per-kelas -- per SANTRI TUNGGAL + 1 tanggal
                              (kelas TIDAK relevan sbg parameter fungsi sama sekali)
Update 1 santri saja?        YA (dikonfirmasi kode: 1 docId = absensiDocId_(tanggal,santriId))
Bisa bersamaan dgn
  serverSaveAbsensiKelas?    YA -- TIDAK ADA mekanisme apa pun (lock beda scope,
                              TIDAK ada shared version check) yang mencegah admin
                              mengedit 1 sel BERSAMAAN dgn guru menyimpan kelas
                              yang sama (lihat §9/§10)
```

**Catatan penting §6 prompt (write semantics)**: `serverSetAbsensiSatuSantri`
BUKAN sekadar "update status" — bisa **INSERT** (santri belum punya
record tanggal itu → `firestoreUpdateDoc_` dgn PATCH+mask = upsert,
membuat baru), **UPDATE** (status berubah), ATAU **DELETE** (parameter
`status` kosong → `firestoreDeleteDoc_`, Modul_MaintainAbsensi.gs:164-168)
— **TIDAK BISA** mengubah kelas/tanggal santri (tidak ada operasi
semacam itu di fungsi ini, scope-nya HANYA 1 (santri,tanggal) tetap).

`serverSaveAbsensiDaily` write semantics: **DELETE SELURUH + INSERT
ULANG** (Modul_MaintainAbsensi.gs:82-91, cabang Firestore) — persis pola
"hapus-total-lalu-tulis-ulang" yang SAMA dgn `serverSaveAbsensiKelas`
LAMA (sebelum Tahap 12), TAPI **scope-nya 1 KELOMPOK PENUH (semua kelas)**,
bukan 1 kelas. Bisa: menambah santri (kalau ada di `absensiList` baru),
menghapus attendance (santri yang TIDAK ada di `absensiList` baru
dihapus — termasuk santri kelas LAIN yang TIDAK diedit admin, kalau
`merged`/`absensiList` yang dikirim TIDAK LENGKAP), mengubah status
massal. **TIDAK BISA** mengubah kelas/tanggal langsung (sama seperti di
atas, field-nya tetap).

---

## 7. Admin Save Path (`serverSaveAbsensiKelasAdmin`)

Verifikasi kode aktual (§12 prompt, re-cek langsung, TIDAK ada perubahan
sejak Tahap 12):

```
Modul_InputAbsen.gs:1264  function serverSaveAbsensiKelasAdmin(token, kelompokId, kelas, tanggal, absensiList, expectedVersion) {
Modul_InputAbsen.gs:1286    result = iaRewriteAbsensiKelas_(kelompokId, santriIdsKelas, tanggal, absensiList, ctx.user.id, kelas, expectedVersion);
```

**PROTECTED, dikonfirmasi** — memanggil `iaRewriteAbsensiKelas_` yang
PERSIS SAMA (1 fungsi, sama file, sama argumen shape) dgn
`serverSaveAbsensiKelas` (guru, Modul_InputAbsen.gs:713/736). TIDAK ada
bypass version-check utk admin override Input Absen. (Ini BEDA dari
`serverSaveAbsensiDaily`/`serverSetAbsensiSatuSantri` di
`Modul_MaintainAbsensi.gs` yang SAMA SEKALI TIDAK memanggil
`iaRewriteAbsensiKelas_`.)

---

## 8. Mobile Usage

`serverSaveAbsensiDaily` dan `serverSetAbsensiSatuSantri` **TIDAK
ditemukan dipanggil dari shell mobile guru/`admin_kelp`**
(`window.iaState_` — dunia Input Absen mobile-first) — KEDUANYA HANYA
dipanggil dari layar sidebar DESKTOP-style (`window.switchScreen`,
`window.openModalInputKehadiranGenerus`, `window.openModalKgEditCell_` —
semua bagian dari Dashboard Kelompok/sidebar admin, BUKAN
`screenInputAbsen`/`iaState_` yang dipakai guru & `admin_kelp`).

```
Mobile (guru/admin_kelp) → Input Absen (screenInputAbsen)
  → HANYA serverSaveAbsensiKelas/Admin (PROTECTED)
  → serverSaveAbsensiDaily/serverSetAbsensiSatuSantri TIDAK PERNAH dipanggil dari sini

Desktop (admin_kelompok/admin_desa/admin_ppg) → sidebar "Absensi" / Dashboard
  Kelompok → Kehadiran Generus
  → serverSaveAbsensiDaily (2 UI) + serverSetAbsensiSatuSantri (1 UI)
  → TIDAK PROTECTED
```

**Tidak ada aplikasi mobile terpisah** (binary/native) di project ini —
"mobile" di sini berarti breakpoint responsif dalam Web App yang sama
(CLAUDE.md Phase 4). Tidak ada API/endpoint tambahan di luar
`google.script.run` yang perlu ditelusuri.

**Implikasi penting**: karena bypass path TIDAK dipakai guru mobile,
risiko cross-path SPESIFIK terjadi antara **guru (Input Absen, mobile)**
DAN **admin (Absensi/Kehadiran Generus, desktop)** — 2 PERSONA BERBEDA
yang SANGAT MUNGKIN aktif BERSAMAAN dlm operasional nyata (guru mengisi
absen sambil admin melakukan koreksi/rekap hari yang sama).

---

## 9. Lock Coverage

| Function | Uses global ScriptLock | Lock starts before write | Lock covers complete write |
|---|---|---|---|
| `serverSaveAbsensiKelas`/`Admin` | YA | YA (mencakup baca-header) | YA (delete+write+tulis-header SEMUA di dalam) |
| `serverSaveAbsensiDaily` | YA (`withScriptLock_`, Modul_MaintainAbsensi.gs:89/103) | YA | YA (utk operasi tulisnya sendiri) |
| `serverSetAbsensiSatuSantri` | YA (`withScriptLock_`, Modul_MaintainAbsensi.gs:157) | YA | YA (utk operasi tulisnya sendiri) |
| `migrateAbsensiKelompokToFirestore_` | TIDAK | — | — (create-only idempotent, di luar cakupan operasional biasa) |

**Poin krusial**: SEMUA 3 jalur operasional (Main/Daily/SingleStudent)
memakai lock GLOBAL yang SAMA (`LockService.getScriptLock()`) — artinya
**TIDAK ADA interleaving Firestore-request-level antar jalur mana pun**
(mis. delete dari 1 jalur tidak akan tercampur dgn write jalur lain di
tengah eksekusi). **TAPI** lock hanya menyerialkan EKSEKUSI, TIDAK
memberi tahu satu jalur tentang perubahan yang dibuat jalur LAIN —
persis masalah "lock ada, tapi TIDAK cukup" yang sudah dibuktikan Tahap
10 utk jalur Main SEBELUM Tahap 12 — sekarang TERBUKTI BERLAKU LAGI utk
kombinasi Main×Daily dan Main×SingleStudent (§10).

**Tidak diperbaiki** (sesuai instruksi §13 "Jangan memperbaiki lock").

---

## 10. Cross-Path Concurrency Scenarios

### Scenario A — `serverSaveAbsensiKelas` (guru) vs `serverSetAbsensiSatuSantri` (admin, sel tunggal)

```
T0: Guru buka Input Absen kelas X tanggal T -> expectedVersion = N (header dibaca)
T1: Admin klik sel Detail Kehadiran (santri S di kelas X, tanggal T) -> ubah status
    -> serverSetAbsensiSatuSantri -> TULIS LANGSUNG ke absensi/{T}_{S}
    -> absensi_sesi/{T}_{X} TIDAK DISENTUH -- version TETAP N
T2: Guru klik Simpan (form guru TIDAK tahu ttg perubahan admin T1, krn
    guru load SEBELUM T1) -> serverSaveAbsensiKelas(expectedVersion=N)
    -> baca header: version MASIH N (T1 tidak menaikkannya) -> MATCH
    -> delete+rewrite SELURUH kelas X, termasuk santri S dgn nilai LAMA
       (dari form guru, BUKAN nilai admin di T1)
    -> version -> N+1
RESULT: Perubahan admin (T1) HILANG. TIDAK ADA conflict terdeteksi.
        Guru & admin SAMA-SAMA melihat "berhasil" tanpa peringatan.
```

**Apakah version protection jalur utama masih efektif?** **TIDAK
sepenuhnya** — efektif utk mencegah 2 SESAMA guru saling menimpa (kasus
asli Tahap 12), TAPI **TIDAK efektif** melindungi dari admin yang masuk
lewat jalur berbeda pada kelas+tanggal yang sama.

### Scenario B — `serverSaveAbsensiDaily` menulis SETELAH `serverSaveAbsensiKelas`

```
T0: Guru simpan kelas X tanggal T via Input Absen -> sukses, version N->N+1
T1: Admin (yang form-nya sudah dibuka SEBELUM T0, via serverGetAbsensiForm)
    klik Simpan di modal "Tambah Kehadiran" / screen "Absensi"
    -> serverSaveAbsensiDaily -> HAPUS SEMUA absensi kelompok tanggal T
       (SEMUA KELAS, bukan cuma kelas X) -> TULIS ULANG persis
       `absensiList`/`merged` yang admin bawa (snapshot SEBELUM T0,
       TIDAK termasuk update guru di T0)
    -> absensi_sesi/{T}_{X} TIDAK DISENTUH -- version TETAP N+1
       (padahal data attendance-nya SUDAH ditimpa balik ke versi SEBELUM T0)
RESULT: Update guru (T0) HILANG utk kelas X, DAN BERPOTENSI kelas LAIN
        di tanggal T juga ikut ter-reset kalau snapshot admin tidak
        lengkap. Version header MENUNJUKKAN N+1 (seolah data "terbaru"),
        PADAHAL isinya sudah balik ke snapshot lama admin -- version
        jadi TIDAK MEREPRESENTASIKAN data sebenarnya lagi (desync).
```

**Dapatkah menyebabkan overwrite?** **YA, CONFIRMED**, dan blast radius
LEBIH BESAR dari Scenario A (bisa mempengaruhi banyak kelas sekaligus
dalam 1 kelompok+tanggal).

### Scenario C — 2 jalur bypass berjalan bersamaan (Daily vs SingleStudent)

```
T0: Admin A buka modal "Tambah Kehadiran" (snapshot kelompok tanggal T)
T1: Admin B klik sel Detail Kehadiran (santri S, tanggal T) -> serverSetAbsensiSatuSantri
    -> tulis LANGSUNG absensi/{T}_{S}, sukses
T2: Admin A klik Simpan modal -> serverSaveAbsensiDaily -> HAPUS SEMUA +
    TULIS ULANG snapshot T0 (TIDAK termasuk perubahan B di T1)
RESULT: Perubahan B (T1) HILANG.
```

**Tentukan**: **UNSAFE** — mekanismenya PERSIS lost-update klasik yang
sudah dibuktikan Tahap 10 utk jalur Main (SEBELUM Tahap 12) — Daily dan
SingleStudent SAMA SEKALI belum mendapat perbaikan apa pun dari Tahap 12,
jadi problem ASLI Tahap 10 MASIH ADA UTUH di kedua jalur ini (baik
terhadap satu sama lain MAUPUN terhadap jalur Main yang sekarang
"terlindungi" versi palsu).

---

## 11. Data Integrity Impact

| Skenario | Final data | Version | Conflict terdeteksi? | Risk |
|---|---|---|---|---|
| A. Main save → bypass write (mis. admin edit sel SETELAH guru save) | Data terbaru = hasil bypass (benar, TIDAK ada masalah krn bypass jalan TERAKHIR & tidak ada save Main lagi setelahnya) | version tidak berubah krn bypass | Tidak relevan (tidak ada save Main susulan) | **LOW** (untuk urutan INI saja) |
| B. Bypass write → main save (Scenario A di atas) | Data = hasil Main save, TIMPA bypass | version naik (Main save berhasil) | **TIDAK** (version tetap match, false negative) | **HIGH** — bypass HILANG diam-diam |
| C. Main save → bypass write → main save lagi | Save Main ke-2 akan MATCH version (blm ada Main save lain di antaranya) → sukses → TIMPA bypass (persis skenario B) | version naik lagi | **TIDAK** | **HIGH** |
| D. Bypass A → bypass B (Scenario C) | Data = hasil bypass yang jalan TERAKHIR, TIMPA bypass sebelumnya | version TIDAK PERNAH berubah (keduanya skip header) | **TIDAK** (tidak ada mekanisme sama sekali) | **HIGH** — problem Tahap 10 ASLI, utuh di jalur ini |

---

## 12. Risk Classification

### Main path (`serverSaveAbsensiKelas`/`Admin`)
**Status saat ini**: PROTECTED terhadap sesama dirinya (guru×guru,
guru×admin-override — Tahap 12, PASS). **TIDAK PROTECTED** terhadap
Daily/SingleStudent (temuan tahap ini). Risk **level ini SENDIRI**:
LOW (Tahap 12 valid utk cakupannya) — TAPI risk KESELURUHAN (termasuk
cross-path) naik ke kategori di bawah.

### Daily path (`serverSaveAbsensiDaily`)
**Risk: HIGH** — evidence: (a) 2 UI aktif tanpa gate (§5), (b) blast
radius SELURUH kelompok+tanggal (bukan 1 santri/1 kelas), (c) TIDAK ADA
version-check sama sekali (§2/§3), (d) skenario overwrite CONFIRMED lewat
trace kode langsung (§10 Scenario B/C), (e) dipakai role admin yang
REALISTIS aktif bersamaan dgn guru (§8).

### Single-student path (`serverSetAbsensiSatuSantri`)
**Risk: MEDIUM-HIGH** — evidence: (a) 1 UI aktif tanpa gate, (b) blast
radius LEBIH KECIL (1 santri per panggilan, TAPI dipakai berkali-kali
per sesi admin di matrix — total dampak per sesi bisa besar), (c) TIDAK
ADA version-check, (d) skenario overwrite CONFIRMED (§10 Scenario A/C).
Diberi "MEDIUM-HIGH" bukan "HIGH" murni krn blast radius PER-PANGGILAN
lebih kecil dari Daily, TAPI FREKUENSI pemakaian per sesi admin
(klik-per-sel) berpotensi lebih SERING drpd Daily (yang biasanya 1x per
sesi koreksi).

---

## 13. Recommended Protection

| Jalur | Rekomendasi |
|---|---|
| `serverSaveAbsensiDaily` | **A. Integrasikan ke concurrency protection** — TAPI granularitasnya BEDA (per-KELOMPOK+tanggal, mencakup SEMUA kelas), BUKAN sekadar dipaksa pakai header per-kelas yang sama dgn Main path. Perlu desain TERPISAH (mis. version-check terhadap SEMUA header kelas yang terdampak di tanggal itu SEKALIGUS, atau header level-kelompok+tanggal yang berbeda konsepnya) — **E. Investigasi lebih lanjut** utk desain persisnya sebelum implementasi. |
| `serverSetAbsensiSatuSantri` | **A. Integrasikan ke concurrency protection** — granularitas per-santri LEBIH SEMPIT dari header per-kelas Main path, perlu keputusan: apakah edit 1 sel HARUS ikut menaikkan version header kelas terkait (supaya guru yang sedang buka kelas itu tahu ada perubahan), ATAU cukup dicegah dgn cara lain. **E. Investigasi lebih lanjut** jg direkomendasikan sebelum implementasi (bukan langsung A tanpa desain). |
| Sidebar "Absensi" (screen, bukan fungsi) | **D pertimbangan** (bukan keputusan) — TANYAKAN ke user apakah screen ini MASIH dipakai scr aktif (kemungkinan legacy Phase 1-4 yang belum dinonaktifkan setelah Kehadiran Generus ada) SEBELUM memutuskan investasi proteksi utk 2 UI Daily path — kalau salah satu UI TERNYATA sudah tidak dipakai user, cakupan perbaikan Tahap 14 bisa lebih kecil. |

**Jangan implementasi apa pun tahap ini** (dipatuhi).

---

## 14. Implementation Boundary (PREVIEW, TIDAK DIEDIT)

**Jika** Tahap 14 dilanjutkan (BELUM diputuskan tahap ini):

```
Function: serverSaveAbsensiDaily
File: Modul_MaintainAbsensi.gs
Expected version source: BELUM DITENTUKAN -- kemungkinan besar BUKAN 1
  header tunggal (krn scope-nya lintas-kelas) -- perlu keputusan desain
  terpisah (mis. cek SEMUA header kelas yang punya santri di
  `absensiList` sekaligus, tolak kalau ADA SATU SAJA yang mismatch)
Conflict point: SEBELUM delete (sama prinsip Tahap 12)
Version increment: perlu keputusan -- naikkan SEMUA header kelas
  terdampak, atau desain granularitas baru
Client changes: window.saveIkgForm_ + window.saveAbsensi (Script_Main.html)
  perlu bawa expected-version (bentuknya BELUM ditentukan -- single
  angka atau map per-kelas)
Server changes: serverGetAbsensiForm perlu kirim versi/snapshot yang
  sesuai desain final

Function: serverSetAbsensiSatuSantri
File: Modul_MaintainAbsensi.gs
Expected version source: BELUM DITENTUKAN -- kemungkinan header kelas
  santri tsb (butuh lookup kelas dari santri_id dulu) ATAU mekanisme
  lebih ringan (mis. TIDAK pakai version, cukup pastikan TIDAK
  menghapus/menimpa field yang baru diubah jalur lain -- perlu evaluasi
  apakah version-check di level ini malah OVER-ENGINEERING utk operasi
  1-sel yang secara alami sudah sempit blast radius-nya)
Conflict point: SEBELUM write 1 dokumen
Version increment: perlu keputusan (lihat di atas)
Client changes: window.saveKgEditCell_ (Script_Main.html)
Server changes: sumber expected-version utk modal edit-sel (BELUM ADA
  saat ini -- matrix Detail Kehadiran tidak menyimpan versi apa pun
  saat ini)
```

**JANGAN EDIT FILE** — di atas murni peta preview, TIDAK ada satu baris
kode pun diubah tahap ini.

---

## 15. Performance Consideration

Tahap 12 menambahkan **Version Read ≈ 372 ms median** (5 run, diag
production) utk jalur Main. **TIDAK ADA read/version-check baru
ditambahkan tahap ini** (investigation-only, sesuai instruksi).

Untuk kandidat Tahap 14 (kalau dilanjutkan):

| Kandidat | Expected additional round-trip |
|---|---|
| `serverSaveAbsensiDaily` + version-check | `UNKNOWN / ESTIMATE` — TIDAK BOLEH dikarang. Kemungkinan LEBIH BESAR dari Main path (372ms) kalau desainnya perlu baca BANYAK header kelas sekaligus (bukan 1), TAPI angka pasti tidak bisa ditentukan tanpa desain final + benchmark. |
| `serverSetAbsensiSatuSantri` + version-check | `UNKNOWN / ESTIMATE` — kemungkinan SEBANDING dgn Main path (1 header read) KALAU desainnya baca 1 header kelas, TAPI belum ada keputusan desain (§14) jadi angka tidak bisa diperkirakan bertanggung jawab. |

Tidak ada angka dikarang di atas — SEMUA ditandai UNKNOWN/ESTIMATE sesuai
instruksi §18.

---

## 16. Safe Test Plan (RANCANGAN, TIDAK DIEKSEKUSI)

```
Setup: QA kelas, QA tanggal jauh ke depan (pola sama Tahap 12), QA guru
       (via diag route internal, TANPA sesi login sungguhan -- pola
       sama Tahap 12 §Correctness Tests)

Test 1 -- Main save vs Daily save:
  1. Simulasikan header version N via iaRewriteAbsensiKelasFirestore_ (sukses awal)
  2. Panggil serverSaveAbsensiDaily dgn snapshot yang TIDAK termasuk hasil #1
  3. Baca ulang absensi santri terkait -- expected: nilai #1 HILANG (BUKTI overwrite)
  4. Baca header version -- expected: TETAP (TIDAK ikut naik oleh #2)

Test 2 -- Main save vs Single-student save:
  1. Simulasikan header version N via iaRewriteAbsensiKelasFirestore_
  2. Panggil serverSetAbsensiSatuSantri utk 1 santri di kelas yang sama
  3. Panggil iaRewriteAbsensiKelasFirestore_ LAGI dgn expectedVersion=N
     (blm tahu ttg #2) dan absensiList TIDAK menyertakan nilai #2
  4. Baca ulang -- expected: nilai #2 HILANG, version-check PASS (MATCH,
     TIDAK conflict) meski data sebenarnya SUDAH berubah dari #2

Test 3 -- Daily vs Single-student:
  1. Panggil serverSetAbsensiSatuSantri utk 1 santri
  2. Panggil serverSaveAbsensiDaily dgn snapshot SEBELUM #1
  3. Baca ulang -- expected: nilai #1 HILANG

Cleanup: hapus SEMUA dokumen QA (absensi + absensi_sesi) yang dibuat,
verifikasi bersih (pola sama diagT12Cleanup_/diagT12VerifyClean_ Tahap 12).
```

**TIDAK DIEKSEKUSI tahap ini** (sesuai instruksi §19 "JANGAN EKSEKUSI
PRODUCTION TEST") — analisis §10/§11 di atas SUDAH cukup membuktikan
mekanisme lewat trace kode langsung, tanpa perlu eksekusi nyata utk
menjawab pertanyaan inti tahap ini.

---

## 17. Open Questions

- Apakah sidebar screen "Absensi" (Phase 1-4 original) MASIH benar-benar
  dipakai user, atau sudah digantikan sepenuhnya oleh Kehadiran Generus
  dan hanya belum dibersihkan dari sidebar? Jawaban ini MENGUBAH prioritas
  Tahap 14 (kalau ternyata tidak dipakai, salah satu dari 2 UI Daily path
  bisa di-deprecate alih-alih diberi proteksi, mengurangi scope).
- Desain granularitas version utk `serverSaveAbsensiDaily` (per-kelompok
  vs per-kelas-multiple) BELUM diputuskan — perlu keputusan user/desain
  eksplisit sebelum Tahap 14 implementasi, BUKAN diasumsikan sepihak.
- Apakah `serverSetAbsensiSatuSantri` REALISTIS perlu version-check
  penuh, atau cukup mekanisme lebih ringan (mis. dokumentasi operasional
  "jangan edit sel sambil guru sedang input" + audit log yang lebih
  detail)? Trade-off kompleksitas-vs-manfaat belum dievaluasi.
- `migrateAbsensiRekeyToDeterministic_` dikonfirmasi tidak ada di dispatch
  `Code.js` SAAT INI — TAPI apakah ada cara lain memanggilnya (mis.
  manual dari Apps Script editor)? Di luar cakupan audit tahap ini
  (bukan write-path OPERASIONAL/production-facing).
