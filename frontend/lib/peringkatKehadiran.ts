/* Peringkat kehadiran berbasis POIN (2026-08-27, diminta owner) — dipakai
   layar Statistik mobile admin_kelp (StatistikKelpMobile.tsx).

   Sistem poin (sama utk generus & guru):
     hadir                 = 3
     izin (sakit)          = 1
     izin (keperluan lain) = 1   -> praktisnya: status 'izin' & 'sakit' = 1
     alpa                  = 0

   GENERUS: dari tabel `absensi` (per santri per tanggal).
   GURU: tidak ada absensi harian guru -> diturunkan (pilihan owner
   "Guru Izin + Hari Aktif"):
     - HADIR  = jumlah TANGGAL hari-kerja guru mengisi absensi kelasnya
     - IZIN   = jumlah TANGGAL hari-kerja yang tercakup catatan `guru_izin`
                (jenis izin/cuti, alasan apa pun) dan BUKAN hari hadir
     - tidak menghitung ALPA

   "Hari kerja" = Senin–Jumat & bukan tanggal libur kelompok — konsisten
   dgn definisi "Hari Aktif" di seluruh app. Baris absensi di akhir pekan /
   tanggal libur TIDAK diberi poin. */

import { supabase } from './supabase';
import { muatOverrideKelompok, tanggalLiburKelompok, adalahAkhirPekan } from './kalenderKelompok';

export type BarisPeringkat = {
  id: number;
  nama: string;
  poin: number;
  hadir: number;
  izin: number;
  alpa: number;
};

function rentangBulan(tahun: number, bulan: number) {
  const dua = (n: number) => String(n).padStart(2, '0');
  const awal = `${tahun}-${dua(bulan)}-01`;
  const akhirTgl = new Date(tahun, bulan, 0).getDate();
  const akhir = `${tahun}-${dua(bulan)}-${dua(akhirTgl)}`;
  return { awal, akhir };
}

function tglStr(d: Date) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

function ambilSet(peta: Map<number, Set<string>>, kunci: number): Set<string> {
  let s = peta.get(kunci);
  if (!s) {
    s = new Set();
    peta.set(kunci, s);
  }
  return s;
}

async function hariKerjaPredikat(kelompokId: number) {
  const libur = tanggalLiburKelompok(await muatOverrideKelompok(kelompokId));
  return (t: string) => !adalahAkhirPekan(t) && !libur.has(t);
}

