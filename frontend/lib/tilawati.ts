/* Laporan Tilawati per santri (2026-09-03, diminta owner) -- dipakai
   Riwayat Pembelajaran & Monitoring Pencapaian Materi. Sumber: tabel
   `tilawati_pelaksanaan` (migrasi 20260903120000), diisi guru di kartu
   "Tilawati" pada Pelaksanaan Pembelajaran. RLS tabel itu sudah
   membatasi ke kelas milik guru / scope admin. */

import { supabase } from './supabase';

export type TilawatiStatus = 'naik' | 'tetap';

export type TilawatiHari = {
  tanggal: string;
  jilid: string | null;
  halaman: string | null;
  status: TilawatiStatus | '';
};

export type TilawatiRingkas = {
  santriId: number;
  nama: string;
  naik: number;
  tetap: number;
  terakhir: string;
  terakhirStatus: TilawatiStatus | '';
  terakhirJilid: string | null;
  terakhirHalaman: string | null;
  /* Rincian per hari (urut tanggal menaik) -- dipakai Riwayat
     Pembelajaran (bagian "Buku Jilid"). */
  hari: TilawatiHari[];
};

type BarisMentah = {
  santri_id: number;
  tanggal: string;
  status: string | null;
  buku_jilid: string | null;
  halaman: string | null;
  santri: { nama: string } | { nama: string }[] | null;
};

/** Per santri: jumlah "Naik" & "Tetap" di rentang + jilid/halaman/status
 *  terakhir. Hanya santri yang punya minimal satu catatan naik/tetap. */
export async function muatTilawatiRingkas(
  kelasId: number,
  awal: string,
  akhir: string,
): Promise<TilawatiRingkas[]> {
  const { data, error } = await supabase
    .from('tilawati_pelaksanaan')
    .select('santri_id, tanggal, status, buku_jilid, halaman, santri:santri_id(nama)')
    .eq('kelas_id', kelasId)
    .in('status', ['naik', 'tetap'])
    .gte('tanggal', awal)
    .lte('tanggal', akhir)
    .order('tanggal', { ascending: true });
  if (error) throw new Error(error.message);

  const peta = new Map<number, TilawatiRingkas>();
  for (const r of (data ?? []) as BarisMentah[]) {
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
        terakhirJilid: null,
        terakhirHalaman: null,
        hari: [] as TilawatiHari[],
      };
    const st = (r.status === 'naik' || r.status === 'tetap' ? r.status : '') as TilawatiStatus | '';
    if (st === 'naik') cur.naik += 1;
    else if (st === 'tetap') cur.tetap += 1;
    cur.hari.push({ tanggal: r.tanggal, jilid: r.buku_jilid, halaman: r.halaman, status: st });
    if (r.tanggal >= cur.terakhir) {
      cur.terakhir = r.tanggal;
      cur.terakhirStatus = (r.status as TilawatiStatus | null) ?? '';
      cur.terakhirJilid = r.buku_jilid;
      cur.terakhirHalaman = r.halaman;
    }
    peta.set(r.santri_id, cur);
  }
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}
