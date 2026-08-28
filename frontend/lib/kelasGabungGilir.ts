/* Gabung kelas & gilir guru (2026-08-28, diminta owner) — dipakai
   komposer Pengumuman Jadwal KBM supaya apa yang diatur admin kelp di
   "Data Kelas" langsung terbaca di pengumuman.

   Migrasi 20260828200000: kelas.gilir_mulai/gilir_minggu,
   jadwal_kbm.kelas_id, dan tabel kelas_gabung. */

import { supabase } from './supabase';

export type KelasRingkas = {
  id: number;
  nama: string;
  guru_id: number | null;
  guru_id_2: number | null;
  gilir_mulai: string | null;
  gilir_minggu: number | null;
};

export type GabungKelas = {
  kelas_id: number;
  kelas_induk_id: number;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  catatan: string | null;
};

/* Siapa yang mengajar kelas ini pada tanggal tsb.

   Gilir baru dihitung kalau SEMUA syaratnya lengkap: ada guru kedua, ada
   tanggal mulai giliran, dan panjang giliran > 0. Kalau salah satu kosong
   -- termasuk kelas biasa yang cuma punya satu guru -- kembalikan guru
   utama apa adanya, JANGAN menebak.

   Tanggal sebelum `gilir_mulai` juga memakai guru utama: polanya belum
   berlaku saat itu, dan mengekstrapolasi ke belakang berisiko menampilkan
   nama yang salah di pengumuman lampau. */
export function guruGiliran(kelas: KelasRingkas, tanggal: string): number | null {
  const { guru_id, guru_id_2, gilir_mulai, gilir_minggu } = kelas;
  if (guru_id_2 == null || !gilir_mulai || !gilir_minggu || gilir_minggu < 1) return guru_id;

  const mulai = new Date(gilir_mulai + 'T00:00:00');
  const saat = new Date(tanggal + 'T00:00:00');
  const selisihHari = Math.floor((saat.getTime() - mulai.getTime()) / 86_400_000);
  if (selisihHari < 0) return guru_id;

  const panjang = 7 * gilir_minggu;
  const giliranKe = Math.floor(selisihHari / panjang);
  return giliranKe % 2 === 0 ? guru_id : guru_id_2;
}

export async function muatKelasRingkas(kelompokId: number): Promise<KelasRingkas[]> {
  const { data, error } = await supabase
    .from('kelas')
    .select('id, nama, guru_id, guru_id_2, gilir_mulai, gilir_minggu')
    .eq('kelompok_id', kelompokId)
    .is('deleted_at', null)
    .order('nama');
  if (error) throw new Error(error.message);
  return (data ?? []) as KelasRingkas[];
}

/* Penggabungan yang AKTIF pada satu tanggal. Key = kelas_id yang ikut
   bergabung (kelas yang "hilang" dari daftar sesi dan menempel ke
   induknya). */
export async function muatGabungAktif(
  kelompokId: number,
  tanggal: string,
): Promise<Map<number, GabungKelas>> {
  const { data, error } = await supabase
    .from('kelas_gabung')
    .select('kelas_id, kelas_induk_id, jam_mulai, jam_selesai, ruangan, catatan')
    .eq('kelompok_id', kelompokId)
    .lte('tanggal_mulai', tanggal)
    .gte('tanggal_selesai', tanggal);
  if (error) throw new Error(error.message);
  const peta = new Map<number, GabungKelas>();
  for (const g of (data ?? []) as GabungKelas[]) peta.set(g.kelas_id, g);
  return peta;
}

export type BarisGabung = {
  id: number;
  kelompok_id: number;
  kelas_id: number;
  kelas_induk_id: number;
  tanggal_mulai: string;
  tanggal_selesai: string;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  catatan: string | null;
};

export async function muatSemuaGabung(kelompokId: number): Promise<BarisGabung[]> {
  const { data, error } = await supabase
    .from('kelas_gabung')
    .select(
      'id, kelompok_id, kelas_id, kelas_induk_id, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, ruangan, catatan',
    )
    .eq('kelompok_id', kelompokId)
    .order('tanggal_mulai', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BarisGabung[];
}

export async function simpanGabung(
  kelompokId: number,
  isi: {
    kelas_id: number;
    kelas_induk_id: number;
    tanggal_mulai: string;
    tanggal_selesai: string;
    jam_mulai: string | null;
    jam_selesai: string | null;
    ruangan: string | null;
    catatan: string | null;
  },
  olehId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('kelas_gabung')
    .insert({ kelompok_id: kelompokId, ...isi, dibuat_oleh: olehId });
  if (error) throw new Error(error.message);
}

export async function hapusGabung(id: number): Promise<void> {
  const { error } = await supabase.from('kelas_gabung').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
