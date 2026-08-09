# Attendance Write Architecture Decision (Tahap 8)

> Mode: **ARCHITECTURE INVESTIGATION + DECISION ONLY**. Tidak ada kode,
> Firestore, atau Supabase yang diubah. Tidak ada benchmark production
> baru dijalankan — SEMUA angka di dokumen ini diambil dari laporan
> pengukuran yang SUDAH ADA (Tahap 2, 3, 5, 6, 7). Tanggal: 2026-08-08.

---

## 1. Executive Summary

Setelah 3 putaran optimasi cache (`audit_log` UUID, `akses_kelas_request`
cache, `guru_izin` cache — SEMUA berhasil, dampak besar pada komponennya
masing-masing), **Firestore Write tetap ~1950ms, TIDAK tersentuh oleh
satu pun optimasi tsb** (memang di luar cakupannya) dan **TETAP komponen
tunggal terbesar** dari Save Attendance (~57-60% dari total). Tahap 3
SUDAH membuktikan dgn evidence kuat (n=1 vs n=9 nyaris identik) bahwa
angka ini adalah **floor latency platform** (round-trip `UrlFetchApp` ↔
Firestore REST API), BUKAN inefisiensi kode yang bisa diperbaiki dgn
perubahan kecil dalam arsitektur saat ini.

**Rekomendasi utama** (detail & alasan di §14): **WAIT FOR SUPABASE** —
JANGAN investasi waktu lebih lanjut mengoptimasi Firestore write path
saat ini. Floor latency 1.8-2.0 detik adalah karakteristik platform yang
migrasi arsitektur (BUKAN tweak kode) yang dibutuhkan utk benar-benar
mengubahnya, DAN migrasi ke Supabase SUDAH direncanakan — mengoptimasi
sesuatu yang akan diganti total adalah kerja yang tidak sepadan
usianya. Mitigasi UX (bukan database) adalah jalur yang PALING masuk akal
utk perbaikan yang dirasakan guru DALAM WAKTU DEKAT, tanpa menyentuh
arsitektur data.

---

## 2. Current Architecture

Trace kode aktual (dibaca ulang, dikonfirmasi TIDAK berubah sejak Tahap
3 — `iaBulkWriteAbsensiFirestore_` identik):

```
Guru (browser)
  ↓ google.script.run
serverSaveAbsensiKelas (Modul_InputAbsen.gs:597)
  ↓ requireGuruContext_ (auth token → session)
  ↓ format tanggal validate
  ↓ iaReadKelompokTablesParallel_ (JADWAL_KBM+GURU+SANTRI, cache-first sejak sebelumnya)
  ↓ canGuruAccessKelas_ (Tahap 6: cache-first akses_kelas_request)
  ↓ iaValidateWaktuAbsen_ (waktu sesi, tidak disentuh tahap mana pun)
  ↓ iaCekGuruSedangIzin_ (Tahap 7: cache-first guru_izin)
  ↓ santriIdsKelas filter (in-memory)
  ↓ withScriptLock_ (Modul_Utilities.gs:462) {
  ↓     iaRewriteAbsensiKelas_ → iaRewriteAbsensiKelasFirestore_ (Modul_InputAbsen.gs:503-513)
  ↓         iaBulkWriteAbsensiFirestore_ (Modul_InputAbsen.gs:526-569)
  ↓ }
  ↓ logAudit (Tahap 5: UUID id, tanpa full-scan)
  ↓ return {success, message}
client (terima response, update UI)
```

**Detail write Firestore** (`iaBulkWriteAbsensiFirestore_`,
Modul_InputAbsen.gs:526-569):

| Item | Nilai |
|---|---|
| File:function | `Modul_InputAbsen.gs:526`, `iaBulkWriteAbsensiFirestore_` |
| Request count | N = jumlah delete + jumlah upsert (n=9 santri tipikal = 0-9 delete + 9 upsert = 9-18 request) |
| HTTP method | `DELETE` (per dokumen dihapus) + `PATCH` (per dokumen di-upsert, dgn `updateMask`) |
| Endpoint | Firestore REST v1: `{baseUrl}/kelompok/{id}/absensi/{docId}` (`firestoreBaseUrl_()`, Modul_FirestoreBridge.gs:30-33) — endpoint dokumen INDIVIDUAL, BUKAN `:commit`/`:batchWrite` |
| Authentication | JWT-bearer OAuth2 service account (`firestoreGetAccessToken_`, Modul_FirestoreBridge.gs:45-), token di-cache 55 menit — TIDAK di-generate ulang per request |
| Payload | Per-dokumen: `{fields: {id, santri_id, tanggal, status, dicatat_oleh, kelompok_id}}` (~150-250 byte) + query string `updateMask` |
| Document ID | Deterministik (`absensiDocId_` = `tanggal_santriId`, Modul_Utilities.gs:451) — TIDAK ADA read-before-write |
| Response handling | `resp.getResponseCode()` dicek per response; `getContentText()` HANYA dipanggil di jalur error (bukan overhead di jalur sukses) |
| Retry behavior | **TIDAK ADA** — 1× `UrlFetchApp.fetchAll`, gagal 1 request = seluruh operasi `throw Error` |
| Timeout | Default Apps Script `UrlFetchApp` (~tidak dikonfigurasi eksplisit, pakai default platform) |
| Error handling | `muteHttpExceptions: true` (supaya bisa dicek manual) → kalau ADA 1 response gagal (code<200 atau >=300), `throw new Error(...)` — SELURUH fungsi gagal, TIDAK ada partial-success handling eksplisit |
| Atomicity | **TIDAK atomik** — N request independen; kalau request ke-5 dari 9 gagal, request 1-4 (dan mungkin 6-9 yg sudah terkirim paralel) TETAP tersimpan di Firestore, hanya function-level exception yang muncul ke caller |

