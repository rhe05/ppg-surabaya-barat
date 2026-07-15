# REVERSE ENGINEERING
## Tahap 02 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ |
| Versi Dokumen | 1.1 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 03 |
| Input | 01_Benchmark/Benchmark.md v1.1 |
| Tahap Berikutnya | 03 — Product Vision |

---

## 0. Status Asumsi (Diperbarui — Sudah Dikonfirmasi)

Dua pertanyaan terbuka dari Tahap 01 sudah dijawab. Tabel di bawah menggantikan asumsi sebelumnya dengan fakta terkonfirmasi:

| Pertanyaan | Jawaban Terkonfirmasi | Dampak |
|---|---|---|
| Skala TPQ | **Multi-cabang, dengan hierarki 3 tingkat**: PPG membawahi 5 Desa, dan ke-5 Desa tersebut membawahi total 18 Kelompok. Ini bukan skenario 1 lokasi -- struktur organisasi TPQ Anda memang berjenjang. | Tinggi -- filter Desa/Kelompok di aplikasi referensi **bukan over-engineering**, melainkan cerminan struktur organisasi nyata Anda. Filter ini dipertahankan sebagai kebutuhan inti, bukan opsional. |
| Kriteria Santri Teladan & "Karakter Luhur" | **Jangan diubah** -- dipertahankan persis seperti pada aplikasi referensi. | Kriteria (Nilai>=90, Akhlaq>=90, Kehadiran>=95%) dan konsep "Karakter Luhur" masuk sebagai business rule tetap di Tahap 09, bukan konfigurasi bebas. |
| Modul PPG | **Tidak disetujui untuk dihapus.** Lihat Bagian 2.11 yang direvisi -- PPG ternyata bukan modul tanpa fungsi, melainkan **level administratif tertinggi** dalam struktur organisasi (PPG -> Desa -> Kelompok). | Tinggi -- mengubah pemahaman terhadap keseluruhan hierarki data organisasi, bukan cuma satu modul. |

## 1. Metodologi

Reverse engineering dilakukan dalam 4 langkah per modul:
1. **Identifikasi fungsi** — masalah apa yang sebenarnya diselesaikan modul ini bagi penggunanya?
2. **Identifikasi kelemahan** — dievaluasi memakai heuristik Nielsen Norman Group (10 Usability Heuristics) dan karakteristik kualitas ISO 25010 (functional suitability, usability, maintainability, scalability), **hanya berdasarkan bukti dari screenshot**, bukan dugaan tanpa dasar.
3. **Keputusan desain** — Pertahankan / Modifikasi / Hapus / Tambah, dengan alasan.
4. **Batasan alur bisnis** — perubahan pada alur inti (search→filter→lihat detail→aksi) hanya diusulkan jika ada alasan konkret; jika tidak, alur dipertahankan sesuai instruksi kerja.

---

## 2. Analisis Fungsi & Kelemahan per Modul

### 2.1 Dashboard

**Fungsi:** Memberi ringkasan cepat kondisi TPQ secara keseluruhan tanpa perlu membuka tiap modul.

**Kelemahan teridentifikasi (berbasis bukti):**
- **Filter ganda dan terpisah** — terdapat dua blok filter Desa/Kelompok berbeda di satu halaman yang sama (satu di bagian "Santri Teladan", satu lagi di bagian "Filter Data" terpisah). Tidak jelas apakah keduanya saling terhubung atau independen → melanggar heuristik *konsistensi & standar* serta menambah beban kognitif.
- **Empty state KPI terlalu mencolok** — card KPI kosong ("Belum ada data") tetap ditampilkan dengan warna solid penuh (biru/hijau/kuning/merah), sehingga secara visual sulit dibedakan dari card yang berisi data valid → berisiko membuat pengguna mengira sistem error, melanggar heuristik *visibility of system status*.
- **Pesan sambutan berisi konten program spesifik** ("29 Karakter Luhur") yang tertanam langsung di teks aplikasi, bukan konten yang bisa diubah admin → kelemahan *maintainability* (ISO 25010): setiap TPQ dengan program berbeda harus mengubah kode, bukan konfigurasi.

**Keputusan:** **Modifikasi**. Fungsi ringkasan dipertahankan sepenuhnya (alur bisnis inti tidak berubah), tapi struktur filter disatukan dan empty state dirancang ulang.

---

