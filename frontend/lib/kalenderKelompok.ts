/* Pengecualian kalender per kelompok (2026-08-24) -- kelp yang TETAP
   masuk ngaji walau tanggal merah nasional ('aktif'), atau LIBUR
   MENDADAK di hari kerja biasa ('libur'). Diatur admin lewat
   AdminKelpDashboard (modal "Tandai Libur atau Aktif"), disimpan di tabel
   `kalender_kelompok` (migrasi 20260824100000).

   2026-09-09 (diminta owner): penandaan bisa HANYA kelas tertentu.
   `kalender_kelompok.kelas_ids` = NULL berarti seluruh kelompok (perilaku
   lama), array id kelas berarti hanya kelas itu. Di satu tanggal boleh
   ada 1 baris 'libur' + 1 baris 'aktif' (kelas A libur, kelas B tetap
   masuk) -- karena itu `PetaOverride` memetakan tanggal ke ARRAY baris,
   bukan satu baris.

   Resolusi per (tanggal, kelas) -- `overrideUntukKelas`:
     - entri SPESIFIK (kelas_ids memuat kelas itu) menang atas entri NULL;
     - pada kekhususan sama, 'aktif' menang atas 'libur' (aktif = KBM
       tetap jalan, jadi jangan hapus absensi).
   `kelasId = null` pada resolusi = "level kelompok": hanya entri NULL
   (seluruh kelompok) yang dianggap -- libur satu kelas TIDAK meliburkan
   kelompok.

   Kalender libur NASIONAL sendiri (LIBUR_NASIONAL_2026,
   nonaktifAkhirPekanLibur) TIDAK disentuh -- file ini menumpangkan
   pengecualian per kelompok DI ATAS aturan nasional. */

import { supabase } from './supabase';
import { nonaktifAkhirPekanLibur } from './liburNasional';

export type JenisOverride = 'aktif' | 'libur';

/* Satu baris kalender_kelompok (sudah dinormalkan). */
export type BarisOverride = {
  jenis: JenisOverride;
  catatan: string | null;
  kelasIds: number[] | null; // null = seluruh kelompok
};

/* Hasil resolusi utk satu (tanggal, kelas) -- bentuk lama, dipertahankan
   supaya pemanggil yang cuma butuh {jenis, catatan} tidak berubah. */
export type OverrideKelompok = { jenis: JenisOverride; catatan: string | null };

export type PetaOverride = Map<string, BarisOverride[]>;

export async function muatOverrideKelompok(kelompokId: number): Promise<PetaOverride> {
  const { data } = await supabase
    .from('kalender_kelompok')
    .select('tanggal, jenis, catatan, kelas_ids')
    .eq('kelompok_id', kelompokId);
  const peta: PetaOverride = new Map();
  (data ?? []).forEach((r) => {
    const baris: BarisOverride = {
      jenis: r.jenis as JenisOverride,
      catatan: r.catatan,
      kelasIds: (r.kelas_ids as number[] | null) ?? null,
    };
    const arr = peta.get(r.tanggal);
    if (arr) arr.push(baris);
    else peta.set(r.tanggal, [baris]);
  });
  return peta;
}

/* Resolusi 1 tanggal utk 1 kelas. `kelasId = null` -> level kelompok
   (hanya entri seluruh-kelompok). */
export function overrideUntukKelas(
  peta: PetaOverride,
  tanggal: string,
  kelasId: number | null,
): OverrideKelompok | null {
  const list = peta.get(tanggal);
  if (!list || list.length === 0) return null;

  const spesifik = list.filter(
    (b) => kelasId != null && b.kelasIds != null && b.kelasIds.includes(kelasId),
  );
  const kandidat = spesifik.length > 0 ? spesifik : list.filter((b) => b.kelasIds == null);
  if (kandidat.length === 0) return null;

  const pilih = kandidat.find((b) => b.jenis === 'aktif') ?? kandidat[0];
  return { jenis: pilih.jenis, catatan: pilih.catatan };
}

export function adalahAkhirPekan(tglStr: string): boolean {
  const hari = new Date(tglStr + 'T00:00:00').getDay();
  return hari === 0 || hari === 6;
}

/* Tanggal libur SELURUH kelompok (entri kelas_ids NULL) -- dipakai utk
   angka agregat tingkat kelompok yang tidak terikat satu kelas. */
export function tanggalLiburKelompok(peta: PetaOverride): Set<string> {
  const set = new Set<string>();
  peta.forEach((list, tgl) => {
    if (list.some((b) => b.jenis === 'libur' && b.kelasIds == null)) set.add(tgl);
  });
  return set;
}

/* Tanggal libur yang berlaku utk SATU kelas (spesifik + seluruh kelompok).
   `kelasId = null` -> sama dgn tanggalLiburKelompok. */
