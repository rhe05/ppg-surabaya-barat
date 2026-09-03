/* ─────────────────────────────────────────────────────────────────────
   PEDOMAN BUKU JILID TILAWATI — target yang harus dicapai generus.

   Disimpan sebagai pedoman resmi atas permintaan owner (2026-09-03).
   Sumber kebenaran: Kurikulum tahun 2026, kategori "Bacaan Al-Qur'an"
   (kurikulum_prota / kurikulum_promes / kurikulum_probul, kelompok_id=1).
   Data ini di-cache di sini supaya layar Monitoring / Rencana bisa
   membandingkan CAPAIAN generus vs TARGET tanpa query kurikulum.

   FOKUS SAAT INI: baru Buku Jilid Tilawati (buku pegangan tiap generus,
   1 jilid = 44 halaman). Peraga Tilawati (papan peraga, Hal 1-20) BELUM
   dipedomankan — di Promes cuma disebut "Peraga Jilid N Hal 1-20" tanpa
   rincian per bulan/minggu.

   ATURAN JILID PER KELAS (dari Promes):
     - PAUD-TK : buku "Tilawati Paud" (44 hal) untuk SATU tahun penuh
     - Kelas 1 : Semester 1 → Jilid 1 , Semester 2 → Jilid 2
     - Kelas 2 : Semester 1 → Jilid 3 , Semester 2 → Jilid 4
     - Kelas 3 : Semester 1 → Jilid 5 , Semester 2 → Jilid 6
     - Kelas 4+ : sudah baca Al-Qur'an (juz), bukan jilid — di luar pedoman ini

   POLA HALAMAN PER JILID (kelas 1-3, 6 bulan KBM per semester):
     Bulan 1 : Hal 1-9    (M1 1-4 · M2 5-8 · M3 9 · M4 Evaluasi)
     Bulan 2 : Hal 10-18  (M1 10-12 · M2 13-15 · M3 16-18 · M4 Evaluasi)
     Bulan 3 : Hal 19-27
     Bulan 4 : Hal 28-36
     Bulan 5 : Hal 37-44
     Bulan 6 : Evaluasi
   "Bulan" di sini = bulan ke-N DALAM semester (1-6), bukan bulan kalender.

   POLA HALAMAN PAUD-TK (12 bulan, buku Tilawati Paud 44 hal): lihat
   POLA_PAUD di bawah.
   ───────────────────────────────────────────────────────────────────── */

export const PEDOMAN_TILAWATI_SUMBER =
  "Kurikulum 2026 — kategori Bacaan Al-Qur'an (Prota/Promes/Probul). Disetujui owner 2026-09-03.";

export const HAL_PER_JILID = 44;

export type TargetMinggu = { minggu: 1 | 2 | 3 | 4; target: string };
export type TargetBulan = {
  /** Bulan ke-N dalam semester (kelas 1-3: 1-6) atau dalam tahun (PAUD: 1-12). */
  bulan: number;
  /** Ringkas target sebulan, mis. "Hal 1-9" atau "Evaluasi". */
  target: string;
  minggu: TargetMinggu[];
};

const evalMinggu = (n: 1 | 2 | 3 | 4): TargetMinggu => ({ minggu: n, target: 'Evaluasi' });

/** Pola 6-bulanan untuk SATU jilid Tilawati (kelas 1-3). Sama untuk
    jilid berapa pun — halaman selalu 1-44 dengan irama yang sama. */
