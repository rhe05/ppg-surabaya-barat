# PRODUCT STRATEGY
## Tahap 04 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ |
| Versi Dokumen | 1.2 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 05 |
| Input | Product Vision.md v1.1 |
| Tahap Berikutnya | 05 — Market Research |

---

## 1. Konteks Strategis

Dua fakta dari Tahap 03 membentuk seluruh strategi di dokumen ini:

1. **Belum ada sistem sama sekali** — bukan migrasi, tapi transisi pertama dari manual ke digital.
2. **Skala organisasi sudah besar sejak awal** — 1 PPG, 5 Desa, 18 Kelompok.

Kombinasi keduanya adalah tantangan strategi klasik: **skala besar + kematangan digital nol**. Strategi peluncuran yang tepat menjadi penentu keberhasilan proyek ini, bukan hanya kualitas fitur.

---

## 2. Strategi Peluncuran (Rollout Strategy) — TERKONFIRMASI

**Keputusan final: Bertahap (Pilot), bukan serentak.** Dikonfirmasi langsung oleh Anda, sejalan dengan rekomendasi Bagian 2.2 sebelumnya.

### 2.1 Struktur Organisasi Lengkap (Terkonfirmasi)

| Field | Isi |
|---|---|
| Nama PPG | **PPG Surabaya Barat** |
| Jumlah Desa | 5 |
| Jumlah Kelompok (total resmi) | **18** (terkonfirmasi final) |

| Desa | Jumlah Kelompok (dikonfirmasi) | Nama Kelompok |
|---|---|---|
| Petemon | 5 | Kelp Petemon, Kelp Simo, Kelp Jl Semarang, Kelp Asem Jaya, Kelp DST |
| Purwodadi | 3 | Kelp Bangun Rejo, Kelp Purwodadi, Kelp Dupak |
| Tanbar | 4 | Manukan 1, Manukan 2, Candi Lontar, Wonorejo |
| Tantim | 3 | Balongsari, Dermo, Buntaran |
| Benowo | 3 | Sememi Barat, Sememi Timur, Pakal |

**Rekonsiliasi selesai (terkonfirmasi final):** Total resmi **18 Kelompok**, sesuai jumlah rincian per-Desa (5+3+4+3+3=18). Angka "17" yang sempat dikonfirmasi di Tahap 01-03 dikoreksi menjadi 18 — rincian per-Desa dijadikan acuan resmi:

Petemon (5): Kelp Petemon, Kelp Simo, Kelp Jl Semarang, Kelp Asem Jaya, Kelp DST
Purwodadi (3): Kelp Bangun Rejo, Kelp Purwodadi, Kelp Dupak
Tanbar (4): Manukan 1, Manukan 2, Candi Lontar, Wonorejo
Tantim (3): Balongsari, Dermo, Buntaran
Benowo (3): Sememi Barat, Sememi Timur, Pakal

Data ini siap dipakai sebagai seed final di Tahap 16 (Database Design).

### 2.2 Scope Pilot (Terkonfirmasi — Diperluas)

**4 Kelompok online, mencakup 2 Desa sekaligus:**

| Status | Desa | Kelompok |
|---|---|---|
| Online (Pilot) | Petemon | Kelp Petemon (1 dari 5 Kelompok di Desa ini) |
| Online (Pilot) | Purwodadi | Seluruh 3 Kelompok: Bangun Rejo, Purwodadi, Dupak |
| Off (menunggu konfirmasi) | Petemon | Kelp Simo, Kelp Jl Semarang, Kelp Asem Jaya, Kelp DST |
| Off (menunggu konfirmasi) | Tanbar, Tantim, Benowo | Seluruh Kelompok di 3 Desa ini |

**Implikasi baru (penting):** Pilot ini bukan lagi skenario "1 Kelompok saja". Karena mencakup **2 Desa berbeda** -- dan salah satunya (Purwodadi) online **secara penuh** -- fitur agregasi tingkat Desa menjadi relevan **sejak fase pilot**, bukan menunggu rollout penuh. Ini mengubah prioritas di Bagian 4:

- **Visibilitas tingkat Desa** (rekap seluruh Kelompok dalam 1 Desa) naik menjadi **Must Have** untuk pilot, karena Desa Purwodadi sudah punya 3 Kelompok aktif sejak awal -- bukan skenario 1 Kelompok tunggal lagi.
- **Visibilitas tingkat PPG** (agregasi lintas-Desa) menjadi lebih relevan diuji lebih awal juga -- meski hanya mengagregasi 2 Desa (bukan 5), ini kesempatan menguji logika agregasi PPG dengan kompleksitas kecil sebelum rollout penuh ke 5 Desa. Naik dari Should Have menjadi **Could Have (diuji dini)** -- bukan wajib di rilis pertama, tapi bernilai tinggi untuk diuji secepatnya.

**Implikasi desain (tetap berlaku, wajib masuk Tahap 07/12):**
Karena hanya sebagian Kelompok yang "online" sementara sisanya "off", sistem **membutuhkan status aktif/nonaktif per Kelompok** sebagai data terstruktur -- bukan sekadar keputusan operasional di luar sistem. Tabel Kelompok perlu field status (misal: `Aktif` / `Belum Aktif`), dan tampilan dashboard/filter perlu mempertimbangkan status ini.

