/* Fitur "Shodaqoh" (2026-09-11) -- kolam uang TERPISAH dari Tabungan,
   di bawah menu Keuangan setelah Infaq Pengajian. Jenis BEBAS diatur
   admin_kelompok (contoh: "Shodaqoh Generus Sakit", "Shodaqoh Tali
   Asih Guru", dst -- tidak dikunci ke daftar itu), dan tiap jenis
   punya `mode` sendiri:
     'per_santri' -- siapa nyumbang berapa (pola sama Tabungan TERIMA).
     'global'     -- total terkumpul per kelas per tanggal, tanpa
                     atribusi ke anak (pola sama Infaq Pengajian).

   Alur uang: CATAT (guru) -> SETOR (guru -> penghimpun Shodaqoh,
   penghimpun ini SENDIRI, beda org dari penghimpun Tabungan). TIDAK
   ada "tarik" -- shodaqoh sifatnya searah masuk, bukan tabungan yang
   bisa diambil kembali.

   Tabel: shodaqoh_jenis, shodaqoh_transaksi, shodaqoh_penghimpun,
   shodaqoh_setoran (migrasi 20260911190000). */

import { supabase } from './supabase';

export type ModeShodaqoh = 'per_santri' | 'global';

export type ShodaqohJenis = {
  id: number;
  nama: string;
  mode: ModeShodaqoh;
  urutan: number;
};

export type ShodaqohTransaksi = {
  id: number;
  jenis_id: number;
  kelas_id: number | null;
  santri_id: number | null;
  jumlah: number;
  tanggal: string;
  keterangan: string | null;
  setoran_id: number | null;
  dicatat_oleh: string | null;
  dicatat_guru_id: number | null;
  created_at: string;
};

export type ShodaqohSetoran = {
  id: number;
  kelompok_id: number;
  guru_id: number;
  jumlah: number;
  tanggal: string;
  keterangan: string | null;
  dicatat_oleh: string | null;
  created_at: string;
};

export type ShodaqohPenghimpun = {
  kelompok_id: number;
  guru_id: number | null;
  catatan: string | null;
};

const KOLOM_TX =
  'id, jenis_id, kelas_id, santri_id, jumlah, tanggal, keterangan, setoran_id, dicatat_oleh, dicatat_guru_id, created_at';

/* Kas yang masih di tangan seorang guru (belum disetorkan ke penghimpun
   Shodaqoh). Tanpa arah 'tarik' -- beda dari Tabungan, jadi cukup jumlah
   catatan yang belum punya setoran_id. akuPenghimpun WAJIB true kalau
   pemanggilnya penghimpun sendiri (uang sudah di tujuan akhir). */
export function kasDiTanganGuru(
  tx: ShodaqohTransaksi[],
  profileId: string | null,
  akuPenghimpun = false,
): number {
  if (akuPenghimpun) return 0;
  return tx
    .filter((t) => t.setoran_id == null && (!profileId || t.dicatat_oleh === profileId))
    .reduce((a, t) => a + t.jumlah, 0);
}

export function belumSetor(
  tx: ShodaqohTransaksi[],
  profileId: string | null,
  akuPenghimpun = false,
): ShodaqohTransaksi[] {
  if (akuPenghimpun) return [];
  return tx.filter((t) => t.setoran_id == null && (!profileId || t.dicatat_oleh === profileId));
}

/* Cara-2: penghimpun mencatat langsung (mis. santri yang sakit bukan
   muridnya) -- tidak pernah punya baris setoran, jadi harus ikut
   dijumlahkan terpisah di panel penghimpun spt pola Tabungan. */
export function catatanLangsungPenghimpun(
  tx: ShodaqohTransaksi[],
  profileId: string | null,
): ShodaqohTransaksi[] {
  if (!profileId) return [];
  return tx.filter((t) => t.dicatat_oleh === profileId);
}

/* ── jenis ─────────────────────────────────────────────────────────── */

export async function muatJenis(kelompokId: number): Promise<ShodaqohJenis[]> {
  const { data, error } = await supabase
    .from('shodaqoh_jenis')
    .select('id, nama, mode, urutan')
    .eq('kelompok_id', kelompokId)
    .eq('aktif', true)
    .order('urutan')
    .order('id');
  if (error) throw new Error(error.message);
  return (data ?? []) as ShodaqohJenis[];
}

