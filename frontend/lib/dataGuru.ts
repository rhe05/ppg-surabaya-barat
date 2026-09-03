/* Sumber data BERSAMA untuk layar-layar GURU — dibuat 2026-09-02 setelah
   audit permintaan jaringan (mula-mula utk tiga layar jurnal, lalu ikut
   dipakai Input & Riwayat Kehadiran; berkasnya sempat bernama
   dataJurnal.ts).

   Masalah yang diselesaikan: ketiga layar dulu mengambil datanya
   sendiri-sendiri, jadi satu siklus Rencana → Pelaksanaan → Riwayat
   menembakkan 9 permintaan yang 4 di antaranya mengambil ulang data yang
   baru saja tiba (daftar kelas 3x, materi bulan yang sama 3x). Sekarang
   ketiganya lewat sini dan berbagi satu singgahan.

   Tiga keputusan yang membuat singgahan ini aman:

   1. Yang disimpan adalah JANJI (Promise), bukan hasilnya. Dua layar yang
      meminta data sama dalam waktu bersamaan (mis. saat pindah tab)
      berbagi satu permintaan, bukan menembakkan dua.
   2. Umur singgahan pendek (60 detik) DAN dibuang paksa setiap kali ada
      penulisan lewat tandaiMateriBerubah(). Jadi data basi hanya mungkin
      muncul kalau orang LAIN mengubah data di detik yang sama — bukan
      dari perubahan guru itu sendiri.
   3. Kolom yang diambil adalah GABUNGAN kebutuhan tiga layar. Barisnya
      kecil (tabel jurnal_materi seluruhnya 112 kB saat audit), jadi satu
      query gemuk yang dipakai bertiga jauh lebih murah daripada tiga
      query ramping yang saling mengulang.

   Singgahan ini hidup di memori modul: hilang saat halaman dimuat ulang
   penuh, bertahan selama guru berpindah-pindah layar. Itu memang yang
   dibutuhkan — bukan pengganti basis data lokal. */

import { supabase } from '@/lib/supabase';
import { muatOverrideKelompok } from '@/lib/kalenderKelompok';

const UMUR_MS = 60_000;

type Entri = { janji: Promise<unknown>; waktu: number };
const singgahan = new Map<string, Entri>();

function ambil<T>(kunci: string, pengambil: () => Promise<T>): Promise<T> {
  const ada = singgahan.get(kunci);
  if (ada && Date.now() - ada.waktu < UMUR_MS) return ada.janji as Promise<T>;
  /* Janji yang gagal DIBUANG dari singgahan supaya percobaan berikutnya
     benar-benar menembak ulang -- kalau tidak, satu kegagalan jaringan
     akan "menempel" selama 60 detik. */
  const janji = pengambil().catch((e) => {
    singgahan.delete(kunci);
    throw e;
  });
  singgahan.set(kunci, { janji, waktu: Date.now() });
  return janji;
}

function buang(awalan: string) {
  for (const kunci of [...singgahan.keys()]) {
    if (kunci.startsWith(awalan)) singgahan.delete(kunci);
  }
}

/* Kolomnya GABUNGAN kebutuhan semua layar guru: jurnal cuma perlu
   id/nama/jam_mulai, Input Kehadiran perlu ruangan, jam_selesai,
   santri_count & kategori utk kartu pilih kelas. Satu query gemuk yang
   dipakai berlima tetap lebih murah daripada dua query ramping yang
   saling mengulang. */
export type KelasJurnal = {
  id: number;
  nama: string;
  ruangan: string | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  santri_count: number | null;
  kategori_kbm: { nama: string } | { nama: string }[] | null;
};

/** Daftar kelas yang diampu seorang guru. Dipakai semua layar guru. */
export function muatKelasGuru(guruId: number): Promise<KelasJurnal[]> {
  return ambil(`kelas:${guruId}`, async () => {
    const { data, error } = await supabase
      .from('kelas')
      .select('id, nama, ruangan, jam_mulai, jam_selesai, santri_count, kategori_kbm(nama)')
      .eq('guru_id', guruId)
      .is('deleted_at', null)
      .order('nama');
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as KelasJurnal[];
  });
}

