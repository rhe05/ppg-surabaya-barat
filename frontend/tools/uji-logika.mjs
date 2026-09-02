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
import { pesanGalatDb } from '../lib/pesanGalatDb.ts';
import { rentangBulan } from '../lib/periodeAkademik.ts';
import { gabungkanDoaDuaSemester } from '../lib/materiHafalanDoa.ts';

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

/* ── pesanGalatDb: galat basis data jadi kalimat yang bisa ditindak ─ */

periksa(
  'bentrok Klasikal diterjemahkan, bukan ditampilkan mentah',
  pesanGalatDb(new Error('duplicate key value violates unique constraint "uq_jurnal_klasikal_kelas_tanggal"'), 'cadangan'),
  'Materi Klasikal untuk tanggal itu sudah ada. Ubah yang sudah ada, jangan tambah baru — satu tanggal cukup satu Klasikal (hafalan surat & doa jadi satu).'
);

periksa(
  'bentrok judul materi ngaji diterjemahkan',
  pesanGalatDb(new Error('duplicate key ... "uq_jurnal_ngaji_kelas_tanggal_judul"'), 'cadangan'),
  'Materi dengan judul yang sama sudah ada di tanggal itu.'
);

periksa(
  'galat yang TIDAK dikenali diteruskan apa adanya (jangan ditelan)',
  pesanGalatDb(new Error('connection refused'), 'cadangan'),
  'connection refused'
);

periksa(
  'galat kosong jatuh ke pesan cadangan',
  pesanGalatDb(null, 'Gagal menyimpan.'),
  'Gagal menyimpan.'
);

/* ── periodeAkademik: rentang Bulan ──────────────────────────────────
   (Semester/Tahun Ajaran DIHAPUS 2026-09-02 malam, lihat komentar
   kepala lib/periodeAkademik.ts) */

periksa(
  'rentangBulan menghitung hari terakhir yg benar (Februari kabisat)',
  rentangBulan(2028, 2),
  { awal: '2028-02-01', akhir: '2028-02-29', label: 'Februari 2028' }
);

/* ── materiHafalanDoa: gabung Asmaul Husna 2 semester ────────────────
   Contoh disalin dari kurikulum_prota produksi (kategori "Hafalan
   Do'a-Do'a Harian"), bukan karangan. */

periksa(
  'Kelas 1: Asmaul Husna 1-20 (Sem 1) + 21-40 (Sem 2) -> digabung 1-40, baris lain tetap terpisah',
  gabungkanDoaDuaSemester(
    "1. Menerampilkan hafalan do'a pada jenjang sebelumnya \n2. Asmaul Husna (1 sampai 20)\n3. Doa dan dzikir setelah sholat \n4. Do'a ketetapan iman",
    "1. Menerampilkan hafalan do'a pada jenjang sebelumnya \n2. Asmaul Husna (21 sampai 40)\n3. Doa masuk dan keluar rumah "
  ),
  [
    "Menerampilkan hafalan do'a pada jenjang sebelumnya",
    'Asmaul Husna (1 sampai 40)',
    'Doa dan dzikir setelah sholat',
    "Do'a ketetapan iman",
    'Doa masuk dan keluar rumah',
  ]
);

periksa(
  "PAUD-TK: Asmaul Husna di baris PERTAMA (bukan kedua) tetap digabung di posisi pertama",
  gabungkanDoaDuaSemester(
    "1. Asmaul Husna (1 sampai 10)\n2. Do'a ketika akan tidur dan setelah bangun tidur ",
    "1. Asmaul Husna (11 sampai 20)\n2. Do'a untuk kedua orang tua"
  ),
  ['Asmaul Husna (1 sampai 20)', "Do'a ketika akan tidur dan setelah bangun tidur", "Do'a untuk kedua orang tua"]
);

periksa(
  'Kelas 5: tanpa Asmaul Husna sama sekali -> cuma digabung apa adanya, tanpa baris kosong',
  gabungkanDoaDuaSemester(
    "1. Menerampilkan hafalan do'a pada jenjang sebelumnya \n2. Doa minta dimudahakan dalam segala urusan ",
    "1. Menerampilkan hafalan do'a pada jenjang sebelumnya \n2. Doa ketika ada petir "
  ),
  ["Menerampilkan hafalan do'a pada jenjang sebelumnya", 'Doa minta dimudahakan dalam segala urusan', 'Doa ketika ada petir']
);

periksa('target & target2 dua-duanya null -> daftar kosong, bukan error', gabungkanDoaDuaSemester(null, null), []);

/* ── hasil ────────────────────────────────────────────────────────── */

console.log(`\nuji logika: ${lulus} lulus, ${gagal.length} gagal`);
if (gagal.length > 0) {
  console.log('\n' + gagal.map((g) => '  GAGAL: ' + g).join('\n\n'));
  process.exitCode = 1;
}
