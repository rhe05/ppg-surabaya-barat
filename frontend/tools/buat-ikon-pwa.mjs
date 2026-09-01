/* Pembuat ikon PWA — dijalankan MANUAL, bukan bagian build:
     node tools/buat-ikon-pwa.mjs
   (dari folder frontend/; hasilnya ditimpa ke public/ lalu di-commit.)

   Yang dibuat: public/icon-maskable-512.png — ikon "maskable" Android
   (adaptive icon). Bedanya dgn icon-192/512 biasa: launcher Android
   MEMOTONG ikon maskable jadi lingkaran/kotak-bulat sesuai tema HP, dan
   hanya menjamin lingkaran tengah berdiameter 80% yang tidak terpotong.
   Karena itu logonya sengaja dibuat kecil (~58% lebar kanvas) dgn latar
   full-bleed.

   2026-09-01: logo diputihkan di atas latar --sage (#059669). Versi
   sebelumnya memakai logo apa adanya (hijau muda #789B81) di atas latar
   hijau yang sama -- kontrasnya terlalu rendah, ikonnya nyaris rata di
   sebagian launcher. Pemutihan dilakukan lewat KANAL ALPHA logo (bentuk
   logo dipakai sbg masker, semua pikselnya diganti putih), jadi tidak
   bergantung pada warna asli berkas sumber.

   sharp tidak ada di package.json -- dia ikut terpasang sbg dependensi
   Next.js (pengoptimal gambar). Kalau suatu saat hilang, pasang sementara
   dgn `npm i -D sharp` lalu copot lagi; skrip ini memang jarang dipakai. */

import sharp from 'sharp';

const SUMBER = 'public/logo-ruang-ngaji.png';
const TUJUAN = 'public/icon-maskable-512.png';
const KANVAS = 512;
const LEBAR_LOGO = 300; // 58% dari kanvas -> aman di dalam lingkaran 80%
const LATAR = { r: 5, g: 150, b: 105, alpha: 1 }; // --sage #059669

/* Logo sumber lebih kecil dari target, jadi WAJIB withoutEnlargement:false
   (dan ukurannya diambil dari hasil resize -- .metadata() pada pipeline
   masih mengembalikan ukuran BERKAS SUMBER, bukan hasilnya). */
const { data: logoSkala, info } = await sharp(SUMBER)
  .resize({ width: LEBAR_LOGO, fit: 'inside', withoutEnlargement: false })
  .png()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;

// Bentuk logo (kanal alpha) dipakai sbg masker utk blok putih polos.
const masker = await sharp(logoSkala).ensureAlpha().extractChannel(3).toColourspace('b-w').toBuffer();
const logoPutih = await sharp({
  create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
})
  .joinChannel(masker)
  .png()
  .toBuffer();

await sharp({ create: { width: KANVAS, height: KANVAS, channels: 4, background: LATAR } })
  .composite([
    {
      input: logoPutih,
      left: Math.round((KANVAS - width) / 2),
      top: Math.round((KANVAS - height) / 2),
    },
  ])
  .png()
  .toFile(TUJUAN);

console.log(`OK ${TUJUAN} (${KANVAS}x${KANVAS}, logo ${width}x${height} putih di atas #059669)`);
