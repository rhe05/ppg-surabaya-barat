/* Pembagian minggu dalam bulan utk fitur Jurnal Mengajar (Rencana/
   Pelaksanaan/Riwayat Pembelajaran).

   ATURAN BARU 2026-09-02 (diminta owner) — minggu MENGIKUTI HARI SENIN,
   bukan blok kalender tetap 1-7/8-14/dst seperti sebelumnya. Keluhan
   owner konkret: September 2026 mulai hari Selasa, dan aturan lama
   membuat "Minggu 1 = 1 s/d 7" yaitu Selasa s/d SENIN — satu minggu
   memuat dua hari Senin yang beda pekan. Sekarang Senin SELALU membuka
   minggu baru, jadi Minggu 1 = Selasa 1 s/d Jumat 4, dan Senin tanggal 7
   masuk Minggu 2.

   Tiga hal yang membuat aturan ini tetap muat di kolom `minggu_ke`
   (CHECK 1..5 di jurnal_materi, TIDAK diubah):

   1. Sisa hari di AWAL bulan sebelum Senin pertama jadi Minggu 1 -- TAPI
      hanya kalau di dalamnya ada hari sekolah (Senin-Jumat). Bulan yang
      mulai Sabtu/Minggu (mis. Agustus 2026) tidak punya KBM di dua hari
      itu, jadi keduanya IKUT bergabung ke Minggu 1 bersama pekan Senin
      pertama; tanpa aturan ini bulan seperti itu butuh 6 kotak minggu.
   2. Sisa hari di AKHIR bulan ikut Minggu 5 (tidak pernah jadi minggu
      ke-6).
   3. Hasilnya tidak pernah lebih dari 5 minggu untuk bulan mana pun --
      dibuktikan lewat tools/uji-minggu-bulan.mjs (menguji 12 bulan x 8
      tahun, plus tiap tanggal harus jatuh di rentang minggunya sendiri).

   Beda dari iaRiwayatBucketMinggu_ (app/absensi/riwayat/page.tsx) yang
   memang sudah dihitung dari hari Senin utk matrix kehadiran harian --
   sekarang keduanya sepaham. */

/** Hari pertama (tanggal) yang jatuh Senin di bulan itu. */
function seninPertama(tahun: number, bulan: number) {
  const hariPertama = new Date(tahun, bulan - 1, 1).getDay(); // 0=Minggu
  /* Selisih hari menuju Senin: Minggu(0)->1, Senin(1)->0, Selasa(2)->6, ... */
  const maju = (8 - hariPertama) % 7;
  return 1 + maju;
}

/** Apakah kepala bulan (sebelum Senin pertama) memuat hari sekolah?
    Kalau TIDAK (bulan mulai Sabtu/Minggu), dua hari itu ikut Minggu 1
    bersama pekan Senin pertama -- bukan jadi kotak minggu sendiri, yang
    akan membuat bulan itu butuh 6 kotak. */
function kepalaPunyaHariSekolah(tahun: number, bulan: number) {
  const senin = seninPertama(tahun, bulan);
  for (let d = 1; d < senin; d++) {
    const hari = new Date(tahun, bulan - 1, d).getDay();
    if (hari !== 0 && hari !== 6) return true;
  }
  return false;
}

export function rentangMinggu(tahun: number, bulan: number, mingguKe: number) {
  const hariTerakhirBulan = new Date(tahun, bulan, 0).getDate();
  const senin = seninPertama(tahun, bulan);
  const berkepala = kepalaPunyaHariSekolah(tahun, bulan);

  /* Dua bentuk bulan:
     - BERKEPALA (mis. September 2026 yang mulai Selasa): Minggu 1 =
       tanggal 1 s/d sehari sebelum Senin pertama, Minggu N>=2 mulai di
       Senin ke-(N-1).
     - TANPA kepala (mulai Senin, atau mulai Sabtu/Minggu): Minggu 1
       mulai tanggal 1 dan berakhir di Minggu (hari) pekan Senin pertama. */
  const awal = berkepala
    ? mingguKe === 1
      ? 1
      : senin + (mingguKe - 2) * 7
    : mingguKe === 1
      ? 1
      : senin + (mingguKe - 1) * 7;
  if (awal > hariTerakhirBulan) return null;
  let akhir: number;
  if (mingguKe === 1) akhir = berkepala ? senin - 1 : senin + 6;
  else akhir = awal + 6;
  if (mingguKe === 5) akhir = hariTerakhirBulan; // sisa akhir bulan ikut minggu 5
  return { awal, akhir: Math.min(akhir, hariTerakhirBulan) };
}

export function mingguKeDariTanggal(tanggal: Date) {
  const tahun = tanggal.getFullYear();
  const bulan = tanggal.getMonth() + 1;
  const d = tanggal.getDate();
  const senin = seninPertama(tahun, bulan);
  const berkepala = kepalaPunyaHariSekolah(tahun, bulan);
  if (berkepala) {
    if (d < senin) return 1;
    return Math.min(5, 2 + Math.floor((d - senin) / 7));
  }
  return Math.min(5, 1 + Math.floor(Math.max(0, d - senin) / 7));
}

/* Label rentang HANYA menyebut hari sekolah (Senin-Jumat) di dalam
   minggu itu -- inti permintaan owner: Minggu 1 September 2026 dibaca
   "1 - 4 September" (Selasa-Jumat), bukan "1 - 6" yang menyeret
   Sabtu-Minggu tanpa KBM. Kalau seluruh minggu itu kebetulan tanpa hari
   sekolah, rentang mentahnya dipakai apa adanya drpd mengembalikan
   string kosong. */
export function labelRentangMinggu(tahun: number, bulan: number, mingguKe: number, namaBulan: string[]) {
  const r = rentangMinggu(tahun, bulan, mingguKe);
  if (!r) return '';
  let awal: number | null = null;
  let akhir: number | null = null;
  for (let d = r.awal; d <= r.akhir; d++) {
    const hari = new Date(tahun, bulan - 1, d).getDay();
    if (hari === 0 || hari === 6) continue;
    if (awal === null) awal = d;
    akhir = d;
  }
  const a = awal ?? r.awal;
  const b = akhir ?? r.akhir;
  return `${a} – ${b} ${namaBulan[bulan - 1]} ${tahun}`;
}
