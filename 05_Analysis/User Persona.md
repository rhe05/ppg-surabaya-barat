# USER PERSONA
## Tahap 08 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ — PPG Surabaya Barat |
| Versi Dokumen | 1.0 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 09 |
| Input | Master PRD.md v1.0, Business Analysis.md v1.2, Market Research.md v1.0 |
| Tahap Berikutnya | 09 — User Journey |

---

## 0. Catatan Metodologi (Penting)

Sesuai batasan yang sudah dinyatakan jujur di Tahap 05 (Market Research §4): **persona di bawah ini disusun dari inferensi terstruktur**, bukan hasil wawancara langsung ke pengurus Kelp Petemon atau Desa Purwodadi. Ini bukan cara ideal menyusun persona — praktik baku (mis. Nielsen Norman Group) merekomendasikan persona berbasis riset pengguna nyata. Ditandai eksplisit di sini, bukan disamarkan seolah berbasis wawancara yang sebenarnya tidak terjadi.

**Nilai tetap ada:** 3 persona di bawah mewakili 3 role yang sudah terkonfirmasi struktural (Tahap 06) — Admin Kelompok, Admin Desa, Admin PPG. Detail seperti usia, latar belakang, dan tingkat melek teknologi bersifat **asumsi wajar** untuk konteks pengurus TPQ berbasis komunitas, ditandai sebagai draft yang idealnya divalidasi dengan obrolan singkat ke pengurus pilot sebelum Tahap 13 (Wireframe).

---

## 1. Persona 1: Admin Kelompok

*(Pengguna dengan frekuensi interaksi tertinggi — entri data harian)*

| Atribut | Deskripsi |
|---|---|
| Nama (ilustratif) | Ustadz Fauzi |
| Peran | Admin Kelompok — mengelola 1 Kelompok (misal Kelp Petemon) |
| Usia (perkiraan) | 25–45 tahun |
| Latar belakang | Pengajar/pengurus TPQ tingkat Kelompok, kemungkinan besar memiliki kesibukan lain (pekerjaan utama di luar TPQ), mengelola TPQ sebagai kegiatan dakwah/sukarela |
| Tingkat melek teknologi | **Bervariasi, kemungkinan rendah-menengah** — problem statement Tahap 03 mengonfirmasi belum ada sistem digital sama sekali di organisasi ini, sehingga tidak bisa diasumsikan pengguna terbiasa dengan aplikasi manajemen data |
| Perangkat utama (asumsi) | Smartphone Android — lebih umum dipakai sehari-hari dibanding laptop/desktop untuk pengurus komunitas tingkat Kelompok; perlu divalidasi |
| Frekuensi penggunaan | Tinggi — harian (kehadiran) hingga mingguan (Munaqosah, konseling) |

**Tujuan menggunakan sistem:**
- Mencatat kehadiran santri dengan cepat, idealnya tidak lebih lama dari mencatat manual di buku
- Menilai hafalan (Munaqosah) dan mencatat perkembangan santri tanpa proses berbelit
- Melihat gambaran singkat kondisi Kelompoknya sendiri

**Pain point (hipotesis, berdasar Problem Statement Tahap 03):**
- Selama ini mencatat manual di buku/kertas — rawan hilang, sulit direkap
- Tidak ada cara mudah melaporkan kondisi Kelompok ke Desa/PPG selain manual/lisan
- Kemungkinan cemas menggunakan sistem baru karena belum pernah pakai sistem digital serupa

**Implikasi desain:** Antarmuka Admin Kelompok harus **paling sederhana** di antara 3 role — tugas paling sering (entri kehadiran) harus bisa diselesaikan dalam sedikit langkah, idealnya dioptimalkan untuk mobile.

---

## 2. Persona 2: Admin Desa

*(Pengguna dengan kebutuhan agregasi lintas-Kelompok)*

| Atribut | Deskripsi |
|---|---|
| Nama (ilustratif) | Bapak Hariyanto |
| Peran | Admin Desa — mengawasi seluruh Kelompok di 1 Desa (misal Desa Purwodadi, 3 Kelompok) |
| Usia (perkiraan) | 35–55 tahun |
| Latar belakang | Pengurus tingkat Desa, kemungkinan koordinasi dengan beberapa Admin Kelompok, punya tanggung jawab pelaporan ke PPG |
| Tingkat melek teknologi | Menengah — kemungkinan lebih terbiasa dengan spreadsheet/aplikasi dasar dibanding Admin Kelompok, karena perannya lebih administratif |
| Perangkat utama (asumsi) | Kombinasi smartphone dan laptop/desktop — untuk keperluan rekap yang mungkin butuh layar lebih besar |
| Frekuensi penggunaan | Menengah — mingguan/bulanan, terutama saat rekap periode |

**Tujuan menggunakan sistem:**
- Membandingkan performa antar-Kelompok dalam Desanya (relevan khusus untuk Desa Purwodadi yang online penuh sejak pilot)
- Membuka/menutup periode Munaqosah untuk seluruh Kelompok di Desanya
- Melapor ke PPG tanpa merekap manual dari tiap Kelompok

