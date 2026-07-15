# USER JOURNEY
## Tahap 09 dari 23 — Master Project Workflow

| Field | Isi |
|---|---|
| Proyek | Aplikasi Manajemen TPQ — PPG Surabaya Barat |
| Versi Dokumen | 1.0 |
| Status | Draft — menunggu persetujuan sebelum lanjut Tahap 10 |
| Input | User Persona.md v1.0, Master PRD.md v1.0 |
| Tahap Berikutnya | 10 — Information Architecture |

---

## 0. Pemilihan Alur yang Dipetakan

5 alur berikut dipilih karena representasi frekuensi tertinggi (Admin Kelompok) hingga dampak terluas (Admin PPG), plus satu alur khusus **onboarding pertama kali** — krusial mengingat Problem Statement Tahap 03 mengonfirmasi belum ada sistem digital sama sekali sebelumnya.

| # | Alur | Persona | Alasan Dipilih |
|---|---|---|---|
| A | Login Pertama Kali & Onboarding | Admin Kelompok | Risiko tertinggi — pengguna belum pernah pakai sistem serupa |
| B | Pencatatan Kehadiran Harian | Admin Kelompok | Frekuensi tertinggi di seluruh sistem |
| C | Penilaian Munaqosah & Kenaikan Jenjang | Admin Kelompok | Proses inti TPQ, melibatkan business rule kompleks (Tahap 06) |
| D | Rekap & Perbandingan Antar-Kelompok | Admin Desa | Nilai utama level Desa, relevan langsung untuk pilot Desa Purwodadi |
| E | Aktivasi Kelompok Baru | Admin PPG | Alur yang akan dipakai berulang saat rollout bertahap diperluas |

---

## Alur A: Login Pertama Kali & Onboarding (Admin Kelompok)

| Tahap | Aksi Pengguna | Titik Sentuh | Pain Point Potensial | Peluang Desain |
|---|---|---|---|---|
| 1. Menerima akses | Menerima info akun (username/password) dari Admin PPG/Desa | Di luar sistem (WA/lisan) | Tidak tahu harus mulai dari mana | Pesan onboarding jelas menyertai pembagian akun |
| 2. Login pertama | Membuka aplikasi, memasukkan kredensial | Halaman login | Takut salah input, tidak familiar dengan form login | Form sederhana, pesan error yang membimbing (bukan sekadar "salah") |
| 3. Tampilan awal | Melihat dashboard Kelompoknya untuk pertama kali | Dashboard | Bingung harus mulai dari mana karena belum pernah pakai sistem serupa | Tur singkat/highlight fitur utama saat login pertama (bukan langsung dashboard kosong) |
| 4. Memahami menu | Menjelajahi sidebar/menu | Sidebar navigasi | Terlalu banyak menu sekaligus terasa berat bagi pengguna awam | Prioritaskan visual menu yang paling sering dipakai (Absensi) agar menonjol |
| 5. Mencoba fitur pertama | Mencoba mencatat 1 data uji (misal kehadiran) | Halaman Absen Santri | Takut salah input dan merusak data | Sediakan mode/indikasi jelas data tersimpan dengan aman, mudah dikoreksi jika salah |

**Implikasi desain kunci:** Onboarding tidak boleh mengasumsikan pengguna tahu cara pakai aplikasi serupa. Perlu pendampingan dalam produk (in-app guidance), bukan hanya mengandalkan pelatihan tatap muka yang terbatas waktunya.

---

## Alur B: Pencatatan Kehadiran Harian (Admin Kelompok)

| Tahap | Aksi Pengguna | Titik Sentuh | Pain Point Potensial | Peluang Desain |
|---|---|---|---|---|
| 1. Masuk halaman | Buka menu Absen Santri | Sidebar → Absen Santri | — | Menu mudah dijangkau (idealnya dekat atas sidebar, sesuai frekuensi pakai) |
| 2. Pilih konteks | Pilih tanggal/kelas yang akan diabsen | Filter halaman | Jika filter tidak jelas, salah catat tanggal | Default otomatis ke hari ini, minim klik |
| 3. Catat kehadiran | Tandai Hadir/Alpa/Izin per santri | Daftar santri | Jika daftar panjang, memakan waktu; risiko salah tandai | Tampilan daftar ringkas, aksi cepat (mis. tap sekali per status) |
| 4. Simpan | Konfirmasi penyimpanan | Tombol simpan | Tidak yakin data benar-benar tersimpan | Konfirmasi visual jelas ("Tersimpan" dengan indikator, bukan diam saja) |
| 5. Lihat hasil | Cek rekap hari itu | Rekap Harian | — | Rekap langsung terlihat setelah simpan, tanpa perlu pindah halaman |