---

## 3. Measured Baseline

Sumber: `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md`,
`AKSES_KELAS_REQUEST_OPTIMIZATION_REPORT.md`,
`GURU_IZIN_OPTIMIZATION_REPORT.md`. TIDAK ADA angka baru diukur tahap ini.

```
Save Attendance (Guru Normal, n=9)  = 3255-3368 ms median (bergantung run pengukuran, semua dlm rentang overlap)
Firestore Write                      ≈ 1950 ms median (TIDAK BERUBAH sejak Tahap 3 — tidak disentuh optimasi mana pun)
audit_log                            = 292 ms (turun dari 572ms, Tahap 5)
akses_kelas_request                  = 86 ms (turun dari 455ms, Tahap 6)
guru_izin                            = 19 ms (turun dari 227ms, Tahap 7)
Lock wait                            ≈ 115 ms
Switch Class                         ≈ 2108 ms (belum diukur ulang pasca-optimasi cache)
```

**Kontribusi Firestore Write thd Save Total SEKARANG** (setelah 3
optimasi lain): ~1950 / ~3300 ≈ **59%** — PROPORSI-nya justru NAIK
dibanding sebelum optimasi (1950/3892 ≈ 50%), krn komponen LAIN sudah
diperkecil sedangkan Firestore Write tetap sama. Ini bukti tambahan
bahwa **Firestore Write sekarang adalah bottleneck TUNGGAL paling
dominan** yang tersisa di jalur Save.

---

## 4. Latency Floor Evidence

Dari `FIRESTORE_WRITE_OPTIMIZATION_PROPOSAL.md` (Tahap 3), data ASLI
(TIDAK diubah):

```
n=1 santri: writeMs median = 1794 ms (3 run: 1558, 1794, 1865)
n=9 santri: writeMs median = 1836 ms (3 run: 1685, 1836, 1922)
```

**Mengapa ini menunjukkan latency TIDAK terutama dipengaruhi jumlah
dokumen**: selisih median n=1 vs n=9 hanya **42ms** — jauh LEBIH KECIL
dari variansi run-to-run DALAM 1 ukuran yang SAMA (mis. n=1: rentang
1558-1865ms = 307ms; n=9: rentang 1685-1922ms = 237ms). Kalau
`UrlFetchApp.fetchAll` MEMANG dijalankan serial (bukan paralel), n=9
akan ~9× lebih lambat dari n=1 (secara kasar >10 detik) — TIDAK terjadi.
Kalau overhead dominan adalah PER-DOKUMEN, n=9 akan konsisten lebih
lambat dari n=1 dengan margin yang JELAS lebih besar dari variansi noise
— JUGA tidak terjadi (42ms << 237-307ms variansi). Kesimpulan: **1
round-trip fetchAll (berapa pun dokumen di dalamnya, dalam rentang 1-9
yang teruji) memiliki floor ~1.8-2.0 detik yang didominasi oleh sesuatu
di LUAR kontrol kode aplikasi** (kandidat: TLS handshake/koneksi baru
per fetchAll call, Firestore backend write processing time, jarak
network Apps Script↔Firestore, quota/throttling internal Google). Ini
KONSISTEN dgn evidence, bukan estimasi baru.

---

## 5. Correctness Contract

**CURRENT CORRECTNESS CONTRACT** (dibaca dari kode aktual, Tahap 3 §3
+ konfirmasi ulang §2 dokumen ini):

- **Delete existing records**: HANYA santri yang ADA di roster kelas
  SAAT INI tapi TIDAK ADA di `absensiList` yang dikirim klien —
  dihitung di `iaRewriteAbsensiKelasFirestore_` (Modul_InputAbsen.gs:503-513),
  dieksekusi via `DELETE` per dokumen dgn id deterministik.
- **Write new records**: SEMUA entri di `absensiList` yang dikirim
  klien — dieksekusi via `PATCH` (upsert) per dokumen.
- **Deterministic document ID**: YA, SELALU — `tanggal_santriId`
  (`absensiDocId_`), TIDAK PERNAH read-before-write utk menentukan id.
- **Idempotency**: Save ULANG dgn payload yang SAMA PERSIS = hasil akhir
  IDENTIK (upsert menimpa dgn nilai yang sama, delete-set yang sama
  kalau roster tidak berubah) — **idempotent** di level HASIL AKHIR,
  TAPI **BUKAN idempotent di level SIDE-EFFECT** (setiap save ulang
  TETAP menulis N request Firestore + 1 baris `audit_log` baru,
  walau nilai akhirnya sama — lihat Tahap 3 "Case E").
- **Empty status behavior**: TIDAK REACHABLE via UI produksi (setiap
  santri di form SELALU punya `status` non-kosong, default `'hadir'`) —
  dikonfirmasi Tahap 3.
- **Removed student behavior**: santri yang dikeluarkan dari
  `absensiList` (relatif thd roster kelas SAAT INI) → dihapus (lihat
  "Delete existing records" di atas). Ini SATU-SATUNYA skenario nyata
  yang memicu `DELETE`.
