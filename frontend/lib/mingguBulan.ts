/* Pembagian minggu dalam bulan utk fitur Jurnal Mengajar (Rencana/
   Pelaksanaan/Riwayat Pembelajaran) — rentang tanggal TETAP (1-7, 8-14,
   15-21, 22-28, 29-akhir bulan = minggu 1-5), BUKAN diturunkan dari hari
   KBM sungguhan di jadwal_kbm. Lihat catatan lengkap di migrasi
   20260820120000_jurnal_materi_rencana.sql -- levelnya perencanaan
   bulanan kasar, bukan tanggal presisi, jadi pembagian kalender sederhana
   sudah cukup. Beda dari iaRiwayatBucketMinggu_ (app/absensi/riwayat/
   page.tsx, dihitung dari hari Senin) -- itu utk matrix kehadiran harian
   presisi, kebutuhannya beda. */

export function rentangMinggu(tahun: number, bulan: number, mingguKe: number) {
  const hariTerakhirBulan = new Date(tahun, bulan, 0).getDate();
  const awal = (mingguKe - 1) * 7 + 1;
  if (awal > hariTerakhirBulan) return null;
  const akhir = Math.min(mingguKe * 7, hariTerakhirBulan);
  return { awal, akhir };
}

export function mingguKeDariTanggal(tanggal: Date) {
  return Math.min(5, Math.ceil(tanggal.getDate() / 7));
}

export function labelRentangMinggu(tahun: number, bulan: number, mingguKe: number, namaBulan: string[]) {
  const r = rentangMinggu(tahun, bulan, mingguKe);
  if (!r) return '';
  return `${r.awal} – ${r.akhir} ${namaBulan[bulan - 1]} ${tahun}`;
}