**Status selisih 17 vs 18 Kelompok:** Masih belum terklarifikasi -- tidak menghambat Tahap 05, tapi tetap perlu dijawab sebelum Tahap 16 (Database Design).

### 2.3 Strategi Perluasan (Setelah Pilot)

Urutan perluasan belum ditentukan eksplisit oleh Anda. Opsi umum yang bisa dipertimbangkan (bukan keputusan, hanya kerangka untuk didiskusikan saat pilot Kelp Petemon berjalan):
- Perluasan ke sisa 4 Kelompok di Desa Petemon dulu (evaluasi dalam 1 Desa penuh sebelum lintas-Desa)
- Perluasan ke Desa lain secara paralel begitu Kelp Petemon stabil
- Kombinasi keduanya

Keputusan ini tidak perlu diambil sekarang — cukup dicatat sebagai pertanyaan terbuka untuk Tahap 19 (Development Roadmap).

---

## 3. Strategi Migrasi Data Manual

Ditindaklanjuti dari catatan Tahap 03 soal kemungkinan data manual (buku/spreadsheet) yang perlu dientri ulang:

**Pertanyaan yang perlu dijawab sebelum Tahap 07 (PRD):**
- Apakah data santri/guru saat ini tercatat di buku fisik, spreadsheet, atau campuran keduanya per-Kelompok?
- Siapa yang akan bertanggung jawab entri data awal — pengurus tiap Kelompok, atau tim pusat?

**Implikasi desain (dicatat untuk Tahap 07 & 16):** Kemungkinan besar dibutuhkan fitur **impor data massal** (misal dari Excel) agar entri awal tidak dilakukan manual satu-per-satu untuk 1.700+ santri (skala referensi) — bukan sekadar form tambah-satu-per-satu.

---

## 4. Kerangka Prioritas (MoSCoW) — Tingkat Modul

Berdasarkan keputusan desain Tahap 02, disusun prioritas awal untuk membedakan MVP dari pengembangan lanjutan. **Ini draft strategis, bukan keputusan fitur rinci** — detail fitur ada di Tahap 11.

| Prioritas | Modul | Alasan |
|---|---|---|
| **Must Have (MVP)** | Data Santri, Data Guru, Absen Santri | Fondasi dasar — tanpa data santri/guru & kehadiran, modul lain tidak punya data untuk diolah |
| **Must Have (MVP)** | Dashboard | Nilai utama produk (visibilitas berjenjang) tidak tercapai tanpa ini |
| **Should Have** | Munaqosah | Fungsi inti TPQ, tapi bisa menyusul 1 rilis setelah data dasar stabil |
| **Should Have** | Bimbingan Konseling | Penting, tapi butuh desain kontrol privasi matang — lebih aman tidak terburu-buru |
| **Could Have** | Pusat Unduhan, Kalender | Bermanfaat, tapi bukan penentu keberhasilan pilot awal |
| **Could Have** | Laporan KBM, Peringkat KBM | Bergantung pada modul lain sudah berjalan dan berisi data cukup |
| **Won't Have (fase ini)** | Pembayaran/SPP, Notifikasi wali santri | Dikonfirmasi di luar cakupan (Tahap 03) |

**Catatan tentang PPG (direvisi):** Karena pilot ternyata mencakup 2 Desa (Petemon & Purwodadi), agregasi lintas-Desa bernilai diuji dini dengan kompleksitas kecil (2 Desa, bukan 5). PPG naik dari "tidak masuk MVP" menjadi **Could Have (diuji dini)** -- bukan wajib rilis pertama, tapi disiapkan lebih awal dari rencana semula.

**Catatan baru -- Visibilitas tingkat Desa:** Naik menjadi **Must Have**, karena Desa Purwodadi online penuh (3 dari 3 Kelompok) sejak pilot dimulai.

**Catatan tambahan (status aktif/nonaktif Kelompok):** Mengingat scope pilot terkonfirmasi hanya 1 dari 18 Kelompok yang online, kemampuan menandai status Kelompok (aktif/belum aktif) kini naik menjadi **Must Have**, bukan sekadar detail teknis — tanpa ini, dashboard/filter di seluruh modul akan menampilkan 18 Kelompok kosong yang membingungkan pengguna pilot.

---

## 5. Strategi Diferensiasi (vs Alternatif Saat Ini)

| Alternatif Saat Ini | Kelemahan | Bagaimana Sistem Ini Berbeda |
|---|---|---|
| Pencatatan manual (buku/spreadsheet per Kelompok) | Tidak ada agregasi otomatis, rawan tidak konsisten, sulit direkap lintas-Kelompok | Data terpusat, agregasi real-time, format standar di seluruh Kelompok |
| Meniru aplikasi referensi apa adanya | Mewarisi kelemahan yang sudah ditemukan (Tahap 02): data tidak konsisten, filter berulang, status tanpa kode warna | Memperbaiki kelemahan tersebut sejak desain awal, bukan sekadar mengganti label |

---

