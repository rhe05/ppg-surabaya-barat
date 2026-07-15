# BUSINESS ANALYSIS
## Tahap 06 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ |
| Versi Dokumen | 1.2 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 07 |
| Input | Product Strategy.md v1.3, Market Research.md v1.0 |
| Tahap Berikutnya | 07 — Master PRD |

---

## 1. Tujuan Tahap Ini

Sebelum PRD ditulis (Tahap 07), perlu ada kejelasan **siapa boleh melakukan apa, terhadap data siapa, di level mana** — dan **bagaimana proses inti bisnis TPQ berjalan** secara berjenjang (Kelompok → Desa → PPG). Tanpa ini, PRD berisiko menulis fitur tanpa dasar aturan akses yang konsisten.

**Metodologi:** Mengacu pada BABOK (Business Analysis Body of Knowledge) — fokus pada *stakeholder analysis*, *process modeling*, dan *rules analysis* sebelum requirement ditulis.

---

## 2. Matriks Peran & Hak Akses (Terkonfirmasi)

Kelima pertanyaan kritikal sudah dijawab. Matriks final:

| Role | Level (Scope) | Lihat Data | Input/Edit Data | Hapus Data | Kewenangan Khusus |
|---|---|---|---|---|---|
| **Admin Kelompok** | Tepat 1 Kelompok (tidak bisa lebih) | Kelompoknya sendiri | Ya | **Ya, boleh hapus data sendiri** | Entri kehadiran, nilai Munaqosah, catat konseling |
| **Admin Desa** | Desanya | Seluruh Kelompok di Desanya | Sesuai kebutuhan Desa | Belum ditentukan (default: tidak, kecuali dinyatakan lain) | Buka/tutup periode Munaqosah (bersama PPG) |
| **Admin PPG** | Seluruh organisasi | Semua Desa & Kelompok | Sesuai kebutuhan PPG | Belum ditentukan | Aktifkan/nonaktifkan status Kelompok; buka/tutup periode Munaqosah |
| **Semua role di atas** | — | **Bimbingan Konseling: semua role bisa lihat** | — | — | Tidak ada pembatasan akses khusus untuk data konseling |

### 2.1 Aturan Penugasan Role (Penting — Beda dari Aplikasi Referensi)

**Terkonfirmasi: satu orang hanya boleh punya SATU role, di SATU scope.** Seorang Admin Kelompok terikat ke tepat 1 Kelompok — tidak bisa merangkap Kelompok lain, dan tidak bisa merangkap jadi Admin Desa/PPG sekaligus.

**Catatan penting — bertentangan dengan temuan Tahap 01:** Aplikasi referensi (KbmKu) punya fitur eksplisit **"Ganti Peran"** (user "Jazzmanto" bisa berpindah role). **Untuk sistem TPQ Anda, fitur ini TIDAK relevan dan sebaiknya TIDAK dibangun** — karena struktur organisasi Anda menetapkan satu orang = satu role tetap. Ini contoh konkret kenapa Tahap 02 (Reverse Engineering) menahan diri untuk tidak sekadar meniru: fitur yang tampak berguna di aplikasi referensi bisa jadi tidak relevan sama sekali untuk konteks nyata Anda.

**Interpretasi yang saya pakai (mohon dikoreksi jika keliru):** "Tidak bisa, hanya per kelp saja" saya baca sebagai *setiap Admin Kelompok terikat ke 1 Kelompok spesifik*, dan penugasan role Desa/PPG juga tunggal per orang. Jika maksud Anda berbeda, mohon diluruskan — tapi saya lanjutkan dengan pemahaman ini karena cukup jelas dari jawaban Anda.

### 2.2 Item yang Masih Terbuka (Tidak Menghambat)

- Kewenangan hapus data untuk Admin Desa/PPG belum ditentukan eksplisit — default sementara: tidak bisa hapus (hanya Admin Kelompok yang eksplisit dikonfirmasi boleh hapus). Bisa diperjelas di Tahap 12 (Business Rules).
- Isi lengkap Modul Kurikulum (selain nilai Akhlaq) belum dijelaskan — tidak menghambat Tahap 07, PRD akan mencatatnya sebagai modul dengan detail awal yang bisa diperkaya kemudian.

---

## 3. Analisis Proses Bisnis Inti

### 3.1 Proses: Pencatatan Kehadiran Harian

```
Ustadz/Admin Kelompok mencatat kehadiran
        ↓
Data tersimpan di level Kelompok
        ↓
Otomatis teragregasi ke Dashboard Desa
        ↓
Otomatis teragregasi ke Dashboard PPG (jika Kelompok berstatus aktif)
```