/* Kutipan harian: dulu SELURUH tabel ditarik tiap kali layar Input
   Kehadiran dibuka, padahal isinya cuma dipakai di popup SETELAH absen
   berhasil disimpan — guru yang membuka layar lalu keluar membayar
   permintaan itu percuma (audit kehadiran, temuan 04). Sekarang
   disinggahkan dan dipanggil saat dibutuhkan. */
export function muatQuoteHarian(): Promise<string[]> {
  return ambil('quote', async () => {
    const { data, error } = await supabase.from('quote_harian').select('teks');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.teks as string).filter(Boolean);
  });
}

export type MateriJurnal = {
  id: number;
  /* Penanda versi baris. Dikirim balik saat menyimpan supaya Postgres
     menolak penulisan kalau baris ini sudah diubah sesi lain sejak layar
     memuatnya -- pola yang sama dengan absensi (lihat AbsensiRow di
     app/absensi/page.tsx). Ditambahkan 2026-09-02: sebelumnya materi
     jurnal SATU-SATUNYA tulisan guru yang bisa saling menimpa diam-diam,
     dan itu terjadi persis saat dua guru berbagi kelas lewat kelas
     pinjam. */
  updated_at: string;
  minggu_ke: number;
  judul: string;
  status: 'belum' | 'disampaikan';
  jenis: string;
  catatan: string | null;
  pertemuan_ke: string | null;
  pengingat_aktif: boolean | null;
  tanggal_rencana: string | null;
  tanggal_disampaikan: string | null;
  klasikal_hafalan_surat: string | null;
  klasikal_hafalan_doa: string | null;
};

