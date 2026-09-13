import { supabase } from './supabase';

/* Gabung target Prota Hafalan Do'a-Do'a Harian (2 semester) jadi SATU
   daftar, khusus utk Laporan Perkembangan Santri (2026-09-02, diminta
   owner: "saya sudah input kurikulum materi haf doa di prota ... tolong
   masukan ke perkembangan santri").

   Format teksnya (dicek langsung ke data produksi kurikulum_prota,
   bukan tebakan): baris bernomor dipisah newline, mis.
     "1. Menerampilkan hafalan do'a pada jenjang sebelumnya \n
      2. Asmaul Husna (1 sampai 20)\n
      3. Doa dan dzikir setelah sholat "
   target = Semester 1, target2 = Semester 2 -- item lain di luar Asmaul
   Husna SELALU beda per semester (materi baru), tapi baris
   "Menerampilkan hafalan do'a pada jenjang sebelumnya" & Asmaul Husna
   SELALU muncul di KEDUA semester (semester 2 melanjutkan rentang
   Asmaul Husna semester 1, mis. 1-20 lalu 21-40).

   Aturan gabung (diminta owner eksplisit): Asmaul Husna JANGAN
   ditampilkan dua kali per-semester -- gabung rentangnya jadi satu
   (1 sampai 20 + 21 sampai 40 -> 1 sampai 40). Baris lain yang PERSIS
   sama di kedua semester (mis. "Menerampilkan...") cukup tampil sekali,
   krn dua baris identik berdampingan terbaca berantakan/AI-slop, bukan
   krn diminta eksplisit -- prinsip umum "jangan berantakan" yang sudah
   berlaku di seluruh app ini. */

const RE_ASMAUL_HUSNA = /^Asmaul\s+Husna\s*\(\s*(\d+)\s*(?:sampai|s\/d|-|–)\s*(\d+)\s*\)$/i;

/* "Menerampilkan hafalan do'a pada jenjang sebelumnya" -- toleran thd
   varian tanda kutip apostrof ("do'a" vs "do'a"). Dipakai di LEBIH DARI
   SATU tempat (Laporan Perkembangan Santri & Tambah Materi Klasikal,
   2026-09-02) -- SATU regex di sini supaya keduanya tidak diam-diam
   ngedrift kalau baris Prota-nya berubah bentuk. */
const RE_MENERAMPILKAN = /^menerampilkan\s+hafalan\s+do.?a\s+pada\s+jenjang\s+sebelumnya$/i;

export function adalahMenerampilkanJenjangSebelumnya(teks: string): boolean {
  return RE_MENERAMPILKAN.test(teks);
}

export function adalahAsmaulHusna(teks: string): boolean {
  return /^Asmaul\s+Husna\b/i.test(teks.trim());
}

/** "Asmaul Husna (1 sampai 99)" -> {dari:1, sampai:99}; null kalau tanpa
 *  rentang angka (mis. cuma "Asmaul Husna"). Dipakai Monitoring
 *  Pencapaian Materi utk memutuskan apakah satu klasikal MENCAPAI target
 *  penuh (diminta owner 2026-09-03: rentang parsial tidak dihitung). */
export function uraikanRentangAsmaulHusna(teks: string): { dari: number; sampai: number } | null {
  const m = teks.trim().match(RE_ASMAUL_HUSNA);
  return m ? { dari: Number(m[1]), sampai: Number(m[2]) } : null;
}

/** Rentang target Asmaul Husna tahunan dari sepasang teks Prota
 *  (Semester 1 + 2 digabung). null kalau tidak ada baris Asmaul Husna. */
export function targetAsmaulHusnaDari(
  target1: string | null,
  target2: string | null,
): { dari: number; sampai: number } | null {
  for (const item of gabungkanDoaDuaSemester(target1, target2)) {
    const r = uraikanRentangAsmaulHusna(item);
    if (r) return r;
  }
  return null;
}

