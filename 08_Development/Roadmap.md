# DEVELOPMENT ROADMAP
## Tahap 19 dari 23

Berdasarkan prioritas MoSCoW (Tahap 04) dan urutan ketergantungan teknis (Tahap 16-18).

---

## Fase 1 — Fondasi & MVP Pilot (Must Have)

**Target:** Kelp Petemon + 3 Kelompok Desa Purwodadi bisa online dan dipakai harian.

| Urutan | Item | Alasan Urutan |
|---|---|---|
| 1 | Setup arsitektur, database, autentikasi, RBAC dasar | Fondasi wajib sebelum modul apa pun |
| 2 | Manajemen Kelompok (status aktif/nonaktif) — Admin PPG | Data organisasi (PPG/Desa/Kelompok) harus ada dulu sebelum entitas lain |
| 3 | Data Santri + Data Guru (termasuk impor massal) | Data master, prasyarat modul operasional |
| 4 | Absen Santri | Frekuensi tertinggi (Tahap 09 Alur B), fondasi kriteria Santri Teladan |
| 5 | Dashboard (Kelompok, Desa) — versi dasar | Nilai utama produk (visibilitas), meski masih sederhana |
| 6 | Onboarding in-app (Alur A, Tahap 09) | Krusial karena pengguna belum pernah pakai sistem digital |

## Fase 2 — Fitur Inti TPQ (Should Have)

| Urutan | Item |
|---|---|
| 7 | Munaqosah (buka/tutup periode, input nilai, banner status) |
| 8 | Modul Kurikulum (nilai Akhlaq) — **menunggu klarifikasi cakupan penuh dari Anda** |
| 9 | Bimbingan Konseling (dengan audit log) |
| 10 | Perhitungan otomatis Santri Teladan (bergantung Fase 1+2 lengkap) |
| 11 | Perbandingan Kelompok (Admin Desa) |

## Fase 3 — Pelengkap & Perluasan (Could/Won't Have Fase Ini)

| Urutan | Item |
|---|---|
| 12 | Pusat Unduhan |
| 13 | Kalender |
| 14 | Laporan KBM + export |
| 15 | Peringkat KBM (formula ranking perlu konfirmasi — BR-15) |
| 16 | Dashboard PPG penuh + Perbandingan Desa |
| 17 | Perluasan rollout ke Kelompok/Desa lain (di luar pilot) |

**Di luar roadmap ini** (dikonfirmasi out-of-scope): Pembayaran/SPP, notifikasi wali santri, sertifikat digital.

---

## Milestone & Estimasi Kasar

| Milestone | Cakupan | Catatan |
|---|---|---|
| M1 | Fase 1 selesai | Pilot bisa mulai dipakai harian untuk absensi & data dasar |
| M2 | Fase 2 selesai | Fungsi inti TPQ (Munaqosah, Kurikulum, Konseling) lengkap |
| M3 | Fase 3 selesai | Siap perluasan ke Kelompok lain |

**Catatan estimasi waktu:** Sengaja tidak dicantumkan angka minggu/bulan pasti — proyek ini dikerjakan developer tunggal (dicatat sebagai risiko di Tahap 04 §7), sehingga estimasi realistis sebaiknya ditentukan Anda sendiri berdasarkan ketersediaan waktu, bukan diasumsikan oleh dokumen ini.

---

## Quality Control — Tahap 19

**Selesai:** 3 fase dengan urutan berdasar dependency teknis dan prioritas MoSCoW, milestone jelas.
**Kurang:** Estimasi waktu kalender sengaja tidak diisi — perlu keputusan Anda.
**Risiko:** Sedang — ketergantungan single-developer (dicatat sejak Tahap 04) tetap relevan; roadmap ini realistis dari sisi urutan, bukan menjamin kecepatan.
**Lanjut ke Tahap 20 — Sprint Planning.**

| Versi | Perubahan |
|---|---|
| 1.0 | 3 fase, 17 item roadmap |