export const POLA_JILID_STANDAR: TargetBulan[] = [
  {
    bulan: 1,
    target: 'Hal 1-9',
    minggu: [
      { minggu: 1, target: 'Hal 1-4' },
      { minggu: 2, target: 'Hal 5-8' },
      { minggu: 3, target: 'Hal 9' },
      evalMinggu(4),
    ],
  },
  {
    bulan: 2,
    target: 'Hal 10-18',
    minggu: [
      { minggu: 1, target: 'Hal 10-12' },
      { minggu: 2, target: 'Hal 13-15' },
      { minggu: 3, target: 'Hal 16-18' },
      evalMinggu(4),
    ],
  },
  {
    bulan: 3,
    target: 'Hal 19-27',
    minggu: [
      { minggu: 1, target: 'Hal 19-21' },
      { minggu: 2, target: 'Hal 22-24' },
      { minggu: 3, target: 'Hal 25-27' },
      evalMinggu(4),
    ],
  },
  {
    bulan: 4,
    target: 'Hal 28-36',
    minggu: [
      { minggu: 1, target: 'Hal 28-30' },
      { minggu: 2, target: 'Hal 31-33' },
      { minggu: 3, target: 'Hal 34-36' },
      evalMinggu(4),
    ],
  },
  {
    bulan: 5,
    target: 'Hal 37-44',
    minggu: [
      { minggu: 1, target: 'Hal 37-39' },
      { minggu: 2, target: 'Hal 40-42' },
      { minggu: 3, target: 'Hal 43-44' },
      evalMinggu(4),
    ],
  },
  {
    bulan: 6,
    target: 'Evaluasi',
    minggu: [evalMinggu(1), evalMinggu(2), evalMinggu(3), evalMinggu(4)],
  },
];

/** Pola 12-bulanan buku "Tilawati Paud" (44 hal) untuk jenjang PAUD-TK. */
export const POLA_PAUD: TargetBulan[] = [
  { bulan: 1, target: 'Hal 1-5', minggu: [{ minggu: 1, target: 'Hal 1-2' }, { minggu: 2, target: 'Hal 3-4' }, { minggu: 3, target: 'Hal 5' }, evalMinggu(4)] },
  { bulan: 2, target: 'Hal 6-10', minggu: [{ minggu: 1, target: 'Hal 6-7' }, { minggu: 2, target: 'Hal 8-9' }, { minggu: 3, target: 'Hal 10' }, evalMinggu(4)] },
  { bulan: 3, target: 'Hal 11-15', minggu: [{ minggu: 1, target: 'Hal 11-12' }, { minggu: 2, target: 'Hal 13-14' }, { minggu: 3, target: 'Hal 15' }, evalMinggu(4)] },
  { bulan: 4, target: 'Hal 16-20', minggu: [{ minggu: 1, target: 'Hal 16-17' }, { minggu: 2, target: 'Hal 18-19' }, { minggu: 3, target: 'Hal 20' }, evalMinggu(4)] },
  { bulan: 5, target: 'Hal 21-22', minggu: [{ minggu: 1, target: 'Hal 21' }, { minggu: 2, target: 'Hal 22' }, evalMinggu(3), evalMinggu(4)] },
  { bulan: 6, target: 'Evaluasi', minggu: [evalMinggu(1), evalMinggu(2), evalMinggu(3), evalMinggu(4)] },
  { bulan: 7, target: 'Hal 23-27', minggu: [{ minggu: 1, target: 'Hal 23-24' }, { minggu: 2, target: 'Hal 25-26' }, { minggu: 3, target: 'Hal 27' }, evalMinggu(4)] },
  { bulan: 8, target: 'Hal 28-32', minggu: [{ minggu: 1, target: 'Hal 28-29' }, { minggu: 2, target: 'Hal 30-31' }, { minggu: 3, target: 'Hal 32' }, evalMinggu(4)] },
  { bulan: 9, target: 'Hal 33-37', minggu: [{ minggu: 1, target: 'Hal 33-34' }, { minggu: 2, target: 'Hal 35-36' }, { minggu: 3, target: 'Hal 37' }, evalMinggu(4)] },
  { bulan: 10, target: 'Hal 38-42', minggu: [{ minggu: 1, target: 'Hal 38-39' }, { minggu: 2, target: 'Hal 40-41' }, { minggu: 3, target: 'Hal 42' }, evalMinggu(4)] },
  { bulan: 11, target: 'Hal 43-44', minggu: [{ minggu: 1, target: 'Hal 43' }, { minggu: 2, target: 'Hal 44' }, evalMinggu(3), evalMinggu(4)] },
  { bulan: 12, target: 'Evaluasi', minggu: [evalMinggu(1), evalMinggu(2), evalMinggu(3), evalMinggu(4)] },
];

