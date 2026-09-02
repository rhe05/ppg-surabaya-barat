/* Menerjemahkan galat basis data jadi kalimat yang bisa ditindak guru.
   Dibuat 2026-09-02 bersama penjaga anti-dobel jurnal_materi.

   Kenapa perlu: penjaga di aplikasi bisa dilewati — dua guru menekan
   Simpan pada detik yang sama, atau layar memuat data yang sudah basi.
   Saat itu terjadi, yang tersisa adalah indeks unik di basis data, dan
   pesannya berbunyi seperti ini:

     duplicate key value violates unique constraint
     "uq_jurnal_klasikal_kelas_tanggal"

   Itu benar, tapi tidak berguna bagi guru yang sedang memegang HP di
   tengah KBM. Fungsi ini mengubahnya jadi kalimat yang menyebut APA yang
   bentrok dan APA yang bisa dilakukan.

   Galat yang TIDAK dikenali dikembalikan apa adanya — jangan pernah
   menelan pesan asli jadi "terjadi kesalahan", itu justru membuat bug
   berikutnya tidak bisa dilacak. */

const TERJEMAHAN: { cocok: RegExp; pesan: string }[] = [
  {
    cocok: /uq_jurnal_klasikal_kelas_tanggal/,
    pesan:
      'Materi Klasikal untuk tanggal itu sudah ada. Ubah yang sudah ada, jangan tambah baru — satu tanggal cukup satu Klasikal (hafalan surat & doa jadi satu).',
  },
  {
    cocok: /uq_jurnal_ngaji_kelas_tanggal_judul/,
    pesan: 'Materi dengan judul yang sama sudah ada di tanggal itu.',
  },
  {
    cocok: /uq_absensi_santri_tanggal/,
    pesan: 'Kehadiran santri ini pada tanggal tersebut sudah tercatat.',
  },
];

export function pesanGalatDb(galat: unknown, cadangan: string): string {
  const asli = galat instanceof Error ? galat.message : String(galat ?? '');
  for (const { cocok, pesan } of TERJEMAHAN) {
    if (cocok.test(asli)) return pesan;
  }
  return asli.trim() !== '' ? asli : cadangan;
}
