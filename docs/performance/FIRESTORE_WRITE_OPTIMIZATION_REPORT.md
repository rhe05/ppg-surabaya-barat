# Laporan Optimasi — Firestore Write Kehadiran (Tahap 3)

> Hasil: **tidak ada optimasi diimplementasikan** — investigasi berbasis
> evidence menyimpulkan tidak ada perubahan kode yang aman DAN terbukti
> akan meningkatkan performa dalam batasan yang diizinkan (lihat
> `FIRESTORE_WRITE_OPTIMIZATION_PROPOSAL.md` untuk analisis lengkap).
> Tanggal: 2026-08-08.

---

## 1. Baseline

```
Save Total      = 3892 ms median  (Guru Normal Path, n=9 santri)
Firestore Write = 1950 ms median  (n=9 santri; data pendukung n=1: 1794ms, n=5: 1938ms — baseline admin, fungsi write SAMA)
audit_log       = 572 ms median
akses_kelas_request = 455 ms median
guru_izin       = 227 ms median
Lock            = 115 ms median
```

Sumber: `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md`.

## 2. Root Cause

Floor latency 1 round-trip `UrlFetchApp.fetchAll` → Firestore REST API
(±1.7-2.0 detik) yang **tidak berkorelasi dengan jumlah dokumen** pada
rentang 1-9 santri (bukti: n=1 median 1794ms ≈ n=9 median 1836ms, selisih
42ms — jauh di bawah variansi run-to-run ~175ms dalam ukuran yang sama).
Ini karakteristik platform (Apps Script↔Firestore REST round-trip),
BUKAN inefisiensi kode. Detail lengkap + bukti per-item checklist ada di
`FIRESTORE_WRITE_OPTIMIZATION_PROPOSAL.md` §Identifikasi Sumber Latency.

## 3. Current Implementation

`iaBulkWriteAbsensiFirestore_` (Modul_InputAbsen.gs:517) SUDAH mengikuti
seluruh best practice yang berlaku di project ini:
- Document ID deterministik (`absensiDocId_` = `tanggal_santriId`) — TANPA
  baca/query apa pun sebelum menulis.
- Semua delete + upsert dikirim dalam **1** `UrlFetchApp.fetchAll` (paralel
  sungguhan, dibuktikan lewat data n=1 vs n=9 di atas).
- Auth token Firestore di-cache 55 menit, diambil 1× per pemanggilan
  (bukan per-dokumen).
- Tidak ada retry tersembunyi, tidak ada parsing response yang tidak
  perlu di jalur sukses.
- Delete-set dihitung tepat (hanya santri yang benar-benar hilang dari
  submission klien, bukan delete-semua-lalu-tulis-ulang).

## 4. Optimization Applied

**TIDAK ADA.** Satu kandidat dipertimbangkan (konsolidasi N request
individual menjadi 1 panggilan Firestore REST `:commit`/batch-write) tapi
DITOLAK karena:
1. Tidak didukung evidence performa (floor latency sudah muncul di n=1,
   bukan efek N request paralel).
2. Merupakan perubahan arsitektur besar (mekanisme REST baru, semantik
   atomicity berbeda, error-handling berbeda) — masuk kategori PAUSE
   sesuai instruksi eksplisit tahap ini.

Lihat `FIRESTORE_WRITE_OPTIMIZATION_PROPOSAL.md` §Proposed Change untuk
analisis lengkap penolakan ini.

## 5. Files Changed

**TIDAK ADA.** Tidak ada file kode (`.gs`/`.html`) yang diubah pada tahap
ini. Hanya 2 dokumen baru ditulis:
- `docs/performance/FIRESTORE_WRITE_OPTIMIZATION_PROPOSAL.md`
- `docs/performance/FIRESTORE_WRITE_OPTIMIZATION_REPORT.md` (dokumen ini)

## 6. Correctness Verification

Tidak berlaku — tidak ada perubahan kode, jadi tidak ada risiko regresi
correctness. Analisis Case A-E (delete semantics) di
`FIRESTORE_WRITE_OPTIMIZATION_PROPOSAL.md` mengonfirmasi bahwa mekanisme
delete-then-upsert yang SUDAH ADA tetap diperlukan (Case C: santri
dikeluarkan dari form) dan tidak boleh diubah jadi upsert-only.

## 7. Before/After Measurement

```
BEFORE (baseline, tidak berubah karena tidak ada implementasi)
Firestore Write = 1950 ms median
Save Total      = 3892 ms median

AFTER
Firestore Write = TIDAK DIUKUR ULANG (tidak ada perubahan kode utk diukur)
Save Total      = TIDAK DIUKUR ULANG
```

Tidak dilakukan pengukuran before/after baru — tidak ada kode yang
berubah untuk diukur. Mengukur ulang tanpa perubahan kode hanya akan
menghasilkan sampel baru dari distribusi yang SAMA (sudah cukup terwakili
oleh baseline yang ada, termasuk data n=1/5/9 dari pass sebelumnya).

## 8. Firestore Write Improvement

```
Improvement = 0% (tidak ada perubahan diterapkan)
```