**Implikasi desain kunci:** Ini alur dengan frekuensi tertinggi — setiap langkah ekstra yang tidak perlu berdampak besar secara kumulatif. Prioritaskan kecepatan di atas kelengkapan fitur untuk alur ini.

---

## Alur C: Penilaian Munaqosah & Pencatatan Kenaikan Jenjang (Admin Kelompok)

| Tahap | Aksi Pengguna | Titik Sentuh | Pain Point Potensial | Peluang Desain |
|---|---|---|---|---|
| 1. Cek status periode | Buka menu Munaqosah, lihat apakah periode terbuka | Banner status | Bingung jika periode tertutup tanpa tahu kapan dibuka lagi | Banner mencantumkan estimasi/kontak (FR-19, sudah dirancang di Tahap 07) |
| 2. Pilih santri | Cari/filter santri yang akan dinilai | Search + filter | — | Konsisten dengan pola pencarian di modul lain |
| 3. Input nilai | Masukkan nilai hafalan & catatan | Form penilaian | Tidak tahu format nilai yang benar (skala berapa) | Petunjuk skala jelas, validasi input |
| 4. Evaluasi kenaikan jenjang | Menimbang apakah santri siap naik jenjang (manual, individual — Tahap 06) | Di luar sistem (penilaian pengurus) → dicatat di sistem | Proses ini sepenuhnya keputusan manusia, sistem hanya mencatat — potensi lupa mencatat setelah keputusan dibuat di luar sistem | Sediakan pengingat/CTA jelas "Catat Kenaikan Jenjang" terhubung dari profil santri, bukan menu terpisah yang mudah terlewat |
| 5. Simpan & lihat dampak | Simpan, lihat status santri (termasuk potensi status Santri Teladan) berubah | Profil santri / rekap | — | Umpan balik jelas bahwa nilai memengaruhi kriteria Santri Teladan (transparansi) |

**Implikasi desain kunci:** Tahap 4 adalah titik rawan — karena keputusan kenaikan jenjang terjadi di kepala pengurus (bukan otomatis dari skor), sistem harus memudahkan mencatatnya tanpa memaksakan alur otomatis yang tidak sesuai kenyataan (Tahap 06 sudah menegaskan ini bukan formula otomatis).

---

## Alur D: Rekap & Perbandingan Antar-Kelompok (Admin Desa — Konteks Desa Purwodadi)

| Tahap | Aksi Pengguna | Titik Sentuh | Pain Point Potensial | Peluang Desain |
|---|---|---|---|---|
| 1. Masuk dashboard Desa | Login, lihat ringkasan Desanya | Dashboard (scope Desa) | — | Otomatis terfilter ke Desa miliknya, tidak perlu filter manual |
| 2. Pilih fokus | Pilih ingin lihat kehadiran, Munaqosah, atau lainnya | Menu/filter | Jika semua modul terpisah, perlu buka satu-satu untuk 3 Kelompok | Pertimbangkan tampilan ringkasan lintas-Kelompok dalam 1 Desa langsung di dashboard (bukan hanya per-modul) |
| 3. Bandingkan Kelompok | Melihat 3 Kelompok (Bangun Rejo, Purwodadi, Dupak) berdampingan | Tabel/chart perbandingan | Tanpa tampilan sisi-berdampingan, perbandingan manual dari 3 layar terpisah melelahkan | Sediakan tabel/chart komparatif eksplisit (bukan hanya total gabungan) — sesuai kebutuhan spesifik Persona Admin Desa (Tahap 08) |
| 4. Tindak lanjut | Hubungi Admin Kelompok tertentu jika ada yang perlu diperhatikan | Di luar sistem | Sistem tidak menunjukkan mana yang perlu perhatian secara otomatis | Highlight visual untuk Kelompok dengan metrik di luar normal (mis. Alpa tinggi — konsisten dengan FR-16) |

**Implikasi desain kunci:** Dashboard Desa idealnya bukan sekadar "Dashboard Kelompok yang datanya lebih banyak" — perlu fitur perbandingan eksplisit, bukan cuma agregat total.

---

## Alur E: Aktivasi Kelompok Baru (Admin PPG — Perluasan Rollout)

