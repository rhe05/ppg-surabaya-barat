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