/** Ringkas hasil RPC pengulangan Hafalan Do'a untuk DITAMPILKAN (diminta
 *  owner 2026-09-03): item non-Asmaul-Husna apa adanya; SEMUA baris
 *  "Asmaul Husna (X sampai Y)" digabung jadi SATU, dihitung dari UNION
 *  rentang SELURUH baris pada periode itu (bukan satu baris tunggal --
 *  diperbaiki 2026-09-13, ERROR_LOG #45: guru mengisi progres bertahap
 *  per hari, mis. "1 sampai 20" lalu "21 sampai 45", tidak pernah dalam
 *  satu baris menutupi target penuh kelas sekaligus, jadi versi lama
 *  TIDAK PERNAH menghitungnya). Baru dianggap tercapai kalau union
 *  rentang (`min(dari)`..`max(sampai)`) MENUTUPI target penuh kelas.
 *  Kalau target tidak diketahui, Asmaul Husna disembunyikan seluruhnya. */
export function ringkasPengulanganDoa<
  T extends { nama_doa: string; jumlah: number; terakhir?: string },
>(
  baris: T[],
  target: { dari: number; sampai: number } | null,
): { nama_doa: string; jumlah: number; terakhir: string }[] {
  const hasil = baris
    .filter((b) => !adalahAsmaulHusna(b.nama_doa))
    .map((b) => ({ nama_doa: b.nama_doa, jumlah: b.jumlah, terakhir: b.terakhir ?? '' }));
  if (!target) return hasil;
  let jumlah = 0;
  let terakhir = '';
  let dariMin: number | null = null;
  let sampaiMax: number | null = null;
  for (const b of baris) {
    if (!adalahAsmaulHusna(b.nama_doa)) continue;
    const r = uraikanRentangAsmaulHusna(b.nama_doa);
    if (!r) continue;
    dariMin = dariMin === null ? r.dari : Math.min(dariMin, r.dari);
    sampaiMax = sampaiMax === null ? r.sampai : Math.max(sampaiMax, r.sampai);
    jumlah += b.jumlah;
    if ((b.terakhir ?? '') > terakhir) terakhir = b.terakhir ?? '';
  }
  if (jumlah > 0 && dariMin !== null && sampaiMax !== null && dariMin <= target.dari && sampaiMax >= target.sampai) {
    hasil.push({
      nama_doa: `Asmaul Husna (${target.dari} sampai ${target.sampai})`,
      jumlah,
      terakhir,
    });
  }
  return hasil;
}

/* Nama ruang guru ("2 & 3A", "Pra Remaja") -> kode kelas Kurikulum
   PAUD-TK s.d. kelas tertinggi ruang itu. SALINAN ringkas dari
   kelasTargetKumulatif di RencanaPembelajaranView.tsx (tidak diekspor
   dari sana; menyalin 8 baris pure lebih aman drpd merombak berkas
   1700-baris itu). Dipakai Monitoring utk menemukan baris Prota Asmaul
   Husna milik kelas tsb. */
const KELAS_KURIKULUM_URUT = [
  'PAUD-TK', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
];
export function kelasKurikulumSampai(namaRuang: string): string[] {
  const n = namaRuang.toLowerCase();
  if (n.includes('paud')) return ['PAUD-TK'];
  if (n.includes('sma')) return [...KELAS_KURIKULUM_URUT];
  if (/remaja|smp/.test(n)) return KELAS_KURIKULUM_URUT.slice(0, KELAS_KURIKULUM_URUT.indexOf('9') + 1);
  const angka = [...n.matchAll(/\d+/g)].map((x) => Number(x[0]));
  const batas = angka.length > 0 ? Math.max(...angka) : 0;
  return KELAS_KURIKULUM_URUT.slice(0, batas + 1);
}

/** Satu baris Prota "1. Teks \n2. Teks lain" -> ["Teks", "Teks lain"]. */
export function uraikanTargetDoa(teks: string | null): string[] {
  if (!teks) return [];
  return teks
    .split('\n')
    .map((baris) => baris.replace(/^\s*\d+\.\s*/, '').trim())
    .filter((baris) => baris !== '');
}

/* ── Target "Hafalan Do'a" Laporan Perkembangan Santri (2026-09-14,
   diminta owner: "untuk perincian target ... bisa ambil data dari
   perincian materi klasikal saya sudah uraikan targetnya" -- kembar
   PERSIS targetHafalanSuratSemester (lib/hafalanSurat.ts): sumber
   kurikulum_prota.target/target2 SEMESTER INI (SUDAH diuraikan owner jadi
   daftar bernomor), BUKAN kurikulum_probul bulanan yg sebagian besar
   kelas belum diisi. `kodeKelas` TUNGGAL (bukan kumulatif). Baris
   "Menerampilkan hafalan do'a pada jenjang sebelumnya" dibuang, sama
   pola opsiHafalanDoa (borang Tambah Materi Klasikal). */