## 9. Save Attendance Improvement

```
Improvement = 0% (tidak ada perubahan diterapkan)
```

## 10. Regression Check

Tidak berlaku — tidak ada kode yang diubah, sehingga tidak ada permukaan
untuk regresi. Guru Save, Firestore path, Sheets path, dan admin path
semuanya identik dengan sebelum Tahap 3 (dapat diverifikasi: tidak ada
commit kode dibuat pada tahap ini, lihat §12 Deployment Status).

## 11. Data Safety

Tidak ada data test baru dibuat pada tahap ini — investigasi murni
pembacaan kode (Modul_InputAbsen.gs, Modul_Utilities.gs,
Modul_FirestoreBridge.gs, ERROR_LOG.md, FILE_MAP.md) dan analisis ulang
data pengukuran yang SUDAH ADA dari `ATTENDANCE_REAL_PERFORMANCE_MEASUREMENT.md`
(Tahap 2, datanya sudah dibersihkan sebelumnya — lihat laporan cleanup
sesi sebelumnya). Tidak ada akun QA, akses test, atau data absensi test
baru yang perlu dibersihkan dari tahap ini.

## 12. Deployment Status

```
DEPLOYED: NO (tidak ada yang perlu di-deploy — tidak ada perubahan kode)
```

## 13. Rollback Plan

Tidak berlaku — tidak ada perubahan produksi untuk di-rollback.

## 14. Remaining Bottlenecks

Urutan berdasarkan bukti kuantitatif dari kedua laporan pengukuran
sebelumnya (statis + real):

1. **Firestore write floor latency (~1.8-2.0 detik/round-trip)** —
   TERBUKTI platform-level, bukan bug aplikasi. Tidak ada mitigasi aman
   yang ditemukan pada skala data saat ini (≤9 santri/kelas). Kandidat
   `:commit` batch-write TETAP terbuka untuk eksplorasi terpisah (fokus
   atomicity, bukan performa) — PAUSE, butuh approval eksplisit.
2. **`audit_log` scan+append (572ms median, ~15% dari Save Total)** —
   DILARANG disentuh eksplisit pada Tahap 3 ini ("Jangan mengubah
   audit_log"), tapi tetap kontributor nyata (tabel 429 baris, tumbuh
   lintas-fitur) — kandidat kuat utk tahap optimasi TERPISAH di masa
   depan.
3. **`akses_kelas_request` (455ms di dalam transaksi Save) & `guru_izin`
   (227ms)** — DILARANG disentuh eksplisit pada Tahap 3 ini juga, tapi
   sama-sama full-table-scan tanpa cache (temuan audit statis §11/§13) —
   kandidat tahap optimasi terpisah lainnya.
4. **Dashboard init (5 panggilan konkuren, belum ada bukti waktu nyata
   sampai-terlihat-di-browser)** — di luar cakupan Tahap 3, butuh
   instrumentasi browser asli (belum tersedia di environment ini) sebelum
   ada keputusan optimasi.

---

## FINAL RESPONSE

```
FIRESTORE WRITE OPTIMIZATION

Baseline:
Save Total      = 3892 ms
Firestore Write = 1950 ms

Root Cause:
Floor latency 1 round-trip UrlFetchApp.fetchAll -> Firestore REST API
(~1.8-2.0s), TIDAK berkorelasi dengan jumlah dokumen pada rentang n=1-9
(bukti: n=1 median 1794ms ~= n=9 median 1836ms). Kode write SUDAH
mengikuti seluruh best practice project ini (id deterministik, upsert
tanpa baca, 1 fetchAll paralel, tanpa retry/parsing berlebih). Delete
semantics TERBUKTI masih diperlukan (Case C), tidak aman diubah upsert-only.

Optimization:
TIDAK ADA — tidak ditemukan perubahan kode yang aman DAN didukung evidence
performa dalam batasan yang diizinkan. Satu kandidat (:commit batch-write)
dipertimbangkan & ditolak (evidence tidak mendukung + perubahan arsitektur
besar, lihat proposal).

Code Changed:
NO

Firestore Schema Changed:
NO

Correctness:
N/A (tidak ada perubahan diterapkan)

Before:
Firestore = 1950 ms
Save      = 3892 ms

After:
Firestore = TIDAK DIUKUR ULANG (tidak ada perubahan kode)
Save      = TIDAK DIUKUR ULANG

Improvement:
Firestore = 0%
Save      = 0%

Production:
NOT DEPLOYED (tidak ada yang perlu di-deploy)

Remaining Bottlenecks:
1. Firestore write floor latency (~1.8-2.0s/round-trip) -- platform-level, PAUSE utk eksplorasi :commit (butuh approval terpisah)
2. audit_log scan+append (572ms, ~15% Save Total) -- di luar scope Tahap 3, kandidat tahap terpisah
3. akses_kelas_request (455ms) + guru_izin (227ms) di dalam transaksi Save -- di luar scope Tahap 3, kandidat tahap terpisah

Rollback:
Tidak berlaku -- tidak ada kode yang diubah/di-deploy pada Tahap 3 ini.
```
