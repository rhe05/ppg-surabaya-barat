# BENCHMARK ANALYSIS
## Tahap 01 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ |
| Versi Dokumen | 1.0 |
| Status | Draft — menunggu screenshot untuk verifikasi visual |
| Sumber | Deskripsi tekstual aplikasi referensi (screenshot menyusul) |
| Tahap Sebelumnya | — (tahap pertama) |
| Tahap Berikutnya | 02 — Reverse Engineering |

---

## 1. Catatan Metodologi

Dokumen ini adalah **dokumentasi objektif** terhadap aplikasi referensi — mencatat apa yang ADA, tanpa penilaian baik/buruk dan tanpa usulan perbaikan. Analisis kelemahan, identifikasi fungsi setiap modul, dan rancangan versi yang lebih baik dilakukan pada **Tahap 02 — Reverse Engineering**, sesuai urutan kerja yang ditetapkan.

**Batasan sumber data saat ini:**
Deskripsi yang diterima berbentuk teks terstruktur, bukan gambar. Sejumlah detail visual (warna, tipografi, spacing eksak, breakpoint responsive) belum dapat dipastikan sampai screenshot diterima. Bagian yang bersifat asumsi ditandai eksplisit di Bagian 6.

**Adaptasi istilah domain:**
Aplikasi referensi menggunakan istilah pesantren/majelis taklim (Desa, Kelompok, Muballigh). Karena target proyek adalah **TPQ**, dokumen ini mencatat istilah asli referensi apa adanya di Bagian 2–4 (untuk keperluan reverse engineering), dan padanan istilah TPQ dibahas terpisah di Bagian 5 sebagai catatan transisi — bukan keputusan final. Pemetaan istilah final adalah keputusan Tahap 03 (Product Vision) dan Tahap 06 (Business Analysis).

---

## 2. Struktur Navigasi

### 2.1 Layout Umum
Dashboard Admin dengan pola **Sidebar Kiri + Top Navigation**, konsisten di seluruh halaman.

### 2.2 Sidebar (Kiri)

| Atribut | Nilai |
|---|---|
| Posisi | Fixed (tidak ikut scroll bersama konten) |
| Perilaku internal | Scrollable jika daftar menu melebihi tinggi layar |
| Format item menu | Icon + Label teks |
| Indikator state | Active menu highlight |
| Elemen atas | Logo aplikasi |
| Elemen bawah | Tombol Logout |

**Daftar menu (versi referensi):**

1. Dashboard
2. Data Santri
3. Data Guru
4. Absen Santri
5. Munaqosah
6. Bimbingan Konseling
7. Pusat Unduhan
8. Kalender
9. Laporan KBM
10. Peringkat KBM
11. PPG
12. Keluar

### 2.3 Top Navigation (Kanan Atas)

| Elemen | Fungsi |
|---|---|
| Refresh Data | Memuat ulang data terkini |
| Ganti Peran | Beralih role/peran pengguna (mengindikasikan sistem multi-role) |
| Profil User | Akses informasi akun |
| Role User | Menampilkan peran aktif pengguna saat ini |

**Catatan:** Keberadaan "Ganti Peran" mengindikasikan satu akun bisa memiliki lebih dari satu peran (contoh: seorang guru yang juga admin desa). Ini implikasi arsitektur RBAC (Role-Based Access Control) yang perlu didalami di Tahap 06 — Business Analysis.

---

## 3. Inventaris Modul

| # | Modul | Fungsi Inti (observasi) |
|---|---|---|
| 1 | Dashboard | Ringkasan terfilter: welcome card, KPI per kelompok, agenda, summary count |
| 2 | Data Santri | Direktori & analisis santri dengan statistik dan visualisasi |
| 3 | Data Guru | Direktori guru dengan kategorisasi berdasarkan penugasan |
| 4 | Absen Santri | Rekap kehadiran dengan filter periode dan visualisasi persentase |
| 5 | Munaqosah | Manajemen ujian/evaluasi hafalan dengan tracking progress dan status |
| 6 | Bimbingan Konseling | Pencatatan kasus/masalah santri dengan riwayat dan statistik |
| 7 | Pusat Unduhan | Repository dokumen berbasis folder |
| 8 | Kalender | Jadwal kegiatan bulanan dengan kategori event |
| 9 | Laporan KBM | Kumpulan laporan kegiatan belajar mengajar, dapat diekspor |
| 10 | Peringkat KBM | Ranking berdasarkan penilaian, ditampilkan per wilayah/kelompok |
| 11 | PPG | Tidak ada rincian struktur — kemungkinan modul terkait sertifikasi/pengembangan guru |

