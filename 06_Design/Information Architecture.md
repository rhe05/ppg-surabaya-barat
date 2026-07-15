# INFORMATION ARCHITECTURE
## Tahap 10 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ — PPG Surabaya Barat |
| Versi Dokumen | 1.0 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 11 |
| Input | Master PRD.md v1.0, User Journey.md v1.0, Business Analysis.md v1.2 |
| Tahap Berikutnya | 11 — Feature Breakdown |

---

## 1. Prinsip Penyusunan

Struktur informasi disusun mengikuti 3 prinsip yang diturunkan langsung dari tahap-tahap sebelumnya, bukan konvensi umum semata:

1. **Navigasi mengikuti frekuensi pakai per role** (Tahap 09) — menu yang paling sering dipakai Admin Kelompok (Absensi) harus paling mudah dijangkau, bukan disusun alfabetis atau meniru urutan referensi apa adanya.
2. **Konten terlihat sesuai scope akses** (Tahap 06) — Admin Kelompok tidak melihat menu yang hanya relevan untuk Desa/PPG, mengurangi kebingungan bukan menyembunyikan lewat izin belaka.

3. **Satu context bar global**, bukan filter berulang per halaman (prinsip desain Tahap 03 §6, merespons kelemahan konkret Tahap 02).

---

## 2. Sitemap — Struktur Navigasi per Role

### 2.1 Admin Kelompok (Scope: 1 Kelompok)

```
Dashboard (ringkasan Kelompoknya)
├── Absen Santri            ← prioritas navigasi tertinggi (Tahap 09, Alur B)
├── Munaqosah
├── Data Santri
│    └── Kenaikan Jenjang   ← akses cepat dari profil santri (Tahap 09, Alur C)
├── Modul Kurikulum
├── Bimbingan Konseling
├── Data Guru
├── Pusat Unduhan
├── Kalender
├── Laporan KBM
├── Peringkat KBM (lihat posisi Kelompoknya)
└── Keluar
```

### 2.2 Admin Desa (Scope: Seluruh Kelompok di 1 Desa)

```
Dashboard (ringkasan Desa + perbandingan antar-Kelompok)  ← beda dari Admin Kelompok, lihat Tahap 09 Alur D
├── Perbandingan Kelompok        ← BARU, khusus Admin Desa
├── Absen Santri (semua Kelompok di Desanya)
├── Munaqosah
│    └── Buka/Tutup Periode      ← kewenangan khusus (Tahap 06)
├── Data Santri
├── Modul Kurikulum
├── Bimbingan Konseling
├── Data Guru
├── Pusat Unduhan
├── Kalender
├── Laporan KBM
├── Peringkat KBM (antar-Kelompok dalam Desanya)
└── Keluar
```

### 2.3 Admin PPG (Scope: Seluruh Organisasi)

```
Dashboard PPG (ringkasan lintas-Desa)
├── Manajemen Kelompok            ← BARU, khusus Admin PPG (aktivasi/nonaktivasi, Tahap 09 Alur E)
├── Perbandingan Desa             ← BARU, setara "Perbandingan Kelompok" tapi 1 level lebih tinggi
├── Absen Santri (seluruh organisasi)
├── Munaqosah
│    └── Buka/Tutup Periode
├── Data Santri
├── Modul Kurikulum
├── Bimbingan Konseling
├── Data Guru
├── Pusat Unduhan
├── Kalender
├── Laporan KBM
├── Peringkat KBM (seluruh organisasi)
└── Keluar
```

**Catatan penting:** "Perbandingan Kelompok" dan "Perbandingan Desa" adalah **halaman baru** yang tidak ada eksplisit di aplikasi referensi — muncul dari kebutuhan konkret Persona Admin Desa (Tahap 08) dan Alur D (Tahap 09). Ini bukan penambahan sembarangan; ditandai jelas sebagai turunan kebutuhan nyata, bukan fitur tambahan tanpa dasar.

---

## 3. Matriks Visibilitas Menu per Role

| Menu | Admin Kelompok | Admin Desa | Admin PPG |
|---|:---:|:---:|:---:|
| Dashboard | ✅ (scope Kelompok) | ✅ (scope Desa) | ✅ (scope PPG) |
| Manajemen Kelompok | ❌ | ❌ | ✅ |
| Perbandingan Kelompok | ❌ | ✅ | ❌ *(diganti "Perbandingan Desa")* |
| Perbandingan Desa | ❌ | ❌ | ✅ |
| Absen Santri | ✅ | ✅ | ✅ |
| Munaqosah — Buka/Tutup Periode | ❌ | ✅ | ✅ |
| Munaqosah — Input Nilai | ✅ | ❌ *(hanya lihat)* | ❌ *(hanya lihat)* |
| Data Santri | ✅ | ✅ | ✅ |
| Modul Kurikulum | ✅ | ✅ | ✅ |
| Bimbingan Konseling | ✅ | ✅ | ✅ |
| Data Guru | ✅ | ✅ | ✅ |
| Pusat Unduhan | ✅ | ✅ | ✅ |
| Kalender | ✅ | ✅ | ✅ |
| Laporan KBM | ✅ | ✅ | ✅ |
| Peringkat KBM | ✅ | ✅ | ✅ |

