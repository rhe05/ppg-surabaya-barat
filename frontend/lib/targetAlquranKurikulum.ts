/* Target Bacaan Al-Qur'an (Probul) per bulan kalender, utk Monitoring
   Pencapaian Materi kelas 4-9 (2026-09-12, diminta owner: "munculkan
   target per bulan ambil dari kurikulum, konsep tampilnya samakan
   seperti kelas tilawati"). BEDA dari lib/pedomanTilawati.ts (pedoman
   statis di-cache di kode) -- ini query LANGSUNG ke
   kurikulum_prota/promes/probul (kelompok_id=1, data bersama semua
   kelompok) krn ownernya sendiri yang mengisi teks target per kelas,
   bukan pola tetap yang bisa dihardcode.

   Kalender akademik SAMA PERSIS dgn app/kurikulum/page.tsx
   (KELAS_BULAN_AKADEMIK_BACAAN): Juli-Desember = Semester 1 (bulanKe
   1-6), Januari-Juni = Semester 2 (bulanKe 1-6). */

import { supabase } from './supabase';
import { KATEGORI_BACAAN_ALQURAN } from './kategori';

const KELOMPOK_KURIKULUM_BERSAMA_ID = 1;

export type TargetAlquranPeriode = {
  target: string;
  /** Kolom `jilid` di kurikulum_probul, dipakai ulang sbg "Juz" utk
     kategori Bacaan Al-Qur'an (diminta owner 2026-09-12: "tampilkan
     juga juz berapa"). Admin isi lewat borang "Ubah Probul" > field
     "Jilid" yg sudah ada di /kurikulum (belum ada UI baru). null kalau
     belum diisi. */
  jilid: string | null;
  bulanKe: number;
  semester: 1 | 2;
};

/** "30" -> "Juz 30"; "Juz 30" dibiarkan apa adanya (admin sudah menulis
 *  lengkap). Sama pola dgn `labelBukuJilid` di lib/tilawati.ts, tapi
 *  utk sumber teks bebas (borang Kurikulum), bukan hasil pencatatan
 *  Pelaksanaan yg formatnya sudah dijamin "Juz N". */
export function labelJuzTarget(jilid: string): string {
  return /juz/i.test(jilid) ? jilid : `Juz ${jilid}`;
}

type KategoriTersemat = { nama: string } | { nama: string }[] | null;

/** Target Probul "Bacaan Al-Qur'an" utk kode kelas Kurikulum ('4'..'9')
 *  + tahun + BULAN KALENDER. null kalau baris Prota/Promes/Probul kelas
 *  itu belum diisi owner, atau target-nya kosong. */
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
    .select('id')
    .eq('prota_id', baris.id)
    .eq('semester', semester)
    .maybeSingle();
  if (ePromes) throw new Error(ePromes.message);
  if (!promes) return null;

  const { data: probul, error: eProbul } = await supabase
    .from('kurikulum_probul')
    .select('target, jilid')
    .eq('promes_id', promes.id)
    .eq('bulan', bulanKe)
    .maybeSingle();
  if (eProbul) throw new Error(eProbul.message);
  if (!probul?.target) return null;

  return { target: probul.target, jilid: probul.jilid, bulanKe, semester };
}