- **Resave behavior**: SELALU diizinkan (guru boleh koreksi absen
  kapan pun, TIDAK ADA flag "sudah final") — `formSudahTersimpan`
  SENGAJA selalu `false` (Modul_InputAbsen.gs, komentar eksplisit).
- **Duplicate prevention**: dijamin OLEH id deterministik (upsert ke id
  yang sama = menimpa, bukan menduplikasi) — BUKAN oleh pengecekan
  eksplisit di level aplikasi.
- **Partial failure handling**: **TIDAK ADA** — lihat §8 Failure
  Scenarios utk detail.

---

## 6. Failure Model

| # | Skenario | Current behavior | Risk | Recovery | Idempotency |
|---|---|---|---|---|---|
| A | Network timeout SETELAH delete, SEBELUM write | `fetchAll` mengirim SEMUA request (delete+patch) DALAM 1 BATCH PARALEL — TIDAK ADA jeda sekuensial "delete dulu baru patch" (keduanya dalam array `requests` yang SAMA, dieksekusi bersamaan) — skenario ini SECARA HARFIAH tidak mungkin persis spt dideskripsikan, TAPI kalau timeout terjadi DI TENGAH fetchAll, sebagian request (delete DAN/ATAU patch) mungkin sukses, sebagian tidak. | Data bisa PARSIAL (sebagian santri terhapus, sebagian tidak ter-upsert) | Guru re-save (idempotent di level hasil, akan re-delete+re-upsert dgn benar) | Ya, kalau guru sadar & save ulang |
| B | Delete berhasil, write (patch) gagal | Karena SATU batch paralel (bukan 2 fase terpisah), "delete berhasil dulu baru patch" BUKAN urutan yang dijamin — TAPI kalau demikian terjadi (network-level), hasil = santri yang di-delete-set HILANG datanya, santri di-upsert-set TIDAK tersimpan → keseluruhan fungsi `throw Error` (respons ke klien = GAGAL), tapi Firestore SUDAH berubah sebagian | Data absensi tanggal itu jadi TIDAK LENGKAP sampai guru save ulang | Guru lihat pesan error → save ulang | Ya |
| C | Sebagian write (patch) berhasil, sebagian gagal | SAMA seperti B — `fetchAll` menjalankan semua paralel, response dicek satu-satu SETELAH semua selesai; begitu ADA 1 yang gagal, `throw Error` — TAPI request yang SUDAH sukses (termasuk yang urutan-nya SETELAH yang gagal dalam array, krn paralel bukan sekuensial) TETAP tersimpan di Firestore | Data absensi PARSIAL tersimpan, klien menerima error (tidak tahu MANA yang sukses) | Guru save ulang (aman, idempotent) | Ya, tapi guru TIDAK dapat info "mana yang sudah tersimpan" dari respons error saat ini |
| D | Client disconnect (browser tertutup/koneksi putus) SETELAH request terkirim, SEBELUM response diterima | Apps Script execution TETAP JALAN SAMPAI SELESAI di server (google.script.run tidak membatalkan eksekusi server hanya krn klien disconnect) — Firestore write TETAP tereksekusi & tersimpan, HANYA klien yang tidak menerima konfirmasi | Guru mengira save GAGAL (tidak lihat konfirmasi), mungkin save ULANG — AMAN krn idempotent, TAPI menambah 1 baris `audit_log` + N request Firestore lagi yg sebenarnya tidak perlu | Guru buka ulang & lihat data SUDAH tersimpan, atau save ulang (aman) | Ya |
| E | Guru klik Save 2× (double-click) | **TIDAK ADA proteksi eksplisit di level SERVER** (backend) thd double-submit — kalau UI TIDAK disable tombol saat proses, 2 eksekusi `serverSaveAbsensiKelas` paralel bisa terjadi, masing2 memegang `withScriptLock_` bergantian (SATU habis dulu baru yang lain — lock SERIALIZES akses ke `iaRewriteAbsensiKelas_`) — hasil akhir tetap benar (upsert ke id yg sama = idempotent), TAPI 2× `logAudit` + 2× biaya Firestore write penuh (~1.8-2s ×2 = guru NUNGGU LEBIH LAMA, bukan lebih cepat) | Latency 2× lipat bagi guru itu (bukan korupsi data) | Otomatis (lock menjamin urutan, hasil akhir benar) | Ya (idempotent), TAPI boros biaya |
| F | 2 guru simpan KELAS BERBEDA bersamaan | `withScriptLock_` = **GLOBAL** (`LockService.getScriptLock()`, SATU lock utk SELURUH aplikasi, BUKAN per-kelas/per-kelompok — dikonfirmasi Tahap 2/3) — kedua guru ANTRE pada lock yang SAMA walau kelasnya beda, walau operasi write Firestore mereka SALING INDEPENDEN (path dokumen berbeda total) | TIDAK ADA risiko korupsi data (dokumen path beda), TAPI guru B menunggu LEBIH LAMA dari seharusnya (antre di belakang guru A padahal tidak perlu) | Otomatis (lock antre, maks 10 detik `tryLock`) | Ya |
| G | 2 guru simpan KELAS YANG SAMA bersamaan (jarang, kelas 1 guru biasanya) | Sama seperti F, TAPI di sini lock MEMANG diperlukan (mencegah race condition nyata pada dokumen yang SAMA) — hasil akhir = SIAPA PUN yang dapat lock KEDUA "menang" (menimpa hasil yang PERTAMA, krn keduanya upsert ke id deterministik yang SAMA) | Guru YANG SELESAI DULUAN datanya BISA TERTIMPA oleh guru KEDUA tanpa notifikasi — **potensi lost-update**, TAPI skenario ini SANGAT JARANG (1 kelas biasanya 1 guru pemilik, kolaborasi 2 guru simpan bersamaan di kelas yang sama tidak umum dlm alur kerja TPQ) | TIDAK ADA mekanisme deteksi/resolusi konflik (last-write-wins diam-diam) | N/A (bukan idempotency issue, ini lost-update issue) |
| H | Firestore unavailable (down/quota habis) | `fetchAll` akan mengembalikan response error (bukan exception JS) utk request yang gagal — `resp.getResponseCode()` di luar rentang 200-299 → `throw new Error(...)` → `serverSaveAbsensiKelas` MELEMPAR exception → klien terima error generik (`google.script.run` withFailureHandler) | Guru tidak bisa save SAMA SEKALI selama Firestore down | Guru coba lagi setelah Firestore pulih (TIDAK ADA retry otomatis) | N/A |

