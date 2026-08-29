/* Fitur Tabungan (2026-08-28) — tabungan generus per-SANTRI, beberapa
   jenis per kelompok (Rekreasi/Qurban/dst) + target bulanan.

   Alur uang (perluasan 2026-08-28, migrasi 20260828140000):
     TERIMA  guru terima tunai dari generus  -> saldo santri +, kas guru +
     SETOR   guru serahkan ke penghimpun     -> kas guru − (saldo santri tetap)
     TARIK   generus tarik tabungan          -> saldo santri − , WAJIB
             disetujui admin_kelompok (mulai status 'pending')

   DUA jalur masuk sejak 2026-08-29 (migrasi 20260829100000):
     cara 1  generus -> guru kelas -> Setor -> penghimpun
     cara 2  generus -> penghimpun LANGSUNG (tanpa Setor: uangnya sudah
             di tujuan akhir sejak detik pertama)
   Karena itu penerimaan yang dicatat penghimpun TIDAK pernah masuk
   hitungan "kas menunggu disetorkan" -- lihat terimaBelumSetor().

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
  setoran_id: number | null;
  dicatat_oleh: string | null;
  /* Guru pencatat, utk ditampilkan ("· Kak Ratna"). Terpisah dari
     dicatat_oleh krn profiles_self_read menutup pemetaan uuid -> nama di
     sisi klien. Null utk baris yang dicatat admin (bukan guru). */
  dicatat_guru_id: number | null;
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
  'id, jenis_id, santri_id, arah, jumlah, tanggal, keterangan, status, setoran_id, dicatat_oleh, dicatat_guru_id, diputus_pada, catatan_keputusan, created_at';

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
   Σ terima yang IA catat & BELUM masuk setoran − Σ tarik disetujui yang IA
   catat (dibayar dari kas itu). Terima yang sudah punya setoran_id sudah
   berpindah ke penghimpun.

   `akuPenghimpun` WAJIB diisi true kalau pemanggilnya penghimpun sendiri.
   Uang yang IA terima sudah berada di tujuan akhir sejak awal -- tanpa
   penjagaan ini aplikasi akan menghitungnya sbg "menunggu disetorkan" dan
   menagih orangnya menyetor KEPADA DIRINYA SENDIRI. */
export function kasDiTanganGuru(
  tx: Transaksi[],
  profileId: string | null,
  akuPenghimpun = false,
): number {
  if (akuPenghimpun) return 0;
  let kas = 0;
  for (const t of tx) {
    if (profileId && t.dicatat_oleh !== profileId) continue;
    if (t.arah === 'terima') {
      if (t.setoran_id == null) kas += t.jumlah;
    } else if (t.status === 'disetujui') {
      kas -= t.jumlah;
    }
  }
  return kas;
}

/* Terima milik guru ini yang belum dimasukkan ke setoran mana pun.
   Kosong utk penghimpun, alasan sama seperti kasDiTanganGuru di atas. */
export function terimaBelumSetor(
  tx: Transaksi[],
  profileId: string | null,
  akuPenghimpun = false,
): Transaksi[] {
  if (akuPenghimpun) return [];
  return tx.filter(
    (t) => t.arah === 'terima' && t.setoran_id == null && (!profileId || t.dicatat_oleh === profileId),
  );
}

/* Penerimaan CARA 2 -- generus menyerahkan langsung ke penghimpun, tanpa
   melewati guru kelas. Tidak pernah punya baris `tabungan_setoran` (tidak
   ada perpindahan tangan yang perlu dicatat), jadi kalau tidak ikut
   dijumlahkan di panel penghimpun, uang ini tidak muncul di total mana
   pun. */
export function terimaLangsungPenghimpun(
  tx: Transaksi[],
  profileId: string | null,
): Transaksi[] {
  if (!profileId) return [];
  return tx.filter((t) => t.arah === 'terima' && t.dicatat_oleh === profileId);
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
  olehGuruId: number | null = null,
): Promise<void> {
  const { error } = await supabase.from('tabungan_transaksi').insert({
    kelompok_id: kelompokId,
    ...isi,
    status: isi.arah === 'tarik' ? 'pending' : 'disetujui',
    dicatat_oleh: olehId,
    dicatat_guru_id: olehGuruId,
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

/* Setoran = seikat transaksi "terima" yang diserahkan guru ke penghimpun.
   jumlah = total transaksi terpilih. Setelah setoran dibuat, tiap terima
   ditandai setoran_id-nya -> otomatis keluar dari "kas di tangan" guru dan
   jadi rincian yang dilihat penghimpun. */
export async function catatSetoran(
  kelompokId: number,
  isi: { guru_id: number; tanggal: string; keterangan: string | null },
  terimaIds: number[],
  jumlah: number,
  olehId: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from('tabungan_setoran')
    .insert({ kelompok_id: kelompokId, ...isi, jumlah, dicatat_oleh: olehId })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  if (terimaIds.length > 0) {
    const { error: e2 } = await supabase
      .from('tabungan_transaksi')
      .update({ setoran_id: (data as { id: number }).id })
      .in('id', terimaIds);
    if (e2) throw new Error(e2.message);
  }
}

/* FK ON DELETE SET NULL -> transaksi terima yang tadinya masuk setoran ini
   otomatis kembali ke "kas di tangan" guru. */
export async function hapusSetoran(id: number): Promise<void> {
  const { error } = await supabase.from('tabungan_setoran').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* Rincian per-anak dari sekumpulan setoran (utk layar penghimpun / riwayat
   setoran guru). */
export async function muatRincianSetoran(setoranIds: number[]): Promise<Transaksi[]> {
  if (setoranIds.length === 0) return [];
  const { data, error } = await supabase
    .from('tabungan_transaksi')
    .select(KOLOM_TX)
    .in('setoran_id', setoranIds)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Transaksi[];
}
