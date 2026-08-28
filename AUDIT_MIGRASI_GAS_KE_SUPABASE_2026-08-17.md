# Audit Migrasi GAS → Supabase + Next.js

> **Tanggal audit:** 2026-08-17
> **Project produksi:** `fnhqtkqswxsqmjxynldg` (ruang-ngaji-dev)
> **Metode:** baca file langsung (`13_AppsScript/`, `frontend/`) + query langsung
> ke Postgres produksi lewat Management API. Nol asumsi dari ingatan sesi lalu.
> **Sifat:** read-only — tidak ada file yang diubah, tidak ada SQL mutasi.
>
> **Tujuan akhir yang diaudit:** aplikasi murni Supabase, tanpa ketergantungan
> apa pun ke Google Sheets / Firestore untuk data maupun fitur berjalan.

---

## Ringkasan angka

| | |
|---|---|
| Modul GAS | 28 file, 11.536 baris |
| Fungsi server-side (`function server*`) | **163** |
| Halaman Next.js | 7 (1 di antaranya masih boilerplate) |
| Komponen Next.js | 7 |
| Total kode Next.js | 2.025 baris |
| Tabel Supabase produksi | 37 (13 berisi, **24 kosong**) |
| Perkiraan fungsi server yang belum punya padanan | **±135 dari 163** |

### Modul deprecated: TIDAK ADA

Grep `DEPRECATED / OBSOLETE / legacy / tidak dipakai lagi / usang` di seluruh
`*.gs` + `Code.js` menghasilkan 4 hit, seluruhnya komentar tentang perilaku
fungsi tertentu — **bukan** penandaan modul mati. Jadi ke-28 modul dihitung aktif
dan tidak ada yang boleh dicoret dari hitungan "belum dimigrasikan".

### Lima file infrastruktur (bukan fitur user)

Punya 0 fungsi server, tidak perlu dimigrasikan sebagai halaman:

| File | Baris | Peran |
|---|---|---|
| `Modul_FirestoreMigration.gs` | 643 | perkakas migrasi Sheets→Firestore |
| `Modul_Utilities.gs` | 634 | auth, RBAC, saklar sumber data, cache |
| `Modul_FirestoreBridge.gs` | 422 | REST client Firestore |
| `Modul_SeedData.gs` | 417 | data demo |
| `Setup_Database.gs` | 376 | skema + migrasi sheet |

---

## BAGIAN 1 — Inventarisasi fungsi server app lama

### Saklar sumber data (sumber kebenaran tunggal)

`FIRESTORE_KELOMPOK_TABLES_` — `13_AppsScript/Modul_Utilities.gs:72-78`:

```js
santri:               ['1']   // Kelp Petemon
guru:                 ['1']
jadwal_kbm:           ['1']
jadwal_kategori_hari: ['1']
absensi:              ['1']
```

Artinya: **hanya kelompok 1 (Petemon) yang di Firestore**; kelompok 2-18 masih
100% Sheets untuk kelima tabel itu.

Saklar flat/mirror `FIRESTORE_TABLES_` di `Modul_Utilities.gs:58` **KOSONG (`[]`)** —
tidak ada tabel PPG-wide yang pindah lewat mekanisme itu.

Tiga modul **selalu Firestore untuk SEMUA kelompok**, tanpa gate, karena fitur
baru yang tidak punya data lama:

| Modul | Path Firestore | Acuan |
|---|---|---|
| `Modul_Jurnal.gs` | `kelompok/{id}/jurnal_kbm` | baris 6-7 |
| `Modul_KopSurat.gs` | `kelompok/{id}/kop_surat/{kategori}` | baris 8-9 |
| `Modul_MaintainPengumuman.gs` | `kelompok/{id}/pengumuman` | baris 7-13 |

### 1a. Modul HYBRID (Sheets kelompok 2-18 + Firestore kelompok 1)

#### Modul_InputAbsen.gs — 1.652 baris, 21 fungsi
Tabel: santri, guru, jadwal_kbm, jadwal_kategori_hari, absensi, absensi_sesi,
akses_kelas_request, guru_izin.