**Aturan bisnis tersirat:** Agregasi harus **real-time atau near-real-time** agar dashboard berjenjang punya nilai — jika ada jeda signifikan, nilai "visibilitas menyeluruh" dari Tahap 03 tidak tercapai. Perlu dikonfirmasi di Tahap 07: apakah real-time wajib, atau rekap berkala (misal harian) cukup?

### 3.2 Proses: Ujian Hafalan (Munaqosah)

```
Periode Munaqosah dibuka (oleh Admin — level belum ditentukan, lihat 2.1 poin 2)
        ↓
Admin Kelompok menilai santri
        ↓
Status santri berubah: Belum Dinilai → Dinilai
        ↓
Periode ditutup oleh Admin
        ↓
Rekap Progress & Santri Teladan dihasilkan otomatis
```

**Aturan bisnis tersirat (dari Tahap 01 & 03):** Kriteria Santri Teladan (Nilai≥90, Akhlaq≥90, Kehadiran≥95%) bergantung pada 3 modul berbeda — **berarti fitur Santri Teladan tidak bisa berjalan sebelum ketiga sumber data tersebut ada dan sinkron.** Ini implikasi penting untuk urutan pengembangan di Tahap 19.

**Terkonfirmasi:** Nilai "Akhlaq" bersumber dari **Modul Kurikulum** — modul yang **tidak ada dalam 11 modul aplikasi referensi (KbmKu)** yang dianalisis di Tahap 01-02. Ini adalah **modul ke-12, spesifik kebutuhan TPQ Anda**, bukan hasil reverse engineering dari referensi.

**Dampak terhadap dokumen sebelumnya:**
- Modul Kurikulum perlu ditambahkan ke daftar modul di Tahap 07 (PRD) — belum ada di keputusan desain Tahap 02 karena memang tidak ada di aplikasi acuan.
- **Detail Modul Kurikulum belum diketahui** — apa isinya selain nilai Akhlaq? Apakah mencakup materi ajar, capaian kurikulum per jenjang, atau hal lain? **Perlu penjelasan lebih lanjut dari Anda sebelum Tahap 07**, karena tanpa ini PRD tidak bisa mendefinisikan modul ini dengan baik — hanya tahu namanya, belum tahu isinya.

### 3.3 Proses: Kenaikan Jenjang Berbasis Kemampuan (Terkonfirmasi Sebagian)

Dikonfirmasi Anda: proses kenaikan jenjang **berjalan manual, dan berbeda untuk setiap anak** (individual, bukan kenaikan massal/batch per semester seperti kenaikan kelas formal sekolah).

**Implikasi desain penting:**
- Sistem **tidak bisa mengasumsikan kenaikan jenjang terjadi serentak** (misal saat pergantian semester). Perlu ada mekanisme pencatatan **per-santri, kapan saja**, bukan proses batch terjadwal.
- Karena "manual" dan "berbeda tiap anak", kemungkinan besar keputusan kenaikan jenjang bergantung pada **penilaian/pertimbangan pengurus Kelompok** secara individual — bukan formula otomatis dari sistem (misal bukan "jika nilai X maka otomatis naik").
- **Desain yang disarankan:** sistem menyediakan **kemampuan mencatat perpindahan jenjang santri kapan saja**, dengan catatan/alasan opsional — bukan tombol otomatis berbasis skor. Keputusan tetap di tangan manusia (pengurus), sistem hanya mencatat hasilnya.

**Terjawab:** Karena setiap Admin Kelompok punya wewenang penuh atas Kelompoknya (Bagian 2), pencatatan kenaikan jenjang santri dilakukan oleh Admin Kelompok tanpa perlu approval berjenjang — konsisten dengan matriks akses final.

### 3.4 Proses: Bimbingan Konseling (dengan Pertimbangan Privasi)

```
Kejadian/masalah santri dicatat oleh Admin Kelompok
        ↓
[BELUM JELAS] Siapa saja yang bisa melihat catatan ini?
        ↓
Tindak lanjut dicatat (status berubah)
```

**Catatan wajib:** Karena ini data sensitif tentang anak-anak, proses ini **tidak boleh didesain dengan asumsi "semua role bisa lihat semua"** tanpa keputusan sadar dari Anda. Ditandai sebagai keputusan yang harus eksplisit, bukan default sistem.

---

## 4. Aturan Bisnis yang Sudah Terkonfirmasi (Rekap dari Tahap Sebelumnya)

