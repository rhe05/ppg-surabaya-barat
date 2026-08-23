/* Libur nasional + cuti bersama 2026, sesuai SKB 3 Menteri No. 1497 Thn
   2025 / No. 2 Thn 2025 / No. 5 Thn 2025 (dicek via web, sumber resmi
   Sekretariat Negara setneg.go.id -- bukan tebakan). Dipindah ke sini
   dari components/jurnal/RencanaPembelajaranView.tsx (2026-08-23) supaya
   bisa dipakai bersama di kalender manapun yg perlu mengunci Sabtu/
   Minggu + tanggal merah (Tanggal Materi Klasikal, Input Kehadiran, dst)
   tanpa menduplikasi daftarnya & berisiko drift.

   ⚠️ Daftar ini KHUSUS 2026 -- Idul Fitri/Idul Adha/Nyepi/Imlek/Waisak
   dll geser tiap tahun (kalender lunar), jadi kalau kalender manapun yg
   memakainya dibuka lintas tahun (mis. Januari 2027), tanggal merahnya
   TIDAK otomatis benar lagi. Perlu diperbarui manual tiap tahun baru
   (cek SKB 3 Menteri terbaru), bukan dihitung otomatis -- app ini
   sengaja tidak menebak tanggal lunar. */
export const LIBUR_NASIONAL_2026: Record<string, string> = {
  '2026-01-01': 'Tahun Baru Masehi',
  '2026-01-16': 'Isra Mikraj Nabi Muhammad SAW',
  '2026-02-16': 'Cuti Bersama Tahun Baru Imlek',
  '2026-02-17': 'Tahun Baru Imlek 2577',
  '2026-03-18': 'Cuti Bersama Hari Suci Nyepi',
  '2026-03-19': 'Hari Suci Nyepi (Tahun Baru Saka 1948)',
  '2026-03-20': 'Cuti Bersama Idul Fitri',
  '2026-03-21': 'Hari Raya Idul Fitri 1447 H',
  '2026-03-22': 'Hari Raya Idul Fitri 1447 H',
  '2026-03-23': 'Cuti Bersama Idul Fitri',
  '2026-03-24': 'Cuti Bersama Idul Fitri',
  '2026-04-03': 'Wafat Isa Almasih',
  '2026-04-05': 'Hari Paskah',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Isa Almasih',
  '2026-05-15': 'Cuti Bersama Kenaikan Isa Almasih',
  '2026-05-27': 'Hari Raya Idul Adha 1447 H',
  '2026-05-28': 'Cuti Bersama Idul Adha',
  '2026-05-31': 'Hari Raya Waisak 2570 BE',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Tahun Baru Islam 1448 H',
  '2026-08-17': 'HUT Kemerdekaan RI',
  '2026-08-25': 'Maulid Nabi Muhammad SAW',
  '2026-12-24': 'Cuti Bersama Hari Raya Natal',
  '2026-12-25': 'Hari Raya Natal',
};

/* Cocok langsung dgn prop `tanggalNonaktif` TanggalPicker.tsx -- Sabtu/
   Minggu + tanggal merah 2026 tidak bisa diklik. Lihat komentar
   LIBUR_NASIONAL_2026 di atas soal keterbatasan lintas-tahunnya. */
export function nonaktifAkhirPekanLibur(
  tglStr: string,
  tgl: Date
): { alasan: string; merah?: boolean } | null {
  const hari = tgl.getDay();
  if (hari === 0) return { alasan: 'Hari Minggu' };
  if (hari === 6) return { alasan: 'Hari Sabtu' };
  const namaLibur = LIBUR_NASIONAL_2026[tglStr];
  if (namaLibur) return { alasan: namaLibur, merah: true };
  return null;
}
