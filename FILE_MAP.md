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
| `13_AppsScript/Setup_Database.gs` | Skema semua sheet + `migrateGuruSchemaAddFields_` + `migrateSantriSchemaAddFields_` + `migrateJadwalKbmSchemaAddFields_` (⚠️ perlu run manual `setupDatabaseStructure()` di editor Apps Script tiap tambah kolom/sheet) — **BELUM DIJALANKAN untuk `kecamatan`/`lama_mengajar` (2026-07-18), `santri_count`/`status` di jadwal_kbm (2026-07-24), `mulai_ngaji` di santri (2026-07-24), & sheet baru `siklus_generus`/`pengurus_kelp` (2026-07-25)** | Perubahan skema |
| `13_AppsScript/Modul_MaintainGuru.gs` | CRUD guru (`serverGetGuruList/Add/Update/Delete`) | Fitur guru |
| `13_AppsScript/Modul_MaintainSantri.gs` | CRUD santri/generus + `serverBulkImportSantri` | Fitur generus |
| `13_AppsScript/Modul_Export.gs` | Ekspor xlsx asli via `Utilities.zip` (`serverExportGuruKelpXlsx`, `serverExportSantriKelpXlsx`, `buildXlsxBase64_`) | Fitur ekspor |
| `13_AppsScript/Modul_MaintainJadwalKBM.gs` / `Modul_MaintainPengumuman.gs` | CRUD Jadwal KBM & Pengumuman (Dashboard Kelompok) — "Kelas Pengajian" = Jadwal KBM diperkuat (santri_count, status Aktif/Tidak Aktif, KPI ringkasan `jkKpi*`, toolbar filter `#jadwalKbmSearchInput/FilterGuru/FilterStatus`, deteksi bentrok guru `cekKonflikJadwalGuru_`) | — |
| `13_AppsScript/Modul_MaintainSiklusGenerus.gs` | CRUD Siklus Generus (Data Master, sheet baru `siklus_generus`) — riwayat fase generus (Kerja/Kuliah/Pindah/Mondok/Tugas/Tidak Aktif), terikat `santri_id` existing (bukan bikin generus baru), `JENIS_SIKLUS_GENERUS_` | Fitur Siklus Generus |
| `13_AppsScript/Modul_MaintainPengurus.gs` | Simpan Data Pengurus (Data Master, sheet baru `pengurus_kelp`, DI ATAS Data Guru) — 9 jabatan tetap (`JABATAN_PENGURUS_`, disebut "Dapukan" di UI). Default 1 orang per jabatan (UPSERT via jabatan match saat `data.id` kosong), KECUALI `MULTI_HOLDER_JABATAN_` (`Wk Pembina Generus Kelp`) yang boleh >1 orang — selalu baris baru saat tambah, edit HARUS kirim `data.id` biar update baris yg tepat (bukan match by jabatan lagi). Nama BEBAS diketik (saran datalist dari nama ortu generus + generus jenjang Remaja), field `mulai_dapukan` → "Lama Dapukan" via `calcDurasiDetail_` | Fitur Data Pengurus |
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
- `.gk-topright` — panel fixed kanan atas: tombol refresh (`.gk-refresh-btn`) + `.dash-header-admin-card` (teks "Admin" saja)
- `.gk-toast` — notifikasi singkat (dipakai setelah Refresh)
- `.gk-kpi-lp` — mini-stat L/P di SEBELAH angka besar KPI (bukan di bawah)
- `.sidebar-icon` — icon SVG line monochrome sidebar (⚠️ JANGAN pakai emoji, lihat memory design standard)
- `.sidebar-footer` — freeze/sticky bottom untuk tombol Keluar
- `.screen-wrapper.active > .dash-header + *` — ⚠️ blok konten inilah yang menggulir (header TIDAK ikut scroll) supaya scrollbar mulai di bawah header; `.dash-container` di-set full-width + padding auto agar scrollbar tetap di pojok saat sidebar diciutkan
- `CUSTOM DATE PICKER` — datepicker tanpa library
- `MODAL TAMBAH GURU / GENERUS` — layout form 2 kolom + section
- `TABEL DAFTAR GURU` — toolbar filter/search, badge, tombol aksi
- `.gk-table-scroll` — kontainer scroll tabel (max-height ≈5 baris) + `.gk-sticky-l1/l2/r` = freeze kolom No/Nama (kiri) & Aksi (kanan)
- `.gk-colpicker-*` — dropdown "Kolom" (pilih grup kolom yang tampil)
- `MODAL KONFIRMASI HAPUS` — modal hapus premium (spinner sekarang di `#globalLoadingOverlay`, bukan di tombol)
- `MODAL DETAIL GURU/GENERUS` — modal detail read-only
- `MOBILE OPTIMIZATION` — semua breakpoint responsive

