/* Ringkasan Jurnal Pembelajaran PER KELAS -- kartu pemantauan admin kelp
   mobile (Fase 1, 2026-09-09). Konsep sejajar lib/ringkasanAdminKelp.ts
   (Ringkasan Kehadiran): tile ringkasan kelompok + daftar per-kelas yang
   bisa dibuka, pemilih bulan yang sama.

   Beda: bukan sekadar hitungan "berapa jurnal terisi", tapi:
   - STATUS KESEHATAN per kelas (hijau/kuning/merah), daftar diurut
     yang paling bermasalah di atas;
   - PACING Tilawati vs pedoman (lib/pedomanTilawati.ts) -- realisasi
     santri di bawah/atas target bulan ini;
   - KEMUNGKINAN PENYEBAB kalau tertinggal -- korelasi guru_izin +
     tanggal libur, supaya admin tidak menegur guru yang memang izin;
   - kejujuran data basi -- `entriTerakhir` + `hariSejakEntri`;
   - jejak pengingat terakhir (tabel jurnal_pengingat).

   RLS jurnal_materi/tilawati_pelaksanaan/guru_izin/kalender_kelompok
   sudah mengizinkan admin_kelompok baca se-kelompok. Tanpa RPC baru. */

import { supabase } from './supabase';
import { muatOverrideKelompok, overrideUntukKelas, type PetaOverride } from './kalenderKelompok';
import { kelasKurikulumSampai } from './materiHafalanDoa';
import { targetTilawatiPeriode, posisiTilawati, statusPencapaianTilawati } from './pedomanTilawati';

export type KesehatanJurnal = 'sehat' | 'perhatian' | 'tertinggal';

export type JurnalKelasRingkas = {
  kelasId: number;
  kelasNama: string;
  kategori: string | null;
  guruId: number | null;
  guruNama: string;
  santriCount: number;

  /* jurnal_materi NGAJI bulan ini (kartu "Ringkasan Jurnal Ngaji") */
  direncana: number; // ngaji: belum + disampaikan + tidak_tersampaikan
  disampaikan: number;
  belum: number;
  tidakTersampaikan: number;
  alasanTidakTersampaikan: string[]; // catatan baris tidak_tersampaikan (ngaji)
  /* jurnal_materi KLASIKAL -- ditampilkan ringkas saja di kartu Ngaji */
  klasikalDisampaikan: number;
  klasikalDirencana: number;

  /* kejujuran data */
  disampaikanTerakhir: string | null; // YYYY-MM-DD materi TERAKHIR yg disampaikan
  hariSejakDisampaikan: number | null;
  disentuhTerakhir: string | null; // ISO -- kapan jurnal terakhir DIUBAH (sinyal aktivitas guru)
  hariSejakDisentuh: number | null;
  kelasBaru: boolean; // kelas < 7 hari -- "masa tenang", tidak ditandai

  /* pacing Tilawati (null kalau kelas di luar pedoman -- kelas 4+) */
  tilawati: {
    kodeKelas: string;
    labelTarget: string;
    santriDinilai: number;
    bb: number; // Belum Berkembang (di bawah target bulan lalu)
    mb: number; // Mulai Berkembang
    bsh: number; // Sesuai Harapan
    bsb: number; // Sangat Baik
    naik: number; // jumlah catatan "Naik" bulan ini (semua santri)
    tetap: number;
  } | null;

  kesehatan: KesehatanJurnal; // dari jurnal NGAJI saja
  kemungkinanPenyebab: string[];
  /* status Tilawati vs pedoman (kartu "Monitoring"). 'takberlaku' = kelas
     di luar pedoman (kelas 4+) atau belum ada catatan sama sekali. */
  kesehatanTilawati: KesehatanJurnal | 'takberlaku';

  pengingatTerakhir: string | null; // ISO timestamp
};

export type RingkasanJurnalKelompok = {
  totalKelas: number;
  kelasTerjurnal: number; // punya minimal 1 entri jurnal ngaji bulan ini
  direncana: number;
  disampaikan: number;
  belum: number;
  tidakTersampaikan: number;
  kelasTertinggal: number;
  kelasPerhatian: number;
};

export type RingkasanMonitoringKelompok = {
  kelasDinilai: number; // kelas dgn tilawati berlaku & ada catatan
  bsb: number;
  bsh: number;
  mb: number;
  bb: number;
  naik: number;
  tetap: number;
  kelasTertinggal: number;
  kelasPerhatian: number;
};

const dua = (n: number) => String(n).padStart(2, '0');