/** Jilid Tilawati yang jadi target per kelas (kode kelas Kurikulum). */
export const JILID_TARGET_KELAS: Record<string, { semester1: string; semester2: string }> = {
  'PAUD-TK': { semester1: 'Paud', semester2: 'Paud' },
  '1': { semester1: '1', semester2: '2' },
  '2': { semester1: '3', semester2: '4' },
  '3': { semester1: '5', semester2: '6' },
};

/** Kode kelas yang punya pedoman Buku Jilid Tilawati (PAUD-TK s.d. 3). */
export const KELAS_PEDOMAN_TILAWATI = Object.keys(JILID_TARGET_KELAS);

/** Jilid target untuk kelas + semester. null kalau kelas di luar pedoman. */
export function jilidTargetKelas(kodeKelas: string, semester: 1 | 2): string | null {
  const p = JILID_TARGET_KELAS[kodeKelas];
  if (!p) return null;
  return semester === 1 ? p.semester1 : p.semester2;
}

/** Rencana target satu bulan. `bulanKe` = bulan ke-N dalam semester
    (kelas 1-3: 1-6) atau dalam tahun (PAUD-TK: 1-12). */
export function targetBulanTilawati(kodeKelas: string, bulanKe: number): TargetBulan | null {
  const pola = kodeKelas === 'PAUD-TK' ? POLA_PAUD : POLA_JILID_STANDAR;
  return pola.find((b) => b.bulan === bulanKe) ?? null;
}

/** Target satu minggu (string), mis. "Hal 5-8" atau "Evaluasi". */
export function targetMingguTilawati(
  kodeKelas: string,
  bulanKe: number,
  mingguKe: 1 | 2 | 3 | 4,
): string | null {
  return targetBulanTilawati(kodeKelas, bulanKe)?.minggu.find((m) => m.minggu === mingguKe)?.target ?? null;
}

/* ── Perbandingan capaian vs target (dipakai Monitoring) ────────────── */

export type TargetTilawatiPeriode = {
  /** 'Paud' | '1'..'6' */
  jilid: string;
  semester: 1 | 2;
  /** Bulan ke-N dalam semester (kelas 1-3: 1-6) / tahun (PAUD: 1-12). */
  bulanKe: number;
  bulan: TargetBulan;
  /** Halaman awal & akhir yang ditargetkan bulan ini. "Evaluasi" → 44. */
  halAwal: number;
  halAkhir: number;
};

function halAkhirDariTarget(t: string): number {
  const nums = [...t.matchAll(/\d+/g)].map((x) => Number(x[0]));
  return nums.length > 0 ? Math.max(...nums) : HAL_PER_JILID;
}
function halAwalDariTarget(t: string): number {
  const nums = [...t.matchAll(/\d+/g)].map((x) => Number(x[0]));
  return nums.length > 0 ? Math.min(...nums) : HAL_PER_JILID;
}
function jilidKeAngka(jilid: string): number {
  return /paud/i.test(jilid) ? 0 : Number(jilid) || 0;
}

/** Target Buku Jilid Tilawati untuk kelas + BULAN KALENDER (1-12).
    Asumsi tahun ajaran (dari data kurikulum_probul): Januari–Juni =
    Semester 1, Juli–Desember = Semester 2. null kalau kelas di luar
    pedoman (kelas 4+ sudah baca Al-Qur'an per juz). */