**Temuan tambahan** (§8, di luar cakupan sempit tapi relevan utk
keputusan arsitektur): Scenario **G** (2 guru sama-sama pegang akses ke
1 kelas yang sama, simpan bersamaan) adalah **satu-satunya skenario
dengan risiko data-loss nyata** (lost-update, silent) — TIDAK diperbaiki
oleh optimasi cache mana pun (di luar cakupannya), dan TIDAK akan
diperbaiki oleh `:commit` Firestore juga (atomicity `:commit` melindungi
1 REQUEST dari partial-failure, BUKAN dari 2 REQUEST TERPISAH yang
saling menimpa). Ini murni pertanyaan concurrency-control aplikasi
(optimistic locking / conflict detection), di luar cakupan optimasi
performa Tahap 1-8.

---

## 7. Option A — Current Firestore REST Path

| Dimensi | Penilaian |
|---|---|
| Complexity | RENDAH — 1 fungsi (`iaBulkWriteAbsensiFirestore_`), pola sudah dipahami & didokumentasikan baik |
| Reliability | SEDANG — tidak ada retry, tapi errornya EKSPLISIT (klien tahu kalau gagal, bukan silent failure) |
| Maintenance | RENDAH — kode stabil, tidak diubah sejak awal Firestore migration Kelp Petemon |
| Correctness | TINGGI utk kasus normal (idempotent, deterministic id) — MEDIUM utk edge case concurrency (Scenario G, §6) |
| Current performance | ~1.8-2.0 detik floor, TIDAK bisa diperbaiki tanpa perubahan arsitektur (Tahap 3) |
| Scalability | Sudah teruji SAMPAI n=9 (kelas terbesar Kelp Petemon) — TIDAK ADA data utk n lebih besar (kelompok lain blm migrasi Firestore) |
| Operational risk | RENDAH — sudah live & stabil, tidak ada insiden tercatat sejak migrasi Kelp Petemon |
| Suitability until Supabase migration | **TINGGI** — sistem yang SUDAH BEKERJA, BUKAN broken, cuma "lambat" relatif ekspektasi UX |

**Jawaban**: **YA, 1.8-2.0 detik adalah acceptable temporary constraint**
— sistem KORREK, STABIL, dan sudah melalui banyak putaran optimasi
komponen LAIN. Floor latency-nya adalah karakteristik platform (Apps
Script↔Firestore REST), bukan bug. Tidak ada evidence bahwa
mempertahankannya sampai migrasi Supabase akan menyebabkan masalah baru.

---

## 8. Option B — Firestore `:commit`

**Investigasi read-only** (Tahap 3 & tahap ini, TIDAK diimplementasikan):

- **Current request count**: N = jumlah delete + upsert (1-18 tipikal utk n=1-9 santri), dikirim dlm **1 panggilan** `UrlFetchApp.fetchAll` (bukan N panggilan `fetchAll` terpisah — sudah "1 round-trip logis" dari sisi Apps Script).
- **`fetchAll()` sudah paralel?** YA — dibuktikan Tahap 3 (n=1 vs n=9 nyaris identik, §4 dokumen ini).
- **Apakah `:commit` mengurangi HTTP overhead secara berarti?** **TIDAK ADA EVIDENCE** yang mendukung ini — floor latency SUDAH muncul di n=1 (1 request tunggal), yang berarti biaya BUKAN "N request paralel" tapi "1 round-trip inherently lambat". Mengurangi N jadi 1 (via `:commit`) TIDAK mengubah jumlah round-trip LOGIS dari sisi Apps Script (SUDAH 1 sekarang, via fetchAll batch) — HANYA mengubah jumlah request HTTP AKTUAL di level network dari N jadi 1, yang levelnya BERBEDA dari apa yang diukur Tahap 3.
- **Max writes per request**: Firestore `:commit` mendukung maks **500 writes per request** (batasan resmi Firestore, per dokumentasi Google Cloud — **SUMBER EKSTERNAL**, tidak diverifikasi lewat kode project ini, dicatat sbg pengetahuan umum platform bukan hasil pengujian).
- **Payload size**: `:commit` membungkus SEMUA write dlm 1 body JSON (`writes: [...]`) — total byte SAMA/mirip dgn menjumlahkan N payload individual saat ini (~150-250 byte/dokumen), TIDAK ada pengurangan payload berarti, cuma konsolidasi.
- **Transaction/atomicity**: `:commit` BERSIFAT ATOMIK (all-or-nothing) — ini **PERBEDAAN NYATA & BERARTI** dari implementasi sekarang (N request independen, partial-failure MUNGKIN, lihat §6 Scenario B/C). Ini keunggulan CORRECTNESS, BUKAN performa.
- **Error semantics**: `:commit` mengembalikan 1 response utk SELURUH batch — error handling jadi LEBIH SEDERHANA (1 titik cek, bukan iterasi N response) TAPI method deteksi "request MANA yang gagal" berbeda (perlu parsing response `writeResults` per-index, bukan per-HTTP-response).
- **Partial failure behavior**: **DIHILANGKAN SELURUHNYA** oleh atomicity `:commit` — either SEMUA sukses atau SEMUA gagal (rollback implisit) — ini adalah PERBAIKAN correctness dibanding sekarang.
- **Apps Script compatibility**: `:commit` adalah endpoint REST standar (`POST {databasePath}:commit`) — SECARA TEKNIS bisa dipanggil dari `UrlFetchApp.fetch()` biasa (1 request, bukan `fetchAll`) TANPA library tambahan, KOMPATIBEL dgn arsitektur auth (JWT service account) yang SUDAH ada.