function beririsan(aMulai: string, aSelesai: string, bMulai: string, bSelesai: string): boolean {
  return aMulai <= bSelesai && bMulai <= aSelesai;
}

/* Skor kesehatan yang SADAR WAKTU: awal bulan, "belum disampaikan" itu
   wajar (bahkan bagus kalau sudah ada rencana). Rasio delivery baru
   relevan kalau bulan sudah berjalan. Kelas yang baru dibuat < 7 hari
   dapat "masa tenang" -- tidak ditandai apa pun. */
/* Kesehatan JURNAL NGAJI (kartu "Ringkasan Jurnal Ngaji"). Sadar waktu:
   awal bulan "belum disampaikan" wajar; rasio delivery baru dinilai kalau
   bulan sudah berjalan. Kelas < 7 hari = "masa tenang". */
function hitungKesehatanNgaji(k: {
  direncana: number;
  disampaikan: number;
  tidakTersampaikan: number;
  hariSejakDisentuh: number | null;
  porsiBulan: number;
  hariBerjalan: number;
  kelasBaru: boolean;
}): KesehatanJurnal {
  if (k.kelasBaru) return 'sehat';
  const rasio = k.direncana > 0 ? k.disampaikan / k.direncana : 0;
  const tertinggalLaju = k.porsiBulan > 0.5 && k.direncana > 0 && rasio < k.porsiBulan - 0.3;

  if (
    (k.direncana === 0 && k.hariBerjalan >= 22) ||
    (k.hariSejakDisentuh != null && k.hariSejakDisentuh > 21) ||
    k.tidakTersampaikan >= 2
  ) {
    return 'tertinggal';
  }
  if (
    (k.direncana === 0 && k.hariBerjalan >= 15) ||
    (k.hariSejakDisentuh != null && k.hariSejakDisentuh > 10) ||
    tertinggalLaju
  ) {
    return 'perhatian';
  }
  return 'sehat';
}

/* Kesehatan MONITORING = Tilawati vs pedoman (kartu "Monitoring"). */
function hitungKesehatanTilawati(
  t: JurnalKelasRingkas['tilawati'],
  porsiBulan: number,
  kelasBaru: boolean,
): KesehatanJurnal | 'takberlaku' {
  if (t == null || t.santriDinilai < 1) return 'takberlaku';
  if (kelasBaru) return 'sehat';
  if (porsiBulan <= 0.4) return 'sehat'; // terlalu awal utk menilai pacing
  if (t.santriDinilai >= 2 && t.bb >= Math.ceil(t.santriDinilai / 2)) return 'tertinggal';
  if (t.bb + t.mb > t.bsh + t.bsb) return 'perhatian';
  return 'sehat';
}

const URUT_KESEHATAN: Record<KesehatanJurnal, number> = { tertinggal: 0, perhatian: 1, sehat: 2 };
const urutKes = (k: KesehatanJurnal | 'takberlaku') =>
  k === 'takberlaku' ? 3 : URUT_KESEHATAN[k];

