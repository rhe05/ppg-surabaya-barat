'use client';

/* Dashboard Kehadiran Kelompok -- mobile admin_kelompok (2026-08-24,
   Tier 1 dari 3 tier yang disepakati owner: fitur mobile admin_kelp).
   Dirender HANYA di viewport sempit (app/dashboard/page.tsx, via
   lib/useIsMobile.ts) -- di layar lebar admin_kelompok tetap melihat
   AdminDashboard biasa (desktop, TIDAK disentuh).

   Isinya (Tier 1, disepakati owner):
   1. KPI hari ini: berapa kelas sudah/belum diabsen + 4 kotak status
      (Hadir/Izin/Sakit/Alpa) se-kelompok -- lib/ringkasanAdminKelp.ts.
   2. "Guru Belum Isi Absen" -- daftar kelas+guru yang kelasnya belum
      py baris absensi hari ini, supaya admin bisa follow-up langsung.
   3. Kartu jalan pintas ke Persetujuan Generus/Akun & Pengumuman --
      halaman2 itu SENDIRI sudah cukup responsif (dicek: kartu vertikal,
      bukan tabel kaku), yang tadinya kurang cuma NAVIGASI menuju sana
      dari HP (ditambal via AdminHeader.tsx + MenuAdmin.tsx).

   Susulan Tier 2 (2026-08-24):
   4. "Kalender Hari Ini" -- quick-toggle kalender_kelompok (lib/
      kalenderKelompok.ts) LANGSUNG dari HP, tanpa buka /pengaturan
      desktop -- kebutuhan aslinya "hujan deras, libur mendadak hari
      ini" itu keputusan cepat, bukan yg mau diketik lewat form desktop.
      Kelola tanggal LAIN (bukan hari ini) tetap lewat /pengaturan.
   5. "Guru Sedang Izin/Cuti" -- read-only, guru_izin TIDAK py alur
      persetujuan admin (self-declared), murni "siapa yg tidak masuk
      hari ini" spy admin tahu tanpa perlu ditanya manual.
   6. "Kehadiran 30 Hari" -- ringkas persen + tren mini, numpang RPC
      statistik_kehadiran yg sudah ada (dipakai /statistik desktop),
      TIDAK ada query/RPC baru -- "Lihat Detail" ke /statistik utk
      analisis penuh (per kelompok, top/bottom santri, demografi).

   Susulan (2026-08-26): kartu KPI "Data Guru" di bawah grafik Kehadiran
   30 Hari -- Total guru + L/P + kategori (MT/MS/GB, singkatan
   Muballigh Tugasan/Muballigh Setempat/Guru Bantu -- lihat KATEGORI di
   components/guru/GuruForm.tsx, "Guru Mutu" sudah dihapus dari sana).
   Kartu KPI "Data Generus" TEPAT DI BAWAHNYA -- gaya DISAMAKAN dgn
   kartu Data Guru (diminta owner, putaran kelima): tile "Total" + satu
   tile per jenjang terisi (grid-cols-3, bukan lagi pil datar), masing2
   angka besar + L/P bertumpuk di samping (bukan bawah).

   Dropdown "Agustus - 2026" (2026-08-26, diminta owner: keduanya --
   Data Guru & Data Generus -- dapat filter periode SUNGGUHAN, bukan
   cuma label) -- PemilihBulanTahun di kanan-atas tiap kartu, state
   bulan/tahun SENDIRI2 per kartu. Query guru/santri TIDAK lagi
   memfilter deleted_at (RLS-nya scope-only, lihat komentar MentahGuru/
   MentahSantri) -- baris mentah disimpan sekali, ringkasanGuru/
   ringkasanSantri (useMemo) menghitung ulang "aktif sampai akhir bulan
   X" pakai mulai_mengajar/mulai_ngaji + deleted_at (fungsi
   aktifPadaBulan). Kategori/jenjang tetap pakai nilai TERKINI (tidak
   dicatat historis) -- lihat komentar lengkap di definisi MentahGuru.

   "Hari Aktif" (2026-08-26, mulanya kartu hero sendiri di paling atas,
   lalu diminta owner PINDAH KE DALAM "Ringkasan Kehadiran" -- grid-nya
   jadi 5 kolom, tile ini di depan Hadir/Izin/Sakit/Alpa).

   Definisi angkanya DIGANTI (2026-08-26, putaran kedua) dari
   "perhitungan kalender" (hari kerja teoritis, minus akhir pekan/
   tanggal merah/override kalender_kelompok) jadi ANGKA SUNGGUHAN:
   owner melaporkan kartu versi kalender bisa menampilkan angka LEBIH
   RENDAH dari kenyataan (mis. seorang guru sudah input absen 16 hari
   tapi kartu cuma bilang 15, krn kelasnya tetap jalan di tanggal yang
   kalender anggap libur). Sekarang dipakai `ringkasanBulan.
   hariAktifTerbanyak` -- kelas dgn JUMLAH TANGGAL ABSENSI TERBANYAK
   bulan ini (bukan rata2/kelas tertentu), dihitung bareng data
   Ringkasan Kehadiran yang sudah di-fetch (lib/ringkasanAdminKelp.ts::
   muatRingkasanRentang, field `hariAktifTerbanyak`) -- TIDAK ada query
   absensi tambahan. Gradient teal DISALIN PERSIS dari tile "Hari
   Aktif" GuruDashboard.tsx (diminta owner: "samakan spt milik guru")
   -- 18px, dua baris label "Hari"/"Aktif" uppercase, bukan pill
   persentase spt 4 tile status di sebelahnya (ini info struktural,
   bukan status kehadiran).

   Gaya visual meniru GuruDashboard.tsx (kartu kelas, kotak status warna)
   supaya "app kedua" ini terasa satu keluarga dgn app guru, bukan
   ditempel gaya lain. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calendar, CalendarDays, CalendarOff, CalendarCheck2, ChevronDown, ChevronRight, ClipboardCheck, Megaphone, MoreVertical, UserCheck, UserX } from 'lucide-react';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import Skeleton from '@/components/ui/Skeleton';
import RiwayatKehadiranKelasInline from '@/components/dashboard/RiwayatKehadiranKelasInline';
import {
  muatRingkasanBulan,
  muatRingkasanPerKelas,
  muatAbsensiBelumDiisiBulan,
  muatGuruSedangIzin,
  muatTrenKehadiranBulan,
  tanggalHariIniLokal,
  type RingkasanHariIni,
  type GuruIzinAktif,
  type KelasRingkasan,
  type KelasBelumIsiBulan,
} from '@/lib/ringkasanAdminKelp';

type StatusKalenderHariIni = { id: number; jenis: 'aktif' | 'libur'; catatan: string | null } | null;
type TitikTren = { tanggal: string; persen: number | null };
type StatistikRingkas = { persen: number | null; tren: TitikTren[] };
type HitungGenderKategori = { total: number; l: number; p: number };
type RingkasanGuru = {
  total: number;
  l: number;
  p: number;
  mt: HitungGenderKategori;
  ms: HitungGenderKategori;
  gb: HitungGenderKategori;
};

/* Singkatan kategori guru (2026-08-26, diminta owner) -- KATEGORI penuh
   ada di components/guru/GuruForm.tsx; "Guru Mutu" sudah dihapus dari
   pilihan form itu jadi tidak disertakan di sini juga. Tiap kategori
   sekarang py breakdown L/P sendiri (diminta owner 2026-08-26, putaran
   kedua: kartu Data Guru dirombak jadi PERSIS 4 kartu -- Total Guru,
   MT, MS, GB -- masing2 nomor besar + "L: x · P: y" kecil di bawahnya,
   warna aksen dipakai bareng components/dashboard/GuruKelpMobile.tsx
   KATEGORI_WARNA supaya "MT" di sini & badge kategori di kartu Data
   Guru mobile terasa satu bahasa warna, bukan kebetulan mirip). */
