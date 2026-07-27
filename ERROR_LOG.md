# ERROR_LOG.md — Riwayat Bug & Penanganannya

> **WAJIB DIBACA SEBELUM DEBUGGING.** Setiap bug production yang pernah terjadi
> dicatat di sini: gejala → akar masalah → perbaikan → cara verifikasi.
> Jika gejala yang kamu hadapi cocok dengan salah satu entri, JANGAN investigasi
> ulang dari nol — mulai dari entri itu.
>
> **Aturan menambah entri**: setiap bug production baru (bukan typo kecil)
> WAJIB dicatat di sini dalam commit yang sama dengan perbaikannya.

---

## #10 — `serverLogin` selalu gagal (bug laten, ditemukan 2026-07-26)

**Gejala**: kalau `DEV_MODE_SKIP_LOGIN` pernah dimatikan, login asli manapun
akan SELALU gagal ("Username atau password salah"), padahal password benar.

**Akar masalah**: `Code.js` → `serverLogin` membandingkan `found.passwordHash`
dan menaruh `found.scopeType`/`found.scopeId` ke sesi — padahal
`readSheetAsObjects()` (Modul_Utilities.gs) mengembalikan key APA ADANYA dari
header sheet (huruf kecil, snake_case: `password_hash`, `scope_type`,
`scope_id`), BUKAN di-camelCase. Jadi `found.passwordHash` selalu `undefined`.
Bug ini tidak pernah ketahuan sebelumnya karena `DEV_MODE_SKIP_LOGIN=true`
sejak awal development (login form tidak pernah benar-benar dipakai).

**Perbaikan**: baca `found.password_hash`/`found.scope_type`/`found.scope_id`
(snake_case, sesuai header sheet asli). Ditemukan & diperbaiki bersamaan
dengan mematikan `DEV_MODE_SKIP_LOGIN` (jadi `false`) untuk rollout fitur
Input Absen guru — lihat juga entri #11.

**Cara verifikasi**: `serverLogin('admin', 'admin123')` (atau akun lain)
harus `success:true` dan `sessionData.scopeType`/`scopeId` terisi benar
(bukan `undefined`).

## #11 — Input Absen (role guru) & mematikan DEV_MODE_SKIP_LOGIN (2026-07-26)

**Konteks**: fitur baru — akun role `guru` dikunci HANYA ke screen Input
Absen (tidak melihat shell admin sama sekali), per kelas (kelas = nilai
`jadwal_kbm.kelas` milik `guru_id` yang terhubung ke `users.guru_id`), dengan
alur izin akses kelas guru lain (sheet baru `akses_kelas_request`, approve
per-tanggal oleh guru pemilik kelas).

**⚠️ Perubahan penting yang menyertai**: `DEV_MODE_SKIP_LOGIN` di `Code.js`
diubah dari `true` → `false` (dikonfirmasi user). Sebelumnya SEMUA orang yang
membuka URL app otomatis masuk sebagai Admin PPG tanpa password — kalau
pembatasan role guru mau berlaku, ini WAJIB mati. Konsekuensi: semua
admin_ppg/admin_desa/admin_kelompok yang sudah ada SEKARANG WAJIB login
pakai username+password asli mereka (pastikan akun & password sudah benar
di sheet `users` sebelum user pilot memakai app).

**Skema baru**: `users.guru_id` (link ke sheet `guru`), sheet
`akses_kelas_request` (id, kelompok_id, kelas, tanggal, requester_user_id,
requester_guru_id, requester_nama, owner_guru_id, status, keterangan,
dibuat_pada, diputuskan_pada). ⚠️ **BELUM DIJALANKAN**: `setupDatabaseStructure()`
perlu di-run ulang manual di Apps Script editor supaya kolom/sheet baru ini
benar-benar ada di spreadsheet produksi.

**Cara verifikasi**: buat user role=guru via User Management (pilih data
Guru di dropdown baru), login sebagai guru itu → harus langsung masuk ke
screen Input Absen (bukan dashboard admin), sidebar/menu admin sama sekali
tidak boleh muncul.

## #16 — Kartu info kelas + hapus greeting "Halo" di Input Absen (2026-07-26) ⚠️ lihat #17