### HTML → `13_AppsScript/Markup_Screens.html` (screens & modals)
- `id="screenLogin"` · `id="appLayout"` · `id="screenGuruDashboard"` (Dashboard Kelompok)
- `id="globalLoadingOverlay"` — spinner global, kontrol via JS di bawah
- Panel kanan atas GLOBAL (di `.app-content`, tampil di semua screen): `class="gk-topright"` → tombol refresh + card "Admin". Tidak ada lagi avatar/nama/role.
- `id="gkToast"` — elemen notifikasi singkat
- `<datalist id="dlNama|dlNamaOrtu|dlTempatLahir|dlKelurahan|dlKecamatan|dlKabupaten|dlProvinsi|dlKodePos">` — sumber autocomplete, diisi `populateAutocomplete_()`
- Header seksi: `id="dataGuruTitle"` · `id="dataGenerusTitle"`
- Tabel: `id="guruDashTableWrapper"` · `id="santriDashTableWrapper"` (⚠️ tabel generus letaknya SETELAH `id="generusJenjangRow"` = 5 kartu jenjang). `<thead>` KOSONG di markup (`id="guruDashTableHead"`/`santriDashTableHead`) — diisi JS dari model kolom.
- Modal (semua `id="modal..."`): `modalGuruKelp` (tambah/edit guru) ·
  `modalGenerusKelp` · `modalDeleteGuruKelp` · `modalDeleteGenerusKelp` ·
  `modalDetailGuruKelp` · `modalDetailGenerusKelp` · `modalEksporGuru` ·
  `modalEksporGenerus`

