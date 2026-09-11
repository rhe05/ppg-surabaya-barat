/* "Infaq Pengajian" (2026-09-11, diusulkan seorang guru) -- catatan infaq
   terkumpul GLOBAL per kelas per tanggal, BUKAN per santri (beda dari
   Tabungan). Migrasi 20260911180000. */

import { supabase } from './supabase';

export type InfaqBaris = {
  id: number;
  kelompok_id: number;
  kelas_id: number;
  tanggal: string;
  jumlah: number;
  keterangan: string | null;
  dicatat_oleh: string | null;
  created_at: string;
};

const KOLOM = 'id, kelompok_id, kelas_id, tanggal, jumlah, keterangan, dicatat_oleh, created_at';

function batasBulan(tahun: number, bulan: number) {
  const dua = (n: number) => String(n).padStart(2, '0');
  const akhirHari = new Date(tahun, bulan, 0).getDate();
  return { awal: `${tahun}-${dua(bulan)}-01`, akhir: `${tahun}-${dua(bulan)}-${dua(akhirHari)}` };
}

/** Riwayat infaq SATU kelas dalam satu bulan (guru). */
export async function muatInfaqKelasBulan(
  kelasId: number,
  tahun: number,
  bulan: number,
): Promise<InfaqBaris[]> {
  const { awal, akhir } = batasBulan(tahun, bulan);
  const { data, error } = await supabase
    .from('infaq_pengajian')
    .select(KOLOM)
    .eq('kelas_id', kelasId)
    .gte('tanggal', awal)
    .lte('tanggal', akhir)
    .is('deleted_at', null)
    .order('tanggal', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InfaqBaris[];
}

/** Riwayat infaq SELURUH kelas kelompok dalam satu bulan (admin_kelompok). */
export async function muatInfaqKelompokBulan(
  kelompokId: number,
  tahun: number,
  bulan: number,
): Promise<InfaqBaris[]> {
  const { awal, akhir } = batasBulan(tahun, bulan);
  const { data, error } = await supabase
    .from('infaq_pengajian')
    .select(KOLOM)
    .eq('kelompok_id', kelompokId)
    .gte('tanggal', awal)
    .lte('tanggal', akhir)
    .is('deleted_at', null)
    .order('tanggal', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InfaqBaris[];
}

export async function simpanInfaq(isi: {
  kelompokId: number;
  kelasId: number;
  tanggal: string;
  jumlah: number;
  keterangan: string | null;
  olehId: string | null;
}): Promise<void> {
  const { error } = await supabase.from('infaq_pengajian').insert({
    kelompok_id: isi.kelompokId,
    kelas_id: isi.kelasId,
    tanggal: isi.tanggal,
    jumlah: isi.jumlah,
    keterangan: isi.keterangan,
    dicatat_oleh: isi.olehId,
  });
  if (error) throw new Error(error.message);
}

/** Koreksi salah input -- soft-delete, pola sama jurnal_materi. */
export async function hapusInfaq(id: number): Promise<void> {
  const { error } = await supabase
    .from('infaq_pengajian')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