**⚠️ Update (sesi lanjutan, sama hari)**: kartu info kelas terpisah di bawah
ini SUDAH DIHAPUS lagi (lihat #17) — user merasa jadi 2 kartu terpisah
("card kelas+jumlah santri" di chip DAN "card data lengkap" di bawahnya)
kelihatan penuh/redundan. Kontennya dipindah jadi subtitle di header
(sebelah nama guru & lonceng), bukan kartu baru.

**(Riwayat)** — konteks awal di bawah:

**Konteks**: setelah kelas dipilih, user minta tampilan berurutan: Kelas,
Ruangan, jumlah santri + jam sesi, dan nama guru pengampu (bukan cuma daftar
santri langsung) — plus hapus tulisan "Halo," di header (nama guru saja).

**Implementasi**: `Modul_InputAbsen.gs` → `getKelasSessionInfo_(kelompokId, kelas)`
(BARU) ambil ruangan/jam_mulai/jam_selesai/guru dari baris jadwal_kbm Aktif
kelas itu yang PALING BARU dibuat — `getKelasOwnerGuruId_` direfaktor supaya
manggil helper ini (bukan duplikat query). Field ini ditambahkan ke tiap
item hasil `serverGetKelasAbsenList` (guru) & `getAllKelasInKelompok_`
(dipakai `serverGetKelasAbsenListAdmin`) — TIDAK perlu endpoint baru.
Frontend: `window.iaState_.kelasMeta` (map kelas→data) diisi tiap kali daftar
kelas dimuat, `iaRenderKelasInfoCard_(kelas)` mengisi kartu `#iaKelasInfoCard`
saat `iaSelectKelas_` dipanggil (format: "Kelas X" / "Ruangan Y" / "N Santri"
+ jam / "Guru : Kak Z").

**⚠️ Sengaja disembunyikan sementara** (permintaan user): chip "+ Minta
Akses" di baris kelas — kode & fungsi backend-nya (serverListKelasUntukPermintaan
dkk) TETAP ADA, tinggal un-comment block di `window.iaOnTanggalChange_`
(Script_Main.html, dekat komentar "sengaja disembunyikan sementara") kalau
mau diaktifkan lagi.

## #17 — Hapus kartu info kelas terpisah, gabung ke header (2026-07-26)

