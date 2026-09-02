/* Sumber data BERSAMA untuk tiga layar jurnal guru (Rencana, Pelaksanaan,
   Riwayat) — dibuat 2026-09-02 setelah audit permintaan jaringan.

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

export type KelasJurnal = { id: number; nama: string; jam_mulai: string | null };

/** Daftar kelas yang diampu seorang guru. Dipakai ketiga layar jurnal. */
export function muatKelasGuru(guruId: number): Promise<KelasJurnal[]> {
  return ambil(`kelas:${guruId}`, async () => {
    const { data, error } = await supabase
      .from('kelas')
      .select('id, nama, jam_mulai')
      .eq('guru_id', guruId)
      .is('deleted_at', null)
      .order('nama');
    if (error) throw new Error(error.message);
    return (data ?? []) as KelasJurnal[];
  });
}

export type MateriJurnal = {
  id: number;
  minggu_ke: number;
  judul: string;
  status: 'belum' | 'disampaikan';
  jenis: string;
  catatan: string | null;
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
        'id, minggu_ke, judul, status, jenis, catatan, tanggal_rencana, tanggal_disampaikan, klasikal_hafalan_surat, klasikal_hafalan_doa'
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
