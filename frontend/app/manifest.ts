import type { MetadataRoute } from 'next';

/* Web App Manifest — supaya "Ruang Ngaji" bisa di-"Add to Home Screen"
   dan terbuka MODE STANDALONE (tanpa address bar / chrome browser, layar
   penuh seperti aplikasi native). Owner minta 2026-08-27. Ikon masih pakai
   logo yang ada (belum 512x512 kotak sempurna) — bisa diganti nanti. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ruang Ngaji',
    short_name: 'Ruang Ngaji',
    description: 'Platform manajemen ngaji PPG Surabaya Barat.',
    id: '/',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F8FAFC',
    theme_color: '#FFFFFF',
    lang: 'id',
    icons: [
      {
        src: '/logo-ruang-ngaji.png',
        sizes: '149x149',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicon.ico',
        sizes: '48x48',
        type: 'image/x-icon',
      },
    ],
  };
}