export async function muatRingkasanJurnalPerKelas(
  kelompokId: number,
  tahun: number,
  bulan: number,
  /* Kalau diisi -> hanya kelas yang diampu guru ini (utk kartu di layar
     guru). Kosong -> semua kelas kelompok (utk admin). */
  hanyaGuruId?: number | null,
): Promise<JurnalKelasRingkas[]> {
  const awal = `${tahun}-${dua(bulan)}-01`;
  const akhirTgl = new Date(tahun, bulan, 0).getDate();
  const akhir = `${tahun}-${dua(bulan)}-${dua(akhirTgl)}`;
  const hariIni = new Date();
  const hariIniStr = `${hariIni.getFullYear()}-${dua(hariIni.getMonth() + 1)}-${dua(hariIni.getDate())}`;

  const [kelasRes, materiRes, santriRes, tilawatiRes, izinRes, peta] = await Promise.all([
    supabase
      .from('kelas')
      .select('id, nama, guru_id, guru_id_2, santri_count, created_at, guru:guru_id(nama), kategori_kbm(nama)')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('jam_mulai'),
    supabase
      .from('jurnal_materi')
      .select('kelas_id, jenis, status, catatan, tanggal_disampaikan, updated_at')
      .eq('kelompok_id', kelompokId)
      .eq('tahun', tahun)
      .eq('bulan', bulan)
      .is('deleted_at', null),
    supabase
      .from('santri')
      .select('id, kelas_id')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null),
    supabase
      .from('tilawati_pelaksanaan')
      .select('kelas_id, santri_id, status, buku_jilid, halaman, tanggal')
      .eq('kelompok_id', kelompokId)
      .gte('tanggal', awal)
      .lte('tanggal', akhir)
      .order('tanggal', { ascending: true }),
    supabase
      .from('guru_izin')
      .select('guru_id, tanggal_mulai, tanggal_selesai')
      .eq('kelompok_id', kelompokId)
      .lte('tanggal_mulai', akhir)
      .gte('tanggal_selesai', awal),
    muatOverrideKelompok(kelompokId),
  ]);
  if (kelasRes.error) throw new Error(kelasRes.error.message);

  /* jurnal_pengingat opsional -- kalau migrasinya belum jalan, kartu tetap
     berfungsi (cuma jejak pengingat tidak muncul). */
  let pengingatRows: { kelas_id: number; dikirim_pada: string }[] = [];
  try {
    const r = await supabase
      .from('jurnal_pengingat')
      .select('kelas_id, dikirim_pada')
      .eq('kelompok_id', kelompokId)
      .order('dikirim_pada', { ascending: false });
    if (!r.error && r.data) pengingatRows = r.data as { kelas_id: number; dikirim_pada: string }[];
  } catch {
    /* tabel belum ada */
  }

  type Tersemat = { nama: string } | { nama: string }[] | null;
  const namaDari = (v: Tersemat) => (Array.isArray(v) ? v[0]?.nama : v?.nama) ?? null;

  const kelasListSemua = (kelasRes.data ?? []) as unknown as {
    id: number;
    nama: string;
    guru_id: number | null;
    guru_id_2: number | null;
    santri_count: number;
    created_at: string;
    guru: Tersemat;
    kategori_kbm: Tersemat;
  }[];
  const kelasList =
    hanyaGuruId != null
      ? kelasListSemua.filter((k) => k.guru_id === hanyaGuruId || k.guru_id_2 === hanyaGuruId)
      : kelasListSemua;

  /* Seberapa jauh bulan yang dilihat sudah berjalan (0-1). Bulan lampau = 1. */
  const skrg = new Date();
  const bulanIni = skrg.getFullYear() === tahun && skrg.getMonth() + 1 === bulan;
  const bulanLampau = tahun < skrg.getFullYear() || (tahun === skrg.getFullYear() && bulan < skrg.getMonth() + 1);
  const porsiBulan = bulanLampau ? 1 : bulanIni ? Math.min(1, skrg.getDate() / akhirTgl) : 0;
  const hariBerjalan = bulanLampau ? akhirTgl : bulanIni ? skrg.getDate() : 0;

  const materiPerKelas = new Map<number, typeof materiRes.data>();
  for (const m of materiRes.data ?? []) {
    const arr = materiPerKelas.get(m.kelas_id) ?? [];
    arr.push(m);
    materiPerKelas.set(m.kelas_id, arr);
  }

  const santriPerKelas = new Map<number, number[]>();
  for (const s of santriRes.data ?? []) {
    if (s.kelas_id == null) continue;
    const arr = santriPerKelas.get(s.kelas_id) ?? [];
    arr.push(s.id);
    santriPerKelas.set(s.kelas_id, arr);
  }

  // tilawati: kumpulkan posisi & status per (kelas, santri)
  const tilawatiPerKelas = new Map<
    number,
    { perSantri: Map<number, { status: string | null; jilid: string | null; halaman: string | null }[]> }
  >();
  for (const r of tilawatiRes.data ?? []) {
    const kel = tilawatiPerKelas.get(r.kelas_id) ?? { perSantri: new Map() };
    const arr = kel.perSantri.get(r.santri_id) ?? [];
    arr.push({ status: r.status, jilid: r.buku_jilid, halaman: r.halaman });
    kel.perSantri.set(r.santri_id, arr);
    tilawatiPerKelas.set(r.kelas_id, kel);
  }

  const izinPerGuru = new Map<number, { mulai: string; selesai: string }[]>();
  for (const i of izinRes.data ?? []) {
    if (i.guru_id == null) continue;
    const arr = izinPerGuru.get(i.guru_id) ?? [];
    arr.push({ mulai: i.tanggal_mulai, selesai: i.tanggal_selesai });
    izinPerGuru.set(i.guru_id, arr);
  }

  const pengingatPerKelas = new Map<number, string>();
  for (const p of pengingatRows) {
    if (!pengingatPerKelas.has(p.kelas_id)) pengingatPerKelas.set(p.kelas_id, p.dikirim_pada);
  }

  const guruNamaById = new Map<number, string>();
  kelasList.forEach((k) => {
    if (k.guru_id != null) guruNamaById.set(k.guru_id, namaDari(k.guru) ?? 'Guru');
  });

  const hasil: JurnalKelasRingkas[] = kelasList
    .filter((k) => k.santri_count > 0)
    .map((k) => {
      const materi = materiPerKelas.get(k.id) ?? [];
      // NGAJI = angka utama kartu; KLASIKAL = ringkas saja.
      let disampaikan = 0; // ngaji
      let belum = 0; // ngaji
      let tidakTersampaikan = 0; // ngaji
      let klasikalDisampaikan = 0;
      let klasikalDirencana = 0;
      const alasan: string[] = []; // ngaji
      let disampaikanTerakhir: string | null = null;
      let disentuhTerakhir: string | null = null;

      for (const m of materi) {
        if (m.status === 'disampaikan' && m.tanggal_disampaikan) {
          if (disampaikanTerakhir == null || m.tanggal_disampaikan > disampaikanTerakhir)
            disampaikanTerakhir = m.tanggal_disampaikan;
        }
        if (m.updated_at && (disentuhTerakhir == null || m.updated_at > disentuhTerakhir))
          disentuhTerakhir = m.updated_at;

        if (m.jenis === 'klasikal') {
          klasikalDirencana += 1;
          if (m.status === 'disampaikan') klasikalDisampaikan += 1;
          continue;
        }
        // ngaji
        if (m.status === 'disampaikan') disampaikan += 1;
        else if (m.status === 'tidak_tersampaikan') {
          tidakTersampaikan += 1;
          if (m.catatan?.trim()) alasan.push(m.catatan.trim());
        } else belum += 1;
      }
      const direncana = disampaikan + belum + tidakTersampaikan; // ngaji
      const nowMs = new Date(hariIniStr + 'T00:00:00').getTime();
      const hariSejakDisentuh =
        disentuhTerakhir != null
          ? Math.max(0, Math.floor((Date.now() - new Date(disentuhTerakhir).getTime()) / 86_400_000))
          : null;
      const hariSejakDisampaikan =
        disampaikanTerakhir != null
          ? Math.max(
              0,
              Math.floor((nowMs - new Date(disampaikanTerakhir + 'T00:00:00').getTime()) / 86_400_000),
            )
          : null;
      const kelasBaru =
        Date.now() - new Date(k.created_at).getTime() < 7 * 86_400_000;

      // ── Pacing Tilawati ──
      const kodeKelas = kelasKurikulumSampai(k.nama).at(-1) ?? '';
      const target = targetTilawatiPeriode(kodeKelas, bulan);
      let tilawati: JurnalKelasRingkas['tilawati'] = null;
      if (target) {
        const tw = tilawatiPerKelas.get(k.id);
        let bb = 0;
        let mb = 0;
        let bsh = 0;
        let bsb = 0;
        let naik = 0;
        let tetap = 0;
        let dinilai = 0;
        const idsKelas = santriPerKelas.get(k.id) ?? [];
        for (const sid of idsKelas) {
          const baris = tw?.perSantri.get(sid) ?? [];
          for (const b of baris) {
            if (b.status === 'naik') naik += 1;
            else if (b.status === 'tetap') tetap += 1;
          }
          const posisi = baris
            .map((b) => posisiTilawati(b.jilid, b.halaman))
            .filter((x): x is number => x != null);
          if (posisi.length === 0) continue;
          const st = statusPencapaianTilawati(kodeKelas, bulan, posisi[posisi.length - 1]);
          if (!st) continue;
          dinilai += 1;
          if (st === 'BB') bb += 1;
          else if (st === 'MB') mb += 1;
          else if (st === 'BSH') bsh += 1;
          else bsb += 1;
        }
        const jLabel = target.jilid === 'Paud' ? 'Tilawati Paud' : `Jilid ${target.jilid}`;
        tilawati = {
          kodeKelas,
          labelTarget: `${jLabel} · ${target.bulan.target}`,
          santriDinilai: dinilai,
          bb,
          mb,
          bsh,
          bsb,
          naik,
          tetap,
        };
      }

      // ── Kemungkinan penyebab ──
      const penyebab: string[] = [];
      if (k.guru_id != null) {
        for (const iz of izinPerGuru.get(k.guru_id) ?? []) {
          if (beririsan(iz.mulai, iz.selesai, awal, akhir)) {
            penyebab.push(
              `Guru ${guruNamaById.get(k.guru_id) ?? ''} izin ${tglSingkat(iz.mulai)}–${tglSingkat(iz.selesai)}`.trim(),
            );
          }
        }
      }
      let liburKelas = 0;
      peta.forEach((_l, tgl) => {
        if (tgl < awal || tgl > akhir) return;
        if (overrideUntukKelas(peta as PetaOverride, tgl, k.id)?.jenis === 'libur') liburKelas += 1;
      });
      if (liburKelas > 0) penyebab.push(`${liburKelas} tanggal ditandai libur bulan ini`);

      const kesehatan = hitungKesehatanNgaji({
        direncana,
        disampaikan,
        tidakTersampaikan,
        hariSejakDisentuh,
        porsiBulan,
        hariBerjalan,
        kelasBaru,
      });
      const kesehatanTilawati = hitungKesehatanTilawati(tilawati, porsiBulan, kelasBaru);

      return {
        kelasId: k.id,
        kelasNama: k.nama,
        kategori: namaDari(k.kategori_kbm),
        guruId: k.guru_id,
        guruNama: k.guru_id != null ? (guruNamaById.get(k.guru_id) ?? '—') : '—',
        santriCount: k.santri_count,
        direncana,
        disampaikan,
        belum,
        tidakTersampaikan,
        alasanTidakTersampaikan: alasan,
        klasikalDisampaikan,
        klasikalDirencana,
        disampaikanTerakhir,
        hariSejakDisampaikan,
        disentuhTerakhir,
        hariSejakDisentuh,
        kelasBaru,
        tilawati,
        kesehatan,
        kesehatanTilawati,
        kemungkinanPenyebab: penyebab,
        pengingatTerakhir: pengingatPerKelas.get(k.id) ?? null,
      };
    });

  hasil.sort((a, b) => {
    const d = URUT_KESEHATAN[a.kesehatan] - URUT_KESEHATAN[b.kesehatan];
    if (d !== 0) return d;
    return a.kelasNama.localeCompare(b.kelasNama, 'id');
  });
  return hasil;
}

