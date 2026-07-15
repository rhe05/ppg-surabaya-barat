# FEATURE BREAKDOWN
## Tahap 11 dari 23

| Field | Isi |
|---|---|
| Status | Draft — dikerjakan berkelanjutan atas instruksi lanjut tanpa jeda |
| Input | Master PRD.md v1.0, Information Architecture.md v1.0 |

---

## 0. Keputusan Default yang Diambil (Karena Diminta Lanjut Tanpa Jeda)

Beberapa item terbuka dari tahap sebelumnya diputuskan dengan default aman agar proyek tetap maju. **Ditandai eksplisit, bisa dikoreksi kapan saja:**

| Item | Keputusan Default | Alasan |
|---|---|---|
| Selisih 17 vs 18 Kelompok | **17 dipakai sebagai jumlah resmi.** Data seed akan disiapkan untuk 17 slot; nama Kelompok ke-18 yang berlebih (belum jelas yang mana) ditandai `[VERIFIKASI]` di data seed | 17 adalah angka yang dikonfirmasi eksplisit dua kali |
| 10 nama Kelompok belum diberikan (Tanbar, Tantim, Benowo) | Diberi placeholder `Kelompok [Desa]-1`, dst | Tidak menghambat desain fitur, hanya memengaruhi data seed di Tahap 16 |
| Isi Modul Kurikulum di luar nilai Akhlaq | Diasumsikan mencakup: (a) nilai Akhlaq, (b) catatan capaian materi per jenjang | Cakupan minimal yang masuk akal dari namanya; **wajib dikonfirmasi sebelum modul ini dikembangkan (Tahap 21)** |
| Kewenangan hapus data Admin Desa/PPG | **Tidak boleh hapus** (hanya Admin Kelompok yang boleh, sesuai konfirmasi Tahap 06) | Default paling aman — mencegah kehilangan data tidak sengaja di level lebih tinggi |
| Ambang "Alpa perlu perhatian" (FR-16) | **>20% Alpa dalam 1 bulan** | Angka wajar sebagai starting point, mudah diubah sebagai parameter konfigurasi, bukan hardcode |
| Sertifikat digital/khatam | **Di luar cakupan**, konsisten pola pembayaran/notifikasi | Mengikuti presedan Tahap 03 |

---

## 1. Rincian Fitur per Modul

### 1.1 Dashboard
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Ringkasan KPI sesuai scope | Card jumlah santri/guru sesuai role | Data sesuai scope role, ter-update saat context bar berubah |
| Status Santri Teladan | Daftar santri memenuhi 3 kriteria per semester aktif | Hanya tampil jika ketiga sumber data (Munaqosah, Kurikulum, Absensi) tersedia |
| Agenda terdekat | 5 kegiatan mendatang dari Kalender | Terurut tanggal, klik → buka Kalender |
| Empty state jelas | Card kosong bervisual beda dari card berisi data | Warna pudar/ikon berbeda, bukan warna solid sama seperti data valid |

### 1.2 Data Santri
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Pencarian & filter | Nama/NIS + filter Desa/Kelompok/Kelas | Hasil update tanpa reload halaman |
| Statistik & grafik | Total, gender, distribusi per kelompok | Toggle sembunyikan grafik (dipertahankan dari referensi) |
| Profil individu | Detail 1 santri: biodata, riwayat kehadiran, Munaqosah, Kurikulum | Dapat diakses langsung dari hasil pencarian, tanpa lewat halaman statistik dulu |
| Catat kenaikan jenjang | Tombol di profil santri, input jenjang baru + catatan opsional | Tersimpan dengan timestamp & pencatat; riwayat jenjang sebelumnya tetap tersimpan (tidak ditimpa) |
| Impor data massal | Upload Excel/CSV santri | Validasi format sebelum simpan; laporan baris gagal jika ada |

### 1.3 Data Guru
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Direktori & pencarian | Cari nama guru | — |
| Rekap dengan validasi | Total = jumlah seluruh sub-kategori, selalu | Sistem menolak/menandai data jika sub-kategori tidak lengkap mencakup semua guru |
| Analitik setara Data Santri | Breakdown relevan (mis. per Kelompok, per jenjang mengajar) | Konsisten visual dengan Data Santri |