| Fungsi | Baris | Jenis |
|---|---|---|
| `serverGetInputAbsenMeta` | 321 | data |
| `serverGetKelasAbsenList` | 351 | data |
| `serverGetAbsensiKelasForm` | 437 | data |
| `serverSaveAbsensiKelas` | 863 | CRUD (tulis) |
| `serverListKelasUntukPermintaan` | 931 | data |
| `serverRequestAksesKelas` | 959 | CRUD |
| `serverGetIncomingAksesRequests` | 1005 | data |
| `serverGetMyAksesRequests` | 1026 | data |
| `serverRespondAksesRequest` | 1043 | CRUD |
| `serverGetGuruDashboardSummary` | 1076 | agregat |
| `serverGetGuruDashboardSummaryRange` | 1122 | agregat |
| `serverGetAdminKelpDashboardSummaryRange` | 1189 | agregat |
| `serverGetAdminKelpKpiSummary` | 1251 | agregat |
| `serverGetInputAbsenKelompokOptionsAdmin` | 1331 | data |
| `serverGetKelasAbsenListAdmin` | 1377 | data |
| `serverGetAbsensiKelasFormAdmin` | 1415 | data |
| `serverSaveAbsensiKelasAdmin` | 1447 | CRUD |
| `serverGetGuruIzinAlasanSuggestions` | 1489 | data |
| `serverGetGuruIzinCountBulanIni` | 1515 | agregat |
| `serverSubmitGuruIzin` | 1533 | CRUD |
| `serverGetRiwayatKehadiranGuru` | 1592 | agregat |

#### Modul_MaintainSantri.gs — 431 baris, 6 fungsi (tabel `santri`)
`serverGetNextGenerusNis`:32, `serverGetSantriList`:54, `serverAddSantri`:86,
`serverUpdateSantri`:183, `serverDeleteSantri`:245, `serverBulkImportSantri`:294.
Seluruhnya CRUD.

#### Modul_MaintainGuru.gs — 250 baris, 5 fungsi (tabel `guru`)
`serverGetGuruList`:28, `serverAddGuru`:60, `serverUpdateGuru`:140,
`serverDeleteGuru`:194, `serverGetGuruSummary`:232 (agregat).

#### Modul_MaintainAbsensi.gs — 490 baris, 6 fungsi (tabel `absensi`, `santri`)
`serverGetAbsensiForm`:28, `serverSaveAbsensiDaily`:84,
`serverSetAbsensiSatuSantri`:190, `serverBulkImportAbsensi`:302,
`serverGetAbsensiSummary`:383 (agregat), `serverGetSantriBerisiko`:422 (agregat).

#### Modul_MaintainJadwalKBM.gs — 348 baris, 6 fungsi
`serverGetJadwalKBM`:52, `serverCreateJadwalKBM`:98, `serverUpdateJadwalKBM`:187,
`serverDeleteJadwalKBM`:244, `serverGetJadwalKategoriHari`:276,
`serverSaveJadwalKategoriHari`:297.

### 1b. Modul FIRESTORE murni (semua kelompok)

| Modul | Baris | Fungsi (baris) |
|---|---|---|
| Modul_Jurnal.gs | 287 | `serverGetJurnalKelasList`:96, `serverGetJurnalKelasOnly`:126, `serverGetJurnalRiwayat`:138, `serverGetJurnalForm`:163, `serverSaveJurnal`:184, `serverGetJurnalListKelompok`:212, `serverSaveJurnalAdmin`:252, `serverDeleteJurnalAdmin`:277 |
| Modul_MaintainPengumuman.gs | 149 | `serverGetPengumuman`:29, `serverCreatePengumuman`:47, `serverUpdatePengumuman`:96, `serverDeletePengumuman`:128 |
| Modul_KopSurat.gs | 103 | `serverGetKopSurat`:40, `serverSaveKopSurat`:65 |

### 1c. Modul SHEETS murni

