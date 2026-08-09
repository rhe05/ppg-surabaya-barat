# Save Attendance UX Optimization Report (Tahap 9)

> Scope: **UX & request-safety Save Kehadiran, BUKAN performa database**.
> Server (`serverSaveAbsensiKelas`), Firestore, `audit_log`,
> `akses_kelas_request`, `guru_izin`, dan `withScriptLock_` **TIDAK
> disentuh sama sekali**. Deployed & diverifikasi via code review +
> `verify_served.js` (tidak ada akses klik-UI production, konsisten dgn
> keterbatasan environment yang sudah dicatat tahap-tahap sebelumnya).
> Tanggal: 2026-08-08.

---

## 1. Executive Summary

Save Attendance TERNYATA **sudah punya fondasi UX yang cukup solid**
sebelum tahap ini: tombol langsung `disabled` + relabel "Menyimpan...",
spinner overlay global, pesan sukses/gagal terpisah, TIDAK PERNAH
menampilkan sukses sebelum callback server, dan TIDAK menghapus data
santri saat gagal. Yang **BELUM ADA**: guard duplicate-submit yang
EKSPLISIT (independen dari `btn.disabled`), penanda `aria-busy` utk
screen reader, dan `role="status"`/`aria-live` pada overlay loading.

**3 perubahan kecil, murni klien** diterapkan: (1) flag
`window.iaState_.saving` sbg lapis pertahanan kedua thd duplicate-submit,
(2) `aria-busy` pada tombol + `role="status"`/`aria-live="polite"` pada
overlay loading global (dipakai bersama semua fitur loading di app,
tidak cuma Save), (3) pesan loading diperjelas. **Tidak ada perubahan
server, tidak ada fake progress, tidak ada optimistic success.**

---

## 2. Current Save UX

Ditelusuri dari kode aktual (`Script_Main.html`,
`window.saveInputAbsen_`, `Markup_Screens.html:465`):

```
Klik tombol #iaSaveBtn (onclick="window.saveInputAbsen_()")
  ↓
window.saveInputAbsen_ (Script_Main.html:2534)
  ↓ [BARU, Tahap 9] guard: if (window.iaState_.saving) return;
  ↓ validasi klien: sudahTersimpan? / iaCekWaktuAbsen_ (waktu sesi)
  ↓ btn.disabled=true, btn.textContent='Menyimpan...', showGlobalLoading_(...)
  ↓ google.script.run.withSuccessHandler(onSaveResult).withFailureHandler(onSaveFailure)
  ↓     .serverSaveAbsensiKelas(...) / serverSaveAbsensiKelasAdmin(...)
  ↓
onSaveResult(result) — result.success TRUE/FALSE dgn `code` (sudah-tersimpan/future/belum-waktu/guru-izin/lainnya)
  ATAU
onSaveFailure() — kegagalan transport (network/exception tak tertangani)
  ↓
endSaving_() [BARU, Tahap 9] — reset guard + UI, DIPANGGIL DI SEMUA JALUR
```

**Identifikasi (§2 prompt)**:
- Nama fungsi: `window.saveInputAbsen_` (Script_Main.html:2534)
- Button ID: `iaSaveBtn` (Markup_Screens.html:465)
- Loading state existing: YA — `btn.disabled`/`btn.textContent` + global
  overlay (`showGlobalLoading_`/`hideGlobalLoading_`, Script_Main.html:17-24)
- Spinner existing: YA — `#globalLoadingOverlay` + `.global-loading-ring`
  (dipakai SELURUH app utk semua loading state, bukan cuma Save)
- Toast existing: YA — `iaShowToast_` (dipakai error non-modal)
- Modal existing: YA — `window.iaShowStatusModal_` (success/warning,
  dgn quote random utk sukses)
- Success state: `onSaveResult`, cabang `result.success === true`
- Error state: beberapa cabang (`sudah-tersimpan`/`future`/`belum-waktu`/
  `guru-izin`/generic) + `onSaveFailure` (transport error)
- Callback: `withSuccessHandler`/`withFailureHandler` (pola
  `google.script.run` standar app ini)
