/* Uji logika murni untuk fungsi-fungsi yang paling menentukan di layar
   guru — dijalankan TANPA jaringan, TANPA peramban, TANPA basis data.
   Inilah yang dipanggil CI di tiap push.

   Kenapa terpisah dari uji-hafalan-surat.mjs & uji-minggu-bulan.mjs:
   dua berkas itu punya tugas lain. uji-hafalan-surat menembak data
   PRODUKSI (gunanya justru itu: ejaan asli yang aneh-aneh baru ketahuan
   di sana), jadi tidak bisa jalan di CI tanpa kunci. uji-minggu-bulan
   murni dan MEMANG ikut dipanggil CI.

   Contoh masukan di bawah disalin dari baris produksi sungguhan, bukan
   karangan — itu sebabnya ia menangkap hal-hal seperti "Menambah hafalan
   Surat X s/d Surat Y" yang dulu lolos.

   Jalankan: node tools/uji-logika.mjs */

import { barisHafalanDariTeks, uraikanBarisHafalan } from '../lib/hafalanSurat.ts';
import { pecahJudulMateri } from '../lib/judulMateri.ts';
import { rentangMinggu, mingguKeDariTanggal, labelRentangMinggu } from '../lib/mingguBulan.ts';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

let lulus = 0;
const gagal = [];

function periksa(nama, dapat, harap) {
  const a = JSON.stringify(dapat);
  const b = JSON.stringify(harap);
  if (a === b) lulus += 1;
  else gagal.push(`${nama}\n     dapat : ${a}\n     harap : ${b}`);
}

/* ── hafalanSurat: penguraian rentang ─────────────────────────────── */

periksa(
  'rentang sederhana "A s/d B" terurai per surat',
  uraikanBarisHafalan('Surat Al-Kautsar s/d Surat Quraisy'),
  ['Al-Kautsar', "Al-Ma'un", 'Quraisy']
);

periksa(
  'awalan "Menambah hafalan" tidak menghalangi penguraian',
  uraikanBarisHafalan('Menambah hafalan Surat Al-Fiil s/d Surat Al-Asyr'),
  ['Al-Fiil', 'Al-Humazah', "Al-'Asr"]
);

periksa(
  'ejaan produksi yang menyimpang tetap dikenali (Al-Qodr -> Al-Qadr)',
  uraikanBarisHafalan('menambah hafalan surat Al-Qodr'),
  ['Al-Qadr']
);

periksa(
  'Al-Fatihah diperlakukan khusus (bukan bagian Juz Amma)',
  uraikanBarisHafalan('Surat Al-Fatihah s/d Surat Al-Ikhlas'),
  ['Al-Fatihah', 'An-Nas', 'Al-Falaq', 'Al-Ikhlas']
);

periksa(
  'baris "surat-surat pilihan (...)" diambil isi kurungnya, tidak dipaksa diurai',
  uraikanBarisHafalan('Menambah hafalan surat-surat pilihan (surat al-Mulk ayat 1-12)'),
  ['Al-Mulk ayat 1-12']
);

periksa(
  'materi PENGULANGAN ("menjaga hafalan") dibuang dari pilihan',
  barisHafalanDariTeks('1. Menjaga hafalan surat An-Nas s/d surat Al-Kafirun \n2. Menambah hafalan Surat Al Kautsar s/d Surat Quraisyh'),
  ['Menambah hafalan Surat Al Kautsar s/d Surat Quraisyh']
);

periksa(
  'butir "-" mewarisi pengecualian dari baris induknya (kasus kelas 10)',
  barisHafalanDariTeks('1. Menjaga hafalan juz 30\n2. Menjaga hafalan surat-surat pilihan : \n- Surat Al-Baqoroh ayat 1-4\n- Tiga ayat akhir surat Al-Hasyr'),
  []
);

/* ── judulMateri: susunan judul bertingkat ────────────────────────── */

periksa(
  'judul Klasikal dipecah kategori / judul / rincian',
  pecahJudulMateri("Klasikal — Hafalan Surat: Al-Lahab, An-Nasr, Al-Kafirun"),
  { kategori: 'Klasikal', utama: 'Hafalan Surat', rincian: 'Al-Lahab, An-Nasr, Al-Kafirun' }
);

periksa(
  'judul bebas ketikan guru TIDAK dipotong sedikit pun',
  pecahJudulMateri('Praktik wudhu di halaman'),
  { kategori: null, utama: 'Praktik wudhu di halaman', rincian: null }
);

periksa(
  'judul dengan titik dua tapi tanpa kategori tetap terbaca benar',
  pecahJudulMateri('Bacaan Al-Quran: Juz 24'),
  { kategori: null, utama: 'Bacaan Al-Quran', rincian: 'Juz 24' }
);

/* ── mingguBulan: aturan minggu mengikuti hari Senin ──────────────── */

periksa(
  'September 2026 (mulai Selasa): Minggu 1 = 1-6, label hanya hari sekolah',
  [rentangMinggu(2026, 9, 1), labelRentangMinggu(2026, 9, 1, NAMA_BULAN)],
  [{ awal: 1, akhir: 6 }, '1 – 4 September 2026']
);

periksa(
  'Senin 7 September masuk Minggu 2, bukan Minggu 1',
  mingguKeDariTanggal(new Date(2026, 8, 7)),
  2
);

periksa(
  'Agustus 2026 (mulai Sabtu): kepala akhir pekan ikut Minggu 1, tidak jadi minggu ke-6',
  [rentangMinggu(2026, 8, 1), rentangMinggu(2026, 8, 5)],
  [{ awal: 1, akhir: 9 }, { awal: 31, akhir: 31 }]
);

periksa(
  'tidak pernah ada minggu ke-6 di bulan mana pun (2024-2031)',
  (() => {
    for (let t = 2024; t <= 2031; t++) {
      for (let b = 1; b <= 12; b++) {
        const hariTerakhir = new Date(t, b, 0).getDate();
        const mkTerakhir = mingguKeDariTanggal(new Date(t, b - 1, hariTerakhir));
        if (mkTerakhir > 5) return `${b}/${t} butuh minggu ${mkTerakhir}`;
      }
    }
    return 'aman';
  })(),
  'aman'
);

/* ── hasil ────────────────────────────────────────────────────────── */

console.log(`\nuji logika: ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length > 0) {
  console.log('\n' + gagal.map((g) => '  GAGAL: ' + g).join('\n\n'));
  process.exitCode = 1;
}
