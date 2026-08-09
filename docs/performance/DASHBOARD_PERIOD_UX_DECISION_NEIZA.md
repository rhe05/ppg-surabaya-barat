# Dashboard Period UX Decision — Guru Neiza Follow-up (Tahap 17)

> Mode: **INVESTIGATION + PRODUCT DECISION ONLY**. Tidak ada kode/Firestore/
> cache diubah, tidak ada deploy, tidak ada data test production, angka
> "10" TIDAK diperlakukan sbg ground truth. Tanggal: 2026-08-08. Lanjutan
> langsung dari `DASHBOARD_DATA_ACCURACY_AUDIT_NEIZA.md` (Tahap 16).

---

## 1. Incident Background

Guru Neiza (users.id=3, guru_id=22, kelompok 1) melaporkan kartu "Hari
Aktif" kelas Remaja SMA (jadwal_kbm.id=9) menampilkan 7 hari, dia
mengira seharusnya 10. Tahap 16 membuktikan query/calculation/display
BENAR, dan menemukan 1 tanggal REAL (2026-08-07) yang menjelaskan
selisih 8→7 (ground truth all-time vs tampilan bulan Juli).

---

## 2. Tahap 16 Evidence (dikutip, TIDAK diukur ulang)

```
Teacher Expected  = 10 hari
Firestore all-time = 8 hari (2026-07-20,21,22,23,27,30,31 + 2026-08-07)
Dashboard Juli 2026 = 7 hari
Calculation         = 7 hari (BENAR, distinct-date, semua status)
Displayed            = 7 hari (BENAR, cocok persis dgn calculation)
Query                = BENAR (structured query range Firestore, TIDAK ada bug)
Cache                = DIKESAMPINGKAN (tidak ada cache server utk absensi;
                        cache client reset tiap reload, tidak relevan)
Timezone              = DIKESAMPINGKAN (tanggal SELALU string 'yyyy-MM-dd',
                        tidak ada jejak Date-object contamination)
```

---

## 3. Confirmed Missing Date

```
2026-08-07 — ADA di Firestore (kelompok/1/absensi, 7 dokumen, 1 per
santri Remaja SMA, dicatat_oleh=3/Neiza sendiri) — TIDAK termasuk
tampilan "Juli 2026" krn berada di LUAR rentang 2026-07-01..2026-07-31.
Ini SEPENUHNYA menjelaskan selisih 8 (raw) → 7 (displayed).
```

---

## 4. Unconfirmed Missing Dates

```
Selisih 10 (klaim guru) - 8 (raw Firestore all-time) = 2 tanggal
```

**Ditelusuri (§5 prompt) — sumber lain yang BISA memberi evidence
TANPA mengubah production**:

| Sumber | Bisa dipakai? | Hasil |
|---|---|---|
| Firestore `kelompok/1/absensi` | YA (sudah, Tahap 16) | 8 tanggal, TIDAK LEBIH |
| `audit_log` sheet | **DIPERIKSA STRUKTURAL, BUKAN exhaustive scan** — lihat catatan di bawah | `logAudit('absensi', ...)` di `Modul_InputAbsen.gs` **HANYA dipanggil SETELAH save BERHASIL** (dikonfirmasi Tahap 12/13, TIDAK ADA satu pun cabang error yang memanggil `logAudit`) — artinya **audit_log SECARA STRUKTURAL TIDAK PERNAH mencatat percobaan yang GAGAL**. Kalaupun di-scan PENUH, audit_log HANYA bisa menunjukkan tanggal SUKSES — yang PASTI SUDAH tercermin di Firestore (karena `logAudit` dipanggil SETELAH `iaBulkWriteAbsensiFirestore_`, id dokumen deterministik, TIDAK PERNAH sukses-audit-tapi-dokumen-hilang). **Scan tambahan TIDAK BISA mengungkap informasi BARU di luar yang sudah diketahui dari Firestore** — dicatat sbg kesimpulan BERBASIS KODE, bukan asumsi. |
| Google Sheets historis (kolom absensi lama, PRA-migrasi) | TIDAK RELEVAN — kelas Remaja SMA & santrinya SELALU di kelompok 1 (Firestore SEJAK migrasi 2026-07-28, per memory project), tanggal yang diklaim guru (kemungkinan besar Juli 2026, SETELAH migrasi) sudah di jalur Firestore | TIDAK ADA data Sheets terpisah yang relevan |
| Existing snapshots/reports/exported data | TIDAK ADA sistem snapshot/backup point-in-time yang bisa diakses read-only dari lingkungan audit ini | TIDAK TERSEDIA |

