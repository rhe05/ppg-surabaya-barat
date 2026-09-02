/* Rentang tanggal Bulan utk fitur "Pengulangan" (Monitoring Pencapaian
   Materi) -- disetujui owner 2026-09-02.

   Sempat juga ada Semester & Tahun Ajaran (definisi Semester 1 = Juli-
   Desember dst, sama dgn BULAN_AKADEMIK_SEMESTER di app/kurikulum),
   TAPI DIHAPUS 2026-09-02 malam ("filter kalender cukup tampilkan bulan
   sama tahun saja, samakan dgn fitur yang lain, tidak usah semester dan
   tidak usah tahun ajaran") -- lihat riwayat git kalau perlu dihidupkan
   lagi (`rentangSemester`/`rentangTahunAjaran`/`rentangPeriode`/
   `KunciPeriode`/`tahunAjaranDari`). */

export type RentangTanggal = { awal: string; akhir: string; label: string };

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function tgl(tahun: number, bulan: number, hari: number): string {
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${tahun}-${dua(bulan)}-${dua(hari)}`;
}

export function rentangBulan(tahun: number, bulan: number): RentangTanggal {
  const akhirHari = new Date(tahun, bulan, 0).getDate();
  return {
    awal: tgl(tahun, bulan, 1),
    akhir: tgl(tahun, bulan, akhirHari),
    label: `${NAMA_BULAN[bulan - 1]} ${tahun}`,
  };
}