### 1.4 Absen Santri
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Input cepat harian | Tandai Hadir/Alpa/Izin per santri | Default tanggal = hari ini; simpan dengan 1 aksi konfirmasi |
| Rekap & filter | Bulanan/Semester + status update jelas | Indikator "data terbaru per [waktu]" agar tidak ambigu |
| Badge "perlu perhatian" | Santri dengan Alpa >20%/bulan ditandai | Ambang dapat dikonfigurasi Admin PPG di pengaturan (bukan hardcode) |

### 1.5 Munaqosah
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Buka/tutup periode | Oleh Admin Desa/PPG | Log siapa & kapan mengubah status |
| Banner status informatif | Cantumkan estimasi buka kembali/kontak | Wajib diisi saat menutup periode, tidak boleh kosong |
| Input nilai | Oleh Admin Kelompok, per santri | Validasi skala nilai (0-100) |
| Status berkode warna | Belum Dinilai (abu), Dinilai (hijau) | Konsisten dengan skema warna modul lain |
| Rekap & Santri Teladan otomatis | Dihitung dari nilai + Akhlaq + Kehadiran | Re-kalkulasi otomatis saat salah satu sumber data berubah |

### 1.6 Bimbingan Konseling
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Catat riwayat | Tanggal, kategori, masalah, status, pencatat | Field wajib tidak boleh kosong |
| Filter tanggal + kategori + status | — | — |
| Akses semua role | Sesuai Tahap 06 | Tetap tercatat jejak audit (siapa mencatat/mengubah) meski semua role bisa lihat |

### 1.7 Pusat Unduhan
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Folder & file | Upload, kelola struktur folder | — |
| Pencarian | Cari nama file/folder | — |
| Metadata | Tanggal upload, pengunggah, ukuran file | Tampil saat hover/klik file |

### 1.8 Kalender
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Tampilan bulanan | Kategori event berwarna (Hari Libur, KBM, Musyawarah, Pra Munaqosah) | Navigasi bulan maju/mundur |
| Tambah event | Oleh Admin sesuai scope | — |

### 1.9 Laporan KBM
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Filter & daftar laporan | Bulan/Tahun/Desa/Kelompok | — |
| Export | PDF/Excel | Format rapi, siap cetak |

### 1.10 Peringkat KBM
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Ranking per semester | Berdasarkan Desa/Kelompok/nilai gabungan | Formula ranking didefinisikan eksplisit di Tahap 12 (Business Rules) |

### 1.11 Modul Kurikulum *(Baru — Cakupan Default, Perlu Konfirmasi)*
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Input nilai Akhlaq | Per santri, per periode | Terhubung ke kriteria Santri Teladan |
| Catatan capaian materi | Per jenjang *(asumsi cakupan — lihat Bagian 0)* | **Ditandai belum final**, struktur field akan disesuaikan setelah Anda konfirmasi cakupan sebenarnya |

### 1.12 Manajemen Kelompok (Admin PPG)
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Aktivasi/nonaktivasi | Ubah status Kelompok | Konfirmasi eksplisit sebelum submit; log perubahan |
| Kelompokkan per Desa | Tampilan daftar terorganisir | — |

### 1.13 Perbandingan Kelompok / Perbandingan Desa
| Fitur | Deskripsi | Acceptance Criteria |
|---|---|---|
| Tabel/chart komparatif | Kehadiran, nilai Munaqosah, jumlah santri, dsb | Bisa urutkan per kolom metrik |
| Highlight anomali | Kelompok/Desa dengan metrik jauh dari rata-rata ditandai | Ambang anomali dapat dikonfigurasi |

---

## 2. Quality Control — Tahap 11

**Selesai:** Seluruh 13 modul dirinci ke level fitur + acceptance criteria; 6 keputusan default diambil dan ditandai eksplisit.
**Kurang:** Cakupan pasti Modul Kurikulum masih asumsi; formula ranking Peringkat KBM belum didefinisikan (menyusul Tahap 12).
**Risiko:** Rendah — seluruh asumsi bersifat dapat diubah tanpa merombak struktur, karena disimpan sebagai parameter/konfigurasi, bukan hardcode.
**Lanjut ke Tahap 12 — Business Rules.**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal Feature Breakdown, 13 modul dirinci |