### 2.2 Data Santri

**Fungsi:** Direktori dan alat analisis populasi santri untuk kebutuhan administratif dan pelaporan cepat.

**Kelemahan teridentifikasi:**
- Pola *search → filter → statistik → grafik → tombol "Lihat Data"* baik untuk analisis, tapi menambah satu langkah ekstra untuk tugas paling umum: mencari satu santri tertentu. Pengguna yang hanya ingin melihat data satu anak harus melewati layar statistik dulu.
- Tidak ada indikasi apakah pencarian bersifat *live* (langsung update) atau perlu submit — ambigu dari screenshot statis (dicatat sebagai *tidak terverifikasi*, bukan kelemahan pasti).

**Kekuatan yang dipertahankan:**
- Toggle "Sembunyikan Grafik" adalah pola bagus — memberi kontrol kepadatan informasi kepada pengguna.
- Statistik real-time mengikuti filter adalah pola yang solid dan sesuai kebutuhan.

**Keputusan:** **Pertahankan struktur inti, Modifikasi kecil** — tambahkan akses cepat "quick search" langsung ke data individual tanpa harus melalui halaman statistik terlebih dahulu, sebagai jalur alternatif (bukan pengganti).

---

### 2.3 Data Guru

**Fungsi:** Direktori pengajar dan rekap jumlah berdasarkan kategori penugasan.

**Kelemahan teridentifikasi:**
- **Inkonsistensi data**: 51 + 68 = 119, bukan 120 (Total Guru). Menandakan ada guru tanpa kategori yang tidak ditampilkan dalam breakdown, atau logika agregasi tidak lengkap → kelemahan *functional suitability* (ISO 25010): angka ringkasan harus selalu bisa direkonsiliasi ke rincinya.
- **Kedalaman analitik tidak konsisten** dibanding Data Santri — Data Santri punya breakdown gender + kelas + grafik, Data Guru hanya punya 3 angka datar tanpa visualisasi → melanggar heuristik *konsistensi* antar-modul yang setara fungsinya.

**Keputusan:** **Modifikasi**. Pertahankan fungsi direktori, tapi (a) pastikan logika agregasi selalu balance dengan total, (b) samakan kedalaman analitik dengan Data Santri jika relevan untuk TPQ (misal breakdown ustadz/ustadzah, jenjang mengajar).

---

### 2.4 Absen Santri

**Fungsi:** Rekap kehadiran untuk memantau keaktifan santri per periode.

**Kelemahan teridentifikasi:**
- **5 filter dalam satu form** (Tipe Periode, Bulan, Tahun, Desa, Kelompok, Kelas) tanpa tombol "Terapkan" yang terlihat → tidak jelas kapan data ter-update, berisiko pengguna bingung apakah harus klik sesuatu (*visibility of system status*).
- **Tidak ada nudge proaktif**: Alpa 29.7% adalah angka cukup tinggi, tapi ditampilkan datar seperti angka netral lainnya, tanpa penanda "perlu perhatian" → peluang yang terlewat untuk *functional suitability* yang lebih baik (sistem laporan idealnya membantu pengguna menemukan masalah, bukan hanya menyajikan angka).

**Kekuatan yang dipertahankan:**
- 3 status (Hadir/Alpa/Izin) lebih informatif dibanding sekadar hadir/tidak — dipertahankan.
- Pie chart + kartu persentase besar mudah dibaca sekilas — dipertahankan.

**Keputusan:** **Pertahankan konsep 3-status dan visualisasi, Modifikasi** UX filter (perjelas kapan data ter-update) dan tambahkan indikator "santri berisiko" (mis. badge visual jika alpa melewati ambang tertentu) sebagai *value-add* — akan dirinci alasannya lebih lanjut di Tahap 09 (Business Rules) agar bukan sekadar dekorasi, tapi berbasis aturan yang jelas.

---

### 2.5 Munaqosah

**Fungsi:** Mengelola dan menilai ujian hafalan santri, termasuk penentuan status kelulusan/progress.

**Kelemahan teridentifikasi:**
- **Banner peringatan tanpa informasi tindak lanjut**: pesan "dinonaktifkan sementara oleh Admin" tidak menyebutkan kapan dibuka kembali atau siapa yang bisa dihubungi → melanggar heuristik *help users recognize, diagnose, and recover from errors* (pengguna tahu ada masalah tapi tidak tahu harus apa).
- **Status "Belum Dinilai" tanpa kode warna**, padahal modul lain di aplikasi yang sama (Absen, Dashboard) konsisten memakai warna semantik untuk status → inkonsistensi visual antar-modul.