**Pain point (hipotesis):**
- Sebelumnya harus mengumpulkan laporan manual dari tiap Kelompok satu-per-satu
- Sulit membandingkan Kelompok secara adil tanpa data terstandar

**Implikasi desain:** Dashboard Desa perlu **kemampuan bandingkan antar-Kelompok** (side-by-side atau tabel ringkas) — bukan sekadar total agregat, karena nilai utamanya adalah insight komparatif.

---

## 3. Persona 3: Admin PPG

*(Pengguna dengan visibilitas menyeluruh, frekuensi lebih jarang tapi berdampak luas)*

| Atribut | Deskripsi |
|---|---|
| Nama (ilustratif) | Ustadz H. Bambang |
| Peran | Admin PPG — mengawasi seluruh 5 Desa dan 18 Kelompok |
| Usia (perkiraan) | 40–60 tahun |
| Latar belakang | Pimpinan/koordinator pusat PPG Surabaya Barat, kemungkinan kurang terlibat teknis harian, lebih pada pengambilan keputusan strategis |
| Tingkat melek teknologi | Bervariasi, tidak bisa diasumsikan tinggi — perlu antarmuka yang tetap sederhana meski datanya kompleks |
| Perangkat utama (asumsi) | Kemungkinan besar desktop/laptop untuk sesi rekap, smartphone untuk cek cepat |
| Frekuensi penggunaan | Rendah-menengah — periodik (evaluasi bulanan/semester), tapi keputusannya berdampak luas (misal mengaktifkan Kelompok baru) |

**Tujuan menggunakan sistem:**
- Melihat gambaran menyeluruh seluruh organisasi tanpa harus meminta laporan manual dari 5 Desa
- Mengaktifkan/menonaktifkan status Kelompok sesuai kesiapan rollout bertahap
- Membuka/menutup periode Munaqosah secara terpusat jika diperlukan

**Pain point (hipotesis):**
- Selama ini kemungkinan tidak punya visibilitas real-time ke kondisi seluruh Desa/Kelompok
- Keputusan strategis (misal perluasan rollout) sulit didasarkan data karena data tersebar manual

**Implikasi desain:** Dashboard PPG adalah level **paling ringkas namun paling luas cakupannya** — prioritaskan ringkasan tingkat tinggi (bukan detail operasional harian yang jadi urusan Admin Kelompok).

---

## 4. Tabel Perbandingan Cepat

| Aspek | Admin Kelompok | Admin Desa | Admin PPG |
|---|---|---|---|
| Frekuensi pakai | Tinggi (harian) | Menengah (mingguan) | Rendah (periodik) |
| Kedalaman data yang dilihat | Sangat detail (per santri) | Menengah (per Kelompok) | Ringkas (per Desa) |
| Perangkat dominan (asumsi) | Mobile | Campuran | Desktop |
| Risiko kurva belajar | Tertinggi (paling awam teknologi) | Menengah | Menengah-rendah |
| Dampak kesalahan | Terbatas ke 1 Kelompok | Terbatas ke 1 Desa | Berdampak ke seluruh organisasi |

---

## 5. Quality Control — Tahap 08

### Apa yang sudah selesai
- 3 persona tersusun mewakili seluruh role terkonfirmasi (Admin Kelompok, Desa, PPG)
- Tujuan dan pain point diturunkan konsisten dari Problem Statement (Tahap 03) dan Business Analysis (Tahap 06), bukan dikarang bebas
- Implikasi desain per persona dicatat untuk menjadi input Tahap 13 (Wireframe)
- Metodologi ditandai jujur sebagai inferensi, bukan hasil riset pengguna langsung

### Apa yang masih kurang
- **Tidak ada validasi langsung ke pengguna nyata** — sama seperti keterbatasan yang sudah dicatat di Tahap 05, ini belum berubah
- Detail seperti usia dan tingkat melek teknologi adalah asumsi wajar, bukan data terverifikasi

### Risiko
- **Risiko sedang**: Jika asumsi tingkat melek teknologi (terutama Admin Kelompok) meleset — misalnya pengurus sebenarnya cukup familiar dengan aplikasi smartphone sehari-hari — desain UI di Tahap 13-15 bisa jadi terlalu disederhanakan atau sebaliknya terlalu kompleks. Mitigasi terbaik tetap validasi singkat ke pengurus pilot.

### Rekomendasi
1. Jika memungkinkan sebelum Tahap 13 (Wireframe), coba tanyakan langsung ke 1 Admin Kelompok pilot: seberapa terbiasa mereka pakai aplikasi seperti WhatsApp, Google Form, atau sejenisnya? Ini akan memvalidasi/mengoreksi asumsi tingkat melek teknologi di atas.
2. Jika tidak memungkinkan, lanjutkan — persona ini cukup untuk dasar Tahap 09 (User Journey), karena fokusnya pada peran & tujuan yang sudah solid (bukan detail personal yang masih asumsi).

### Langkah berikutnya
Menunggu persetujuan Anda untuk lanjut ke **Tahap 09 — User Journey**.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal 3 persona (Admin Kelompok, Desa, PPG) berdasarkan Master PRD.md v1.0 dan Business Analysis.md v1.2 |
