# ERROR_LOG.md — Riwayat Bug & Penanganannya

> **WAJIB DIBACA SEBELUM DEBUGGING.** Setiap bug production yang pernah terjadi
> dicatat di sini: gejala → akar masalah → perbaikan → cara verifikasi.
> Jika gejala yang kamu hadapi cocok dengan salah satu entri, JANGAN investigasi
> ulang dari nol — mulai dari entri itu.
>
> **Aturan menambah entri**: setiap bug production baru (bukan typo kecil)
> WAJIB dicatat di sini dalam commit yang sama dengan perbaikannya.

---

## #1 — Layar putih total / "tidak bisa login" (2026-07-17) ⚠️ PALING PENTING

**Gejala**: Aplikasi hanya menampilkan layar putih. Console browser:
`Uncaught SyntaxError: Failed to execute 'write' on 'Document': Invalid or
unexpected token` di file Google sendiri (`...mae_html_user...js`), BUKAN di
file kita. Awalnya salah didiagnosis sebagai "masalah login".

**Akar masalah**: Pemroses HtmlService Apps Script MEMPROSES `Index.html` saat
serving (menghapus komentar, dll). Pemrosesnya punya bug: `//` di dalam **string
JavaScript** (contoh: `xmlns="http://www.w3.org/2000/svg"` di variabel
`iconDeleteSvg_`) dianggap awal komentar → sisa baris DIHAPUS → string tak
tertutup → syntax error → `document.write` Google gagal → seluruh app tidak
render. Source lokal 100% valid; yang rusak hanya OUTPUT SERVER.

**Kenapa lama ketemu**: semua pemeriksaan awal dilakukan pada file lokal (yang
memang valid). Baru ketahuan setelah mengambil output server sungguhan (pakai
token OAuth clasp), men-decode `userHtml`-nya, dan mem-parsing ulang.

**Perbaikan**: hapus atribut `xmlns` dari string SVG di JS (tidak diperlukan
untuk SVG via innerHTML). Commit: cari `iconDeleteSvg_` di git log.

**Aturan permanen**: **JANGAN PERNAH menulis `//` (termasuk URL `http://`) di
dalam string JavaScript pada Index.html.** URL di atribut HTML (`href=`,
`src=`) aman. Jika butuh URL di JS, pecah: `'http:' + '//example.com'`.

**Cara verifikasi**: `node tools/verify_served.js` (ambil output server asli +
parse semua script). Guardrail otomatis: `node tools/check_local.js`.

---

## #2 — Edit/Delete diam-diam tidak tersimpan (2026-07-17)

**Gejala**: Klik hapus/edit guru → UI bilang sukses, tapi data di sheet tidak
berubah.

**Akar masalah**: id dari `onclick` HTML bertipe **string** ("3"), kolom `id`
di sheet bertipe **number** (3). `findRowByQuery` di `Modul_Utilities.gs`
membandingkan dengan `===` (strict) → baris tidak pernah ketemu →
`deleteRowByQuery` cuma warn di log tapi fungsi tetap return `success: true`.

**Perbaikan**: gunakan `guru.id` / `santri.id` (nilai numerik hasil lookup
`find(x => x.id == id)` yang pakai `==` longgar) sebagai query, BUKAN id mentah
dari klien. Sudah diterapkan di `Modul_MaintainGuru.gs` dan
`Modul_MaintainSantri.gs`.

**Aturan permanen**: setiap fungsi server baru yang menerima id dari klien lalu
memanggil `updateRowByQuery`/`deleteRowByQuery` WAJIB pakai id hasil lookup,
bukan parameter mentah.

---

## #3 — "Tidak bisa login" padahal bukan soal password (2026-07-17)

**Gejala**: user tidak bisa masuk; halaman malah menampilkan login **Google**
(accounts.google.com), bukan form login app.

**Akar masalah** (dua lapis):
1. `appsscript.json` → `"access": "MYSELF"` — hanya akun Google yang men-deploy
   (rheza354@gmail.com) yang bisa MEMBUKA url `/exec`. Browser yang login akun
   Google lain akan mentok di halaman login Google.
2. `Code.js` → `DEV_MODE_SKIP_LOGIN = true` — selama development, siapa pun
   yang lolos gerbang Google otomatis masuk sebagai Admin PPG tanpa password.
   Form login app tidak akan muncul sama sekali (memang disengaja).

**Catatan**: kejadian ini bertumpuk dengan bug #1 (layar putih), sehingga
diagnosis awal kacau. Pelajaran: **cek dulu URL di address bar** — kalau masih
`accounts.google.com`, masalahnya otorisasi Google, bukan kode kita.

---

