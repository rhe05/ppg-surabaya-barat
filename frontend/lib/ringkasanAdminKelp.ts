/* Ringkasan kehadiran HARI INI se-kelompok, dipakai AdminKelpDashboard.tsx
   (2026-08-24, Tier 1 "Dashboard Kehadiran Kelompok" -- mobile admin_kelp).

   Beda dari lib/pengingatAbsen.ts (per-guru, jendela 7 hari mundur,
   dipakai bell/banner guru): ini per-KELOMPOK (semua kelas semua guru
   sekaligus), HANYA hari ini (snapshot "sudah berapa jauh hari ini
   berjalan", bukan mengejar tunggakan). Dua kebutuhan yang beda,
   sengaja tidak dipaksa satu fungsi. */

import { supabase } from './supabase';

export type GuruBelumIsi = { kelasId: number; kelasNama: string; guruNama: string };

export type RingkasanHariIni = {
  totalKelas: number;
  kelasSudahDiabsen: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  guruBelumIsi: GuruBelumIsi[];
};

function tanggalHariIniLokal() {
  const now = new Date();
  const lokal = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return lokal.toISOString().slice(0, 10);
}

/* Inti bersama -- dipakai muatRingkasanHariIni (rentang 1 hari) DAN
   muatRingkasanBulan (2026-08-24, diminta owner: kartu "Ringkasan
   Kehadiran" di Dashboard mobile admin_kelp bisa ditelusuri per bulan,
   bukan cuma "hari ini") -- algoritmanya sama persis utk rentang tanggal
   berapa pun, cuma batas awal/akhirnya yang beda. */
async function muatRingkasanRentang(kelompokId: number, awal: string, akhir: string): Promise<RingkasanHariIni> {
  const { data: kelasData, error: errKelas } = await supabase
    .from('kelas')
    .select('id, nama, guru_id, santri_count, guru:guru_id(nama)')
    .eq('kelompok_id', kelompokId)
    .is('deleted_at', null);
  if (errKelas) throw errKelas;

  type BarisKelas = {
    id: number;
    nama: string;
    guru_id: number | null;
    santri_count: number;
    guru: { nama: string } | { nama: string }[] | null;
  };
  const kelasList = (kelasData ?? []) as BarisKelas[];
  const namaGuruDari = (v: BarisKelas['guru']) => {
    const baris = Array.isArray(v) ? v[0] : v;
    return baris?.nama ?? '-';
  };

  const kelasAktif = kelasList.filter((k) => k.santri_count > 0);
  const kelasIds = kelasAktif.map((k) => k.id);

  const kosong: RingkasanHariIni = {
    totalKelas: kelasList.length,
    kelasSudahDiabsen: 0,
    hadir: 0,
    izin: 0,
    sakit: 0,
    alpa: 0,
    guruBelumIsi: [],
  };
  if (kelasIds.length === 0) return kosong;

  const { data: santriData, error: errSantri } = await supabase
    .from('santri')
    .select('id, kelas_id')
    .in('kelas_id', kelasIds)
    .is('deleted_at', null);
  if (errSantri) throw errSantri;

  const kelasDariSantri = new Map<number, number>();
  (santriData ?? []).forEach((s) => {
    if (s.kelas_id != null) kelasDariSantri.set(s.id, s.kelas_id);
  });

  const kelasSudah = new Set<number>();
  let hadir = 0;
  let izin = 0;
  let sakit = 0;
  let alpa = 0;

  if (kelasDariSantri.size > 0) {
    const santriIds = [...kelasDariSantri.keys()];
    const UKURAN_HALAMAN = 1000;
    for (let dari = 0; ; dari += UKURAN_HALAMAN) {
      const { data, error: errAbsensi } = await supabase
        .from('absensi')
        .select('santri_id, status')
        .in('santri_id', santriIds)
        .gte('tanggal', awal)
        .lte('tanggal', akhir)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(dari, dari + UKURAN_HALAMAN - 1);
      if (errAbsensi) throw errAbsensi;

      const batch = data ?? [];
      batch.forEach((a) => {
        const kId = kelasDariSantri.get(a.santri_id);
        if (kId != null) kelasSudah.add(kId);
        if (a.status === 'hadir') hadir++;
        else if (a.status === 'izin') izin++;
        else if (a.status === 'sakit') sakit++;
        else if (a.status === 'alpa') alpa++;
      });
      if (batch.length < UKURAN_HALAMAN) break;
    }
  }

  const guruBelumIsi: GuruBelumIsi[] = kelasAktif
    .filter((k) => !kelasSudah.has(k.id))
    .map((k) => ({ kelasId: k.id, kelasNama: k.nama, guruNama: namaGuruDari(k.guru) }));

  return {
    totalKelas: kelasList.length,
    kelasSudahDiabsen: kelasSudah.size,
    hadir,
    izin,
    sakit,
    alpa,
    guruBelumIsi,
  };
}

