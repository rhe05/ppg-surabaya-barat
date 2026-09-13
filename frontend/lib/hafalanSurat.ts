/* Penguraian teks Prota "Hafalan Surat-Surat Al-Qur'an" jadi daftar surat
   satu per satu — dipakai borang Tambah Materi Klasikal di Rencana
   Pembelajaran (guru mobile).

   Dipindah ke lib/ dari RencanaPembelajaranView.tsx (2026-09-02) supaya
   bisa diuji langsung terhadap teks Prota SUNGGUHAN di produksi lewat
   skrip Node (tools/uji-hafalan-surat.mjs) — sebelumnya logika ini
   terkunci di dalam komponen klien dan cuma bisa dicek dengan mata.
   Perilakunya sengaja dipertahankan sama, kecuali perbaikan yang memang
   diminta owner 2026-09-02: baris "Menambah hafalan Surat X s/d Surat Y"
   dulu TIDAK terurai (muncul utuh satu baris panjang, lihat tangkapan
   layar owner) karena awalan "Menambah hafalan" membuat nama suratnya
   tidak dikenali. */

import { supabase } from './supabase';

/* Urutan Juz 'Amma standar (surah 78-114), urutan Mushaf MENAIK
   (An-Naba' dulu, An-Nas terakhir) -- dipakai menguraikan baris rentang
   "X s/d Y" jadi surat satu per satu (diminta owner 2026-08-23). Rentang
   di kurikulum ini SELALU ditulis MUNDUR dari nomor surat besar ke kecil
   (dicek persis ke semua baris "Hafalan Surat-Surat Al-Qur'an" yg ada di
   produksi -- bukan tebakan, mis. "Al-Kautsar(108) s/d Quraisy(106)",
   "Al-Fiil(105) s/d Al-'Asr(103)", dst -- semuanya kontinu tanpa
   lompatan). Ejaan baku dipakai sbg OUTPUT (bukan ejaan mentah di data,
   yg kadang typo -- lihat ALIAS_SURAT). */
export const JUZ_AMMA_URUT = [
  "An-Naba'", "An-Nazi'at", "'Abasa", 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin',
  'Al-Insyiqaq', 'Al-Buruj', 'At-Tariq', "Al-A'la", 'Al-Ghasyiyah', 'Al-Fajr',
  'Al-Balad', 'Asy-Syams', 'Al-Lail', 'Ad-Dhuha', 'Al-Insyirah', 'At-Tin',
  "Al-'Alaq", 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', "Al-'Adiyat", "Al-Qari'ah",
  'At-Takatsur', "Al-'Asr", 'Al-Humazah', 'Al-Fiil', 'Quraisy', "Al-Ma'un",
  'Al-Kautsar', 'Al-Kafirun', 'An-Nasr', 'Al-Lahab', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
];

/* Ejaan yg PERSIS muncul di data produksi tapi beda dari ejaan baku di
   atas (dicek langsung ke SEMUA baris Prota kategori ini, bukan tebakan)
   -- dipetakan ke ejaan baku spy tetap kena walau sumbernya typo/variasi
   lama. Key SUDAH dinormalisasi lewat normalisasiNamaSurat(). Rombongan
   kedua (2026-09-02) datang dari kelas 3-8 yang dulu tidak pernah benar2
   terurai, jadi typo-nya tidak pernah ketahuan. */
const ALIAS_SURAT: Record<string, string> = {
  quraisyh: 'Quraisy',
  alasyr: "Al-'Asr",
  alqoriah: "Al-Qari'ah",
  alzalzalah: 'Az-Zalzalah',
  annass: 'An-Nas',
  alqodr: 'Al-Qadr',
  atthiin: 'At-Tin',
  assharh: 'Al-Insyirah',
  asysyamsi: 'Asy-Syams',
  alghosiyah: 'Al-Ghasyiyah',
  atthoriq: 'At-Tariq',
  aththoriq: 'At-Tariq',
  alinsyiqoq: 'Al-Insyiqaq',
  almuthofifin: 'Al-Mutaffifin',
};