export async function muatPeringkatGenerus(
  kelompokId: number,
  tahun: number,
  bulan: number,
): Promise<BarisPeringkat[]> {
  const { awal, akhir } = rentangBulan(tahun, bulan);
  const hariKerja = await hariKerjaPredikat(kelompokId);

  const { data: santriData, error: eSantri } = await supabase
    .from('santri')
    .select('id, nama')
    .eq('kelompok_id', kelompokId)
    .is('deleted_at', null);
  if (eSantri) throw new Error(eSantri.message);
  const namaById = new Map<number, string>((santriData ?? []).map((s) => [s.id, s.nama]));
  const ids = [...namaById.keys()];
  if (ids.length === 0) return [];

  const acc = new Map<number, { hadir: number; izin: number; alpa: number }>();
  const UK = 1000;
  for (let dari = 0; ; dari += UK) {
    const { data, error } = await supabase
      .from('absensi')
      .select('santri_id, tanggal, status')
      .in('santri_id', ids)
      .gte('tanggal', awal)
      .lte('tanggal', akhir)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(dari, dari + UK - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    batch.forEach((a) => {
      if (!hariKerja(a.tanggal)) return;
      const cur = acc.get(a.santri_id) ?? { hadir: 0, izin: 0, alpa: 0 };
      if (a.status === 'hadir') cur.hadir++;
      else if (a.status === 'izin' || a.status === 'sakit') cur.izin++;
      else if (a.status === 'alpa') cur.alpa++;
      acc.set(a.santri_id, cur);
    });
    if (batch.length < UK) break;
  }

  const rows: BarisPeringkat[] = [];
  acc.forEach((v, id) => {
    rows.push({
      id,
      nama: namaById.get(id) ?? '-',
      poin: v.hadir * 3 + v.izin * 1,
      hadir: v.hadir,
      izin: v.izin,
      alpa: v.alpa,
    });
  });
  return rows.sort((a, b) => b.poin - a.poin || a.nama.localeCompare(b.nama, 'id')).slice(0, 10);
}

export async function muatPeringkatGuru(
  kelompokId: number,
  tahun: number,
  bulan: number,
): Promise<BarisPeringkat[]> {
  const { awal, akhir } = rentangBulan(tahun, bulan);
  const hariKerja = await hariKerjaPredikat(kelompokId);

  const [{ data: guruData, error: eGuru }, { data: kelasData, error: eKelas }] = await Promise.all([
    supabase.from('guru').select('id, nama').eq('kelompok_id', kelompokId).is('deleted_at', null),
    supabase.from('kelas').select('id, guru_id').eq('kelompok_id', kelompokId).is('deleted_at', null),
  ]);
  if (eGuru) throw new Error(eGuru.message);
  if (eKelas) throw new Error(eKelas.message);

  const namaById = new Map<number, string>((guruData ?? []).map((g) => [g.id, g.nama]));
  if (namaById.size === 0) return [];

  const guruDariKelas = new Map<number, number>();
  (kelasData ?? []).forEach((k) => {
    if (k.guru_id != null) guruDariKelas.set(k.id, k.guru_id);
  });
  const kelasIds = [...guruDariKelas.keys()];

  /* HADIR: tanggal hari-kerja dgn absensi utk kelas yang diampu guru itu. */
  const hadirDays = new Map<number, Set<string>>();
  if (kelasIds.length > 0) {
    const { data: santriData, error: eSantri } = await supabase
      .from('santri')
      .select('id, kelas_id')
      .in('kelas_id', kelasIds)
      .is('deleted_at', null);
    if (eSantri) throw new Error(eSantri.message);
    const kelasDariSantri = new Map<number, number>();
    (santriData ?? []).forEach((s) => {
      if (s.kelas_id != null) kelasDariSantri.set(s.id, s.kelas_id);
    });
    const santriIds = [...kelasDariSantri.keys()];
    if (santriIds.length > 0) {
      const UK = 1000;
      for (let dari = 0; ; dari += UK) {
        const { data, error } = await supabase
          .from('absensi')
          .select('santri_id, tanggal')
          .in('santri_id', santriIds)
          .gte('tanggal', awal)
          .lte('tanggal', akhir)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(dari, dari + UK - 1);
        if (error) throw new Error(error.message);
        const batch = data ?? [];
        batch.forEach((a) => {
          if (!hariKerja(a.tanggal)) return;
          const kId = kelasDariSantri.get(a.santri_id);
          const gId = kId != null ? guruDariKelas.get(kId) : undefined;
          if (gId != null) ambilSet(hadirDays, gId).add(a.tanggal);
        });
        if (batch.length < UK) break;
      }
    }
  }

  /* IZIN: tanggal hari-kerja yg tercakup rentang guru_izin, dikurangi
     tanggal yg sudah dihitung hadir. */
  const { data: izinRows, error: eIzin } = await supabase
    .from('guru_izin')
    .select('guru_id, tanggal_mulai, tanggal_selesai')
    .eq('kelompok_id', kelompokId)
    .lte('tanggal_mulai', akhir)
    .gte('tanggal_selesai', awal);
  if (eIzin) throw new Error(eIzin.message);

  const izinDays = new Map<number, Set<string>>();
  (izinRows ?? []).forEach((r) => {
    const set = ambilSet(izinDays, r.guru_id);
    const mulai = r.tanggal_mulai < awal ? awal : r.tanggal_mulai;
    const selesai = r.tanggal_selesai > akhir ? akhir : r.tanggal_selesai;
    for (
      let d = new Date(mulai + 'T00:00:00');
      d <= new Date(selesai + 'T00:00:00');
      d.setDate(d.getDate() + 1)
    ) {
      const s = tglStr(d);
      if (hariKerja(s)) set.add(s);
    }
  });

  const rows: BarisPeringkat[] = [];
  namaById.forEach((nama, gId) => {
    const h = hadirDays.get(gId) ?? new Set<string>();
    let izin = 0;
    (izinDays.get(gId) ?? new Set<string>()).forEach((d) => {
      if (!h.has(d)) izin++;
    });
    rows.push({ id: gId, nama, poin: h.size * 3 + izin * 1, hadir: h.size, izin, alpa: 0 });
  });
  return rows
    .filter((r) => r.hadir > 0 || r.izin > 0)
    .sort((a, b) => b.poin - a.poin || a.nama.localeCompare(b.nama, 'id'))
    .slice(0, 10);
}
