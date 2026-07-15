# MARKET RESEARCH
## Tahap 05 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ |
| Versi Dokumen | 1.0 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 06 |
| Input | Product Strategy.md v1.2 |
| Tahap Berikutnya | 06 — Business Analysis |

---

## 0. Catatan Adaptasi Metodologi

"Market Research" secara baku meneliti pasar terbuka (kompetitor, ukuran pasar, segmentasi pelanggan). Proyek ini **bukan produk komersial** — penggunanya adalah pemangku kepentingan internal organisasi (PPG Surabaya Barat dan jajaran di bawahnya). Karena itu, tahap ini diadaptasi menjadi **riset kebutuhan pemangku kepentingan internal (internal stakeholder & needs research)**, dengan tetap mempertahankan semangat aslinya: memahami siapa penggunanya, apa kebutuhannya, dan alternatif apa yang tersedia bagi mereka saat ini — sebelum masuk ke persona formal (Tahap 08).

---

## 1. Pemetaan Pemangku Kepentingan (Stakeholder Map)

Berdasarkan struktur organisasi terkonfirmasi (PPG Surabaya Barat → 5 Desa → 18 Kelompok) dan sistem role yang ditemukan di Tahap 01 ("Ganti Peran"), berikut pemetaan awal pemangku kepentingan:

| Level | Kemungkinan Peran | Kebutuhan Utama (Hipotesis — perlu dikonfirmasi) | Prioritas Riset |
|---|---|---|---|
| **PPG** (pusat) | Pimpinan/koordinator PPG Surabaya Barat | Visibilitas menyeluruh lintas-Desa, evaluasi kinerja antar-Desa | Tinggi — pengguna dashboard agregat |
| **Desa** | Pengurus Desa (Petemon, Purwodadi, dst) | Rekap seluruh Kelompok dalam desanya, koordinasi antar-Kelompok | Tinggi — terutama Desa Purwodadi karena online penuh sejak pilot |
| **Kelompok** | Pengurus/Ustadz-Ustadzah Kelompok | Entri data harian: kehadiran, nilai, catatan santri | **Tertinggi** — pengguna paling sering berinteraksi dengan sistem, langsung terdampak di pilot (Kelp Petemon, Kelp Bangun Rejo, Kelp Purwodadi, Kelp Dupak) |
| **Wali Santri** | Orang tua/wali | *(Di luar cakupan — dikonfirmasi Tahap 03 bukan prioritas)* | Tidak diriset di tahap ini |

**Catatan:** Tabel di atas adalah **hipotesis kebutuhan**, bukan hasil wawancara langsung. Ini penting ditandai karena metodologi riset kebutuhan yang baik seharusnya divalidasi langsung ke pengguna (idealnya wawancara singkat dengan 1-2 pengurus Kelp Petemon dan Desa Purwodadi), bukan hanya diturunkan dari struktur organisasi. **Rekomendasi:** jika memungkinkan, lakukan validasi singkat ke pengurus Kelompok pilot sebelum Tahap 08 (User Persona) difinalisasi.

---

## 2. Alternatif yang Tersedia Saat Ini (Pengganti "Analisis Kompetitor")

Karena tidak ada kompetitor produk dalam pengertian pasar, bagian ini membandingkan alternatif yang tersedia bagi pengguna saat ini dengan yang akan ditawarkan sistem baru.

| Alternatif | Kelebihan | Kekurangan | Posisi Sistem Baru |
|---|---|---|---|
| **Pencatatan manual** (buku/spreadsheet per Kelompok) | Familiar, tidak butuh perangkat/koneksi internet | Tidak ada agregasi otomatis; rawan hilang/rusak; sulit direkap lintas-Kelompok/Desa (dikonfirmasi Tahap 03 sebagai problem statement utama) | Sistem baru menggantikan ini sebagai pencatatan utama |
| **Aplikasi referensi (KbmKu)** | Sudah teruji di organisasi serupa berskala besar (1.746 santri) | Kelemahan konkret ditemukan di Tahap 02 (data tidak konsisten, filter berulang, dll); istilah tidak sepenuhnya sama dengan konteks Anda | Sistem baru mengadopsi pola yang terbukti baik, memperbaiki kelemahannya |
| **Aplikasi spreadsheet online umum** (Google Sheets, Excel Online) | Mudah diakses, gratis, familiar sebagian pengguna | Tidak ada kontrol akses berjenjang (PPG/Desa/Kelompok), tidak ada validasi data terstruktur, sulit menangani hierarki 3 tingkat secara rapi | Sistem baru menyediakan struktur data dan kontrol akses yang tidak dimiliki spreadsheet umum |