### 3.1 Detail Modul Dashboard

- **Welcome Card**: judul, subjudul, informasi singkat
- **Filter global**: Semester, Desa, Kelompok — mengontrol seluruh widget di halaman
- **KPI Card per kelompok usia**: AUD, Cabe Rawit, Pra Remaja, Remaja — masing-masing menampilkan nama kelompok, jumlah, status
- **Agenda**: timeline kegiatan terdekat (tanggal + judul)
- **Summary Card**: jumlah santri, jumlah guru, dan metrik lain

### 3.2 Detail Modul Data Santri

- Search bar
- Filter: Desa, Kelompok, Kelas
- Statistik: total santri, laki-laki, perempuan, persentase
- Visualisasi: Donut Chart, Bar Chart
- Aksi: tombol "Lihat Data Santri" (navigasi ke detail/list)

### 3.3 Detail Modul Data Guru

- Search guru
- Filter: Wilayah, Kelompok
- Card summary: total guru, kategori "Muballigh Tugasan" vs "Muballigh Setempat"

**Catatan istilah:** "Muballigh Tugasan/Setempat" adalah klasifikasi penugasan guru (dikirim dari luar vs berasal dari wilayah setempat) — spesifik ke konteks organisasi dakwah, perlu dipetakan ulang untuk konteks TPQ di Tahap 06.

### 3.4 Detail Modul Absensi

- Filter: Bulanan, Semester, Tahun, Desa, Kelompok, Kelas
- Visualisasi: Pie Chart persentase kehadiran
- Aksi: tombol Detail, tombol Rekap

### 3.5 Detail Modul Munaqosah

- Banner informasi
- Search + filter: Semester, Desa, Kelompok, Kelas
- Tabel: Nama, Kelas, Wilayah, Status, Aksi
- Aksi tambahan: Rekap Progress, Santri Teladan, Download Soal

**Catatan domain:** Munaqosah adalah istilah ujian lisan hafalan Al-Qur'an — relevan langsung dengan konteks TPQ, kemungkinan besar dipertahankan sebagai modul inti (perlu konfirmasi Anda di Tahap 03).

### 3.6 Detail Modul Bimbingan Konseling

- Tab: Riwayat, Statistik
- Filter: Desa, Kelompok, Kategori, Status
- Tabel: Tanggal, Santri, Kategori, Masalah, Status, Pencatat, Aksi

### 3.7 Detail Modul Pusat Unduhan

- Grid card berbasis folder (icon + nama folder)
- Interaksi: klik folder → membuka isi

### 3.8 Detail Modul Kalender

- Tampilan bulanan (monthly view)
- Navigasi antar bulan
- Kategori event dengan pewarnaan berbeda: Hari Libur, KBM, Musyawarah, Pra Munaqosah

### 3.9 Detail Modul Laporan

- Filter: Bulan, Tahun, Desa, Kelompok
- Tabel daftar laporan
- Fungsi export

### 3.10 Detail Modul Peringkat

- Filter Semester
- Informasi status
- Accordion penilaian
- Progress bar
- Ranking berdasarkan Desa, Kelompok, Nilai

---

## 4. Pola Layout & Komponen UI

### 4.1 Pola Layout Halaman (Konsisten di Semua Modul)

```
Header
  ↓
Title
  ↓
Subtitle
  ↓
Filter
  ↓
Summary Card
  ↓
Chart / Table
  ↓
Action Button
```

### 4.2 Inventaris Komponen UI

| Kategori | Komponen |
|---|---|
| Navigasi | Sidebar, Navbar |
| Data Display | Card, Statistic Card, Table, Badge |
| Input | Filter, Search Box, Dropdown, Date Picker |
| Visualisasi | Donut Chart, Pie Chart, Bar Chart, Progress Bar |
| Struktur Konten | Accordion |
| Feedback | Alert, Toast Notification, Loading, Empty State |
| Interaksi | Button, Modal, Pagination |

### 4.3 Pola Alur UX (Konsisten di Semua Modul)

```
Masuk Halaman → Lihat Ringkasan → Gunakan Filter →
Data Otomatis Berubah → Klik Card → Lihat Detail →
Edit / Cetak / Download
```

