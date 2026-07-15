# PRODUCT VISION
## Tahap 03 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ |
| Versi Dokumen | 1.1 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 04 |
| Input | Benchmark.md v1.1, Reverse_Engineering.md v1.1 |
| Tahap Berikutnya | 04 — Product Strategy |

---

## 0. Konteks Terkonfirmasi (Ringkasan dari Tahap 01–02)

| Aspek | Status |
|---|---|
| Struktur organisasi | 3 tingkat: **PPG → Desa (5) → Kelompok (18)** |
| Kategori/jenjang | AUD, Cabe Rawit, Pra Remaja, Remaja — dipertahankan sama seperti referensi, **penempatan berdasarkan kemampuan**, bukan otomatis dari usia |
| Business rule tetap | Kriteria Santri Teladan (Nilai ≥90, Akhlaq ≥90, Kehadiran ≥95%) dan konsep "Karakter Luhur" — tidak diubah |
| Modul yang dipertahankan | Dashboard, Data Santri, Data Guru, Absen Santri, Munaqosah, Bimbingan Konseling, Pusat Unduhan, Kalender, Laporan KBM, Peringkat KBM, PPG (level admin pusat) |

**Catatan penting:** "Penempatan berdasarkan kemampuan" adalah detail baru yang berimplikasi pada desain sistem — berarti ada proses evaluasi/asesmen yang menentukan pindah-kelompok santri, bukan sekadar field statis "kelompok = X". Ini dicatat sebagai kebutuhan fungsional untuk Tahap 07 (PRD) dan Tahap 12 (Business Rules), bukan diasumsikan detail mekanismenya sekarang.

---

## 1. Vision Statement

> **Menjadi sistem manajemen tunggal yang membantu pengurus TPQ — dari tingkat Kelompok, Desa, hingga PPG — mencatat, memantau, dan mengambil keputusan atas perkembangan santri dan kinerja pengajaran secara akurat, transparan, dan tanpa duplikasi kerja administratif.**

Visi ini disusun berdasarkan pola kebutuhan yang tampak konsisten di seluruh modul hasil reverse engineering: setiap modul pada akhirnya berputar di sekitar **satu pertanyaan inti** — *"Bagaimana kondisi santri dan pengajaran saat ini, di setiap level organisasi?"* — baik itu kehadiran, hafalan, karakter, maupun dokumentasi kegiatan.

---

## 2. Misi Produk

Untuk mencapai visi tersebut, aplikasi ini akan:

1. **Menyatukan pencatatan data** santri, guru, kehadiran, dan penilaian ke dalam satu sistem — menggantikan pencatatan manual/tersebar yang rawan tidak konsisten.
2. **Menyediakan visibilitas berjenjang** — pengurus Kelompok melihat data kelompoknya, pengurus Desa melihat agregat 18 Kelompok di 5 Desa (jika berwenang), dan PPG melihat gambaran menyeluruh lintas-Desa.
3. **Mendukung proses kenaikan jenjang berbasis kemampuan** — bukan sekadar pencatatan status, tapi alur asesmen yang menjadi dasar keputusan pindah kelompok.
4. **Menjaga integritas data** — mencegah kejadian seperti inkonsistensi angka (temuan Tahap 02: 51+68≠120 pada referensi) melalui validasi struktural, bukan sekadar tampilan.
5. **Melindungi data sensitif santri** (khususnya Bimbingan Konseling) dengan kontrol akses yang jelas per role.

---

## 3. Nilai Produk (Value Proposition)

| # | Nilai | Penjelasan |
|---|---|---|
| 1 | **Akurasi berjenjang** | Data yang tampil di level PPG harus selalu bisa ditelusuri balik ke level Kelompok — tidak ada angka "mengambang" tanpa sumber. |
| 2 | **Satu sumber kebenaran (single source of truth)** | Data santri, guru, dan penilaian tidak lagi tersebar di file/catatan terpisah per Kelompok. |
| 3 | **Transparansi progres santri** | Wali/pengurus dapat melihat riwayat hafalan, kehadiran, dan karakter santri secara utuh, bukan terpotong per modul. |
| 4 | **Privasi yang dihormati** | Data sensitif (konseling) tidak terbuka default ke semua role — akses dibatasi secara sadar. |
| 5 | **Efisiensi administratif** | Mengurangi entri data berulang dan rekap manual lintas-Kelompok/Desa. |

---

## 4. Problem Statement

**Status: Terkonfirmasi.** TPQ Anda **belum memiliki sistem digital sama sekali** — bukan migrasi dari sistem lama yang bermasalah, melainkan transisi dari proses manual ke sistem terdigitalisasi pertama kali.

Ini mengubah beberapa implikasi penting dibanding draft sebelumnya:

- **Tidak ada data lama yang perlu dimigrasikan** dari sistem sebelumnya — tapi kemungkinan ada catatan manual (buku, spreadsheet, arsip fisik) yang perlu dientri ulang saat peluncuran. Perlu digali di Tahap 04/07 apakah ada proses onboarding data historis.
- **Tidak ada ekspektasi pengguna yang terbentuk dari sistem lama** — memberi keleluasaan desain UX, tapi juga berarti kurva belajar dari nol untuk seluruh pengguna (pengurus Kelompok, Desa, PPG).
- **Skala data langsung besar sejak hari pertama**: 5 Desa dan 18 Kelompok berarti peluncuran bukan skenario "mulai kecil dulu" — sistem perlu siap menangani struktur berjenjang penuh sejak awal, bukan bertahap per-Kelompok.

