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