### 4.4 Prinsip Visual yang Dinyatakan (belum terverifikasi screenshot)

- Gaya: Modern Dashboard, Enterprise, Professional, Minimalis, Clean
- Whitespace luas
- Border radius: 16–20px
- Soft shadow
- Grid konsisten
- Responsive, mobile-first, desktop-friendly

---

## 5. Catatan Transisi Istilah (Referensi → TPQ)

Tabel berikut **bukan keputusan final** — hanya pemetaan awal untuk didiskusikan di Tahap 03 (Product Vision) dan Tahap 06 (Business Analysis).

| Istilah Referensi | Konteks Asal | Kemungkinan Padanan TPQ |
|---|---|---|
| Santri | Peserta didik pesantren | Santri TPQ / Peserta Didik |
| Guru / Muballigh | Pengajar/da'i | Ustadz/Ustadzah |
| Desa | Wilayah administratif dakwah | Bisa tetap "Desa" atau diubah ke "Unit/Cabang TPQ" |
| Kelompok (AUD, Cabe Rawit, Pra Remaja, Remaja) | Jenjang usia binaan | Perlu dikonfirmasi — apakah TPQ Anda pakai jenjang usia serupa atau jenjang jilid/juz Al-Qur'an? |
| Munaqosah | Ujian hafalan | Kemungkinan dipertahankan langsung |
| PPG | Tidak jelas dari deskripsi | Perlu klarifikasi Anda — kemungkinan besar tidak relevan untuk TPQ dan bisa dihilangkan |

---

## 6. Verifikasi Visual (Berdasarkan 11 Screenshot — kbm-ku.vercel.app)

Aplikasi referensi teridentifikasi bernama **KbmKu**, di-hosting di Vercel. Berikut hasil verifikasi terhadap 10 item yang sebelumnya berstatus asumsi.

