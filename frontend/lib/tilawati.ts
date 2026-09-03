/* Laporan Tilawati "Naik" per santri (2026-09-03, diminta owner) --
   dipakai Riwayat Pembelajaran & Monitoring Pencapaian Materi.
   Sumber: tabel `tilawati_pelaksanaan` (migrasi 20260903120000), diisi
   guru di kartu "Tilawati" pada Pelaksanaan Pembelajaran. RLS tabel itu
   sudah membatasi ke kelas milik guru / scope admin. */

import { supabase } from './supabase';

export type TilawatiNaik = {
  santriId: number;
  nama: string;
  jumlah: number;
  terakhir: string;
  terakhirJilid: string | null;
  terakhirHalaman: string | null;
};

type BarisMentah = {
  santri_id: number;
  tanggal: string;
  buku_jilid: string | null;
  halaman: string | null;
  santri: { nama: string } | { nama: string }[] | null;
};

/** Per santri: berapa kali "Naik" di rentang, plus jilid/halaman terakhir. */
export async function muatTilawatiNaik(
  kelasId: number,
  awal: string,
  akhir: string,
): Promise<TilawatiNaik[]> {
  const { data, error } = await supabase
    .from('tilawati_pelaksanaan')
    .select('santri_id, tanggal, buku_jilid, halaman, santri:santri_id(nama)')
    .eq('kelas_id', kelasId)
    .eq('status', 'naik')
    .gte('tanggal', awal)
    .lte('tanggal', akhir)
    .order('tanggal', { ascending: true });
  if (error) throw new Error(error.message);

  const peta = new Map<number, TilawatiNaik>();
  for (const r of (data ?? []) as BarisMentah[]) {
    const nama = (Array.isArray(r.santri) ? r.santri[0]?.nama : r.santri?.nama) ?? '—';
    const cur =
      peta.get(r.santri_id) ??
      { santriId: r.santri_id, nama, jumlah: 0, terakhir: '', terakhirJilid: null, terakhirHalaman: null };
    cur.jumlah += 1;
    if (r.tanggal >= cur.terakhir) {
      cur.terakhir = r.tanggal;
      cur.terakhirJilid = r.buku_jilid;
      cur.terakhirHalaman = r.halaman;
    }
    peta.set(r.santri_id, cur);
  }
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}