## #4 — Google Charts tidak pernah dimuat (laten, ketahuan 2026-07-17)

**Gejala**: `google.charts.load(...)` dipanggil tapi `<script src=
"https://www.gstatic.com/charts/loader.js">` tidak ada di Index.html —
kemungkinan hilang saat salah satu edit besar. Chart dashboard tidak render.

**Perbaikan**: tag loader ditambahkan kembali sebelum blok
`google.charts.load`.

---

## #5 — Audit ketahanan: race condition & id ganda (2026-07-17, preventif)

**Temuan audit** (semua sudah diperbaiki di commit yang sama):
1. `generateId` = max(id)+1 tanpa lock → dua pengguna menyimpan bersamaan
   dapat id SAMA → edit/hapus bisa mengenai data yang salah.
2. `serverBulkImportSantri` memanggil `generateId` per baris SEBELUM insert →
   semua baris impor dapat id identik (bug nyata bahkan single-user).
3. Delete/update mencari nomor baris lalu memutasi — jika pengguna lain
   menghapus baris di sela waktu itu, index bergeser → BARIS SALAH terhapus.
4. Jadwal KBM & Pengumuman update/delete masih memakai id mentah dari klien
   (pola bug #2) → diam-diam gagal.

**Perbaikan sistemik**:
- `withScriptLock_(fn)` di `Modul_Utilities.gs` — WAJIB membungkus semua
  operasi tulis. Sudah diterapkan di semua mutasi Guru, Santri (termasuk bulk
  import: id digenerate berurutan DI DALAM lock), Jadwal KBM, Pengumuman.
- `findRowByQuery` sekarang membandingkan via `String()` — menutup seluruh
  kelas bug #2 untuk semua modul sekaligus.
- Semua mutasi dibungkus try/catch → selalu return `{success:false, error}`
  terstruktur, tidak pernah melempar mentah ke klien.
- Cache baca (`guru_k*`, `santri_k*`, TTL 300 dtk) + invalidasi di tiap
  mutasi → tampil data dari cache ±50ms vs baca sheet 300-800ms.
- Git pre-commit hook menjalankan `tools/check_local.js` otomatis.

**Aturan permanen untuk fungsi server BARU**: ikuti pola `serverAddGuru` —
lock + id-dalam-lock + id hasil lookup + cacheDrop + try/catch terstruktur.

---

## #6 — Layar putih saat klik tombol Refresh (2026-07-18)

**Gejala**: Di Dashboard Kelompok, klik tombol Refresh → layar langsung putih
total. Bukan bug `//` (bug #1): `tools/verify_served.js` LOLOS, semua blok
script valid di server.

**Akar masalah**: `window.hardRefresh_` memakai `location.reload()`.
HtmlService menyajikan HTML kita di dalam **iframe bersarang** berdomain
`*.googleusercontent.com/userCodeAppPanel`, bukan langsung di `/exec`. Jadi
`location.reload()` me-reload URL INTERNAL iframe tersebut — URL itu tidak
bisa disajikan ulang berdiri sendiri → frame kosong → layar putih.
`window.top.location.reload()` juga bukan solusi: beda origin (script.google.com
vs googleusercontent.com) → diblokir SecurityError.

**Perbaikan**: refresh dilakukan IN-PLACE, tanpa meninggalkan halaman:
1. `serverDropKelompokCache(token, kelompokId)` (Modul_Utilities.gs) membuang
   cache `guru_k*`/`santri_k*` supaya data benar-benar dibaca ulang dari sheet.
2. Panggil ulang loader layar yang sedang aktif (peta `window.SCREEN_LOADERS_`,
   atau `loadKelompokDashboard` untuk Dashboard Kelompok).
3. Spinner ditutup lewat callback `onDone` saat data guru+generus tiba, bukan
   timer tebak-tebakan.

**Aturan permanen**: **DILARANG memakai `location.reload()` / `window.top.
location.*` di dalam app Apps Script ini.** Untuk "refresh", panggil ulang
fungsi pemuat data layar yang aktif.

---

## #7 — Jadwal KBM berhenti di "Memuat..." — Sheets diam-diam mengubah teks jadi Date (2026-07-18)

**Gejala**: Seksi Jadwal KBM di Dashboard Kelompok hanya menampilkan tulisan
"Memuat..." selamanya. Data DIPASTIKAN ada di sheet (9 baris, dicek via
`node tools/check_schema.js`). Tidak ada pesan error apa pun di UI.

**Akar masalah — dua lapis:**

1. **Google Sheets meng-autoconvert teks jadi objek `Date`.** Kita menulis
   string `'2026-07-20'` (tanggal) dan `'15:45'` (jam) lewat `appendRow`, tapi
   Sheets memparsingnya jadi nilai tanggal/waktu asli. Saat dibaca ulang,
   `readSheetAsObjects` mengembalikan objek `Date`, bukan string:
   - `tanggal` → `Date(2026-07-19T17:00:00Z)` (= 20 Juli 00:00 WIB)
   - `jam_mulai` → `Date(1899-12-30T08:37:48Z)` (epoch serial waktu Sheets)

   Objek `Date` ini ikut terkirim ke klien lewat `google.script.run` dan
   membuat respons gagal sampai ke browser.

2. **Kegagalan ditelan diam-diam.** Loader menulis
   `if (!result.success) return;` TANPA `withFailureHandler`. Jadi ketika
   respons gagal, tidak ada callback yang jalan sama sekali — placeholder
   "Memuat..." tidak pernah diganti dan tidak ada error yang tampil. Inilah
   yang membuat bug terlihat misterius.

**Perbaikan**:
1. `Modul_MaintainJadwalKBM.gs`: helper `tanggalKeString_()` / `jamKeString_()`
   menormalkan `Date` → `'yyyy-MM-dd'` / `'HH:mm'` memakai
   `getSpreadsheetTimeZone()` (me-reverse persis konversi Sheets).
2. `serverGetJadwalKBM` membangun objek balikan SECARA EKSPLISIT field per
   field — hanya string/angka, sehingga tidak ada `Date` nyasar
   (termasuk `dibuat_pada`) yang ikut terkirim.
3. `loadKelompokDashboardJadwal_` diberi `withFailureHandler` + menampilkan
   pesan error di tempat daftar, bukan `return` kosong.

**Aturan permanen**:
- **JANGAN kembalikan objek hasil `readSheetAsObjects` apa adanya ke klien**
  jika sheet punya kolom tanggal/jam. Normalkan ke string dulu, atau bangun
  objek balikan eksplisit.
- **SETIAP `google.script.run` WAJIB punya `withFailureHandler`.** Tanpa itu,
  kegagalan tidak meninggalkan jejak apa pun di UI maupun console.

**Cara verifikasi**: `node tools/check_schema.js` (data ada?) lalu endpoint
diagnostik baru `?diag=rows&sheet=jadwal_kbm` — menampilkan NILAI + **TIPE**
tiap kolom, sehingga sel yang diam-diam jadi `Date` langsung ketahuan.

---

## #8 — Absensi: simpan ulang di hari sama numpuk baris, form/summary selalu kosong (2026-07-22)

**Gejala**: ditemukan lewat `testAbsensiFirestorePilot_()` (pilot test rollout
Firestore Absensi Kelp Petemon) — `serverSaveAbsensiDaily` melapor sukses,
tapi `serverGetAbsensiForm` sesudahnya SELALU balas status default `'hadir'`
utk semua santri (data yg baru disimpan seakan tidak ada). Belum pernah
dilaporkan pengguna secara eksplisit, kemungkinan karena mirip "biasanya
default hadir" jadi tidak mencolok — tapi berarti fitur Absensi (form harian,
summary, badge santri berisiko) berpotensi TIDAK PERNAH benar-benar
menampilkan data tersimpan sejak modul ini ada.

**Akar masalah**: akar sama persis dengan bug #7 (Sheets diam-diam mengubah
teks `'yyyy-MM-dd'` jadi objek `Date` lewat `appendRow`), tapi perbaikannya
dulu hanya diterapkan ke Jadwal KBM — Modul_MaintainAbsensi.gs (dan sebagian
Modul_Laporan.gs/Modul_Dashboard.gs) tidak pernah disentuh. Semua titik yang
membandingkan `a.tanggal` (dari `readSheetAsObjects`) dengan string `===`
SELALU false karena `Date !== string`:
- `serverGetAbsensiForm`, `serverGetAbsensiSummary`: filter tanggal kosong.
- `serverSaveAbsensiDaily`: loop hapus lama tidak pernah cocok →
  `deleteRowByQuery(..., {tanggal})` juga tidak pernah match (query itu
  sendiri dibandingkan via `String(cell)` di `findRowByQuery`, dan
  `String(objekDate)` tidak akan pernah sama dgn `'yyyy-MM-dd'`) → simpan
  ulang tanggal yang sama MENUMPUK baris baru, bukan menimpa.
