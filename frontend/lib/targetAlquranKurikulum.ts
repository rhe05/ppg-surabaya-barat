/* Target Bacaan Al-Qur'an (Promes + Probul) per bulan kalender, utk
   Monitoring Pencapaian Materi kelas 4-9 (2026-09-12, diminta owner:
   "munculkan target per bulan ambil dari kurikulum, konsep tampilnya
   samakan seperti kelas tilawati" -> lanjut "tampilkan target juz
   berapa, ambil info target dari fitur kurikulum"). BEDA dari
   lib/pedomanTilawati.ts (pedoman statis di-cache di kode) -- ini query
   LANGSUNG ke kurikulum_prota/promes/probul (kelompok_id=1, data
   bersama semua kelompok) krn ownernya sendiri yang mengisi teks target
   per kelas, bukan pola tetap yang bisa dihardcode.

   Sumber Juz DICEK ke data produksi (bukan tebakan): kolom
   `kurikulum_probul.jilid` KOSONG utk seluruh baris Bacaan Al-Qur'an --
   Juz-nya sudah ada di `kurikulum_promes.target` per SEMESTER (satu Juz
   dikerjakan sepanjang semester), mis. kelas 4 semester 1 =
   "Juz 30 (11,5 Lbr - 23 Hal)", kelas 9 semester 1 =
   "Juz 24, 25 dan 26" -- bagian dalam kurung (kalau ada) dibuang, sisanya
   dipakai apa adanya sbg label Juz. Target LEMBAR per bulan tetap dari
   `kurikulum_probul.target` spt sebelumnya.

   Kalender akademik SAMA PERSIS dgn app/kurikulum/page.tsx
   (KELAS_BULAN_AKADEMIK_BACAAN): Juli-Desember = Semester 1 (bulanKe
   1-6), Januari-Juni = Semester 2 (bulanKe 1-6). */

import { supabase } from './supabase';
import { KATEGORI_BACAAN_ALQURAN } from './kategori';

const KELOMPOK_KURIKULUM_BERSAMA_ID = 1;

export type TargetAlquranPeriode = {
  /** Target lembar/hal bulan ini (kurikulum_probul.target), mis. "2 Lbr". */
  target: string;
  /** Label Juz semester ini, diuraikan dari kurikulum_promes.target
     (mis. "Juz 30" dari "Juz 30 (11,5 Lbr - 23 Hal)"). null kalau
     promes.target kosong atau tidak diawali "Juz". */
  juz: string | null;
  bulanKe: number;
  semester: 1 | 2;
};

/** "Juz 30 (11,5 Lbr - 23 Hal)" -> "Juz 30"; "Juz 24, 25 dan 26" (tanpa
 *  kurung) dibiarkan apa adanya. null kalau teksnya tidak diawali "Juz". */
function uraikanJuzDariPromes(teks: string | null): string | null {
  if (!teks) return null;
  const bersih = teks.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return /^juz\b/i.test(bersih) ? bersih : null;
}

type KategoriTersemat = { nama: string } | { nama: string }[] | null;

/** Target Bacaan Al-Qur'an (Juz semester + lembar bulan) utk kode kelas
 *  Kurikulum ('4'..'9') + tahun + BULAN KALENDER. null kalau baris
 *  Prota/Promes/Probul kelas itu belum diisi owner, atau target lembar
 *  bulan itu kosong. */
export async function targetAlquranPeriode(
  kodeKelas: string,
  tahun: number,
  bulanKalender: number,
): Promise<TargetAlquranPeriode | null> {
  const semester: 1 | 2 = bulanKalender >= 7 ? 1 : 2;
  const bulanKe = semester === 1 ? bulanKalender - 6 : bulanKalender;

  const { data: prota, error: eProta } = await supabase
    .from('kurikulum_prota')
    .select('id, kategori_kbm(nama)')
    .eq('kelompok_id', KELOMPOK_KURIKULUM_BERSAMA_ID)
    .eq('tahun', tahun)
    .eq('kelas', kodeKelas);
  if (eProta) throw new Error(eProta.message);

  const baris = (prota ?? []).find((p) => {
    const k = p.kategori_kbm as KategoriTersemat;
    const nama = Array.isArray(k) ? k[0]?.nama : k?.nama;
    return nama === KATEGORI_BACAAN_ALQURAN;
  });
  if (!baris) return null;

  const { data: promes, error: ePromes } = await supabase
    .from('kurikulum_promes')
    .select('id, target')
    .eq('prota_id', baris.id)
    .eq('semester', semester)
    .maybeSingle();
  if (ePromes) throw new Error(ePromes.message);
  if (!promes) return null;

  const { data: probul, error: eProbul } = await supabase
    .from('kurikulum_probul')
    .select('target')
    .eq('promes_id', promes.id)
    .eq('bulan', bulanKe)
    .maybeSingle();
  if (eProbul) throw new Error(eProbul.message);
  if (!probul?.target) return null;

  return {
    target: probul.target,
    juz: uraikanJuzDariPromes(promes.target),
    bulanKe,
    semester,
  };
}