/** Seluruh materi satu kelas dalam satu bulan (semua minggu sekaligus). */
export function muatMateriBulan(kelasId: number, tahun: number, bulan: number): Promise<MateriJurnal[]> {
  return ambil(`materi:${kelasId}:${tahun}:${bulan}`, async () => {
    const { data, error } = await supabase
      .from('jurnal_materi')
      .select(
        'id, minggu_ke, judul, status, jenis, catatan, pertemuan_ke, pengingat_aktif, tanggal_rencana, tanggal_disampaikan, klasikal_hafalan_surat, klasikal_hafalan_doa, updated_at'
      )
      .eq('kelas_id', kelasId)
      .eq('tahun', tahun)
      .eq('bulan', bulan)
      .is('deleted_at', null)
      .order('minggu_ke', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MateriJurnal[];
  });
}

/** WAJIB dipanggil setiap kali materi ditulis/diubah/dihapus. */
export function tandaiMateriBerubah(kelasId: number, tahun: number, bulan: number) {
  buang(`materi:${kelasId}:${tahun}:${bulan}`);
}

/* Dipakai tarik-untuk-segarkan: guru menarik layar justru KARENA ia
   curiga datanya sudah basi (mis. rekannya baru mengubah jadwal), jadi
   seluruh singgahan dibuang -- termasuk daftar kelas & kurikulum, bukan
   cuma materi bulan yang sedang dilihat. */
export function buangSemuaSinggahan() {
  singgahan.clear();
}

/* Kalender pengecualian kelompok (libur mendadak / tetap masuk di tanggal
   merah). Tabelnya MUNGIL — 3 baris saat audit — tapi dulu ditembak ulang
   tiap kali guru mengganti bulan di Dashboard, tiap kali membuat Laporan,
   dan sekali lagi di Riwayat Kehadiran. Isinya nyaris tidak pernah
   berubah, jadi paling pas disinggahkan.

   Sengaja membungkus muatOverrideKelompok dari lib/kalenderKelompok.ts,
   bukan menyalin querynya: layar admin memakai fungsi asli itu dan tidak
   ikut berubah. */
export function muatKalenderKelompok(kelompokId: number) {
  return ambil(`kalender:${kelompokId}`, () => muatOverrideKelompok(kelompokId));
}

export type ProtaBaris = {
  kelas: string | null;
  target: string | null;
  target2: string | null;
  kategori_kbm: { nama: string } | { nama: string }[] | null;
};

/* Kurikulum satu kelompok untuk satu tahun. Rencana Pembelajaran dulu
   memanggil tabel ini DUA KALI lewat dua efek terpisah -- sekali untuk
   saran "Materi Ngaji", sekali untuk daftar Hafalan Surat -- dan yang
   kedua ikut `kelasId` di daftar ketergantungannya sehingga menembak
   ulang setiap kali guru mengetuk chip kelas. Padahal kurikulum adalah
   data BERSAMA yang nyaris tidak pernah berubah dan cuma ±130 baris:
   diambil sekali, disaring di aplikasi. */
export function muatProtaKelompok(kelompokId: number, tahun: number): Promise<ProtaBaris[]> {
  return ambil(`prota:${kelompokId}:${tahun}`, async () => {
    const { data, error } = await supabase
      .from('kurikulum_prota')
      .select('kelas, target, target2, kategori_kbm(nama)')
      .eq('kelompok_id', kelompokId)
      .eq('tahun', tahun);
    if (error) throw new Error(error.message);
    return (data ?? []) as ProtaBaris[];
  });
}

/** Nama kategori materi dari satu baris Prota (bentuk tersemat PostgREST). */
export function namaKategori(v: ProtaBaris['kategori_kbm']): string | null {
  return (Array.isArray(v) ? v[0]?.nama : v?.nama) ?? null;
}

/* ── Pengulangan Hafalan Surat (2026-09-02, migrasi 20260902150000) ─────
   Dua RPC ini SENGAJA TIDAK lewat singgahan `ambil()` di atas: angkanya
   berubah tiap kali guru menandai materi Klasikal "disampaikan" di
   Pelaksanaan, dan layar ini bukan jalur panas yang berpindah-pindah
   cepat spt kelas/kurikulum -- lebih aman memanggil langsung drpd
   menambah satu jalur invalidasi lagi yang bisa lupa dipanggil. */

export type PengulanganKelas = { nama_surat: string; jumlah: number; terakhir: string };

/** "Surat ini sudah diulang berapa kali" utk satu kelas, satu rentang. */
export async function muatPengulanganKelas(
  kelasId: number,
  awal: string,
  akhir: string
): Promise<PengulanganKelas[]> {
  const { data, error } = await supabase.rpc('jurnal_pengulangan_kelas', {
    p_kelas_id: kelasId,
    p_awal: awal,
    p_akhir: akhir,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PengulanganKelas[];
}

export type PengulanganKelasDoa = { nama_doa: string; jumlah: number; terakhir: string };

/** "Do'a ini sudah diulang berapa kali" utk satu kelas, satu rentang --
 *  kembar dari muatPengulanganKelas (surat). Migrasi 20260903110000. */
export async function muatPengulanganKelasDoa(
  kelasId: number,
  awal: string,
  akhir: string
): Promise<PengulanganKelasDoa[]> {
  const { data, error } = await supabase.rpc('jurnal_pengulangan_kelas_doa', {
    p_kelas_id: kelasId,
    p_awal: awal,
    p_akhir: akhir,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PengulanganKelasDoa[];
}

export type PengulanganSantri = {
  santri_id: number;
  nama_santri: string;
  nama_surat: string;
  jumlah_efektif: number;
  jumlah_kelas: number;
};

/** Per santri, per surat: berapa kali santri itu HADIR saat surat itu
 * diulang, dari total pengulangan kelasnya (jumlah_kelas = penyebut,
 * WAJIB ditampilkan bersama -- lihat komentar RPC-nya di migrasi). */
export async function muatPengulanganSantri(
  kelasId: number,
  awal: string,
  akhir: string
): Promise<PengulanganSantri[]> {
  const { data, error } = await supabase.rpc('jurnal_pengulangan_santri', {
    p_kelas_id: kelasId,
    p_awal: awal,
    p_akhir: akhir,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as PengulanganSantri[];
}
