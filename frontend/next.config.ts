import path from 'node:path';
import type { NextConfig } from 'next';

/* Header keamanan (2026-09-10, audit keamanan/performa). Semua di sini
   AMAN untuk app ini (tidak di-embed di mana pun, tidak pakai kamera/
   mikrofon/lokasi, semua aset dari origin sendiri + Supabase).

   CSP penuh (script-src/style-src/…) SENGAJA belum dipasang enforcing:
   Next App Router butuh nonce+middleware untuk script-src ketat, dan
   Tailwind v4 menyuntik <style> inline. Yang dipasang sekarang cuma
   `frame-ancestors 'none'` (anti-clickjacking, tidak mungkin memecah app
   yang tidak di-iframe). CSP penuh yang sudah disiapkan untuk diuji ada
   di SECURITY_PERFORMANCE_AUDIT_2026-09-10.md. */
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  turbopack: {
    /* Akar proyek dipatok ke folder frontend.
       Tanpa ini Turbopack menyimpulkannya sendiri, dan karena ada DUA
       package-lock.json (satu di akar repo untuk perkakas Node, satu di
       sini), ia memilih akar repo. Akibatnya berkas .tsx di folder ini
       di-parse di luar konteks tsconfig frontend dan `next dev` menolak
       JSX yang sah — sementara `next build` tetap hijau karena memakai
       akar yang benar. Gejalanya menyesatkan: pesan errornya menunjuk
       baris penutup komponen, seolah-olah ada kurung yang tidak seimbang.
       Ditemukan 18 Agt 2026 saat menambahkan tombol Ekspor Excel. */
    root: path.join(__dirname),
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