**Keputusan:** **Pertahankan fungsi inti sepenuhnya** — Munaqosah sangat relevan langsung untuk TPQ (ujian hafalan Al-Qur'an). **Modifikasi**: banner mencantumkan estimasi/kontak, status memakai badge berwarna konsisten dengan modul lain.

---

### 2.6 Bimbingan Konseling

**Fungsi:** Mencatat dan memantau isu perilaku/karakter santri dari waktu ke waktu.

**Kelemahan teridentifikasi:**
- **Tidak ada indikator kerahasiaan/pembatasan akses** yang terlihat di UI, padahal data ini bersifat sensitif (catatan masalah pribadi anak). Mengingat data menyangkut anak-anak, ini bukan sekadar preferensi desain melainkan pertimbangan privasi yang layak ditegaskan di level produk.
- **Tidak ada filter rentang tanggal**, hanya kategori dan status — berisiko sulit ditelusuri jika riwayat sudah panjang.

**Keputusan:** **Pertahankan fungsi inti, Modifikasi**: (a) tambahkan penegasan akses terbatas (siapa yang boleh melihat/menulis dicatat sebagai business rule di Tahap 09, bukan sekadar UI), (b) tambahkan filter tanggal.

---

### 2.7 Pusat Unduhan

**Fungsi:** Repositori dokumen bersama (materi ajar, RPP, dll).

**Kelemahan teridentifikasi:**
- **Struktur folder datar tanpa metadata** — nama folder seperti "RPP" dan "RPP ASLILAH 2026" terlihat tumpang tindih/ambigu tanpa konteks tambahan (tanggal upload, ukuran, pengunggah) → risiko *scalability* (ISO 25010): semakin banyak folder, semakin sulit ditelusuri tanpa pencarian atau tag.
- **Tidak ada pencarian**, berbeda dengan Data Santri/Guru yang punya search — inkonsistensi pola antar-modul.

**Keputusan:** **Modifikasi**. Pertahankan konsep folder (familiar bagi pengguna awam), tambahkan pencarian dan metadata dasar (tanggal, pengunggah) tanpa mengubah alur inti "klik folder → lihat isi".

---

### 2.8 – 2.10 Kalender, Laporan KBM, Peringkat KBM

**Status:** Belum ada screenshot untuk ketiga modul ini. Analisis kelemahan tidak bisa dilakukan berbasis bukti — hanya bisa mengandalkan deskripsi teks dari Tahap 01, yang **tidak cukup detail** untuk evaluasi heuristik yang jujur.

**Keputusan:** **Pertahankan konsep sebagai placeholder**, evaluasi kelemahan ditunda sampai screenshot tersedia (opsional, tidak menghambat tahap berikutnya). Fungsi dasarnya (jadwal kegiatan, kumpulan laporan, sistem ranking) tetap relevan untuk TPQ dan bisa masuk Tahap 03–04 sebagai modul awal, dengan detail UX difinalisasi belakangan.

---

### 2.11 PPG (Direvisi — Konfirmasi Diterima)

**Fungsi (terkonfirmasi):** PPG bukan modul fitur biasa seperti 10 modul lainnya, melainkan mencerminkan **level administratif tertinggi** dalam struktur organisasi TPQ Anda:

```
PPG (1)
 └── Desa (5)
       └── Kelompok (18)
```

Pemahaman awal di Tahap 01 ("modul tidak jelas fungsinya") **keliru** — dengan konfirmasi Anda, jelas bahwa PPG adalah unit koordinasi pusat yang membawahi 5 Desa, dan tiap Desa membawahi beberapa Kelompok (total 18). Ini konsisten dengan pola "Ganti Peran" yang ditemukan di Tahap 01: kemungkinan besar menu "PPG" adalah tampilan/dashboard khusus untuk role di level pusat, memberi visibilitas lintas-Desa yang tidak dimiliki role di level Desa atau Kelompok.

**Dampak terhadap analisis sebelumnya:** Temuan Bagian 3 (Kelemahan Lintas-Modul) soal "filter Desa/Kelompok diulang independen" perlu dibaca ulang dengan konteks ini — filter tersebut bukan kerumitan berlebih, melainkan representasi wajar dari struktur organisasi 3 tingkat yang nyata.

**Keputusan (direvisi):** **Pertahankan.** PPG dipertahankan sebagai level administratif dalam struktur data dan kemungkinan sebagai halaman/dashboard tersendiri untuk role tingkat pusat. Detail cakupan tampilan (data apa saja yang terlihat di level PPG vs Desa vs Kelompok) akan dirinci di Tahap 06 (Business Analysis) bersamaan dengan definisi hak akses per role.

---

## 3. Kelemahan Lintas-Modul (Struktural)

| # | Temuan | Heuristik/Standar Terkait | Keputusan |
|---|---|---|---|
| 1 | Filter (Desa/Kelompok/Kelas/Semester) diulang independen di tiap modul, bukan konteks global yang tersambung | Efisiensi penggunaan, DRY | **Tambah**: rancang context bar global (semester aktif, unit/cabang aktif) yang persisten di seluruh aplikasi, filter lokal tetap ada untuk hal spesifik modul |
| 2 | Istilah organisasi (Desa, Kelompok AUD/Cabe Rawit/dst, Muballigh Tugasan/Setempat) tertanam sebagai label tetap | Maintainability, extensibility (ISO 25010) | **Tambah**: label-label ini dibuat dapat dikonfigurasi admin, bukan hardcode — penting karena kita memang sedang mengadaptasi ke domain TPQ |
| 3 | Sistem role ("Peninjau" + Ganti Peran) terbukti ada, tapi cakupan hak akses tiap role tidak terlihat dari screenshot | Security (ISO 25010) | **Pertahankan konsep RBAC**, detail hak akses per role didefinisikan di Tahap 06 (Business Analysis) |
| 4 | Data sensitif (Bimbingan Konseling) tidak punya penegasan privasi di level produk | Security & privasi (relevan karena subjek data anak-anak) | **Tambah** sebagai prinsip desain wajib, bukan opsional |

**Catatan pembaruan (setelah konfirmasi skala TPQ):**
- **Poin 1** tetap berlaku, tapi konteksnya berubah: context bar global sekarang harus mendukung hierarki nyata **PPG > Desa (5) > Kelompok (18)** -- bukan sekadar konsep abstrak "unit/cabang".
- **Poin 2** tetap berlaku sebagai keputusan desain (istilah dibuat dapat dikonfigurasi demi maintainability), namun nilai default-nya sekarang jelas: **PPG, Desa, Kelompok** adalah istilah organisasi yang nyata dipakai TPQ Anda -- bukan istilah asing dari organisasi lain yang perlu diterjemahkan. Kategori usia (AUD/Cabe Rawit/Pra Remaja/Remaja) statusnya belum dikonfirmasi terpisah -- akan ditanyakan di Tahap 03.

---

## 4. Potensi Gap Fitur Khusus TPQ (Belum Ada di Aplikasi Referensi)

Bagian ini **bukan keputusan final** — hanya daftar awal untuk dibahas di Tahap 11 (Feature Breakdown). Dicatat sekarang karena teridentifikasi selama reverse engineering, mengingat aplikasi referensi dirancang untuk organisasi dakwah skala besar, bukan spesifik TPQ:

- Progress hafalan/bacaan per jilid Iqro atau juz Al-Qur'an (berbeda dari Munaqosah yang sifatnya ujian formal — ini pencatatan harian)
- Pencatatan pembayaran SPP/infaq bulanan
- Sertifikat/rapor digital, termasuk kelulusan/khatam Al-Qur'an
- Komunikasi ke wali santri (notifikasi kehadiran, nilai, atau info kegiatan)
- Jadwal mengajar per ustadz/ustadzah (bukan hanya kalender kegiatan umum)

**Catatan:** Ini murni observasi gap, bukan rekomendasi untuk langsung dibangun. Keputusan fitur mana yang masuk MVP ada di Tahap 03–04 dan 11, tergantung kebutuhan Anda.

---

## 5. Ringkasan Keputusan Desain per Modul

| Modul | Keputusan | Alasan Singkat |
|---|---|---|
| Dashboard | Modifikasi | Filter ganda & empty state membingungkan; konten hardcode |
| Data Santri | Pertahankan struktur, modifikasi kecil | Pola sudah baik; tambah jalur pencarian cepat |
| Data Guru | Modifikasi | Data inconsistency & analitik tidak setara dengan Data Santri |
| Absen Santri | Pertahankan konsep, modifikasi UX | Filter ambigu, kurang nudge proaktif |
| Munaqosah | Pertahankan, modifikasi kecil | Sangat relevan untuk TPQ; hanya perlu perbaikan komunikasi status |
| Bimbingan Konseling | Pertahankan, modifikasi | Perlu penegasan privasi & filter tanggal |
| Pusat Unduhan | Modifikasi | Tidak ada pencarian/metadata, berisiko tidak scalable |
| Kalender | Pertahankan (tunda evaluasi) | Belum ada bukti visual |
| Laporan KBM | Pertahankan (tunda evaluasi) | Belum ada bukti visual |
| Peringkat KBM | Pertahankan (tunda evaluasi) | Belum ada bukti visual |
| PPG | **Pertahankan (direvisi)** | Terkonfirmasi sebagai level administratif pusat, membawahi 5 Desa & 18 Kelompok |
| Filter global | **Tambah (baru)** | Gap struktural — filter berulang di tiap modul |
| Konfigurasi terminologi | **Tambah (baru)** | Gap struktural — label organisasi tertanam keras |

---

## 6. Quality Control — Tahap 02

### Apa yang sudah selesai
- Fungsi inti seluruh 11 modul referensi teridentifikasi — termasuk PPG yang kini terkonfirmasi sebagai level administratif pusat (bukan lagi modul tak jelas)
- Kelemahan konkret (berbasis bukti screenshot, bukan dugaan) ditemukan di 7 dari 11 modul yang punya screenshot
- 4 kelemahan struktural lintas-modul teridentifikasi, dan dikontekstualisasikan ulang dengan hierarki nyata PPG > Desa (5) > Kelompok (18)
- Keputusan desain final (Pertahankan/Modifikasi/Tambah) ditetapkan untuk semua modul — tidak ada lagi modul berstatus "Hapus"
- Gap fitur khusus TPQ dicatat sebagai bahan Tahap 11
- Ketiga pertanyaan terbuka dari Tahap 01 sudah terjawab dan didokumentasikan (Bagian 0)

### Apa yang masih kurang
- 3 modul (Kalender, Laporan KBM, Peringkat KBM) masih belum bisa dievaluasi kelemahannya karena tidak ada screenshot — sifatnya opsional, tidak menghambat
- Cakupan tampilan data per level (PPG vs Desa vs Kelompok) dan per role belum dirinci — ditunda ke Tahap 06 (Business Analysis) secara sadar, bukan celah yang terlewat
- Status kategori usia (AUD/Cabe Rawit/Pra Remaja/Remaja) — apakah dipertahankan identik seperti "Desa/Kelompok/PPG", atau TPQ Anda pakai jenjang berbeda (misal jenjang Iqro/Juz) — belum ditanyakan secara terpisah

### Risiko
- **Risiko rendah**: Tanpa screenshot 3 modul tersisa, ada kemungkinan kecil revisi saat detail visualnya masuk — pola dari 8 modul lain sudah cukup konsisten untuk dijadikan pegangan sementara.
- **Risiko rendah**: Keputusan "Tambah: filter global & konfigurasi terminologi" menambah kompleksitas arsitektur dibanding meniru langsung aplikasi referensi. Ini keputusan sadar demi maintainability jangka panjang, dan sekarang punya justifikasi lebih kuat karena hierarki organisasi terkonfirmasi nyata (bukan spekulasi).

### Rekomendasi
1. Lanjut ke **Tahap 03 — Product Vision** — seluruh prasyarat dari Tahap 02 sudah terpenuhi.
2. Tanyakan status kategori usia (AUD/Cabe Rawit/Pra Remaja/Remaja) di Tahap 03, karena ini memengaruhi struktur data Kelompok.

### Langkah berikutnya
Menunggu persetujuan Anda untuk lanjut ke **Tahap 03 — Product Vision**.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal reverse engineering berdasarkan Benchmark.md v1.1 |
| 1.1 | PPG direvisi dari "Hapus (default)" menjadi "Pertahankan" setelah konfirmasi struktur organisasi (PPG > 5 Desa > 18 Kelompok); kriteria Santri Teladan dikonfirmasi tidak diubah; Bagian 0, 2.11, 3, 5, dan 6 diperbarui |

