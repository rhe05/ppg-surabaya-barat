# MASTER PRD (PRODUCT REQUIREMENTS DOCUMENT)
## Tahap 07 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Nama Proyek | Aplikasi Manajemen TPQ — PPG Surabaya Barat |
| Versi Dokumen | 1.0 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 08 |
| Input | Tahap 01–06 (Benchmark, Reverse Engineering, Product Vision, Product Strategy, Market Research, Business Analysis) |
| Tahap Berikutnya | 08 — User Persona |

---

## 1. Ringkasan Eksekutif

Aplikasi ini adalah sistem manajemen digital pertama untuk **PPG Surabaya Barat**, yang membawahi 5 Desa (Petemon, Purwodadi, Tanbar, Tantim, Benowo) dan 18 Kelompok TPQ di bawahnya. Saat ini seluruh pencatatan santri, guru, kehadiran, hafalan, dan perkembangan karakter dilakukan manual — sistem ini menggantikannya dengan platform terpusat yang memberi visibilitas berjenjang (Kelompok → Desa → PPG) tanpa duplikasi kerja administratif.

Peluncuran dilakukan **bertahap**: pilot dimulai dari Kelp Petemon (Desa Petemon) dan seluruh 3 Kelompok Desa Purwodadi (Bangun Rejo, Purwodadi, Dupak) — total 4 dari 18 Kelompok, mencakup 2 Desa.

---

## 2. Vision & Problem Statement (Rekap Tahap 03)

**Vision:** Menjadi sistem manajemen tunggal yang membantu pengurus TPQ — dari tingkat Kelompok, Desa, hingga PPG — mencatat, memantau, dan mengambil keputusan atas perkembangan santri dan kinerja pengajaran secara akurat, transparan, dan tanpa duplikasi kerja administratif.

**Problem Statement:** Pengelolaan data santri, guru, kehadiran, hafalan, dan perkembangan karakter saat ini dilakukan manual, tersebar di 18 Kelompok pada 5 Desa. Tanpa sistem terpusat, pengurus Desa dan PPG tidak punya cara praktis memperoleh gambaran menyeluruh atau mengambil keputusan berbasis data akurat dan real-time.

---

## 3. Struktur Organisasi (Terkonfirmasi)

| Level | Nama | Jumlah |
|---|---|---|
| PPG | PPG Surabaya Barat | 1 |
| Desa | Petemon, Purwodadi, Tanbar, Tantim, Benowo | 5 |
| Kelompok | — | **18** (resmi) |

| Desa | Kelompok Terdaftar | Status Online (Pilot) |
|---|---|---|
| Petemon | Kelp Petemon, Kelp Simo, Kelp Jl Semarang, Kelp Asem Jaya, Kelp DST | Hanya **Kelp Petemon** online; 4 lainnya menunggu konfirmasi |
| Purwodadi | Kelp Bangun Rejo, Kelp Purwodadi, Kelp Dupak | **Seluruhnya online** (3/3) |
| Tanbar | Manukan 1, Manukan 2, Candi Lontar, Wonorejo | Off, menunggu konfirmasi |
| Tantim | Balongsari, Dermo, Buntaran | Off, menunggu konfirmasi |
| Benowo | Sememi Barat, Sememi Timur, Pakal | Off, menunggu konfirmasi |

✅ **Rekonsiliasi selesai:** Total resmi **18 Kelompok**, sesuai jumlah rincian per-Desa (5+3+4+3+3=18). Angka ini menggantikan angka "17" yang sempat dipakai di Tahap 01-03.

---

## 4. Peran & Hak Akses (Rekap Tahap 06 — Final)

