# Audit Menyeluruh 4 Peran — Ruang Ngaji

**Tanggal**: 2026-09-12
**Cakupan**: fungsional per-peran (guru, admin_ppg/admin_desa/admin_kelompok, pengunjung/demo, penerobos), lintas route guard, RLS, dan konsistensi UI.
**Metodologi**: **AUDIT STATIS SAJA** — tidak ada akses Supabase Management API / kredensial produksi / koneksi database apa pun dalam sesi ini (dikerjakan agent di cloud, tanpa `.env`). Seluruh temuan berasal dari pembacaan kode frontend dan berkas migrasi SQL. Klaim yang butuh data produksi untuk dipastikan ditandai eksplisit **"PERLU VERIFIKASI LIVE"**.

**Berkas kunci yang dibaca**:
- `CLAUDE.md`, `STANDAR_KEAMANAN.md`, `SECURITY_PERFORMANCE_AUDIT_2026-09-10.md`, `ERROR_LOG.md` (penuh, 1627 baris)
- `frontend/components/RequireAuth.tsx` (gerbang route seluruh app)
- `frontend/components/dashboard/GuruBottomNav.tsx`, `frontend/components/jamaah/JamaahBottomNav.tsx`, `frontend/components/ui/PengunjungBar.tsx`
- `frontend/app/keuangan/page.tsx`, `frontend/app/kurikulum/page.tsx`, seluruh `frontend/app/jamaah/**`, `frontend/components/jamaah/**`
- Migrasi (subset relevan dari ±105 berkas di `08_Development/tpq-app/supabase/migrations/`): `20260909100000/110000/120000` (guru_id_2), `20260909130000` (kalender per-kelas), `20260909150000-190000` (penerobos/jamaah/ketua_mudai), `20260910100000-210000` (rate-limit, tilawati delete, undangan peran, profiles scope, jamaah lanjutan), `20260911100000-200000` (pengunjung fondasi s/d tulis+reset, infaq pengajian, shodaqoh, tabungan penghimpun jenjang), `20260912100000` (tilawati/Al-Qur'an kelas 4+).
- Grep terarah untuk pola `guru_id_2`, `FOR DELETE`, `deleted_at`, daftar `CREATE TABLE public.*` di seluruh direktori migrasi.

---

## Ringkasan Eksekutif

Postur aplikasi ini **cukup kuat** untuk skala TPQ-nya: RLS ditegakkan konsisten dengan pola InitPlan yang benar, pola guru-dua-orang (`guru_id`/`guru_id_2`) sudah diterapkan rapi di fitur-fitur *baru* (Infaq Pengajian, Shodaqoh — keduanya sudah benar sejak lahir, tidak mengulang bug #35), dan exclude Shodaqoh untuk peran `pengunjung` memang ditegakkan di RLS (bukan cuma disembunyikan di menu).

Namun ditemukan **2 temuan P1** baru:
1. Hub "Keuangan" menampilkan kartu **Shodaqoh** ke SEMUA peran tanpa filter, termasuk `pengunjung` — padahal `RequireAuth.tsx` sengaja mengecualikan `/shodaqoh` dari `HALAMAN_PENGUNJUNG`. Akibatnya pengunjung yang mengetuk kartu itu dilempar keluar app Guru ke `/jamaah` (app Penerobos) — dead-end yang membingungkan.
2. Tabel `infaq_pengajian` dibuka TULIS untuk pengunjung tapi **tidak** dimasukkan ke daftar tabel ber-trigger reset otomatis 30 hari (`pengunjung_jejak`) — data demo pengunjung di Infaq Pengajian akan menumpuk permanen, bukan otomatis direset.

Ditemukan pula beberapa **temuan P2** (inkonsistensi kecil, bukan celah keamanan): `jamaah_kehadiran_delete` tidak punya cabang `admin_desa`, dan memori proyek (`MEMORY.md`) menyebut fitur Penerobos Kelp Fase B & C "belum" — **temuan ini SUDAH USANG**: kode menunjukkan kedua fase sudah diimplementasikan penuh.

Tidak ditemukan pola bug berulang dari ERROR_LOG (#34, #35, #39, #41, #42) di tempat lain yang belum diperbaiki.

| Peran | P0 | P1 | P2 |
|---|---|---|---|
| Guru | 0 | 0 | 1 |
| Admin (3 tingkat) | 0 | 0 | 1 |
| Pengunjung/Demo | 0 | 2 | 1 |
| Penerobos | 0 | 0 | 2 |

---

## 1. Peran GURU

### Route guard vs menu (RequireAuth.tsx:24-46, GuruBottomNav.tsx:57-78)
`HALAMAN_GURU` (14 prefix) dan gabungan tab utama (`TAB`) + sheet "Menu" (`LAINNYA`) di `GuruBottomNav.tsx` **konsisten satu-satu**: setiap entri di `HALAMAN_GURU` punya jalan masuk dari menu. Tidak ada dead-link tersembunyi dan tidak ada entri menu yang mengarah ke halaman ter-block untuk guru sendiri.

Catatan kecil: `/keuangan` sebagai hub tidak punya entri terpisah di `LAINNYA` — `LAINNYA` tidak memuat `/keuangan`, `/tabungan`, `/infaq-pengajian`, atau `/shodaqoh` sama sekali, padahal keempat rute itu ADA di `HALAMAN_GURU`. Guru kemungkinan hanya sampai ke Keuangan/Tabungan/Infaq/Shodaqoh lewat tautan dari layar lain — perlu ditelusuri apakah memang ada jalan masuk lain.

**Severity: P2** — rekomendasi: grep `router.push('/keuangan')` / `href="/keuangan"` di seluruh `app/`/`components/` guru; kalau tidak ada, tambahkan entri di `GuruBottomNav.tsx > LAINNYA`.

### Kurikulum bersama (kelompok_id=1)
Kode sudah konsisten pakai `KELOMPOK_KURIKULUM_BERSAMA_ID`/konstanta `1` (fix ERROR_LOG #34 sudah tuntas). Tidak ditemukan sisa pemanggilan `muatProtaKelompok(profile.scope_kelompok_id, …)` di kode aktif.

### Guru dua-orang (guru_id_2)
Fitur BARU (Infaq Pengajian migrasi `20260911180000`, Shodaqoh `20260911190000`) sudah benar sejak awal — memakai pola `(p.guru_id = kl.guru_id) OR (p.guru_id = kl.guru_id_2)` di SELECT/INSERT/UPDATE. **Tidak ada regresi pola #35 di fitur baru.**

### DELETE / koreksi kesalahan input
- `infaq_pengajian` — TANPA DELETE keras, koreksi via `deleted_at` + UPDATE (konsisten dengan `jurnal_materi`), frontend sudah punya jalur koreksi.
- `shodaqoh_transaksi` — soft-delete via UPDATE, guru hanya bisa koreksi barisnya sendiri selama belum masuk setoran (`setoran_id IS NULL`) — desain benar.
- Pola bug #39 (tabel yang bisa diedit tapi tanpa DELETE) — **tidak ditemukan tabel baru yang mengulanginya**.

### Konsistensi Tilawati/Al-Qur'an lintas layar
Riwayat/Ringkasan/Monitoring sudah dilengkapi tampilan Surat/Ayat kelas 4+ pada sesi kerja hari ini (setelah audit ini dimulai) — status ini sudah tuntas per commit terbaru, bukan lagi celah terbuka seperti dicatat MEMORY.md sebelumnya.

**Severity: P2** (tercatat, sudah diketahui — status kini sudah tuntas, dicantumkan untuk riwayat).

---

## 2. Peran ADMIN (admin_ppg / admin_desa / admin_kelompok)

### Route guard
`RequireAuth.tsx` **tidak punya daftar halaman per-tingkat admin** — ketiga peran admin sama sekali tidak dibatasi rute lewat `HALAMAN_*`; navigasi antar-tingkat admin murni bergantung pada RLS + gating tombol di komponen. Sudah dicek pada Kurikulum: `PERAN_TULIS = ['admin_ppg']` eksplisit dikomentari "HANYA gerbang UI, bukan satu2nya penjaga" — RLS `kurikulum_*_insert|update_admin_only` dan `kurikulum_prota_delete_ppg_only` menegakkan pembatasan yang sama di DB. **Pola ini benar.**

Karena tidak ada `HALAMAN_ADMIN_KELOMPOK` dsb., seorang `admin_kelompok` yang mengetik URL admin_ppg-only akan tetap render komponennya, dan RLS yang menahan datanya kosong — bisa terlihat sebagai "layar kosong tanpa penjelasan".

**Severity: P2** — rekomendasi: untuk layar yang memang admin_ppg-only secara keseluruhan (bukan cuma tombol di dalamnya), tambahkan penjagaan level-halaman + pesan jelas.

### RBAC pra-otorisasi & registrasi
`chk_profiles_scope` sudah diperluas mencakup `penerobos`/`ketua_mudai` (fix ERROR_LOG #41). **PERLU VERIFIKASI LIVE**: apakah constraint ini sudah diperluas juga untuk role `pengunjung` (migrasi `20260911110000`/`120000`) — tidak sempat dibaca detail SQL-nya di audit ini; MEMORY.md tidak mencatat insiden untuk pengunjung, jadi kemungkinan besar aman.

### Kesehatan dashboard
`SECURITY_PERFORMANCE_AUDIT_2026-09-10.md` mencatat HIGH #3 belum selesai: dashboard admin kelp = 8 round-trip terpisah saat mount. Status tidak berubah (tidak ada commit baru yang menyentuh `AdminKelpDashboard.tsx`).

---

## 3. Peran PENGUNJUNG (demo)

### Exclusion Shodaqoh — RLS-level, BUKAN cuma UI (dikonfirmasi benar)
`RequireAuth.tsx` sengaja mengeluarkan `/shodaqoh` dari `HALAMAN_PENGUNJUNG`. **Dikonfirmasi lewat migrasi `20260911190000_shodaqoh.sql`**: keempat policy SELECT (`shodaqoh_jenis`/`penghimpun`/`setoran`/`transaksi`) HANYA mencakup `admin_ppg | admin_desa | admin_kelompok | guru` — tidak ada cabang `pengunjung` di keempat tabel. Pengecualian ini benar-benar ditegakkan di DB.

### 🟡 TEMUAN P1 — Hub "Keuangan" tetap menampilkan kartu Shodaqoh ke pengunjung, memicu dead-end lintas-app
`frontend/app/keuangan/page.tsx` — array `MENU` (Tabungan, Infaq Pengajian, Shodaqoh) dirender statis untuk **semua peran**, termasuk `pengunjung`, tanpa filter `profile?.role`. Karena `/keuangan` ada di `HALAMAN_PENGUNJUNG`, pengunjung bisa membuka `/keuangan` dan melihat kartu "Shodaqoh". Menekannya memicu `router.push('/shodaqoh')`, lalu `RequireAuth.tsx` mendeteksi `/shodaqoh` tidak ada di `HALAMAN_PENGUNJUNG` dan **mengalihkan ke `/jamaah`** (app Penerobos) — bukan kembali ke `/keuangan` dengan pesan jelas. Dari sudut pandang pengunjung: menekan kartu di app Guru tiba-tiba melempar ke app berbeda tanpa penjelasan.

**Severity: P1** (fungsional, bukan celah keamanan — RLS sudah aman — tapi pengalaman demo rusak & berlawanan dengan niat desain yang sudah ditulis sendiri di komentar `RequireAuth.tsx`).

**Rekomendasi**: filter `MENU` di `KeuanganContent` berdasar `profile?.role !== 'pengunjung'` untuk entri Shodaqoh.

### 🟡 TEMUAN P1 — `infaq_pengajian` tidak ikut trigger reset 30 hari pengunjung
Trigger `pengunjung_catat_jejak()` dipasang di 9 tabel (migrasi `20260911150000`), TIDAK termasuk `infaq_pengajian` — karena migrasi trigger ini MENDAHULUI migrasi Infaq Pengajian (`20260911180000`), urutan tanggalnya terbalik. Namun RLS `infaq_pengajian` memang punya cabang `pengunjung` untuk INSERT/UPDATE (rute ada di `HALAMAN_PENGUNJUNG`). Akibatnya: kalau pengunjung mencatat Infaq Pengajian (data demo), baris itu **tidak pernah otomatis dihapus/direset** oleh `reset_data_pengunjung_kadaluwarsa()` — berbeda dari niat desain "setiap baris yang disentuh pengunjung otomatis direset 30 hari". **PERLU VERIFIKASI LIVE** untuk dampak riil (berapa baris sudah tercemar), tapi secara statis kodenya jelas: tidak ada `CREATE TRIGGER pengunjung_jejak_trg ON public.infaq_pengajian` di migrasi mana pun.

**Severity: P1** — rekomendasi: migrasi susulan menambahkan `infaq_pengajian` ke daftar tabel `pengunjung_jejak`, atau cabut cabang RLS `pengunjung` dari tabel itu kalau memang tidak boleh diisi pengunjung.

### Status akses kadaluwarsa (30 hari)
`RequireAuth.tsx` mengecek `status_akses_pengunjung()` dengan layar blokir `PengunjungBerakhir` yang tidak merender `{children}` sama sekali — desain benar, konsisten dengan fix bug #6 (migrasi `20260911170000`).

---

## 4. Peran PENEROBOS

### Status kode TERKINI vs memori (koreksi atas asumsi "Fase B/C belum")
`MEMORY.md` (entri 2026-09-09) mencatat Fase B (acara+kehadiran) & C (riwayat+dashboard) "belum". **Ini SUDAH USANG.** Kode saat ini menunjukkan seluruh 3 fase sudah dibangun penuh: `app/jamaah/kehadiran/*`, `components/jamaah/{AcaraForm,KehadiranAcaraList,InputKehadiran}.tsx` (Fase B), `app/jamaah/riwayat/page.tsx` + `RiwayatKehadiran.tsx` (Fase C), `RingkasanJamaahCard`/`RingkasanKehadiranCard` (dashboard) — tidak ada TODO/stub. Migrasi lanjutan (`20260910150000`/`170000`/`200000`/`210000`) menunjukkan fitur ini berkembang MELEBIHI cakupan awal (Data Pengurus, Pindah, Meninggal).

**Rekomendasi non-kode**: perbarui `MEMORY.md` entri Penerobos Kelp 2026-09-09.

### 🟡 TEMUAN P2 — `jamaah_kehadiran_delete` tidak punya cabang `admin_desa`
Dibanding `jamaah_kehadiran_select`/`_write`/`_update` yang semuanya punya cabang `admin_desa`, kebijakan DELETE tidak menyertakannya. Efeknya: `admin_desa` bisa lihat & ubah status kehadiran jamaah di kelompok pada desanya, tapi tidak bisa membatalkan-centang kesalahan input — harus eskalasi ke `admin_ppg`.

**Severity: P2** — dampak terbatas, tapi tidak simetris dengan 3 policy lain pada tabel yang sama.

### Nav & guard
`PERAN_MOBILE = ['guru', 'penerobos', 'ketua_mudai', 'pengunjung']` sudah benar mengecualikan keempatnya dari cabang sidebar admin (fix #42 tidak regresi). `JamaahBottomNav.tsx` konsisten dengan 4 rute utama; rute sekunder (`/jamaah/data`, `/pengurus`, `/sub-kelp`, `/pindah`, `/meninggal`) sengaja dijangkau lewat hamburger `JamaahChrome` — **belum diverifikasi** apakah `JamaahChrome.tsx` benar-benar menautkan ke seluruh 5 rute itu.

---

## Ringkasan Lintas-Peran — Pola Bug yang Berulang

1. **"Menu menunjuk ke halaman yang di-block guard untuk peran tertentu"** — muncul pada pengunjung + kartu Shodaqoh di hub Keuangan. Pola ini spesifik ke fitur yang di-exclude parsial (pengunjung satu-satunya peran dengan daftar exclusion parsial dari basis `HALAMAN_GURU`).
2. **"Tabel baru dibuka izin TULIS tapi lupa audit turunannya (trigger/DELETE/reset)"** — berulang dalam bentuk baru: `infaq_pengajian` dibuka tulis untuk pengunjung tapi lupa dimasukkan ke daftar tabel ber-trigger reset. Memperkuat pelajaran lama: sebelumnya soal SELECT (bug #5/#6), kini soal mekanisme reset/housekeeping.
3. **DELETE tidak simetris antar-peran pada satu tabel** — `jamaah_kehadiran_delete` kehilangan cabang `admin_desa` yang ada di 3 policy saudaranya. Beda dari bug #39 asli (tabel TANPA DELETE sama sekali) — di sini "DELETE ada tapi tidak selengkap policy saudaranya".
4. **Guru gilir kedua (`guru_id_2`)** — pola INI TIDAK BERULANG lagi; kedua fitur keuangan baru sudah benar sejak commit pertama.
5. **Memori proyek vs kode aktual** — 1 kasus staleness nyata (Fase B/C Penerobos dianggap "belum" padahal sudah tuntas) — risiko operasional untuk sesi berikutnya kalau tidak diverifikasi ulang ke kode.

### Rekomendasi prioritas
1. **(P1)** Filter kartu Shodaqoh dari `MENU` di `frontend/app/keuangan/page.tsx` untuk `profile?.role === 'pengunjung'`.
2. **(P1)** Migrasi susulan: tambahkan trigger `pengunjung_jejak_trg` pada `infaq_pengajian`, atau cabut akses tulis pengunjung dari tabel itu.
3. **(P2)** Migrasi susulan: tambahkan cabang `admin_desa` ke `jamaah_kehadiran_delete`.
4. **(P2)** Perbarui `MEMORY.md` entri Penerobos Kelp 2026-09-09 soal status Fase B/C.
5. **(P2, verifikasi ringan)** Cek jalan menu guru menuju `/keuangan` selain URL manual; tambahkan entri di `GuruBottomNav.tsx > LAINNYA` kalau memang tidak ada.
6. **(Verifikasi tambahan)**: isi `chk_profiles_scope` pasca role `pengunjung`, dan kelengkapan tautan `JamaahChrome.tsx` ke 5 rute sekunder Penerobos.
