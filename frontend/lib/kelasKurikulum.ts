/* Kode kelas Kurikulum ('PAUD-TK', '1'..'12') diturunkan dari NAMA RUANG
   guru ("1A", "Remaja SMA", dst) -- dua namespace terpisah tanpa kolom
   penghubung (lihat komentar panjang di RencanaPembelajaranView.tsx
   opsiMateriKurikulum). Awalnya cuma dipakai RencanaPembelajaranView.tsx
   (saran Materi Ngaji/Hafalan Surat/Hafalan Do'a); dipindah ke sini
   2026-09-12 supaya PelaksanaanPembelajaranView.tsx bisa pakai fungsi
   yang SAMA PERSIS utk menentukan kartu "Tilawati" (PAUD-TK s.d. 3) vs
   "Al-Qur'an" (kelas 4+), tanpa menyalin ulang & berisiko drift. */

export const KELAS_KURIKULUM_URUT = [
  'PAUD-TK', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
];
/* Ruang "Pra Remaja"/SMP berhenti di kelas 9, ruang SMA melanjutkan ke
   10-12 (diminta owner 2026-09-02). Dulu keduanya sama2 mentok di 9
   karena kelas 10-12 memang belum ada di Kurikulum. */
const BATAS_SMP = KELAS_KURIKULUM_URUT.indexOf('9') + 1;

/** Ruang guru "N" -> daftar kelas Kurikulum yang boleh disarankan,
    KUMULATIF PAUD-TK s.d. N. */
export function kelasTargetKumulatif(namaRuangRaw: string): string[] {
  const namaRuang = namaRuangRaw.toLowerCase();
  if (namaRuang.includes('paud')) return ['PAUD-TK'];
  if (namaRuang.includes('sma')) return KELAS_KURIKULUM_URUT;
  if (/remaja|smp/.test(namaRuang)) return KELAS_KURIKULUM_URUT.slice(0, BATAS_SMP);
  const angka = [...namaRuang.matchAll(/\d+/g)].map((m) => Number(m[0]));
  const batasAtas = angka.length > 0 ? Math.max(...angka) : 0;
  return KELAS_KURIKULUM_URUT.slice(0, batasAtas + 1);
}

/* ── Kartu "Tilawati" vs "Al-Qur'an" bercabang per ANGGOTA gabungan
   (2026-09-13, diminta owner: "dikarenakan gabungan dua kelas ...
   munculkan dua card, card Tilawati utk anak kelas 3, card Al-Qur'an
   utk anak kelas 4") -- SEBELUM Gabung Kelas, satu kelas fisik = satu
   grade = satu kartu (pakaiAlquran polos). Kelas GABUNGAN bisa memuat
   DUA grade sekaligus (mis. kelas 3 + Pra Remaja SMP), jadi keputusan
   "Tilawati atau Al-Qur'an" harus dihitung PER ANGGOTA fisik, bukan per
   grade tertinggi gabungan (yg akan salah memaksa SEMUA anak masuk
   kartu Al-Qur'an walau sebagian masih kelas 3). */
import { KELAS_LABEL_BACA_HURUF } from './kategori';

export function gradeRuangDari(namaRuang: string): string {
  return kelasTargetKumulatif(namaRuang).at(-1) ?? '';
}

export function pakaiAlquranUntukGrade(grade: string): boolean {
  return !KELAS_LABEL_BACA_HURUF.includes(grade);
}

/** Pisahkan anggota gabungan (id+nama kelas fisik) jadi dua kelompok
 *  kelas_id: yang masih Tilawati (grade PAUD-TK s.d. 3) & yang sudah
 *  Al-Qur'an (grade 4+). Kelas TANPA gabungan aktif selalu masuk SATU
 *  kelompok saja (anggotaDetail cuma berisi dirinya sendiri). */
export function pisahTilawatiAlquran(
  anggotaDetail: { id: number; nama: string }[],
): { tilawatiIds: number[]; alquranIds: number[] } {
  const tilawatiIds: number[] = [];
  const alquranIds: number[] = [];
  for (const a of anggotaDetail) {
    const grade = gradeRuangDari(a.nama);
    (pakaiAlquranUntukGrade(grade) ? alquranIds : tilawatiIds).push(a.id);
  }
  return { tilawatiIds, alquranIds };
}
