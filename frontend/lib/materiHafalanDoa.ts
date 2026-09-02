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
