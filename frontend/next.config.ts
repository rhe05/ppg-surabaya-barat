import path from 'node:path';
import type { NextConfig } from 'next';

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
};

export default nextConfig;
