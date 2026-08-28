/* Fitur Tabungan (2026-08-28) — tabungan generus per-SANTRI, beberapa
   jenis per kelompok (Rekreasi/Qurban/dst) + target bulanan.

   Alur uang (perluasan 2026-08-28, migrasi 20260828140000):
     TERIMA  guru terima tunai dari generus  -> saldo santri +, kas guru +
     SETOR   guru serahkan ke penghimpun     -> kas guru − (saldo santri tetap)
     TARIK   generus tarik tabungan          -> saldo santri − , WAJIB
             disetujui admin_kelompok (mulai status 'pending')

   Tabel: tabungan_jenis, tabungan_transaksi (terima/tarik + status),
   tabungan_penghimpun, tabungan_setoran. */

import { supabase } from './supabase';

export type TabunganJenis = {
  id: number;
  nama: string;
  target_bulanan: number | null;
  urutan: number;
};

export type StatusTarik = 'pending' | 'disetujui' | 'ditolak';

export type Transaksi = {
  id: number;
  jenis_id: number;
  santri_id: number;
  arah: 'terima' | 'tarik';
  jumlah: number;
  tanggal: string;
  keterangan: string | null;
  status: StatusTarik;
  dicatat_oleh: string | null;
  diputus_pada: string | null;
  catatan_keputusan: string | null;
  created_at: string;
};

export type Setoran = {
  id: number;
  kelompok_id: number;
  guru_id: number;
  jumlah: number;
  tanggal: string;
  keterangan: string | null;
  dicatat_oleh: string | null;
  created_at: string;
};

export type Penghimpun = {
  kelompok_id: number;
  guru_id: number | null;
  catatan: string | null;
};

const KOLOM_TX =
  'id, jenis_id, santri_id, arah, jumlah, tanggal, keterangan, status, dicatat_oleh, diputus_pada, catatan_keputusan, created_at';

export function formatRupiah(n: number): string {
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toLocaleString('id-ID');
  return `${neg ? '−' : ''}Rp ${s}`;
}

/* Hanya transaksi yang SUDAH final (terima selalu; tarik hanya kalau
   disetujui) yang menggerakkan saldo santri. */
export function txMempengaruhiSaldo(t: Transaksi): boolean {
  return t.arah === 'terima' || t.status === 'disetujui';
}

/* Saldo santri per jenis. Key `${santri_id}:${jenis_id}`. */
export function hitungSaldo(tx: Transaksi[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tx) {
    if (!txMempengaruhiSaldo(t)) continue;
    const k = `${t.santri_id}:${t.jenis_id}`;
    m.set(k, (m.get(k) ?? 0) + (t.arah === 'terima' ? t.jumlah : -t.jumlah));
  }
  return m;
}

/* Kas yang masih di tangan seorang guru (belum disetorkan ke penghimpun):
   Σ terima yang IA catat − Σ tarik disetujui yang IA catat − Σ setoran IA. */
export function kasDiTanganGuru(
  tx: Transaksi[],
  setoran: Setoran[],
  profileId: string | null,
  guruId: number | null,
): number {
  let kas = 0;
  for (const t of tx) {
    if (profileId && t.dicatat_oleh !== profileId) continue;
    if (t.arah === 'terima') kas += t.jumlah;
    else if (t.status === 'disetujui') kas -= t.jumlah;
  }
  for (const s of setoran) {
    if (guruId != null && s.guru_id === guruId) kas -= s.jumlah;
  }
  return kas;
}

export async function muatJenis(kelompokId: number): Promise<TabunganJenis[]> {
  const { data, error } = await supabase
    .from('tabungan_jenis')
    .select('id, nama, target_bulanan, urutan')
    .eq('kelompok_id', kelompokId)
    .eq('aktif', true)
    .order('urutan')
    .order('id');
  if (error) throw new Error(error.message);
  return (data ?? []) as TabunganJenis[];
}