| Modul | Baris | Fn | Fungsi (baris) | Sheet |
|---|---|---|---|---|
| Modul_MaintainKurikulum.gs | 814 | 19 | `serverGetKurikulumFullTree`:26, `serverGetProta`:83, `serverGetKurikulumKelasGuru`:146, `serverAddProta`:195, `serverUpdateProtaSemesters`:294, `serverDeleteProta`:341, `serverReorderProta`:383, `serverGetPromes`:419, `serverAddPromes`:445, `serverUpdatePromes`:484, `serverDeletePromes`:511, `serverGetProbul`:538, `serverGetProbulByPromes`:568, `serverAddProbul`:596, `serverUpdateProbul`:637, `serverDeleteProbul`:671, `serverSetProbulBulan`:707, `serverGetPencapaianSantri`:761, `serverUpdatePencapaianSantri`:784 | kurikulum_prota/promes/probul/pencapaian |
| Modul_MaintainMunaqosah.gs | 661 | 9 | `serverGetPeriodeMunaqosah`:15, `serverGetMunaqosahList`:40, `serverGetMunaqosahDetail`:126, `serverCreateMunaqosah`:151, `serverUpdateMunaqosah`:215, `serverDeleteMunaqosah`:260, `serverGetSantriTeladan`:287, `serverGetMunaqosahStats`:348, `serverGenerateSoalReport`:411 (PDF) | munaqosah, periode_munaqosah |
| Modul_MaintainKonseling.gs | 463 | 8 | `serverGetKonselingList`:20, `serverGetKonselingDetail`:104, `serverCreateKonseling`:141, `serverUpdateKonseling`:210, `serverDeleteKonseling`:250, `serverGetKonselingBySantri`:274, `serverGetKonselingStats`:315, `serverBulkImportKonseling`:385 | konseling |
| Modul_UserManagement.gs | 387 | 9 | `serverGetUsersList`:13, `serverGetUserById`:48, `serverGetGuruOptionsForUser`:88, `serverCreateUser`:108, `serverUpdateUser`:189, `serverDeleteUser`:248, `serverChangePassword`:275, `serverResetPassword`:311, `serverToggleUserStatus`:362 | users |
| Modul_Statistics.gs | 357 | 7 | `serverGetAttendanceTrend`:12, `serverGetAttendanceByKelompok`:76, `serverGetSantriDemographics`:135, `serverGetTopAttendees`:180, `serverGetWorstAttendees`:238, `serverGetGrowthMetrics`:296, `serverGetKelompokRanking`:347 — semua agregat | absensi, santri, guru |
| Modul_Monitoring.gs | 327 | 4 | `serverGetMonitoringGenerus`:45, `serverGetKehadiranGenerusKategori`:146, `serverGetKehadiranGenerusDetailList`:245, `serverGetKehadiranGenerusMatrix`:282 — agregat | absensi, santri |
| Modul_Dashboard.gs | 313 | 4 | `serverGetDashboardBundle`:33, `serverGetKehadiranChart7Hari`:164, `serverGetDashboardSantriTeladan`:229, `serverGetSidebarTree`:285 — agregat | banyak |
| Modul_Laporan.gs | 311 | 5 | `serverExportSantri`:9, `serverExportGuru`:36, `serverExportAbsensiMonthly`:63, `serverGetAbsensiSummary`:119, `serverGetLaporanPerkembanganSantri`:185 (PDF) | santri, guru, absensi |
| Modul_MaintainKalender.gs | 251 | 6 | `serverGetCalendarEvents`:18, `serverGetCalendarEventDetail`:62, `serverCreateCalendarEvent`:88, `serverUpdateCalendarEvent`:136, `serverDeleteCalendarEvent`:178, `serverGetCalendarEventSummary`:204 | calendar_events |
| Modul_MaintainPustakUnduhan.gs | 231 | 6 | `serverGetFilesList`:18, `serverGetFileCategories`:76, `serverCreateFile`:106, `serverDeleteFile`:155, `serverIncrementFileDownloadCount`:181, `serverGetFileStats`:205 | files |
| Modul_MaintainSiklusGenerus.gs | 165 | 4 | `serverGetSiklusGenerusList`:18, `serverCreateSiklusGenerus`:48, `serverUpdateSiklusGenerus`:99, `serverDeleteSiklusGenerus`:145 | siklus_generus |
| Modul_MaintainPengurus.gs | 153 | 3 | `serverGetPengurusList`:35, `serverSavePengurus`:66, `serverDeletePengurus`:133 | pengurus_kelp |
| Modul_Export.gs | 106 | 1 | `serverBuildXlsxFromData`:13 (XLSX) | — |
| Modul_QuoteHarian.gs | 90 | 4 | `serverGetQuoteHariIni`:26, `serverGetQuoteList`:45, `serverAddQuote`:57, `serverDeleteQuote`:79 | quote_harian |
| Code.js (auth) | 705 | 10 | `serverCheckDevMode`:311, `serverLogin`:349, `serverLoginWithRememberToken`:414, `serverRegisterGuru`:466, `serverGetOnboardingKelompokOptions`:515, `serverCompleteOnboardingGuru`:559, `serverCompleteOnboardingAdminKelompok`:606, `serverResetPasswordSelfGuru`:648, `serverGetSession`:684, `serverLogout`:697 | users, remember_tokens, guru |

