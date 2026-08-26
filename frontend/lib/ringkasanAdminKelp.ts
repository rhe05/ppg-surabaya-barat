/* Ringkasan kehadiran HARI INI se-kelompok, dipakai AdminKelpDashboard.tsx
   (2026-08-24, Tier 1 "Dashboard Kehadiran Kelompok" -- mobile admin_kelp).

   Beda dari lib/pengingatAbsen.ts (per-guru, jendela 7 hari mundur,
   dipakai bell/banner guru): ini per-KELOMPOK (semua kelas semua guru
   sekaligus), HANYA hari ini (snapshot "sudah berapa jauh hari ini
   berjalan", bukan mengejar tunggakan). Dua kebutuhan yang beda,
   sengaja tidak dipaksa satu fungsi. */

import { supabase } from './supabase';
import { muatOverrideKelompok, buatCekNonaktif } from './kalenderKelompok';

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

/* Rincian PER KELAS (2026-08-24) -- diminta owner: kartu "Ringkasan
   Kehadiran" bisa diklik utk membuka rincian tiap kelas di bawahnya,
   tampilannya "cukup card dashboard kehadiran guru" (kelas+nama guru,
   5 kotak Hari Aktif/Hadir/Izin/Sakit/Alpa) -- data & rumusnya SAMA
   PERSIS dgn kotak-kotak di GuruDashboard.tsx (Hari Aktif = jumlah
   TANGGAL BERBEDA yg py absensi, persentase dari total 4 status),
   cuma di sini SATU kelompok ditampilkan sekaligus & disertai nama
   guru pengampu tiap kelas (guru sendiri tidak perlu, dia cuma py
   kelasnya sendiri). */
export type KelasRingkasan = {
  kelasId: number;
  kelasNama: string;
  guruNama: string;
  kategori: string | null;
  ruangan: string | null;
  jamMulai: string | null;
  jamSelesai: string | null;
  santriCount: number;
  hariAktif: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
};

export async function muatRingkasanPerKelas(
  kelompokId: number,
  tahun: number,
  bulan: number,
): Promise<KelasRingkasan[]> {
  const dua = (n: number) => String(n).padStart(2, '0');
  const awal = `${tahun}-${dua(bulan)}-01`;
  const akhirTanggal = new Date(tahun, bulan, 0).getDate();
  const akhir = `${tahun}-${dua(bulan)}-${dua(akhirTanggal)}`;

  const { data: kelasData, error: errKelas } = await supabase
    .from('kelas')
    .select('id, nama, guru_id, santri_count, jam_mulai, jam_selesai, ruangan, guru:guru_id(nama), kategori_kbm(nama)')
    .eq('kelompok_id', kelompokId)
    .is('deleted_at', null)
    .order('jam_mulai');
  if (errKelas) throw errKelas;

  type Tersemat = { nama: string } | { nama: string }[] | null;
  type BarisKelas = {
    id: number;
    nama: string;
    guru_id: number | null;
    santri_count: number;
    jam_mulai: string | null;
    jam_selesai: string | null;
    ruangan: string | null;
    guru: Tersemat;
    kategori_kbm: Tersemat;
  };
  const namaDari = (v: Tersemat) => (Array.isArray(v) ? v[0]?.nama : v?.nama) ?? null;

  const kelasList = (kelasData ?? []) as BarisKelas[];
  const kelasAktif = kelasList.filter((k) => k.santri_count > 0);
  const kelasIds = kelasAktif.map((k) => k.id);
  if (kelasIds.length === 0) return [];

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

  const akumulasi = new Map<number, { tanggal: Set<string>; hadir: number; izin: number; sakit: number; alpa: number }>();
  kelasIds.forEach((id) => akumulasi.set(id, { tanggal: new Set(), hadir: 0, izin: 0, sakit: 0, alpa: 0 }));

  if (kelasDariSantri.size > 0) {
    const santriIds = [...kelasDariSantri.keys()];
    const UKURAN_HALAMAN = 1000;
    for (let dari = 0; ; dari += UKURAN_HALAMAN) {
      const { data, error: errAbsensi } = await supabase
        .from('absensi')
        .select('santri_id, tanggal, status')
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
        const acc = kId != null ? akumulasi.get(kId) : undefined;
        if (!acc) return;
        acc.tanggal.add(a.tanggal);
        if (a.status === 'hadir') acc.hadir++;
        else if (a.status === 'izin') acc.izin++;
        else if (a.status === 'sakit') acc.sakit++;
        else if (a.status === 'alpa') acc.alpa++;
      });
      if (batch.length < UKURAN_HALAMAN) break;
    }
  }

  return kelasAktif.map((k) => {
    const acc = akumulasi.get(k.id);
    return {
      kelasId: k.id,
      kelasNama: k.nama,
      guruNama: namaDari(k.guru) ?? '-',
      kategori: namaDari(k.kategori_kbm),
      ruangan: k.ruangan,
      jamMulai: k.jam_mulai,
      jamSelesai: k.jam_selesai,
      santriCount: k.santri_count,
      hariAktif: acc?.tanggal.size ?? 0,
      hadir: acc?.hadir ?? 0,
      izin: acc?.izin ?? 0,
      sakit: acc?.sakit ?? 0,
      alpa: acc?.alpa ?? 0,
    };
  });
}