/* Urutan utk kartu Monitoring: tilawati bermasalah dulu, 'takberlaku' terakhir. */
export function urutkanUntukMonitoring(list: JurnalKelasRingkas[]): JurnalKelasRingkas[] {
  return [...list].sort((a, b) => {
    const d = urutKes(a.kesehatanTilawati) - urutKes(b.kesehatanTilawati);
    if (d !== 0) return d;
    return a.kelasNama.localeCompare(b.kelasNama, 'id');
  });
}

export function ringkasMonitoringKelompok(list: JurnalKelasRingkas[]): RingkasanMonitoringKelompok {
  const berlaku = list.filter((k) => k.kesehatanTilawati !== 'takberlaku' && k.tilawati);
  return {
    kelasDinilai: berlaku.length,
    bsb: berlaku.reduce((s, k) => s + (k.tilawati?.bsb ?? 0), 0),
    bsh: berlaku.reduce((s, k) => s + (k.tilawati?.bsh ?? 0), 0),
    mb: berlaku.reduce((s, k) => s + (k.tilawati?.mb ?? 0), 0),
    bb: berlaku.reduce((s, k) => s + (k.tilawati?.bb ?? 0), 0),
    naik: berlaku.reduce((s, k) => s + (k.tilawati?.naik ?? 0), 0),
    tetap: berlaku.reduce((s, k) => s + (k.tilawati?.tetap ?? 0), 0),
    kelasTertinggal: berlaku.filter((k) => k.kesehatanTilawati === 'tertinggal').length,
    kelasPerhatian: berlaku.filter((k) => k.kesehatanTilawati === 'perhatian').length,
  };
}