Untuk menghindari duplikasi kerja di Tahap 12 (Business Rules), berikut aturan yang **sudah pasti**, dikumpulkan dari tahap-tahap sebelumnya:

| # | Aturan | Sumber |
|---|---|---|
| 1 | Kriteria Santri Teladan: Nilai ≥90, Akhlaq ≥90, Kehadiran ≥95% | Tahap 01 (verifikasi screenshot), dikonfirmasi tidak diubah di Tahap 02 |
| 2 | Konsep "Karakter Luhur" dipertahankan, tidak diubah | Tahap 02 |
| 3 | Penempatan Kelompok (AUD/Cabe Rawit/Pra Remaja/Remaja) berbasis kemampuan, bukan usia otomatis | Tahap 03 |
| 4 | Setiap Kelompok punya status aktif/nonaktif — wajib ada di data terstruktur | Tahap 04 |
| 5 | Absensi memakai 3 status: Hadir, Alpa, Izin | Tahap 01 |
| 6 | Struktur organisasi: PPG Surabaya Barat → 5 Desa → 18 Kelompok (rincian per-Desa masih perlu diperjelas, lihat Product Strategy §2.1) | Tahap 04-05 |
| 7 | Pembayaran/SPP dan notifikasi wali santri: di luar cakupan | Tahap 03 |
| 8 | Kenaikan jenjang berjalan manual, per-santri individual (bukan batch/serentak) | Tahap 06 |
| 9 | Nilai Akhlaq bersumber dari Modul Kurikulum (modul baru, di luar 11 modul referensi) | Tahap 06 |

---

## 5. Quality Control — Tahap 06

### Apa yang sudah selesai
- **Matriks peran & akses final terkonfirmasi** — seluruh 5 pertanyaan kritikal terjawab
- Ditemukan perbedaan penting dengan aplikasi referensi: fitur "Ganti Peran" **tidak relevan** untuk sistem TPQ Anda karena aturan satu-orang-satu-role — dicatat sebagai keputusan desain eksplisit untuk Tahap 07 (fitur ini tidak perlu dibangun)
- Proses kenaikan jenjang terkonfirmasi lengkap: manual, individual, dilakukan oleh Admin Kelompok tanpa approval berjenjang
- Modul Kurikulum (modul ke-12, baru) tercatat sebagai kebutuhan nyata di luar hasil reverse engineering
- Aturan bisnis terkonfirmasi (9 poin) direkap di Bagian 4

### Apa yang masih kurang (tidak menghambat)
- Kewenangan hapus data untuk Admin Desa/PPG masih default "tidak", belum eksplisit dikonfirmasi — bisa diperjelas di Tahap 12
- Isi lengkap Modul Kurikulum (selain nilai Akhlaq) belum dijelaskan — PRD Tahap 07 akan mencatat modul ini dengan cakupan awal, diperkaya kemudian
- Interpretasi saya atas "tidak bisa, hanya per kelp saja" (Bagian 2.1) perlu dikonfirmasi jika saya salah baca

### Risiko
- **Risiko rendah (turun dari "tinggi")**: Blocker utama sudah selesai. Sisa item bersifat detail yang bisa diperkaya progresif tanpa menulis ulang PRD secara besar.
- **Risiko rendah**: Jika interpretasi "satu role satu scope" di Bagian 2.1 keliru, dampaknya terbatas ke desain sistem role/permission di Tahap 07 — bukan ke keseluruhan PRD.

### Rekomendasi
1. **Siap lanjut ke Tahap 07 — Master PRD.** Blocker risiko tinggi sudah terselesaikan.
2. Saat membaca PRD nanti, tolong dikonfirmasi apakah interpretasi role di Bagian 2.1 sudah tepat.

### Langkah berikutnya
Menunggu persetujuan Anda untuk lanjut ke **Tahap 07 — Master PRD** — tahap ini akan menjadi dokumen paling komprehensif sejauh ini, menggabungkan seluruh temuan Tahap 01-06.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal Business Analysis — matriks akses & proses bisnis inti, sebagian besar berstatus draft/spekulatif menunggu konfirmasi |
| 1.1 | Proses kenaikan jenjang dikonfirmasi (manual, individual); ditemukan Modul Kurikulum baru sebagai sumber nilai Akhlaq |
| 1.2 | Matriks peran & akses final terkonfirmasi (5/5 pertanyaan terjawab); fitur "Ganti Peran" dari referensi diputuskan tidak relevan untuk sistem TPQ; blocker risiko tinggi terselesaikan |