| Role | Scope | Lihat | Input/Edit | Hapus | Kewenangan Khusus |
|---|---|---|---|---|---|
| Admin Kelompok | Tepat 1 Kelompok | Kelompoknya | Ya | **Ya (data sendiri)** | Entri kehadiran, nilai Munaqosah, konseling, kenaikan jenjang santri |
| Admin Desa | 1 Desa | Semua Kelompok di Desanya | Sesuai kebutuhan | Belum ditentukan (default: tidak) | Buka/tutup periode Munaqosah (bersama PPG) |
| Admin PPG | Seluruh organisasi | Semua Desa & Kelompok | Sesuai kebutuhan | Belum ditentukan (default: tidak) | Aktifkan/nonaktifkan Kelompok; buka/tutup periode Munaqosah |

**Aturan penugasan:** Satu orang = satu role, satu scope. Tidak ada multi-role/ganti-peran (berbeda dari aplikasi referensi — keputusan sadar, lihat Tahap 06 §2.1).

**Bimbingan Konseling:** Seluruh role dapat melihat — tidak ada pembatasan akses khusus (dikonfirmasi Tahap 06).

---

## 5. Functional Requirements per Modul

Format: *"Sistem harus dapat [AKSI] sehingga [MANFAAT]."* Setiap modul mencantumkan status keputusan dari Tahap 02 (Reverse Engineering).

### 5.1 Dashboard — *Modifikasi dari Referensi*

| ID | Requirement |
|---|---|
| FR-01 | Sistem harus dapat menampilkan ringkasan jumlah santri dan guru sesuai scope akses pengguna yang login, sehingga pengguna langsung tahu skala tanggung jawabnya. |
| FR-02 | Sistem harus dapat menampilkan **satu** context filter global (Semester, Desa, Kelompok — bukan filter ganda seperti temuan kelemahan Tahap 02), sehingga tidak ada ambiguitas filter mana yang berlaku. |
| FR-03 | Sistem harus dapat membedakan visual antara card KPI yang datanya kosong (belum ada data) dengan card yang berisi data valid, sehingga pengguna tidak salah mengira sistem error. |
| FR-04 | Sistem harus dapat menampilkan agenda/kegiatan terdekat. |
| FR-05 | Sistem harus dapat menampilkan status Santri Teladan berdasarkan kriteria tetap (Nilai≥90, Akhlaq≥90, Kehadiran≥95%) per periode semester. |

### 5.2 Data Santri — *Pertahankan struktur, modifikasi kecil*

| ID | Requirement |
|---|---|
| FR-06 | Sistem harus dapat menampilkan pencarian santri berdasarkan nama/NIS dengan filter Desa, Kelompok, dan Kelas. |
| FR-07 | Sistem harus dapat menampilkan statistik agregat (total, gender, distribusi per kelompok) yang otomatis mengikuti filter aktif. |
| FR-08 | Sistem harus dapat menyediakan akses langsung ke data individual santri tanpa wajib melalui halaman statistik terlebih dahulu (perbaikan dari kelemahan Tahap 02). |
| FR-09 | Sistem harus dapat mencatat penempatan jenjang santri (AUD/Cabe Rawit/Pra Remaja/Remaja) berdasarkan kemampuan, dengan kemampuan mencatat perpindahan jenjang kapan saja (bukan batch), dilakukan oleh Admin Kelompok. |
| FR-10 | Sistem harus dapat mendukung impor data santri secara massal (mis. dari Excel), mengingat kemungkinan entri data historis dalam jumlah besar saat onboarding. |

### 5.3 Data Guru — *Modifikasi*

| ID | Requirement |
|---|---|
| FR-11 | Sistem harus dapat menampilkan direktori guru dengan pencarian nama. |
| FR-12 | Sistem harus dapat menampilkan rekap jumlah guru dengan **validasi konsistensi**: total keseluruhan harus selalu sama dengan jumlah seluruh sub-kategori (memperbaiki temuan inkonsistensi data 51+68≠120 di Tahap 02). |
| FR-13 | Sistem harus dapat menampilkan analitik guru dengan kedalaman setara Data Santri (breakdown relevan), bukan sekadar angka datar. |