function tglSingkat(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export function ringkasKelompokDariKelas(list: JurnalKelasRingkas[]): RingkasanJurnalKelompok {
  return {
    totalKelas: list.length,
    kelasTerjurnal: list.filter((k) => k.direncana > 0).length,
    direncana: list.reduce((s, k) => s + k.direncana, 0),
    disampaikan: list.reduce((s, k) => s + k.disampaikan, 0),
    belum: list.reduce((s, k) => s + k.belum, 0),
    tidakTersampaikan: list.reduce((s, k) => s + k.tidakTersampaikan, 0),
    kelasTertinggal: list.filter((k) => k.kesehatan === 'tertinggal').length,
    kelasPerhatian: list.filter((k) => k.kesehatan === 'perhatian').length,
  };
}

/* ── Pola alasan "tidak tersampaikan" lintas kelas (Fase 3, poin 8) ──
   Kalau BEBERAPA kelas menyebut alasan yang MIRIP, itu bukan N masalah
   terpisah -- bisa jadi sinyal se-kelompok (mis. penempatan/leveling
   kelas kurang pas). Pengelompokan sederhana: dua alasan dianggap satu
   pola kalau berbagi >= 2 kata penting (>3 huruf, bukan kata umum). */
const KATA_UMUM = new Set([
  'yang', 'anak', 'anak-anak', 'belum', 'sudah', 'tidak', 'karena', 'masih',
  'untuk', 'pada', 'dari', 'dengan', 'akan', 'ada', 'juga', 'saya', 'kami',
  'guru', 'kelas', 'materi', 'santri', 'generus', 'ini', 'itu', 'bisa', 'agar',
  'atau', 'dan', 'saat', 'ketika', 'jadi', 'lagi', 'nya', 'para',
]);

function kataPenting(teks: string): string[] {
  return [
    ...new Set(
      teks
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !KATA_UMUM.has(w)),
    ),
  ];
}

