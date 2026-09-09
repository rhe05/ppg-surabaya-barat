/* Spesifikasi kolom ekspor Data Generus — SATU sumber kebenaran, dipakai
   bersama oleh SantriList (ekspor admin desktop) dan UnduhDataSheet (unduh
   guru mobile). Sebelumnya array ini hidup lokal di SantriList.tsx.

   `judul` sekaligus menjadi kunci penyimpanan pilihan di localStorage —
   jangan ganti teksnya tanpa memikirkan pengguna lama yang pilihannya
   tersimpan. `grup` cuma untuk pengelompokan tampilan sakelar. */

import type { SantriRow } from '@/components/santri/SantriForm';

/* Tanggal dari DB tersimpan ISO (YYYY-MM-DD). Untuk ekspor Data Generus
   owner minta khusus Tanggal Lahir tampil "tanggal dulu": DD-MM-YYYY.
   Nilai non-ISO (kosong / format lain) dibiarkan apa adanya. */
function tglHariDuluan(v: unknown): string {
  const s = String(v ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

export type GrupKolom = 'Identitas' | 'Pendidikan' | 'Kontak & Alamat' | 'Keluarga' | 'Ngaji';

export type KolomEksporSantri = {
  judul: string;
  grup: GrupKolom;
  /* Ikut tercentang saat pengguna pertama kali membuka sheet (belum ada
     pilihan tersimpan). Dipilih yang paling sering dibutuhkan guru. */
  baku: boolean;
  ambil: (s: SantriRow) => unknown;
};

export const KOLOM_EKSPOR_SANTRI: KolomEksporSantri[] = [
  { judul: 'NIS', grup: 'Identitas', baku: true, ambil: (s) => s.nis },
  { judul: 'Nama', grup: 'Identitas', baku: true, ambil: (s) => s.nama },
  { judul: 'Nama Panggilan', grup: 'Identitas', baku: false, ambil: (s) => s.nama_panggilan },
  { judul: 'Gender', grup: 'Identitas', baku: true, ambil: (s) => s.gender },
  { judul: 'Tempat Lahir', grup: 'Identitas', baku: false, ambil: (s) => s.tempat_lahir },
  { judul: 'Tanggal Lahir', grup: 'Identitas', baku: true, ambil: (s) => tglHariDuluan(s.tanggal_lahir) },
  { judul: 'Status Nikah', grup: 'Identitas', baku: false, ambil: (s) => s.status_nikah },

  { judul: 'Pendidikan', grup: 'Pendidikan', baku: false, ambil: (s) => s.pendidikan },
  { judul: 'Kelas Sekolah', grup: 'Pendidikan', baku: false, ambil: (s) => s.kelas_sekolah },

  { judul: 'Jenjang', grup: 'Ngaji', baku: true, ambil: (s) => s.jenjang_saat_ini },
  { judul: 'Kelas Ngaji', grup: 'Ngaji', baku: true, ambil: (s) => s.kelas_ngaji },
  { judul: 'Mulai Ngaji', grup: 'Ngaji', baku: false, ambil: (s) => s.mulai_ngaji },
  { judul: 'Kelompok', grup: 'Ngaji', baku: false, ambil: (s) => s.kelompok_id },

  { judul: 'Alamat', grup: 'Kontak & Alamat', baku: true, ambil: (s) => s.alamat },
  { judul: 'RT', grup: 'Kontak & Alamat', baku: false, ambil: (s) => s.rt },
  { judul: 'RW', grup: 'Kontak & Alamat', baku: false, ambil: (s) => s.rw },
  { judul: 'Kelurahan', grup: 'Kontak & Alamat', baku: false, ambil: (s) => s.kelurahan },
  { judul: 'Kecamatan', grup: 'Kontak & Alamat', baku: false, ambil: (s) => s.kecamatan },
  { judul: 'Kabupaten/Kota', grup: 'Kontak & Alamat', baku: false, ambil: (s) => s.kabupaten_kota },
  { judul: 'Provinsi', grup: 'Kontak & Alamat', baku: false, ambil: (s) => s.provinsi },
  { judul: 'Kode Pos', grup: 'Kontak & Alamat', baku: false, ambil: (s) => s.kode_pos },
  { judul: 'Nomor WA', grup: 'Kontak & Alamat', baku: true, ambil: (s) => s.nomor_wa },

  { judul: 'Nama Ayah', grup: 'Keluarga', baku: true, ambil: (s) => s.nama_ayah },
  { judul: 'Nama Ibu', grup: 'Keluarga', baku: true, ambil: (s) => s.nama_ibu },
  { judul: 'Nomor WA Ayah', grup: 'Keluarga', baku: false, ambil: (s) => s.nomor_wa_ayah },
  { judul: 'Nomor WA Ibu', grup: 'Keluarga', baku: false, ambil: (s) => s.nomor_wa_ibu },
];

export const GRUP_URUT: GrupKolom[] = [
  'Identitas',
  'Ngaji',
  'Pendidikan',
  'Kontak & Alamat',
  'Keluarga',
];