**Catatan atas "Munaqosah — Input Nilai":** Hanya Admin Kelompok yang menginput nilai (konsisten dengan matriks akses Tahap 06 — Admin Desa/PPG tidak disebutkan berwenang input/edit data operasional harian). Admin Desa/PPG tetap bisa **melihat** hasil penilaian, hanya tidak menginput langsung.

---

## 4. Context Bar Global (Lintas Halaman)

Menggantikan pola filter berulang yang jadi kelemahan di Tahap 02:

| Elemen | Perilaku per Role |
|---|---|
| Selector Semester | Selalu ada, sama untuk semua role |
| Selector Desa | **Tersembunyi** untuk Admin Kelompok/Desa (scope tetap); **terlihat** untuk Admin PPG (bisa pilih Desa mana) |
| Selector Kelompok | **Tersembunyi** untuk Admin Kelompok (scope tetap 1 Kelompok); **terlihat** untuk Admin Desa (pilih di antara Kelompok Desanya) dan Admin PPG (pilih dari seluruh 18) |
| Indikator status Kelompok | Menampilkan badge "Aktif"/"Belum Aktif" di context bar jika relevan (khusus Admin Desa/PPG yang mungkin melihat Kelompok belum aktif) |

**Prinsip:** Context bar **beradaptasi terhadap scope role**, bukan menampilkan semua selector ke semua orang — ini mencegah Admin Kelompok bingung melihat pilihan Desa/Kelompok yang tidak relevan untuknya.

---

## 5. Pengelompokan Konten (Content Grouping Logic)

| Kelompok Menu | Anggota | Alasan Dikelompokkan |
|---|---|---|
| **Operasional Harian** | Absen Santri, Munaqosah, Modul Kurikulum | Dipakai rutin, prioritas navigasi tertinggi |
| **Data Master** | Data Santri, Data Guru | Data referensi yang jarang berubah struktur, sering dicari/dilihat |
| **Perhatian Khusus** | Bimbingan Konseling | Dipisah dari Data Master karena sifat data sensitif, walau aksesnya terbuka untuk semua role (Tahap 06) |
| **Dokumentasi & Jadwal** | Pusat Unduhan, Kalender | Sifat referensi, bukan input data transaksional |
| **Pelaporan & Evaluasi** | Laporan KBM, Peringkat KBM | Bersifat ringkasan/output, biasanya diakses periodik bukan harian |
| **Administrasi Organisasi** | Manajemen Kelompok, Perbandingan Kelompok/Desa | Khusus Admin Desa/PPG, terkait struktur organisasi bukan operasional Kelompok |

---

## 6. Quality Control — Tahap 10

### Apa yang sudah selesai
- Sitemap tersusun terpisah untuk 3 role, mencerminkan scope akses (Tahap 06) dan kebutuhan spesifik tiap persona (Tahap 08)
- Matriks visibilitas menu eksplisit — tidak ada ambiguitas menu mana terlihat untuk role mana
- 2 halaman baru (Perbandingan Kelompok, Perbandingan Desa) diusulkan dengan dasar kebutuhan jelas, bukan tambahan sembarangan
- Context bar global dirancang adaptif per role, langsung menjawab kelemahan struktural Tahap 02-03
- Pengelompokan konten memakai logika yang bisa dijelaskan (bukan sekadar meniru urutan referensi)

### Apa yang masih kurang
- Urutan pasti menu dalam tiap grup (Bagian 5) belum final — perlu divalidasi lagi di Tahap 13 (Wireframe) saat sudah dalam bentuk visual
- Belum ada keputusan soal breadcrumb/navigasi kedalaman halaman (misal dari Data Santri → profil individu → Kenaikan Jenjang) — akan dirinci di Tahap 13

### Risiko
- **Risiko rendah**: Struktur ini diturunkan konsisten dari keputusan-keputusan yang sudah dikonfirmasi di tahap sebelumnya, bukan asumsi baru — risiko revisi besar relatif kecil.
- **Risiko rendah**: 2 halaman baru (Perbandingan) menambah sedikit kompleksitas pengembangan dibanding sekadar meniru referensi, tapi ini sudah diperhitungkan sebagai trade-off sadar sejak Tahap 02.

### Rekomendasi
Lanjut ke **Tahap 11 — Feature Breakdown**, karena struktur navigasi sudah cukup solid untuk merinci fitur per halaman.

### Langkah berikutnya
Menunggu persetujuan Anda untuk lanjut ke **Tahap 11 — Feature Breakdown**.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal Information Architecture — sitemap 3 role, matriks visibilitas menu, context bar global |
