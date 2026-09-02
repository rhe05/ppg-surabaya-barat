/* Tanggal Pencak Silat ASAD per kelompok (2026-09-03) -- pada tanggal
   ini TIDAK ADA sesi klasikal (kecuali kelas Remaja/SMA, disaring di
   komponen lewat nama ruang). Se-kelompok: satu guru menandai, semua
   guru kelompok itu ikut. Guru mana pun boleh membatalkan.
   Tabel `klasikal_asad` (migrasi 20260903100000), guru kelompok itu
   boleh SELECT + INSERT + DELETE lewat RLS. */

import { supabase } from './supabase';

/* True kalau kelas dgn nama ruang ini IKUT Pencak Silat ASAD. Owner
   2026-09-03: "yang tidak ikut asad hanya kelas remaja sma, kelas
   lainnya ikut semua". "Pra Remaja" mengandung "remaja" -> ikut
   dikecualikan (jenjang di atas Caberawit tidak latihan pencak silat
   bareng). */
export function kelasIkutAsad(namaRuang: string): boolean {
  const n = namaRuang.toLowerCase();
  return !/remaja|sma/.test(n);
}

export async function muatTanggalAsad(kelompokId: number): Promise<Set<string>> {
  const { data } = await supabase
    .from('klasikal_asad')
    .select('tanggal')
    .eq('kelompok_id', kelompokId);
  return new Set((data ?? []).map((r) => r.tanggal as string));
}

export async function tandaiAsad(
  kelompokId: number,
  tanggal: string,
  dibuatOleh: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('klasikal_asad')
    .upsert(
      { kelompok_id: kelompokId, tanggal, dibuat_oleh: dibuatOleh },
      { onConflict: 'kelompok_id,tanggal', ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export async function batalkanAsad(kelompokId: number, tanggal: string): Promise<void> {
  const { error } = await supabase
    .from('klasikal_asad')
    .delete()
    .eq('kelompok_id', kelompokId)
    .eq('tanggal', tanggal);
  if (error) throw new Error(error.message);
}