**Kesimpulan §5/§6**:
```
Known missing from Dashboard : 2026-08-07 (TERBUKTI, §3)
Unknown                       : 2 tanggal klaim guru — NOT TRACEABLE
                                 FROM SYSTEM DATA (evidence terbatas
                                 STRUKTURAL, bukan cuma "belum sempat
                                 dicari" — audit_log MEMANG tidak
                                 mencatat kegagalan by design)
```
**TIDAK DIBUAT tanggal fiktif** utk mengisi 2 slot ini (dipatuhi §6
prompt).

---

## 5. Current Hari Aktif Semantics (dikonfirmasi ulang kode, TIDAK berubah dari Tahap 16)

```
Source  : kelompok/{kelompokId}/absensi (Firestore), via
          iaReadAbsensiKelompokRange_ → firestoreRangeQuery_ (structured
          query, filter tanggal DI SISI FIRESTORE)
Period  : tanggalMulai..tanggalSelesai (parameter BEBAS, TIDAK terikat
          hardcode bulan tertentu di level SERVER — client yang
          menentukan)
Start   : ditentukan CLIENT (default: awal bulan kalender client-side
          `new Date()`, ATAU dipilih manual via filter popup)
End     : ditentukan CLIENT (default: akhir bulan yang SAMA)
Formula : COUNT(DISTINCT tanggal) dari SELURUH record absensi milik
          santri kelas ini dalam rentang, APAPUN status-nya (hadir/
          izin/sakit/alpa semua dihitung — TIDAK ADA status filter)
Display : angka polos `${item.hariAktif}` (Script_Main.html:2151, DI
          DALAM kartu Dashboard) — **TIDAK ADA teks periode/bulan
          eksplisit di kartu itu SENDIRI** (lihat §7)
```
**Formula = `COUNT(DISTINCT attendance_date)` dalam periode terpilih —
DIKONFIRMASI, sesuai hipotesis prompt §1.**

---

## 6. Period Control

```
UI kontrol   : tombol filter "iaFilterBtnLabel" (popup kartu-tengah,
               Script_Main.html — bagian dari refactor "filter
               Bulan-Tahun Dashboard" 2026-08-06 per memory project)
Default period: bulan kalender SAAT halaman dibuka (`window.iaCurrentMonthFilter_`,
               `new Date()` browser guru — Script_Main.html:1903-1910)
Selected period: disimpan di `window.iaState_.dashboardFilter`
               ({mulai, selesai, bulan, tahun}), persist SELAMA sesi
               browser (TIDAK persisten lintas reload — reset ke bulan
               berjalan lagi kalau guru reload/buka ulang)
Card berubah ketika bulan berubah? YA — `window.iaLoadDashboardSummary_`
               dipanggil ulang tiap filter diganti (dikonfirmasi alur
               kode, TIDAK diuji click-through browser sungguhan --
               keterbatasan lingkungan yang sama sesi-sesi sebelumnya)
User tahu periodenya saat lihat card? SEBAGIAN — label bulan/tahun
               ADA di tombol filter terpisah (`iaFilterBtnLabel`, via
               `window.iaUpdateFilterLabel_`), TAPI TIDAK ADA di kartu
               "Hari Aktif" itu SENDIRI (lihat §7 — kartu HANYA
               menampilkan angka polos, periode HARUS disimpulkan dari
               tombol filter terpisah di bagian LAIN layar)
```

