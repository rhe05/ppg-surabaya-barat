/* Tipe & konstanta bersama fitur "Penerobos Kelp" (jamaah majlis taklim).
   Tabel: sub_kelp, jamaah, jamaah_acara, jamaah_kehadiran
   (migrasi 20260909150000 + 20260909160000). */

export type SubKelp = {
  id: number;
  kelompok_id: number;
  nama: string;
  keterangan: string | null;
  deleted_at?: string | null;
};

export type JamaahRow = {
  id: number;
  kelompok_id: number;
  sub_kelp_id: number | null;
  nama: string;
  nama_panggilan: string | null;
  gender: 'L' | 'P' | null;
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  status_keluarga: string | null;
  pekerjaan: string | null;
  pendidikan_terakhir: string | null;
  no_wa: string | null;
  alamat: string | null;
  rt: string | null;
  rw: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  kabupaten_kota: string | null;
  provinsi: string | null;
  kode_pos: string | null;
  catatan: string | null;
  deleted_at?: string | null;
};

/* Kolom yang di-SELECT untuk daftar & form jamaah. */
export const KOLOM_JAMAAH =
  'id, kelompok_id, sub_kelp_id, nama, nama_panggilan, gender, tempat_lahir, tanggal_lahir, ' +
  'status_keluarga, pekerjaan, pendidikan_terakhir, no_wa, alamat, rt, rw, kelurahan, ' +
  'kecamatan, kabupaten_kota, provinsi, kode_pos, catatan';

export const STATUS_KELUARGA = [
  'Kepala Keluarga',
  'Istri',
  'Anak Dewasa',
  'Lajang',
  'Umum',
] as const;

export const PENDIDIKAN_TERAKHIR = [
  'Tidak Sekolah',
  'SD/Sederajat',
  'SMP/Sederajat',
  'SMA/Sederajat',
  'Diploma',
  'S1',
  'S2/S3',
] as const;

export type JamaahAcara = {
  id: number;
  kelompok_id: number;
  sub_kelp_id: number | null;
  judul: string;
  tanggal: string;
  tempat: string | null;
  keterangan: string | null;
  deleted_at?: string | null;
};

export type StatusHadir = 'hadir' | 'izin' | 'sakit' | 'alpa';

export type JamaahKehadiran = {
  id: number;
  acara_id: number;
  jamaah_id: number;
  status: StatusHadir;
  catatan: string | null;
};

export const STATUS_HADIR: { kunci: StatusHadir; label: string; warna: string; pill: string }[] = [
  { kunci: 'hadir', label: 'HADIR', warna: '#059669', pill: 'rgba(5, 150, 105, 0.12)' },
  { kunci: 'izin', label: 'IZIN', warna: '#1D4ED8', pill: 'rgba(29, 78, 216, 0.12)' },
  { kunci: 'sakit', label: 'SAKIT', warna: '#B45309', pill: 'rgba(180, 83, 9, 0.12)' },
  { kunci: 'alpa', label: 'ALPA', warna: '#DC2626', pill: 'rgba(220, 38, 38, 0.12)' },
];
