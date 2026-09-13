/* Gabung kelas & gilir guru (2026-08-28, diminta owner) — dipakai
   komposer Pengumuman Jadwal KBM supaya apa yang diatur admin kelp di
   "Data Kelas" langsung terbaca di pengumuman.

   Migrasi 20260828200000: kelas.gilir_mulai/gilir_minggu,
   jadwal_kbm.kelas_id, dan tabel kelas_gabung. */

import { supabase } from './supabase';

export type KelasRingkas = {
  id: number;
  nama: string;
  guru_id: number | null;
  guru_id_2: number | null;
  gilir_mulai: string | null;
  gilir_minggu: number | null;
};

export type GabungKelas = {
  kelas_id: number;
  kelas_induk_id: number;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  catatan: string | null;
};

/* Siapa yang mengajar kelas ini pada tanggal tsb.

   Gilir baru dihitung kalau SEMUA syaratnya lengkap: ada guru kedua, ada
   tanggal mulai giliran, dan panjang giliran > 0. Kalau salah satu kosong
   -- termasuk kelas biasa yang cuma punya satu guru -- kembalikan guru
   utama apa adanya, JANGAN menebak.

   Tanggal sebelum `gilir_mulai` juga memakai guru utama: polanya belum
   berlaku saat itu, dan mengekstrapolasi ke belakang berisiko menampilkan
   nama yang salah di pengumuman lampau. */
export function guruGiliran(kelas: KelasRingkas, tanggal: string): number | null {
  const { guru_id, guru_id_2, gilir_mulai, gilir_minggu } = kelas;
  if (guru_id_2 == null || !gilir_mulai || !gilir_minggu || gilir_minggu < 1) return guru_id;

  const mulai = new Date(gilir_mulai + 'T00:00:00');
  const saat = new Date(tanggal + 'T00:00:00');
  const selisihHari = Math.floor((saat.getTime() - mulai.getTime()) / 86_400_000);
  if (selisihHari < 0) return guru_id;

  const panjang = 7 * gilir_minggu;
  const giliranKe = Math.floor(selisihHari / panjang);
  return giliranKe % 2 === 0 ? guru_id : guru_id_2;
}

export async function muatKelasRingkas(kelompokId: number): Promise<KelasRingkas[]> {
  const { data, error } = await supabase
    .from('kelas')
    .select('id, nama, guru_id, guru_id_2, gilir_mulai, gilir_minggu')
    .eq('kelompok_id', kelompokId)
    .is('deleted_at', null)
    .order('nama');
  if (error) throw new Error(error.message);
  return (data ?? []) as KelasRingkas[];
}

/* Penggabungan yang AKTIF pada satu tanggal. Key = kelas_id yang ikut
   bergabung (kelas yang "hilang" dari daftar sesi dan menempel ke
   induknya). `tanggal_selesai` NULL = tanpa batas waktu (migrasi
   20260913130000) -- WAJIB `.or(...is.null)`, krn `.gte()` polos di
   Postgres/PostgREST SELALU false thd NULL, jadi penggabungan tanpa
   batas tidak akan pernah terbaca aktif kalau cuma `.gte()`. */
export async function muatGabungAktif(
  kelompokId: number,
  tanggal: string,
): Promise<Map<number, GabungKelas>> {
  const { data, error } = await supabase
    .from('kelas_gabung')
    .select('kelas_id, kelas_induk_id, jam_mulai, jam_selesai, ruangan, catatan')
    .eq('kelompok_id', kelompokId)
    .lte('tanggal_mulai', tanggal)
    .or(`tanggal_selesai.gte.${tanggal},tanggal_selesai.is.null`);
  if (error) throw new Error(error.message);
  const peta = new Map<number, GabungKelas>();
  for (const g of (data ?? []) as GabungKelas[]) peta.set(g.kelas_id, g);
  return peta;
}

