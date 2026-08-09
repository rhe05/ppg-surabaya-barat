# Proposal Optimasi — Firestore Write Kehadiran

> Tahap 3. Mode: **INVESTIGATE FIRST**, tidak ada kode diubah pada dokumen
> ini. Fokus SEMPIT: `iaBulkWriteAbsensiFirestore_` (Modul_InputAbsen.gs)
> dan jalur pemanggilnya. Tanggal: 2026-08-08.

---

## Measured Baseline

```
Firestore Write = 1950 ms median  (n=9 santri, Guru Normal Path, serverSaveAbsensiKelas)
Save Total      = 3892 ms median
```

Sumber: `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md` §5 (Guru Normal Path),
9 santri, 5 run. Data pendukung dari baseline admin (n=1/5/9, `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md`
§8 pass pertama) juga dipakai di analisis root cause (lihat di bawah — bukti
independen bahwa jumlah dokumen TIDAK mempengaruhi durasi write secara
berarti di rentang 1-9).

---

## Current Behavior (bukti kode, dibaca lengkap — TIDAK diubah)

### Trace end-to-end

```
serverSaveAbsensiKelas (Modul_InputAbsen.gs:584)
  ↓
iaRewriteAbsensiKelas_ (Modul_InputAbsen.gs:454)
  ↓ (cabang: isKelompokTableOnFirestore_(ABSENSI, kelompokId) === true, Kelp Petemon)
iaRewriteAbsensiKelasFirestore_ (Modul_InputAbsen.gs:500)
  ↓ hitung deleteSantriIds = santriIdSet MINUS santri_id di absensiList yg dikirim klien
iaBulkWriteAbsensiFirestore_ (Modul_InputAbsen.gs:517)
  ↓ bangun array `requests[]`: 1 objek {method:'delete',...} per deleteSantriIds
  ↓                            1 objek {method:'patch',...} per item upsertList
  ↓ SEMUA id dokumen DETERMINISTIK (absensiDocId_ = `tanggal_santriId`, Modul_Utilities.gs:451)
  ↓ TIDAK ADA read/query Firestore apa pun sebelum ini (upsert-without-read, sesuai
  ↓   prinsip performa Firestore project ini)
UrlFetchApp.fetchAll(requests)   ← SATU panggilan, membawa SEMUA request (delete+patch) sekaligus
  ↓
Firestore REST API (PATCH per-dokumen dgn updateMask, DELETE per-dokumen)
```

### Untuk kasus test nyata (n=9, semua santri diisi status — kondisi paling umum)

```
Jumlah HTTP request dalam 1 fetchAll = 9  (0 delete + 9 patch)
Jumlah DELETE   = 0   (santri TIDAK dikeluarkan dari form dalam skenario test/khas)
Jumlah PATCH    = 9   (1 per santri, SELALU ditulis walau status tidak berubah)
Jumlah dokumen  = 9   (id deterministik: "2020-01-06_245", dst)
fetchAll batch  = 1   (SEMUA 9 request dikirim dalam 1 panggilan fetchAll — BUKAN 9 panggilan fetchAll terpisah)
Payload/request = ~150-250 byte body (JSON fields) + query string updateMask
                  (6 field path: id, santri_id, tanggal, status, dicatat_oleh, kelompok_id)
Payload total    = ~2-3 KB untuk 9 dokumen — TIDAK signifikan pada skala ini
```

---

## Root Cause (evidence-based)

### Bukti #1 — jumlah dokumen TIDAK mempengaruhi durasi write

Dari `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md` §8 (baseline admin,
3 run per ukuran, fungsi `serverSaveAbsensiKelasAdmin` — TAPI memanggil
`iaRewriteAbsensiKelas_`/`iaBulkWriteAbsensiFirestore_` yang **SAMA PERSIS**
dengan jalur guru, jadi datanya representatif untuk fungsi write ini):