- Duplicate-click protection SEBELUM Tahap 9: HANYA `btn.disabled=true`
  (efektif utk klik NORMAL via mouse/touch pada elemen `<button>`,
  TAPI tidak ada guard STATE eksplisit independen dari DOM)

---

## 3. UX Problems Found

Jawaban 10 pertanyaan (§3 prompt), berdasar kode SEBELUM Tahap 9:

1. **Apa yang langsung berubah saat klik?** `btn.disabled=true`,
   `btn.textContent='Menyimpan...'`, overlay spinner muncul — SEMUA
   SUDAH ADA sebelumnya.
2. **Button langsung disabled?** YA, SUDAH.
3. **Spinner muncul?** YA, SUDAH (`showGlobalLoading_`).
4. **Ada teks "Menyimpan..."?** YA pada button; overlay teks SEBELUMNYA
   "Menyimpan absen..." (Tahap 9: diperjelas jadi "Menyimpan
   kehadiran... Mohon tunggu sebentar.").
5. **User masih bisa klik button?** SECARA DOM, TIDAK (disabled
   mencegah event klik browser) — TAPI TIDAK ADA guard state eksplisit
   sbg lapis kedua sebelum Tahap 9 (**GAP** — ditutup Tahap 9).
6. **UI terlihat freeze?** YA, SENGAJA — overlay full-screen
   (`#globalLoadingOverlay`) menutupi seluruh layar selama proses,
   konsisten dgn pola loading app ini di SEMUA fitur lain (bukan
   spesifik Save, bukan regresi baru).
7. **Success message muncul sebelum server response?** TIDAK — modal
   sukses HANYA dipanggil di dalam `onSaveResult` (setelah callback).
   **SUDAH BENAR sejak awal, tidak diubah.**
8. **Apa yang terjadi jika server error?** `onSaveFailure`: overlay
   hilang, button aktif lagi, label kembali "Simpan Kehadiran", toast
   error muncul, `window.iaState_.list` (status santri yang sudah
   dipilih guru) **TIDAK DIHAPUS** — guru bisa langsung retry tanpa
   mengisi ulang. **SUDAH BENAR sejak awal.**
9. **Apa yang terjadi jika user klik 2×?** SEBELUM Tahap 9: klik kedua
   SECARA TEORI ditolak DOM (button sudah disabled), TAPI TIDAK ADA
   bukti/test eksplisit yang memverifikasi ini, dan TIDAK ADA lapis
   pertahanan independen (**GAP** — ditutup Tahap 9 dgn
   `window.iaState_.saving`).
10. **Apa yang terjadi jika user meninggalkan halaman?** TIDAK ADA
    penanganan khusus — Apps Script execution TETAP JALAN di server
    (dikonfirmasi Tahap 8), respons hilang begitu saja kalau DOM/tab
    sudah tidak ada. **TIDAK DIUBAH tahap ini** (lihat §9 Navigation).

---

## 4. Changes Applied

**File**: `Script_Main.html` (`window.saveInputAbsen_`),
`Markup_Screens.html` (`#globalLoadingOverlay`).

| # | Perubahan | Alasan |
|---|---|---|
| 1 | `if (window.iaState_.saving) return;` di awal fungsi | Guard eksplisit, independen dari `btn.disabled` (§5) |
| 2 | `window.iaState_.saving = true` sebelum `google.script.run` | Set guard SEBELUM request dikirim |
| 3 | `endSaving_()` helper (reset `saving`, hide overlay, re-enable button, hapus `aria-busy`) dipanggil di **SEMUA** jalur keluar (`onSaveResult` — SEMUA cabang, `onSaveFailure`) | Jamin guard TIDAK PERNAH tersangkut permanen (§5, §10) |
| 4 | `btn.setAttribute('aria-busy', 'true')` saat mulai, `removeAttribute` saat selesai | Aksesibilitas (§13) |
| 5 | `role="status" aria-live="polite"` pada `#globalLoadingOverlay` | Screen reader mengumumkan teks loading — berlaku utk SEMUA fitur yang pakai overlay ini, bukan cuma Save (efek samping positif, elemen yang SAMA) |
| 6 | Teks overlay: `"Menyimpan absen..."` → `"Menyimpan kehadiran... Mohon tunggu sebentar."` | Pesan lebih jelas (§8), TETAP indeterminate, BUKAN fake progress |

**TIDAK diubah**: `serverSaveAbsensiKelas`, `serverSaveAbsensiKelasAdmin`,
payload `absensiList`, urutan validasi (`sudahTersimpan`/`iaCekWaktuAbsen_`),
modal sukses/gagal (isi & kondisi pemicu SAMA persis), navigasi
(switch kelas/menu/back — LEAVE EXISTING BEHAVIOR, §9).

---

## 5. Duplicate Submit Protection

**Sebelum**: hanya `btn.disabled` (DOM-level). **Sesudah**: `window.iaState_.saving`
(state-level, independen dari DOM) SEBAGAI LAPIS PERTAMA (dicek di baris
PALING AWAL fungsi, sebelum validasi/DOM apa pun disentuh) + `btn.disabled`
tetap ada sbg lapis kedua (defense-in-depth, bukan pengganti).

```js
if (window.iaState_.saving) return;
...
window.iaState_.saving = true;
...
const endSaving_ = function () { window.iaState_.saving = false; ...};
// dipanggil di onSaveResult (SEMUA cabang) DAN onSaveFailure
```

**Guard TIDAK PERNAH terkunci permanen**: diverifikasi via code review —
`endSaving_()` dipanggil sbg BARIS PERTAMA di `onSaveResult` (sebelum
cabang if/else manapun) dan di `onSaveFailure` — TIDAK ADA jalur keluar
dari `google.script.run` yang tidak melewati salah satu dari kedua
callback ini (kontrak `withSuccessHandler`/`withFailureHandler` Apps
Script menjamin TEPAT SATU dari keduanya selalu dipanggil).

---

## 6. Loading State

Existing design system dipakai APA ADANYA (prioritas §7 prompt
dipatuhi — TIDAK membuat komponen baru):
- Overlay spinner global (`#globalLoadingOverlay`, `.global-loading-ring`)
  — SUDAH ADA, dipakai ulang (bukan reinvent).
- Label tombol `"Menyimpan..."` — SUDAH ADA, dipertahankan.
- Indeterminate — TIDAK ADA fake percentage, TIDAK ditambahkan (sesuai
  larangan eksplisit §7/§FINAL RULE).

---

## 7. Success State

**TIDAK BERUBAH** dari behavior asli — success modal
(`window.iaShowStatusModal_('success', 'Alhamdulillah, Absen Berhasil
Disimpan', result.message, ...)`) HANYA dipanggil di dalam `onSaveResult`
cabang `result.success === true`, SETELAH `google.script.run` callback
diterima. **Tidak ada optimistic success ditambahkan atau dihapus** —
kondisi pemicu 100% identik dgn sebelum Tahap 9.

---

## 8. Error State

**TIDAK BERUBAH** secara substansi (semua cabang error/kode existing
dipertahankan APA ADANYA — `sudah-tersimpan`/`future`/`belum-waktu`/
`guru-izin`/generic/`onSaveFailure`) — HANYA dibungkus lewat `endSaving_()`
supaya reset state konsisten di semua cabang (sebelumnya reset
`hideGlobalLoading_()`+`btn.disabled=false` diulang manual di 2 tempat
terpisah, sekarang 1 helper — refactor MURNI internal, behavior output
IDENTIK). Data santri (`window.iaState_.list`) **TIDAK PERNAH dihapus**
pada jalur mana pun — dikonfirmasi tidak ada `iaState_.list = ...` di
`saveInputAbsen_` sama sekali.

---

## 9. Navigation Behavior

**Ditelusuri, TIDAK DIUBAH** (`LEAVE EXISTING BEHAVIOR`, sesuai §11
prompt): tidak ada mekanisme yang mencegah guru berpindah kelas/menu
saat `saving=true`. Analisis kenapa TIDAK diubah:
- Variabel `kelas`/`tanggal`/`absensiList` yang dikirim ke server SUDAH
  DI-CAPTURE sbg `const` LOKAL SEBELUM `google.script.run` dipanggil —
  request itu sendiri TIDAK terpengaruh kalau guru pindah kelas/menu
  SETELAH klik Simpan (request tetap membawa data kelas/tanggal yang
  benar, bukan yang baru).
- YANG BERPOTENSI membingungkan: kalau guru sempat pindah ke kelas LAIN
  SEBELUM response tiba, `onSaveResult` (yang capture `btn`, `isAdmin`
  via closure) tetap akan memodifikasi tombol & (kalau sukses) memanggil
  `iaSetTanggal_(iaToday_()); iaOnTanggalChange_();` — INI BISA
  mereset tampilan kelas yang SEDANG dilihat guru scr tidak terduga.
- **Ini adalah PERILAKU YANG SUDAH ADA SEBELUM Tahap 9** (tidak
  diperkenalkan tahap ini) — memperbaikinya (mis. blokir navigasi
  selama saving, ATAU membatalkan efek callback kalau konteks sudah
  berubah) memerlukan investigasi LEBIH LUAS (menu hamburger, tombol
  switch-kelas, tombol back — SEMUA entry point navigasi) yang MELEBIHI
  cakupan "Save button UX" sempit tahap ini, dan berisiko regresi baru
  di alur LAIN yang TIDAK diminta diuji tahap ini.
- **Keputusan**: `LEAVE EXISTING BEHAVIOR` — dicatat sbg observasi utk
  tahap terpisah kalau diminta, TIDAK diimplementasikan sekarang.

---

## 10. Accessibility

| Item | Status |
|---|---|
| Disabled state jelas | `btn.disabled` (native, SUDAH ADA) + `opacity:0.6` CSS (`.ia-save-btn:disabled`, SUDAH ADA) — TIDAK diubah |
| Loading state dpt dipahami (non-visual) | **BARU**: `aria-busy="true"` pada tombol + `role="status" aria-live="polite"` pada overlay — screen reader SEKARANG mengumumkan teks loading |
| Teks tidak bergantung warna saja | Label tombol berbasis TEKS (`"Menyimpan..."`/`"Simpan Kehadiran"`), bukan warna semata — SUDAH BENAR, tidak diubah |
| Touch target cukup | Tombol `width:100%, padding:15px` (`.ia-save-btn`, Style_Main.html) — TIDAK diubah, sudah besar |
| Focus behavior | TIDAK disentuh — tidak ada perubahan tab-order/focus-trap |
| Screen reader semantics | Diperkuat (aria-busy + role=status), TIDAK ADA perubahan struktur DOM besar |

---

## 11. Mobile Behavior

- **Button tidak bergeser saat spinner muncul**: `.ia-save-btn { width:
  100% }` — lebar TETAP, HANYA `textContent` berubah (`"Simpan
  Kehadiran"` ↔ `"Menyimpan..."`), TIDAK ADA elemen baru disisipkan DI
  DALAM tombol yang bisa mengubah tinggi/posisi — **TIDAK ADA layout
  jump**, diverifikasi via code review CSS (`padding:15px` tetap,
  tidak ada perubahan height berdasar teks).
- **Overlay loading**: `#globalLoadingOverlay` SUDAH full-screen fixed
  (dipakai loading screen boot app juga) — visible di semua ukuran
  layar, TIDAK diubah tahap ini.
- **Status message tidak menutup input penting**: overlay MEMANG
  menutup SELURUH layar saat Save berlangsung (by design, existing
  behavior) — input santri SUDAH di-capture sbg `absensiList` SEBELUM
  overlay muncul, jadi tidak ada risiko kehilangan input yang belum
  terkirim.
- **Tidak ada scroll ke posisi aneh**: TIDAK ADA perubahan scroll
  behavior ditambahkan tahap ini.

⚠️ **Catatan**: SEMUA analisis §11 di atas berbasis CODE REVIEW (CSS +
struktur DOM), **BUKAN klik-test manual di perangkat mobile sungguhan**
— environment sesi ini tidak punya kredensial login utk verifikasi
visual langsung (konsisten dgn keterbatasan yang sudah dicatat di
tahap-tahap performa sebelumnya).

---

## 12. Test Matrix

⚠️ **Semua test di bawah adalah CODE-LEVEL REASONING (trace logic),
BUKAN eksekusi klik manual di browser sungguhan** — TIDAK ADA kredensial
login tersedia di environment ini utk uji interaktif langsung. Ditandai
jelas per test.

| Test | Expected | Verifikasi | Status |
|---|---|---|---|
| A — Normal save | READY → SAVING → SUCCESS | Code trace: `saving=true` → `google.script.run` → `onSaveResult(success)` → `endSaving_()` + modal sukses | **REASONED PASS** (logic trace, bukan klik manual) |
| B — Double click | ONE server request | Code trace: klik ke-2 masuk `saveInputAbsen_`, baris PERTAMA `if (window.iaState_.saving) return;` — `saving` sudah `true` dari klik pertama (di-set SEBELUM `google.script.run` dipanggil, secara SINKRON) → klik ke-2 return TANPA memanggil `google.script.run` sama sekali | **REASONED PASS** |
| C — Triple click | ONE server request | SAMA seperti B, guard berlaku utk klik ke-2 DAN ke-3 (kondisi `saving` tetap `true` sampai `endSaving_()` dipanggil oleh respons klik PERTAMA) | **REASONED PASS** |
| D — Server failure | SAVING → ERROR → BUTTON ENABLED | Code trace: `onSaveFailure()` (transport gagal) ATAU `onSaveResult({success:false,...})` (server tolak) → `endSaving_()` dipanggil di KEDUA jalur → `btn.disabled=false`, `saving=false` | **REASONED PASS** |
| E — Retry after failure | ERROR → SAVING → SUCCESS | Setelah `endSaving_()` (test D), `saving=false` & `btn.disabled=false` — klik ulang akan LOLOS guard (baris pertama `if(saving)` = false) dan mengulang alur normal (test A) | **REASONED PASS** |
| F — Slow network | SAVING STATE REMAINS VISIBLE | Overlay & disabled state HANYA di-reset di dalam callback (`onSaveResult`/`onSaveFailure`) — TIDAK ADA timeout/auto-hide di kode manapun, jadi SELAMA `google.script.run` belum resolve, state SAVING bertahan TANPA BATAS WAKTU (sampai callback benar2 terpanggil) | **REASONED PASS** (tidak ada mekanisme yang bisa membuatnya hilang prematur) |
| G — Save n santri berbeda | Behavior sama, TIDAK diuji ulang server-side (di luar scope UX) | `absensiList` dibangun dari `window.iaState_.list` (jumlah santri APA PUN) — guard & UX flow TIDAK bergantung pada `n` sama sekali (logic-nya generik, tidak ada kode yang membaca panjang list utk keputusan UX) | **REASONED PASS** (tidak perlu test data baru — sesuai instruksi §16 "tidak perlu mengubah database jika tidak diperlukan") |

**Tidak ada data test/QA baru dibuat** tahap ini — SEMUA verifikasi via
code reasoning, TIDAK ADA server write yang diperlukan utk memvalidasi
perubahan client-side murni ini (sesuai §17 "Jangan membuat data test
baru jika UI dapat diuji tanpa server write").

---

## 13. Before/After UX

```
Duplicate requests:
BEFORE = NOT MEASURED (tidak ada test klik-ganda EKSPLISIT sebelumnya, hanya asumsi DOM disabled cukup)
AFTER  = 1 per save (dijamin via guard eksplisit, code-level, lihat §12 Test B/C)

Saving state:
BEFORE = ADA (disabled+label+overlay), TIDAK ADA aria-busy/role=status
AFTER  = SAMA + aria-busy + role="status" aria-live="polite"

Error recovery:
BEFORE = ADA (button re-enabled, data tidak hilang) — SUDAH BENAR sejak awal
AFTER  = SAMA, direfactor via endSaving_() (konsolidasi, bukan perubahan behavior)

Success timing:
BEFORE = HANYA setelah server callback (SUDAH BENAR)
AFTER  = TIDAK BERUBAH (kondisi pemicu identik)
```

**TIDAK ADA klaim "Save menjadi lebih cepat"** — waktu server (Firestore
Write ~1950ms, dst) **TIDAK disentuh** tahap ini, sesuai §18/§19 prompt.

---

## 14. Server Performance Unchanged

Dikonfirmasi via `git diff` — **TIDAK ADA** satu baris pun perubahan di:
`Modul_InputAbsen.gs` (`serverSaveAbsensiKelas`,
`serverSaveAbsensiKelasAdmin`, `iaBulkWriteAbsensiFirestore_`,
`canGuruAccessKelas_`, `iaCekGuruSedangIzin_`), `Modul_Utilities.gs`
(`withScriptLock_`, `generateId`, cache), `Modul_FirestoreBridge.gs`.
Perubahan HANYA di `Script_Main.html` (fungsi klien) dan
`Markup_Screens.html` (1 atribut HTML). Firestore Write, `audit_log`,
`akses_kelas_request`, `guru_izin`, lock — **SEMUA UNCHANGED**, sesuai
larangan eksplisit §19.

---

## 15. Known Concurrency Issue — Out of Scope

```
CONCURRENCY CONTROL = OUT OF SCOPE
```

Sesuai temuan Tahap 8 (Scenario G, `ATTENDANCE_WRITE_ARCHITECTURE_DECISION.md`
§6/§Failure Model): 2 guru menyimpan KELAS YANG SAMA secara bersamaan
berpotensi lost-update (guru kedua menimpa guru pertama tanpa
notifikasi). **Guard client-side Tahap 9 TIDAK memperbaiki ini** —
`window.iaState_.saving` HANYA mencegah 1 guru (1 browser/sesi) klik
ganda; TIDAK ADA mekanisme yang mencegah 2 GURU BERBEDA (2 sesi/browser
berbeda) menyimpan bersamaan. Ini SESUAI EKSPEKTASI — client-side guard
BUKAN pengganti server-side concurrency control, dan Tahap 9 SENGAJA
TIDAK mencoba memperbaikinya (di luar cakupan, per instruksi eksplisit
§12 prompt).

---

## 16. Deployment

```
DEPLOYED: YES
Commit: 04fc63c (feat: Save Kehadiran -- guard duplicate-submit + aria-busy + pesan loading jelas)
Files changed: Script_Main.html, Markup_Screens.html
Deployment version: production, verify_served.js dijalankan setelah deploy
```

---

## 17. Remaining Work

1. **Navigation safety** (§9) — TIDAK diimplementasikan, dicatat sbg
   `LEAVE EXISTING BEHAVIOR`. Kalau diminta tahap terpisah: perlu
   investigasi SEMUA entry point navigasi (menu hamburger, switch
   kelas, back), bukan cuma tombol Save.
2. **Klik-test manual di perangkat mobile sungguhan** — belum bisa
   dilakukan di environment ini (tidak ada kredensial login). Rekomendasi:
   user melakukan verifikasi manual singkat (klik Simpan normal, coba
   klik cepat 2-3× berturut-turut, coba dgn koneksi lambat/throttled)
   di device asli sebelum dianggap FULLY verified.
3. **Concurrency control** (lost-update 2 guru kelas sama) — TAHAP 10
   terpisah, di luar cakupan Tahap 9 (server-side, bukan UX).

---

## FINAL OUTPUT

```
TAHAP 9 — SAVE ATTENDANCE UX

Code Changed:
YES

Backend Changed:
NO

Firestore Changed:
NO

Schema Changed:
NO

Duplicate Submit Protection:
PASS (code-level reasoning, guard eksplisit + endSaving_ konsisten di semua jalur)

Loading State:
PASS (existing overlay dipakai ulang, diperkuat aria-busy/role=status)

Success State:
PASS (kondisi pemicu tidak berubah, tetap hanya setelah server confirm)

Error Recovery:
PASS (data tidak hilang, guard tidak pernah tersangkut, refactor via endSaving_)

Mobile UX:
PASS (code review -- tidak ada layout jump, touch target tidak berubah;
BELUM diverifikasi klik manual di device asli, lihat §17)

Server Timing:
UNCHANGED

Production:
DEPLOYED

Cleanup:
NOT REQUIRED (tidak ada data test/QA yang dibuat tahap ini)

Known Issue:
Concurrent same-class save remains OUT OF SCOPE

Next:
TAHAP 10 — CONCURRENCY / LOST UPDATE ANALYSIS
```