export type BarisGabung = {
  id: number;
  kelompok_id: number;
  kelas_id: number;
  kelas_induk_id: number;
  tanggal_mulai: string;
  /* null = tanpa batas waktu (migrasi 20260913130000). */
  tanggal_selesai: string | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  catatan: string | null;
};

export async function muatSemuaGabung(kelompokId: number): Promise<BarisGabung[]> {
  const { data, error } = await supabase
    .from('kelas_gabung')
    .select(
      'id, kelompok_id, kelas_id, kelas_induk_id, tanggal_mulai, tanggal_selesai, jam_mulai, jam_selesai, ruangan, catatan',
    )
    .eq('kelompok_id', kelompokId)
    .order('tanggal_mulai', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BarisGabung[];
}

export async function simpanGabung(
  kelompokId: number,
  isi: {
    kelas_id: number;
    kelas_induk_id: number;
    tanggal_mulai: string;
    tanggal_selesai: string | null;
    jam_mulai: string | null;
    jam_selesai: string | null;
    ruangan: string | null;
    catatan: string | null;
  },
  olehId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('kelas_gabung')
    .insert({ kelompok_id: kelompokId, ...isi, dibuat_oleh: olehId });
  if (error) throw new Error(error.message);
}

export async function hapusGabung(id: number): Promise<void> {
  const { error } = await supabase.from('kelas_gabung').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Terapkan Gabung Kelas ke layar OPERASIONAL guru (2026-09-13, diminta
   owner: "seumpama card ringkasan kehadiran jadi satu ... termasuk
   ketika input kehadiran ... jurnal ... monitoring ... laporan
   perkembangan santri"). BEDA dari muatGabungAktif di atas (dipakai
   Pengumuman, per-TANGGAL spesifik yang sedang dilihat) -- ini utk
   layar guru yang berpatokan ke HARI INI (guru login & memilih kelas
   memakai kondisi sekarang, bukan tanggal arbitrer).

   Dasar aksesnya: RLS jurnal_materi/tilawati_pelaksanaan/
   hafalan_surat_pelaksanaan sudah diperluas (migrasi 20260913140000,
   fungsi kelas_gabung_aktif_ke_guru) supaya guru kelas INDUK bisa
   baca/tulis data kelas yang digabung ke dia -- santri & absensi TIDAK
   perlu perluasan RLS (sudah longgar se-kelompok utk peran guru). */

export type GabungAktifRingkas = { kelas_id: number; kelas_induk_id: number };

function hariIniIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Semua penggabungan yang AKTIF HARI INI di satu kelompok (tanggal_selesai
 *  NULL = tanpa batas, dianggap aktif terus sampai dibatalkan). */
export async function muatGabunganAktifKelompok(kelompokId: number): Promise<GabungAktifRingkas[]> {
  const tgl = hariIniIso();
  const { data, error } = await supabase
    .from('kelas_gabung')
    .select('kelas_id, kelas_induk_id')
    .eq('kelompok_id', kelompokId)
    .lte('tanggal_mulai', tgl)
    .or(`tanggal_selesai.gte.${tgl},tanggal_selesai.is.null`);
  if (error) throw new Error(error.message);
  return (data ?? []) as GabungAktifRingkas[];
}

export type KelasBisaGabung = { id: number; nama: string; santri_count: number | null };
export type AnggotaGabung = { id: number; nama: string };
export type KelasTergabung<T> = T & {
  anggotaId: number[];
  /* id+NAMA ASLI tiap kelas fisik tergabung (2026-09-13, diminta owner:
     "gabungan dua kelas ... untuk anak kelas 3 di card Tilawati, anak
     kelas 4 di card Al-Qur'an") -- `nama` di objek gabungan sudah
     disambung " & ", jadi tidak bisa lagi dipakai menentukan grade per
     ANGGOTA; pakai anggotaDetail + lib/kelasKurikulum.ts
     `kelasTargetKumulatif` utk itu. Selalu berisi minimal diri sendiri,
     walau tidak sedang gabung. */
  anggotaDetail: AnggotaGabung[];
};

/** Terapkan penggabungan aktif ke daftar kelas seorang guru:
 *  - Kelas yang SEDANG digabung KE kelas lain (`kelas_id` di kelas_gabung)
 *    dilipat KELUAR dari daftar -- sama pola Pengumuman Jadwal KBM
 *    ("berhenti muncul sebagai sesi tersendiri, namanya menempel ke
 *    induk").
 *  - Kelas yang JADI INDUK dapat entri gabungan: nama disambung " & ",
 *    santri_count dijumlah, `anggotaId` berisi SEMUA kelas_id fisik
 *    (termasuk kelas milik GURU LAIN kalau itu yang digabung ke sini) --
 *    query santri/absensi/jurnal/tilawati/hafalan-surat WAJIB pakai
 *    `.in('kelas_id', anggotaId)`, BUKAN `.eq('kelas_id', id)`, supaya
 *    data kelas yang digabung ikut terbaca.
 *  - Kelas yang tidak tersentuh gabungan apa pun: `anggotaId` = [id]
 *    sendiri, apa adanya. */
export async function terapkanGabunganAktif<T extends KelasBisaGabung>(
  kelasMilik: T[],
  kelompokId: number,
): Promise<KelasTergabung<T>[]> {
  if (kelasMilik.length === 0) return [];
  const gabungan = await muatGabunganAktifKelompok(kelompokId);
  if (gabungan.length === 0)
    return kelasMilik.map((k) => ({ ...k, anggotaId: [k.id], anggotaDetail: [{ id: k.id, nama: k.nama }] }));

  const petaMilik = new Map(kelasMilik.map((k) => [k.id, k]));
  const terlipat = new Set(gabungan.map((g) => g.kelas_id));

  /* Kelas anggota gabungan yang BUKAN milik guru ini (mis. digabung dari
     kelas guru lain) -- perlu nama & santri_count-nya lewat query
     tambahan (tabel kelas kecil, murah, RLS santri/kelas guru sudah
     longgar se-kelompok). */
  const idAsing = [...new Set(gabungan.map((g) => g.kelas_id).filter((id) => !petaMilik.has(id)))];
  const petaAsing = new Map<number, KelasBisaGabung>();
  if (idAsing.length > 0) {
    const { data, error } = await supabase.from('kelas').select('id, nama, santri_count').in('id', idAsing);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as KelasBisaGabung[]) petaAsing.set(r.id, r);
  }
  const cariAnggota = (id: number): KelasBisaGabung | undefined => petaMilik.get(id) ?? petaAsing.get(id);

  const hasil: KelasTergabung<T>[] = [];
  for (const k of kelasMilik) {
    if (terlipat.has(k.id)) continue;
    const anggota = gabungan.filter((g) => g.kelas_induk_id === k.id);
    if (anggota.length === 0) {
      hasil.push({ ...k, anggotaId: [k.id], anggotaDetail: [{ id: k.id, nama: k.nama }] });
      continue;
    }
    const namaAnggota = anggota.map((g) => cariAnggota(g.kelas_id)?.nama).filter((n): n is string => !!n);
    const santriTambahan = anggota.reduce((sum, g) => sum + (cariAnggota(g.kelas_id)?.santri_count ?? 0), 0);
    hasil.push({
      ...k,
      nama: [k.nama, ...namaAnggota].join(' & '),
      santri_count: (k.santri_count ?? 0) + santriTambahan,
      anggotaId: [k.id, ...anggota.map((g) => g.kelas_id)],
      anggotaDetail: [
        { id: k.id, nama: k.nama },
        ...anggota.map((g) => ({ id: g.kelas_id, nama: cariAnggota(g.kelas_id)?.nama ?? `#${g.kelas_id}` })),
      ],
    });
  }
  return hasil;
}