| n santri | writeMs run 1 | run 2 | run 3 | **Median** |
|---:|---:|---:|---:|---:|
| 1 | 1558 | 1794 | 1865 | **1794** |
| 5 | 1938 | 2067 | 1892 | **1938** |
| 9 | 1685 | 1836 | 1922 | **1836** |

**n=1 (median 1794ms) HAMPIR SAMA dengan n=9 (median 1836ms)** — selisih
42ms, jauh lebih kecil dari variansi run-to-run dalam 1 ukuran yang SAMA
(mis. n=5: rentang 1892-2067ms = 175ms). Ini bukti kuat: **durasi write TIDAK
scaling dengan jumlah dokumen** di rentang 1-9 — `fetchAll` MEMANG
mem-paralel-kan request-nya dengan benar (kalau serial, n=9 akan ~9× lebih
lambat dari n=1, TIDAK terjadi).

### Bukti #2 — n=1 SENDIRI sudah ~1.8 detik

Karena n=1 (1 PATCH request SAJA, tanpa delete) tetap ~1794ms median, floor
latency ini BUKAN "overhead mengelola banyak request paralel" — untuk 1
request pun `UrlFetchApp.fetchAll` (yg dengan 1 elemen berperilaku hampir
sama dengan `UrlFetchApp.fetch` biasa) ke Firestore REST API dari Apps
Script SUDAH memakan waktu segini. Ini konsisten dengan karakteristik
platform (round-trip network Apps Script→Firestore REST API, TERMASUK di
dalamnya waktu proses Firestore sendiri utk 1 write) — **BUKAN** sesuatu
yang bisa diperbaiki dengan mengubah cara kode ini menyusun/mengirim
request, karena kode SUDAH mengirim seminimal mungkin (1 fetchAll, id
deterministik, tanpa baca dulu).

### Root Cause Statement

**Latency `iaBulkWriteAbsensiFirestore_` (median ~1.8-2.0 detik) didominasi
oleh floor latency round-trip tunggal Apps Script `UrlFetchApp` →
Firestore REST API, bukan oleh jumlah dokumen/request dalam rentang yang
diuji (1-9 santri).** Kode saat ini SUDAH mengimplementasikan seluruh best
practice yang tercatat di prinsip performa Firestore project ini (id
dokumen deterministik, upsert TANPA baca dulu, 1 batch paralel via
`fetchAll`, tanpa retry tersembunyi, tanpa parsing response yg tidak
perlu). Evidence TIDAK mendukung adanya inefisiensi kode yang bisa
diperbaiki dengan aman pada skala data yang ada saat ini (kelas terbesar
Kelp Petemon = 9 santri).

---

## Identifikasi Sumber Latency (checklist §4 prompt)

