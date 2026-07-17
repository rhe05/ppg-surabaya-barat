# FILE_MAP.md — Peta Isi File (baca ini, bukan seluruh file)

> Tujuan: menemukan titik kode yang relevan dengan **pencarian string penanda**
> (`grep`), bukan membaca file 7000+ baris. Nomor baris cepat basi — penanda
> tidak. Update peta ini jika menambah section/modul baru.

## Struktur repo

> ⚠️ **2026-07-18: Index.html DIPECAH** jadi 4 file via pola HtmlService
> template `<?!= include('...'); ?>` (`doGet` sekarang pakai
> `createTemplateFromFile('Index').evaluate()`, bukan `createHtmlOutputFromFile`
> lagi). Server tetap menggabungkan semuanya jadi SATU output HTML — bug
> `//` di ERROR_LOG.md #1 tetap berlaku, guardrail `tools/check_local.js`
> sudah discan ke keempat file.

| Path | Isi | Kapan disentuh |
|---|---|---|
| `13_AppsScript/Index.html` | SHELL tipis: `<head>`/`<body>` + 3x `<?!= include(...) ?>`, ±35 baris. **Bukan tempat cari kode CSS/HTML/JS lagi.** | Jarang (hanya struktur shell) |
| `13_AppsScript/Style_Main.html` | Seluruh CSS (isi `<style>...</style>`, ±1900 baris) | Perubahan tampilan/CSS |
| `13_AppsScript/Markup_Screens.html` | Seluruh HTML screens & modal (±2190 baris) | Tambah/ubah screen atau modal |
| `13_AppsScript/Script_Main.html` | Seluruh JS utama (isi `<script>...</script>`, ±3290 baris) | Tambah/ubah logika frontend |
| `13_AppsScript/Code.js` | Entry `doGet` (`createTemplateFromFile`), `include(filename)` (helper penggabung), login (`serverLogin`), sesi, `DEV_MODE_SKIP_LOGIN` | Auth/akses/struktur shell |
| `13_AppsScript/Modul_Utilities.gs` | `SHEET_NAMES`, `readSheetAsObjects`, `findRowByQuery` (compare via String — ERROR_LOG #2), `updateRowByQuery`, `deleteRowByQuery`, `getCurrentUser`, `validateUserAccess`, **`withScriptLock_` (wajib untuk semua mutasi — ERROR_LOG #5)**, **cache: `cacheGet_`/`cachePut_`/`cacheDrop_`** (kunci: `guru_k<id>`, `santri_k<id>`) | Helper DB/RBAC/lock/cache |
| `13_AppsScript/Setup_Database.gs` | Skema semua sheet + `migrateGuruSchemaAddFields_` + `migrateSantriSchemaAddFields_` (⚠️ perlu run manual `setupDatabaseStructure()` di editor Apps Script tiap tambah kolom) | Perubahan skema |
| `13_AppsScript/Modul_MaintainGuru.gs` | CRUD guru (`serverGetGuruList/Add/Update/Delete`) | Fitur guru |
| `13_AppsScript/Modul_MaintainSantri.gs` | CRUD santri/generus + `serverBulkImportSantri` | Fitur generus |
| `13_AppsScript/Modul_Export.gs` | Ekspor xlsx asli via `Utilities.zip` (`serverExportGuruKelpXlsx`, `serverExportSantriKelpXlsx`, `buildXlsxBase64_`) | Fitur ekspor |
| `13_AppsScript/Modul_MaintainJadwalKBM.gs` / `Modul_MaintainPengumuman.gs` | CRUD Jadwal KBM & Pengumuman (Dashboard Kelompok) | — |
| `13_AppsScript/Modul_Dashboard.gs`, `Modul_Statistics.gs`, `Modul_Laporan.gs`, `Modul_UserManagement.gs`, dst | Fitur lama (Phase 1-7), jarang berubah | — |
| `tools/check_local.js` | Cek sintaks + guardrail SEBELUM deploy (otomatis via git pre-commit hook; salinan hook di `tools/pre-commit`) | Tiap sebelum commit |
| `tools/verify_served.js` | Ambil & validasi output server SETELAH deploy | Tiap layar putih/anomali |
| `ERROR_LOG.md` | Riwayat bug + penanganan — **baca duluan saat ada error** | Tiap ada bug baru |

## Navigasi frontend — cari string penanda ini (grep)

> Sejak dipecah (lihat catatan di atas): CSS di `Style_Main.html`, HTML di
> `Markup_Screens.html`, JS di `Script_Main.html`. Grep langsung ke file yang
> sesuai kategori penanda, JANGAN grep/baca `Index.html` untuk ini (isinya
> cuma shell).

### CSS → `13_AppsScript/Style_Main.html` (blok `<style>`, bagian atas file)
- `LOGIN SCREEN` · `APP LAYOUT` · `SIDEBAR: DESA/KELOMPOK TREE`
- `GLOBAL LOADING OVERLAY` — spinner tengah layar tema brass (boot/simpan/hapus/ekspor)
- `DASHBOARD GURU (per Kelompok` — KPI card premium Dashboard Kelompok
- `.dash-header-admin-card` — kartu admin kanan atas header Dashboard Kelompok (avatar+nama+role)
- `.sidebar-footer` — freeze/sticky bottom untuk tombol Keluar
- `CUSTOM DATE PICKER` — datepicker tanpa library
- `MODAL TAMBAH GURU / GENERUS` — layout form 2 kolom + section
- `TABEL DAFTAR GURU` — toolbar filter/search, badge, tombol aksi
- `MODAL KONFIRMASI HAPUS` — modal hapus premium (spinner sekarang di `#globalLoadingOverlay`, bukan di tombol)
- `MODAL DETAIL GURU/GENERUS` — modal detail read-only
- `MOBILE OPTIMIZATION` — semua breakpoint responsive

### HTML → `13_AppsScript/Markup_Screens.html` (screens & modals)
- `id="screenLogin"` · `id="appLayout"` · `id="screenGuruDashboard"` (Dashboard Kelompok)
- `id="globalLoadingOverlay"` — spinner global, kontrol via JS di bawah
- Sidebar: `id="userAvatar"` TIDAK ADA LAGI (kartu admin dipindah ke header Dashboard Kelompok, lihat `id="dashHeaderAdminName/Role/Avatar"`); footer sidebar cuma tombol Keluar
- Header seksi: `id="dataGuruTitle"` · `id="dataGenerusTitle"`
- Tabel: `id="guruDashTableWrapper"` · `id="santriDashTableWrapper"`
- Modal (semua `id="modal..."`): `modalGuruKelp` (tambah/edit guru) ·
  `modalGenerusKelp` · `modalDeleteGuruKelp` · `modalDeleteGenerusKelp` ·
  `modalDetailGuruKelp` · `modalDetailGenerusKelp` · `modalEksporGuru` ·
  `modalEksporGenerus`

### JavaScript → `13_AppsScript/Script_Main.html` (blok `<script>` utama; cari `window.<nama>`)
- Boot & auth: `window.onload` → `serverCheckDevMode` → `renderApp` · `handleLogin` · `verifySession`
- Spinner global (WAJIB dipakai untuk semua momen tunggu baru, jangan buat spinner lokal): `showGlobalLoading_(text)` / `hideGlobalLoading_()`
- Dashboard Kelompok load: `loadKelompokDashboardGuru_` · `loadKelompokDashboardSantriKelas_` · `loadKelompokDashboardAbsen_`
- Tabel guru: `toggleGuruDashTable_` · `filterGuruDashTable_` · `renderGuruDashTable_`
- Tabel generus: `toggleGenerusDashTable_` · `filterSantriDashTable_` · `renderSantriDashTable_`
- CRUD guru (klien): `openModalGuruKelp` · `saveGuruKelp` (add/update via `currentEditGuruId`) · `editGuruKelp` · `viewGuruKelp` · `deleteGuruKelp` → `confirmDeleteGuruKelp`
- CRUD generus (klien): pola sama, ganti `Guru`→`Generus` (`currentEditGenerusId`, dst)
- Ekspor: `confirmEksporGuru` · `confirmEksporGenerus` · `downloadXlsxFromBase64_` · `printPdfList_`
- Datepicker: `toggleDatePicker` · `renderDatePicker` · `pickDate` (ada hook umur di sini)
- Util: `escapeHtmlExport_` · `digitsOnlyInput_` · `formatPhoneDashInput_` · `calcUsiaThn_` · `buildDetailItemHtml_` · ikon: `iconViewSvg_`/`iconEditSvg_`/`iconDeleteSvg_` (⚠️ dilarang ada `//` dalam string — ERROR_LOG #1)

## Alur deploy & verifikasi (baku)

```
node tools/check_local.js          # 1. cek lokal
git add <file> && git commit && git push   # 2. auto-deploy via GitHub Actions
gh run watch <id> --exit-status    # 3. tunggu deploy sukses
node tools/verify_served.js        # 4. WAJIB: validasi output server
```