type KategoriTersematProta = { nama: string } | { nama: string }[] | null;

export async function targetHafalanDoaSemester(
  kodeKelas: string,
  tahun: number,
  bulanKalender: number,
): Promise<string | null> {
  const semester: 1 | 2 = bulanKalender >= 7 ? 1 : 2;
  const { data, error } = await supabase
    .from('kurikulum_prota')
    .select('target, target2, kategori_kbm(nama)')
    .eq('kelompok_id', 1)
    .eq('tahun', tahun)
    .eq('kelas', kodeKelas);
  if (error) throw new Error(error.message);

  const baris = (data ?? []).find((p) => {
    const k = p.kategori_kbm as KategoriTersematProta;
    const nama = Array.isArray(k) ? k[0]?.nama : k?.nama;
    return nama === "Hafalan Do'a-Do'a Harian";
  }) as { target: string | null; target2: string | null } | undefined;
  if (!baris) return null;

  const daftar = uraikanTargetDoa(semester === 1 ? baris.target : baris.target2).filter(
    (item) => !adalahMenerampilkanJenjangSebelumnya(item),
  );
  return daftar.length > 0 ? `Target Semester ${semester}: ${daftar.join(', ')}` : null;
}

/** Gabung target Semester 1 + Semester 2 jadi satu daftar tahunan. */
export function gabungkanDoaDuaSemester(target1: string | null, target2: string | null): string[] {
  const hasil: string[] = [];
  const sudahAda = new Set<string>();
  let ahMin: number | null = null;
  let ahMax: number | null = null;
  let ahIndex = -1;

  for (const baris of [...uraikanTargetDoa(target1), ...uraikanTargetDoa(target2)]) {
    const cocok = baris.match(RE_ASMAUL_HUSNA);
    if (cocok) {
      const a = Number(cocok[1]);
      const b = Number(cocok[2]);
      ahMin = ahMin === null ? a : Math.min(ahMin, a);
      ahMax = ahMax === null ? b : Math.max(ahMax, b);
      if (ahIndex === -1) {
        ahIndex = hasil.length;
        hasil.push(''); // diisi belakangan, setelah rentang lengkap diketahui
      }
      continue;
    }
    const kunci = baris.toLowerCase();
    if (sudahAda.has(kunci)) continue;
    sudahAda.add(kunci);
    hasil.push(baris);
  }

  if (ahIndex !== -1 && ahMin !== null && ahMax !== null) {
    hasil[ahIndex] = `Asmaul Husna (${ahMin} sampai ${ahMax})`;
  }

  return hasil;
}

/* ── Laporan Hafalan Do'a per santri (2026-09-14, diminta owner: tampilkan
   di Riwayat Pembelajaran, "sudah ada card di Pelaksanaan") -- kembar
   PERSIS dari muatHafalanSuratRingkas (lib/hafalanSurat.ts), tabel beda:
   `hafalan_doa_pelaksanaan` (migrasi 20260914100000), kolom `doa` bukan
   `surat`/`ayat`. */

export type HafalanDoaStatus = 'naik' | 'tetap';

export type HafalanDoaHari = {
  id: number;
  tanggal: string;
  doa: string | null;
  status: HafalanDoaStatus | '';
};

export type HafalanDoaRingkas = {
  santriId: number;
  nama: string;
  naik: number;
  tetap: number;
  terakhir: string;
  terakhirStatus: HafalanDoaStatus | '';
  terakhirDoa: string | null;
  hari: HafalanDoaHari[];
};

type BarisHafalanDoaMentah = {
  id: number;
  santri_id: number;
  tanggal: string;
  status: string | null;
  doa: string | null;
  santri: { nama: string } | { nama: string }[] | null;
};

/** Per santri: jumlah "Naik" & "Tetap" di rentang + do'a/status terakhir.
 *  Hanya santri yang punya minimal satu catatan naik/tetap. `kelasId`
 *  boleh array (kelas Gabung "tanpa batas waktu"). */