| # | Item | Temuan |
|---|---|---|
| A | HTTP overhead (auth/header/URL/payload) per request | `firestoreGetAccessToken_()` dipanggil **1×** di luar loop (Modul_InputAbsen.gs:519), token di-cache 55 menit (`Modul_FirestoreBridge.gs:45-47`) — BUKAN sumber overhead berulang. URL/payload construction murni string concat di memori, biaya µs, bukan ms. |
| B | Request count (N santri = N request?) | YA, tapi TERBUKTI (Bukti #1) tidak berkorelasi dgn durasi total pada rentang 1-9 — bukan N+1 dlm pengertian merugikan. |
| C | Payload size | ~2-3KB total utk 9 dokumen — diabaikan secara praktis pada skala jaringan modern. |
| D | `fetchAll` — benar paralel? | YA (Bukti #1) — kalau serial, n=9 akan jauh lebih lambat dari n=1. Tidak ada dependency antar-request (semua `delete`/`patch` independen per dokumen). |
| E | Response body diproses tanpa perlu? | TIDAK — `resp.getContentText()` HANYA dipanggil di jalur ERROR (`Modul_InputAbsen.gs:554`), bukan di jalur sukses. |
| F | Kontribusi DELETE vs PATCH | Dalam skenario test/khas (semua santri terisi): **0 DELETE, 100% PATCH**. Delete HANYA terpicu kalau santri dikeluarkan dari form (jarang) — kontribusinya TIDAK terukur di baseline ini krn tidak pernah ter-trigger selama test. |
| G | Document ID deterministic, tanpa read-before-write? | YA, terverifikasi (`absensiDocId_`, dipakai konsisten di delete & upsert, TIDAK ada `firestoreGetDoc_`/`firestoreListCollection_` di jalur ini). |
| H | Retry/error handling tersembunyi? | TIDAK — 1× `UrlFetchApp.fetchAll`, tidak ada loop retry, `muteHttpExceptions:true` cuma supaya error di-handle manual (`throw` di baris 554), bukan retry. |

**Kesimpulan checklist**: TIDAK ada item A/C/E/G/H yang jadi sumber
latency. B/D sudah optimal (paralel, tidak N+1). **F (delete strategy)
tidak berkontribusi ke baseline yang diukur** (karena skenario ujinya
tidak memicu delete) — lihat analisis Case di bawah.

---

## Analisis Delete Semantics (§3 prompt — WAJIB sebelum ubah apa pun)

### Case A — Semua santri tetap memiliki status
`santriIdSet` (roster kelas saat ini) === santri_id yang ada di
`absensiList` yang dikirim klien (UI SELALU mengirim status utk SEMUA
santri di roster — dikonfirmasi baca `Script_Main.html:2556`,
`window.iaState_.list.map(s => ({santri_id, status: s.status}))`, tidak
ada jalur UI yang mengirim subset). → `deleteSantriIds = []`. **Delete
TIDAK terpicu.** PATCH menimpa/membuat semua 9 dokumen. Correctness: benar,
idempotent.

### Case B — Sebagian santri statusnya "dihapus/dikosongkan"
**TIDAK REACHABLE via UI produksi saat ini** — setiap santri di
`iaState_.list` SELALU punya field `status` non-kosong (default `'hadir'`
kalau belum pernah diisi, lihat `serverGetAbsensiKelasForm`/
`serverGetKelasAbsenList`, Modul_InputAbsen.gs:436/1115: `status:
statusMap[s.id] || 'hadir'`). Tidak ada tombol/aksi "kosongkan status" di
UI. Kalau suatu saat fitur ini ditambahkan (klien mengirim `status: ''`
atau meniadakan entry), kode SAAT INI akan tetap **PATCH** dengan
`status:''` (bukan delete) kecuali entry-nya benar-benar dihilangkan dari
array `absensiList` — perilaku ini konsisten tapi PERLU keputusan produk
terpisah kalau fitur "kosongkan status" mau ditambah nanti (di luar cakupan
optimasi write ini).

### Case C — Santri dikeluarkan dari form
Terjadi kalau `santriIdSet` (dihitung ULANG server-side dari
`santri.kelas_ngaji` SAAT INI, Modul_InputAbsen.gs:620-622) berisi santri
yang TIDAK ADA di `absensiList` yang dikirim klien — misal klien memuat
form, lalu ANTARA load & save ada santri baru masuk kelas (jarang), atau
(lebih realistis) BUG klien mengirim array tidak lengkap. → santri itu
MASUK `deleteSantriIds`, DIHAPUS dari Firestore utk tanggal itu. **Delete
DIPERLUKAN di sini** — kalau tidak dihapus, dokumen absensi lama santri
itu (kalau ada, dari save SEBELUMNYA saat dia masih dikirim klien) akan
"nyangkut" selamanya walau guru sudah tidak menandainya lagi di form
terbaru untuk tanggal itu. **NOT SAFE TO CHANGE tanpa delete** — kalau
delete dihapus/diganti upsert-only, data lama yang seharusnya sudah tidak
valid akan tetap ada (stale read di Laporan/Riwayat/Kehadiran Generus).

### Case D — Status berubah (mis. hadir → izin)
`deleteSantriIds` tidak berubah (santri itu tetap ada di `absensiList`).
PATCH menimpa nilai `status` di dokumen yang SAMA (id deterministik sama).
Correctness: benar, atomik per-dokumen (Firestore PATCH per dokumen sudah
atomik di level dokumen tunggal).

### Case E — Guru menyimpan ulang data yang SAMA (tidak ada perubahan)
`deleteSantriIds` tetap `[]` (jika Case A). PATCH tetap dikirim ULANG utk
SEMUA 9 santri walau nilainya PERSIS SAMA dgn yang tersimpan — **write yang
sebenarnya tidak perlu SECARA NILAI (idempotent no-op), tapi tetap
mengirim HTTP request**. Ini SATU-SATUNYA kandidat "unnecessary write"
yang teridentifikasi. **NAMUN**: untuk mendeteksi "tidak ada perubahan",
kode HARUS membaca nilai lama dulu (baik via `firestoreGetDoc_` per
dokumen, atau baca ulang seluruh 9 dokumen) — ini BERTENTANGAN LANGSUNG
dengan prinsip arsitektur yang sudah ditetapkan project ini ("upsert
langsung, TANPA baca dulu", `CLAUDE.md` §Prinsip Performa Firestore) dan,
berdasarkan Bukti #2 (1 round-trip tunggal SUDAH ~1.8 detik), **menambah
1 read round-trip kemungkinan besar TIDAK menghemat waktu bersih** —
malah berisiko menambah total latency (1 read + N write-yang-lolos-cek vs
saat ini N write langsung, tanpa read). **TIDAK ADA cara aman
menghilangkan Case E "unnecessary write" tanpa melanggar prinsip
arsitektur yang sudah disepakati DAN tanpa bukti bahwa itu akan lebih
cepat.**

### Kesimpulan Delete Semantics
**Delete-then-upsert TETAP DIPERLUKAN** (Case C membuktikan ini secara
correctness) dan **TIDAK ADA alternatif upsert-only yang aman** tanpa
mengubah kontrak "absensiList yang dikirim = definisi lengkap kondisi
kelas pada tanggal itu". Tidak ada perubahan pada mekanisme delete yang
diusulkan.

---

## Proposed Change

**TIDAK ADA perubahan kode yang diusulkan pada tahap ini.**

Evidence (Bukti #1 & #2 di atas) menunjukkan bottleneck adalah floor
latency round-trip tunggal `UrlFetchApp` → Firestore REST API — bukan pola
N+1, bukan read-before-write yang tidak perlu, bukan payload berlebih,
bukan delete yang salah sasaran. Kode `iaBulkWriteAbsensiFirestore_`
SUDAH mengimplementasikan pola optimal yang tersedia dalam arsitektur
Apps Script + Firestore REST API saat ini untuk kasus n≤9 santri (satu-
satunya rentang yang bisa diverifikasi dengan data real project ini).

### Kandidat yang DIPERTIMBANGKAN tapi DITOLAK (dengan alasan)

**Kandidat: Ganti N request individual (`delete`/`patch` per dokumen) jadi
1 request tunggal ke endpoint Firestore REST `:commit`** (batch write
atomik native Firestore, `projects.databases.documents:commit`, menerima
array `writes` berisi semua operasi delete+update dalam SATU HTTP call).

- **Potensi manfaat**: SECARA TEORI mengurangi jumlah HTTP request dari N
  jadi 1 — TAPI Bukti #1/#2 menunjukkan floor latency SUDAH ada bahkan di
  n=1 (1 request tunggal), jadi TIDAK ADA evidence bahwa mengurangi "N
  request paralel dalam 1 fetchAll" menjadi "1 request tunggal ke :commit"
  akan mengurangi durasi — `fetchAll` SUDAH menjadikannya 1 "round-trip
  logis" dari sisi Apps Script (semua N request dikirim dalam 1 panggilan
  fetchAll, bukan N panggilan terpisah).
- **Manfaat sekunder yang MUNGKIN nyata**: atomicity SEBENARNYA (`:commit`
  bersifat all-or-nothing, sedangkan N request `fetchAll` saat ini
  independen — kalau request ke-5 dari 9 gagal, request 1-4 & 6-9 yang
  sudah terkirim TETAP tersimpan, hasil AKHIR bisa parsial-tersimpan).
  Ini KEUNGGULAN CORRECTNESS, bukan performa — DI LUAR cakupan "Tahap ini:
  hanya Firestore Write [performa]".
- **Kenapa DITOLAK utk tahap ini**: (1) TIDAK ADA evidence performa yang
  mendukungnya (lihat di atas) — mengimplementasikan tanpa bukti akan
  lebih cepat melanggar instruksi eksplisit "jangan mengklaim improvement
  jika variance terlalu besar" / "Expected Impact: EXPECTED UNKNOWN UNTIL
  MEASURED" HANYA relevan kalau ADA alasan kuat utk mencoba; di sini
  alasannya justru LEMAH. (2) `:commit` adalah **mekanisme REST BARU yang
  belum pernah dipakai di codebase ini** (dicek: `grep -r ":commit"` = 0
  hasil) — payload format berbeda (`writes[]` dgn `update`+`updateMask`
  per-item vs `delete`), response format berbeda, error-handling utk
  partial-failure-dalam-1-request berbeda. Ini **PERUBAHAN BESAR PADA
  SAVE ARCHITECTURE** sesuai definisi §14 prompt ini sendiri.

**Keputusan**: sesuai §14 (PAUSE RULE) — perubahan ini TIDAK diimplementasikan.

```
PAUSE — APPROVAL REQUIRED
```

Kalau Anda tetap ingin mengeksplorasi `:commit` (utk manfaat atomicity,
BUKAN performa — performa EXPECTED UNKNOWN UNTIL MEASURED dan evidence
saat ini justru menunjukkan kemungkinan TIDAK ADA perbaikan performa),
itu perlu proposal terpisah dengan scope eksplisit "atomicity improvement"
bukan "performance optimization", dan pengujian n lebih besar (>9 santri,
belum tersedia di data real kelompok ini) untuk melihat apakah floor
latency berubah pada skala berbeda.

---

## Correctness Analysis

Tidak berlaku — tidak ada perubahan yang diimplementasikan pada tahap ini.

## Risk

**N/A — tidak ada implementasi.** (Kandidat `:commit` yang ditolak akan
masuk kategori **Medium-High** kalau suatu saat diusulkan ulang: mengubah
mekanisme HTTP request + error handling + semantik atomicity, walau
manfaat performanya sendiri belum terbukti.)

## Expected Impact

```
EXPECTED: UNKNOWN UNTIL MEASURED
```

Tidak relevan diisi lebih lanjut — tidak ada perubahan yang diusulkan
untuk diimplementasikan.

## Rollback

Tidak berlaku — tidak ada kode yang diubah.

---

## Kesimpulan Tahap 3

Investigasi selesai. **Tidak ditemukan optimasi Firestore Write yang aman
DAN didukung evidence performa** dalam cakupan yang diizinkan (tanpa
mengubah delete semantics, document model, authorization, atau melakukan
perubahan arsitektur besar). Kode `iaBulkWriteAbsensiFirestore_` sudah
sesuai best practice yang berlaku di project ini. Bottleneck ~1.8-2.0
detik yang terukur adalah floor latency platform (Apps Script `UrlFetchApp`
↔ Firestore REST API per round-trip), bukan inefisiensi aplikasi yang bisa
diperbaiki dengan aman pada tahap ini.

**Tidak ada kode yang diimplementasikan/di-deploy pada Tahap 3 ini.**