export async function simpanJenis(
  kelompokId: number,
  id: number | null,
  isi: { nama: string; mode: ModeShodaqoh; urutan?: number },
  olehId: string | null,
): Promise<void> {
  if (id != null) {
    const { error } = await supabase
      .from('shodaqoh_jenis')
      .update({ nama: isi.nama, mode: isi.mode, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('shodaqoh_jenis').insert({
      kelompok_id: kelompokId,
      nama: isi.nama,
      mode: isi.mode,
      urutan: isi.urutan ?? 99,
      dibuat_oleh: olehId,
    });
    if (error) throw new Error(error.message);
  }
}

export async function hapusJenis(id: number): Promise<void> {
  const { error } = await supabase.from('shodaqoh_jenis').update({ aktif: false }).eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── transaksi ─────────────────────────────────────────────────────── */

export async function muatTransaksiKelompok(kelompokId: number): Promise<ShodaqohTransaksi[]> {
  const semua: ShodaqohTransaksi[] = [];
  const UK = 1000;
  for (let dari = 0; ; dari += UK) {
    const { data, error } = await supabase
      .from('shodaqoh_transaksi')
      .select(KOLOM_TX)
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(dari, dari + UK - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as ShodaqohTransaksi[];
    semua.push(...batch);
    if (batch.length < UK) break;
  }
  return semua;
}

export async function catatTransaksi(
  kelompokId: number,
  isi: {
    jenis_id: number;
    kelas_id: number | null;
    santri_id: number | null;
    jumlah: number;
    tanggal: string;
    keterangan: string | null;
  },
  olehId: string | null,
  olehGuruId: number | null = null,
): Promise<void> {
  const { error } = await supabase.from('shodaqoh_transaksi').insert({
    kelompok_id: kelompokId,
    ...isi,
    dicatat_oleh: olehId,
    dicatat_guru_id: olehGuruId,
  });
  if (error) throw new Error(error.message);
}

/* Koreksi salah input -- soft-delete, HANYA boleh selama belum masuk
   setoran (ditegakkan RLS: shodaqoh_transaksi_update_guru_sendiri). */
export async function hapusTransaksi(id: number): Promise<void> {
  const { error } = await supabase
    .from('shodaqoh_transaksi')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── penghimpun ────────────────────────────────────────────────────── */

export async function muatPenghimpun(kelompokId: number): Promise<ShodaqohPenghimpun | null> {
  const { data, error } = await supabase
    .from('shodaqoh_penghimpun')
    .select('kelompok_id, guru_id, catatan')
    .eq('kelompok_id', kelompokId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ShodaqohPenghimpun) ?? null;
}

export async function simpanPenghimpun(
  kelompokId: number,
  guruId: number | null,
  catatan: string | null,
  olehId: string | null,
): Promise<void> {
  const { error } = await supabase.from('shodaqoh_penghimpun').upsert(
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

export async function muatSetoranKelompok(kelompokId: number): Promise<ShodaqohSetoran[]> {
  const { data, error } = await supabase
    .from('shodaqoh_setoran')
    .select('id, kelompok_id, guru_id, jumlah, tanggal, keterangan, dicatat_oleh, created_at')
    .eq('kelompok_id', kelompokId)
    .order('tanggal', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ShodaqohSetoran[];
}

export async function catatSetoran(
  kelompokId: number,
  isi: { guru_id: number; tanggal: string; keterangan: string | null },
  transaksiIds: number[],
  jumlah: number,
  olehId: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from('shodaqoh_setoran')
    .insert({ kelompok_id: kelompokId, ...isi, jumlah, dicatat_oleh: olehId })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  if (transaksiIds.length > 0) {
    const { error: e2 } = await supabase
      .from('shodaqoh_transaksi')
      .update({ setoran_id: (data as { id: number }).id })
      .in('id', transaksiIds);
    if (e2) throw new Error(e2.message);
  }
}

export async function hapusSetoran(id: number): Promise<void> {
  const { error } = await supabase.from('shodaqoh_setoran').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function muatRincianSetoran(setoranIds: number[]): Promise<ShodaqohTransaksi[]> {
  if (setoranIds.length === 0) return [];
  const { data, error } = await supabase
    .from('shodaqoh_transaksi')
    .select(KOLOM_TX)
    .in('setoran_id', setoranIds)
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ShodaqohTransaksi[];
}
