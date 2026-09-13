import { supabase } from '@/lib/supabase';

/* Siapa saja anggota SEBUAH KELAS selama SEBUAH RENTANG TANGGAL.

   `absensi` tidak menyimpan kelas (kolomnya cuma santri_id/kelompok_id/
   tanggal/status) dan `santri.kelas_id` cuma menyimpan kelas SEKARANG --
   jadi layar berperiode tidak boleh menyaring `.eq('kelas_id', ...)`:
   begitu seorang santri naik/pindah kelas, riwayat bulan-bulan lampau
   ikut berpindah ke kelas barunya. Keanggotaan per periode dibaca dari
   tabel santri_kelas_riwayat (migrasi 20260901110000, diisi otomatis oleh
   trigger; perpindahan berlaku sejak AWAL BULAN dilakukannya).

   `mulai` & `selesai` di tabel itu INKLUSIF, selesai NULL = masih
   berlaku, jadi "beririsan dgn [awal, akhir]" = mulai <= akhir AND
   (selesai IS NULL OR selesai >= awal). */
/* `kelasId` boleh array (2026-09-13, Gabung Kelas "tanpa batas waktu") --
   dipakai kalau kelasnya sedang gabung aktif, supaya santri anggota
   kelas yang digabung ikut terhitung. Lihat lib/kelasGabungGilir.ts
   `anggotaId`. */
export async function santriIdsKelasPadaPeriode(
  kelasId: number | number[],
  awal: string,
  akhir: string,
): Promise<number[]> {
  const { data, error } = await supabase
    .from('santri_kelas_riwayat')
    .select('santri_id')
    .in('kelas_id', Array.isArray(kelasId) ? kelasId : [kelasId])
    .lte('mulai', akhir)
    .or(`selesai.is.null,selesai.gte.${awal}`);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.santri_id as number))];
}
