# SPRINT PLANNING
## Tahap 20 dari 23

Memecah Fase 1 (MVP Pilot) dari Roadmap menjadi sprint 2 mingguan sebagai starting point — dapat disesuaikan kecepatan aktual developer.

---

## Sprint 1: Fondasi
- Setup project (Next.js, Prisma, PostgreSQL, deployment Vercel)
- Skema database inti (organisasi, users) — Tahap 16 §1-2
- Autentikasi + RBAC middleware — Tahap 17 §4
- **Definition of Done:** Admin PPG/Desa/Kelompok bisa login dan hanya melihat scope masing-masing (diuji manual dengan data dummy)

## Sprint 2: Data Master
- CRUD Data Santri + impor massal (FR-10)
- CRUD Data Guru
- Manajemen Kelompok (aktivasi status) — Admin PPG
- **Definition of Done:** Data santri Kelp Petemon & 3 Kelompok Purwodadi berhasil dientri/diimpor

## Sprint 3: Absensi & Dashboard Dasar
- Absen Santri (input cepat + rekap)
- Dashboard Kelompok & Desa versi dasar (KPI + empty state benar)
- **Definition of Done:** Admin Kelompok bisa mencatat kehadiran harian dan melihatnya di dashboard

## Sprint 4: Onboarding & Polish Pilot
- In-app onboarding/tur singkat (Alur A)
- Perbaikan UX berdasarkan uji coba internal dengan data Sprint 1-3
- Persiapan pelatihan pengguna pilot (Kelp Petemon, Bangun Rejo, Purwodadi, Dupak)
- **Definition of Done:** Fase 1 MVP siap dipakai pengguna pilot nyata

---

## Prinsip Sprint Selanjutnya (Fase 2-3)
Sprint 5 dst mengikuti urutan Roadmap §Fase 2-3, direncanakan ulang setelah feedback nyata dari pilot Sprint 4 — sengaja tidak direncanakan detail sekarang karena masukan pengguna pilot kemungkinan mengubah prioritas.

---

## Quality Control — Tahap 20

**Selesai:** 4 sprint terperinci untuk Fase 1 MVP, masing-masing dengan Definition of Done yang jelas dan terukur.
**Kurang:** Sprint 5+ sengaja belum direncanakan — menunggu feedback pilot nyata (keputusan sadar, bukan kelalaian).
**Risiko:** Rendah.
**Lanjut ke Tahap 21 — Development.**

| Versi | Perubahan |
|---|---|
| 1.0 | 4 sprint Fase 1 MVP |