| # | Item | Hasil Verifikasi |
|---|---|---|
| 1 | Skema warna | **Terverifikasi.** Sidebar navy gelap (dark blue, kira-kira #1A2547 area). Warna aktif menu: biru terang solid. Warna semantik konsisten dipakai berulang: biru (info/primary, AUD, Laki-laki), hijau (sukses, Cabe Rawit, Hadir), kuning/emas (warning, Pra Remaja, Izin), merah (danger, Remaja, Alpa), pink (Perempuan/gender). Background halaman: abu-abu sangat muda. Card: putih. |
| 2 | Tipografi | **Terverifikasi sebagian.** Sans-serif modern (mirip Inter/system-ui). Heading tebal (bold), body regular. Hierarchy jelas: judul halaman besar (~24px), label form kecil abu-abu, angka statistik besar (~28-32px bold). Font family eksak tidak bisa dipastikan dari gambar statis. |
| 3 | Breakpoint responsive | **Belum terverifikasi.** Semua screenshot dalam tampilan desktop/browser. Tidak ada bukti visual tampilan mobile. |
| 4 | Spacing/grid | **Terverifikasi sebagian (estimasi visual).** Padding card cukup lega, jarak antar-card konsisten. Grid card mengikuti pola 4 kolom (KPI card kelompok) dan 4 kolom (folder unduhan), menyesuaikan lebar layar. |
| 5 | Icon set | **Terverifikasi.** Setiap menu sidebar punya ikon berbeda dan konsisten: grid/dashboard icon, person icon (Data Santri), heart icon (Data Guru), clipboard-check icon (Absen Santri), document icon (Munaqosah), chat-bubble icon (Bimbingan Konseling), download-arrow icon (Pusat Unduhan), calendar icon (Kalender). Gaya ikon: outline/line-icon minimalis. |
| 6 | Tampilan chart | **Terverifikasi.** Donut chart (gender) dan pie chart (kehadiran) bersih, dengan label persentase langsung di dalam/atas chart, legend berwarna di bawahnya. Bar chart (distribusi kelas & gender) menggunakan stacked bar 2 warna. Tidak ada clutter berlebihan. |
| 7 | Kepadatan informasi | **Terverifikasi.** Tergolong lega — satu section per card, tidak ada tabel padat dalam satu layar penuh kecuali modul Munaqosah dan Bimbingan Konseling yang memang berbasis tabel. |
| 8 | Konsistensi visual antar modul | **Terverifikasi.** Header halaman (judul + Refresh Data + Ganti Peran + profil) identik di seluruh 8 modul yang di-screenshot. Pola filter → summary → chart/tabel juga konsisten. |
| 9 | Microcopy & empty state | **Terverifikasi.** Contoh nyata: *"Belum ada catatan konseling."* (empty state Bimbingan Konseling), *"- Belum ada data -"* (empty state KPI card saat filter belum menghasilkan data). Nada microcopy bersifat informatif dan sopan, konsisten memakai Bahasa Indonesia formal. |
| 10 | Struktur field tabel | **Terverifikasi** untuk 2 modul: Munaqosah (Nama, Kelas, Wilayah, Status, Aksi) dan Bimbingan Konseling (Tanggal, Santri, Kategori, Masalah, Status, Pencatat, Aksi). Modul lain (Laporan, Peringkat, Kalender) belum ada screenshot tabelnya. |

### 6.1 Item yang Masih Perlu Screenshot Tambahan (jika ada)
- [ ] Tampilan mobile/responsive
- [ ] Halaman: Kalender, Laporan KBM, Peringkat KBM, PPG (belum ada screenshot)
- [ ] Halaman detail/form (misal form tambah santri, form input nilai munaqosah, form konseling)
- [ ] Halaman login
- [ ] Contoh role selain "Peninjau" (misal Admin, Guru) — untuk memahami perbedaan hak akses

---

## 6a. Temuan Baru (Tidak Ada di Deskripsi Teks Awal)

Beberapa detail berikut ditemukan dari screenshot dan **tidak tercakup** dalam deskripsi tekstual sebelumnya — penting untuk Tahap 02 dan Tahap 06:

1. **Sistem role eksplisit.** User "Jazzmanto" memiliki role **"Peninjau"** (Viewer), ditampilkan langsung di top nav sebagai label yang bisa diklik. Dikombinasikan dengan tombol "Ganti Peran", ini konfirmasi kuat adanya multi-role per akun (RBAC), bukan sekadar dugaan.

2. **Kriteria "Santri Teladan" eksplisit dan terukur** (Dashboard): *Rata-rata Nilai ≥ 90, Akhlaq ≥ 90, Kehadiran ≥ 95%*. Ini business rule konkret yang sebelumnya tidak tercatat di deskripsi teks — penting dimasukkan ke Tahap 09 (Business Rules).

3. **Format kode wilayah pada Munaqosah**: kolom "Wilayah" berformat `KODE - Nama` (contoh: "ADR - Andara 2", "LTA - SKB", "PDL - GP 2"). Menunjukkan struktur data wilayah punya kode singkat + nama, bukan cuma nama datar.

4. **Kelas ditampilkan sebagai badge berwarna** (pill/rounded label) dalam tabel Munaqosah, bukan teks polos — konsisten dengan skema warna kelompok di dashboard.

5. **Alert/pengumuman kontekstual**: Modul Munaqosah menampilkan banner kuning peringatan: *"Pengisian dan perubahan nilai munaqosah sedang dinonaktifkan (ditutup) sementara oleh Admin."* — mengindikasikan ada mekanisme **buka/tutup periode input** yang dikontrol admin. Ini business rule penting untuk Tahap 09.

6. **Data riil sebagai referensi skala**: Total Santri 1.746 (Laki-laki 871 / 49.9%, Perempuan 873 / 50.0%), Total Guru 120 (Muballigh Tugasan 51, Muballigh Setempat 68). 

   **Catatan konsistensi data**: 51 + 68 = 119, bukan 120 — ada selisih 1. Ini bisa berarti: (a) ada guru dengan kategori lain yang tidak ditampilkan, (b) filter "Semua Wilayah" tidak benar-benar mencakup seluruh data, atau (c) bug ringan pada aplikasi referensi. Dicatat sebagai temuan, bukan untuk ditiru di Tahap 02.

7. **Absensi memakai 3 status**: HADIR (hijau), ALPA (merah), IZIN (kuning) — bukan 2 status sederhana (hadir/tidak). Data contoh: Hadir 58.6%, Alpa 29.7%, Izin 11.7%.

8. **Filter periode absensi punya 2 mode**: radio button "Bulanan" vs "Semester" — bukan filter tunggal.

9. **Nama folder Pusat Unduhan bersifat konten nyata**, bukan generik: "Buku Paket", "Pembagian Materi Pra Remaja dan Remaja Per-Semester", "RPP", "RPP ASLILAH 2026", "Umum" — menunjukkan folder di-manage manual oleh admin, bukan kategori sistem yang fixed.

10. **Tombol berbentuk pill/fully-rounded** (border-radius sangat besar, bukan 16-20px persegi seperti klaim awal) — untuk button "Refresh Data", "Ganti Peran", dan CTA lain. Card menggunakan radius lebih kecil dan konsisten (~12-16px).

---

## 7. Quality Control — Tahap 01

### Apa yang sudah selesai
- Struktur navigasi (sidebar + top nav) terdokumentasi lengkap
- 11 modul teridentifikasi dengan fungsi inti masing-masing (8 di antaranya sudah terverifikasi visual via screenshot)
- Pola layout dan pola UX terdokumentasi dan **terverifikasi** konsisten di seluruh modul yang di-screenshot
- Inventaris komponen UI tercatat dan terverifikasi
- Skema warna, ikon, tipografi, chart, empty state, dan microcopy **terverifikasi** langsung dari screenshot (Bagian 6)
- 10 temuan baru di luar deskripsi teks awal tercatat (Bagian 6a) — termasuk 2 business rule konkret (kriteria Santri Teladan, mekanisme buka/tutup periode munaqosah)
- Catatan transisi istilah referensi → TPQ sudah dipetakan awal

### Apa yang masih kurang
- Belum ada screenshot untuk: Kalender, Laporan KBM, Peringkat KBM, PPG, halaman form/input, halaman login, tampilan mobile
- Belum ada konfirmasi Anda terhadap pemetaan istilah di Bagian 5
- Modul "PPG" masih belum jelas fungsinya — tidak muncul di screenshot yang dikirim
- Font family eksak dan breakpoint responsive belum bisa dipastikan (butuh inspeksi kode atau devtools, bukan sekadar screenshot)

### Risiko
- **Risiko rendah (menurun dari sebelumnya "sedang")**: Sebagian besar struktur non-visual dan visual kini sudah terverifikasi. Sisa 4 modul tanpa screenshot berisiko kecil menyebabkan revisi di Tahap 02, karena polanya sudah sangat konsisten di 8 modul lain — kemungkinan besar mengikuti pola yang sama.
- **Risiko rendah**: Skala data referensi besar (1.746 santri, 120 guru, multi-desa). Jika skala TPQ Anda jauh lebih kecil, filter Desa/Kelompok bisa jadi berlebihan — masih menunggu konfirmasi skala TPQ Anda.
- **Catatan bukan risiko, tapi perlu diwaspadai**: Ditemukan inkonsistensi kecil pada data referensi sendiri (51+68≠120 pada Data Guru). Ini bukan sesuatu yang perlu ditiru — dicatat agar Tahap 02 tidak mereplikasi bug data serupa.

### Rekomendasi
1. Dokumen ini sudah cukup lengkap dan terverifikasi untuk lanjut ke **Tahap 02 — Reverse Engineering**.
2. Screenshot 4 modul yang belum ada (Kalender, Laporan KBM, Peringkat KBM, PPG) bersifat opsional — bisa menyusul kapan saja dan akan ditambahkan tanpa mengulang tahap ini.
3. Mohon konfirmasi skala TPQ Anda (1 lokasi vs multi-cabang) sebelum Tahap 02, karena ini menentukan apakah struktur filter Desa/Kelompok dipertahankan atau disederhanakan.
4. Mohon konfirmasi juga: apakah kriteria "Santri Teladan" (nilai ≥90, akhlaq ≥90, kehadiran ≥95%) dan konsep "29 Karakter Luhur" (dari welcome message) relevan dipertahankan untuk TPQ Anda, atau itu spesifik ke kurikulum organisasi asal aplikasi referensi?

### Langkah berikutnya
Menunggu keputusan Anda: lanjut ke **Tahap 02 — Reverse Engineering** sekarang, atau kirim screenshot modul yang tersisa terlebih dahulu.

---

**Riwayat Versi**

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | Draft awal | Dokumentasi berbasis deskripsi teks, menunggu verifikasi screenshot |
| 1.1 | Revisi | Verifikasi visual lengkap dari 11 screenshot aplikasi KbmKu (kbm-ku.vercel.app); Bagian 6 diperbarui dari checklist asumsi menjadi hasil verifikasi; Bagian 6a ditambahkan untuk temuan baru (role system, business rules, format data) |
