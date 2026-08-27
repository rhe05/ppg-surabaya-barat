/* Fitur Tabungan (2026-08-28) — tabungan generus per-SANTRI, beberapa
   jenis per kelompok (Rekreasi/Qurban/dst) + target bulanan. Guru catat
   utk santri kelasnya, admin lihat total keseluruhan & per-santri.
   Tabel: tabungan_jenis + tabungan_transaksi (migrasi 20260828100000). */

import { supabase } from './supabase';

export type TabunganJenis = {
  id: number;
  nama: string;
  target_bulanan: number | null;
  urutan: number;
};

export type Transaksi = {
  id: number;
  jenis_id: number;
  santri_id: number;
  arah: 'masuk' | 'keluar';
  jumlah: number;
  tanggal: string;
  keterangan: string | null;
  created_at: string;
};

export function formatRupiah(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toLocaleString('id-ID');
  return `${neg ? '−' : ''}Rp ${s}`;
}

/* Saldo = Σ masuk − Σ keluar. Dihitung dari daftar transaksi. */
export function hitungSaldo(tx: Transaksi[]): Map<string, number> {
  const m = new Map<string, number>(); // `${santri_id}:${jenis_id}` -> saldo
  for (const t of tx) {
    const k = `${t.santri_id}:${t.jenis_id}`;
    m.set(k, (m.get(k) ?? 0) + (t.arah === 'masuk' ? t.jumlah : -t.jumlah));
  }
  return m;
}

export async function muatJenis(kelompokId: number): Promise<TabunganJenis[]> {
  const { data, error } = await supabase
    .from('tabungan_jenis')
    .select('id, nama, target_bulanan, urutan')
    .eq('kelompok_id', kelompokId)
    .eq('aktif', true)
    .order('urutan')
    .order('id');
  if (error) throw new Error(error.message);
  return (data ?? []) as TabunganJenis[];
}

export async function simpanJenis(
  kelompokId: number,
  id: number | null,
  isi: { nama: string; target_bulanan: number | null; urutan?: number },
  olehId: string | null,
): Promise<void> {
  if (id != null) {
    const { error } = await supabase
      .from('tabungan_jenis')
      .update({ nama: isi.nama, target_bulanan: isi.target_bulanan, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('tabungan_jenis').insert({
      kelompok_id: kelompokId,
      nama: isi.nama,
      target_bulanan: isi.target_bulanan,
      urutan: isi.urutan ?? 99,
      dibuat_oleh: olehId,
    });
    if (error) throw new Error(error.message);
  }
}

export async function hapusJenis(id: number): Promise<void> {
  const { error } = await supabase.from('tabungan_jenis').update({ aktif: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* Semua transaksi kelompok (utk agregasi admin). Paginasi 1000. */
export async function muatTransaksiKelompok(kelompokId: number): Promise<Transaksi[]> {
  const semua: Transaksi[] = [];
  const UK = 1000;
  for (let dari = 0; ; dari += UK) {
    const { data, error } = await supabase
      .from('tabungan_transaksi')
      .select('id, jenis_id, santri_id, arah, jumlah, tanggal, keterangan, created_at')
      .eq('kelompok_id', kelompokId)
      .order('id', { ascending: true })
      .range(dari, dari + UK - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Transaksi[];
    semua.push(...batch);
    if (batch.length < UK) break;
  }
  return semua;
}

export async function muatTransaksiSantri(santriIds: number[]): Promise<Transaksi[]> {
  if (santriIds.length === 0) return [];
  const semua: Transaksi[] = [];
  const UK = 1000;
  for (let dari = 0; ; dari += UK) {
    const { data, error } = await supabase
      .from('tabungan_transaksi')
      .select('id, jenis_id, santri_id, arah, jumlah, tanggal, keterangan, created_at')
      .in('santri_id', santriIds)
      .order('id', { ascending: true })
      .range(dari, dari + UK - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Transaksi[];
    semua.push(...batch);
    if (batch.length < UK) break;
  }
  return semua;
}

export async function catatTransaksi(
  kelompokId: number,
  isi: {
    jenis_id: number;
    santri_id: number;
    arah: 'masuk' | 'keluar';
    jumlah: number;
    tanggal: string;
    keterangan: string | null;
  },
  olehId: string | null,
): Promise<void> {
  const { error } = await supabase.from('tabungan_transaksi').insert({
    kelompok_id: kelompokId,
    ...isi,
    dicatat_oleh: olehId,
  });
  if (error) throw new Error(error.message);
}

export async function hapusTransaksi(id: number): Promise<void> {
  const { error } = await supabase.from('tabungan_transaksi').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