---

## BAGIAN 2 — Inventarisasi Next.js

| File | Fungsi | Query Supabase | Padanan GAS |
|---|---|---|---|
| `app/page.tsx` | **Boilerplate `create-next-app`** — masih logo Next.js/Vercel dan teks "To get started, edit page.tsx" | tidak ada | tidak ada (bukan fitur) |
| `app/auth/login/page.tsx` | Form login | via `lib/auth-context` | `Code.js:349` `serverLogin` — **mekanisme beda**: Supabase Auth vs SHA-256 custom |
| `app/dashboard/page.tsx` | Bercabang per role: `guru` → GuruDashboard, selain itu → AdminDashboard (kartu identitas + 2 kartu navigasi + 3 komponen) | tidak ada langsung | `Modul_Dashboard.gs:33` `serverGetDashboardBundle` — **jauh lebih tipis**, tanpa KPI/sidebar tree |
| `app/absensi/page.tsx` | Input absensi per kelompok + tanggal | SELECT `kelompok`, `santri`, `absensi`; INSERT + UPSERT `absensi` | `Modul_MaintainAbsensi.gs:84` `serverSaveAbsensiDaily` — **beda scope**, lihat Bagian 3 |
| `app/kelas/page.tsx` | Daftar kelas (baca saja) | SELECT `kelas` + join `kategori_kbm`, `guru` | **tidak ada padanan** — `kelas` entitas baru |
| `app/reports/page.tsx` | Shell 2 tab laporan | tidak ada | `Modul_Laporan.gs` |
| `components/dashboard/GuruDashboard.tsx` | Hero + daftar kelas yang diampu guru | SELECT `kelas` WHERE `guru_id` | `Modul_InputAbsen.gs:1076` `serverGetGuruDashboardSummary` — **statistik kehadiran belum ada** (sengaja ditunda) |
| `components/SantriList.tsx` | Daftar santri | SELECT `santri` (id, nama, kelompok_id) | `Modul_MaintainSantri.gs:54` — **baca saja, nol CRUD** |
| `components/GuruList.tsx` | Daftar guru | SELECT `guru` (id, nama, kategori) | `Modul_MaintainGuru.gs:28` — **baca saja** |
| `components/AbsensiChart.tsx` | Grafik status absensi | SELECT `absensi` (id, status) | `Modul_Statistics.gs:12` — **jauh lebih sederhana** |
| `components/AttendanceSummaryReport.tsx` | Ringkasan kehadiran per kelompok, paginasi 1000 | SELECT `absensi` | `Modul_Laporan.gs:119` `serverGetAbsensiSummary` |
| `components/SantriProgressReport.tsx` | Laporan perkembangan santri | SELECT `absensi`, `santri` | `Modul_Laporan.gs:185` — **tanpa PDF & kop surat** |
| `components/RequireAuth.tsx` | Proteksi rute sisi klien | — | — |
| `lib/auth-context.tsx` | Sesi + profil | SELECT `profiles`; `auth.signInWithPassword`, `auth.signOut` | `Code.js:349/684/697` |

**Tabel Supabase yang disentuh frontend: 7** — `profiles`, `kelompok`, `santri`,
`guru`, `absensi`, `kelas`, `kategori_kbm`.
Dari 37 tabel produksi, **30 tabel belum disentuh kode frontend sama sekali**.

