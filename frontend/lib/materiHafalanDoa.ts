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
 *  "Asmaul Husna (X sampai Y)" digabung jadi SATU, dan cuma dihitung
 *  kalau rentang yang disampaikan MENUTUPI target penuh kelas
 *  (`dari<=targetMin && sampai>=targetMax`) -- rentang parsial dibuang.
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
  for (const b of baris) {
    if (!adalahAsmaulHusna(b.nama_doa)) continue;
    const r = uraikanRentangAsmaulHusna(b.nama_doa);
    if (r && r.dari <= target.dari && r.sampai >= target.sampai) {
      jumlah += b.jumlah;
      if ((b.terakhir ?? '') > terakhir) terakhir = b.terakhir ?? '';
    }
  }
  if (jumlah > 0) {
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