**Rumusan masalah (final):**

> Pengelolaan data santri, guru, kehadiran, hafalan, dan perkembangan karakter di TPQ saat ini dilakukan **secara manual**, tersebar di 18 Kelompok pada 5 Desa di bawah koordinasi PPG. Tanpa sistem terpusat, pengurus di level Desa dan PPG tidak memiliki cara praktis untuk memperoleh gambaran menyeluruh, memantau konsistensi antar-Kelompok, atau mengambil keputusan berbasis data yang akurat dan real-time.

---

## 5. Cakupan Vision (Tingkat Tinggi — Bukan Daftar Fitur)

### 5.1 Termasuk dalam Visi
- Manajemen data santri dan guru berjenjang (Kelompok → Desa → PPG)
- Pencatatan dan analisis kehadiran
- Pengelolaan ujian hafalan (Munaqosah) dan penilaian karakter
- Pencatatan bimbingan konseling dengan kontrol privasi
- Dokumentasi dan materi ajar bersama
- Kalender kegiatan dan pelaporan KBM
- Sistem peringkat/apresiasi (Santri Teladan, Peringkat KBM)
- Kontrol akses berbasis role (RBAC), selaras temuan "Ganti Peran" di Tahap 01

### 5.2 Di Luar Visi (Terkonfirmasi)
- **Pembayaran/keuangan (SPP, infaq)** — dikonfirmasi **bukan prioritas**, tidak masuk cakupan visi ini.
- **Komunikasi langsung ke wali santri** (notifikasi WA/SMS/app) — dikonfirmasi **bukan prioritas**, tidak masuk cakupan visi ini.
- Sertifikat digital/kelulusan khatam — belum ditanyakan langsung, mengikuti asumsi "bukan prioritas" kecuali dikoreksi.

---

## 6. Prinsip Desain yang Mengikat Visi Ini

Diturunkan langsung dari kelemahan yang ditemukan di Tahap 02, agar tidak terulang:

1. **Setiap angka ringkasan harus bisa direkonsiliasi ke data rincinya** — tidak ada agregat yang "terpisah" dari sumber datanya.
2. **Konteks filter (Semester, PPG/Desa/Kelompok) bersifat global dan konsisten**, tidak diulang secara independen dan berpotensi tidak sinkron di tiap halaman.
3. **Status apa pun (Munaqosah, Absensi, Konseling) memakai kode warna konsisten** di seluruh aplikasi.
4. **Data sensitif punya batas akses eksplisit**, dinyatakan di level desain, bukan diasumsikan aman karena "belum diminta publik".
5. **Alur bisnis inti (search → filter → lihat detail → aksi) dipertahankan** karena sudah teruji di aplikasi referensi — perubahan hanya dilakukan jika ada alasan konkret.

---

## 7. Quality Control — Tahap 03

### Apa yang sudah selesai
- Vision statement, misi, dan nilai produk tersusun berdasarkan konteks organisasi terkonfirmasi (PPG/Desa/Kelompok)
- Prinsip desain yang mengikat tahap-tahap berikutnya sudah diturunkan langsung dari temuan Tahap 02
- Cakupan visi tingkat tinggi (in/out of scope) sudah dipetakan dan **dikonfirmasi**
- **Problem Statement terkonfirmasi final**: belum ada sistem sama sekali, bukan migrasi — dengan implikasi langsung terhadap kebutuhan onboarding data historis dan kesiapan skala penuh sejak hari pertama
- Pembayaran/SPP dan notifikasi wali santri **dikonfirmasi di luar cakupan**

### Apa yang masih kurang
- Mekanisme "kenaikan jenjang berbasis kemampuan" (asesmen) belum dirinci — statusnya baru "dicatat sebagai kebutuhan", didesain di tahap selanjutnya
- Belum diketahui apakah ada catatan manual (buku/spreadsheet) yang perlu di-entry ulang saat peluncuran — relevan untuk Tahap 04 (strategi rollout) dan Tahap 16 (Database Design)

### Risiko
- **Risiko rendah**: Karena tidak ada sistem lama, tidak ada risiko migrasi data yang gagal — namun ada risiko *change management* (pengguna belum terbiasa dengan sistem digital sama sekali), perlu dipertimbangkan di Tahap 04 (strategi adopsi/pelatihan).
- **Risiko rendah**: Skala penuh sejak awal (5 Desa, 18 Kelompok) berarti pengujian (Tahap 22) perlu mencakup skenario multi-Kelompok sejak awal, bukan disederhanakan dulu.

### Rekomendasi
1. Lanjut ke **Tahap 04 — Product Strategy** — seluruh prasyarat visi sudah lengkap dan terkonfirmasi.
2. Di Tahap 04, bahas strategi rollout: apakah peluncuran serentak ke 18 Kelompok, atau bertahap (pilot beberapa Kelompok dulu)? Ini penting mengingat tidak ada pengguna yang familiar dengan sistem digital sebelumnya.

### Langkah berikutnya
Menunggu persetujuan Anda untuk lanjut ke **Tahap 04 — Product Strategy**.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal Product Vision berdasarkan Benchmark.md v1.1 dan Reverse_Engineering.md v1.1 |
| 1.1 | Problem Statement dikonfirmasi final (belum ada sistem sama sekali); cakupan di luar visi (pembayaran, notifikasi wali) dikonfirmasi |
