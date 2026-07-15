# VERSION HISTORY — SELURUH PROYEK

Rekap seluruh dokumen dan perubahan versi signifikan, per tahap.

| Dokumen | Versi Final | Perubahan Kunci |
|---|---|---|
| Benchmark.md | 1.1 | Ditambah verifikasi visual dari 11 screenshot aplikasi KbmKu |
| Reverse_Engineering.md | 1.1 | PPG direvisi dari "Hapus" menjadi "Pertahankan" setelah konfirmasi struktur organisasi |
| Product Vision.md | 1.1 | Problem Statement dikonfirmasi final: belum ada sistem sama sekali |
| Product Strategy.md | 1.2 | Rollout dikonfirmasi bertahap; struktur organisasi lengkap (PPG Surabaya Barat, 5 Desa, 17-18 Kelompok) ditambahkan; scope pilot diperluas ke 2 Desa |
| Market Research.md | 1.0 | Riset kebutuhan internal, ditandai sebagai inferensi bukan wawancara langsung |
| Business Analysis.md | 1.2 | Matriks akses final terkonfirmasi; ditemukan Modul Kurikulum baru; fitur "Ganti Peran" diputuskan tidak dibangun |
| Master PRD.md | 1.0 | 36 functional requirement, 7 NFR, 14 business rule terkonsolidasi |
| User Persona.md | 1.0 | 3 persona (Admin Kelompok/Desa/PPG), ditandai jujur sebagai hipotesis |
| User Journey.md | 1.0 | 5 alur kritis, termasuk onboarding pertama kali |
| Information Architecture.md | 1.0 | Sitemap per role, 2 halaman baru (Perbandingan Kelompok/Desa) |
| Feature Breakdown.md | 1.0 | 13 modul dirinci ke level fitur, 6 keputusan default diambil |
| Business Rules.md | 1.0 | 21 business rule terformalkan |
| Wireframe.md | 1.0 | 5 wireframe struktural kunci |
| Design System.md | 1.0 | Token warna, tipografi, komponen inti |
| UI Specification.md | 1.0 | State, responsive, interaksi, aksesibilitas |
| Database Design.md | 1.0 | 12 entitas, relasi, audit log |
| System Architecture.md | 1.0 | Stack Next.js/Prisma/PostgreSQL/Vercel, RBAC berlapis |
| API Design.md | 1.0 | Endpoint REST seluruh modul |
| Roadmap.md | 1.0 | 3 fase, 17 item |
| Sprint Planning.md | 1.0 | 4 sprint Fase 1 MVP |
| Development (scaffold) | 0.1 | Schema Prisma lengkap + 2 endpoint contoh berjalan |
| Testing Plan.md | 1.0 | 10 kasus uji kritis dari Business Rules |
| Release Plan.md | 1.0 | Strategi rilis bertahap + ringkasan 23 tahap |
| ADR.md | 1.0 | 8 keputusan kunci terdokumentasi |

---

## Item Terbuka yang Dibawa ke Fase Development (Rekap Final)

1. Selisih 17 vs 18 Kelompok — perlu klarifikasi sebelum seed data produksi
2. 10 nama Kelompok (Desa Tanbar, Tantim, Benowo) — belum diberikan
3. Cakupan penuh Modul Kurikulum di luar nilai Akhlaq
4. Formula ranking Peringkat KBM (BR-15) — masih default sementara
5. Kategori Guru — padanan istilah TPQ untuk "Muballigh Tugasan/Setempat"
6. Konfirmasi stack teknologi (Tahap 17) — masih usulan

---

| Versi | Perubahan |
|---|---|
| 1.0 | Rekap final seluruh 23 tahap proyek |

---

## Update Pasca-23 Tahap

| Tanggal Update | Perubahan |
|---|---|
| Pasca-selesai | Nama aplikasi ditetapkan: "PPG" dengan subtitle "Surabaya Barat" (ADR-009) |
| Pasca-selesai | Seluruh 18 nama Kelompok lengkap: Tanbar (Manukan 1, Manukan 2, Candi Lontar, Wonorejo), Tantim (Balongsari, Dermo, Buntaran), Benowo (Sememi Barat, Sememi Timur, Pakal) ditambahkan ke Product Strategy, Master PRD, Database Design |
| Pasca-selesai | Selisih 17 vs 18 Kelompok **masih terbuka** meski data sudah lengkap — item terakhir sebelum seed data produksi final |

| Pasca-selesai | **Koreksi final**: Total Kelompok resmi diubah dari 17 menjadi **18**, mengikuti hitungan rincian per-Desa (5+3+4+3+3). Seluruh referensi "17 Kelompok" di 13 dokumen dikoreksi. Lihat ADR-010. |