const KATEGORI_SINGKAT: { kunci: keyof Pick<RingkasanGuru, 'mt' | 'ms' | 'gb'>; label: string; nama: string; warna: string }[] = [
  { kunci: 'mt', label: 'MT', nama: 'Muballigh Tugasan', warna: 'text-indigo' },
  { kunci: 'ms', label: 'MS', nama: 'Muballigh Setempat', warna: 'text-sage' },
  { kunci: 'gb', label: 'GB', nama: 'Guru Bantu', warna: 'text-text-dim' },
];

/* Baris MENTAH guru/santri (2026-08-26, diminta owner: kartu Data Guru
   & Data Generus dapat dropdown "Agustus - 2026" sendiri2, dan angkanya
   HARUS dihitung ulang sungguhan sesuai bulan yang dipilih -- bukan
   cuma label). Query TIDAK memfilter deleted_at lagi (RLS guru_select_
   scoped/santri_select_scoped scope-nya cuma kelompok, TIDAK
   menyembunyikan baris soft-delete -- dicek migrasi
   20260815000000_sync_dari_produksi.sql), supaya guru/santri yang
   SUDAH di-nonaktifkan SEKARANG tapi masih aktif di bulan yang dipilih
   tetap ikut terhitung. Kategori/jenjang dipakai APA ADANYA (nilai
   TERKINI) -- perubahan kategori/jenjang tidak dicatat historis, jadi
   ini best-effort: populasi (siapa yang ikut dihitung) benar2 per bulan,
   tapi label kategorinya kategori/jenjang TERAKHIR guru/santri itu. */
type MentahGuru = {
  jenis_kelamin: string | null;
  kategori: string | null;
  mulai_mengajar: string | null;
  deleted_at: string | null;
};
type MentahSantri = {
  gender: string | null;
  jenjang_saat_ini: string | null;
  mulai_ngaji: string | null;
  deleted_at: string | null;
};

/* "Aktif pada bulan X" = sudah mulai (mulai_mengajar/mulai_ngaji <=
   akhir bulan itu, atau belum diisi sama sekali -- dihitung tetap ikut,
   sama spt app selama ini memperlakukan field opsional) DAN belum
   di-nonaktifkan SAAT ITU (deleted_at null, atau baru terjadi SETELAH
   akhir bulan itu). */
function aktifPadaBulan(mulai: string | null, deletedAt: string | null, akhirBulan: Date): boolean {
  if (mulai && new Date(mulai) > akhirBulan) return false;
  if (deletedAt && new Date(deletedAt) <= akhirBulan) return false;
  return true;
}

/* Kartu KPI "Data Generus" disamakan gayanya dgn "Data Guru" di atas
   (diminta owner 2026-08-26) -- jenjang jg py breakdown L/P sendiri
   (HitungGenderKategori, TIPE SAMA dgn RingkasanGuru.mt/ms/gb), bukan
   lagi pil datar "PAUD/TK 12" tanpa gender. */
type RingkasanSantri = { total: number; l: number; p: number; jenjang: Record<string, HitungGenderKategori> };

/* Urutan jenjang persis enum santri_jenjang (components/santri/SantriForm.tsx
   JENJANG) -- dipakai utk urutan tile di kartu KPI, bukan sumber nilai. */
const JENJANG_URUTAN = ['PAUD/TK', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja'];

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
/* 'YYYY-MM-DD' -> "28 Agustus 2026", utk tombol pemicu TanggalPicker di
   modal Tandai Libur/Aktif. */
function fmtTglPanjang(v: string) {
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  return `${d} ${NAMA_BULAN[m - 1] ?? m} ${y}`;
}

const SELECT_BULAN_TAHUN =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text';

const GAYA_TOOLTIP = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-card)',
  fontSize: 12,
  color: 'var(--text)',
};

const STATUS: { kunci: keyof Omit<RingkasanHariIni, 'totalKelas' | 'kelasSudahDiabsen' | 'guruBelumIsi'>; label: string; warna: string }[] = [
  { kunci: 'hadir', label: 'HADIR', warna: '#059669' },
  { kunci: 'izin', label: 'IZIN', warna: '#4F46E5' },
  { kunci: 'sakit', label: 'SAKIT', warna: '#B45309' },
  { kunci: 'alpa', label: 'ALPA', warna: '#DC2626' },
];

/* Rincian per kelas (2026-08-24) -- pill warna disamakan PERSIS dgn
   GuruDashboard.tsx (STATUS const di sana), supaya kartunya benar2
   terasa "diambil dari dashboard guru", bukan gaya baru. */
const STATUS_KELAS: { kunci: keyof Omit<KelasRingkasan, 'kelasId' | 'kelasNama' | 'guruNama' | 'kategori' | 'ruangan' | 'jamMulai' | 'jamSelesai' | 'santriCount' | 'hariAktif'>; label: string; warna: string; pill: string }[] = [
  { kunci: 'hadir', label: 'HADIR', warna: '#059669', pill: 'rgba(5, 150, 105, 0.12)' },
  { kunci: 'izin', label: 'IZIN', warna: '#4F46E5', pill: 'rgba(79, 70, 229, 0.12)' },
  { kunci: 'sakit', label: 'SAKIT', warna: '#B45309', pill: 'rgba(180, 83, 9, 0.12)' },
  { kunci: 'alpa', label: 'ALPA', warna: '#DC2626', pill: 'rgba(220, 38, 38, 0.12)' },
];

/* "Kak Neiza" bukan nama lengkap (2026-08-24, diminta owner) -- ambil
   kata pertama nama guru saja, prefix "Kak" (sapaan umum di app ini,
   dipakai jg di teks WhatsApp pengumuman). */
function namaPanggilanGuru(namaLengkap: string) {
  const depan = namaLengkap.trim().split(/\s+/)[0];
  return depan ? `Kak ${depan}` : namaLengkap;
}

function jamSingkat(nilai: string | null) {
  return nilai ? nilai.slice(0, 5) : null;
}

function durasiMenitKelas(mulai: string | null, selesai: string | null) {
  const a = jamSingkat(mulai);
  const b = jamSingkat(selesai);
  if (!a || !b) return null;
  const [ha, ma] = a.split(':').map(Number);
  const [hb, mb] = b.split(':').map(Number);
  if ([ha, ma, hb, mb].some((n) => Number.isNaN(n))) return null;
  const selisih = hb * 60 + mb - (ha * 60 + ma);
  return selisih > 0 ? selisih : null;
}

/* Dropdown "Agustus - 2026" (2026-08-26, diminta owner) -- dipasang di
   kanan-atas judul kartu Data Guru/Data Generus, sejajar judulnya.
   Trigger SENGAJA cuma teks warna indigo (2026-08-26, putaran kedua:
   owner minta panah bawah & bungkus kotak/border dihapus -- "cukup
   tulisan bulan dan tahun saja") -- BUKAN chip/pill spt tombol lain di
   dashboard ini, supaya kelihatan seperti link, bukan tombol besar.
   Diklik -> panel melayang 2 <select> (bulan+tahun), pola SAMA PERSIS
   dgn popup kalender "Ringkasan Kehadiran" di komponen ini (posisi
   dihitung dari getBoundingClientRect, bukan portal -- sudah terbukti
   tidak ke-clip di halaman ini). Dipakai 2x (kartu Data Guru & Data
   Generus) dgn state bulan/tahun MASING2 SENDIRI -- sengaja tidak
   berbagi dgn bulan/tahun "Ringkasan Kehadiran" di atas: dua konteks
   berbeda (kehadiran per sesi vs populasi guru/santri per bulan),
   owner tidak pernah minta keduanya harus selalu sama. */
