/* Pengecualian kalender per kelompok (2026-08-24) -- kelp yang TETAP
   masuk ngaji walau tanggal merah nasional ('aktif'), atau LIBUR
   MENDADAK di hari kerja biasa ('libur'). Diatur admin lewat
   app/pengaturan/page.tsx, disimpan di tabel `kalender_kelompok`
   (migrasi 20260824100000).

   Kalender libur NASIONAL sendiri (LIBUR_NASIONAL_2026,
   nonaktifAkhirPekanLibur) TIDAK disentuh sama sekali oleh berkas ini --
   diminta owner eksplisit ("kalender tanggal merah biarkan saja tetap
   merah"). File ini murni menumpangkan pengecualian per kelompok DI
   ATAS aturan nasional itu:
   - 'aktif' MEMBUKA kunci tanggal merah nasional (kelp tetap masuk) --
     TIDAK mengubah warna, murni soal bisa-diklik-atau-tidak di kalender.
   - 'libur' MENGUNCI tanggal yang sebetulnya hari kerja biasa, ditandai
     merah persis gaya libur nasional (owner tidak minta warna beda). */

import { supabase } from './supabase';
import { nonaktifAkhirPekanLibur } from './liburNasional';

export type JenisOverride = 'aktif' | 'libur';
export type OverrideKelompok = { jenis: JenisOverride; catatan: string | null };

export async function muatOverrideKelompok(
  kelompokId: number,
): Promise<Map<string, OverrideKelompok>> {
  const { data } = await supabase
    .from('kalender_kelompok')
    .select('tanggal, jenis, catatan')
    .eq('kelompok_id', kelompokId);
  const peta = new Map<string, OverrideKelompok>();
  (data ?? []).forEach((r) => peta.set(r.tanggal, { jenis: r.jenis as JenisOverride, catatan: r.catatan }));
  return peta;
}

/* Kumpulan tanggal (string YYYY-MM-DD) yang admin_kelompok tandai LIBUR
   mendadak. Dipakai utk MENGELUARKAN tanggal itu dari hitungan "Hari
   Aktif" di mana pun (Riwayat Kehadiran guru, kartu Ringkasan Kehadiran
   admin_kelp) -- diminta owner 2026-08-27: begitu admin meliburkan
   tanggal lampau yang terlanjur diisi guru, hari itu tidak lagi dihitung
   sbg hari aktif, konsisten dgn kolomnya yang jadi merah di Riwayat.
   'aktif' TIDAK relevan di sini (itu cuma membuka kunci tanggal merah
   nasional, bukan menambah/mengurangi hari aktif). */
/* True kalau tglStr (YYYY-MM-DD) jatuh di Sabtu/Minggu. Dipakai utk
   MENGELUARKAN akhir pekan dari hitungan "Hari Aktif" -- diminta owner
   2026-08-27: "Hari Aktif jangan hitung Sabtu/Minggu" (sesi yang
   terlanjur diinput guru di akhir pekan tidak boleh menaikkan angka).
   Kolom matrix Riwayat memang sudah cuma Senin-Jumat, ini menyelaraskan
   angkanya. */
export function adalahAkhirPekan(tglStr: string): boolean {
  const hari = new Date(tglStr + 'T00:00:00').getDay();
  return hari === 0 || hari === 6;
}

export function tanggalLiburKelompok(override: Map<string, OverrideKelompok>): Set<string> {
  const set = new Set<string>();
  override.forEach((v, tgl) => {
    if (v.jenis === 'libur') set.add(tgl);
  });
  return set;
}

/* SELF-HEAL: soft-delete (isi `deleted_at`) semua baris `absensi` kelompok
   pada tanggal2 yang ditandai libur dalam rentang [awal, akhir].
   Dibutuhkan karena penandaan libur (AdminKelpDashboard) hanya
   mengosongkan absensi yang SUDAH ADA SAAT ITU -- kalau tanggalnya
   diliburkan lalu (atau kalau penandaan pertama gagal mengosongkan),
   pemanggilan ini membereskannya begitu admin membuka Ringkasan
   Kehadiran. Idempoten: panggilan berikutnya tidak kena baris apa pun
   (filter `deleted_at IS NULL`). Diminta owner 2026-08-27.

   RLS: `absensi_update_guru_admin` mengizinkan admin_kelompok mengisi
   `deleted_at` scoped kelompoknya (hard delete `absensi_delete_ppg_only`
   = admin_ppg saja, jadi WAJIB soft delete). */
export async function bersihkanAbsensiTanggalLibur(
  kelompokId: number,
  awal: string,
  akhir: string,
  liburSet?: Set<string>,
): Promise<void> {
  const libur = liburSet ?? tanggalLiburKelompok(await muatOverrideKelompok(kelompokId));
  const dalamRentang = [...libur].filter((t) => t >= awal && t <= akhir);
  if (dalamRentang.length === 0) return;
  await supabase
    .from('absensi')
    .update({ deleted_at: new Date().toISOString() })
    .eq('kelompok_id', kelompokId)
    .in('tanggal', dalamRentang)
    .is('deleted_at', null);
}

/* Gabungkan kalender libur nasional (statis) dgn pengecualian per
   kelompok -- hasilnya cocok langsung dgn prop `tanggalNonaktif`
   TanggalPicker.tsx & dipakai jg sbg filter kandidat "hari kerja" di
   lib/pengingatAbsen.ts (bell/banner pengingat absen). */
export function buatCekNonaktif(override: Map<string, OverrideKelompok>) {
  return (tglStr: string, tgl: Date): { alasan: string; merah?: boolean } | null => {
    const ov = override.get(tglStr);
    if (ov?.jenis === 'aktif') return null;
    if (ov?.jenis === 'libur') return { alasan: ov.catatan || 'Libur (kelompok)', merah: true };
    return nonaktifAkhirPekanLibur(tglStr, tgl);
  };
}