| Tahap | Aksi Pengguna | Titik Sentuh | Pain Point Potensial | Peluang Desain |
|---|---|---|---|---|
| 1. Keputusan perluasan | Memutuskan Kelompok mana selanjutnya online (di luar sistem, keputusan organisasi) | Di luar sistem | — | — |
| 2. Cari Kelompok | Masuk ke manajemen Kelompok, cari Kelompok berstatus "Belum Aktif" | Halaman manajemen Kelompok (PPG) | Jika daftar 18 Kelompok tidak terorganisir per Desa, sulit mencari | Kelompokkan tampilan per Desa, bukan daftar datar |
| 3. Aktifkan | Ubah status Kelompok jadi Aktif | Tombol/toggle status | Aksi ini berdampak luas (Kelompok baru langsung muncul di semua dashboard) — perlu konfirmasi jelas | Konfirmasi eksplisit sebelum aktivasi ("Kelompok X akan online dan mulai muncul di semua laporan") |
| 4. Verifikasi | Cek Kelompok baru sudah muncul dengan benar di struktur | Dashboard PPG/Desa terkait | — | Umpan balik jelas bahwa aktivasi berhasil, termasuk di level Desa terkait |
| 5. Informasikan | Memberi tahu Admin Kelompok terkait bahwa akunnya sudah aktif | Di luar sistem | Tidak ada notifikasi otomatis (notifikasi dikonfirmasi di luar cakupan — Tahap 03) | Di luar cakupan sistem — tetap proses manual sesuai kesepakatan sebelumnya |

**Implikasi desain kunci:** Aksi aktivasi Kelompok berdampak sistemik (FR-35/36 dari Tahap 07) — UI harus mencegah aktivasi tidak sengaja, karena efeknya langsung terlihat di seluruh dashboard terkait.

---

## 1. Pola yang Muncul di Seluruh Alur

| Pola | Implikasi |
|---|---|
| Admin Kelompok butuh **kecepatan** di atas kelengkapan | Prioritaskan alur tercepat untuk tugas berfrekuensi tinggi (Absensi) |
| Admin Desa butuh **perbandingan**, bukan sekadar agregat | Dashboard Desa perlu komponen komparatif eksplisit |
| Admin PPG butuh **kontrol dengan konfirmasi jelas** | Aksi berdampak luas (aktivasi Kelompok, buka/tutup periode) perlu konfirmasi eksplisit sebelum dieksekusi |
| Semua level butuh **transparansi status** | Baik status periode Munaqosah, status Kelompok, atau status kenaikan jenjang — pengguna harus selalu tahu "kondisi saat ini" tanpa menebak |

---

## 2. Quality Control — Tahap 09

### Apa yang sudah selesai
- 5 alur kritis dipetakan lengkap dengan tahap, titik sentuh, pain point potensial, dan peluang desain
- Alur onboarding pertama kali dimasukkan secara sengaja, merespons Problem Statement Tahap 03 (belum ada sistem digital sama sekali)
- Pola lintas-alur diidentifikasi untuk menjadi prinsip desain di Tahap 10-13

### Apa yang masih kurang
- Sama seperti Tahap 08, seluruh pain point berstatus **hipotesis**, belum divalidasi ke pengguna nyata
- Alur untuk modul yang belum di-screenshot (Kalender, Laporan KBM, Peringkat KBM) belum dipetakan — bisa menyusul di Tahap 10/11

### Risiko
- **Risiko rendah**: Karena kelima alur ini konsisten dengan pola yang sudah divalidasi struktural sejak Tahap 01-02 (bukan dikarang baru), risiko meleset jauh dari kebutuhan riil relatif kecil dibanding jika dibuat dari nol tanpa dasar reverse engineering.

### Rekomendasi
1. Lanjut ke **Tahap 10 — Information Architecture**, karena alur-alur ini cukup untuk menjadi dasar struktur navigasi.
2. Alur E (Aktivasi Kelompok) khususnya relevan segera — karena strategi rollout bertahap (Tahap 04) berarti alur ini akan dipakai berulang kali ke depan.

### Langkah berikutnya
Menunggu persetujuan Anda untuk lanjut ke **Tahap 10 — Information Architecture**.

---

**Riwayat Versi**

| Versi | Perubahan |
|---|---|
| 1.0 | Draft awal 5 user journey berdasarkan User Persona.md v1.0 dan Master PRD.md v1.0 |