---

## 7. UX Ambiguity

Trace tampilan aktual kartu (Script_Main.html:2151, di dalam
`iaRenderDashboardCards_`):
```js
<span class="ia-dash-stat-num">${item.hariAktif}</span>
```
**HANYA ANGKA POLOS** (`7`), TANPA label tambahan "Hari" atau nama
bulan DI DALAM kartu itu sendiri. Info periode HANYA tersedia di
tombol filter TERPISAH (`iaFilterBtnLabel`, mis. "Juli - 2026") yang
BISA jadi tidak diperhatikan guru saat fokus melihat angka di kartu.

**Evaluasi eksplisit §3 prompt**: **user TIDAK BISA membedakan** "7
hari aktif bulan Juli" vs "7 hari aktif sepanjang penggunaan aplikasi"
HANYA dari kartu itu sendiri — HARUS melihat tombol filter terpisah
utk tahu konteks bulan yang sedang aktif. **UX AMBIGUITY: CONFIRMED.**

---

## 8. Save-to-Dashboard Consistency

### Input success semantics (§9 prompt)
```
Success response : {success:true, message:...} dari serverSaveAbsensiKelas
Success message   : modal "Alhamdulillah, Absen Berhasil Disimpan" (Tahap 9,
                    window.iaShowStatusModal_) -- HANYA tampil kalau
                    withSuccessHandler MENERIMA respons {success:true}
Error response     : modal/toast SESUAI code (guru-izin/future/belum-waktu/
                    attendance-conflict [Tahap 12]/generic error) — SEMUA
                    TIDAK menampilkan pesan sukses
Network failure     : onSaveFailure (withFailureHandler) → toast "Gagal
                    menyimpan. Coba lagi." — TIDAK ADA false-positive
                    success message
Timeout              : SAMA seperti network failure (withFailureHandler
                    Apps Script client library menangani ini generik)
Retry                : MANUAL (guru harus klik Simpan lagi sendiri, TIDAK
                    ADA auto-retry) — AMAN/idempotent (delete+rewrite by
                    docId deterministik, Tahap 12 version-check MENCEGAH
                    retry menimpa perubahan guru LAIN sejak Tahap 12 live)
Duplicate submit     : DICEGAH (guard `window.iaState_.saving`, Tahap 9)
Navigasi saat save    : TIDAK diblokir eksplisit, TAPI eksekusi SERVER
                    TETAP JALAN SAMPAI SELESAI walau guru menutup app/pindah
                    layar (Apps Script server-side execution TIDAK
                    tergantung koneksi client tetap terbuka — temuan
                    Tahap 8/9 sebelumnya) — **risiko ARAH SEBALIKNYA**
                    dari yang dikhawatirkan (guru MENGIRA gagal padahal
                    sebenarnya BERHASIL di server, BUKAN mengira berhasil
                    padahal gagal)
```

**Bisakah guru merasa "sudah input" padahal server BELUM menyimpan?**
Berdasarkan kode SAAT INI (pasca Tahap 9): **KECIL KEMUNGKINANNYA,
TAPI TIDAK NOL** — satu-satunya celah adalah kalau guru MELIHAT SEKILAS
notifikasi toast/modal TANPA benar-benar membacanya (mis. langsung
menutup/navigasi cepat SEBELUM memperhatikan apakah itu pesan sukses
atau gagal) — UI SUDAH didesain (Tahap 9) supaya toast/modal
"aria-live" dan JELAS berbeda tone (hijau sukses vs merah/kuning
error), TAPI TIDAK BISA menjamin guru MEMBACA-nya. **Tidak ada bukti
konkret dari kode bahwa sistem PERNAH menampilkan pesan sukses PALSU**
— ini murni analisis KEMUNGKINAN human-factor, BUKAN bug yang
ditemukan.

