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
  /* Diisi saat jamaah dicatat pindah keluar kelompok (status_domisili =
     'Pindah'). NULL = masih aktif. Migrasi 20260910200000. */
  tanggal_pindah?: string | null;
  pindah_ke?: string | null;
  /* Diisi saat jamaah dicatat meninggal. NULL = masih hidup/aktif.
     Migrasi 20260910210000. */
  tanggal_meninggal?: string | null;
  catatan_meninggal?: string | null;
  deleted_at?: string | null;
};

/* Kolom yang di-SELECT untuk daftar & form jamaah. */
export const KOLOM_JAMAAH =
  'id, kelompok_id, sub_kelp_id, nama, nama_panggilan, gender, tempat_lahir, tanggal_lahir, ' +
  'status_keluarga, status_domisili, jenis_hunian, status_hunian, pekerjaan, pendidikan_terakhir, ' +
  'no_wa, alamat, rt, rw, kelurahan, kecamatan, kabupaten_kota, provinsi, kode_pos, catatan';

/* + kolom kepindahan — dipakai layar "Jamaah Pindah" saja. Dipisah supaya
   sisa app tak ikut 400 kalau migrasi 20260910200000 belum dijalankan. */
export const KOLOM_JAMAAH_PINDAH = KOLOM_JAMAAH + ', tanggal_pindah, pindah_ke';

/* + kolom kematian — layar "Jamaah Meninggal" saja. Migrasi 20260910210000. */
export const KOLOM_JAMAAH_MENINGGAL = KOLOM_JAMAAH + ', tanggal_meninggal, catatan_meninggal';

/* Daftar Data Jamaah aktif: butuh `tanggal_meninggal` utk menyaring jamaah
   yang sudah wafat (pindah cukup lewat status_domisili). Migrasi 20260910210000. */
export const KOLOM_JAMAAH_LIST = KOLOM_JAMAAH + ', tanggal_meninggal';

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

/* Nilai kanonik kategori guru (lib/kategoriGuru.ts) yang ikut dihitung di
   KPI jamaah. MS juga bisa jadi jamaah.status_keluarga; GB murni dari guru. */
export const STATUS_MS = 'Muballigh Setempat'; // MS — Muballigh/ot Setempat
export const KATEGORI_GB = 'Guru Bantu'; // GB — Guru Bantu
export const KATEGORI_MT = 'Muballigh Tugasan'; // MT — Muballigh/ot Tugasan

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
  /* MS = Muballigh/ot Setempat (jamaah.status_keluarga + guru.kategori).
     GB = Guru Bantu, MT = Muballigh/ot Tugasan (murni dari guru.kategori). */
  ms: number;
  gb: number;
  mt: number;
  /* status_domisili */
  mukim: number;
  musiman: number;
  pindah: number;
};

export type JamaahKpiRow = Pick<
  JamaahRow,
  'status_keluarga' | 'status_domisili' | 'gender' | 'tanggal_lahir' | 'tanggal_meninggal'
>;

export const KOLOM_JAMAAH_KPI =
  'status_keluarga, status_domisili, gender, tanggal_lahir, tanggal_meninggal';

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

/* Hitung KPI dari daftar jamaah (100% di memori). `msGuru`/`gbGuru`/`mtGuru`
   = jumlah Muballigh Setempat / Guru Bantu / Muballigh Tugasan dari tabel
   guru sekelompok. */
export function hitungKpiJamaah(
  rows: JamaahKpiRow[],
  msGuru = 0,
  gbGuru = 0,
  mtGuru = 0,
): KpiJamaah {
  const k: KpiJamaah = {
    total: 0,
    duda: 0,
    janda: 0,
    kk: 0,
    lakiLaki: 0,
    perempuan: 0,
    lansia: 0,
    ms: msGuru,
    gb: gbGuru,
    mt: mtGuru,
    mukim: 0,
    musiman: 0,
    pindah: 0,
  };
  for (const r of rows) {
    /* Jamaah meninggal = keluar dari daftar aktif sepenuhnya (tak
       dihitung di mana pun). */
    if (r.tanggal_meninggal) continue;
    /* Jamaah pindah = keluar dari daftar aktif: hanya masuk hitungan
       `pindah`, tidak ke total maupun rincian demografi. */
    if (r.status_domisili === 'Pindah') {
      k.pindah++;
      continue;
    }
    k.total++;
    if (r.status_keluarga === 'Duda') k.duda++;
    else if (r.status_keluarga === 'Janda') k.janda++;
    else if (r.status_keluarga === STATUS_MS) k.ms++;
    if (r.status_keluarga === 'Kepala Keluarga') k.kk++;
    if (r.status_domisili === 'Mukim') k.mukim++;
    else if (r.status_domisili === 'Musiman') k.musiman++;
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