export function normalisasiNamaSurat(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const INDEKS_JUZ_AMMA = new Map<string, number>(
  JUZ_AMMA_URUT.map((nama, i) => [normalisasiNamaSurat(nama), i])
);

function cariIndeksSurat(namaMentah: string): number | null {
  const bersih = namaMentah.trim().replace(/^surat\s+|^surah\s+/i, '');
  const kunci = normalisasiNamaSurat(bersih);
  const alias = ALIAS_SURAT[kunci];
  if (alias) return INDEKS_JUZ_AMMA.get(normalisasiNamaSurat(alias)) ?? null;
  return INDEKS_JUZ_AMMA.get(kunci) ?? null;
}

/* Pecah target/target2 Prota jadi baris lepas. Bentuk yang ada di
   produksi: baris bernomor ("1. A\n2. B") dan — mulai kelas 10 — baris
   bernomor yang punya BUTIR bertanda "-" di bawahnya.

   Baris yg mengandung "menjaga hafalan" dibuang: itu materi PENGULANGAN,
   bukan materi baru, diminta owner dikecualikan dari pilihan klasikal.
   Butir "-" MEWARISI keputusan itu dari baris induknya, jadi butir di
   bawah "2. Menjaga hafalan surat-surat pilihan :" (kelas 10) ikut
   dibuang — tanpa pewarisan, ketiga butirnya lolos jadi pilihan padahal
   isinya hafalan lama. */
export function barisHafalanDariTeks(teks: string | null): string[] {
  if (!teks) return [];
  const hasil: string[] = [];
  let indukDilewati = false;
  for (const mentah of teks.split('\n')) {
    const baris = mentah.trim();
    if (baris === '') continue;
    const adalahButir = /^[-•*]/.test(baris);
    const isi = baris.replace(/^\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim();
    if (isi === '') continue;
    const materiLama = /menjaga hafalan/i.test(isi);
    if (!adalahButir) indukDilewati = materiLama;
    if (materiLama || (adalahButir && indukDilewati)) continue;
    hasil.push(isi);
  }
  return hasil;
}

/* Buang awalan kata kerja spy yang tersisa MURNI nama suratnya. Ini
   perbaikan inti 2026-09-02: hampir semua baris materi baru di kelas 1-9
   berbentuk "Menambah hafalan Surat X s/d Surat Y", dan awalan itulah yg
   dulu membuat cariIndeksSurat gagal → seluruh barisnya tampil apa
   adanya sbg SATU pilihan panjang, bukan per surat.

   Kelas 7-12 punya bentuk lain: "Menambah hafalan surat-surat pilihan
   (surat Al-Mulk ayat 1-12)". Itu bukan rentang Juz 'Amma, jadi tidak
   bisa diurai; isi kurungnya saja yang diambil supaya labelnya tetap
   menyebut satu surat, bukan kalimat pembungkusnya. */
export function bersihkanAwalanMateri(baris: string): string {
  let s = baris.trim().replace(/^(menambah|menghafal|hafal)\s+/i, '');
  s = s.replace(/^hafalan\s+/i, '');
  /* "surat-surat", "surat - surat", "surat surat" -- ketiganya ada di
     produksi (kelas 8 memakai spasi di kiri-kanan tanda hubung). */
  const pilihan = s.match(/^surat\s*[-–]?\s*surat\s+pilihan\s*:?\s*\((.+)\)\s*$/i);
  if (pilihan) return pilihan[1].trim();
  return s.trim();
}

/* Uraikan satu baris "X s/d Y" jadi surat satu per satu (diminta owner
   2026-08-23, contoh dari owner: "Al-Fatihah s/d Al-Ikhlas" -> Al-
   Fatihah, An-Nas, Al-Falaq, Al-Ikhlas). Kasus khusus "Al-Fatihah s/d
   Y": Al-Fatihah bukan bagian Juz 'Amma & selalu diajarkan terpisah di
   awal, jadi diuraikan jadi [Al-Fatihah, ...An-Nas s.d. Y] (An-Nas =
   awal urutan hafalan juz 'amma, sesuai contoh owner). Baris tanpa
   "s/d" (satu surat saja) dikembalikan sbg ejaan BAKU-nya kalau
   dikenali, spy tidak muncul dua kali dgn ejaan berbeda saat kelas lain
   menyebut surat yg sama. Kalau salah satu ujungnya TIDAK dikenali
   (typo baru yg belum ada di ALIAS_SURAT, atau memang bukan surat Juz
   'Amma spt "Al-Baqoroh ayat 1-4"), baris dikembalikan utuh -- tidak
   didiamkan hilang. */
export function uraikanBarisHafalan(barisMentah: string): string[] {
  const barisAsli = bersihkanAwalanMateri(barisMentah);
  const bersihkan = (s: string) => s.trim().replace(/^surat\s+|^surah\s+/i, '');
  /* Baris yang tidak dikenali dikembalikan apa adanya, cuma huruf
     pertamanya dibesarkan -- di produksi ada "surat al-Mulk ayat 1-12"
     (huruf kecil) yang kalau dibiarkan tampil berdampingan dgn nama
     surat lain yg berhuruf besar. */
  const besarkanAwal = (s: string) => (s === '' ? s : s[0].toUpperCase() + s.slice(1));
  const bagian = barisAsli.split(/\s+s\/d\s+/i);
  if (bagian.length !== 2) {
    const satu = bersihkan(barisAsli);
    const idx = cariIndeksSurat(satu);
    return [idx !== null ? JUZ_AMMA_URUT[idx] : besarkanAwal(satu)];
  }

  const namaA = bersihkan(bagian[0]);
  const namaB = bersihkan(bagian[1]);

  if (normalisasiNamaSurat(namaA) === 'alfatihah') {
    const idxNas = INDEKS_JUZ_AMMA.get(normalisasiNamaSurat('An-Nas'))!;
    const idxB = cariIndeksSurat(namaB);
    if (idxB === null) return [besarkanAwal(bersihkan(barisAsli))];
    const rentang =
      idxNas <= idxB ? JUZ_AMMA_URUT.slice(idxNas, idxB + 1) : JUZ_AMMA_URUT.slice(idxB, idxNas + 1).reverse();
    return ['Al-Fatihah', ...rentang];
  }

  const idxA = cariIndeksSurat(namaA);
  const idxB = cariIndeksSurat(namaB);
  if (idxA === null || idxB === null) return [besarkanAwal(bersihkan(barisAsli))];
  return idxA <= idxB ? JUZ_AMMA_URUT.slice(idxA, idxB + 1) : JUZ_AMMA_URUT.slice(idxB, idxA + 1).reverse();
}

/** Semua surat materi BARU dari satu kolom target/target2 Prota. */
export function suratDariTargetProta(teks: string | null): string[] {
  return barisHafalanDariTeks(teks).flatMap(uraikanBarisHafalan);
}

/* ── Laporan Hafalan Surat per santri (2026-09-13, diminta owner: tampilkan
   di Riwayat Pembelajaran) -- kembar dari muatTilawatiRingkas (lib/
   tilawati.ts), tabel beda: `hafalan_surat_pelaksanaan` (migrasi
   20260913110000/120000), kolom surat/ayat bukan jilid/halaman. */

export type HafalanSuratStatus = 'naik' | 'tetap';

export type HafalanSuratHari = {
  id: number;
  tanggal: string;
  surat: string | null;
  ayat: string | null;
  status: HafalanSuratStatus | '';
};

export type HafalanSuratRingkas = {
  santriId: number;
  nama: string;
  naik: number;
  tetap: number;
  terakhir: string;
  terakhirStatus: HafalanSuratStatus | '';
  terakhirSurat: string | null;
  terakhirAyat: string | null;
  hari: HafalanSuratHari[];
};

type BarisHafalanSuratMentah = {
  id: number;
  santri_id: number;
  tanggal: string;
  status: string | null;
  surat: string | null;
  ayat: string | null;
  santri: { nama: string } | { nama: string }[] | null;
};

/** Per santri: jumlah "Naik" & "Tetap" di rentang + surat/ayat/status
 *  terakhir. Hanya santri yang punya minimal satu catatan naik/tetap. */
export async function muatHafalanSuratRingkas(
  kelasId: number,
  awal: string,
  akhir: string,
): Promise<HafalanSuratRingkas[]> {
  const { data, error } = await supabase
    .from('hafalan_surat_pelaksanaan')
    .select('id, santri_id, tanggal, status, surat, ayat, santri:santri_id(nama)')
    .eq('kelas_id', kelasId)
    .in('status', ['naik', 'tetap'])
    .gte('tanggal', awal)
    .lte('tanggal', akhir)
    .order('tanggal', { ascending: true });
  if (error) throw new Error(error.message);

  const peta = new Map<number, HafalanSuratRingkas>();
  for (const r of (data ?? []) as BarisHafalanSuratMentah[]) {
    const nama = (Array.isArray(r.santri) ? r.santri[0]?.nama : r.santri?.nama) ?? '—';
    const cur =
      peta.get(r.santri_id) ??
      {
        santriId: r.santri_id,
        nama,
        naik: 0,
        tetap: 0,
        terakhir: '',
        terakhirStatus: '' as const,
        terakhirSurat: null,
        terakhirAyat: null,
        hari: [] as HafalanSuratHari[],
      };
    const st = (r.status === 'naik' || r.status === 'tetap' ? r.status : '') as HafalanSuratStatus | '';
    if (st === 'naik') cur.naik += 1;
    else if (st === 'tetap') cur.tetap += 1;
    cur.hari.push({ id: r.id, tanggal: r.tanggal, surat: r.surat, ayat: r.ayat, status: st });
    if (r.tanggal >= cur.terakhir) {
      cur.terakhir = r.tanggal;
      cur.terakhirStatus = st;
      cur.terakhirSurat = r.surat;
      cur.terakhirAyat = r.ayat;
    }
    peta.set(r.santri_id, cur);
  }
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/* ── SEMUA santri kelas (2026-09-13, diminta owner: tampilkan jg di
   Laporan Perkembangan Santri, admin desktop) -- kembar dari
   muatBukuJilidKelas (lib/tilawati.ts): beda dari muatHafalanSuratRingkas
   di atas, ini menyertakan santri yang BELUM punya catatan sama sekali
   (baris "Belum ada catatan"), dipakai tabel Nama/Pencapaian/Keterangan
   yang sama polanya dgn "Materi Ngaji" di laporan itu. */
export type HafalanSuratSantri = {
  santriId: number;
  nama: string;
  naik: number;
  tetap: number;
  terakhirSurat: string | null;
  terakhirAyat: string | null;
  adaCatatan: boolean;
};

export async function muatHafalanSuratKelas(
  kelasId: number,
  awal: string,
  akhir: string,
): Promise<HafalanSuratSantri[]> {
  const [sRes, hRes] = await Promise.all([
    supabase
      .from('santri')
      .select('id, nama, nama_panggilan')
      .eq('kelas_id', kelasId)
      .is('deleted_at', null)
      .order('nama'),
    supabase
      .from('hafalan_surat_pelaksanaan')
      .select('santri_id, tanggal, status, surat, ayat')
      .eq('kelas_id', kelasId)
      .gte('tanggal', awal)
      .lte('tanggal', akhir)
      .order('tanggal', { ascending: true }),
  ]);
  if (sRes.error) throw new Error(sRes.error.message);
  if (hRes.error) throw new Error(hRes.error.message);

  const perSantri = new Map<
    number,
    { status: string | null; surat: string | null; ayat: string | null }[]
  >();
  for (const r of (hRes.data ?? []) as {
    santri_id: number;
    status: string | null;
    surat: string | null;
    ayat: string | null;
  }[]) {
    const arr = perSantri.get(r.santri_id) ?? [];
    arr.push({ status: r.status, surat: r.surat, ayat: r.ayat });
    perSantri.set(r.santri_id, arr);
  }

  return (
    (sRes.data ?? []) as { id: number; nama: string; nama_panggilan: string | null }[]
  ).map((s) => {
    const arr = perSantri.get(s.id) ?? [];
    const panggilan = s.nama_panggilan?.trim() || s.nama.trim().split(/\s+/)[0] || s.nama;
    let naik = 0;
    let tetap = 0;
    for (const r of arr) {
      if (r.status === 'naik') naik += 1;
      else if (r.status === 'tetap') tetap += 1;
    }
    const last = arr.length > 0 ? arr[arr.length - 1] : null;
    return {
      santriId: s.id,
      nama: panggilan,
      naik,
      tetap,
      terakhirSurat: last?.surat ?? null,
      terakhirAyat: last?.ayat ?? null,
      adaCatatan: arr.length > 0,
    };
  });
}
