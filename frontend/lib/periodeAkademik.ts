/* Rentang tanggal utk fitur "Pengulangan" (Monitoring Pencapaian Materi +
   kartu di Riwayat Pembelajaran) -- disetujui owner 2026-09-02: hitungan
   per Bulan, per Semester, per Tahun Ajaran (mulai Juli).

   Definisi semester di sini SAMA PERSIS dgn yang sudah dipakai kartu
   Klasikal di app/kurikulum/page.tsx (BULAN_AKADEMIK_SEMESTER) -- sengaja
   disatukan, bukan didefinisikan ulang, supaya "Semester 1" berarti
   rentang tanggal yang sama di mana pun disebut dalam aplikasi ini:
   Semester 1 = Juli-Desember, Semester 2 = Januari-Juni. Tahun Ajaran
   X/X+1 = 1 Juli tahun X s/d 30 Juni tahun X+1. */

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

/** Tahun ajaran (angka awal) yang menaungi bulan itu -- Juli s/d Desember
 * masuk tahun ajaran tahun ybs; Januari s/d Juni masuk tahun ajaran
 * tahun SEBELUMnya (krn tahun ajaran dimulai Juli). */
export function tahunAjaranDari(tahun: number, bulan: number): number {
  return bulan >= 7 ? tahun : tahun - 1;
}

export function rentangSemester(tahun: number, bulan: number): RentangTanggal {
  const ta = tahunAjaranDari(tahun, bulan);
  if (bulan >= 7) {
    return { awal: tgl(tahun, 7, 1), akhir: tgl(tahun, 12, 31), label: `Semester 1 · ${ta}/${ta + 1}` };
  }
  return { awal: tgl(tahun, 1, 1), akhir: tgl(tahun, 6, 30), label: `Semester 2 · ${ta}/${ta + 1}` };
}

export function rentangTahunAjaran(tahun: number, bulan: number): RentangTanggal {
  const ta = tahunAjaranDari(tahun, bulan);
  return { awal: tgl(ta, 7, 1), akhir: tgl(ta + 1, 6, 30), label: `Tahun Ajaran ${ta}/${ta + 1}` };
}

export type KunciPeriode = 'bulan' | 'semester' | 'tahunAjaran';

export function rentangPeriode(kunci: KunciPeriode, tahun: number, bulan: number): RentangTanggal {
  if (kunci === 'semester') return rentangSemester(tahun, bulan);
  if (kunci === 'tahunAjaran') return rentangTahunAjaran(tahun, bulan);
  return rentangBulan(tahun, bulan);
}