export function targetTilawatiPeriode(
  kodeKelas: string,
  bulanKalender: number,
): TargetTilawatiPeriode | null {
  if (!(kodeKelas in JILID_TARGET_KELAS)) return null;
  const m = Math.min(Math.max(Math.trunc(bulanKalender), 1), 12);

  if (kodeKelas === 'PAUD-TK') {
    const bulan = POLA_PAUD.find((b) => b.bulan === m);
    if (!bulan) return null;
    return {
      jilid: 'Paud',
      semester: m <= 6 ? 1 : 2,
      bulanKe: m,
      bulan,
      halAwal: halAwalDariTarget(bulan.target),
      halAkhir: halAkhirDariTarget(bulan.target),
    };
  }

  const semester: 1 | 2 = m <= 6 ? 1 : 2;
  const bulanKe = m <= 6 ? m : m - 6;
  const bulan = POLA_JILID_STANDAR.find((b) => b.bulan === bulanKe);
  if (!bulan) return null;
  return {
    jilid: jilidTargetKelas(kodeKelas, semester) ?? '',
    semester,
    bulanKe,
    bulan,
    halAwal: halAwalDariTarget(bulan.target),
    halAkhir: halAkhirDariTarget(bulan.target),
  };
}

/** Posisi absolut sebuah capaian untuk dibandingkan: jilid × 44 + halaman.
    "Paud" dihitung jilid 0. null kalau jilid & halaman dua-duanya kosong. */
export function posisiTilawati(
  jilid: string | null | undefined,
  halaman: string | number | null | undefined,
): number | null {
  if ((jilid == null || jilid === '') && (halaman == null || halaman === '')) return null;
  const j = !jilid ? 0 : /paud/i.test(jilid) ? 0 : Number(jilid) || 0;
  const h = typeof halaman === 'number' ? halaman : Number(halaman) || 0;
  return j * HAL_PER_JILID + h;
}

/** Label singkat target periode, mis. "Jilid 1 · Hal 28-36". */
export function labelTargetPeriode(t: TargetTilawatiPeriode): string {
  const j = t.jilid === 'Paud' ? 'Tilawati Paud' : `Jilid ${t.jilid}`;
  const total = t.halAkhir - t.halAwal;
  const suffix = total > 0 ? ` (Total ${total} Halaman)` : '';
  return `${j} · ${t.bulan.target}${suffix}`;
}

/* ── Rubrik pencapaian (4 tingkat, diminta owner 2026-09-03) ────────── */

export type StatusPencapaian = 'BB' | 'MB' | 'BSH' | 'BSB';

export const LABEL_STATUS_PENCAPAIAN: Record<
  StatusPencapaian,
  { singkat: string; panjang: string; arti: string }
> = {
  BB: { singkat: 'BB', panjang: 'Belum Berkembang', arti: 'kurang dari target' },
  MB: { singkat: 'MB', panjang: 'Mulai Berkembang', arti: 'mendekati target' },
  BSH: { singkat: 'BSH', panjang: 'Berkembang Sesuai Harapan', arti: 'sesuai target' },
  BSB: { singkat: 'BSB', panjang: 'Berkembang Sangat Baik', arti: 'melebihi target' },
};

/** Status pencapaian Buku Jilid Tilawati seorang generus terhadap
    pedoman, untuk bulan kalender terpilih:
      BSB  posisi > halaman target akhir bulan ini
      BSH  posisi di dalam rentang target bulan ini
      MB   di bawah target bulan ini, tapi ≥ target bulan lalu
      BB   di bawah target bulan lalu
    null kalau tak ada capaian / kelas di luar pedoman. */
export function statusPencapaianTilawati(
  kodeKelas: string,
  bulanKalender: number,
  posisiSantri: number | null,
): StatusPencapaian | null {
  if (posisiSantri == null) return null;
  const t = targetTilawatiPeriode(kodeKelas, bulanKalender);
  if (!t) return null;

  const basis = jilidKeAngka(t.jilid) * HAL_PER_JILID;
  const tAwal = basis + t.halAwal;
  const tAkhir = basis + t.halAkhir;

  const prev = bulanKalender > 1 ? targetTilawatiPeriode(kodeKelas, bulanKalender - 1) : null;
  const posPrev = prev ? jilidKeAngka(prev.jilid) * HAL_PER_JILID + prev.halAkhir : 0;

  if (posisiSantri > tAkhir) return 'BSB';
  if (posisiSantri >= tAwal) return 'BSH';
  if (posisiSantri >= posPrev) return 'MB';
  return 'BB';
}
