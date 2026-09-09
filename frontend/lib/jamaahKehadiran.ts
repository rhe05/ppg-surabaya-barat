/* Rekap kehadiran jamaah per bulan (fitur Penerobos Kelp — Riwayat +
   card Ringkasan). Hemat Supabase: 3 query per bulan apa pun ukurannya
   (acara + jamaah + kehadiran-untuk-acara-itu), sisanya hitung di memori. */

import { supabase } from './supabase';
import { KOLOM_ACARA, type JamaahAcara, type StatusHadir } from './jamaah';

export type AcaraRekap = JamaahAcara & {
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  totalDicatat: number; // baris jamaah_kehadiran utk acara ini
  totalJamaah: number; // jamaah yang berhak hadir (disaring sub_kelp acara)
};

export type JamaahRekap = {
  id: number;
  nama: string;
  sub_kelp_id: number | null;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  totalAcara: number; // acara yang jamaah ini berhak hadir bulan itu
};

export type RingkasBulan = {
  jumlahAcara: number;
  totalKehadiran: number;
  totalPeluang: number;
  persenHadir: number | null;
  acara: AcaraRekap[];
  jamaah: JamaahRekap[];
};

function batasBulan(tahun: number, bulan: number) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return {
    awal: `${tahun}-${dua(bulan)}-01`,
    akhir: `${tahun}-${dua(bulan)}-${dua(new Date(tahun, bulan, 0).getDate())}`,
  };
}

export async function muatRingkasKehadiranBulan(
  kelompokId: number,
  tahun: number,
  bulan: number,
): Promise<RingkasBulan> {
  const { awal, akhir } = batasBulan(tahun, bulan);

  const [rA, rJ] = await Promise.all([
    supabase
      .from('jamaah_acara')
      .select(KOLOM_ACARA)
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .gte('tanggal', awal)
      .lte('tanggal', akhir)
      .order('tanggal', { ascending: false }),
    supabase
      .from('jamaah')
      .select('id, nama, sub_kelp_id')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama'),
  ]);

  const acaraList = (rA.data ?? []) as unknown as JamaahAcara[];
  const jamaahList = (rJ.data ?? []) as unknown as {
    id: number;
    nama: string;
    sub_kelp_id: number | null;
  }[];

  const khByAcara: Record<number, { jamaah_id: number; status: StatusHadir }[]> = {};
  if (acaraList.length > 0) {
    const { data } = await supabase
      .from('jamaah_kehadiran')
      .select('acara_id, jamaah_id, status')
      .in(
        'acara_id',
        acaraList.map((a) => a.id),
      );
    for (const r of data ?? []) {
      (khByAcara[r.acara_id] ??= []).push({ jamaah_id: r.jamaah_id, status: r.status as StatusHadir });
    }
  }

  const berhak = (a: JamaahAcara) =>
    a.sub_kelp_id == null ? jamaahList : jamaahList.filter((j) => j.sub_kelp_id === a.sub_kelp_id);

  const acara: AcaraRekap[] = acaraList.map((a) => {
    const rows = khByAcara[a.id] ?? [];
    const c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    for (const r of rows) c[r.status] += 1;
    return { ...a, ...c, totalDicatat: rows.length, totalJamaah: berhak(a).length };
  });

  const jm = new Map<number, JamaahRekap>();
  for (const j of jamaahList)
    jm.set(j.id, {
      id: j.id,
      nama: j.nama,
      sub_kelp_id: j.sub_kelp_id,
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpa: 0,
      totalAcara: 0,
    });
  for (const a of acaraList) {
    const rows = khByAcara[a.id] ?? [];
    const st = new Map(rows.map((r) => [r.jamaah_id, r.status]));
    for (const j of berhak(a)) {
      const rec = jm.get(j.id);
      if (!rec) continue;
      rec.totalAcara += 1;
      const s = st.get(j.id);
      if (s) rec[s] += 1;
    }
  }
  const jamaah = [...jm.values()].filter((j) => j.totalAcara > 0);

  const totalKehadiran = acara.reduce((s, a) => s + a.hadir, 0);
  const totalPeluang = acara.reduce((s, a) => s + a.totalJamaah, 0);

  return {
    jumlahAcara: acara.length,
    totalKehadiran,
    totalPeluang,
    persenHadir: totalPeluang > 0 ? Math.round((totalKehadiran / totalPeluang) * 100) : null,
    acara,
    jamaah,
  };
}
