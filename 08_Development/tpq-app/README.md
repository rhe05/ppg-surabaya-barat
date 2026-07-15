# PPG
### Surabaya Barat

Scaffold awal Tahap 21 (Development), dibangun dari seluruh dokumen Tahap 01–20 di folder `PROJECT/`.

**Nama aplikasi:** PPG — dengan subtitle "Surabaya Barat" ditampilkan di header/logo area (lihat Wireframe §1-2 untuk posisi logo, dan Design System §2 untuk token tipografi subtitle).

## Isi Scaffold Ini

- `prisma/schema.prisma` — skema database lengkap (12 entitas) sesuai `07_Architecture/Database Design.md`
- `src/lib/auth.ts` — logika inti RBAC (verifikasi token, cek scope akses, cek wewenang hapus)
- `src/app/api/kelompok/[id]/status/route.ts` — contoh lengkap: endpoint aktivasi Kelompok (Admin PPG saja)
- `src/app/api/absensi/batch/route.ts` — contoh lengkap: endpoint simpan absensi harian dengan RBAC

Kedua contoh endpoint ini **berjalan** (bukan pseudocode) jika dijalankan dengan database PostgreSQL dan environment variable yang sesuai — dipilih karena mewakili 2 pola berbeda: aksi berdampak luas dengan konfirmasi (Kelompok) dan aksi frekuensi tinggi (Absensi).

## Yang BELUM Ada di Scaffold Ini (Jujur, Bukan Kelalaian)

Membangun seluruh 13 modul, seluruh halaman UI, dan seluruh endpoint API dalam satu sesi percakapan **tidak realistis untuk hasil berkualitas** — ini akan menghasilkan kode yang terlihat lengkap tapi sebenarnya belum teruji, bertentangan dengan standar "bukan AI slop" yang jadi prinsip proyek ini sejak awal. Yang belum dibangun:

- Halaman UI (React components) — Wireframe (Tahap 13) & UI Spec (Tahap 15) sudah siap jadi acuan
- Endpoint API sisanya (Data Santri, Munaqosah, Kurikulum, Konseling, dll) — API Design (Tahap 18) sudah mendefinisikan kontraknya, tinggal diimplementasikan mengikuti pola 2 contoh di atas
- Sistem autentikasi lengkap (login/register flow)
- Testing otomatis

## Rekomendasi Langkah Selanjutnya

Untuk melanjutkan pengembangan riil, sesi ini (chat biasa) bukan tempat yang ideal — setiap file butuh iterasi, testing, dan debugging yang jauh lebih efisien dilakukan di **Claude Code** (CLI/desktop), yang bisa membaca-tulis-menjalankan kode langsung di proyek Anda, mengikuti Sprint Planning (Tahap 20) satu-per-satu dengan verifikasi di setiap langkah — konsisten dengan preferensi kerja Anda (audit sebelum patch, satu langkah dikonfirmasi dulu sebelum lanjut).

## Setup Lokal (Untuk Kelanjutan Development)

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Perlu file `.env` dengan `DATABASE_URL` (PostgreSQL) dan `JWT_SECRET`.