- `serverBulkImportAbsensi`: cek duplikat santri_id+tanggal tidak pernah
  kena, jadi bisa dobel-import tanpa terdeteksi.
- `serverGetSantriBerisiko`: filter rentang bulan (`>=`/`<=` dgn string)
  ikut gagal (Date dibandingkan ke string via ToPrimitive → NaN).
- `Modul_Laporan.gs` (laporan absensi bulanan) & `Modul_Dashboard.gs`
  (`serverGetKehadiranChart7Hari`, dead code/tidak dipanggil frontend):
  pola sama di pencarian record per hari.

**Perbaikan**:
1. `Modul_Utilities.gs`: helper `tanggalKeString_()` (versi umum, dipindah
   dari pola `jamKeString_` di Modul_MaintainJadwalKBM.gs) — dipakai semua
   modul yang butuh normalisasi tanggal jadi `'yyyy-MM-dd'`.
2. `Modul_MaintainAbsensi.gs`: semua perbandingan `a.tanggal === ...` diganti
   `tanggalKeString_(a.tanggal) === ...`. `serverSaveAbsensiDaily` juga
   diubah hapus-baris-lama dari query `{tanggal}` (tidak pernah match) jadi
   `{id: a.id}` langsung (id sudah didapat dari baris yang match di JS,
   bukan dari sheet).