function PemilihBulanTahun({
  bulan,
  tahun,
  onUbah,
}: {
  bulan: number;
  tahun: number;
  onUbah: (bulan: number, tahun: number) => void;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [posisi, setPosisi] = useState<{ top: number; right: number } | null>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);
  const tahunSekarang = new Date().getFullYear();

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={tombolRef}
        onClick={() => {
          const rect = tombolRef.current?.getBoundingClientRect();
          if (rect) setPosisi({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
          setTerbuka((v) => !v);
        }}
        className="cursor-pointer border-none bg-transparent text-[11px] font-bold text-indigo active:opacity-70"
      >
        {NAMA_BULAN[bulan - 1]} - {tahun}
      </button>
      {terbuka && posisi && (
        <>
          <div className="fixed inset-0 z-[1090]" onClick={() => setTerbuka(false)} />
          <div
            className="fixed z-[1100] w-[220px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
            style={{ top: posisi.top, right: posisi.right }}
          >
            <div className="flex gap-2">
              <select
                value={bulan}
                onChange={(e) => onUbah(Number(e.target.value), tahun)}
                className={SELECT_BULAN_TAHUN}
              >
                {NAMA_BULAN.map((nm, idx) => (
                  <option key={nm} value={idx + 1}>
                    {nm}
                  </option>
                ))}
              </select>
              <select
                value={tahun}
                onChange={(e) => onUbah(bulan, Number(e.target.value))}
                className={SELECT_BULAN_TAHUN}
              >
                {[tahunSekarang - 1, tahunSekarang].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonKpi() {
  return (
    <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      <Skeleton className="h-[15px] w-2/5" />
      <div className="mt-3 grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[58px] w-full" />
        ))}
      </div>
    </div>
  );
}

export default function AdminKelpDashboard() {
  const { profile } = useAuth();
  const router = useRouter();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [error, setError] = useState<string | null>(null);
  const [jumlahPermintaan, setJumlahPermintaan] = useState(0);

  /* Kartu "Ringkasan Kehadiran" (2026-08-24, diminta owner) -- bisa
     ditelusuri per bulan lewat ikon kalender, pola SAMA PERSIS
     GuruDashboard.tsx. */
  const sekarangAwal = new Date();
  const [bulan, setBulan] = useState(sekarangAwal.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarangAwal.getFullYear());
  const [kalenderKpiTerbuka, setKalenderKpiTerbuka] = useState(false);
  const [posisiKalenderKpi, setPosisiKalenderKpi] = useState<{ top: number; right: number } | null>(null);
  const ikonKalenderKpiRef = useRef<HTMLSpanElement>(null);
  const [ringkasanBulan, setRingkasanBulan] = useState<RingkasanHariIni | null>(null);
  const [loadingBulan, setLoadingBulan] = useState(true);

  /* Rincian per kelas (2026-08-24, diminta owner) -- diklik utk buka/
     tutup, data baru dimuat SETELAH dibuka (bukan sekaligus dgn KPI
     bulan di atas, supaya beban query tidak dobel kalau owner tidak
     pernah membuka rinciannya). Diklik lagi -> tutup, state kelasnya
     TETAP disimpan (tidak fetch ulang) sampai bulan/tahun berganti. */
  const [detailKelasTerbuka, setDetailKelasTerbuka] = useState(false);
  const [kelasRingkasan, setKelasRingkasan] = useState<KelasRingkasan[] | null>(null);
  const [loadingKelas, setLoadingKelas] = useState(false);
  /* Kartu kelas mana yang riwayat kehadirannya sedang dibuka inline
     (2026-08-27) -- klik kartu = buka, klik lagi = tutup. */
  const [riwayatKelasId, setRiwayatKelasId] = useState<number | null>(null);
  /* Dinaikkan tiap kali kalender kelompok berubah (tandai/batal libur) --
     memaksa Ringkasan Kehadiran + rinciannya dimuat ulang karena baris
     absensi ikut dikosongkan saat sebuah tanggal ditandai libur. */
  const [kalenderNonce, setKalenderNonce] = useState(0);

  const [kalenderHariIni, setKalenderHariIni] = useState<StatusKalenderHariIni>(null);
  const [memuatKalender, setMemuatKalender] = useState(true);
  const [sibukKalender, setSibukKalender] = useState(false);
  /* "Tandai Libur" WAJIB diisi alasan dulu (diminta owner 2026-08-24) --
     bukan sekali-tap langsung tersimpan tanpa keterangan, supaya nanti
     ada jejak KENAPA hari itu diliburkan (tersimpan di kolom `catatan`
     yang sudah ada di tabel kalender_kelompok, bukan kolom baru). Modal
     konfirmasi kecil, bukan prompt() browser -- konsisten gaya popup
     lain di app ini. */
  const [modalLiburTerbuka, setModalLiburTerbuka] = useState(false);
  const [alasanLibur, setAlasanLibur] = useState('');
  /* Tanggal yang mau diliburkan (2026-08-27, diminta owner) -- boleh
     tanggal lampau maupun yang akan datang, bukan cuma hari ini. Default
     hari ini saat modal dibuka. */
  const [tanggalLibur, setTanggalLibur] = useState(tanggalHariIniLokal());
  /* Entri kalender_kelompok yang SUDAH ada utk `tanggalLibur` (dicek tiap
     tanggal di modal berganti) -- kalau ada & jenisnya libur, modal
     menampilkan tombol "Batalkan Libur" alih-alih "Konfirmasi". */
  const [liburTanggalItu, setLiburTanggalItu] = useState<StatusKalenderHariIni>(null);
  /* Admin kelp kini bisa menandai LIBUR maupun TETAP AKTIF dari modal yang
     sama (diminta owner 2026-08-28). "Tetap aktif" dipakai utk membuka
     kunci tanggal yang sebetulnya akhir pekan / tanggal merah nasional
     tapi kelompoknya tetap masuk -- dua-duanya baris kalender_kelompok,
     bedanya cuma kolom `jenis`. */
  const [jenisPenandaan, setJenisPenandaan] = useState<'libur' | 'aktif'>('libur');
  /* Kalender kustom di modal, samakan dgn fitur lain (2026-08-28).
     SENGAJA tanpa `tanggalNonaktif`: admin justru perlu bisa memilih
     Sabtu/Minggu & tanggal merah -- itu tepatnya tanggal yang mau
     ditandai "tetap aktif". */
  const [pickerLiburBuka, setPickerLiburBuka] = useState(false);
  const [posPickerLibur, setPosPickerLibur] = useState<PosisiPicker | null>(null);
  const refPickerLibur = useRef<HTMLButtonElement>(null);

  /* "Absensi Belum di Input" (2026-08-24, diminta owner: rename dari
     "Guru Belum Isi Absen" + direntang jadi PER GURU per bulan, bukan
     lagi per-kelas hari ini) -- kartu ini SENDIRI jg diklik utk buka/
     tutup rinciannya, sama pola dgn "Ringkasan Kehadiran" di atas.
     Dimuat eager (bukan lazy spt rincian kelas) krn badge jumlah guru
     di kondisi TERTUTUP tetap perlu datanya. */
  const [belumIsiBulan, setBelumIsiBulan] = useState<KelasBelumIsiBulan[]>([]);
  const [loadingBelumIsi, setLoadingBelumIsi] = useState(true);
  const [detailBelumIsiTerbuka, setDetailBelumIsiTerbuka] = useState(false);

  const [guruIzin, setGuruIzin] = useState<GuruIzinAktif[]>([]);

  const [statistik, setStatistik] = useState<StatistikRingkas | null>(null);
  const [memuatStatistik, setMemuatStatistik] = useState(true);
  /* Kartu "Performa" (2026-08-27, diminta owner): tren dihitung PER BULAN
     kalender yang dipilih, bukan lagi jendela bergulir 30 hari. */
  const [bulanPerforma, setBulanPerforma] = useState(sekarangAwal.getMonth() + 1);
  const [tahunPerforma, setTahunPerforma] = useState(sekarangAwal.getFullYear());

  /* Data MENTAH (belum difilter per bulan) -- dimuat SEKALI per kelompok,
     penghitungan ulang per bulan terjadi di useMemo di bawah (klik ganti
     bulan tidak query ulang, cuma filter ulang array yg sudah ada). */
  const [mentahGuru, setMentahGuru] = useState<MentahGuru[]>([]);
  const [siapMentahGuru, setSiapMentahGuru] = useState(false);
  const [mentahSantri, setMentahSantri] = useState<MentahSantri[]>([]);
  const [siapMentahSantri, setSiapMentahSantri] = useState(false);
  const [bulanGuruKpi, setBulanGuruKpi] = useState(sekarangAwal.getMonth() + 1);
  const [tahunGuruKpi, setTahunGuruKpi] = useState(sekarangAwal.getFullYear());
  const [bulanSantriKpi, setBulanSantriKpi] = useState(sekarangAwal.getMonth() + 1);
  const [tahunSantriKpi, setTahunSantriKpi] = useState(sekarangAwal.getFullYear());

  const muatBelumIsi = useCallback(async () => {
    if (!kelompokId) {
      setLoadingBelumIsi(false);
      return;
    }
    setLoadingBelumIsi(true);
    setError(null);
    try {
      const hasil = await muatAbsensiBelumDiisiBulan(kelompokId, tahun, bulan);
      setBelumIsiBulan(hasil);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat absensi belum diisi.');
    } finally {
      setLoadingBelumIsi(false);
    }
  }, [kelompokId, tahun, bulan]);

  useEffect(() => {
    muatBelumIsi();
  }, [muatBelumIsi]);

  useEffect(() => {
    if (!kelompokId) {
      setLoadingBulan(false);
      return;
    }
    let batal = false;
    setLoadingBulan(true);
    muatRingkasanBulan(kelompokId, tahun, bulan)
      .then((hasil) => {
        if (!batal) setRingkasanBulan(hasil);
      })
      .catch((e) => {
        if (!batal) setError(e instanceof Error ? e.message : 'Gagal memuat ringkasan bulan.');
      })
      .finally(() => {
        if (!batal) setLoadingBulan(false);
      });
    return () => {
      batal = true;
    };
  }, [kelompokId, tahun, bulan, kalenderNonce]);

  useEffect(() => {
    setKelasRingkasan(null);
    setRiwayatKelasId(null);
  }, [kelompokId, tahun, bulan, kalenderNonce]);

  useEffect(() => {
    if (!detailKelasTerbuka || !kelompokId || kelasRingkasan !== null) return;
    let batal = false;
    setLoadingKelas(true);
    muatRingkasanPerKelas(kelompokId, tahun, bulan)
      .then((hasil) => {
        if (!batal) setKelasRingkasan(hasil);
      })
      .catch((e) => {
        if (!batal) setError(e instanceof Error ? e.message : 'Gagal memuat rincian kelas.');
      })
      .finally(() => {
        if (!batal) setLoadingKelas(false);
      });
    return () => {
      batal = true;
    };
  }, [detailKelasTerbuka, kelompokId, tahun, bulan, kelasRingkasan]);

  useEffect(() => {
    let batal = false;
    supabase
      .from('permintaan_generus')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => {
        if (!batal) setJumlahPermintaan(count ?? 0);
      });
    return () => {
      batal = true;
    };
  }, []);

  const muatKalenderHariIni = useCallback(async () => {
    if (!kelompokId) {
      setMemuatKalender(false);
      return;
    }
    setMemuatKalender(true);
    const { data } = await supabase
      .from('kalender_kelompok')
      .select('id, jenis, catatan')
      .eq('kelompok_id', kelompokId)
      .eq('tanggal', tanggalHariIniLokal())
      .maybeSingle();
    setKalenderHariIni((data as StatusKalenderHariIni) ?? null);
    setMemuatKalender(false);
  }, [kelompokId]);

  useEffect(() => {
    muatKalenderHariIni();
  }, [muatKalenderHariIni]);

  async function tandaiLiburHariIni() {
    if (!kelompokId || !alasanLibur.trim() || !tanggalLibur) return;
    setSibukKalender(true);
    try {
      const { error: err } = await supabase.from('kalender_kelompok').insert({
        kelompok_id: kelompokId,
        tanggal: tanggalLibur,
        jenis: jenisPenandaan,
        catatan: alasanLibur.trim(),
        dibuat_oleh: profile?.id ?? null,
      });
      if (err) {
        if (err.code === '23505') {
          setError('Tanggal itu sudah ditandai di kalender kelompok.');
          setModalLiburTerbuka(false);
          setAlasanLibur('');
          await muatKalenderHariIni();
          return;
        }
        throw new Error(err.message);
      }

      /* Kosongkan absensi yang terlanjur diinput guru utk tanggal ini
         (2026-08-27, diminta owner) -- kalau tanggalnya libur berarti
         TIDAK ADA KBM, jadi semua catatan kehadiran di tanggal itu tidak
         valid. Soft-delete (isi `deleted_at`) mengikuti pola alat koreksi
         admin (app/kelola-absensi/page.tsx) -- policy UPDATE absensi
         ber-scope sudah mengizinkan admin_kelompok mengosongkan kelompok
         sendiri tanpa hak hapus penuh (absensi_delete_ppg_only = admin_ppg
         saja). Datanya tidak benar2 hilang dari DB, bisa dipulihkan lewat
         SQL kalau ternyata keliru -- TAPI membatalkan libur TIDAK otomatis
         memunculkannya lagi. */
      /* HANYA utk jenis 'libur'. Menandai "tetap aktif" justru menyatakan
         KBM tetap berjalan, jadi absensi yang sudah diisi harus dibiarkan
         apa adanya (2026-08-28, saat opsi 'aktif' ditambahkan). */
      if (jenisPenandaan === 'libur') {
        const { error: errWipe } = await supabase
          .from('absensi')
          .update({ deleted_at: new Date().toISOString() })
          .eq('kelompok_id', kelompokId)
          .eq('tanggal', tanggalLibur)
          .is('deleted_at', null);
        if (errWipe) throw new Error(errWipe.message);
      }

      /* Pengumuman OTOMATIS (2026-08-24, diminta owner) -- begitu admin
         menandai libur, guru kelompoknya harus lihat kabar ini lewat
         lonceng (BellPermintaanGuru.tsx), bukan cuma diam2 di kalender
         yang tidak semua orang buka. Insert biasa ke tabel `pengumuman`
         yang SUDAH ada (halaman /pengumuman, RLS-nya sudah izinkan
         admin_kelompok insert scoped kelompoknya sendiri -- migrasi
         20260818140000), TIDAK ada tabel/kolom baru. Kegagalan di sini
         SENGAJA tidak membatalkan penandaan kalender di atas (aksi utama
         sudah berhasil) -- diam2 saja kalau pengumumannya gagal dibuat. */
      const hariIniStr = tanggalLibur;
      const [thnP, blnP, tglP] = hariIniStr.split('-').map(Number);
      try {
        await supabase.from('pengumuman').insert({
          kelompok_id: kelompokId,
          judul:
            jenisPenandaan === 'libur'
              ? `Libur KBM (${tglP} ${NAMA_BULAN[blnP - 1]} ${thnP})`
              : `KBM Tetap Masuk (${tglP} ${NAMA_BULAN[blnP - 1]} ${thnP})`,
          isi: alasanLibur.trim(),
          tanggal: hariIniStr,
          dibuat_oleh: profile?.id ?? null,
        });
      } catch {
        // Non-kritis -- penandaan kalender tetap berhasil walau ini gagal.
      }

      setModalLiburTerbuka(false);
      setAlasanLibur('');
      setTanggalLibur(tanggalHariIniLokal());
      setKalenderNonce((n) => n + 1);
      await Promise.all([muatKalenderHariIni(), muatBelumIsi()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menandai libur.');
    } finally {
      setSibukKalender(false);
    }
  }

  /* batalkanKalenderHariIni() DIHAPUS 2026-08-28: tombol "Batalkan" di
     kartu sudah tidak ada -- pembatalan kini lewat modal yang sama
     (batalkanLiburTanggalItu), yang bisa membatalkan tanggal APA PUN,
     bukan cuma hari ini. */

  useEffect(() => {
    if (!modalLiburTerbuka || !kelompokId || !tanggalLibur) {
      setLiburTanggalItu(null);
      return;
    }
    let batal = false;
    supabase
      .from('kalender_kelompok')
      .select('id, jenis, catatan')
      .eq('kelompok_id', kelompokId)
      .eq('tanggal', tanggalLibur)
      .maybeSingle()
      .then(({ data }) => {
        if (!batal) setLiburTanggalItu((data as StatusKalenderHariIni) ?? null);
      });
    return () => {
      batal = true;
    };
  }, [modalLiburTerbuka, kelompokId, tanggalLibur]);

  async function batalkanLiburTanggalItu() {
    if (!liburTanggalItu) return;
    setSibukKalender(true);
    try {
      const { error: err } = await supabase
        .from('kalender_kelompok')
        .delete()
        .eq('id', liburTanggalItu.id);
      if (err) throw new Error(err.message);
      setModalLiburTerbuka(false);
      setAlasanLibur('');
      setTanggalLibur(tanggalHariIniLokal());
      setKalenderNonce((n) => n + 1);
      await Promise.all([muatKalenderHariIni(), muatBelumIsi()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membatalkan libur.');
    } finally {
      setSibukKalender(false);
    }
  }

  useEffect(() => {
    if (!kelompokId) return;
    let batal = false;
    muatGuruSedangIzin(kelompokId)
      .then((hasil) => {
        if (!batal) setGuruIzin(hasil);
      })
      .catch(() => {
        // Non-kritis -- gagal diam-diam, bagian sekunder dashboard.
      });
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  useEffect(() => {
    if (!kelompokId) {
      setMemuatStatistik(false);
      return;
    }
    let batal = false;
    setMemuatStatistik(true);
    muatTrenKehadiranBulan(kelompokId, tahunPerforma, bulanPerforma)
      .then((tren) => {
        if (batal) return;
        const berdata = tren.filter((t) => t.persen !== null);
        const persen =
          berdata.length > 0
            ? Math.round(berdata.reduce((s, t) => s + (t.persen ?? 0), 0) / berdata.length)
            : null;
        setStatistik({ persen, tren });
      })
      .catch(() => {
        if (!batal) setStatistik({ persen: null, tren: [] });
      })
      .finally(() => {
        if (!batal) setMemuatStatistik(false);
      });
    return () => {
      batal = true;
    };
  }, [kelompokId, bulanPerforma, tahunPerforma]);

  /* Kartu KPI "Data Guru" (2026-08-26, diminta owner: taruh di bawah
     grafik Kehadiran 30 Hari) -- hitung dari tabel `guru` langsung, tidak
     ada RPC baru. RLS sudah menyempitkan ke kelompok admin ini sendiri,
     sama seperti query GuruList.tsx desktop. Query TIDAK memfilter
     deleted_at (lihat komentar MentahGuru di atas) -- baris mentah,
     penghitungan per bulan terjadi di ringkasanGuru (useMemo) di bawah.
     .eq('kelompok_id', ...) DITAMBAHKAN (2026-08-26, audit resource
     Supabase -- SUPABASE_RESOURCE_AUDIT.md temuan HIGH #2): sebelumnya
     query ini SATU-SATUNYA di seluruh codebase yang murni mengandalkan
     RLS tanpa filter eksplisit sama sekali. Hasilnya TIDAK berubah (RLS
     admin_kelompok sudah membatasi ke kelompok sendiri), ini murni
     membantu Postgres mempersempit baris lebih awal. */
  useEffect(() => {
    if (!kelompokId) return;
    let batal = false;
    supabase
      .from('guru')
      .select('jenis_kelamin, kategori, mulai_mengajar, deleted_at')
      .eq('kelompok_id', kelompokId)
      .then(({ data }) => {
        if (batal) return;
        setMentahGuru((data ?? []) as MentahGuru[]);
        setSiapMentahGuru(true);
      });
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  const ringkasanGuru = useMemo<RingkasanGuru | null>(() => {
    if (!siapMentahGuru) return null;
    const akhirBulan = new Date(tahunGuruKpi, bulanGuruKpi, 0, 23, 59, 59, 999);
    const kosong = (): HitungGenderKategori => ({ total: 0, l: 0, p: 0 });
    const hasil: RingkasanGuru = { total: 0, l: 0, p: 0, mt: kosong(), ms: kosong(), gb: kosong() };
    const tambah = (k: HitungGenderKategori, gender: string | null) => {
      k.total += 1;
      if (gender === 'L') k.l += 1;
      else if (gender === 'P') k.p += 1;
    };
    for (const g of mentahGuru) {
      if (!aktifPadaBulan(g.mulai_mengajar, g.deleted_at, akhirBulan)) continue;
      hasil.total += 1;
      if (g.jenis_kelamin === 'L') hasil.l += 1;
      else if (g.jenis_kelamin === 'P') hasil.p += 1;
      if (g.kategori === 'Muballigh Tugasan') tambah(hasil.mt, g.jenis_kelamin);
      else if (g.kategori === 'Muballigh Setempat') tambah(hasil.ms, g.jenis_kelamin);
      else if (g.kategori === 'Guru Bantu') tambah(hasil.gb, g.jenis_kelamin);
    }
    return hasil;
  }, [mentahGuru, siapMentahGuru, bulanGuruKpi, tahunGuruKpi]);

  /* Kartu KPI "Data Generus" (2026-08-26, diminta owner: taruh di bawah
     Data Guru) -- sama pola dgn mentahGuru/ringkasanGuru di atas: baris
     mentah dari tabel `santri`, dihitung ulang per bulan di useMemo.
     .eq('kelompok_id', ...) DITAMBAHKAN (audit resource Supabase, temuan
     HIGH #2 -- lihat komentar sama di query guru di atas). */
  useEffect(() => {
    if (!kelompokId) return;
    let batal = false;
    supabase
      .from('santri')
      .select('gender, jenjang_saat_ini, mulai_ngaji, deleted_at')
      .eq('kelompok_id', kelompokId)
      .then(({ data }) => {
        if (batal) return;
        setMentahSantri((data ?? []) as MentahSantri[]);
        setSiapMentahSantri(true);
      });
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  const ringkasanSantri = useMemo<RingkasanSantri | null>(() => {
    if (!siapMentahSantri) return null;
    const akhirBulan = new Date(tahunSantriKpi, bulanSantriKpi, 0, 23, 59, 59, 999);
    const jenjang: Record<string, HitungGenderKategori> = {};
    let total = 0;
    let l = 0;
    let p = 0;
    for (const s of mentahSantri) {
      if (!aktifPadaBulan(s.mulai_ngaji, s.deleted_at, akhirBulan)) continue;
      total += 1;
      if (s.gender === 'L') l += 1;
      else if (s.gender === 'P') p += 1;
      if (s.jenjang_saat_ini) {
        const k = (jenjang[s.jenjang_saat_ini] ??= { total: 0, l: 0, p: 0 });
        k.total += 1;
        if (s.gender === 'L') k.l += 1;
        else if (s.gender === 'P') k.p += 1;
      }
    }
    return { total, l, p, jenjang };
  }, [mentahSantri, siapMentahSantri, bulanSantriKpi, tahunSantriKpi]);

  const totalStatus = ringkasanBulan
    ? ringkasanBulan.hadir + ringkasanBulan.izin + ringkasanBulan.sakit + ringkasanBulan.alpa
    : 0;
  const persenKelasSelesai =
    ringkasanBulan && ringkasanBulan.totalKelas > 0
      ? Math.round((ringkasanBulan.kelasSudahDiabsen / ringkasanBulan.totalKelas) * 100)
      : 0;

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Dashboard" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        {loadingBelumIsi && <Skeleton className="mb-4 h-[62px] w-full rounded-card" />}

        {!loadingBelumIsi && belumIsiBulan.length > 0 && (
          <div className="mb-4 rounded-card border border-[#FDE68A] bg-[#FFFBEB] shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
            <button
              type="button"
              onClick={() => setDetailBelumIsiTerbuka((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent p-4 text-left"
            >
              <span className="flex items-center gap-2 text-[13px] font-bold text-[#92400E]">
                Absensi Belum di Input
                <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#FEF3C7] px-[6px] text-[11px] font-bold text-[#92400E]">
                  {belumIsiBulan.length}
                </span>
              </span>
              <ChevronDown
                size={16}
                className={`shrink-0 text-[#92400E] transition-transform duration-200 ${detailBelumIsiTerbuka ? 'rotate-180' : ''}`}
              />
            </button>
            {detailBelumIsiTerbuka && (
              <div className="flex flex-col gap-2.5 border-t border-[#FDE68A] px-4 pt-3 pb-4">
                {belumIsiBulan.map((k) => {
                  const persen = k.totalHari > 0 ? Math.round((k.jumlahHari / k.totalHari) * 100) : 0;
                  return (
                    <div key={k.kelasId} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-[#92400E]">{k.kelasNama}</span>
                        <span className="block text-[11.5px] text-[#92400E]/80">{namaPanggilanGuru(k.guruNama)}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold text-[#92400E]">
                          Belum isi {k.jumlahHari} dari {k.totalHari} hari
                        </span>
                        <span className="block text-[11.5px] text-[#92400E]/80">{persen}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!loadingBelumIsi && belumIsiBulan.length === 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-card border border-[#A7F3D0] bg-[#ECFDF5] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D1FAE5] text-sage">
              <CalendarCheck2 size={17} />
            </span>
            <span className="text-[13px] font-bold text-sage">Alhamdulillah, Absensi Sudah di Input</span>
          </div>
        )}

        {loadingBulan && <SkeletonKpi />}

        {!loadingBulan && ringkasanBulan && (
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <button
              type="button"
              onClick={() => setDetailKelasTerbuka((v) => !v)}
              className="mb-3 flex w-full cursor-pointer items-start justify-between gap-3 border-none bg-transparent p-0 text-left"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[13px] font-bold text-text">Ringkasan Kehadiran</span>
                  <span className="text-[11.5px] text-text-dim">
                    {ringkasanBulan.kelasSudahDiabsen} dari {ringkasanBulan.totalKelas} kelas
                  </span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-text-faint transition-transform duration-200 ${detailKelasTerbuka ? 'rotate-180' : ''}`}
                  />
                </div>
                <div className="mt-0.5 text-[11px] text-text-dim">
                  {NAMA_BULAN[bulan - 1]} {tahun} · {persenKelasSelesai}% kelas terisi
                </div>
              </div>
              <span
                role="button"
                aria-label="Pilih Bulan dan Tahun"
                ref={ikonKalenderKpiRef}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setPosisiKalenderKpi({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
                  setKalenderKpiTerbuka((v) => !v);
                }}
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#EEF2FF] text-indigo transition-all duration-150 active:scale-[0.92]"
              >
                <Calendar size={17} />
              </span>
            </button>
            <div className="grid grid-cols-5 gap-2">
              {ringkasanBulan && (
                <div
                  className="flex flex-col items-center gap-[3px] rounded-[10px] px-1 pt-2.5 pb-[9px] shadow-[0_4px_14px_rgba(13,148,136,0.26),inset_0_1px_0_rgba(255,255,255,0.14)]"
                  style={{ background: 'linear-gradient(155deg, #0F766E 0%, #0D9488 60%, #14B8A6 100%)' }}
                >
                  <span className="text-[18px] leading-none font-extrabold text-white tabular-nums">
                    {ringkasanBulan.hariAktifTerbanyak}
                  </span>
                  <span className="mt-px text-[10.5px] font-bold tracking-[0.02em] text-white/85 uppercase">
                    Hari
                  </span>
                  <span className="text-[10.5px] font-bold tracking-[0.02em] text-white/85 uppercase">
                    Aktif
                  </span>
                </div>
              )}
              {STATUS.map((st) => {
                const nilai = ringkasanBulan[st.kunci];
                const persen = totalStatus > 0 ? Math.round((nilai / totalStatus) * 100) : null;
                return (
                  <div
                    key={st.kunci}
                    className="flex flex-col items-center gap-[3px] rounded-[10px] bg-panel-2 px-1 pt-2.5 pb-[9px]"
                  >
                    <span className="text-[18px] leading-none font-extrabold tabular-nums" style={{ color: st.warna }}>
                      {nilai}
                    </span>
                    {persen !== null && (
                      <span
                        className="rounded-full px-[7px] py-0.5 text-[10px] leading-none font-bold tabular-nums"
                        style={{ background: `${st.warna}1F`, color: st.warna }}
                      >
                        {persen}%
                      </span>
                    )}
                    <span className="mt-px text-center text-[10.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {detailKelasTerbuka && (
              <div className="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
                {loadingKelas && (
                  <>
                    <Skeleton className="h-[120px] w-full" />
                    <Skeleton className="h-[120px] w-full" />
                  </>
                )}
                {!loadingKelas && kelasRingkasan && kelasRingkasan.length === 0 && (
                  <p className="text-[12.5px] text-text-dim">Belum ada kelas dengan santri di kelompok ini.</p>
                )}
                {!loadingKelas &&
                  kelasRingkasan?.map((k) => {
                    const totalStatusKelas = k.hadir + k.izin + k.sakit + k.alpa;
                    const menit = durasiMenitKelas(k.jamMulai, k.jamSelesai);
                    const info: string[] = [k.guruNama];
                    if (k.ruangan) info.push(k.ruangan);
                    info.push(`${k.santriCount} Santri`);
                    if (jamSingkat(k.jamMulai) && jamSingkat(k.jamSelesai)) {
                      info.push(
                        `${jamSingkat(k.jamMulai)}–${jamSingkat(k.jamSelesai)}${menit != null ? ` · Durasi ${menit} Menit` : ''}`,
                      );
                    }
                    return (
                      <div key={k.kelasId} className="rounded-[var(--radius-lg)] border border-border bg-panel-2 p-3.5">
                        <button
                          type="button"
                          onClick={() =>
                            setRiwayatKelasId((c) => (c === k.kelasId ? null : k.kelasId))
                          }
                          className="w-full cursor-pointer border-none bg-transparent p-0 text-left"
                        >
                          <div className="mb-1 flex items-baseline justify-between gap-2">
                            <span className="text-[14px] font-bold text-text">
                              {k.kelasNama}
                              {k.kategori === 'Cabe Rawit' && (
                                <span className="text-[11.5px] font-semibold text-sage"> · Cabe Rawit</span>
                              )}
                            </span>
                            <ChevronDown
                              size={15}
                              className={`shrink-0 text-text-faint transition-transform duration-200 ${
                                riwayatKelasId === k.kelasId ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                          <div className="mb-1 text-[12px] font-semibold text-text-dim">{info.join(' · ')}</div>
                          <div className="mt-3 grid grid-cols-5 gap-1.5">
                          <div
                            className="flex flex-col items-center gap-[3px] rounded-[10px] px-1 pt-2.5 pb-[9px] shadow-[0_4px_14px_rgba(13,148,136,0.26),inset_0_1px_0_rgba(255,255,255,0.14)]"
                            style={{ background: 'linear-gradient(155deg, #0F766E 0%, #0D9488 60%, #14B8A6 100%)' }}
                          >
                            <span className="text-[16px] leading-none font-extrabold text-white tabular-nums">
                              {k.hariAktif}
                            </span>
                            <span className="mt-px text-[10.5px] font-bold tracking-[0.02em] text-white/85 uppercase">
                              Hari
                            </span>
                            <span className="text-[10.5px] font-bold tracking-[0.02em] text-white/85 uppercase">
                              Aktif
                            </span>
                          </div>
                          {STATUS_KELAS.map((st) => {
                            const nilai = k[st.kunci];
                            const persen = totalStatusKelas > 0 ? Math.round((nilai / totalStatusKelas) * 100) : null;
                            return (
                              <div
                                key={st.kunci}
                                className="flex flex-col items-center gap-[3px] rounded-[10px] bg-panel px-1 pt-2.5 pb-[9px]"
                              >
                                <span className="text-[16px] leading-none font-extrabold tabular-nums" style={{ color: st.warna }}>
                                  {nilai}
                                </span>
                                {persen !== null && (
                                  <span
                                    className="rounded-full px-[6px] py-0.5 text-[10.5px] leading-none font-bold tabular-nums"
                                    style={{ background: st.pill, color: st.warna }}
                                  >
                                    {persen}%
                                  </span>
                                )}
                                <span className="mt-px text-center text-[10.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                                  {st.label}
                                </span>
                              </div>
                            );
                          })}
                          </div>
                        </button>
                        {riwayatKelasId === k.kelasId && kelompokId && (
                          <RiwayatKehadiranKelasInline
                            kelasId={k.kelasId}
                            kelompokId={kelompokId}
                            tahun={tahun}
                            bulan={bulan}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {kalenderKpiTerbuka && posisiKalenderKpi && (
          <>
            <div className="fixed inset-0 z-[1090]" onClick={() => setKalenderKpiTerbuka(false)} />
            <div
              className="fixed z-[1100] w-[240px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
              style={{ top: posisiKalenderKpi.top, right: posisiKalenderKpi.right }}
            >
              <div className="flex gap-2">
                <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={SELECT_BULAN_TAHUN}>
                  {NAMA_BULAN.map((nm, idx) => (
                    <option key={nm} value={idx + 1}>
                      {nm}
                    </option>
                  ))}
                </select>
                <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={SELECT_BULAN_TAHUN}>
                  {[sekarangAwal.getFullYear() - 1, sekarangAwal.getFullYear()].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {guruIzin.length > 0 && (
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-text">
              <UserX size={15} className="text-text-dim" />
              Guru Sedang Izin/Cuti ({guruIzin.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {guruIzin.map((g) => (
                <div key={g.guruId} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-text">{g.guruNama}</span>
                  <span className="text-text-dim">
                    {g.jenis === 'cuti' ? 'Cuti' : 'Izin'} s.d. {g.tanggalSelesai}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!memuatStatistik && statistik && (
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-[13px] font-bold text-text">Performa</div>
              <div className="flex shrink-0 items-center gap-3">
                <PemilihBulanTahun
                  bulan={bulanPerforma}
                  tahun={tahunPerforma}
                  onUbah={(b, t) => {
                    setBulanPerforma(b);
                    setTahunPerforma(t);
                  }}
                />
                <button
                  type="button"
                  aria-label="Buka Statistik"
                  onClick={() => router.push('/statistik')}
                  className="-mr-1 shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-dim active:opacity-60"
                >
                  <MoreVertical size={17} />
                </button>
              </div>
            </div>
            {statistik.tren.length === 0 ? (
              <p className="mt-3 mb-1 text-[12px] text-text-dim">
                Belum ada catatan kehadiran pada {NAMA_BULAN[bulanPerforma - 1]} {tahunPerforma}.
              </p>
            ) : (
            <div className="mt-2 h-[90px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={statistik.tren} margin={{ top: 4, right: 4, bottom: 0, left: -30 }}>
                  <XAxis
                    dataKey="tanggal"
                    tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
                    stroke="var(--border)"
                    tickFormatter={(t: string) => t.slice(8)}
                    minTickGap={22}
                  />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={GAYA_TOOLTIP}
                    formatter={(v) => [`${v}%`, 'Kehadiran']}
                  />
                  <Line type="monotone" dataKey="persen" stroke="var(--brass)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            )}
          </div>
        )}

        {ringkasanGuru && (
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-[13px] font-bold text-text">Data Guru</div>
              <PemilihBulanTahun
                bulan={bulanGuruKpi}
                tahun={tahunGuruKpi}
                onUbah={(b, t) => {
                  setBulanGuruKpi(b);
                  setTahunGuruKpi(t);
                }}
              />
            </div>
            {/* PERSIS 4 kartu sejajar satu baris (diminta owner 2026-08-26).
                L/P diminta DI SAMPING angka, bukan di bawahnya (putaran
                keempat) -- jadi per kartu: judul kecil di atas, lalu satu
                baris angka besar + L/P bertumpuk kecil di sampingnya
                (kanan), bukan lagi baris L/P terpisah di bawah. L/P
                TETAP hitam (text-text). */}
            <div className="grid grid-cols-4 gap-1.5">
              <div className="rounded-[10px] bg-panel-2 px-2 pt-2.5 pb-2">
                <div className="truncate text-[10.5px] font-bold tracking-[0.01em] text-text-dim uppercase">
                  Total
                </div>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="text-[17px] leading-none font-extrabold tabular-nums text-brass">
                    {ringkasanGuru.total}
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-[10.5px] leading-tight font-bold text-text">
                    <span>L{ringkasanGuru.l}</span>
                    <span>P{ringkasanGuru.p}</span>
                  </span>
                </div>
              </div>
              {KATEGORI_SINGKAT.map((k) => {
                const hitung = ringkasanGuru[k.kunci];
                return (
                  <div key={k.kunci} title={k.nama} className="rounded-[10px] bg-panel-2 px-2 pt-2.5 pb-2">
                    <div className="truncate text-[10.5px] font-bold tracking-[0.01em] text-text-dim uppercase">
                      {k.label}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className={`text-[17px] leading-none font-extrabold tabular-nums ${k.warna}`}>
                        {hitung.total}
                      </span>
                      <span className="flex shrink-0 flex-col items-end text-[10.5px] leading-tight font-bold text-text">
                        <span>L{hitung.l}</span>
                        <span>P{hitung.p}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {ringkasanSantri && (
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-[13px] font-bold text-text">Data Generus</div>
              <PemilihBulanTahun
                bulan={bulanSantriKpi}
                tahun={tahunSantriKpi}
                onUbah={(b, t) => {
                  setBulanSantriKpi(b);
                  setTahunSantriKpi(t);
                }}
              />
            </div>
            {/* Gaya SAMA PERSIS dgn kartu Data Guru di atas (diminta owner
                2026-08-26) -- tile "Total" + satu tile per jenjang yang
                terisi (bukan lagi pil datar tanpa L/P), masing2 judul
                kecil di atas + angka besar & L/P bertumpuk di sampingnya.
                grid-cols-3 (bukan -4 spt Data Guru) krn jenjang bisa
                sampai 5 + Total = 6 tile, kolom lebih lebar supaya nama
                jenjang yang lebih panjang ("Remaja SMA") masih terbaca. */}
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-[10px] bg-panel-2 px-2 pt-2.5 pb-2">
                <div className="truncate text-[10.5px] font-bold tracking-[0.01em] text-text-dim uppercase">
                  Total
                </div>
                <div className="mt-1 flex items-center justify-between gap-1">
                  <span className="text-[17px] leading-none font-extrabold tabular-nums text-brass">
                    {ringkasanSantri.total}
                  </span>
                  <span className="flex shrink-0 flex-col items-end text-[10.5px] leading-tight font-bold text-text">
                    <span>L{ringkasanSantri.l}</span>
                    <span>P{ringkasanSantri.p}</span>
                  </span>
                </div>
              </div>
              {JENJANG_URUTAN.filter((j) => ringkasanSantri.jenjang[j]).map((j) => {
                const hitung = ringkasanSantri.jenjang[j];
                return (
                  <div key={j} title={j} className="rounded-[10px] bg-panel-2 px-2 pt-2.5 pb-2">
                    <div className="truncate text-[10.5px] font-bold tracking-[0.01em] text-text-dim uppercase">
                      {j}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className="text-[17px] leading-none font-extrabold tabular-nums text-sage">
                        {hitung.total}
                      </span>
                      <span className="flex shrink-0 flex-col items-end text-[10.5px] leading-tight font-bold text-text">
                        <span>L{hitung.l}</span>
                        <span>P{hitung.p}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-3 text-[13px] font-bold text-text">Jalan Pintas</div>
        <div className="flex flex-col gap-2.5">
          {/* KARTU-nya sendiri yang diklik (2026-08-28, diminta owner) --
              tombol "Tandai Libur" terpisah dihapus. Satu sasaran sentuh
              selebar kartu lebih mudah dikenai di HP daripada tombol kecil
              di pojok, dan modalnya kini melayani dua arah sekaligus
              (tandai LIBUR atau TETAP AKTIF, termasuk membatalkan). */}
          {!memuatKalender && (
            <button
              type="button"
              onClick={() => {
                setTanggalLibur(tanggalHariIniLokal());
                setJenisPenandaan('libur');
                setModalLiburTerbuka(true);
              }}
              className={`flex w-full items-center gap-3 rounded-card border p-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.04)] active:scale-[0.98] ${
                kalenderHariIni ? 'border-[#FDE68A] bg-[#FFFBEB]' : 'border-border bg-panel'
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  kalenderHariIni ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-panel-2 text-text-dim'
                }`}
              >
                {kalenderHariIni?.jenis === 'libur' ? <CalendarOff size={17} /> : <CalendarCheck2 size={17} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[12.5px] font-bold ${kalenderHariIni ? 'text-[#92400E]' : 'text-text'}`}>
                  {kalenderHariIni
                    ? kalenderHariIni.jenis === 'libur'
                      ? 'Hari ini ditandai LIBUR'
                      : 'Hari ini ditandai TETAP AKTIF'
                    : 'Kalender Hari Aktif'}
                </div>
                <div className={`text-[11px] ${kalenderHariIni ? 'text-[#92400E]/80' : 'text-text-dim'}`}>
                  {kalenderHariIni?.catatan ?? 'Ketuk untuk tandai libur atau tetap aktif'}
                </div>
              </div>
              <ChevronRight
                size={16}
                className={`shrink-0 ${kalenderHariIni ? 'text-[#B45309]' : 'text-text-faint'}`}
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => router.push('/permintaan-generus')}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-panel p-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.05)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(217,119,6,0.12)] text-brass">
              <UserCheck size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-text">Persetujuan Generus</span>
              <span className="block text-[11.5px] text-text-dim">Tambah/pindah/naik kelas guru</span>
            </span>
            {jumlahPermintaan > 0 && (
              <span className="flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red px-[6px] text-[11px] font-bold text-white">
                {jumlahPermintaan > 9 ? '9+' : jumlahPermintaan}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push('/registrasi-guru')}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-panel p-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.05)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(79,70,229,0.12)] text-indigo">
              <ClipboardCheck size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-text">Registrasi</span>
              <span className="block text-[11.5px] text-text-dim">Daftarkan guru kelompok Anda</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push('/pengumuman')}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-panel p-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.05)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(5,150,105,0.12)] text-sage">
              <Megaphone size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-text">Pengumuman</span>
              <span className="block text-[11.5px] text-text-dim">Buat & lihat pengumuman kelompok</span>
            </span>
          </button>
        </div>
      </div>

      {modalLiburTerbuka && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-6 backdrop-blur-[3px]">
          {/* SENGAJA tanpa `tanggalNonaktif`: admin justru perlu memilih
              Sabtu/Minggu & tanggal merah -- itu persis tanggal yang mau
              ditandai "Tetap Aktif". */}
          <TanggalPicker
            terbuka={pickerLiburBuka}
            posisi={posPickerLibur}
            nilai={tanggalLibur}
            onPilih={setTanggalLibur}
            onTutup={() => setPickerLiburBuka(false)}
          />
          <div className="w-full max-w-[360px] rounded-[24px] bg-panel px-6 pt-7 pb-6 shadow-[0_24px_48px_rgba(0,0,0,0.28)]">
            <div className="mb-1 text-[15px] font-extrabold text-text">Tandai Libur atau Aktif</div>
            <p className="mb-4 text-[12.5px] text-text-dim">
              Pilih tanggal (boleh lampau atau yang akan datang) &amp; tulis alasan.
              Tanggal yang sudah ditandai bisa dibatalkan dari sini juga.
            </p>
            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Tanggal</label>
            <button
              type="button"
              ref={refPickerLibur}
              onClick={() => {
                const r = refPickerLibur.current?.getBoundingClientRect();
                if (r) setPosPickerLibur({ top: r.bottom + 6, right: window.innerWidth - r.right });
                setPickerLiburBuka(true);
              }}
              className="mb-3 flex w-full items-center justify-between rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-left text-[13px] text-text"
            >
              {fmtTglPanjang(tanggalLibur)}
              <CalendarDays size={15} className="shrink-0 text-text-faint" />
            </button>
            {liburTanggalItu ? (
              <div className="rounded-[var(--radius)] border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-3 text-[12.5px] text-[#92400E]">
                Tanggal ini sudah ditandai{' '}
                <span className="font-bold">
                  {liburTanggalItu.jenis === 'libur' ? 'LIBUR' : 'TETAP AKTIF'}
                </span>
                {liburTanggalItu.catatan ? ` — ${liburTanggalItu.catatan}` : ''}.
              </div>
            ) : (
              <>
                <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">
                  Tandai sebagai
                </label>
                <div className="mb-3 flex gap-1 rounded-[var(--radius)] border border-border bg-panel-2 p-0.5">
                  {(
                    [
                      { nilai: 'libur', label: 'Libur', bg: 'bg-[#B45309]' },
                      { nilai: 'aktif', label: 'Tetap Aktif', bg: 'bg-sage' },
                    ] as const
                  ).map((o) => (
                    <button
                      key={o.nilai}
                      type="button"
                      onClick={() => setJenisPenandaan(o.nilai)}
                      className={`min-w-0 flex-1 cursor-pointer truncate rounded-[calc(var(--radius)-3px)] border-none px-1 py-1.5 text-[12px] font-bold ${
                        jenisPenandaan === o.nilai ? `${o.bg} text-white` : 'bg-transparent text-text-dim'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Alasan</label>
                <textarea
                  value={alasanLibur}
                  onChange={(e) => setAlasanLibur(e.target.value)}
                  placeholder={
                    jenisPenandaan === 'libur'
                      ? 'Misal: Hujan deras, jalan tidak bisa dilalui'
                      : 'Misal: Ada kegiatan khusus, tetap masuk walau tanggal merah'
                  }
                  rows={3}
                  className="w-full resize-none rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
                />
                {jenisPenandaan === 'libur' ? (
                  <p className="mt-2 rounded-[var(--radius)] bg-[#FEF2F2] px-3 py-2 text-[11.5px] leading-snug text-red">
                    Absensi yang sudah diinput guru untuk tanggal ini akan
                    dikosongkan otomatis (bisa dipulihkan admin PPG kalau keliru).
                  </p>
                ) : (
                  <p className="mt-2 rounded-[var(--radius)] bg-[rgba(5,150,105,0.08)] px-3 py-2 text-[11.5px] leading-snug text-sage">
                    Tanggal ini akan terbuka untuk guru walau jatuh di akhir pekan
                    atau tanggal merah. Absensi yang sudah ada TIDAK dihapus.
                  </p>
                )}
              </>
            )}
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setModalLiburTerbuka(false);
                  setAlasanLibur('');
                  setTanggalLibur(tanggalHariIniLokal());
                }}
                className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
              >
                Batal
              </button>
              {liburTanggalItu ? (
                <button
                  type="button"
                  disabled={sibukKalender}
                  onClick={batalkanLiburTanggalItu}
                  className="flex-1 cursor-pointer rounded-[var(--radius)] border border-[#B45309] bg-[#B45309] px-4 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sibukKalender
                    ? 'Membatalkan...'
                    : liburTanggalItu.jenis === 'libur'
                      ? 'Batalkan Libur'
                      : 'Batalkan Penandaan'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!alasanLibur.trim() || !tanggalLibur || sibukKalender}
                  onClick={tandaiLiburHariIni}
                  className="flex-1 cursor-pointer rounded-[var(--radius)] border border-[#B45309] bg-[#B45309] px-4 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sibukKalender ? 'Menyimpan...' : 'Konfirmasi'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