**EXPECTED IMPACT = UNKNOWN UNTIL BENCHMARKED** — TIDAK ada evidence
performa yang mendukung `:commit` lebih cepat (§4 justru menunjukkan
floor muncul di n=1 request tunggal, jadi mengonsolidasi N→1 TIDAK
menghilangkan floor itu sendiri). **Manfaat NYATA yang teridentifikasi
adalah ATOMICITY** (menghilangkan Scenario B/C di §6), BUKAN latency.

---

## 9. Option C — Supabase (konseptual, TIDAK migrasi)

| Dimensi | Analisis konseptual |
|---|---|
| Network path | Supabase = PostgREST di atas Postgres — SATU round-trip HTTP per operasi (mirip Firestore REST), TAPI Postgres native mendukung TRANSAKSI multi-statement dlm 1 koneksi (via RPC/stored function), BERBEDA dari Firestore REST yang selalu per-dokumen kecuali `:commit` |
| Latency | **TIDAK DIKETAHUI** tanpa benchmark nyata — TIDAK ADA data project ini tentang latency Apps Script↔Supabase (kalau tetap lewat Apps Script) ATAU browser↔Supabase langsung (kalau attendance write dipindah ke client-side, arsitektur BERBEDA total dari sekarang) |
| Authentication | Supabase pakai JWT (mirip service-account Firestore) ATAU Row Level Security (RLS) dgn user JWT — MODEL BERBEDA dari service-account tunggal Firestore saat ini, perlu desain ulang auth |
| Authorization | Bisa dipindah ke RLS Postgres (declarative, di level database) — POTENSI penyederhanaan `canGuruAccessKelas_`/`iaCekGuruSedangIzin_` jadi row-level policy, TAPI ini PERUBAHAN ARSITEKTUR BESAR (logic RBAC pindah dari Apps Script ke database), bukan tweak kecil |
| RLS | Relevan HANYA jika attendance write dipindah CLIENT-SIDE (browser langsung ke Supabase) — kalau TETAP lewat Apps Script sbg perantara (spt sekarang), RLS kurang relevan (Apps Script pakai service-role key, bypass RLS) |
| Atomicity | Postgres native ACID transaction — SECARA TEORI lebih kuat dari Firestore `:commit` (mendukung logic kompleks dlm 1 transaksi, bukan cuma batch write flat) |
| Offline/retry behavior | TIDAK ADA di kedua arsitektur (Firestore REST maupun Supabase REST) SELAMA masih lewat Apps Script sbg perantara sinkron — utk offline-first perlu arsitektur client-side terpisah (di luar cakupan) |
| Idempotency | BISA dipertahankan (unique constraint di Postgres, mirip deterministic-id Firestore) — TAPI desain skema BARU dibutuhkan (belum ada) |
| Duplicate prevention | Bisa lebih kuat (unique constraint DB-level, bukan cuma convention id deterministik) |
| Delete semantics | Bisa direplikasi (DELETE+UPSERT dlm 1 transaksi Postgres) — BAHKAN atomik native tanpa perlu `:commit`-style workaround |
| Audit trail | Bisa dipindah ke trigger Postgres (audit_log otomatis di level DB) — MENGHILANGKAN kebutuhan `logAudit()` manual di setiap fungsi, TAPI ini REDESIGN, bukan migrasi 1:1 |
| Migration complexity | **TINGGI** — bukan sekadar ganti endpoint, tapi: desain skema Postgres baru, auth model baru (RLS vs service-account), migrasi data historis (Firestore→Postgres), testing ulang SELURUH RBAC, kemungkinan pindah sebagian logic ke database (stored functions/RLS) |

**Kesimpulan §9**: Supabase MENJANJIKAN perbaikan correctness (atomicity
native) dan POTENSI (belum terbukti) perbaikan latency, TAPI effort
migrasi BUKAN "ganti 1 fungsi" — ini REDESIGN arsitektur data. Tidak
bijak dievaluasi lebih dalam TANPA rencana migrasi konkret (di luar
cakupan Tahap 8 yang eksplisit investigation-only).