---

## BAGIAN 3 — Pencocokan per modul

| Modul GAS | Baris | Status | Detail |
|---|---|---|---|
| Modul_InputAbsen.gs | 1652 | **SEBAGIAN** | Ada: daftar kelas guru (GuruDashboard). Belum: 20 dari 21 fungsi — simpan absen per kelas, `absensi_sesi` version-check, akses_kelas_request (3 fn), guru_izin (3 fn), semua dashboard summary/KPI, jalur admin (4 fn), riwayat kehadiran guru |
| Modul_MaintainKurikulum.gs | 814 | **BELUM** | 19 fungsi, nol padanan |
| Code.js (auth/onboarding) | 705 | **SEBAGIAN** | Ada: login, logout, sesi (mekanisme diganti Supabase Auth). Belum: register guru, 3 fungsi onboarding wizard, remember-me token, reset password mandiri, dev-mode |
| Modul_MaintainMunaqosah.gs | 661 | **BELUM** | 9 fungsi, nol padanan |
| Modul_MaintainAbsensi.gs | 490 | **SEBAGIAN** | Ada: input + simpan absensi harian. **Perbedaan scope penting:** Next.js menyimpan per **kelompok** untuk seluruh santri; GAS menyimpan per **kelas** dengan pengecekan konkurensi. Belum: set 1 santri, bulk import, santri berisiko |
| Modul_MaintainKonseling.gs | 463 | **BELUM** | 8 fungsi, nol padanan |
| Modul_MaintainSantri.gs | 431 | **SEBAGIAN** | Ada: baca daftar (3 kolom). Belum: Add/Update/Delete/BulkImport/NextNis — **tidak ada satu pun operasi tulis** |
| Modul_UserManagement.gs | 387 | **BELUM** | 9 fungsi. Mungkin sengaja digantikan dashboard Supabase — lihat catatan di bawah |
| Modul_Statistics.gs | 357 | **SEBAGIAN** | Ada: 1 grafik status sederhana. Belum: 6 dari 7 — trend, per kelompok, demografi, top/worst, growth, ranking |
| Modul_MaintainJadwalKBM.gs | 348 | **BELUM** | 6 fungsi. Tabel `jadwal_kbm` sudah ada isinya (8 baris) tapi tidak ada UI |
| Modul_Monitoring.gs | 327 | **BELUM** | 4 fungsi, nol padanan |
| Modul_Dashboard.gs | 313 | **SEBAGIAN** | Ada: kerangka dashboard bercabang role. Belum: KPI bundle, chart 7 hari, santri teladan, sidebar tree Desa›Kelompok |
| Modul_Laporan.gs | 311 | **SEBAGIAN** | Ada: ringkasan absensi + perkembangan santri (versi HTML). Belum: export CSV santri/guru/absensi bulanan, **PDF + kop surat** |
| Modul_Jurnal.gs | 287 | **BELUM** | 8 fungsi. Tabel + RLS + trigger **selesai 2026-08-17**, UI belum ada |
| Modul_MaintainKalender.gs | 251 | **BELUM** | 6 fungsi. Tabel `calendar_events` ada, 0 baris |
| Modul_MaintainGuru.gs | 250 | **SEBAGIAN** | Ada: baca daftar (3 kolom). Belum: Add/Update/Delete/Summary — **tidak ada operasi tulis** |
| Modul_MaintainPustakUnduhan.gs | 231 | **BELUM** | 6 fungsi. Butuh Supabase Storage |
| Modul_MaintainSiklusGenerus.gs | 165 | **BELUM** | 4 fungsi. Tabel ada, 0 baris |
| Modul_MaintainPengurus.gs | 153 | **BELUM** | 3 fungsi. Tabel ada, 0 baris |
| Modul_MaintainPengumuman.gs | 149 | **BELUM** | 4 fungsi. Tabel ada, 0 baris |
| Modul_Export.gs | 106 | **BELUM** | XLSX builder |
| Modul_KopSurat.gs | 103 | **BELUM** | 2 fungsi. Prasyarat PDF laporan |
| Modul_QuoteHarian.gs | 90 | **BELUM** | 4 fungsi. Tabel ada, 0 baris |