### 5.4 Absen Santri — *Pertahankan konsep, modifikasi UX*

| ID | Requirement |
|---|---|
| FR-14 | Sistem harus dapat mencatat kehadiran santri dengan 3 status: Hadir, Alpa, Izin. |
| FR-15 | Sistem harus dapat menampilkan rekap kehadiran dengan filter Bulanan/Semester, dan secara jelas menandai kapan data ter-update (mengatasi ambiguitas ditemukan Tahap 02). |
| FR-16 | Sistem harus dapat menandai santri dengan tingkat Alpa melewati ambang tertentu sebagai "perlu perhatian" (indikator visual), sebagai nilai tambah dibanding referensi yang hanya menampilkan angka datar. Ambang batas persisnya didefinisikan di Tahap 12 (Business Rules). |

### 5.5 Munaqosah — *Pertahankan, modifikasi kecil*

| ID | Requirement |
|---|---|
| FR-17 | Sistem harus dapat mengelola penilaian ujian hafalan santri per periode semester. |
| FR-18 | Sistem harus dapat dibuka/ditutup periode inputnya oleh Admin PPG atau Admin Desa. |
| FR-19 | Sistem harus dapat menampilkan banner status periode (buka/tutup) yang mencantumkan estimasi/kontak, bukan sekadar pesan status statis (perbaikan dari kelemahan Tahap 02). |
| FR-20 | Sistem harus dapat menampilkan status penilaian (Belum Dinilai/Dinilai) dengan kode warna, konsisten dengan modul lain. |
| FR-21 | Sistem harus dapat menghasilkan rekap progress dan daftar Santri Teladan otomatis dari data penilaian. |

### 5.6 Bimbingan Konseling — *Pertahankan, modifikasi*

| ID | Requirement |
|---|---|
| FR-22 | Sistem harus dapat mencatat riwayat konseling santri: tanggal, kategori, masalah, status, pencatat. |
| FR-23 | Sistem harus dapat diakses (lihat) oleh seluruh role sesuai matriks akses Tahap 06 — tanpa pembatasan tambahan. |
| FR-24 | Sistem harus dapat difilter berdasarkan rentang tanggal, selain kategori dan status (penambahan dari kelemahan Tahap 02 yang tidak punya filter tanggal). |

### 5.7 Pusat Unduhan — *Modifikasi*

| ID | Requirement |
|---|---|
| FR-25 | Sistem harus dapat menyimpan dan mengorganisir dokumen dalam struktur folder. |
| FR-26 | Sistem harus dapat menyediakan pencarian dokumen (perbaikan dari kelemahan Tahap 02 — referensi tidak punya pencarian). |
| FR-27 | Sistem harus dapat menampilkan metadata dasar (tanggal upload, pengunggah) per dokumen. |

### 5.8 – 5.10 Kalender, Laporan KBM, Peringkat KBM — *Pertahankan (detail tertunda)*

| ID | Requirement |
|---|---|
| FR-28 | Sistem harus dapat menampilkan kalender kegiatan bulanan dengan kategori event berwarna. |
| FR-29 | Sistem harus dapat menghasilkan laporan KBM terfilter (bulan, tahun, Desa, Kelompok) dan dapat diekspor. |
| FR-30 | Sistem harus dapat menampilkan peringkat/ranking berdasarkan Desa, Kelompok, dan nilai per semester. |

*(Detail lebih rinci untuk ketiga modul ini akan diperkaya di Tahap 11 — Feature Breakdown, karena belum ada screenshot referensi untuk dianalisis.)*

### 5.11 PPG (Level Administratif) — *Pertahankan (direvisi dari "Hapus")*

| ID | Requirement |
|---|---|
| FR-31 | Sistem harus dapat menampilkan dashboard agregat lintas-Desa untuk role Admin PPG. |
| FR-32 | Sistem harus dapat digunakan Admin PPG untuk mengaktifkan/menonaktifkan status Kelompok. |