---

## Skenario Migrasi (§6 prompt)

| Option | Immediate Benefit | Migration Benefit | Risk | Effort |
|---|---|---|---|---|
| **Scenario 1**: Optimasi Firestore sekarang | RENDAH (floor latency, evidence Tahap 3 menunjukkan tidak ada perbaikan mudah tersedia) | NOL — investasi ini TIDAK terbawa ke Supabase (kode Firestore-specific akan dibuang saat migrasi) | RENDAH (perubahan kecil kalau ADA yang dilakukan) TAPI **effort-waste risk TINGGI** (kerja yang akan dibuang) | SEDANG-TINGGI (perlu benchmark `:commit` dulu, hasil UNKNOWN) |
| **Scenario 2**: Tetap Firestore sampai migrasi | NOL (tidak ada perubahan) | NOL (status quo) | **RENDAH — PALING AMAN**, sistem sudah stabil terbukti | NOL |
| **Scenario 3**: Mulai rancang Supabase attendance write, TANPA ubah production | NOL langsung (tidak deploy apa pun) | **TINGGI** — desain yang dibuat SEKARANG langsung terpakai saat migrasi beneran, bisa dilakukan PARALEL tanpa risiko production | RENDAH (murni desain/dokumen, tidak menyentuh production) | SEDANG (kerja desain, tapi tidak buru-buru & tidak under pressure production) |

---

## 10. UX Mitigation (dievaluasi, TIDAK diimplementasikan)

Dengan Save ≈ 3.3-3.9 detik, opsi PERBAIKAN PERSEPSI tanpa mengubah
arsitektur database:

- **Progress state** (mis. "Menyimpan... Memvalidasi akses... Menulis
  data...") — AMAN, tidak mengubah kapan data BENAR-BENAR tersimpan,
  cuma memberi guru informasi progres. Butuh sedikit refactor UI utk
  expose tahap-tahap (saat ini 1 panggilan server monolitik).
- **Disable duplicate click** (tombol Simpan di-disable SEGERA setelah
  diklik, sampai response diterima) — AMAN, MENGURANGI risiko Scenario
  E (§6, double-submit) dari sisi UX (server sudah aman via lock, tapi
  mencegah guru menunggu 2× lipat tanpa sadar).
- **Save feedback yang jelas** (toast/banner sukses SETELAH konfirmasi
  server, BUKAN sebelumnya) — sudah ADA di beberapa bagian app ini
  (pola `showToast_`), bisa diperkuat utk Input Absen spesifik.
- **Background completion** (guru bisa pindah layar SAMBIL nunggu, hasil
  muncul via notifikasi) — LEBIH KOMPLEKS, butuh state management
  tambahan (query status async), TIDAK trivial di arsitektur
  `google.script.run` yang sinkron by design.

**⚠️ EKSPLISIT DIHINDARI**: **optimistic UI/optimistic success** (menampilkan
"Tersimpan!" SEBELUM server konfirmasi) — sesuai instruksi tegas prompt
ini ("jangan menggunakan optimistic success yang dapat membuat guru
mengira data sudah tersimpan jika server belum confirmed"). Ini
BERBAHAYA khususnya mengingat Scenario A/B/C/H (§6) di mana save BISA
gagal parsial/total — guru HARUS tahu status SEBENARNYA, bukan asumsi.

**Tidak ada implementasi pada tahap ini** — murni evaluasi kelayakan.

---

## 11. Performance Target (UX/engineering target, BUKAN yang sudah terbukti dicapai)

Berdasar baseline (`Save ≈ 3.3-3.9 detik`, `Firestore ≈ 1.8-2.0 detik`):

```
Minimum acceptable: < 5 detik total (batas psikologis umum sebelum user
                     menganggap aplikasi "macet"/hang — patokan UX umum,
                     BUKAN diukur khusus di app ini)
Good:                2-3 detik total (Save Total SAAT INI ~3.3s SUDAH
                     mendekati batas bawah kategori ini)
Excellent:           < 1.5 detik total (TIDAK REALISTIS dicapai tanpa
                     mengubah arsitektur Firestore Write — floor
                     1.8-2.0s SENDIRI sudah melebihi target ini)
```

**PENTING**: angka-angka ini adalah **target rekayasa/UX**, BUKAN yang
SUDAH dibuktikan tercapai. "Excellent" SECARA MATEMATIS TIDAK MUNGKIN
dicapai selama Firestore Write floor (1.8-2.0s) masih ada — bukti
langsung bahwa perbaikan lebih lanjut BUTUH perubahan arsitektur
(Supabase), bukan tuning.

---

## 12. Decision Matrix

| Criterion | Keep REST | `:commit` | Supabase Path |
|---|---:|---:|---:|
| Latency potential | LOW (floor terbukti, §4) | LOW-MEDIUM (UNKNOWN UNTIL BENCHMARKED, tapi evidence saat ini tidak mendukung perbaikan besar) | MEDIUM-HIGH (belum terbukti, tapi arsitektur Postgres native berpotensi lebih baik) |
| Implementation effort | NONE (status quo) | MEDIUM (ganti mekanisme request+error-handling, perlu testing correctness ulang) | HIGH (redesign skema+auth+migrasi data) |
| Production risk | LOW (sudah stabil) | MEDIUM (perubahan mekanisme HTTP inti attendance write, permukaan regresi besar) | HIGH (migrasi arsitektur besar, banyak permukaan) |
| Data correctness | MEDIUM (partial-failure mungkin, §6 B/C) | **HIGH** (atomicity native `:commit`, menghilangkan partial-failure) | HIGH (Postgres ACID, berpotensi LEBIH kuat dari `:commit`) |
| Migration alignment | HIGH (tidak menambah utang teknis Firestore-specific baru) | **LOW** (investasi kode Firestore-specific yang akan DIBUANG saat migrasi Supabase) | **HIGH** (langsung align dgn arah migrasi) |
| Maintenance | LOW (kode stabil, dipahami baik) | MEDIUM (mekanisme baru, perlu dokumentasi+pemahaman tim ulang) | MEDIUM (tergantung desain akhir) |
| Scalability | MEDIUM (belum teruji >9 santri, tapi tidak ada evidence masalah) | MEDIUM-HIGH (500 writes/`:commit`, headroom lebih besar utk kelas besar) | UNKNOWN (belum ada data) |
| Reversibility | N/A (tidak ada perubahan) | MEDIUM (bisa di-revert, tapi effort testing utk revert juga ada) | LOW (migrasi data sulit di-reverse) |

---

## 13. What NOT to Change Now

- Mekanisme HTTP write Firestore (`iaBulkWriteAbsensiFirestore_`) — TIDAK
  diubah ke `:commit` tanpa benchmark nyata & keputusan eksplisit
  terpisah (alasan: Migration alignment LOW, evidence performa TIDAK
  mendukung, §8/§12).
- `withScriptLock_` global — TIDAK diubah menjadi lock granular (API
  Apps Script tidak mendukung, ERROR_LOG.md, sudah didokumentasikan
  sebagai batasan permanen platform).
- Skema/struktur data Firestore `absensi` — TIDAK diubah, sudah dipakai
  seluruh fitur terkait (Laporan, Dashboard, Kehadiran Generus, dst).
- UI Input Absen — TIDAK diubah (progress state/disable-button dievaluasi
  §10 TAPI TIDAK diimplementasikan tahap ini).

---

## 14. Migration Implications

Kalau/ketika migrasi Supabase benar-benar dimulai:
- Attendance write path (`iaBulkWriteAbsensiFirestore_` dan sekitarnya)
  akan PERLU DITULIS ULANG TOTAL (bukan diadaptasi sebagian) — endpoint,
  auth, payload format SEMUA berbeda.
- 3 optimasi cache yang SUDAH diterapkan (Tahap 5/6/7:
  `audit_log`/`akses_kelas_request`/`guru_izin`) **TETAP RELEVAN &
  TERBAWA** ke arsitektur Supabase — pola "cache-first + scoped read +
  invalidate-on-write" adalah pola APLIKASI (Apps Script-side), BUKAN
  Firestore-specific, jadi investasi itu TIDAK sia-sia.
- `logAudit()`/`generateId()` (dgn UUID utk `audit_log`) BISA
  dipertahankan APA ADANYA kalau Supabase attendance write TETAP lewat
  Apps Script sbg perantara (arsitektur "Scenario 3" §6) — HANYA perlu
  diubah kalau audit trail dipindah ke trigger Postgres (redesign, di
  luar cakupan tahap ini).
- Correctness contract (§5) — kontrak PERILAKU (delete-set logic,
  idempotency, resave behavior) HARUS DIPERTAHANKAN IDENTIK di Supabase,
  TERLEPAS dari mekanisme write-nya — ini requirement desain utk
  migrasi kapan pun terjadi, dicatat di sini sbg REFERENSI utk tahap
  migrasi nanti.

---

## 15. Open Questions

- Apakah migrasi Supabase akan memindahkan attendance write ke
  CLIENT-SIDE langsung (browser→Supabase, tanpa Apps Script sbg
  perantara sinkron) atau TETAP lewat Apps Script? Ini MENENTUKAN
  apakah RLS relevan (§9) dan apakah floor latency `UrlFetchApp` bahkan
  masih relevan (browser→Supabase punya karakteristik network berbeda
  total dari Apps Script→Firestore).
- Kapan timeline migrasi Supabase yang REALISTIS? (Menentukan apakah
  Scenario 3 §6, "mulai desain sekarang", sepadan waktu-nya vs
  menunggu.)
- Apakah kelompok LAIN (17/18 yang belum migrasi Firestore, masih
  Sheets) akan migrasi Firestore DULU sebelum Supabase, atau LANGSUNG
  Sheets→Supabase (skip Firestore)? Ini mempengaruhi apakah optimasi
  Firestore lebih lanjut (mis. `:commit`) punya nilai jangka-menengah
  utk kelompok lain, atau benar-benar hanya utk Kelp Petemon yang akan
  segera diganti lagi.
- Apakah Scenario G (§6, lost-update 2 guru simpan kelas sama
  bersamaan) CUKUP jarang/rendah-dampak utk diabaikan, atau perlu
  mitigasi terpisah (di LUAR cakupan performa, ini correctness/UX
  concurrency issue) sebelum ATAU independen dari keputusan arsitektur
  write?

---

## FINAL RECOMMENDATION

```
RECOMMENDATION:
WAIT FOR SUPABASE
```

### Why
Firestore Write latency (~1.8-2.0 detik) adalah **floor platform**,
dibuktikan evidence kuat (n=1≈n=9, Tahap 3) — BUKAN inefisiensi kode
yang bisa diperbaiki dgn perubahan kecil. Satu-satunya kandidat teknis
(`:commit`) TIDAK didukung evidence performa (floor SUDAH muncul di 1
request tunggal), hanya menawarkan manfaat ATOMICITY (correctness),
BUKAN latency — dan manfaat itu pun BELUM DIUKUR, hanya dianalisis
konseptual. Sementara itu, migrasi Supabase SUDAH direncanakan —
menginvestasikan waktu ke `:commit` Firestore SEKARANG berarti menulis
kode yang KEMUNGKINAN BESAR akan dibuang total saat migrasi (Migration
alignment = LOW, §12).

### Evidence
- Tahap 3: n=1 (1794ms) ≈ n=9 (1836ms), selisih 42ms << variansi
  run-to-run (237-307ms) — floor CONFIRMED.
- Tahap 5/6/7: 3 optimasi cache SUKSES BESAR pada komponen masing-masing
  (49-92% improvement), TAPI Save Total TIDAK banyak bergerak (bahkan
  sempat NAIK sedikit di 1 pengukuran, Tahap 7 §15) — krn Firestore
  Write (tidak tersentuh) TETAP mendominasi ~59% dari total SEKARANG
  (naik dari ~50% sebelum optimasi lain, krn komponen lain mengecil).
- Tidak ada evidence performa yang mendukung `:commit` lebih cepat
  (§8) — hanya evidence korrektness (atomicity) yang NYATA.

### Risk
`:commit` (kalau tetap diimplementasikan): risiko REGRESI pada mekanisme
write inti (Production risk MEDIUM, §12) + waktu investasi yang
KEMUNGKINAN BESAR terbuang (Migration alignment LOW) — risiko lebih besar
dari manfaat yang BELUM TERBUKTI. `Keep REST` (rekomendasi): risiko
RENDAH (status quo, sistem stabil), TAPI guru tetap menunggu ~3.3-3.9
detik sampai migrasi terjadi.

### Expected Benefit
`Keep REST` + `WAIT FOR SUPABASE`: NOL benefit performa langsung, TAPI
menghindari kerja sia-sia + mempertahankan stabilitas produksi yang
sudah terbukti. Manfaat SEBENARNYA datang dari migrasi Supabase (belum
terjadi, di luar cakupan tahap ini).

### Next Action
1. **Rekomendasi sekunder** (boleh dilakukan TANPA menyentuh database):
   evaluasi UX mitigation (§10 — progress state, disable-duplicate-click,
   save feedback yang jelas) sbg tahap TERPISAH, kalau user/product
   owner memutuskan perceived-latency perlu diperbaiki SEBELUM migrasi
   Supabase datang. Ini TIDAK diimplementasikan di Tahap 8 (investigation-only),
   tapi merupakan kandidat MASUK AKAL utk tahap berikutnya kalau
   diminta.
2. **Kalau** migrasi Supabase punya timeline konkret & DEKAT: pertimbangkan
   Scenario 3 (§6) — mulai desain attendance write path Supabase
   SEKARANG (dokumen/skema saja, TANPA sentuh production) supaya siap
   dipakai begitu migrasi dimulai.
3. **JANGAN** investasikan waktu lebih lanjut ke optimasi Firestore
   Write (`:commit` atau lainnya) kecuali muncul evidence BARU yang
   mengubah kesimpulan §4 (mis. benchmark independen yang menunjukkan
   `:commit` benar-benar lebih cepat, bukan cuma dianalisis konseptual).

---

## FINAL OUTPUT

```
TAHAP 8 — ATTENDANCE WRITE ARCHITECTURE

Code Changed:
NO

Firestore Changed:
NO

Supabase Changed:
NO

Current Save:
≈ 3.3-3.9 sec

Firestore Write:
≈ 1.8-2.0 sec

Latency Floor:
CONFIRMED (n=1 ≈ n=9, Tahap 3, selisih 42ms << variansi run-to-run 237-307ms)

Option A (Keep REST):
Suitable sbg constraint sementara -- stabil, correct, floor platform bukan bug kode

Option B (:commit):
Manfaat CORRECTNESS (atomicity) terbukti konseptual, manfaat PERFORMA
UNKNOWN UNTIL BENCHMARKED -- evidence saat ini TIDAK mendukung perbaikan
latency berarti

Option C (Supabase):
Berpotensi manfaat lebih besar (Postgres ACID native, RLS, migration
alignment tinggi) TAPI effort migrasi TINGGI, latency belum terbukti,
di luar cakupan implementasi tahap ini

Recommended:
WAIT FOR SUPABASE

Reason:
Firestore Write floor adalah karakteristik platform (evidence kuat),
bukan inefisiensi kode; optimasi lanjutan (:commit) tidak didukung
evidence performa dan investasinya kemungkinan besar terbuang saat
migrasi Supabase yang sudah direncanakan

Immediate Action:
TIDAK ADA perubahan database/arsitektur. Pertimbangkan UX mitigation
(progress state, disable-duplicate-click) sbg tahap terpisah kalau
perceived-latency perlu diperbaiki sebelum migrasi terjadi.

Migration Implication:
3 optimasi cache (audit_log/akses_kelas_request/guru_izin) TETAP
relevan & terbawa ke Supabase (pola aplikasi, bukan Firestore-specific).
Attendance write path HARUS ditulis ulang total saat migrasi -- di luar
cakupan tahap ini.

Production:
UNCHANGED
```
