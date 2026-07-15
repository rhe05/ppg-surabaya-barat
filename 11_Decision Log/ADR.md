# ARCHITECTURE & BUSINESS DECISION RECORDS (ADR)

Mencatat keputusan penting sepanjang proyek — kapan diputuskan, kenapa, dan alternatif yang dipertimbangkan.

---

### ADR-001: PPG dipertahankan sebagai level administratif (bukan dihapus)
**Tahap:** 02 (revisi setelah konfirmasi Tahap 06)
**Keputusan:** PPG dipertahankan sebagai level teratas struktur organisasi.
**Alasan:** Awalnya diduga modul tanpa fungsi jelas (tidak ada di screenshot). Setelah konfirmasi, PPG ternyata level administratif nyata membawahi 5 Desa.
**Alternatif ditolak:** Menghapus PPG dari scope (keputusan default awal, terbukti keliru).

### ADR-002: Fitur "Ganti Peran" tidak dibangun
**Tahap:** 06
**Keputusan:** Fitur multi-role dari aplikasi referensi tidak direplikasi.
**Alasan:** Struktur organisasi nyata menetapkan satu orang = satu role, satu scope — berbeda dari aplikasi referensi.
**Dampak:** Menyederhanakan model data `User` (scope tunggal, bukan array scope).

### ADR-003: Rollout bertahap (pilot), bukan serentak
**Tahap:** 04
**Keputusan:** Peluncuran dimulai dari Kelp Petemon + seluruh Desa Purwodadi (4/18 Kelompok).
**Alasan:** Tidak ada sistem digital sebelumnya di organisasi ini — risiko kesalahan penggunaan tinggi jika langsung skala penuh.
**Alternatif ditolak:** Big bang ke 18 Kelompok sekaligus.

### ADR-004: Modul Kurikulum ditambahkan (di luar hasil reverse engineering)
**Tahap:** 06
**Keputusan:** Modul ke-12 ditambahkan sebagai sumber nilai Akhlaq.
**Alasan:** Aplikasi referensi tidak punya modul ini — murni kebutuhan nyata TPQ Anda.
**Status:** Cakupan penuh masih perlu klarifikasi (lihat item terbuka di Release Plan).

### ADR-005: Kenaikan jenjang dicatat manual per-santri, bukan otomatis
**Tahap:** 06
**Keputusan:** Sistem tidak menghitung kenaikan jenjang otomatis dari skor; hanya mencatat keputusan manusia.
**Alasan:** Dikonfirmasi proses berjalan manual dan berbeda tiap anak — bukan proses batch terjadwal.

### ADR-006: Stack teknologi — Next.js + PostgreSQL + Prisma + Vercel
**Tahap:** 17
**Keputusan:** Full-stack Next.js dengan Prisma ORM, deploy ke Vercel.
**Alasan:** Cocok untuk tim developer tunggal, satu codebase frontend+backend, konsisten dengan pola hosting aplikasi referensi.
**Status:** Usulan, belum dikonfirmasi eksplisit oleh Anda — bisa diubah sebelum Sprint 1.

### ADR-007: RBAC ditegakkan di layer API, bukan hanya UI
**Tahap:** 17
**Keputusan:** Setiap endpoint API memvalidasi scope akses secara independen dari tampilan.
**Alasan:** Mencegah kebocoran data lintas-Kelompok/Desa jika UI "kebetulan" tidak menampilkan opsi tertentu — celah keamanan umum jika RBAC hanya di frontend.

### ADR-008: Development scaffold, bukan aplikasi lengkap, di Tahap 21
**Tahap:** 21
**Keputusan:** Hanya menyediakan scaffold (schema, 2 endpoint contoh) alih-alih mencoba membangun 13 modul sekaligus dalam satu sesi.
**Alasan:** Membangun aplikasi lengkap tanpa iterasi/testing bertahap berisiko menghasilkan kode tidak teruji — bertentangan dengan standar kualitas proyek ("bukan AI slop").
**Rekomendasi terkait:** Lanjutkan di Claude Code dengan Sprint Planning sebagai panduan.

### ADR-009: Nama aplikasi "PPG" dengan subtitle "Surabaya Barat"
**Tahap:** Pasca-23 (penamaan final)
**Keputusan:** Nama aplikasi adalah "PPG", ditampilkan dengan subtitle "Surabaya Barat" di area branding (logo/header).
**Alasan:** Langsung dikenali secara internal oleh pengguna organisasi (Admin Kelompok/Desa/PPG) tanpa perlu penjelasan tambahan — relevan mengingat Persona Tahap 08 belum familiar dengan sistem digital, nama yang sudah dikenal (PPG) mengurangi friksi pengenalan dibanding nama baru yang asing.
**Alternatif ditolak:** Nama serupa aplikasi referensi (KbmKu/KBM), nama evokatif baru (BinaQu, Amanah, dll) — ditolak karena kurang eksplisit untuk konteks organisasi yang sudah mapan.
**Dampak:** package.json, README, dan token tipografi Design System (`--text-brand-title`, `--text-brand-subtitle`) diperbarui.

---

| Versi | Perubahan |
|---|---|
| 1.0 | 8 keputusan kunci terdokumentasi dari Tahap 02-21 |
| 1.1 | ADR-009 ditambahkan: nama aplikasi "PPG" dengan subtitle "Surabaya Barat" |

### ADR-010: Jumlah Kelompok final dikoreksi dari 17 menjadi 18
**Tahap:** Pasca-23 (koreksi data final)
**Keputusan:** Total Kelompok resmi adalah **18**, bukan 17 seperti yang sempat dikonfirmasi di Tahap 01-03.
**Alasan:** Rincian per-Desa (5+3+4+3+3) konsisten menjumlah 18 di setiap kesempatan diberikan, dengan seluruh 18 nama akhirnya lengkap dan spesifik. Anda mengonfirmasi memakai hitungan rincian sebagai acuan resmi, bukan angka "17" sebelumnya.
**Dampak:** BR-01 (Business Rules), skema seed data (Database Design), dan seluruh referensi "17 Kelompok" di 13 dokumen dikoreksi menjadi 18.