**Konteks**: user merasa 2 kartu terlihat penuh — chip kelas terpilih
("Kelas 4 · 2 santri") DAN kartu detail putih di bawahnya (#16) tampil
bersamaan, terasa duplikat. Minta hanya SATU kartu: info detail
(Kelas/Ruangan/jam/Santri/Guru) digabung jadi subtitle di header brass,
persis di bawah nama guru, di sebelah ikon lonceng — bukan kartu terpisah.

**Implementasi**: `#iaKelasInfoCard` (markup+CSS, dari #16) DIHAPUS TOTAL.
`#iaGreetingKelasInfo` (baru, di dalam `.ia-greeting` — sebaris dengan
`#iaNamaGuru`) diisi teks satu baris via `window.iaRenderKelasInfoCard_`
(nama fungsi dipertahankan, isi diganti): `"Kelas 4 · Masjid Lt 1 · 2 Santri
· 15:45–16:45"`, ditambah `· Kak <nama guru>` HANYA di mode admin (mode guru
tidak perlu, itu namanya sendiri). Chip kelas di `#iaKelasRow` TETAP ADA
(perlu utk pilih/ganti kelas kalau guru punya >1 kelas atau admin browsing
banyak kelas) — cuma kartu detail terpisahnya yang hilang.

## #15 — Status "Sakit" + kalender custom di Input Absen (2026-07-26)

**Konteks**: tambah tombol status ke-4 (Hadir/Izin/Sakit/Alpa, sebelumnya
cuma 3) di kartu santri Input Absen, dan ganti `<input type="date">` native
(tampilan beda-beda tiap browser/OS) dengan komponen kalender custom yang
SUDAH ADA di app (`.ppg-datepicker` / `window.toggleDatePicker`/
`renderDatePicker`/`pickDate`, dipakai di form Tanggal Lahir Guru/Generus
dll) — dipilih reuse, BUKAN bikin datepicker baru, supaya konsisten.

**Implementasi**: `iaTanggal` sekarang hidden input (nilai asli) + 
`iaTanggalDisplay` (readonly, teks "26 Juli 2026", trigger buka kalender)
+ tombol "Hari Ini" (`iaGoToToday_`) utk lompat cepat ke hari ini kapan pun
(dipakai kalau guru sedang browsing tanggal lain lalu mau balik). Default
tetap hari ini saat screen dibuka (`initInputAbsen_`/`openInputAbsenAsAdmin_`
→ `iaSetTanggal_(iaToday_())`), TAPI guru/admin tetap bebas ganti ke tanggal
lain (utk isi absen yang telat) — `window.pickDate` (Script_Main.html)
ditambah cabang `if (inputId === 'iaTanggal') window.iaOnTanggalChange_();`
supaya form kelas otomatis reload begitu tanggal baru dipilih.

Status "sakit" TIDAK perlu perubahan backend — `serverSaveAbsensiKelas(Admin)`
menyimpan `item.status` apa adanya tanpa validasi enum, jadi string baru ini
otomatis tersimpan. ⚠️ Laporan/dashboard lama yang menghitung
hadir/alpa/izin (Modul_Dashboard.gs, Modul_Statistics.gs,
Modul_MaintainAbsensi.gs `serverGetAbsensiSummary`) BELUM diupdate untuk
menghitung "sakit" secara eksplisit — santri berstatus sakit akan masuk
hitungan "total" tapi tidak muncul di kategori manapun pada laporan-laporan
itu. Perlu ditambah kalau nanti diminta laporan yang akurat utk kategori ini.

## #14 — Mode Admin di Input Absen (2026-07-26)

**Konteks**: pemilik akun (admin_ppg) minta bisa pakai screen Input Absen
yang sama seperti guru, tapi bebas pilih Kelompok+Kelas mana pun (bukan
dikunci ke satu guru_id) — supaya tidak perlu tools terpisah untuk isi
absen kalau perlu.

**Implementasi**: sidebar dapat menu baru "Input Absen" (`id="menuInputAbsenAdmin"`,
hanya tampil utk admin_ppg) → `window.openInputAbsenAsAdmin_()` (Script_Main.html)
membuka `#screenInputAbsen` dalam "mode admin" (state `window.iaState_.mode`)
DI ATAS `#appLayout` (bukan ganti route penuh) — tombol pojok kanan atas
jadi "Kembali ke Dashboard" (`closeInputAbsenAdmin_`), bukan Keluar; bell
notifikasi disembunyikan (fitur "Minta Akses" murni punya-guru, tidak
relevan utk admin karena admin sudah full access). Dropdown Kelompok
(`serverGetInputAbsenKelompokOptionsAdmin`) muncul di atas date-picker;
begitu Kelompok dipilih, kelas yang tampil adalah SEMUA kelas Aktif di
Kelompok itu (`getAllKelasInKelompok_`, Modul_InputAbsen.gs) — TIDAK
difilter per guru_id seperti punya guru (`getKelasOwnedByGuru_`).

**Fungsi backend baru (Modul_InputAbsen.gs, semua `requireAdminPpg_`)**:
`serverGetInputAbsenKelompokOptionsAdmin`, `serverGetKelasAbsenListAdmin`,
`serverGetAbsensiKelasFormAdmin`, `serverSaveAbsensiKelasAdmin` — SENGAJA
dipisah (bukan menambah percabangan admin ke fungsi guru yang sudah ada)
supaya RBAC guru yang sudah teruji tidak ikut berubah/berisiko regresi.

**Cara verifikasi**: login admin_ppg → sidebar ada "Input Absen" → pilih
Kelompok → kelas dari SEMUA guru muncul (bukan cuma satu) → bisa input &
simpan absen → tombol "Kembali ke Dashboard" harus kembali ke appLayout
tanpa logout.

## #12 — Daftar mandiri Guru (verifikasi nama saja) (2026-07-26) ⚠️ SUPERSEDED oleh #13

**⚠️ Update 2026-07-26 (sesi lanjutan)**: alur di bawah ini SUDAH DIGANTI oleh
entri #13 — Daftar sekarang HANYA email+password (tanpa nama), verifikasi
nama/kelas/kelompok dipindah ke wizard onboarding SETELAH login pertama.
Dibiarkan di sini sbg riwayat kenapa `serverRegisterGuru` sempat berbentuk
begini.

**(Riwayat)** — konteks di bawah:

**Konteks**: user minta login form biasa (tab Masuk/Daftar) menggantikan
jalur admin manual (dropdown "Terhubung ke Data Guru" di User Management,
lihat entri #11) — guru cukup "Daftar" isi Nama Lengkap + Email + Password
sendiri, TANPA campur tangan admin. Verifikasi HANYA lewat kecocokan nama
(case-insensitive, trim) terhadap sheet `guru` — kalau namanya persis sama
(besar/kecil huruf diabaikan) dengan salah satu baris di data Guru, akun
langsung dibuat & terhubung (`users.guru_id`). Kalau nama tidak ditemukan,
pendaftaran ditolak dengan pesan suruh hubungi Admin Kelompok dulu.

**Implementasi**: `Code.js` → `serverRegisterGuru(nama, email, password)`
(username = email, jadi `serverLogin` yang sudah ada otomatis berfungsi
tanpa perubahan). Jalur admin manual (`serverGetGuruOptionsForUser`, dropdown
di User Management) TETAP ADA sbg opsi cadangan, tidak dihapus.

## #13 — Onboarding wizard pasca-login pertama (2026-07-26)

**Konteks**: user minta verifikasi guru dipindah dari saat "Daftar" ke
SETELAH login pertama, lewat wizard step-by-step: pilih peran (Guru/Admin)
→ pilih Kelompok (untuk saat ini HANYA "Kelp Petemon", lihat
`ONBOARDING_ACTIVE_KELOMPOK_IDS_` di `Code.js`) → isi Nama → isi Kelas.
Form Daftar sendiri disederhanakan jadi HANYA Email + Password (field Nama
dihapus dari form Daftar, lihat #12 di atas).

**Implementasi**:
- `Code.js` → `serverRegisterGuru(email, password)` sekarang membuat baris
  user dengan `role`/`scope_type`/`scope_id`/`guru_id`/`nama` KOSONG ("akun
  belum lengkap").
- `renderApp(user)` (Script_Main.html) mendeteksi `!user.role` → tampilkan
  `#screenOnboarding` (wizard), BUKAN dashboard/Input Absen.
- `Code.js` → `serverCompleteOnboardingGuru(token, kelompokId, nama, kelas)`
  memverifikasi via `verifyGuruIdentity_()` (cocokkan ke sheet `guru` +
  `getKelasOwnedByGuru_()` dari Modul_InputAbsen.gs, satu sumber kebenaran
  dgn fitur Input Absen) — kalau cocok, baris user di-`updateRowByQuery`
  jadi lengkap (role='guru', dst) & sesi di-cache ulang. Kalau tidak cocok:
  TIDAK ADA perubahan, pesan generik "Data belum terdaftar. Silakan hubungi
  Admin Ruang Ngaji." (sesuai permintaan user, tidak dirinci lebih jauh
  supaya tidak bocor informasi mana bagian yang salah — nama atau kelas).
- Pilihan "Admin" di wizard SENGAJA tidak melakukan apa pun selain pesan
  "hubungi Admin PPG" — mencegah siapa pun self-elevate jadi admin dari
  form pendaftaran publik ini.
- "Lupa Password" mandiri (`serverResetPasswordSelfGuru`) memakai
  verifikasi yang SAMA (Kelompok+Nama+Kelas) + syarat tambahan: guru_id
  hasil cocokan HARUS SAMA dengan guru_id akun bersangkutan — supaya tidak
  bisa reset password akun guru lain hanya dgn menebak nama+kelas guru itu.

**Cara verifikasi**: Daftar (email+password) → harus langsung ke wizard
onboarding (bukan dashboard). Pilih Guru → Kelp Petemon → nama yang ADA di
sheet `guru` Kelp Petemon → kelas yang benar dia ajar → harus lolos ke Input
Absen. Nama/kelas yang salah → harus ditolak dengan pesan generik di atas.

**⚠️ Keterbatasan yang disengaja** (sesuai permintaan): dua Guru dengan nama
persis sama di Kelompok berbeda/sama akan match ke baris PERTAMA yang
ditemukan — tidak ada disambiguasi tambahan (mis. tanggal lahir). Kalau ini
jadi masalah nyata di lapangan, perlu field pembeda tambahan saat daftar.

**Cara verifikasi**: Daftar dengan nama yang ADA di sheet `guru` (variasi
huruf besar/kecil) → harus berhasil & langsung masuk ke Input Absen. Daftar
dengan nama yang TIDAK ada → harus ditolak dengan pesan yang jelas.

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

## #18 — "Pilih Kelas" Input Absen lambat dimuat (N+1 baca sheet) (2026-07-28)

**Gejala**: klik "Pilih Kelas" (atau buka Dashboard) di Input Absen terasa
sangat lambat, makin lambat makin banyak kelas yang diampu guru.

**Akar masalah**: `getKelasSessionInfo_` (Modul_InputAbsen.gs) melakukan
`readSheetAsObjects(SHEET_NAMES.JADWAL_KBM)` (+ `GURU` kalau ada guru_id) —
baca ULANG SELURUH sheet dari awal — dan dipanggil di DALAM `.forEach`/`.map`
per kelas di 4 tempat: `serverGetKelasAbsenList`, `serverGetGuruDashboardSummary`,
`serverGetGuruDashboardSummaryRange`, `getAllKelasInKelompok_` (mode Admin).
`readSheetAsObjects` tidak di-cache per-request (`Modul_Utilities.gs`), jadi
guru dengan N kelas memicu N kali round-trip baca sheet penuh — klasik pola
N+1 query, dan biang lambatnya bukan volume data tapi jumlah panggilan.

**Perbaikan**: `getKelasSessionInfo_` sekarang terima 2 parameter opsional
`(jadwalRowsAll, guruRowsAll)` — kalau dioper, dipakai langsung (tidak baca
ulang); kalau tidak dioper (caller lama), fallback baca sendiri (backward
compatible). Ke-4 caller di atas sekarang baca `JADWAL_KBM`/`GURU` SEKALI di
luar loop lalu oper ke tiap panggilan `getKelasSessionInfo_`.

**Aturan permanen**: JANGAN panggil `readSheetAsObjects(...)` di dalam
`.forEach`/`.map`/loop apa pun yang jalan per-baris data lain. Baca sheet
yang dibutuhkan SEKALI sebelum loop dimulai, lalu filter/lookup dari array
hasil baca itu di dalam loop.

---

## #19 — "Pilih Kelas" MASIH lambat setelah #18 (2 penyebab lanjutan) (2026-07-28)

**Gejala**: setelah fix #18, klik "Pilih Kelas" dari Dashboard tetap terasa
lambat (user minta di bawah 1 detik).

**Akar masalah #1 — double-read tersisa**: fix #18 nge-share `jadwalRowsAll`
tapi TETAP memanggil `getKelasOwnedByGuru_(...)` SEBELUM `jadwalRowsAll`
dibaca — jadi `jadwal_kbm` masih kebaca 2x per request (sekali di dalam
`getKelasOwnedByGuru_`, sekali lagi utk `jadwalRowsAll`). Ini fatal karena
`santri`/`guru`/`jadwal_kbm` utk Kelp Petemon (`kelompok_id: '1'`) SUDAH
pindah ke Firestore (`FIRESTORE_KELOMPOK_TABLES_` di Modul_Utilities.gs) —
tiap `readSheetAsObjects()` utk tabel itu = request Sheets DAN request
Firestore (`firestoreListCollection_`, `UrlFetchApp`), jauh lebih mahal dari
baca Sheets biasa. `getKelasOwnedByGuru_` sekarang terima parameter opsional
`jadwalRowsAll` juga, dan semua caller-nya baca `jadwal_kbm` SEBELUM manggil
fungsi ini (bukan sesudah).

**Akar masalah #2 — 2 round-trip client↔server berurutan**: alur "Pilih
Kelas" dari Dashboard = `iaLoadKelasList_()` panggil `serverGetKelasAbsenList`
(load daftar kelas), lalu HASILNYA otomatis trigger `iaSelectKelas_()` yang
panggil `serverGetAbsensiKelasForm` (load santri kelas pertama) — 2 kali
`google.script.run` BERURUTAN (bukan paralel, karena yang kedua butuh hasil
yang pertama). Tiap `google.script.run` = 1 eksekusi Apps Script terpisah
(tidak ada cache antar-eksekusi), jadi total waktu = waktu request 1 + waktu
request 2, dan request 2 baca ulang `santri` (Firestore lagi) yang
sebenarnya sudah dibaca di request 1.

**Perbaikan**: `serverGetKelasAbsenList`/`serverGetKelasAbsenListAdmin`
sekarang terima parameter `preferKelas` (kelas terakhir dipilih guru) dan
SEKALIAN mengembalikan `formKelas`+`formData` (form santri kelas yang bakal
otomatis dipilih) di response yang SAMA — pakai ulang `santriAll` yang sudah
dibaca di fungsi itu, cuma tambah 1 baca `absensi` (masih Sheets biasa utk
Kelp Petemon, murah). Frontend (`iaLoadKelasList_` di Script_Main.html) kalau
`result.formKelas` cocok dengan kelas yang mau di-auto-select, langsung pakai
`result.formData` TANPA manggil `serverGetAbsensiKelasForm` lagi — jadi
"Pilih Kelas" sekarang 1 round-trip, bukan 2. `iaSelectKelas_` (klik manual
pindah kelas lain) TETAP 1 round-trip terpisah seperti biasa (tidak diubah).

**Aturan permanen**: (1) urutan baca sheet penting — pastikan array yang mau
"dibagikan" ke fungsi lain benar-benar dibaca SEBELUM fungsi lain itu
dipanggil, bukan setelahnya. (2) kalau UI butuh data dari 2 fungsi server
berurutan (B butuh hasil A dulu), pertimbangkan gabungkan jadi 1 fungsi
server yang me-return data A+B sekaligus — terutama kalau sheet-nya sudah
pindah ke Firestore (biaya per-call jauh lebih terasa dibanding Sheets).

---

## #20 — "Pilih Kelas" MASIH ~10 detik setelah #18+#19 (readSheetAsObjects generik baca 2x tempat) (2026-07-28)

**Gejala**: setelah #18 & #19, "Pilih Kelas" tetap ~10 detik (target user:
di bawah 1 detik).

**Akar masalah**: `readSheetAsObjects()` generik (Modul_Utilities.gs), untuk
tabel yang statusnya "sudah pindah Firestore utk SEBAGIAN kelompok"
(`santri`/`guru`/`jadwal_kbm`, kelompok `'1'` = Kelp Petemon), SELALU
melakukan **DUA** pembacaan tiap kali dipanggil:
1. `readSheetRowsRaw_()` — scan PENUH sheet Google Sheets, SEMUA kelompok
   (bukan cuma kelompok yang diminta) — perlu, supaya kelompok yang BELUM
   pindah tetap kebaca; tapi utk kelompok yang SUDAH pindah (spt kelp 1),
   baris-barisnya sengaja dikecualikan di sini, jadi hasil scan ini 100%
   DIBUANG untuk kelompok itu — kerja penuh, hasil nol.
2. `firestoreListCollection_()` — request HTTP ke Firestore utk kelompok yang
   sudah pindah.

Guru di Kelp Petemon (kelompok Firestore) jadi bayar BIAYA PENUH kedua jalur
tiap kali salah satu dari 3 tabel ini dibaca — padahal cuma butuh jalur
Firestore saja. Fix #18/#19 sudah menghilangkan pembacaan BERULANG di dalam
1 fungsi, tapi belum menyentuh pemborosan generik struktural ini.

**Perbaikan #1 — `iaReadKelompokTable_(sheetName, kelompokId)`** (baru, di
Modul_InputAbsen.gs): kalau `isKelompokTableOnFirestore_(sheetName,
kelompokId)` true → baca Firestore SAJA (skip scan Sheets total). Kalau
false → baca `readSheetRowsRaw_()` SAJA lalu filter kelompok (skip
pengecekan/percobaan Firestore). Menggantikan SEMUA pemanggilan
`readSheetAsObjects(SANTRI/GURU/JADWAL_KBM)` di modul ini (termasuk fallback
default parameter di `getKelasOwnedByGuru_`/`getKelasSessionInfo_`).

**Perbaikan #2 — `iaReadKelompokTablesParallel_(sheetNames, kelompokId)`**
(baru): kalau beberapa tabel Firestore dibutuhkan SEKALIGUS (jadwal_kbm +
guru + santri, kasus paling umum di Input Absen), jangan panggil
`firestoreListCollection_` satu-satu BERURUTAN (3× latensi jaringan
ditumpuk) — pakai `UrlFetchApp.fetchAll()` supaya ketiga request jalan
PARALEL (cuma ~1× latensi, seukuran yang paling lambat dari ketiganya).
Fallback ke jalur sekuensial normal kalau salah satu koleksi ternyata
>300 dokumen (butuh `nextPageToken`, jarang terjadi utk 1 kelompok).
`serverGetKelasAbsenList`, `serverGetGuruDashboardSummary(Range)`, dan
`getAllKelasInKelompok_` (mode Admin) sekarang pakai ini.

**Aturan permanen**: (1) kalau ada helper generik yang "aman tapi mahal"
(disini: `readSheetAsObjects` yg harus benar utk 40+ pemanggil beda
kebutuhan), dan satu pemanggil TAHU PERSIS scope-nya (di sini: 1 kelompok
spesifik), buat helper SEMPIT khusus pemanggil itu — jangan paksa generik
lebih pintar (resiko pecah di pemanggil lain). (2) kalau butuh >1 HTTP
request independen (tidak saling tunggu hasil), pertimbangkan
`UrlFetchApp.fetchAll()` alih-alih loop `UrlFetchApp.fetch()` satu-satu.

---

## #21 — Pindah Dashboard↔Pilih Kelas selalu lambat DUA ARAH, walau server sudah dioptimasi (#18-#20) (2026-07-28)

**Gejala**: setelah #18-#20 (server sudah jauh lebih hemat baca sheet),
pindah dari Dashboard → Pilih Kelas TETAP lambat, dan sebaliknya Pilih
Kelas → Dashboard JUGA lambat — padahal user cuma pindah tampilan, tanggal
tidak berubah.

**Akar masalah**: `iaShowDashboardView_`/`iaShowKelasView_` (Script_Main.html)
SELALU memanggil `iaLoadDashboardSummary_`/`iaLoadKelasList_` tiap kali
dipanggil, tanpa syarat — padahal DOM kartu Dashboard (`#iaDashboardCards`)
dan chip+form Kelas (`#iaKelasRow`/`#iaSantriList`) TIDAK PERNAH dibersihkan
saat view disembunyikan (cuma `style.display = 'none'`, isinya tetap ada).
Jadi tiap pindah-pindah view, walau datanya 100% masih sama & valid (tanggal
sama, belum ada perubahan), aplikasi tetap memicu `google.script.run` baru
ke server (yang tetap butuh network round-trip meski sudah dioptimasi
di sisi server) — kerja dua kali untuk hasil yang identik.

**Perbaikan**: tambah cache client-side sederhana berbasis "kunci state
terakhir dimuat": `iaDashboardCacheKey_()`/`iaKelasCacheKey_()` menghasilkan
string dari tanggal+filter (Dashboard) atau tanggal+kelompokId (Kelas).
`iaState_.dashboardLoadedKey`/`kelasLoadedKey` diisi tiap kali load SUKSES.
`iaShowDashboardView_`/`iaShowKelasView_` sekarang cek dulu: kalau kunci
sekarang == kunci terakhir dimuat, LANGSUNG return (tampilkan lagi apa yang
sudah ada di DOM) — TANPA `google.script.run` sama sekali, jadi instan.
Kunci diputus (`= null`) di `saveInputAbsen_` setelah simpan absen sukses
(ringkasan Dashboard jadi basi, harus reload sekali berikutnya dibuka) —
ganti tanggal/filter otomatis bikin kunci tidak cocok lagi (tidak perlu
invalidasi eksplisit, deteksi lewat perbandingan string).

**Aturan permanen**: kalau UI switch antar-view/tab TIDAK membersihkan DOM
view yang disembunyikan (cuma `display:none`), JANGAN otomatis re-fetch
tiap kali view itu ditampilkan lagi — cek dulu apakah data yang sudah ada
masih valid utk state saat ini (biasanya cukup 1 string kunci berisi
parameter yang menentukan hasil query, mis. tanggal/filter/id). Skip
round-trip kalau kunci cocok. Ini beda dari optimasi #18-#20 (yang soal
"1 kali load itu boros berapa banyak") — ini soal "jangan load ulang kalau
tidak perlu load sama sekali".

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
