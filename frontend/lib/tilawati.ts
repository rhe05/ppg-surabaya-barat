/* Laporan Tilawati per santri (2026-09-03, diminta owner) -- dipakai
   Riwayat Pembelajaran & Monitoring Pencapaian Materi. Sumber: tabel
   `tilawati_pelaksanaan` (migrasi 20260903120000), diisi guru di kartu
   "Tilawati" pada Pelaksanaan Pembelajaran. RLS tabel itu sudah
   membatasi ke kelas milik guru / scope admin. */

import { supabase } from './supabase';
import { posisiTilawati } from './pedomanTilawati';

export type TilawatiStatus = 'naik' | 'tetap';

export type TilawatiHari = {
  tanggal: string;
  jilid: string | null;
  halaman: string | null;
  status: TilawatiStatus | '';
};

export type TilawatiRingkas = {
  santriId: number;
  nama: string;
  naik: number;
  tetap: number;
  terakhir: string;
  terakhirStatus: TilawatiStatus | '';
  terakhirJilid: string | null;
  terakhirHalaman: string | null;
  /* Rincian per hari (urut tanggal menaik) -- dipakai Riwayat
     Pembelajaran (bagian "Buku Jilid"). */
  hari: TilawatiHari[];
};

type BarisMentah = {
  santri_id: number;
  tanggal: string;
  status: string | null;
  buku_jilid: string | null;
  halaman: string | null;
  santri: { nama: string } | { nama: string }[] | null;
};

/** Per santri: jumlah "Naik" & "Tetap" di rentang + jilid/halaman/status
 *  terakhir. Hanya santri yang punya minimal satu catatan naik/tetap. */
export async function muatTilawatiRingkas(
  kelasId: number,
  awal: string,
  akhir: string,
): Promise<TilawatiRingkas[]> {
  const { data, error } = await supabase
    .from('tilawati_pelaksanaan')
    .select('santri_id, tanggal, status, buku_jilid, halaman, santri:santri_id(nama)')
    .eq('kelas_id', kelasId)
    .in('status', ['naik', 'tetap'])
    .gte('tanggal', awal)
    .lte('tanggal', akhir)
    .order('tanggal', { ascending: true });
  if (error) throw new Error(error.message);

  const peta = new Map<number, TilawatiRingkas>();
  for (const r of (data ?? []) as BarisMentah[]) {
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
        terakhirJilid: null,
        terakhirHalaman: null,
        hari: [] as TilawatiHari[],
      };
    const st = (r.status === 'naik' || r.status === 'tetap' ? r.status : '') as TilawatiStatus | '';
    if (st === 'naik') cur.naik += 1;
    else if (st === 'tetap') cur.tetap += 1;
    cur.hari.push({ tanggal: r.tanggal, jilid: r.buku_jilid, halaman: r.halaman, status: st });
    if (r.tanggal >= cur.terakhir) {
      cur.terakhir = r.tanggal;
      cur.terakhirStatus = (r.status as TilawatiStatus | null) ?? '';
      cur.terakhirJilid = r.buku_jilid;
      cur.terakhirHalaman = r.halaman;
    }
    peta.set(r.santri_id, cur);
  }
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/* ── Buku Jilid per santri utk Monitoring (2026-09-03, diminta owner) ──
   Beda dari muatTilawatiRingkas: menampilkan SEMUA santri di kelas
   (termasuk yg belum ada catatan), plus "halaman yg dicapai bulan itu"
   = selisih posisi terakhir dgn posisi pertama pada rentang. Satu jilid
   Tilawati (buku santri) = 44 halaman. "Paud" dihitung jilid 0. */
export type BukuJilidSantri = {
  santriId: number;
  nama: string;
  naik: number;
  tetap: number;
  /* Halaman yg dicapai pada rentang (selisih posisi awal-akhir). */
  halProgres: number;
  terakhirJilid: string | null;
  terakhirHalaman: string | null;
  adaCatatan: boolean;
};

export async function muatBukuJilidKelas(
  kelasId: number,
  awal: string,
  akhir: string,
): Promise<BukuJilidSantri[]> {
  const [sRes, tRes] = await Promise.all([
    supabase
      .from('santri')
      .select('id, nama, nama_panggilan')
      .eq('kelas_id', kelasId)
      .is('deleted_at', null)
      .order('nama'),
    supabase
      .from('tilawati_pelaksanaan')
      .select('santri_id, tanggal, status, buku_jilid, halaman')
      .eq('kelas_id', kelasId)
      .gte('tanggal', awal)
      .lte('tanggal', akhir)
      .order('tanggal', { ascending: true }),
  ]);
  if (sRes.error) throw new Error(sRes.error.message);
  if (tRes.error) throw new Error(tRes.error.message);

  const perSantri = new Map<
    number,
    { status: string | null; jilid: string | null; halaman: string | null }[]
  >();
  for (const r of (tRes.data ?? []) as {
    santri_id: number;
    status: string | null;
    buku_jilid: string | null;
    halaman: string | null;
  }[]) {
    const arr = perSantri.get(r.santri_id) ?? [];
    arr.push({ status: r.status, jilid: r.buku_jilid, halaman: r.halaman });
    perSantri.set(r.santri_id, arr);
  }

  return (
    (sRes.data ?? []) as { id: number; nama: string; nama_panggilan: string | null }[]
  ).map((s) => {
    const arr = perSantri.get(s.id) ?? [];
    /* Nama panggilan biar tidak kepanjangan (diminta owner 2026-09-03);
       fallback ke kata pertama nama lengkap, lalu nama lengkap. */
    const panggilan = s.nama_panggilan?.trim() || s.nama.trim().split(/\s+/)[0] || s.nama;
    let naik = 0;
    let tetap = 0;
    for (const r of arr) {
      if (r.status === 'naik') naik += 1;
      else if (r.status === 'tetap') tetap += 1;
    }
    const posisi = arr
      .map((r) => posisiTilawati(r.jilid, r.halaman))
      .filter((x): x is number => x != null);
    const halProgres =
      posisi.length >= 2 ? Math.max(0, posisi[posisi.length - 1] - posisi[0]) : 0;
    const last = arr.length > 0 ? arr[arr.length - 1] : null;
    return {
      santriId: s.id,
      nama: panggilan,
      naik,
      tetap,
      halProgres,
      terakhirJilid: last?.jilid ?? null,
      terakhirHalaman: last?.halaman ?? null,
      adaCatatan: arr.length > 0,
    };
  });
}