## 6. Metrik Keberhasilan (Tingkat Strategis)

**Catatan:** Ini metrik strategis tingkat tinggi untuk menilai apakah *strategi* berhasil, bukan KPI produk rinci (itu di Tahap 07/PRD). Sesuai standar bukti ilmiah, tidak ada acuan akademik untuk mengklaim angka target berikut — ini murni usulan berbasis praktik umum manajemen proyek, ditandai sebagai draft yang perlu disesuaikan dengan konteks Anda.

| Fase | Indikator Keberhasilan (Usulan) |
|---|---|
| Pilot (1-2 Kelompok) | Pengurus Kelompok bisa mengoperasikan sistem tanpa pendampingan intensif setelah pelatihan awal; data kehadiran & santri terisi lengkap dan konsisten |
| Perluasan bertahap | Setiap Desa baru yang onboard tidak butuh waktu onboarding lebih lama dari Desa sebelumnya (menandakan sistem cukup intuitif, bukan bergantung pendampingan berulang) |
| Skala penuh (5 Desa/18 Kelompok) | Dashboard PPG mencerminkan data real-time dari seluruh Desa tanpa rekap manual tambahan |

---

## 7. Risiko Strategis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Resistensi pengguna terhadap perubahan dari manual ke digital | Tinggi | Strategi pilot (Bagian 2) + pelatihan bertahap, bukan serentak |
| Data historis tidak lengkap/tidak konsisten saat entri awal | Sedang | Perlu proses validasi data saat impor (Bagian 3), bukan asumsi data lama selalu bersih |
| Kelompok pilot tidak representatif (misal terlalu kecil/besar dibanding rata-rata) | Sedang | Kelp Petemon sudah ditentukan sebagai pilot — perlu diketahui apakah ukurannya representatif terhadap 18 Kelompok lain, atau termasuk kecil/besar secara khusus (relevan untuk menilai hasil pilot secara adil) |
| Ketergantungan pada 1 developer (Anda) untuk 18 Kelompok pengguna | Sedang-Tinggi | Di luar cakupan dokumen strategi produk, tapi relevan dicatat untuk Tahap 19 (Development Roadmap) — perlu strategi dukungan/dokumentasi pengguna |

---

## 8. Quality Control — Tahap 04

### Apa yang sudah selesai
- **Strategi rollout terkonfirmasi final**: bertahap, bukan serentak
- **Struktur organisasi lengkap tercatat**: PPG Surabaya Barat → 5 Desa → 18 Kelompok (12 nama Kelompok sudah diberikan, 10 belum)
- **Scope pilot terkonfirmasi presisi**: hanya Kelp Petemon yang online, 18 Kelompok lain berstatus off
- Kebutuhan fungsional baru teridentifikasi: status aktif/nonaktif per Kelompok, naik menjadi prioritas Must Have
- Kerangka prioritas MoSCoW tingkat modul tersusun dan diperbarui sesuai scope pilot presisi

### Apa yang masih kurang
- **⚠️ Selisih angka 17 vs 18 Kelompok belum terklarifikasi** — ini prioritas tertinggi untuk dikonfirmasi sebelum Tahap 05, agar tidak terbawa sebagai data salah ke tahap desain
- Nama 10 Kelompok di Desa Tanbar, Tantim, dan Benowo belum diberikan — tidak menghambat tahap ini, tapi dibutuhkan sebelum Tahap 16 (Database Design) untuk data seed/referensi
- Kondisi data manual saat ini (Bagian 3 — buku/spreadsheet) belum dijawab
- Urutan strategi perluasan pasca-pilot (Bagian 2.3) belum ditentukan — tidak mendesak, bisa menyusul di Tahap 19

### Risiko
- ~~Risiko sedang: selisih 17 vs 18 belum diklarifikasi~~ — **terselesaikan**, 18 dikonfirmasi sebagai angka final.
- **Risiko rendah**: Ketergantungan single-developer tetap relevan diperhatikan di Tahap 19-20, terutama karena pilot presisi ke 1 Kelompok berarti kebutuhan dukungan langsung ke pengguna riil, bukan lagi hipotetis.

### Rekomendasi
1. ~~Konfirmasi total Kelompok~~ — **selesai**, 18 Kelompok dengan nama lengkap.
2. Lanjut ke **Tahap 05 — Market Research**.

### Langkah berikutnya
Menunggu klarifikasi selisih 17 vs 18 Kelompok, lalu lanjut ke **Tahap 05 — Market Research**.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal Product Strategy berdasarkan Product Vision.md v1.1 |
| 1.1 | Strategi rollout dikonfirmasi final (bertahap); struktur organisasi lengkap (PPG Surabaya Barat, 5 Desa, 18 Kelompok) ditambahkan; scope pilot awal dicatat sebagai Kelp Petemon saja; ditemukan selisih 17 vs 18 Kelompok yang perlu diklarifikasi |
| 1.2 | Scope pilot diperluas: online = Kelp Petemon + seluruh 3 Kelompok Desa Purwodadi (4 Kelompok, 2 Desa); prioritas visibilitas tingkat Desa naik ke Must Have, PPG naik ke Could Have (diuji dini) |