export async function simpanJenis(
  kelompokId: number,
  id: number | null,
  isi: { nama: string; target_bulanan: number | null; urutan?: number },
  olehId: string | null,
): Promise<void> {
  if (id != null) {
    const { error } = await supabase
      .from('tabungan_jenis')
      .update({ nama: isi.nama, target_bulanan: isi.target_bulanan, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('tabungan_jenis').insert({
      kelompok_id: kelompokId,
      nama: isi.nama,
      target_bulanan: isi.target_bulanan,
      urutan: isi.urutan ?? 99,
      dibuat_oleh: olehId,
    });
    if (error) throw new Error(error.message);
  }
}

export async function hapusJenis(id: number): Promise<void> {
  const { error } = await supabase.from('tabungan_jenis').update({ aktif: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── transaksi ─────────────────────────────────────────────────────── */

export async function muatTransaksiKelompok(kelompokId: number): Promise<Transaksi[]> {
  const semua: Transaksi[] = [];
  const UK = 1000;
  for (let dari = 0; ; dari += UK) {
    const { data, error } = await supabase
      .from('tabungan_transaksi')
      .select(KOLOM_TX)
      .eq('kelompok_id', kelompokId)
      .order('id', { ascending: true })
      .range(dari, dari + UK - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Transaksi[];
    semua.push(...batch);
    if (batch.length < UK) break;
  }
  return semua;
}

export async function muatTransaksiSantri(santriIds: number[]): Promise<Transaksi[]> {
  if (santriIds.length === 0) return [];
  const semua: Transaksi[] = [];
  const UK = 1000;
  for (let dari = 0; ; dari += UK) {
    const { data, error } = await supabase
      .from('tabungan_transaksi')
      .select(KOLOM_TX)
      .in('santri_id', santriIds)
      .order('id', { ascending: true })
      .range(dari, dari + UK - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Transaksi[];
    semua.push(...batch);
    if (batch.length < UK) break;
  }
  return semua;
}

export async function catatTransaksi(
  kelompokId: number,
  isi: {
    jenis_id: number;
    santri_id: number;
    arah: 'terima' | 'tarik';
    jumlah: number;
    tanggal: string;
    keterangan: string | null;
  },
  olehId: string | null,
): Promise<void> {
  const { error } = await supabase.from('tabungan_transaksi').insert({
    kelompok_id: kelompokId,
    ...isi,
    status: isi.arah === 'tarik' ? 'pending' : 'disetujui',
    dicatat_oleh: olehId,
  });
  if (error) throw new Error(error.message);
}

/* Admin_kelompok memutus permintaan penarikan. */
export async function putuskanTarik(
  id: number,
  setuju: boolean,
  olehId: string | null,
  catatan?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('tabungan_transaksi')
    .update({
      status: setuju ? 'disetujui' : 'ditolak',
      diputus_oleh: olehId,
      diputus_pada: new Date().toISOString(),
      catatan_keputusan: catatan?.trim() || null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function hapusTransaksi(id: number): Promise<void> {
  const { error } = await supabase.from('tabungan_transaksi').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── penghimpun ────────────────────────────────────────────────────── */

export async function muatPenghimpun(kelompokId: number): Promise<Penghimpun | null> {
  const { data, error } = await supabase
    .from('tabungan_penghimpun')
    .select('kelompok_id, guru_id, catatan')
    .eq('kelompok_id', kelompokId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Penghimpun) ?? null;
}

export async function simpanPenghimpun(
  kelompokId: number,
  guruId: number | null,
  catatan: string | null,
  olehId: string | null,
): Promise<void> {
  const { error } = await supabase.from('tabungan_penghimpun').upsert(
    {
      kelompok_id: kelompokId,
      guru_id: guruId,
      catatan: catatan?.trim() || null,
      updated_oleh: olehId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'kelompok_id' },
  );
  if (error) throw new Error(error.message);
}

/* ── setoran ───────────────────────────────────────────────────────── */

export async function muatSetoranKelompok(kelompokId: number): Promise<Setoran[]> {
  const { data, error } = await supabase
    .from('tabungan_setoran')
    .select('id, kelompok_id, guru_id, jumlah, tanggal, keterangan, dicatat_oleh, created_at')
    .eq('kelompok_id', kelompokId)
    .order('tanggal', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Setoran[];
}

export async function catatSetoran(
  kelompokId: number,
  isi: { guru_id: number; jumlah: number; tanggal: string; keterangan: string | null },
  olehId: string | null,
): Promise<void> {
  const { error } = await supabase.from('tabungan_setoran').insert({
    kelompok_id: kelompokId,
    ...isi,
    dicatat_oleh: olehId,
  });
  if (error) throw new Error(error.message);
}

export async function hapusSetoran(id: number): Promise<void> {
  const { error } = await supabase.from('tabungan_setoran').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