export async function muatRingkasanHariIni(kelompokId: number): Promise<RingkasanHariIni> {
  const hariIni = tanggalHariIniLokal();
  return muatRingkasanRentang(kelompokId, hariIni, hariIni);
}

/* Kartu "Ringkasan Kehadiran" (2026-08-24) -- ikon kalender di sebelahnya
   membuka pemilih Bulan/Tahun (pola sama GuruDashboard.tsx), rentangnya
   satu bulan penuh alih2 selalu "hari ini". `guruBelumIsi` hasil fungsi
   ini SENGAJA TIDAK dipakai kartu "Guru Belum Isi Absen" -- itu tetap
   scoped hari ini (lewat muatRingkasanHariIni terpisah), krn urgensinya
   "follow up SEKARANG", beda kebutuhan dgn ringkasan bulanan ini. */
export async function muatRingkasanBulan(
  kelompokId: number,
  tahun: number,
  bulan: number,
): Promise<RingkasanHariIni> {
  const dua = (n: number) => String(n).padStart(2, '0');
  const awal = `${tahun}-${dua(bulan)}-01`;
  const akhirTanggal = new Date(tahun, bulan, 0).getDate();
  const akhir = `${tahun}-${dua(bulan)}-${dua(akhirTanggal)}`;
  return muatRingkasanRentang(kelompokId, awal, akhir);
}

/* Tier 2 (2026-08-24): guru yang SEDANG izin/cuti hari ini -- read-only,
   guru_izin TIDAK punya alur persetujuan admin (self-declared, tidak
   spt permintaan_generus), jadi ini murni "siapa yg sedang tidak masuk
   hari ini", bukan antrean yang perlu diputuskan. RLS guru_izin_select_
   scoped (migrasi 20260818190000) sudah mengizinkan admin_kelompok baca
   kelompoknya sendiri -- tidak ada migrasi baru. */
export type GuruIzinAktif = {
  guruId: number;
  guruNama: string;
  jenis: string;
  tanggalMulai: string;
  tanggalSelesai: string;
  alasanKategori: string | null;
};

export async function muatGuruSedangIzin(kelompokId: number): Promise<GuruIzinAktif[]> {
  const hariIni = tanggalHariIniLokal();
  const { data, error } = await supabase
    .from('guru_izin')
    .select('guru_id, jenis, tanggal_mulai, tanggal_selesai, alasan_kategori, guru:guru_id(nama)')
    .eq('kelompok_id', kelompokId)
    .lte('tanggal_mulai', hariIni)
    .gte('tanggal_selesai', hariIni);
  if (error) throw error;

  type Baris = {
    guru_id: number;
    jenis: string;
    tanggal_mulai: string;
    tanggal_selesai: string;
    alasan_kategori: string | null;
    guru: { nama: string } | { nama: string }[] | null;
  };
  return ((data ?? []) as Baris[]).map((b) => {
    const guru = Array.isArray(b.guru) ? b.guru[0] : b.guru;
    return {
      guruId: b.guru_id,
      guruNama: guru?.nama ?? '-',
      jenis: b.jenis,
      tanggalMulai: b.tanggal_mulai,
      tanggalSelesai: b.tanggal_selesai,
      alasanKategori: b.alasan_kategori,
    };
  });
}

export { tanggalHariIniLokal };
