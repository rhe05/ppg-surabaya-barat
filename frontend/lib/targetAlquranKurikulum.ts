/* Target Bacaan Al-Qur'an (Promes + Probul) per bulan kalender, utk
   Monitoring Pencapaian Materi kelas 4-9 (2026-09-12, diminta owner:
   "munculkan target per bulan ambil dari kurikulum, konsep tampilnya
   samakan seperti kelas tilawati" -> lanjut "tampilkan target juz
   berapa, ambil info target dari fitur kurikulum" -> lanjut "berikan
   juga keterangan BSH BB sama seperti tilawati"). BEDA dari
   lib/pedomanTilawati.ts (pedoman statis di-cache di kode) -- ini query
   LANGSUNG ke kurikulum_prota/promes/probul (kelompok_id=1, data
   bersama semua kelompok) krn ownernya sendiri yang mengisi teks target
   per kelas, bukan pola tetap yang bisa dihardcode.

   Sumber Juz DICEK ke data produksi (bukan tebakan): kolom
   `kurikulum_probul.jilid` KOSONG utk seluruh baris Bacaan Al-Qur'an --
   Juz-nya sudah ada di `kurikulum_promes.target` per SEMESTER (satu Juz
   dikerjakan sepanjang semester, BUKAN naik tiap bulan spt pedoman
   Tilawati), mis. kelas 4 semester 1 = "Juz 30 (11,5 Lbr - 23 Hal)",
   kelas 9 semester 1 = "Juz 24, 25 dan 26" -- bagian dalam kurung
   (kalau ada) dibuang, sisanya dipakai apa adanya sbg label Juz. Target
   LEMBAR per bulan tetap dari `kurikulum_probul.target` spt sebelumnya.

   Kalender akademik SAMA PERSIS dgn app/kurikulum/page.tsx
   (KELAS_BULAN_AKADEMIK_BACAAN): Juli-Desember = Semester 1 (bulanKe
   1-6), Januari-Juni = Semester 2 (bulanKe 1-6). */

import { supabase } from './supabase';
import { KATEGORI_BACAAN_ALQURAN } from './kategori';
import type { StatusPencapaian } from './pedomanTilawati';

const KELOMPOK_KURIKULUM_BERSAMA_ID = 1;

export type TargetAlquranPeriode = {
  /** Target lembar/hal bulan ini (kurikulum_probul.target), mis. "2 Lbr". */
  target: string;
  /** Label Juz semester ini, diuraikan dari kurikulum_promes.target
     (mis. "Juz 30" dari "Juz 30 (11,5 Lbr - 23 Hal)"). null kalau
     promes.target kosong atau tidak diawali "Juz". */
  juz: string | null;
  /** Juz semester SEBELUMNYA (semester 1 kalau ini semester 2, & sblknya
     -- dipakai ambang bawah rubrik MB/BB, sama pola dgn
     `statusPencapaianTilawati`). null kalau ini semester 1 (tak ada
     semester sebelumnya) atau belum diisi. */
  juzSemesterLalu: string | null;
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

  /* Ambil KEDUA semester sekaligus -- semester lalu dipakai ambang
     bawah rubrik MB/BB (posisi santri di bawahnya = BB). */
  const { data: promesDua, error: ePromes } = await supabase
    .from('kurikulum_promes')
    .select('id, semester, target')
    .eq('prota_id', baris.id)
    .in('semester', [1, 2]);
  if (ePromes) throw new Error(ePromes.message);

  const promes = (promesDua ?? []).find((p) => p.semester === semester);
  if (!promes) return null;
  const promesLalu = semester === 2 ? (promesDua ?? []).find((p) => p.semester === 1) : null;

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
    juzSemesterLalu: uraikanJuzDariPromes(promesLalu?.target ?? null),
    bulanKe,
    semester,
  };
}

/** "Juz 30" -> [30]; "Juz 24, 25 dan 26" -> [24,25,26]. */
function uraikanAngkaJuz(label: string): number[] {
  return [...label.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/** Nomor Juz dari catatan terakhir santri (kolom `buku_jilid`, format
 *  "Juz N" -- lihat lib/tilawati.ts). null kalau bukan format Juz
 *  (mis. masih "Paud"/jilid biasa, semestinya tidak terjadi di kelas
 *  4+, atau belum ada catatan). */
export function posisiJuzTerakhir(jilid: string | null): number | null {
  if (!jilid) return null;
  const m = jilid.match(/^juz\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Rubrik 4 tingkat BB/MB/BSH/BSB utk Bacaan Al-Qur'an (kelas 4+), sama
 *  konsep dgn `statusPencapaianTilawati` tapi target diambil dari
 *  Kurikulum (Juz per semester), bukan pedoman statis.
 *
 *  ⚠️ Urutan Juz TIDAK monoton naik: kelas 4 semester 1 = Juz 30 (mulai
 *  dari Juz Amma dulu, umum di TPQ), semester 2 LONCAT ke Juz 1 & 2,
 *  baru dari situ naik berurutan sampai Juz 29 di kelas 9 semester 2
 *  (dicek ke SEMUA baris produksi kelas 4-9). Makanya keanggotaan
 *  rentang (bukan cuma "lebih besar/kecil") dicek DULU sebelum jatuh ke
 *  perbandingan angka -- supaya santri kelas 4 semester 2 yang masih di
 *  Juz 30 (blm mulai materi baru) tidak salah dibaca "BSB" krn 30 > 2.
 *
 *    BSH  Juz santri di dalam rentang target semester INI
 *    MB   Juz santri PERSIS di rentang target semester LALU (kelas yg
 *         sama) -- msh menuntaskan/mengulang materi sblm loncat semester
 *    BSB  di luar keduanya & lebih tinggi drpd target semester ini
 *    BB   di luar keduanya & tidak lebih tinggi (jauh di belakang)
 *  null kalau tak ada catatan / target semester ini belum diisi. */
export function statusPencapaianAlquran(
  posisiJuzSantri: number | null,
  juzSemesterIni: string | null,
  juzSemesterLalu: string | null,
): StatusPencapaian | null {
  if (posisiJuzSantri == null || !juzSemesterIni) return null;
  const rentangIni = uraikanAngkaJuz(juzSemesterIni);
  if (rentangIni.length === 0) return null;
  const awal = Math.min(...rentangIni);
  const akhir = Math.max(...rentangIni);
  if (posisiJuzSantri >= awal && posisiJuzSantri <= akhir) return 'BSH';

  const rentangLalu = juzSemesterLalu ? uraikanAngkaJuz(juzSemesterLalu) : [];
  if (rentangLalu.length > 0) {
    const awalLalu = Math.min(...rentangLalu);
    const akhirLalu = Math.max(...rentangLalu);
    if (posisiJuzSantri >= awalLalu && posisiJuzSantri <= akhirLalu) return 'MB';
  }

  if (posisiJuzSantri > akhir) return 'BSB';
  const akhirLalu = rentangLalu.length > 0 ? Math.max(...rentangLalu) : 0;
  return posisiJuzSantri >= akhirLalu ? 'MB' : 'BB';
}