### Yang TIDAK diklaim punya padanan

Halaman `app/kelas/page.tsx` dan tabel `kelas` **tidak punya padanan di app lama**.
`kelas` bukan sheet — di GAS ia hanya kolom teks di `jadwal_kbm`
(`SHEET_NAMES` di `Modul_Utilities.gs:12-37` tidak memuat `kelas`). Jadi `kelas`
adalah **normalisasi baru** yang lahir saat migrasi, bukan migrasi fitur lama.

### TIDAK YAKIN, perlu dicek manual oleh owner

Apakah `Modul_UserManagement.gs` (387 baris, 9 fungsi) masih perlu dimigrasikan
sebagai halaman aplikasi, atau memang sengaja digantikan dashboard Supabase +
tabel `profiles`. Dari kode saja niat ini tidak bisa dipastikan.

---

## BAGIAN 4 — Status data (Sheets/Firestore vs Supabase)

Seluruh angka di bawah = `count(*)` **eksak** dari produksi per 2026-08-17,
bukan estimasi `n_live_tup` dan bukan ingatan sesi sebelumnya.

| Entitas | Sumber app lama | Tabel Supabase | Baris | Cakupan |
|---|---|---|---|---|
| kelompok | Sheets | `kelompok` | **18** | ✅ lengkap |
| desa | Sheets | `desa` | **5** | ✅ lengkap |
| ppg | Sheets | `ppg` | **1** | ✅ |
| santri | Hybrid (Kelp 1 Firestore, 2-18 Sheets) | `santri` | **199** | ⚠️ hanya kelompok 1(69), 6(50), 7(40), 8(40) — **4 dari 18; data 14 kelompok lain belum di-ETL** |
| guru | Hybrid | `guru` | **18** | ⚠️ hanya kelompok 1(6), 6(4), 7(4), 8(4) — **14 kelompok belum di-ETL** |
| absensi | Hybrid | `absensi` | **1.088** | ⚠️ hanya kelompok 1(308), 6(300), 7(240), 8(240); rentang 2026-07-09 s/d 2026-08-16 — **14 kelompok + riwayat sebelum Juli belum di-ETL** |
| jadwal_kbm | Hybrid | `jadwal_kbm` | **8** | ⚠️ **hanya kelompok 1** — 17 kelompok belum di-ETL |
| jadwal_kategori_hari | Hybrid | `jadwal_kategori_hari` | **4** | ⚠️ hanya kelompok 1 |
| kelas | *(tidak ada di app lama)* | `kelas` | **8** | ⚠️ hanya kelompok 1 — entitas baru, perlu dibuat untuk 17 kelompok lain |
| kurikulum prota | Sheets | `kurikulum_prota` | **94** | ✅ ada isi |
| kurikulum promes | Sheets | `kurikulum_promes` | **186** | ✅ ada isi |
| kurikulum probul | Sheets | `kurikulum_probul` | **163** | ✅ ada isi |
| kategori_kbm | *(baru)* | `kategori_kbm` | **15** | ✅ |
| users / profiles | Sheets `users` | `profiles` | **5** | ⚠️ 5 akun uji; app lama punya akun per guru |
| **jurnal_kbm** | Firestore (semua kelompok) | `jurnal_kbm` | **0** | ❌ belum ETL, belum ada UI |
| pengumuman | Firestore | `pengumuman` | **0** | ❌ kosong |
| kop_surat | Firestore | `kop_surat`, `kop_surat_baris` | **0** | ❌ kosong |
| konseling | Sheets | `konseling` | **0** | ❌ kosong |
| munaqosah | Sheets | `munaqosah`, `periode_munaqosah` | **0** | ❌ kosong |
| calendar_events | Sheets | `calendar_events` | **0** | ❌ kosong |
| files | Sheets | `files` | **0** | ❌ kosong |
| siklus_generus | Sheets | `siklus_generus` | **0** | ❌ kosong |
| pengurus_kelp | Sheets | `pengurus_kelp` | **0** | ❌ kosong |
| quote_harian | Sheets | `quote_harian` | **0** | ❌ kosong |
| guru_izin | Hybrid | `guru_izin` | **0** | ❌ kosong |
| akses_kelas_request | Hybrid | `akses_kelas_request` | **0** | ❌ kosong |
| riwayat_jenjang | Sheets | `riwayat_jenjang` | **0** | ❌ kosong |
| kurikulum_akhlaq | Sheets | `kurikulum_akhlaq` | **0** | ❌ kosong |
| audit_log | Sheets | `audit_log` | **0** | ❌ kosong |
| remember_tokens | Sheets | *(tidak ada tabel)* | — | ❌ tidak ada padanan |