export type PolaAlasan = { contoh: string; kelas: string[]; jumlahKelas: number };

export function polaAlasanTidakTersampaikan(list: JurnalKelasRingkas[]): PolaAlasan[] {
  // kumpulkan (alasan, kelasNama) unik per kelas
  const entri: { teks: string; kelas: string; kata: string[] }[] = [];
  for (const k of list) {
    const unikKelas = new Set<string>();
    for (const a of k.alasanTidakTersampaikan) {
      const key = a.trim().toLowerCase();
      if (key === '' || unikKelas.has(key)) continue;
      unikKelas.add(key);
      entri.push({ teks: a.trim(), kelas: k.kelasNama, kata: kataPenting(a) });
    }
  }
  if (entri.length < 2) return [];

  const dipakai = new Array(entri.length).fill(false);
  const pola: PolaAlasan[] = [];
  for (let i = 0; i < entri.length; i++) {
    if (dipakai[i]) continue;
    const grup = [i];
    for (let j = i + 1; j < entri.length; j++) {
      if (dipakai[j] || entri[j].kelas === entri[i].kelas) continue;
      const shared = entri[j].kata.filter((w) => entri[i].kata.includes(w));
      if (shared.length >= 2) {
        grup.push(j);
        dipakai[j] = true;
      }
    }
    const kelasUnik = [...new Set(grup.map((g) => entri[g].kelas))];
    if (kelasUnik.length >= 2) {
      dipakai[i] = true;
      pola.push({ contoh: entri[i].teks, kelas: kelasUnik, jumlahKelas: kelasUnik.length });
    }
  }
  return pola.sort((a, b) => b.jumlahKelas - a.jumlahKelas);
}

/* Kirim pengingat jurnal ke guru sebuah kelas: catat di jurnal_pengingat
   + buat pengumuman utk lonceng guru. `catatan` = ringkasan kondisi. */
export async function kirimPengingatJurnal(params: {
  kelompokId: number;
  kelasId: number;
  kelasNama: string;
  guruId: number | null;
  guruNama: string;
  catatan: string;
  dibuatOleh: string | null;
}): Promise<void> {
  const hariIni = new Date();
  const tgl = `${hariIni.getFullYear()}-${dua(hariIni.getMonth() + 1)}-${dua(hariIni.getDate())}`;

  const { data: peng, error: ePeng } = await supabase
    .from('pengumuman')
    .insert({
      kelompok_id: params.kelompokId,
      judul: `Pengingat Jurnal — Kelas ${params.kelasNama}`,
      isi:
        `Mohon lengkapi Jurnal Pembelajaran (Rencana & Pelaksanaan) untuk Kelas ${params.kelasNama}. ` +
        (params.catatan ? `Catatan admin: ${params.catatan}` : ''),
      tanggal: tgl,
      dibuat_oleh: params.dibuatOleh,
    })
    .select('id')
    .single();
  if (ePeng) throw new Error(ePeng.message);

  const { error: eLog } = await supabase.from('jurnal_pengingat').insert({
    kelompok_id: params.kelompokId,
    kelas_id: params.kelasId,
    guru_id: params.guruId,
    catatan: params.catatan || null,
    pengumuman_id: peng?.id ?? null,
    dikirim_oleh: params.dibuatOleh,
  });
  if (eLog) throw new Error(eLog.message);
}