### 5.12 Modul Kurikulum — *Modul Baru (Tidak Ada di Referensi)*

| ID | Requirement |
|---|---|
| FR-33 | Sistem harus dapat mencatat nilai Akhlaq santri sebagai bagian dari kriteria Santri Teladan. |
| FR-34 | *(Cakupan penuh modul ini — materi ajar, capaian kurikulum, dll — belum dijelaskan Anda. FR tambahan akan ditulis setelah klarifikasi, tidak menghambat tahap ini.)* |

### 5.13 Cross-Cutting: Manajemen Status Kelompok — *Kebutuhan Baru*

| ID | Requirement |
|---|---|
| FR-35 | Sistem harus dapat menyimpan status setiap Kelompok sebagai Aktif/Belum Aktif. |
| FR-36 | Sistem harus dapat menyembunyikan atau menandai jelas Kelompok berstatus "Belum Aktif" di seluruh filter dan dashboard, agar tidak menimbulkan tampilan data kosong yang membingungkan. |

---

## 6. Non-Functional Requirements

| Kategori | Requirement |
|---|---|
| Performance | Waktu muat halaman dashboard < 3 detik pada kondisi jaringan normal *(target awal, dapat disesuaikan setelah uji nyata)* |
| Usability | Antarmuka dapat digunakan pengguna tanpa pengalaman sistem digital sebelumnya, mengingat Problem Statement Tahap 03 (belum ada sistem sama sekali) |
| Data Integrity | Setiap angka agregat/ringkasan harus dapat direkonsiliasi ke data rincinya (prinsip wajib dari Tahap 03 §6, merespons temuan inkonsistensi data Tahap 02) |
| Security | Kontrol akses berbasis role sesuai matriks Tahap 06; data konseling tetap tercatat dengan jejak audit (siapa mencatat, kapan) meski dapat dilihat semua role |
| Scalability | Struktur data harus mendukung pertumbuhan dari 4 Kelompok (pilot) ke 18 Kelompok (skala penuh) tanpa perubahan struktural besar |
| Maintainability | Istilah organisasi (Desa, Kelompok, PPG) disimpan sebagai data terkonfigurasi, bukan hardcode di kode program |
| Compatibility | Mendukung browser modern (Chrome, Firefox, Safari versi terbaru), desktop-first dengan dukungan mobile *(detail breakpoint menyusul di Tahap 14 — Design System)* |

---

## 7. Business Rules (Konsolidasi dari Tahap 01–06)

| # | Aturan |
|---|---|
| 1 | Kriteria Santri Teladan: Nilai ≥90, Akhlaq ≥90, Kehadiran ≥95% |
| 2 | Konsep "Karakter Luhur" dipertahankan, tidak diubah |
| 3 | Penempatan Kelompok berbasis kemampuan, bukan usia otomatis |
| 4 | Setiap Kelompok punya status Aktif/Belum Aktif |
| 5 | Absensi memakai 3 status: Hadir, Alpa, Izin |
| 6 | Struktur organisasi: 1 PPG → 5 Desa → 18 Kelompok (rincian per-Desa masih perlu rekonsiliasi) |
| 7 | Pembayaran/SPP dan notifikasi wali santri: di luar cakupan |
| 8 | Kenaikan jenjang manual, per-santri individual, oleh Admin Kelompok tanpa approval berjenjang |
| 9 | Nilai Akhlaq bersumber dari Modul Kurikulum |
| 10 | Satu orang = satu role, satu scope (tidak ada multi-role/ganti-peran) |
| 11 | Admin Kelompok boleh menghapus data miliknya sendiri |
| 12 | Data Bimbingan Konseling dapat dilihat seluruh role tanpa pembatasan khusus |
| 13 | Status Kelompok (aktif/nonaktif) hanya dapat diubah oleh Admin PPG |
| 14 | Periode input Munaqosah dapat dibuka/ditutup oleh Admin PPG atau Admin Desa |

