/* Spesifikasi kolom ekspor Data Jamaah (Penerobos Kelp) — dipakai
   UnduhDataSheet. `judul` = kunci penyimpanan pilihan di localStorage,
   jangan ganti tanpa memikirkan pengguna lama. */

import type { KolomEkspor } from '@/components/ui/UnduhDataSheet';
import type { JamaahRow } from '@/lib/jamaah';

/* Baris jamaah + nama Sub Kelp yang sudah di-resolve pemanggil (JamaahList
   punya map id -> nama; kolom `ambil` tak bisa query sendiri). */
export type JamaahEkspor = JamaahRow & { sub_kelp_nama: string };

/* ISO (YYYY-MM-DD) -> "DD-MM-YYYY" utk Tanggal Lahir, konsisten dgn
   ekspor Data Generus. Nilai non-ISO dibiarkan apa adanya. */
function tglHariDuluan(v: unknown): string {
  const s = String(v ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

const G_IDENTITAS = 'Identitas';
const G_DOMISILI = 'Domisili & Hunian';
const G_KONTAK = 'Kontak & Alamat';
const G_LAINNYA = 'Lainnya';

export const GRUP_URUT_JAMAAH = [G_IDENTITAS, G_DOMISILI, G_KONTAK, G_LAINNYA];

export const KOLOM_EKSPOR_JAMAAH: KolomEkspor<JamaahEkspor>[] = [
  { judul: 'Nama', grup: G_IDENTITAS, baku: true, ambil: (j) => j.nama },
  { judul: 'Nama Panggilan', grup: G_IDENTITAS, baku: false, ambil: (j) => j.nama_panggilan },
  { judul: 'Sub Kelp', grup: G_IDENTITAS, baku: true, ambil: (j) => j.sub_kelp_nama },
  { judul: 'Gender', grup: G_IDENTITAS, baku: true, ambil: (j) => (j.gender === 'L' ? 'Laki-laki' : j.gender === 'P' ? 'Perempuan' : '') },
  { judul: 'Tempat Lahir', grup: G_IDENTITAS, baku: false, ambil: (j) => j.tempat_lahir },
  { judul: 'Tanggal Lahir', grup: G_IDENTITAS, baku: true, ambil: (j) => tglHariDuluan(j.tanggal_lahir) },
  { judul: 'Status dalam Keluarga', grup: G_IDENTITAS, baku: true, ambil: (j) => j.status_keluarga },
  { judul: 'Pendidikan Terakhir', grup: G_IDENTITAS, baku: false, ambil: (j) => j.pendidikan_terakhir },
  { judul: 'Pekerjaan', grup: G_IDENTITAS, baku: true, ambil: (j) => j.pekerjaan },

  { judul: 'Status Domisili', grup: G_DOMISILI, baku: true, ambil: (j) => j.status_domisili },
  { judul: 'Jenis Hunian', grup: G_DOMISILI, baku: false, ambil: (j) => j.jenis_hunian },
  { judul: 'Status Hunian', grup: G_DOMISILI, baku: false, ambil: (j) => j.status_hunian },

  { judul: 'Nomor WA', grup: G_KONTAK, baku: true, ambil: (j) => j.no_wa },
  { judul: 'Alamat', grup: G_KONTAK, baku: true, ambil: (j) => j.alamat },
  { judul: 'RT', grup: G_KONTAK, baku: false, ambil: (j) => j.rt },
  { judul: 'RW', grup: G_KONTAK, baku: false, ambil: (j) => j.rw },
  { judul: 'Kelurahan', grup: G_KONTAK, baku: true, ambil: (j) => j.kelurahan },
  { judul: 'Kecamatan', grup: G_KONTAK, baku: false, ambil: (j) => j.kecamatan },
  { judul: 'Kabupaten/Kota', grup: G_KONTAK, baku: false, ambil: (j) => j.kabupaten_kota },
  { judul: 'Provinsi', grup: G_KONTAK, baku: false, ambil: (j) => j.provinsi },
  { judul: 'Kode Pos', grup: G_KONTAK, baku: false, ambil: (j) => j.kode_pos },

  { judul: 'Catatan', grup: G_LAINNYA, baku: false, ambil: (j) => j.catatan },
];