3. `Modul_Laporan.gs` (laporan absensi bulanan) & `Modul_Dashboard.gs`
   (`serverGetKehadiranChart7Hari`) dapat perbaikan sama di titik yang setara.

**Aturan permanen tambahan**: kalau nanti nemu bug serupa di modul LAIN yang
punya kolom tanggal/jam (munaqosah, konseling, kalender_events, dst) —
JANGAN anggap bug #7 "sudah beres di seluruh app", cek per-modul, karena
perbaikannya tidak otomatis menjalar (bukan fix terpusat di
`readSheetAsObjects`, sengaja, biar tidak berisiko ke sheet lain yang
memang butuh objek `Date` asli).

---

## #9 — Judul+tombol Data Guru/Generus pecah ke bawah saat toggle tabel (2026-07-23)

**Gejala**: setelah fitur "fokus tampilan" ditambahkan di tab Data Master
(klik "Daftar Guru"/"Daftar Generus" menyembunyikan section satunya), judul
section yang TETAP tampil ikut rusak tampilannya — teks judul & tombol
Ekspor/Daftar/Tambah yang seharusnya sejajar 1 baris malah tersusun ke bawah
kiri, walau section itu sendiri tidak seharusnya disentuh sama sekali.

**Akar masalah**: `dataGuruTitle`/`dataGenerusTitle` punya inline style
bawaan `style="display: flex; align-items: center; justify-content:
space-between;"` di markup (JS TIDAK punya di CSS class, cuma inline). Kode
`window.setDataMasterFocus_()` yang menunjukkan/menyembunyikan section lain
memakai pola `el.style.display = kondisi ? 'none' : ''` — string kosong
`''` DIKIRA "kembalikan ke semula", padahal itu MENGHAPUS PERMANEN properti
`display` dari inline style, bukan mengembalikan ke `flex`. Karena tidak ada
aturan CSS stylesheet utk `display` di `.dash-section-title` (cuma font-
size/weight/color/margin), elemen jatuh ke default `block` — anak-anaknya
(`<span>` judul + `<div>` tombol) jadi tersusun vertikal, bukan flex-row.

**Perbaikan**: untuk elemen yang punya inline `display` bawaan bukan-default
(di sini `flex`), toggle visibility WAJIB set nilai eksplisit ('flex'/'none'),
JANGAN pernah pakai `''` mengira itu "mengembalikan semula" — `''` hanya
aman dipakai kalau `display`-nya berasal dari CSS class (mis. `.guru-dash-
kpi-row` yang `display:grid` via class, bukan inline), karena di situ `''`
benar-benar mengembalikan ke aturan class.

**Aturan permanen**: sebelum menulis `el.style.display = ''` di JS mana pun
utk "menampilkan lagi" sebuah elemen, CEK DULU apakah elemen itu punya
inline `display` bawaan di markup HTML-nya. Kalau ya, set nilai eksplisitnya
(bukan `''`). Kalau tidak (display berasal dari CSS), `''` aman.

---

## Prosedur Debugging Cepat (urutan baku)

1. **Baca file ini dulu** — cocokkan gejala.
2. Layar putih / app tidak render → `node tools/verify_served.js`
   (JANGAN buang waktu memeriksa file lokal dulu; bug #1 hanya terlihat di
   output server).
3. Sebelum commit apa pun → `node tools/check_local.js`.
4. Data tidak tersimpan padahal "sukses" → cek pola bug #2 (id string vs
   number) di modul terkait.
5. Tidak bisa akses app → cek address bar (bug #3), lalu `appsscript.json`.
6. Peta isi file ada di `FILE_MAP.md` — jangan baca seluruh file besar.
