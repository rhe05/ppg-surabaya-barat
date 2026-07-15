# SYSTEM ARCHITECTURE
## Tahap 17 dari 23

---

## 1. Prinsip Arsitektur

Diturunkan dari NFR Tahap 07 dan prinsip Clean Architecture / DDD sesuai standar kualitas yang ditetapkan di awal proyek:
- **Separation of concerns**: presentasi, logika bisnis, dan akses data terpisah jelas
- **RBAC ditegakkan di layer API**, bukan hanya disembunyikan di UI (agar tidak bisa dilewati)
- **Skalabilitas terukur**: arsitektur harus menangani pilot (4 Kelompok) hingga skala penuh (18 Kelompok) tanpa perubahan struktural

## 2. Stack Teknologi (Usulan)

| Layer | Teknologi | Alasan |
|---|---|---|
| Frontend | Next.js (React) | Mendukung SSR untuk performa, familiar dengan ekosistem luas, cocok untuk dashboard data-heavy |
| Styling | Tailwind CSS | Konsisten dengan Design System (Tahap 14) berbasis token |
| Backend/API | Next.js API Routes / Route Handlers | Satu codebase dengan frontend, mempercepat pengembangan single-developer |
| ORM | Prisma | Type-safe, migrasi skema mudah dari Database Design (Tahap 16) |
| Database | PostgreSQL | Relasional, mendukung constraint FK/unique yang dibutuhkan skema Tahap 16 |
| Autentikasi | NextAuth.js (credentials-based) atau JWT custom | Sesuai kebutuhan role-based, tanpa OAuth pihak ketiga (tidak diperlukan) |
| Hosting | Vercel | Konsisten dengan pola aplikasi referensi (KbmKu di-hosting Vercel), deployment sederhana untuk tim kecil |
| File Storage | Vercel Blob / S3-compatible | Untuk Pusat Unduhan (dokumen) |

**Catatan:** Ini usulan berdasarkan kesesuaian dengan kebutuhan (skala kecil-menengah, tim developer tunggal, kebutuhan RBAC). Bisa disesuaikan jika Anda punya preferensi/batasan lain (mis. sudah familiar stack tertentu).

## 3. Diagram Lapisan (Layered Architecture)

```
┌─────────────────────────────────────────┐
│  Presentation Layer (Next.js Pages/UI)   │  ← Wireframe & UI Spec (Tahap 13-15)
├─────────────────────────────────────────┤
│  API Layer (Route Handlers)              │  ← Validasi input, autentikasi
├─────────────────────────────────────────┤
│  Business Logic Layer (Services)         │  ← Business Rules (Tahap 12): BR-10, BR-13, dst
│    - RBAC Enforcement                    │
│    - Kalkulasi Santri Teladan            │
│    - Validasi Rekonsiliasi Data (BR-16)  │
├─────────────────────────────────────────┤
│  Data Access Layer (Prisma ORM)          │
├─────────────────────────────────────────┤
│  PostgreSQL Database                     │  ← Database Design (Tahap 16)
└─────────────────────────────────────────┘
```

## 4. RBAC Enforcement (Kritis)

Setiap request API divalidasi 2 lapis:
1. **Autentikasi**: siapa pengguna ini (dari session/token)
2. **Otorisasi**: apakah `role` + `scope` pengguna berhak atas `resource` yang diminta (mis. Admin Kelompok X tidak bisa mengakses data Kelompok Y)

```
Request → Middleware Auth → Middleware Scope Check → Business Logic → Response
```
Ini mencegah kebocoran data lintas-Kelompok/Desa hanya karena UI "kebetulan" tidak menampilkannya — celah keamanan yang sering terjadi jika RBAC hanya di frontend.

## 5. Topologi Deployment (Sesuai Rollout Bertahap)

```
Fase Pilot (4 Kelompok, 2 Desa)
  → 1 instance aplikasi, 1 database
  → Beban rendah, tidak perlu load balancing

Fase Perluasan (hingga 18 Kelompok)
  → Instance sama (Vercel auto-scale untuk serverless)
  → Database perlu dipantau (index, connection pooling) seiring pertumbuhan data
```

## 6. Keamanan Tambahan

| Aspek | Penerapan |
|---|---|
| Password | Hash dengan bcrypt/argon2, tidak pernah disimpan plaintext |
| Data sensitif (Konseling) | Tetap tersimpan di DB yang sama (akses terbuka semua role per BR-08), tapi audit log wajib aktif |
| Rate limiting | Pada endpoint login untuk mencegah brute-force |
| HTTPS | Wajib, default di Vercel |

---

## Quality Control — Tahap 17

**Selesai:** Stack teknologi diusulkan dengan alasan, arsitektur berlapis, RBAC enforcement level-API, topologi deployment sesuai rollout bertahap.
**Kurang:** Stack ini adalah usulan, belum dikonfirmasi preferensi Anda — bisa disesuaikan sebelum Tahap 21 (Development) dimulai sungguhan.
**Risiko:** Rendah — arsitektur cukup standar dan mendukung skala proyek ini.
**Lanjut ke Tahap 18 — API Design.**

| Versi | Perubahan |
|---|---|
| 1.0 | Arsitektur berlapis, stack usulan, RBAC enforcement |