### JavaScript → `13_AppsScript/Script_Main.html` (blok `<script>` utama; cari `window.<nama>`)
- Boot & auth: `window.onload` → `serverCheckDevMode` → `renderApp` · `handleLogin` · `verifySession`
- Spinner global (WAJIB dipakai untuk semua momen tunggu baru, jangan buat spinner lokal): `showGlobalLoading_(text)` / `hideGlobalLoading_()`
- Dashboard Kelompok load: `loadKelompokDashboard(kelompokId, nama, onDone, forceFresh)` → `loadKelompokDashboardGuru_` · `loadKelompokDashboardSantriKelas_` (keduanya terima `(id, onDone, forceFresh)`) · `loadKelompokDashboardAbsen_`
- KPI (dipakai loader server DAN update lokal instan): `renderGuruKpis_` · `renderSantriKpis_` · `applyGuruMutationLocal_` · `applyGenerusMutationLocal_`
- **Model kolom tabel** (satu sumber untuk tampilan + ekspor): `GURU_COLS` · `SANTRI_COLS` (tiap kolom `{key,label,group,sticky,center,action,val,html}`), grup tampil: `guruVisibleGroups` · `generusVisibleGroups`
- Render tabel generik: `renderDataTable_(cols, list, theadId, tbodyId, emptyText)` · `visibleCols_` · `colStickyClass_` · `filterListByScopeSearch_`
- Column picker: `toggleColPicker_` · `setColGroup_`
- Tabel guru: `toggleGuruDashTable_` · `filterGuruDashTable_` · `renderGuruDashTable_`
- Tabel generus: `toggleGenerusDashTable_` · `filterSantriDashTable_` · `renderSantriDashTable_`
- Siklus Generus (Data Master, sheet `siklus_generus`, generus existing via nama+`dlSiklusGenerusNama`): `loadSiklusGenerusList_` · `toggleSiklusGenerusDashTable_` · `filterSiklusGenerusDashTable_` · `renderSiklusGenerusDashTable_` · `renderSiklusGenerusKpis_` · `openModalSiklusGenerus`/`editSiklusGenerus`/`saveSiklusGenerus`/`deleteSiklusGenerus` · `confirmEksporSiklusGenerus`.
- Pendidikan Formal (Data Master, TIDAK ADA sheet baru — cuma pakai field `pendidikan` yang sudah ada di sheet `santri`, lewat `serverUpdateSantri`): `renderPendidikanFormalKpis_` (5 kartu PAUD-TK/SD/SMP/SMA/Kuliah + L/P via `gk-kpi-lp`) · `togglePendidikanFormalDashTable_` · `renderPendidikanFormalDashTable_` · `openModalPendidikanFormal`/`editPendidikanFormal`/`savePendidikanFormal` · `confirmEksporPendidikanFormal`. Opsi dropdown pendidikan `generusKelpPendidikan` (modal Tambah/Edit Generus) ditambah `Kuliah` supaya tidak mismatch dgn field ini.
- Data Pengurus (Data Master, sheet baru `pengurus_kelp`, DI ATAS Data Guru — bukan pilih generus existing, nama bebas diketik, saran via `dlPengurusNama`): `loadPengurusList_` · `togglePengurusDashTable_` · `renderPengurusDashTable_` (kolom Dapukan/Nama/Mulai Dapukan/Lama Dapukan/Keterangan/Aksi) · `renderPengurusKpis_` (isi tiap kartu jabatan dari `PENGURUS_JABATAN_MAP_`; dapukan di `MULTI_HOLDER_JABATAN_` gabung semua nama dipisah koma) · `populatePengurusNamaDatalist_` · `updatePengurusLama_` (badge "Lama Dapukan", pola sama `updateGuruKelpLama`) · `openModalPengurus`/`editPengurus`/`savePengurus` (kirim `id` eksplisit ke server — WAJIB utk dapukan multi-holder spy tidak salah sasaran baris)/`deletePengurus`/`deletePengurusFromModal_` (tombol Hapus di footer form, tampil hanya mode edit) · `viewPengurus`/`closeModalDetailPengurus` (modal detail, "Lama Dapukan" otomatis) · `confirmEksporPengurus`.
- **Struktur Pengurus** (bagan CSS-only, tombol di toolbar Daftar Pengurus): `openModalStrukturPengurus`/`closeModalStrukturPengurus`/`buildStrukturPengurusChartHtml_` (bangun HTML chart, dipakai layar & PDF)/`renderStrukturPengurusChart_` (render ke layar + panggil fit)/`fitStrukturPengurusChart_` (skalakan via `transform:scale` biar SELALU utuh 1 layar tanpa scroll, diukur via `scrollWidth/clientWidth`, re-fit saat window resize)/`strukturNodeHtml_` (kotak polos)/`strukturColHtml_` (kolom + kaki garis, HANYA dipakai di dalam `.struktur-branch-row`). Hierarki: Pembina Generus → Wk Pembina Generus (1-4 kotak sejajar, dapukan multi-holder) → PJP Kelp → Kepsek/Pembina Pra Remaja/Pembina Remaja[→ Ketua Muda-Mudi bertumpuk di kolom yg sama]/Sekretaris/Bendahara. Garis horizontal `.struktur-branch-row::before` inset kiri/kanan 86px (=setengah lebar `.struktur-node` 172px) → presisi mulai/berakhir di titik tengah kotak pertama/terakhir. Tombol "Unduh" di header modal → `openModalDownloadStrukturPengurus` (pilih kertas A4/Folio) → `printStrukturPengurusPdf_` (dokumen cetak terpisah, landscape, footer kiri credit app + logo `.brand-mark`, footer kanan "Waktu Unduh" tanggal+jam). Judul dinamis via `strukturPengurusTitleText_()` ("Struktur Pengurus Generus Kelompok <nama> <tahun berjalan>"), dipakai di judul modal (`#strukturPengurusTitle`) & PDF. Baris Wk Pembina Generus pakai class `.struktur-branch-row.converge-below` (garis horizontal DI BAWAH juga, bukan cuma di atas) supaya turunan ke PJP Kelp jelas nyambung ke "batang" Wk Pembina. ⚠️ Garis horizontal baris (`.struktur-branch-line`) TIDAK LAGI dihitung via CSS inset 86px (pernah meleset, berhenti sebelum kotak terakhir pada baris 5-kotak) — sekarang diukur NYATA oleh `drawStrukturBranchLines_(root)` (getBoundingClientRect kolom pertama/terakhir) lalu digambar sbg elemen `<div class="struktur-branch-line">` sungguhan, dipanggil SETELAH innerHTML disisipkan SEBELUM `fitStrukturPengurusChart_`. PDF (`printStrukturPengurusPdf_`) punya salinan logic pengukuran yg sama inline (window terpisah, tidak bisa akses fungsi window utama). Segmen Wk Pembina→PJP Kelp sekarang bercabang berupa SIKU (elbow, dipilih user dari 3 opsi visual): `drawWkPembinaElbow_(root)` menggambar turun dari kotak Wk Pembina yg NAMANYA COCOK dgn PJP Kelp (dicocokkan via `.struktur-node-name` text, fallback ke kolom pertama kalau tidak ada yg cocok — BUKAN asal kolom pertama, supaya tidak tergantung urutan data) → belok mendatar → turun lagi tepat di sumbu-tengah menuju `.struktur-connector` polos ke PJP Kelp (kalau cuma 1 kotak/tidak ada yg cocok namanya kebetulan sudah segaris tengah, otomatis jadi garis lurus tanpa siku). Elemen garis siku: `.struktur-elbow-line`/`.struktur-elbow-vline`/`.struktur-elbow-hline`. PDF (`printStrukturPengurusPdf_`) punya salinan logic yg sama persis.
- `setDataMasterFocus_` (Script_Main.html) generik lewat `window.DATA_MASTER_SECTIONS_` (pengurus/guru/generus/pendidikan/siklus) — buka Daftar salah satu section otomatis sembunyikan section lainnya.
- Autocomplete: `fillDatalist_` · `populateAutocomplete_` (dipanggil tiap modal guru/generus dibuka)
- Refresh: `hardRefresh_` (⚠️ DILARANG `location.reload()` — ERROR_LOG #6; pakai `forceFresh` menembus cache) · `SCREEN_LOADERS_` · `showToast_`
- CRUD guru (klien): `openModalGuruKelp` · `saveGuruKelp` (add/update via `currentEditGuruId`) · `editGuruKelp` · `viewGuruKelp` · `deleteGuruKelp` → `confirmDeleteGuruKelp`
- CRUD generus (klien): pola sama, ganti `Guru`→`Generus` (`currentEditGenerusId`, dst)
- Ekspor (mengikuti kolom yang dipilih di column picker): `confirmEksporGuru` · `confirmEksporGenerus` · `exportColsForData_` · `buildExportMatrix_` · `runXlsxExport_` → server `serverBuildXlsxFromData(token, sheetName, headers, rows)` · `downloadXlsxFromBase64_` · `printPdfList_`
- Datepicker: `toggleDatePicker` · `renderDatePicker` · `pickDate` (hook umur & lama mengajar di sini → `updateGuruKelpUmur` / `updateGuruKelpLama`)
- Util: `escapeHtmlExport_` · `digitsOnlyInput_` · `formatPhoneDashInput_` · `buildDetailItemHtml_` · ikon: `iconViewSvg_`/`iconEditSvg_`/`iconDeleteSvg_` (⚠️ dilarang ada `//` dalam string — ERROR_LOG #1)
- **Tanggal — WAJIB lewat `parseDateFlexible_`**: tanggal dari Sheet bisa datang sbg objek Date → string ISO, jadi JANGAN pernah `dateStr + 'T00:00:00'` (dulu bikin "NaN undefined"). Turunannya: `calcUsiaThn_` (usia) · `formatTanggalDisplay_` · `calcDurasiDetail_` ("X tahun Y bulan Z hari", dipakai Lama Mengajar)

## Alur deploy & verifikasi (baku)

```
node tools/check_local.js          # 1. cek lokal
git add <file> && git commit && git push   # 2. auto-deploy via GitHub Actions
gh run watch <id> --exit-status    # 3. tunggu deploy sukses
node tools/verify_served.js        # 4. WAJIB: validasi output server
```