/* "Absensi Belum di Input" PER KELAS, per bulan (2026-08-24, diminta
   owner: dulu kartu ini "Guru Belum Isi Absen" HANYA hari ini per
   kelas, lalu sempat diringkas per GURU -- owner minta balik ke per
   KELAS krn satu guru bisa pegang lebih dari satu kelas, digabung jadi
   satu angka malah menyembunyikan kelas mana yang sebenarnya bolong).
   BEDA dari lib/pengingatAbsen.ts (7 hari mundur, per guru login
   sendiri, dipakai bell/banner guru): ini se-KELOMPOK, rentang SEBULAN
   PENUH, dipakai admin.

   "Hari yang dihitung" = tanggal2 dalam bulan itu yang lolos
   buatCekNonaktif (weekend/libur nasional DITUMPANGI pengecualian
   kalender_kelompok -- SAMA definisi "hari kerja" dgn Input
   Kehadiran/pengingatAbsen), dibatasi s.d. KEMARIN kalau bulan yang
   dipilih adalah bulan berjalan (hari ini blm tentu selesai sesinya --
   sama prinsip dgn pengingatAbsen.ts). "Belum diisi" = SAMA definisi
   dgn 'Hari Aktif' (kelas itu NOL baris absensi di tanggal itu).
   `totalHari` = jumlah hari kerja yang dihitung bulan itu (penyebut
   persentase), sama utk semua kelas dalam bulan yang sama. */
export type KelasBelumIsiBulan = {
  kelasId: number;
  kelasNama: string;
  guruNama: string;
  jumlahHari: number;
  totalHari: number;
};

function tanggalStrLokal(d: Date) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

export async function muatAbsensiBelumDiisiBulan(
  kelompokId: number,
  tahun: number,
  bulan: number,
): Promise<KelasBelumIsiBulan[]> {
  const sekarang = new Date();
  const bulanBerjalan = tahun === sekarang.getFullYear() && bulan === sekarang.getMonth() + 1;

  const akhirBulan = new Date(tahun, bulan, 0).getDate();
  const batasHari = bulanBerjalan ? sekarang.getDate() - 1 : akhirBulan;
  if (batasHari < 1) return [];

  const override = await muatOverrideKelompok(kelompokId);
  const cekNonaktif = buatCekNonaktif(override);

  const kandidat: string[] = [];
  for (let hari = 1; hari <= batasHari; hari++) {
    const d = new Date(tahun, bulan - 1, hari);
    const s = tanggalStrLokal(d);
    if (!cekNonaktif(s, d)) kandidat.push(s);
  }
  if (kandidat.length === 0) return [];
  const awal = kandidat[0];
  const akhir = kandidat[kandidat.length - 1];

  const { data: kelasData, error: errKelas } = await supabase
    .from('kelas')
    .select('id, nama, guru_id, santri_count, guru:guru_id(nama)')
    .eq('kelompok_id', kelompokId)
    .is('deleted_at', null);
  if (errKelas) throw errKelas;

  type Tersemat = { nama: string } | { nama: string }[] | null;
  type BarisKelas = { id: number; nama: string; guru_id: number | null; santri_count: number; guru: Tersemat };
  const namaDari = (v: Tersemat) => (Array.isArray(v) ? v[0]?.nama : v?.nama) ?? null;

  const kelasAktif = ((kelasData ?? []) as BarisKelas[]).filter((k) => k.santri_count > 0 && k.guru_id != null);
  if (kelasAktif.length === 0) return [];
  const kelasIds = kelasAktif.map((k) => k.id);

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

  const terisi = new Map<number, Set<string>>();
  kelasIds.forEach((id) => terisi.set(id, new Set()));

  if (kelasDariSantri.size > 0) {
    const santriIds = [...kelasDariSantri.keys()];
    const UKURAN_HALAMAN = 1000;
    for (let dari = 0; ; dari += UKURAN_HALAMAN) {
      const { data, error: errAbsensi } = await supabase
        .from('absensi')
        .select('santri_id, tanggal')
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
        if (kId != null) terisi.get(kId)?.add(a.tanggal);
      });
      if (batch.length < UKURAN_HALAMAN) break;
    }
  }

  return kelasAktif
    .map((k) => {
      const set = terisi.get(k.id);
      const jumlahHari = kandidat.filter((tgl) => !set?.has(tgl)).length;
      return {
        kelasId: k.id,
        kelasNama: k.nama,
        guruNama: namaDari(k.guru) ?? '-',
        jumlahHari,
        totalHari: kandidat.length,
      };
    })
    .filter((k) => k.jumlahHari > 0)
    .sort((a, b) => b.jumlahHari - a.jumlahHari);
}

/* Kartu KPI "Hari Aktif" (2026-08-26, diminta owner: dari tgl 1 bulan
   berjalan s.d. HARI INI, berapa yang sungguh hari ngaji -- akhir pekan
   & tanggal merah nasional dikurangi, DITUMPANGI pengecualian
   kalender_kelompok kalau kelp ini pernah menandai suatu tanggal
   'libur' mendadak (mis. ada acara pengajian penerobosan) atau 'aktif'
   (tetap masuk walau tanggal merah). Definisi "hari kerja" SAMA PERSIS
   dgn muatAbsensiBelumDiisiBulan di atas (buatCekNonaktif) -- beda cuma
   batas akhirnya: di sini SAMPAI HARI INI SENDIRI (bukan kemarin), krn
   tujuannya "sudah berjalan berapa hari", bukan "berapa yg wajib sudah
   diisi". */
export async function muatHariAktifBulanIni(kelompokId: number): Promise<number> {
  const sekarang = new Date();
  const tahun = sekarang.getFullYear();
  const bulan = sekarang.getMonth() + 1;
  const hariIni = sekarang.getDate();

  const override = await muatOverrideKelompok(kelompokId);
  const cekNonaktif = buatCekNonaktif(override);

  let aktif = 0;
  for (let hari = 1; hari <= hariIni; hari++) {
    const d = new Date(tahun, bulan - 1, hari);
    const s = tanggalStrLokal(d);
    if (!cekNonaktif(s, d)) aktif++;
  }
  return aktif;
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