### Save → Dashboard consistency (§10 prompt)
```
Setelah Save BERHASIL, apakah data PASTI menjadi bagian dari source Dashboard?
JAWABAN: YA.
```
**Evidence**: `serverSaveAbsensiKelas` (jalur guru) menulis LANGSUNG ke
`kelompok/{id}/absensi` via `iaBulkWriteAbsensiFirestore_` (docId
deterministik `tanggal_santriId`) DI DALAM `withScriptLock_`, SEBELUM
`return {success:true}` dikirim ke client. `serverGetGuruDashboardSummaryRange`
(sumber Dashboard) membaca collection **YANG SAMA PERSIS**
(`iaReadAbsensiKelompokRange_` → `firestoreRunQuery_`, TANPA cache
server, dikonfirmasi §5 Tahap 16). **TIDAK ADA jeda propagasi/eventual-
consistency** yang diketahui — respons sukses HANYA dikirim SETELAH
write Firestore selesai (bukan fire-and-forget). Save yang BERHASIL
SELALU langsung terlihat di Dashboard pada load BERIKUTNYA (BUKAN
delayed).

---

## 9. Neiza Confirmation Requirement

**PERLU dikonfirmasi LANGSUNG ke Neiza** — pertanyaan yang disiapkan
(§7 prompt, TANPA meminta screenshot kecuali benar-benar diperlukan):

> "Kak Neiza, tolong sebutkan tanggal-tanggal SPESIFIK di kelas Remaja
> SMA yang menurut Kakak sudah diinput (selain 20, 21, 22, 23, 27, 30
> Juli dan 7 Agustus 2026 yang sudah terkonfirmasi ada di sistem) —
> supaya bisa ditelusuri lebih lanjut apakah ada kendala teknis di
> tanggal tersebut."

**Kalau Neiza memberikan tanggal spesifik** (§8 prompt), trace WAJIB
dilakukan per tanggal:
```
Date → Class (Remaja SMA, jadwal_kbm.id=9) → Guru (Neiza, user.id=3) →
Attendance documents (cek absensiDocId_(tanggal, santriId) utk 7 santri) →
Save function (serverSaveAbsensiKelas, cek log/jejak kalau ada) →
Firestore result (dokumen ADA/TIDAK) → audit_log (cek entry SUKSES pada
tanggal itu) → Dashboard query (apakah tanggal itu masuk rentang yang
sedang dilihat guru saat lapor)
```
Classification per tanggal: A (never saved) / B (saved but excluded
periode) / C (calculation wrong) / D (cache) / E (display) / F
(timezone) / G (identity mismatch) / H (other) — **BELUM BISA
dijalankan tahap ini** krn belum ada tanggal spesifik dari Neiza.

---

## 10. UX Options

### Option A — Keep Monthly Metric (label periode eksplisit)
Formula/scope kartu "Hari Aktif" **TETAP** per-bulan (TIDAK diubah) —
HANYA tambahkan teks periode di dalam/dekat kartu itu SENDIRI, mis.:
```
7 Hari Aktif
Juli 2026
```
atau:
```
Hari Aktif
7 hari • Juli 2026
```
**Tidak menyentuh calculation SAMA SEKALI** — murni penambahan teks
statis dari data yang SUDAH ADA di client (`filter.bulan`/`filter.tahun`,
sudah dihitung utk `iaFilterBtnLabel`, TINGGAL dipakai ulang di kartu).

### Option B — Add Cumulative Metric (metric BARU, terpisah)
Tambahkan kartu/metric BARU "Total Hari Aktif" (all-time ATAU
tahun-ajaran, TERGANTUNG keputusan produk) **DI SAMPING** (bukan
menggantikan) kartu bulanan yang sudah ada — butuh endpoint server BARU
(query TANPA batas tanggal, atau dgn batas tahun-ajaran kalau produk
memutuskan itu definisinya) + keputusan PRODUK eksplisit ttg definisi
"cumulative" (all-time sejak kelas dibuat? sejak awal tahun ajaran?
sejak migrasi Firestore, 2026-07-28, yang artinya data SEBELUM itu di
Sheets lama TIDAK ikut terhitung kalau kelompok pernah pindah?).