export function tanggalLiburKelas(peta: PetaOverride, kelasId: number | null): Set<string> {
  const set = new Set<string>();
  peta.forEach((_l, tgl) => {
    if (overrideUntukKelas(peta, tgl, kelasId)?.jenis === 'libur') set.add(tgl);
  });
  return set;
}

/* Saring baris absensi -> buang sesi Sabtu/Minggu & tanggal libur utk
   `kelasId` (null = level kelompok). Dipakai Laporan Perkembangan &
   GuruLaporanView supaya "Hari Aktif" dan persentase kehadiran konsisten.
   `rows` cukup punya field `tanggal` (YYYY-MM-DD). */
export function saringAbsensiHariKerja<T extends { tanggal: string }>(
  rows: T[],
  peta: PetaOverride,
  kelasId: number | null = null,
): T[] {
  return rows.filter(
    (r) =>
      !adalahAkhirPekan(r.tanggal) &&
      overrideUntukKelas(peta, r.tanggal, kelasId)?.jenis !== 'libur',
  );
}

/* SELF-HEAL: soft-delete baris `absensi` pada tanggal yang ditandai libur
   dalam rentang [awal, akhir]. Entri libur seluruh-kelompok -> semua
   absensi tanggal itu; entri libur per-kelas -> hanya santri di kelas itu.
   Idempoten (filter `deleted_at IS NULL`). Diminta owner 2026-08-27,
   diperluas per-kelas 2026-09-09.

   RLS: `absensi_update_guru_admin` mengizinkan admin_kelompok mengisi
   `deleted_at` scoped kelompoknya. */
export async function bersihkanAbsensiTanggalLibur(
  kelompokId: number,
  awal: string,
  akhir: string,
  peta?: PetaOverride,
): Promise<void> {
  const p = peta ?? (await muatOverrideKelompok(kelompokId));
  const now = new Date().toISOString();

  const tglSemua: string[] = [];
  const perKelas: { tanggal: string; kelasIds: number[] }[] = [];
  p.forEach((list, tgl) => {
    if (tgl < awal || tgl > akhir) return;
    const libur = list.find((b) => b.jenis === 'libur');
    if (!libur) return;
    if (libur.kelasIds == null) tglSemua.push(tgl);
    else perKelas.push({ tanggal: tgl, kelasIds: libur.kelasIds });
  });

  if (tglSemua.length > 0) {
    await supabase
      .from('absensi')
      .update({ deleted_at: now })
      .eq('kelompok_id', kelompokId)
      .in('tanggal', tglSemua)
      .is('deleted_at', null);
  }

  if (perKelas.length > 0) {
    const semuaKelasId = [...new Set(perKelas.flatMap((t) => t.kelasIds))];
    const { data: santri } = await supabase
      .from('santri')
      .select('id, kelas_id')
      .eq('kelompok_id', kelompokId)
      .in('kelas_id', semuaKelasId)
      .is('deleted_at', null);
    const santriPerKelas = new Map<number, number[]>();
    (santri ?? []).forEach((s) => {
      if (s.kelas_id == null) return;
      const arr = santriPerKelas.get(s.kelas_id) ?? [];
      arr.push(s.id);
      santriPerKelas.set(s.kelas_id, arr);
    });
    for (const t of perKelas) {
      const ids = t.kelasIds.flatMap((k) => santriPerKelas.get(k) ?? []);
      if (ids.length === 0) continue;
      await supabase
        .from('absensi')
        .update({ deleted_at: now })
        .eq('tanggal', t.tanggal)
        .in('santri_id', ids)
        .is('deleted_at', null);
    }
  }
}

/* Gabungkan kalender libur nasional (statis) dgn pengecualian per kelompok
   utk `kelasId` -- hasilnya cocok langsung dgn prop `tanggalNonaktif`
   TanggalPicker.tsx & filter kandidat "hari kerja" di lib/pengingatAbsen.ts.
   `kelasId = null` (pemilih tanggal sebelum kelas diketahui, mis. Input
   Absensi / komposer Pengumuman) -> tanggal hanya di-nonaktifkan kalau
   libur SELURUH kelompok. */
export function buatCekNonaktif(peta: PetaOverride, kelasId: number | null = null) {
  return (tglStr: string, tgl: Date): { alasan: string; merah?: boolean } | null => {
    const ov = overrideUntukKelas(peta, tglStr, kelasId);
    if (ov?.jenis === 'aktif') return null;
    if (ov?.jenis === 'libur') return { alasan: ov.catatan || 'Libur (kelompok)', merah: true };
    return nonaktifAkhirPekanLibur(tglStr, tgl);
  };
}