---

## 3. Kebutuhan Fungsional yang Muncul dari Konteks Riil (Bukan dari Referensi)

Beberapa kebutuhan berikut relevan khusus untuk konteks TPQ Surabaya Barat, dan sebagian sudah tersirat dari data konkret yang Anda berikan di tahap sebelumnya — dicatat di sini agar tidak hilang sebelum masuk PRD (Tahap 07):

1. **Pengelolaan status Kelompok** (aktif/belum aktif) — kebutuhan nyata karena pilot mencakup 4 dari 18 Kelompok saja.
2. **Perbandingan antar-Kelompok dalam 1 Desa** — relevan khusus untuk Desa Purwodadi yang online penuh (3/3 Kelompok) sejak awal, kemungkinan pengurus Desa ingin membandingkan performa antar-Kelompoknya.
3. **Kesiapan data seed/referensi wilayah** — nama 18 Kelompok (terkonfirmasi final), 5 Desa, dan 1 PPG perlu disiapkan sebagai data awal sistem, bukan diinput manual oleh pengguna saat pertama kali pakai.
4. **Kebutuhan pelatihan/onboarding** — karena problem statement Tahap 03 mengonfirmasi belum ada sistem digital sama sekali, kebutuhan pelatihan penggunaan dasar (bukan hanya fitur) adalah kebutuhan non-fungsional yang nyata, bukan sekadar formalitas.

---

## 4. Batasan Riset Tahap Ini

Sesuai standar kejujuran terhadap bukti: bagian ini **bukan hasil riset lapangan** (survei/wawancara langsung ke pengguna Kelp Petemon atau Desa Purwodadi). Seluruh isi dokumen ini adalah **inferensi terstruktur** dari:
- Struktur organisasi yang telah Anda konfirmasi
- Pola kebutuhan dari aplikasi referensi (Tahap 01-02)
- Problem statement yang telah dikonfirmasi (Tahap 03)

Ini bukan kelemahan yang harus diperbaiki sekarang — riset kebutuhan formal ke pengguna nyata sering kali dilakukan paralel dengan pengembangan awal, bukan prasyarat mutlak sebelum mulai. Namun perlu **ditandai jujur**, bukan disajikan seolah-olah berbasis wawancara pengguna yang sebenarnya tidak dilakukan.

---

## 5. Quality Control — Tahap 05

### Apa yang sudah selesai
- Pemetaan pemangku kepentingan per level organisasi (PPG/Desa/Kelompok) tersusun
- Alternatif yang tersedia saat ini (manual, referensi, spreadsheet umum) dibandingkan secara jujur
- Kebutuhan fungsional baru yang spesifik konteks riil (bukan sekadar tiruan referensi) teridentifikasi
- Batasan metodologi riset dinyatakan eksplisit, tidak menyamarkan bahwa ini inferensi bukan wawancara langsung

### Apa yang masih kurang
- **Tidak ada validasi langsung ke pengguna nyata** (pengurus Kelp Petemon/Bangun Rejo/Purwodadi/Dupak) — seluruh kebutuhan masih hipotesis
- Kebutuhan Wali Santri sengaja tidak diriset karena di luar cakupan (Tahap 03), tapi patut dicatat sebagai potensi riset masa depan jika prioritas berubah

### Risiko
- **Risiko sedang**: Karena kebutuhan pengguna belum divalidasi langsung, ada risiko Tahap 08 (User Persona) dan Tahap 07 (PRD) dibangun di atas asumsi yang meleset dari kebutuhan riil pengurus Kelompok. Mitigasi idealnya adalah sesi singkat dengan 1-2 pengurus pilot sebelum PRD difinalisasi — tapi ini keputusan Anda, bukan blocker teknis.

### Rekomendasi
1. Jika memungkinkan, luangkan waktu untuk menanyakan langsung ke pengurus Kelp Petemon dan salah satu Kelompok di Desa Purwodadi: apa kesulitan terbesar mereka saat ini dalam mencatat data santri/kehadiran/nilai secara manual?
2. Jika tidak memungkinkan sekarang, lanjutkan ke Tahap 06 dengan hipotesis di dokumen ini — cukup diingat bahwa ini asumsi yang bisa dikoreksi kapan saja.

### Langkah berikutnya
Menunggu persetujuan Anda untuk lanjut ke **Tahap 06 — Business Analysis**.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal riset kebutuhan internal berdasarkan Product Strategy.md v1.2 |
