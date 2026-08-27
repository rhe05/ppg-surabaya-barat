import type { MetadataRoute } from 'next';

/* Web App Manifest — supaya "Ruang Ngaji" bisa di-"Add to Home Screen"
   dan terbuka MODE STANDALONE (tanpa address bar / chrome browser, layar
   penuh seperti aplikasi native). Owner minta 2026-08-27.

   Ikon 192 & 512 (public/icon-*.png) dibuat dari logo + padding via sharp
   -- Chrome Android WAJIB ada ikon >=192px baru mau menawarkan "Install".
   icon-maskable-512 = latar hijau full-bleed utk Android adaptive icon. */
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
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