**TIDAK diputuskan/dipilih SALAH SATU secara sepihak di sini** — §11 di
bawah memberi rekomendasi, TAPI Option B secara eksplisit BUTUH
keputusan PRODUK dari user (definisi "cumulative" TIDAK bisa ditentukan
teknis semata).

---

## 11. Recommended Product Decision

```
REKOMENDASI: Option A -- Existing metric UNCHANGED + explicit period label
```

**Alasan** (sesuai instruksi §12 prompt, "pilih Option A kalau evidence
menunjukkan rumus saat ini memang sesuai desain"): Tahap 16 SUDAH
membuktikan formula/query/calculation/display **BENAR** utk desain
"per-bulan" yang ADA saat ini — TIDAK ADA evidence yang menunjukkan
desain ini SALAH, HANYA evidence bahwa presentasinya AMBIGU (§7).
**Masalah ASLI adalah KOMUNIKASI (guru tidak tahu kartu itu di-scope
bulan), BUKAN KALKULASI** — solusi yang PROPORSIONAL adalah
memperbaiki komunikasi (label), **BUKAN mengubah kalkulasi supaya
angka "cocok" dgn ekspektasi guru** (dilarang eksplisit §FINAL RULE:
"Jangan mengubah calculation hanya untuk membuat angka cocok dengan
ekspektasi guru").

Option B (metric kumulatif) **TIDAK DITOLAK** — dicatat sbg
kemungkinan PRODUK MASA DEPAN kalau user memang menginginkan pandangan
all-time terpisah, TAPI BUKAN prioritas utk menutup insiden INI
(insiden ini SEPENUHNYA bisa dijelaskan oleh Option A + follow-up
konfirmasi guru, §4/§9).

---

## 12. Implementation Boundary (PREVIEW, TIDAK DIEDIT tahap ini)

```
File     : Script_Main.html
Function : window.iaRenderDashboardCards_ (kartu per kelas, Dashboard
           Kehadiran guru + admin_kelp — KEDUANYA pakai fungsi render
           yang SAMA, dikonfirmasi memory project "reuse pipeline
           iaRenderDashboardCards_")
HTML element : <span class="ia-dash-stat-num"> (Script_Main.html:2151)
           -- TAMBAH elemen teks kecil BARU di bawah/sebelah angka,
           BUKAN mengubah elemen yang sudah ada
Data source   : window.iaState_.dashboardFilter (SUDAH ADA di client,
           berisi {bulan, tahun} yang SAMA dipakai iaUpdateFilterLabel_
           -- TIDAK PERLU round-trip server BARU, murni pakai ulang
           data yang SUDAH ADA di memory client)
Period variable: filter.bulan/filter.tahun (SUDAH ADA, IA_FILTER_NAMA_BULAN_
           array SUDAH ADA utk format nama bulan Indonesia)
```

**Perubahan HARUS "UI label only"** (dipatuhi §13 prompt) — TIDAK
menyentuh `serverGetGuruDashboardSummaryRange`/
`serverGetAdminKelpDashboardSummaryRange`/`iaReadAbsensiKelompokRange_`/
formula `hariAktif` SAMA SEKALI (SEMUA sudah terbukti benar, Tahap 16).

---

## 13. Regression Plan (PREVIEW, TIDAK DIEKSEKUSI tahap ini)

```
Test dgn DATA YANG SUDAH ADA (nyata, TIDAK dikarang, sesuai §14 prompt):
  Juli 2026, kelas Remaja SMA     -> expected 7 hari (dari source data,
                                      dikonfirmasi ulang §9 Tahap 16 --
                                      BUKAN angka baru, kutip yang sudah
                                      diverifikasi)
  Agustus 2026, kelas Remaja SMA  -> expected 1 hari (HANYA 2026-08-07,
                                      dari 8 tanggal raw yang sudah
                                      diverifikasi §9 Tahap 16)
  All-time (kalau Option B nanti dibuat) -> expected 8 hari (dari raw
                                      ground truth §9 Tahap 16)

Test interaksi UI:
  Ganti bulan filter -> kartu update -> LABEL PERIODE ikut update
  (konsisten, TIDAK ada kartu yg "telat" nunjukin bulan lama saat
  angkanya sudah baru, atau sebaliknya)

  Kartu kelas LAIN (bukan Remaja SMA) -> label periode SAMA (1 filter
  berlaku utk SEMUA kartu di layar yang sama, TIDAK per-kartu)

  admin_kelp Dashboard (serverGetAdminKelpDashboardSummaryRange, formula
  SAMA) -> label periode JUGA muncul konsisten kalau perubahan
  diterapkan di fungsi render YANG SAMA (iaRenderDashboardCards_)
```

**Angka test HARUS diambil dari source data real** (dipatuhi §14 —
SEMUA angka di atas DIKUTIP dari Tahap 16 yang SUDAH diverifikasi
Firestore langsung, TIDAK dikarang).

---

## 14. Open Questions

- **Konfirmasi tanggal spesifik dari Neiza** (§9) — TETAP jadi
  prasyarat WAJIB sebelum kontributor #2 (kemungkinan data tidak
  tersimpan) bisa ditutup/diklasifikasi definitif — TIDAK ADA cara
  lain dari sistem semata utk menjawab ini (§4).
- **Definisi "cumulative" utk Option B** (§10) — kalau user MEMANG
  ingin metric kumulatif suatu saat, perlu keputusan eksplisit: all-time
  MURNI, tahun-ajaran, atau sejak tanggal tertentu (mis. sejak migrasi
  Firestore 2026-07-28 utk kelompok yang baru pindah) — di luar
  cakupan penutupan insiden INI.
- **Human-factor notifikasi save** (§8) — TIDAK ditemukan bug konkret,
  TAPI apakah perlu penguatan LEBIH LANJUT (mis. konfirmasi visual yang
  lebih tegas/tahan-lama) di luar yang sudah ada dari Tahap 9? Keputusan
  PRODUK, BUKAN teknis, di luar cakupan tahap ini.
- **Apakah kartu "Hari Aktif" di Riwayat Kehadiran (`iaRiwayatHariAktifLabel`,
  Script_Main.html:1716) JUGA butuh label periode serupa?** — layar ITU
  SUDAH punya pemilihan bulan/tahun eksplisit via popup (beda UI dari
  Dashboard Kehadiran) — perlu ditelusuri TERPISAH apakah ambiguitas
  yang SAMA berlaku di sana, di luar cakupan audit spesifik Neiza/
  Remaja SMA/Dashboard Kehadiran kali ini.

---

## FINAL OUTPUT

```
TAHAP 17 — DASHBOARD PERIOD UX DECISION

Guru:
Neiza

Class:
Remaja SMA

Confirmed Firestore:
8 hari

Dashboard July:
7 hari

Confirmed Outside-Period Date:
2026-08-07

Unknown Claimed Dates:
2

System Evidence:
INSUFFICIENT TO IDENTIFY (audit_log secara struktural hanya mencatat
save yang BERHASIL, yang PASTI sudah tercermin di Firestore -- tidak
ada sumber lain yang bisa mengungkap percobaan yang gagal/tidak pernah
terjadi)

Hari Aktif Formula:
CORRECT

Period Scope:
MONTHLY

UX Ambiguity:
CONFIRMED (kartu hanya menampilkan angka polos, periode HANYA ada di
tombol filter terpisah, tidak di dalam kartu itu sendiri)

Recommended Fix:
EXPLICIT PERIOD LABEL (Option A -- existing metric unchanged)

Calculation Change:
NO

Backend Change:
NO

Firestore Change:
NO

Production:
UNCHANGED

Need Teacher Confirmation:
YES (utk menutup kontributor #2 -- 2 tanggal klaim guru yang belum
terlacak dari sistem)

Next:
TAHAP 18 — IMPLEMENT UX FIX
```