export async function muatHafalanDoaRingkas(
  kelasId: number | number[],
  awal: string,
  akhir: string,
): Promise<HafalanDoaRingkas[]> {
  const { data, error } = await supabase
    .from('hafalan_doa_pelaksanaan')
    .select('id, santri_id, tanggal, status, doa, santri:santri_id(nama)')
    .in('kelas_id', Array.isArray(kelasId) ? kelasId : [kelasId])
    .in('status', ['naik', 'tetap'])
    .gte('tanggal', awal)
    .lte('tanggal', akhir)
    .order('tanggal', { ascending: true });
  if (error) throw new Error(error.message);

  const peta = new Map<number, HafalanDoaRingkas>();
  for (const r of (data ?? []) as BarisHafalanDoaMentah[]) {
    const nama = (Array.isArray(r.santri) ? r.santri[0]?.nama : r.santri?.nama) ?? '—';
    const cur =
      peta.get(r.santri_id) ??
      {
        santriId: r.santri_id,
        nama,
        naik: 0,
        tetap: 0,
        terakhir: '',
        terakhirStatus: '' as const,
        terakhirDoa: null,
        hari: [] as HafalanDoaHari[],
      };
    const st = (r.status === 'naik' || r.status === 'tetap' ? r.status : '') as HafalanDoaStatus | '';
    if (st === 'naik') cur.naik += 1;
    else if (st === 'tetap') cur.tetap += 1;
    cur.hari.push({ id: r.id, tanggal: r.tanggal, doa: r.doa, status: st });
    if (r.tanggal >= cur.terakhir) {
      cur.terakhir = r.tanggal;
      cur.terakhirStatus = st;
      cur.terakhirDoa = r.doa;
    }
    peta.set(r.santri_id, cur);
  }
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/* ── SEMUA santri kelas (2026-09-14, diminta owner: tampilkan jg di
   Laporan Perkembangan Santri, "letakan di sebelah Hafalan Surat Materi
   Ngaji") -- kembar dari muatHafalanSuratKelas (lib/hafalanSurat.ts):
   beda dari muatHafalanDoaRingkas di atas, ini menyertakan santri yang
   BELUM punya catatan sama sekali (baris "Belum ada catatan"), dipakai
   tabel Nama/Pencapaian/Keterangan yang sama polanya dgn "Hafalan Surat
   (Materi Ngaji)" di laporan itu. */
export type HafalanDoaSantri = {
  santriId: number;
  nama: string;
  naik: number;
  tetap: number;
  terakhirDoa: string | null;
  adaCatatan: boolean;
};

/* `kelasId` boleh array (Gabung Kelas "tanpa batas waktu"). */
export async function muatHafalanDoaKelas(
  kelasId: number | number[],
  awal: string,
  akhir: string,
): Promise<HafalanDoaSantri[]> {
  const ids = Array.isArray(kelasId) ? kelasId : [kelasId];
  const [sRes, hRes] = await Promise.all([
    supabase
      .from('santri')
      .select('id, nama, nama_panggilan')
      .in('kelas_id', ids)
      .is('deleted_at', null)
      .order('nama'),
    supabase
      .from('hafalan_doa_pelaksanaan')
      .select('santri_id, tanggal, status, doa')
      .in('kelas_id', ids)
      .gte('tanggal', awal)
      .lte('tanggal', akhir)
      .order('tanggal', { ascending: true }),
  ]);
  if (sRes.error) throw new Error(sRes.error.message);
  if (hRes.error) throw new Error(hRes.error.message);

  const perSantri = new Map<number, { status: string | null; doa: string | null }[]>();
  for (const r of (hRes.data ?? []) as { santri_id: number; status: string | null; doa: string | null }[]) {
    const arr = perSantri.get(r.santri_id) ?? [];
    arr.push({ status: r.status, doa: r.doa });
    perSantri.set(r.santri_id, arr);
  }

  return (
    (sRes.data ?? []) as { id: number; nama: string; nama_panggilan: string | null }[]
  ).map((s) => {
    const arr = perSantri.get(s.id) ?? [];
    const panggilan = s.nama_panggilan?.trim() || s.nama.trim().split(/\s+/)[0] || s.nama;
    let naik = 0;
    let tetap = 0;
    for (const r of arr) {
      if (r.status === 'naik') naik += 1;
      else if (r.status === 'tetap') tetap += 1;
    }
    const last = arr.length > 0 ? arr[arr.length - 1] : null;
    return {
      santriId: s.id,
      nama: panggilan,
      naik,
      tetap,
      terakhirDoa: last?.doa ?? null,
      adaCatatan: arr.length > 0,
    };
  });
}
