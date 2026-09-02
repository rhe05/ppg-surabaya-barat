/* Uji aturan pembagian minggu (lib/mingguBulan.ts) secara menyeluruh:
   12 bulan x 8 tahun, tiap tanggal dicek satu per satu.

   Jalankan: node tools/uji-minggu-bulan.mjs

   Empat hal yang WAJIB benar -- ketiganya pernah jadi jebakan nyata:
   1. Tidak pernah lebih dari 5 minggu. Kolom jurnal_materi.minggu_ke
      punya CHECK (1..5); aturan "Senin membuka minggu baru" yang naif
      menghasilkan 6 kotak untuk bulan yang mulai Sabtu.
   2. Tiap tanggal jatuh DI DALAM rentang minggunya sendiri --
      mingguKeDariTanggal() dan rentangMinggu() harus saling kebalikan,
      kalau tidak materi tersimpan di minggu yang labelnya beda.
   3. Rentang antar minggu tidak tumpang tindih & tidak berlubang.
   4. Tiap minggu (selain minggu yang memang cuma Sabtu/Minggu) diawali
      hari Senin, kecuali Minggu 1 yang boleh mulai di tengah pekan. */

import {
  rentangMinggu,
  mingguKeDariTanggal,
  labelRentangMinggu,
} from '../lib/mingguBulan.ts';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

let gagal = 0;
function salah(pesan) {
  console.log('  GAGAL: ' + pesan);
  gagal += 1;
}

for (let tahun = 2024; tahun <= 2031; tahun++) {
  for (let bulan = 1; bulan <= 12; bulan++) {
    const hariTerakhir = new Date(tahun, bulan, 0).getDate();
    const minggu = [1, 2, 3, 4, 5]
      .map((mk) => ({ mk, r: rentangMinggu(tahun, bulan, mk) }))
      .filter((x) => x.r !== null);

    // 1. maksimal 5 minggu (rentangMinggu memang cuma ditanya 1..5),
    //    dan minggu ke-6 tidak boleh dibutuhkan: hari terakhir bulan
    //    harus tercakup minggu terakhir.
    const terakhir = minggu[minggu.length - 1];
    if (terakhir.r.akhir !== hariTerakhir) {
      salah(`${NAMA_BULAN[bulan - 1]} ${tahun}: hari terakhir (${hariTerakhir}) tidak tercakup, minggu terakhir berhenti di ${terakhir.r.akhir}`);
    }

    // 3. sambung-menyambung tanpa lubang/tumpang tindih
    let harusMulai = minggu[0].r.awal;
    if (harusMulai !== 1) {
      const hariAwal = new Date(tahun, bulan - 1, 1).getDay();
      const kepalaAkhirPekan = [...Array(harusMulai - 1).keys()].every((i) => {
        const h = new Date(tahun, bulan - 1, i + 1).getDay();
        return h === 0 || h === 6;
      });
      if (!kepalaAkhirPekan) {
        salah(`${NAMA_BULAN[bulan - 1]} ${tahun}: mulai di tanggal ${harusMulai} padahal kepala bulan (${NAMA_HARI[hariAwal]}) ada hari sekolah`);
      }
    }
    for (const { mk, r } of minggu) {
      if (r.awal !== harusMulai) {
        salah(`${NAMA_BULAN[bulan - 1]} ${tahun} Minggu ${mk}: mulai ${r.awal}, seharusnya ${harusMulai}`);
      }
      harusMulai = r.akhir + 1;
      // 4. minggu >= 2 selalu diawali Senin
      if (mk >= 2 && new Date(tahun, bulan - 1, r.awal).getDay() !== 1) {
        salah(`${NAMA_BULAN[bulan - 1]} ${tahun} Minggu ${mk}: awalnya ${NAMA_HARI[new Date(tahun, bulan - 1, r.awal).getDay()]}, bukan Senin`);
      }
    }

    // 2. tiap tanggal jatuh di rentang minggunya sendiri
    for (let d = 1; d <= hariTerakhir; d++) {
      const mk = mingguKeDariTanggal(new Date(tahun, bulan - 1, d));
      const r = rentangMinggu(tahun, bulan, mk);
      if (!r || d < r.awal || d > r.akhir) {
        salah(`${d} ${NAMA_BULAN[bulan - 1]} ${tahun}: mingguKeDariTanggal=${mk}, rentangnya ${r ? `${r.awal}-${r.akhir}` : 'null'}`);
      }
    }
  }
}

console.log('\nContoh yang diminta owner (September 2026, mulai hari Selasa):');
for (const mk of [1, 2, 3, 4, 5]) {
  const r = rentangMinggu(2026, 9, mk);
  if (!r) continue;
  const hari = (d) => NAMA_HARI[new Date(2026, 8, d).getDay()];
  console.log(
    `  Minggu ${mk}: blok ${r.awal}-${r.akhir} (${hari(r.awal)}-${hari(r.akhir)}) -> label "${labelRentangMinggu(2026, 9, mk, NAMA_BULAN)}"`
  );
}
console.log(`  Senin 7 September masuk Minggu ${mingguKeDariTanggal(new Date(2026, 8, 7))}`);

console.log('\nAgustus 2026 (mulai hari Sabtu — kepala bulan tanpa hari sekolah):');
for (const mk of [1, 2, 3, 4, 5]) {
  const r = rentangMinggu(2026, 8, mk);
  if (!r) continue;
  console.log(`  Minggu ${mk}: blok ${r.awal}-${r.akhir} -> "${labelRentangMinggu(2026, 8, mk, NAMA_BULAN)}"`);
}

console.log('\n' + (gagal === 0 ? 'LULUS — 96 bulan diperiksa, tidak ada pelanggaran.' : `GAGAL: ${gagal} pelanggaran.`));
process.exitCode = gagal === 0 ? 0 : 1;
