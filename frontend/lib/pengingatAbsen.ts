/* Logika "kelas mana + tanggal mana yang belum diisi absennya", dipakai
   BERSAMA oleh PengingatAbsenBanner.tsx (Dashboard) dan
   BellPermintaanGuru.tsx (lonceng, tampil di semua halaman guru) --
   dipindah ke sini (2026-08-24) supaya kedua tempat itu TIDAK
   menduplikasi algoritmenya sendiri2 dan berisiko drift.

   Jendela dicek: 7 hari kalender ke belakang dari KEMARIN (bukan hari
   ini -- sesi hari ini mungkin belum selesai/belum waktunya), disaring
   pakai buatCekNonaktif (lib/kalenderKelompok.ts -- kalender libur
   nasional DITUMPANGI pengecualian per kelompok, kalau kelompokId
   diisi), supaya definisi "hari kerja" konsisten dgn kalender Input
   Kehadiran/Materi Klasikal. Kelp yang py override 'aktif' di tanggal
   merah IKUT dicek (bukan dilewati), kelp yang py override 'libur' di
   hari kerja biasa TIDAK dicek (bukan dianggap "belum diisi").

   "Belum diisi" = kelas itu NOL baris absensi utk tanggal itu (bukan
   sebagian) -- sama dgn definisi "Hari Aktif" di GuruDashboard/Riwayat
   Kehadiran. Pemanggil WAJIB menyaring ke kelas dgn santri aktif > 0 --
   kelas kosong akan SELALU muncul "belum diisi" krn memang tidak pernah
   bisa py absensi. */

import { supabase } from './supabase';
import { muatOverrideKelompok, buatCekNonaktif } from './kalenderKelompok';

const JUMLAH_HARI_DICEK = 7;

export type AbsenHilang = { kelasId: number; kelasNama: string; tanggal: string };

function tanggalStr(d: Date) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

export async function hitungAbsenBelumDiisi(
  kelas: { id: number; nama: string }[],
  kelompokId?: number | null,
): Promise<AbsenHilang[]> {
  if (kelas.length === 0) return [];

  const override = kelompokId != null ? await muatOverrideKelompok(kelompokId) : new Map();
  const cekNonaktif = buatCekNonaktif(override);

  const kandidat: string[] = [];
  const sekarang = new Date();
  for (let i = 1; i <= JUMLAH_HARI_DICEK; i++) {
    const d = new Date(sekarang);
    d.setDate(d.getDate() - i);
    const s = tanggalStr(d);
    if (!cekNonaktif(s, d)) kandidat.push(s);
  }
  if (kandidat.length === 0) return [];
  const awal = kandidat[kandidat.length - 1];
  const akhir = kandidat[0];

  const kelasIds = kelas.map((k) => k.id);
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
    const { data: absensiData, error: errAbsensi } = await supabase
      .from('absensi')
      .select('santri_id, tanggal')
      .in('santri_id', santriIds)
      .gte('tanggal', awal)
      .lte('tanggal', akhir)
      .is('deleted_at', null);
    if (errAbsensi) throw errAbsensi;

    (absensiData ?? []).forEach((a) => {
      const kId = kelasDariSantri.get(a.santri_id);
      if (kId != null) terisi.get(kId)?.add(a.tanggal);
    });
  }

  const daftar: AbsenHilang[] = [];
  for (const k of kelas) {
    for (const tgl of kandidat) {
      if (!terisi.get(k.id)?.has(tgl)) {
        daftar.push({ kelasId: k.id, kelasNama: k.nama, tanggal: tgl });
      }
    }
  }
  daftar.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  return daftar;
}
