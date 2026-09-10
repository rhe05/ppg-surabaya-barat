/* Tipe & konstanta bersama fitur "Penerobos Kelp" (jamaah pengajian).
   Tabel: sub_kelp, jamaah, jamaah_acara, jamaah_kehadiran
   (migrasi 20260909150000 + 20260909160000). */

export type SubKelp = {
  id: number;
  kelompok_id: number;
  nama: string;
  keterangan: string | null;
  deleted_at?: string | null;
};

/* Pengaturan per-kelompok (tabel jamaah_konfig, migrasi 20260910170000).
   sub_kelp_wajib: form Data Jamaah wajib memilih Sub Kelp. */
export type JamaahKonfig = {
  kelompok_id: number;
  sub_kelp_wajib: boolean;
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
  status_domisili: string | null;
  jenis_hunian: string | null;
  status_hunian: string | null;
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
  'status_keluarga, status_domisili, jenis_hunian, status_hunian, pekerjaan, pendidikan_terakhir, ' +
  'no_wa, alamat, rt, rw, kelurahan, kecamatan, kabupaten_kota, provinsi, kode_pos, catatan';

export const STATUS_KELUARGA = [
  'Kepala Keluarga',
  'Istri',
  'Duda',
  'Janda',
  'Muballigh Setempat',
  'Anak Dewasa',
  'Lajang',
  'Umum',
] as const;

/* Nilai kanonik "MS" — disimpan di jamaah.status_keluarga & guru.kategori
   (lib/kategoriGuru.ts). Perempuan ditampilkan "Muballighot Setempat". */
export const STATUS_MS = 'Muballigh Setempat';

/* Usia (tahun) dianggap "lansia" (rujukan UU 13/1998: 60 th ke atas). */
export const USIA_LANSIA = 60;

export type KpiJamaah = {
  total: number;
  duda: number;
  janda: number;
  kk: number;
  lakiLaki: number;
  perempuan: number;
  lansia: number;
  /* MS = Muballigh/ot Setempat. Digabung dari jamaah.status_keluarga +
     guru.kategori (argumen `msGuru`). */
  ms: number;
};

export type JamaahKpiRow = Pick<JamaahRow, 'status_keluarga' | 'gender' | 'tanggal_lahir'>;

export const KOLOM_JAMAAH_KPI = 'status_keluarga, gender, tanggal_lahir';

function usiaTahun(tanggalLahir: string | null): number | null {
  if (!tanggalLahir) return null;
  const d = new Date(tanggalLahir);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let u = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) u--;
  return u;
}

/* Hitung KPI dari daftar jamaah (100% di memori). `msGuru` = jumlah
   Muballigh/ot Setempat dari tabel guru sekelompok (digabung ke `ms`). */
export function hitungKpiJamaah(rows: JamaahKpiRow[], msGuru = 0): KpiJamaah {
  const k: KpiJamaah = {
    total: rows.length,
    duda: 0,
    janda: 0,
    kk: 0,
    lakiLaki: 0,
    perempuan: 0,
    lansia: 0,
    ms: msGuru,
  };
  for (const r of rows) {
    if (r.status_keluarga === 'Duda') k.duda++;
    else if (r.status_keluarga === 'Janda') k.janda++;
    else if (r.status_keluarga === STATUS_MS) k.ms++;
    if (r.status_keluarga === 'Kepala Keluarga') k.kk++;
    if (r.gender === 'L') k.lakiLaki++;
    else if (r.gender === 'P') k.perempuan++;
    const u = usiaTahun(r.tanggal_lahir);
    if (u != null && u >= USIA_LANSIA) k.lansia++;
  }
  return k;
}

export const STATUS_DOMISILI = ['Mukim', 'Musiman', 'Pindah'] as const;

export const JENIS_HUNIAN = ['Rumah', 'Kost', 'Apartemen', 'Mess', 'Lainnya'] as const;

export const STATUS_HUNIAN = [
  'Milik Sendiri',
  'Sewa Kontrak',
  'Rumah Orang Tua',
  'Rumah Mertua',
  'Di Sediakan Instansi',
  'Lainnya',
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

export const KOLOM_ACARA =
  'id, kelompok_id, sub_kelp_id, judul, tanggal, tempat, keterangan';

export type StatusHadir = 'hadir' | 'izin' | 'sakit' | 'alpa';

export type JamaahKehadiran = {
  id: number;
  acara_id: number;
  jamaah_id: number;
  status: StatusHadir;
  catatan: string | null;
};

/* ------------------------------------------------------------------ */
/* Data Pengurus (susunan kepengurusan majlis taklim jamaah).
   Tabel: jamaah_pengurus (migrasi 20260910150000).
   sub_kelp_id NULL = pengurus tingkat kelompok; terisi = pengurus Sub Kelp.
   jamaah_id dipilih dari tabel `jamaah`; `jabatan` diketik bebas.        */

export type JamaahPengurus = {
  id: number;
  kelompok_id: number;
  sub_kelp_id: number | null;
  jamaah_id: number;
  jabatan: string;
  urutan: number;
  mulai_menjabat: string | null;
  keterangan: string | null;
  jamaah?: { nama: string; no_wa: string | null } | null;
};

export const KOLOM_PENGURUS =
  'id, kelompok_id, sub_kelp_id, jamaah_id, jabatan, urutan, mulai_menjabat, keterangan, ' +
  'jamaah:jamaah_id(nama, no_wa)';

export const STATUS_HADIR: { kunci: StatusHadir; label: string; warna: string; pill: string }[] = [
  { kunci: 'hadir', label: 'HADIR', warna: '#059669', pill: 'rgba(5, 150, 105, 0.12)' },
  { kunci: 'izin', label: 'IZIN', warna: '#1D4ED8', pill: 'rgba(29, 78, 216, 0.12)' },
  { kunci: 'sakit', label: 'SAKIT', warna: '#B45309', pill: 'rgba(180, 83, 9, 0.12)' },
  { kunci: 'alpa', label: 'ALPA', warna: '#DC2626', pill: 'rgba(220, 38, 38, 0.12)' },
];
