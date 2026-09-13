/* Laporan Tilawati per santri (2026-09-03, diminta owner) -- dipakai
   Riwayat Pembelajaran & Monitoring Pencapaian Materi. Sumber: tabel
   `tilawati_pelaksanaan` (migrasi 20260903120000), diisi guru di kartu
   "Tilawati" pada Pelaksanaan Pembelajaran. RLS tabel itu sudah
   membatasi ke kelas milik guru / scope admin. */

import { supabase } from './supabase';
import { posisiTilawati } from './pedomanTilawati';
import { DAFTAR_SURAT } from './suratAlQuran';

export type TilawatiStatus = 'naik' | 'tetap';

/* ── Konstanta & helper borang input Tilawati/Al-Qur'an (2026-09-13,
   dipindah dari PelaksanaanPembelajaranView.tsx) -- dipakai bersama
   komponen kartu itu & KartuTilawatiAlquran.tsx (kartu ganda utk kelas
   Gabung Kelas lintas-grade), supaya tidak diam-diam ngedrift kalau
   ditulis dua kali. Tilawati: Buku Jilid maks 6, Halaman maks 44
   (diminta owner). Lanjutan Al-Qur'an (2026-09-11): setelah Jilid 6,
   "Juz 1".."Juz 30" -- nilainya string persis "Juz N" (dicek
   labelBukuJilid()/posisiTilawati() di atas/bawah supaya tetap terurut &
   terformat benar di layar lain). */
export const TILAWATI_MAKS_JILID = 6;
export const TILAWATI_MAKS_JUZ = 30;
export const TILAWATI_MAKS_HALAMAN = 44;
/* Buku Jilid: "Paud" (buku sebelum Jilid 1), Jilid 1-6, lalu Juz 1-30. */
export const OPSI_BUKU_JILID = [
  { value: 'Paud', label: 'Paud' },
  ...Array.from({ length: TILAWATI_MAKS_JILID }, (_, i) => ({
    value: String(i + 1),
    label: `Jilid ${i + 1}`,
  })),
  ...Array.from({ length: TILAWATI_MAKS_JUZ }, (_, i) => ({
    value: `Juz ${i + 1}`,
    label: `Juz ${i + 1}`,
  })),
];
/* Kartu "Al-Qur'an" kelas 4+ (2026-09-12, diminta owner): Juz 1-30 polos
   (tanpa Paud/Jilid -- itu punya OPSI_BUKU_JILID di atas, khusus kartu
   Tilawati kelas PAUD-TK s.d. 3) + 114 Surat (lib/suratAlQuran.ts).
   value HARUS format "Juz N" (bukan angka polos) -- disimpan langsung ke
   kolom `buku_jilid` yang sama dgn dipakai OPSI_BUKU_JILID/
   lanjutkanTilawati/labelBukuJilid/posisiTilawati, yang semuanya
   mengenali pola persis "Juz N" via regex. Angka polos akan salah
   dibaca sbg Jilid N biasa di layar lain (Riwayat/Ringkasan/Monitoring). */
export const OPSI_JUZ_ALQURAN = Array.from({ length: TILAWATI_MAKS_JUZ }, (_, i) => ({
  value: `Juz ${i + 1}`,
  label: `Juz ${i + 1}`,
}));
export const OPSI_SURAT_ALQURAN = DAFTAR_SURAT.map((s) => ({
  value: s.nama,
  label: `${s.nomor}. ${s.nama}`,
  sublabel: `${s.jumlahAyat} ayat`,
}));
export function jepitTilawati(v: string, maks: number): string {
  const d = v.replace(/[^0-9]/g, '');
  if (d === '') return '';
  return String(Math.min(Math.max(Number(d), 1), maks));
}
/* Halaman Tilawati disimpan sbg SATU kolom teks di DB (tak berubah,
   tanpa migrasi) -- tapi diedit lewat DUA kolom kecil "Dari"/"Sampai"
   (diminta owner 2026-09-12: kadang generus baca lebih dari 1 halaman
   dalam satu pertemuan). "24" (satu halaman) tetap tersimpan apa
   adanya; "24-25" (rentang) cuma dipakai kalau dari != sampai --
   backward-compatible dgn catatan lama yang masih satu angka polos. */
export function uraikanHalaman(h: string): { dari: string; sampai: string } {
  const cocok = h.match(/^(\d+)\s*-\s*(\d+)$/);
  if (cocok) return { dari: cocok[1], sampai: cocok[2] };
  return { dari: h, sampai: h };
}
export function gabungHalaman(dari: string, sampai: string): string {
  if (dari === '' && sampai === '') return '';
  const d = dari || sampai;
  const s = sampai || dari;
  return d === s ? d : `${d}-${s}`;
}
/* Prefill hari ini dari catatan terakhir: kalau terakhir "naik", halaman
   maju satu; kalau lewat 44, pindah jilid berikutnya halaman 1 (maks
   jilid 6). Status hari ini dikosongkan -- guru yang memutuskan. */