Enam tabel Supabase tanpa asal-usul di app lama dan masih kosong:
`hari`, `jabatan_pengurus`, `kategori_pengumuman`, `jadwal_kategori_hari_aktif`,
`kurikulum_probul_minggu`, `kurikulum_pencapaian_santri`.

**Kesimpulan data: dari 37 tabel, hanya 13 berisi; 24 kosong.** Tidak ada satu pun
entitas transaksional yang datanya lengkap 18 kelompok — hanya tabel referensi
(kelompok/desa/ppg/kategori_kbm) yang utuh.

---

## Ringkasan akhir — modul yang BELUM ADA SAMA SEKALI

Urut dari kompleksitas terbesar (baris kode sebagai proxy kasar seberapa banyak dipakai):

| # | Modul | Baris | Fn | Catatan |
|---|---|---|---|---|
| 1 | Modul_MaintainKurikulum.gs | 814 | 19 | **Terbesar.** Data prota/promes/probul sudah ada di Supabase (94/186/163 baris) — UI-nya yang belum |
| 2 | Modul_MaintainMunaqosah.gs | 661 | 9 | Termasuk generate PDF soal |
| 3 | Modul_MaintainKonseling.gs | 463 | 8 | |
| 4 | Modul_UserManagement.gs | 387 | 9 | Perlu keputusan: migrasi atau serahkan ke dashboard Supabase |
| 5 | Modul_MaintainJadwalKBM.gs | 348 | 6 | Tabel sudah ada isinya (kelompok 1) |
| 6 | Modul_Monitoring.gs | 327 | 4 | |
| 7 | Modul_Jurnal.gs | 287 | 8 | **Fondasi DB selesai 2026-08-17**, tinggal UI |
| 8 | Modul_MaintainKalender.gs | 251 | 6 | |
| 9 | Modul_MaintainPustakUnduhan.gs | 231 | 6 | Perlu Supabase Storage |
| 10 | Modul_MaintainSiklusGenerus.gs | 165 | 4 | |
| 11 | Modul_MaintainPengurus.gs | 153 | 3 | |
| 12 | Modul_MaintainPengumuman.gs | 149 | 4 | |
| 13 | Modul_Export.gs | 106 | 1 | XLSX |
| 14 | Modul_KopSurat.gs | 103 | 2 | Prasyarat PDF laporan |
| 15 | Modul_QuoteHarian.gs | 90 | 4 | Terkecil |

**Total belum tersentuh: 15 modul, 4.535 baris, 93 fungsi server.**

Ditambah bagian yang belum jadi dari 8 modul berstatus SEBAGIAN — terutama
`Modul_InputAbsen.gs` (20 dari 21 fungsi) dan seluruh operasi tulis santri/guru —
maka **±135 dari 163 fungsi server belum punya padanan** di Next.js.

---

## Tiga hal yang paling menentukan urutan kerja berikutnya

1. **Tidak ada satu pun operasi tulis untuk santri dan guru di Next.js.**
   Selama ini belum ada, penambahan/perubahan data master masih harus lewat app
   GAS — artinya Sheets/Firestore **belum bisa dimatikan** apa pun rencana untuk
   fitur lain.

2. **ETL berhenti di 4 dari 18 kelompok.** `kelas` dan `jadwal_kbm` bahkan hanya
   kelompok 1. Selama ini belum beres, app baru hanya bisa dipakai sebagian
   kelompok, sehingga dua sistem harus jalan berdampingan.

3. **`app/page.tsx` masih boilerplate create-next-app.** Pengunjung root
   aplikasi melihat halaman contoh Next.js, bukan aplikasi Ruang Ngaji.