*(Daftar ini akan diformalkan lebih rinci di Tahap 12 — Business Rules, termasuk aturan detail seperti ambang batas Alpa untuk FR-16.)*

---

## 8. Di Luar Cakupan (Out of Scope)

- Pembayaran/keuangan (SPP, infaq)
- Komunikasi/notifikasi langsung ke wali santri
- Sertifikat digital/kelulusan khatam *(asumsi bukan prioritas, mengikuti pola pembayaran/notifikasi — perlu dikonfirmasi eksplisit jika keliru)*

---

## 9. Strategi Peluncuran (Rekap Tahap 04)

Bertahap. Pilot: Kelp Petemon (Desa Petemon) + seluruh 3 Kelompok Desa Purwodadi = 4 dari 18 Kelompok, mencakup 2 Desa. Perluasan berikutnya belum ditentukan urutannya (keputusan menyusul di Tahap 19).

---

## 10. Item Terbuka (Wajib Diperjelas — Tidak Menghambat PRD, Tapi Perlu Sebelum Tahap Terkait)

| Item | Dibutuhkan Sebelum | Prioritas |
|---|---|---|
| Rekonsiliasi 17 vs 18 Kelompok | Tahap 16 (Database Design) | Sedang |
| Isi lengkap Modul Kurikulum | Tahap 11 (Feature Breakdown) | Sedang |
| Nama 10 Kelompok (Tanbar, Tantim, Benowo) | Tahap 16 (Database Design) | Rendah |
| Kewenangan hapus data Admin Desa/PPG | Tahap 12 (Business Rules) | Rendah |
| Ambang batas "Alpa perlu perhatian" (FR-16) | Tahap 12 (Business Rules) | Rendah |
| Konfirmasi status kelulusan/sertifikat digital di luar cakupan | Tahap 11 | Rendah |

---

## 11. Quality Control — Tahap 07

### Apa yang sudah selesai
- 36 functional requirement tersusun di 13 area modul, masing-masing tertaut ke keputusan Tahap 02 (Pertahankan/Modifikasi/Baru)
- 7 non-functional requirement kategori utama (ISO 25010-aligned) tersusun
- 14 business rule terkonsolidasi dari seluruh tahap sebelumnya, tanpa duplikasi
- Struktur organisasi, matriks akses, dan strategi peluncuran terintegrasi penuh dari Tahap 01–06
- Seluruh item terbuka dari tahap sebelumnya dikumpulkan dalam satu tabel prioritas (Bagian 10), bukan tersebar

### Apa yang masih kurang
- 6 item di Bagian 10 belum terjawab, tapi masing-masing punya prioritas jelas dan tenggat tahap yang realistis (tidak ada yang mendesak untuk PRD ini sendiri)
- Detail UI/UX belum ada di dokumen ini secara sengaja — itu cakupan Tahap 13–15 (Wireframe, Design System, UI Specification)

### Risiko
- **Risiko rendah**: Seluruh item terbuka punya prioritas rendah-sedang dan tenggat tahap yang jelas, tidak ada yang berisiko tinggi merombak PRD ini jika dijawab belakangan.
- **Risiko rendah**: FR-34 (Modul Kurikulum) masih minim detail — berpotensi diperluas signifikan begitu Anda menjelaskan isinya, tapi tidak mengubah struktur PRD secara keseluruhan.

### Rekomendasi
1. PRD ini sudah cukup solid untuk lanjut ke **Tahap 08 — User Persona**.
2. Item di Bagian 10 bisa dijawab kapan saja sebelum tahap terkaitnya — tidak perlu dijawab sekarang jika Anda ingin terus maju.

### Langkah berikutnya
Menunggu persetujuan Anda untuk lanjut ke **Tahap 08 — User Persona**.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal Master PRD, menggabungkan seluruh temuan Tahap 01–06 |