export function lanjutkanTilawati(last: { jilid: string; halaman: string; status: string }): {
  jilid: string;
  halaman: string;
  surat: string;
  ayat: string;
  status: '' | 'naik' | 'tetap';
} {
  const cocokJuz = last.jilid.match(/^Juz\s*(\d+)$/i);
  let juz: number | null = cocokJuz ? Number(cocokJuz[1]) : null;
  let jil: number | null = cocokJuz ? null : Number(last.jilid);
  if (jil != null && !Number.isFinite(jil)) jil = null;
  /* Lanjutkan dari SISI "sampai" -- kalau kemarin rentang "24-25" (baca
     2 halaman), besok mulai dari halaman 26, bukan dari 24 lagi. */
  let hal = Number(uraikanHalaman(last.halaman).sampai);
  if (last.status === 'naik' && Number.isFinite(hal) && hal >= 1) {
    hal += 1;
    if (hal > TILAWATI_MAKS_HALAMAN) {
      hal = 1;
      if (juz != null) {
        juz = Math.min(juz + 1, TILAWATI_MAKS_JUZ);
      } else if (jil != null && jil >= 1) {
        if (jil >= TILAWATI_MAKS_JILID) {
          juz = 1;
          jil = null;
        } else {
          jil += 1;
        }
      }
    }
  }
  const jilidBaru =
    juz != null
      ? `Juz ${juz}`
      : jil != null && jil >= 1
        ? String(Math.min(jil, TILAWATI_MAKS_JILID))
        : last.jilid;
  return {
    jilid: jilidBaru,
    halaman:
      Number.isFinite(hal) && hal >= 1 ? String(Math.min(hal, TILAWATI_MAKS_HALAMAN)) : last.halaman,
    surat: '',
    ayat: '',
    status: '',
  };
}

/* Label tampil Buku Jilid -- "Paud" -> "Tilawati Paud", "Juz N" (lanjutan
   Al-Qur'an setelah khatam Jilid 6, 2026-09-11) tampil apa adanya (JANGAN
   diberi awalan "Jilid" -- akan jadi "Jilid Juz 3"), selain itu "Jilid N".
   Satu sumber dipakai RiwayatPembelajaranView, RingkasanJurnalKelp,
   PencapaianMateriView supaya format tidak drift antar layar. */
export function labelBukuJilid(jilid: string): string {
  if (jilid === 'Paud') return 'Tilawati Paud';
  if (/^juz\s*\d+/i.test(jilid)) return jilid;
  return `Jilid ${jilid}`;
}

export type TilawatiHari = {
  id: number;
  tanggal: string;
  jilid: string | null;
  halaman: string | null;
  /* Surat/Ayat -- kelas 4+ "Al-Qur'an" (2026-09-12, migrasi 20260912100000).
     null utk kelas 1-3 (Jilid/Halaman biasa). */
  surat: string | null;
  ayat: string | null;
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
  id: number;
  santri_id: number;
  tanggal: string;
  status: string | null;
  buku_jilid: string | null;
  halaman: string | null;
  surat: string | null;
  ayat: string | null;
  santri: { nama: string } | { nama: string }[] | null;
};

/** Per santri: jumlah "Naik" & "Tetap" di rentang + jilid/halaman/status
 *  terakhir. Hanya santri yang punya minimal satu catatan naik/tetap.
 *  `kelasId` boleh array (2026-09-13, Gabung Kelas "tanpa batas waktu")
 *  -- pakai `anggotaId` dari muatKelasGuru() kalau kelasnya sedang
 *  gabung aktif, supaya catatan kelas yang digabung ikut terbaca. */
export async function muatTilawatiRingkas(
  kelasId: number | number[],
  awal: string,
  akhir: string,
): Promise<TilawatiRingkas[]> {
  const { data, error } = await supabase
    .from('tilawati_pelaksanaan')
    .select('id, santri_id, tanggal, status, buku_jilid, halaman, surat, ayat, santri:santri_id(nama)')
    .in('kelas_id', Array.isArray(kelasId) ? kelasId : [kelasId])
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
    cur.hari.push({
      id: r.id,
      tanggal: r.tanggal,
      jilid: r.buku_jilid,
      halaman: r.halaman,
      surat: r.surat,
      ayat: r.ayat,
      status: st,
    });
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
  /* Surat/Ayat -- kelas 4+ "Al-Qur'an" (2026-09-12). null utk kelas 1-3. */
  terakhirSurat: string | null;
  terakhirAyat: string | null;
  adaCatatan: boolean;
};

/* `kelasId` boleh array (2026-09-13, Gabung Kelas "tanpa batas waktu"). */
export async function muatBukuJilidKelas(
  kelasId: number | number[],
  awal: string,
  akhir: string,
): Promise<BukuJilidSantri[]> {
  const ids = Array.isArray(kelasId) ? kelasId : [kelasId];
  const [sRes, tRes] = await Promise.all([
    supabase
      .from('santri')
      .select('id, nama, nama_panggilan')
      .in('kelas_id', ids)
      .is('deleted_at', null)
      .order('nama'),
    supabase
      .from('tilawati_pelaksanaan')
      .select('santri_id, tanggal, status, buku_jilid, halaman, surat, ayat')
      .in('kelas_id', ids)
      .gte('tanggal', awal)
      .lte('tanggal', akhir)
      .order('tanggal', { ascending: true }),
  ]);
  if (sRes.error) throw new Error(sRes.error.message);
  if (tRes.error) throw new Error(tRes.error.message);

  const perSantri = new Map<
    number,
    {
      status: string | null;
      jilid: string | null;
      halaman: string | null;
      surat: string | null;
      ayat: string | null;
    }[]
  >();
  for (const r of (tRes.data ?? []) as {
    santri_id: number;
    status: string | null;
    buku_jilid: string | null;
    halaman: string | null;
    surat: string | null;
    ayat: string | null;
  }[]) {
    const arr = perSantri.get(r.santri_id) ?? [];
    arr.push({ status: r.status, jilid: r.buku_jilid, halaman: r.halaman, surat: r.surat, ayat: r.ayat });
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
      terakhirSurat: last?.surat ?? null,
      terakhirAyat: last?.ayat ?? null,
      adaCatatan: arr.length > 0,
    };
  });
}
