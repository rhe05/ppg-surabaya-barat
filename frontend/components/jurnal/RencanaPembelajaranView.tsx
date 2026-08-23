'use client';

/* Rencana Pembelajaran (guru mobile) — diminta owner (20 Agt), "buatkan
   isi aplikasinya kurang lebih seperti [screenshot]". Layar 1 dari 3
   (Rencana/Pelaksanaan/Riwayat Pembelajaran), semuanya baca/tulis tabel
   baru `jurnal_materi` (migrasi 20260820120000) -- lihat komentar lengkap
   di migrasi itu ttg kenapa tabel baru, bukan perluasan jurnal_kbm/
   kurikulum_probul_minggu yang sudah ada.

   Guru menyusun daftar MATERI (bukan cuma satu blok teks bebas spt
   jurnal_kbm lama) per minggu dalam sebulan; Pelaksanaan nanti menandai
   materi minggu berjalan sbg disampaikan/belum + catatan; Riwayat
   menampilkan progres. Pembagian minggu: rentangMinggu (lib/
   mingguBulan.ts) -- rentang tanggal tetap 1-7/8-14/dst, BUKAN dari hari
   KBM sungguhan di jadwal_kbm (disederhanakan sengaja, level perencanaan
   bulanan kasar).

   PUTARAN KEDUA: form "Tambah Materi" diperkaya jadi bottom-sheet penuh
   (screenshot owner) -- Topik/Tanggal Rencana/Pertemuan ke-/Tujuan
   Pembelajaran/Catatan/Referensi/Pengingat, semua opsional kecuali
   Materi+Tanggal Rencana+Minggu. Kolom baru di migrasi 20260820130000.
   `pengingat_aktif` CUMA preferensi tersimpan -- app ini belum punya
   sistem notifikasi/pengingat sungguhan.

   PUTARAN KETIGA (diminta owner, "standar produk SaaS profesional"):
   - Hero hijau (nama/peran/kelompok) DIHAPUS KHUSUS di layar ini
     (tampilkanHero={false}) -- top bar putih (hamburger+brand+bell)
     TETAP ADA. Layar turunan/detail spt ini tidak perlu mengulang info
     yang sudah dilihat guru di Dashboard (lihat JurnalHeaderChrome.tsx
     utk alasan lengkap). Pelaksanaan & Riwayat TETAP pakai hero -- ini
     KHUSUS Rencana Pembelajaran, sesuai permintaan.
   - Ikon SVG tulis-tangan -> lucide-react sungguhan.
   - <select> native -> SelectKustom (dropdown sendiri, bukan OS --
     tampilan native beda-beda di iOS/Android).
   - <input type=date> native -> TanggalPicker.tsx (kalender custom yang
     SUDAH ADA di app ini, dipakai jg oleh GuruAbsensiView -- bukan
     komponen baru).
   - "Memuat..." -> Skeleton (components/ui/Skeleton.tsx).
   - Pesan sukses/gagal -> toast (components/ui/useToast.tsx +
     ToastStack.tsx), bukan teks inline lagi.
   - "Tambah Materi" jadi OPTIMISTIC: baris baru langsung muncul di daftar
     begitu Simpan ditekan (id sementara negatif), modal langsung
     tertutup -- tidak menunggu round-trip Supabase. Kalau INSERT gagal,
     baris sementara itu ditarik lagi + toast error. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen, Tag, Calendar, Hash, Target, FileText, Link2, Bell,
  X, Plus, Check, CalendarDays, ClipboardList, Users, ChevronRight, ChevronDown, Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import Skeleton from '@/components/ui/Skeleton';
import SelectKustom, { type OpsiSelect } from '@/components/ui/SelectKustom';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import ToastStack from '@/components/ui/ToastStack';
import { rentangMinggu, labelRentangMinggu, mingguKeDariTanggal } from '@/lib/mingguBulan';
import { namaMateriTampil } from '@/lib/kategori';

type Kelas = { id: number; nama: string };
type Materi = {
  id: number;
  minggu_ke: number;
  judul: string;
  status: string;
  jenis: string;
  tanggal_rencana: string | null;
  klasikal_hafalan_surat: string | null;
  klasikal_hafalan_doa: string | null;
};

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/* Hari sekolah (Senin-Jumat, TANPA Sabtu/Minggu) dlm satu rentang Minggu
   N -- diminta owner 2026-08-23 utk kartu Klasikal per hari. Rentang
   Minggu N sendiri (rentangMinggu, lib/mingguBulan.ts) masih blok
   kalender kasar 7 hari (bisa mulai Sabtu/Minggu), jadi baris yg
   ditampilkan cuma yg jatuh di hari kerja. */
function hariSekolahDalamMinggu(tahun: number, bulan: number, rentang: { awal: number; akhir: number }) {
  const hasil: { tgl: Date; iso: string }[] = [];
  for (let d = rentang.awal; d <= rentang.akhir; d++) {
    const tgl = new Date(tahun, bulan - 1, d);
    if (tgl.getDay() >= 1 && tgl.getDay() <= 5) {
      hasil.push({ tgl, iso: `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
  }
  return hasil;
}

function formatTanggalDDMMYYYY(tgl: Date) {
  return `${String(tgl.getDate()).padStart(2, '0')}-${String(tgl.getMonth() + 1).padStart(2, '0')}-${tgl.getFullYear()}`;
}

const INPUT_STYLE =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text placeholder:text-text-faint focus:border-brass focus:outline-none';

/* Libur nasional + cuti bersama 2026, sesuai SKB 3 Menteri No. 1497 Thn
   2025 / No. 2 Thn 2025 / No. 5 Thn 2025 (dicek via web, sumber resmi
   Sekretariat Negara setneg.go.id -- bukan tebakan). Dipakai HANYA utk
   kalender Tanggal Materi Klasikal (diminta owner 2026-08-23): Sabtu/
   Minggu + tanggal merah tidak bisa diklik. ⚠️ Daftar ini KHUSUS 2026 --
   Idul Fitri/Idul Adha/Nyepi/Imlek/Waisak dll geser tiap tahun (kalender
   lunar), jadi kalau kalender ini dipakai lintas tahun (mis. guru buka
   Januari 2027), tanggal merahnya TIDAK otomatis benar lagi. Perlu
   diperbarui manual tiap tahun baru (cek SKB 3 Menteri terbaru), bukan
   dihitung otomatis -- app ini sengaja tidak menebak tanggal lunar. */
const LIBUR_NASIONAL_2026: Record<string, string> = {
  '2026-01-01': 'Tahun Baru Masehi',
  '2026-01-16': 'Isra Mikraj Nabi Muhammad SAW',
  '2026-02-16': 'Cuti Bersama Tahun Baru Imlek',
  '2026-02-17': 'Tahun Baru Imlek 2577',
  '2026-03-18': 'Cuti Bersama Hari Suci Nyepi',
  '2026-03-19': 'Hari Suci Nyepi (Tahun Baru Saka 1948)',
  '2026-03-20': 'Cuti Bersama Idul Fitri',
  '2026-03-21': 'Hari Raya Idul Fitri 1447 H',
  '2026-03-22': 'Hari Raya Idul Fitri 1447 H',
  '2026-03-23': 'Cuti Bersama Idul Fitri',
  '2026-03-24': 'Cuti Bersama Idul Fitri',
  '2026-04-03': 'Wafat Isa Almasih',
  '2026-04-05': 'Hari Paskah',
  '2026-05-01': 'Hari Buruh Internasional',
  '2026-05-14': 'Kenaikan Isa Almasih',
  '2026-05-15': 'Cuti Bersama Kenaikan Isa Almasih',
  '2026-05-27': 'Hari Raya Idul Adha 1447 H',
  '2026-05-28': 'Cuti Bersama Idul Adha',
  '2026-05-31': 'Hari Raya Waisak 2570 BE',
  '2026-06-01': 'Hari Lahir Pancasila',
  '2026-06-16': 'Tahun Baru Islam 1448 H',
  '2026-08-17': 'HUT Kemerdekaan RI',
  '2026-08-25': 'Maulid Nabi Muhammad SAW',
  '2026-12-24': 'Cuti Bersama Hari Raya Natal',
  '2026-12-25': 'Hari Raya Natal',
};

/* Sabtu/Minggu + tanggal merah 2026 tidak bisa diklik di kalender
   Tanggal Materi Klasikal (diminta owner 2026-08-23) -- lihat komentar
   LIBUR_NASIONAL_2026 di atas soal keterbatasan lintas-tahunnya. */
function nonaktifKalenderKlasikal(tglStr: string, tgl: Date): { alasan: string; merah?: boolean } | null {
  const hari = tgl.getDay();
  if (hari === 0) return { alasan: 'Hari Minggu' };
  if (hari === 6) return { alasan: 'Hari Sabtu' };
  const namaLibur = LIBUR_NASIONAL_2026[tglStr];
  if (namaLibur) return { alasan: namaLibur, merah: true };
  return null;
}

/* Kode kelas Kurikulum, urut PAUD-TK dulu -- dipakai HANYA utk memotong
   daftar "s.d. kelas N" pada dropdown Hafalan Surat klasikal di bawah.
   Kode ini beda namespace dari `kelas.nama` (ruang guru, "1A") -- lihat
   komentar KATEGORI_TARGET_SEMESTER_GANDA / opsiMateriKurikulum di
   bawah utk masalah tanpa-kolom-penghubungnya. */
const KELAS_KURIKULUM_URUT = ['PAUD-TK', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/* Pecah target/target2 Prota (bisa multi-baris bernomor, mis. "1. A\n2.
   B") jadi baris lepas, buang nomor "1." di depan, buang baris yg
   mengandung "menjaga hafalan" (case-insensitive) -- itu materi
   PENGULANGAN, bukan materi baru, diminta owner dikecualikan dari
   pilihan klasikal. */
function barisHafalanDariTeks(teks: string | null): string[] {
  if (!teks) return [];
  return teks
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b !== '')
    .map((b) => b.replace(/^\d+[.)]\s*/, '').trim())
    .filter((b) => b !== '' && !b.toLowerCase().includes('menjaga hafalan'));
}

/* Urutan Juz 'Amma standar (surah 78-114), urutan Mushaf MENAIK
   (An-Naba' dulu, An-Nas terakhir) -- dipakai menguraikan baris rentang
   "X s/d Y" jadi surat satu per satu (diminta owner 2026-08-23). Rentang
   di kurikulum ini SELALU ditulis MUNDUR dari nomor surat besar ke kecil
   (dicek persis ke semua baris "Hafalan Surat-Surat Al-Qur'an" yg ada di
   produksi -- bukan tebakan, mis. "Al-Kautsar(108) s/d Quraisy(106)",
   "Al-Fiil(105) s/d Al-'Asr(103)", dst -- semuanya kontinu tanpa
   lompatan). Ejaan baku dipakai sbg OUTPUT (bukan ejaan mentah di data,
   yg kadang typo -- lihat ALIAS_SURAT). */
const JUZ_AMMA_URUT = [
  "An-Naba'", "An-Nazi'at", "'Abasa", 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin',
  'Al-Insyiqaq', 'Al-Buruj', 'At-Tariq', "Al-A'la", 'Al-Ghasyiyah', 'Al-Fajr',
  'Al-Balad', 'Asy-Syams', 'Al-Lail', 'Ad-Dhuha', 'Al-Insyirah', 'At-Tin',
  "Al-'Alaq", 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', "Al-'Adiyat", "Al-Qari'ah",
  'At-Takatsur', "Al-'Asr", 'Al-Humazah', 'Al-Fiil', 'Quraisy', "Al-Ma'un",
  'Al-Kautsar', 'Al-Kafirun', 'An-Nasr', 'Al-Lahab', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
];

/* Ejaan yg PERSIS muncul di data produksi tapi beda dari ejaan baku di
   atas (dicek langsung, bukan tebakan) -- dipetakan ke ejaan baku spy
   tetap kena walau sumbernya typo/variasi lama. Key SUDAH dinormalisasi
   lewat normalisasiNamaSurat(). */
const ALIAS_SURAT: Record<string, string> = {
  quraisyh: 'Quraisy',
  alasyr: "Al-'Asr",
  alqoriah: "Al-Qari'ah",
  alzalzalah: 'Az-Zalzalah',
};

function normalisasiNamaSurat(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const INDEKS_JUZ_AMMA = new Map<string, number>(
  JUZ_AMMA_URUT.map((nama, i) => [normalisasiNamaSurat(nama), i])
);

function cariIndeksSurat(namaMentah: string): number | null {
  const bersih = namaMentah.trim().replace(/^surat\s+|^surah\s+/i, '');
  const kunci = normalisasiNamaSurat(bersih);
  const alias = ALIAS_SURAT[kunci];
  if (alias) return INDEKS_JUZ_AMMA.get(normalisasiNamaSurat(alias)) ?? null;
  return INDEKS_JUZ_AMMA.get(kunci) ?? null;
}

/* Uraikan satu baris "X s/d Y" jadi surat satu per satu (diminta owner
   2026-08-23, contoh dari owner: "Al-Fatihah s/d Al-Ikhlas" -> Al-
   Fatihah, An-Nas, Al-Falaq, Al-Ikhlas). Kasus khusus "Al-Fatihah s/d
   Y": Al-Fatihah bukan bagian Juz 'Amma & selalu diajarkan terpisah di
   awal, jadi diuraikan jadi [Al-Fatihah, ...An-Nas s.d. Y] (An-Nas =
   awal urutan hafalan juz 'amma, sesuai contoh owner). Baris tanpa
   "s/d" (satu surat saja) dikembalikan apa adanya. Kalau salah satu
   ujungnya TIDAK dikenali (typo baru yg belum ada di ALIAS_SURAT),
   baris dikembalikan utuh apa adanya -- tidak didiamkan hilang. */
function uraikanBarisHafalan(barisAsli: string): string[] {
  const bagian = barisAsli.split(/\s+s\/d\s+/i);
  const bersihkan = (s: string) => s.trim().replace(/^surat\s+|^surah\s+/i, '');
  if (bagian.length !== 2) return [bersihkan(barisAsli)];

  const namaA = bersihkan(bagian[0]);
  const namaB = bersihkan(bagian[1]);

  if (normalisasiNamaSurat(namaA) === 'alfatihah') {
    const idxNas = INDEKS_JUZ_AMMA.get(normalisasiNamaSurat('An-Nas'))!;
    const idxB = cariIndeksSurat(namaB);
    if (idxB === null) return [barisAsli];
    const rentang =
      idxNas <= idxB ? JUZ_AMMA_URUT.slice(idxNas, idxB + 1) : JUZ_AMMA_URUT.slice(idxB, idxNas + 1).reverse();
    return ['Al-Fatihah', ...rentang];
  }

  const idxA = cariIndeksSurat(namaA);
  const idxB = cariIndeksSurat(namaB);
  if (idxA === null || idxB === null) return [barisAsli];
  return idxA <= idxB ? JUZ_AMMA_URUT.slice(idxA, idxB + 1) : JUZ_AMMA_URUT.slice(idxB, idxA + 1).reverse();
}

let idSementara = -1;

/* Ikon info + tooltip ketuk-utk-buka (BUKAN hover -- form ini dipakai di
   HP, hover tidak ada) -- diminta owner 2026-08-23 utk panduan batas
   maks surat Hafalan Surat klasikal. Overlay transparan spy tutup lagi
   saat ketuk di luar, sama pola dgn KebabMenu.tsx di kurikulum/page.tsx. */
function LabelInfo({ teks }: { teks: string }) {
  const [terbuka, setTerbuka] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setTerbuka((v) => !v);
        }}
        aria-label="Info"
        className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-text-faint"
      >
        <Info size={14} strokeWidth={2} />
      </button>
      {terbuka && (
        <>
          <div className="fixed inset-0 z-[700]" onClick={() => setTerbuka(false)} />
          <div className="absolute top-full left-0 z-[701] mt-1.5 w-[230px] rounded-[var(--radius)] border border-border bg-panel p-2.5 text-[11.5px] leading-snug font-normal text-text shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
            {teks}
          </div>
        </>
      )}
    </span>
  );
}

function FieldTambah({
  label,
  wajib,
  info,
  children,
}: {
  label: string;
  wajib?: boolean;
  /* Opsional: teks tooltip info singkat, muncul lewat ikon (i) di
     samping label -- lihat LabelInfo di atas. */
  info?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-text-dim">
        {label} {wajib && <span className="text-red">*</span>}
        {!wajib && <span className="font-normal text-text-faint"> (Opsional)</span>}
        {info && <LabelInfo teks={info} />}
      </label>
      {children}
    </div>
  );
}

function InputIkon({
  value,
  onChange,
  placeholder,
  ikon,
  list,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ikon: React.ReactNode;
  /* Opsional: id <datalist> yg menyediakan saran ketik-atau-pilih (native
     HTML, bukan dropdown terkunci) -- dipakai field "Materi Ngaji" utk
     menyarankan materi dari Kurikulum tanpa mengunci guru ke daftar itu. */
  list?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={list}
        className={`${INPUT_STYLE} pr-9`}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-faint">{ikon}</span>
    </div>
  );
}

export default function RencanaPembelajaranView() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const { toasts, push, dismiss } = useToast();

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];
  const [pemilihBulanTerbuka, setPemilihBulanTerbuka] = useState(false);
  const [posisiPemilihBulan, setPosisiPemilihBulan] = useState<PosisiPicker | null>(null);
  const ikonKalenderRef = useRef<HTMLButtonElement>(null);

  const [materiList, setMateriList] = useState<Materi[]>([]);
  const [loading, setLoading] = useState(false);
  // Kunci kelas+bulan+tahun yg SUDAH dikonfirmasi cocok dgn isi materiList
  // saat ini -- dipakai supaya teks "Belum ada materi..." tidak sempat
  // kedip sekilas pas ganti kelas. Akar masalah lama: `kelasId` berubah
  // duluan (lewat klik chip), baru useEffect-nya memicu setLoading(true)
  // -- ADA satu frame render di antaranya di mana kelasId sudah baru tapi
  // materiList masih kosong/lama & loading masih false, jadi kondisi
  // "list kosong" ke-detect keliru sbg "materi kelas ini memang kosong"
  // walau sebenarnya cuma belum sempat difetch. Dgn kunci eksplisit ini,
  // pesan kosong CUMA muncul kalau materiList kosong itu sudah pasti hasil
  // fetch utk kelas+bulan+tahun yg SEDANG aktif, bukan sisa/transisi.
  const [kunciMateriSiap, setKunciMateriSiap] = useState('');

  /* Saran "Materi Ngaji" diambil dari Kurikulum kelompok guru ini sendiri
     (kategori_kbm yg punya baris kurikulum_prota) -- diminta owner
     2026-08-23, TETAP fleksibel: field-nya input+datalist (HTML native),
     bukan <select> terkunci, jadi guru masih bisa mengetik apa saja di
     luar daftar. Label per baris pakai namaMateriTampil (SAMA PERSIS dgn
     yg tampil di layar Kurikulum, mis. "Baca Huruf Al-Qur'an" utk
     PAUD-TK s.d. 3) supaya tidak membingungkan krn beda nama. Sengaja
     TIDAK difilter ke satu kelas tertentu -- kelas ruang (tabel `kelas`,
     "1A") dan kelas kurikulum (kode '1'..'9'/'PAUD-TK') dua namespace
     terpisah tanpa kolom penghubung (lihat komentar panjang di
     kurikulum/page.tsx), jadi union semua kategori kelompok ini lebih
     aman drpd menebak pemetaannya & salah menyaring. */
  const [opsiMateriKurikulum, setOpsiMateriKurikulum] = useState<string[]>([]);

  useEffect(() => {
    const kelompokId = profile?.scope_kelompok_id;
    if (!kelompokId) return;
    supabase
      .from('kurikulum_prota')
      .select('kelas, kategori_kbm(nama)')
      .eq('kelompok_id', kelompokId)
      .eq('tahun', tahun)
      .then(({ data }) => {
        type Baris = { kelas: string | null; kategori_kbm: { nama: string } | { nama: string }[] | null };
        const nama = (v: Baris['kategori_kbm']) => (Array.isArray(v) ? v[0]?.nama : v?.nama) ?? null;
        const daftar = ((data ?? []) as Baris[])
          .map((b) => {
            const namaAsli = nama(b.kategori_kbm);
            return namaAsli ? namaMateriTampil(namaAsli, b.kelas) : null;
          })
          .filter((v): v is string => v !== null);
        setOpsiMateriKurikulum([...new Set(daftar)].sort());
      });
  }, [profile?.scope_kelompok_id, tahun]);

  /* Opsi "Hafalan Surat-Surat Al-Qur'an" utk borang Materi Klasikal --
     diminta owner 2026-08-23, kumulatif: kelas ruang guru "N" menampilkan
     materi PAUD-TK s.d. kelas N (tidak boleh lebih tinggi). Ruang & kelas
     Kurikulum dua namespace TANPA kolom penghubung (sama masalahnya dgn
     opsiMateriKurikulum di atas) -- batas atasnya diambil dari ANGKA
     TERTINGGI di nama ruang (mis. "2 & 3A" -> batas kelas 3), disepakati
     owner sbg pendekatan paling praktis. Ruang "PAUD/TK ..." (tanpa
     angka) dikunci PAUD-TK saja; ruang "Pra Remaja"/"Remaja"/SMP/SMA
     (jg tanpa angka, tapi jenjangnya di ATAS kelas 9) dianggap sudah
     lulus semua jenjang SD -- tampilkan kumulatif penuh PAUD-TK s.d. 9. */
  const [opsiHafalanSurat, setOpsiHafalanSurat] = useState<OpsiSelect[]>([]);

  useEffect(() => {
    const kelompokId = profile?.scope_kelompok_id;
    if (!kelompokId || kelasId === '') {
      setOpsiHafalanSurat([]);
      return;
    }
    const namaRuang = (kelasList.find((k) => k.id === kelasId)?.nama ?? '').toLowerCase();
    let kelasTarget: string[];
    if (namaRuang.includes('paud')) {
      kelasTarget = ['PAUD-TK'];
    } else if (/remaja|smp|sma/.test(namaRuang)) {
      kelasTarget = KELAS_KURIKULUM_URUT;
    } else {
      const angka = [...namaRuang.matchAll(/\d+/g)].map((m) => Number(m[0]));
      const batasAtas = angka.length > 0 ? Math.max(...angka) : 0;
      kelasTarget = KELAS_KURIKULUM_URUT.slice(0, batasAtas + 1);
    }

    supabase
      .from('kurikulum_prota')
      .select('kelas, target, target2, kategori_kbm(nama)')
      .eq('kelompok_id', kelompokId)
      .eq('tahun', tahun)
      .in('kelas', kelasTarget)
      .then(({ data }) => {
        type Baris = {
          kelas: string | null;
          target: string | null;
          target2: string | null;
          kategori_kbm: { nama: string } | { nama: string }[] | null;
        };
        const nama = (v: Baris['kategori_kbm']) => (Array.isArray(v) ? v[0]?.nama : v?.nama) ?? null;
        const labelKelas = (k: string | null) => (k === 'PAUD-TK' ? 'PAUD/TK' : `Kelas ${k}`);
        const peta = new Map<string, OpsiSelect>();
        for (const b of (data ?? []) as Baris[]) {
          if (nama(b.kategori_kbm) !== "Hafalan Surat-Surat Al-Qur'an") continue;
          for (const [teks, semester] of [
            [b.target, 1],
            [b.target2, 2],
          ] as const) {
            for (const baris of barisHafalanDariTeks(teks)) {
              for (const surat of uraikanBarisHafalan(baris)) {
                if (!peta.has(surat)) {
                  peta.set(surat, {
                    value: surat,
                    label: surat,
                    sublabel: `${labelKelas(b.kelas)} · Sem ${semester}`,
                  });
                }
              }
            }
          }
        }
        setOpsiHafalanSurat([...peta.values()]);
      });
  }, [profile?.scope_kelompok_id, kelasId, kelasList, tahun]);

  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  const [judulBaru, setJudulBaru] = useState('');
  const [topikBaru, setTopikBaru] = useState('');
  const [tanggalRencanaBaru, setTanggalRencanaBaru] = useState('');
  const [tanggalPickerTerbuka, setTanggalPickerTerbuka] = useState(false);
  const [posisiTanggalPicker, setPosisiTanggalPicker] = useState<PosisiPicker | null>(null);
  const tanggalBtnRef = useRef<HTMLButtonElement>(null);
  const [mingguBaru, setMingguBaru] = useState('1');
  const [pertemuanKeBaru, setPertemuanKeBaru] = useState('');
  const [tujuanBaru, setTujuanBaru] = useState('');
  const [catatanBaru, setCatatanBaru] = useState('');
  const [referensiBaru, setReferensiBaru] = useState('');
  const [pengingatBaru, setPengingatBaru] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  function bukaFormTambah() {
    setJudulBaru('');
    setTopikBaru('');
    setTanggalRencanaBaru(new Date().toISOString().slice(0, 10));
    setMingguBaru(String(mingguKeDariTanggal(new Date())));
    setPertemuanKeBaru('');
    setTujuanBaru('');
    setCatatanBaru('');
    setReferensiBaru('');
    setPengingatBaru(false);
    setTambahTerbuka(true);
  }

  /* Materi Klasikal -- diminta owner 2026-08-23: sesi pembukaan KBM
     (klasikal hafalan surat + klasikal hafalan doa/asmaul husna), beda
     konsep dari Materi Ngaji per-minggu di atas. "+ Tambah Materi"
     sekarang membuka pilihJenisTerbuka dulu (Materi Ngaji vs Materi
     Klasikal), baru salah satu form-nya. Disimpan di tabel jurnal_materi
     yg SAMA (kolom jenis/klasikal_hafalan_surat/klasikal_hafalan_doa,
     migrasi 20260823100000) supaya numpang infrastruktur yg sudah ada
     (RLS, trigger sync kelompok_id, soft-delete) drpd bikin tabel baru. */
  const [pilihJenisTerbuka, setPilihJenisTerbuka] = useState(false);
  const [klasikalTerbuka, setKlasikalTerbuka] = useState(false);
  const [tanggalKlasikalBaru, setTanggalKlasikalBaru] = useState('');
  const [tanggalKlasikalPickerTerbuka, setTanggalKlasikalPickerTerbuka] = useState(false);
  const [posisiTanggalKlasikalPicker, setPosisiTanggalKlasikalPicker] = useState<PosisiPicker | null>(null);
  const tanggalKlasikalBtnRef = useRef<HTMLButtonElement>(null);
  /* Cek list (bukan dropdown pilih-satu lagi) -- diminta owner
     2026-08-23: guru bisa pilih BEBERAPA surat sekaligus (mis. Al-
     Fatihah + An-Nas), bukan cuma satu. */
  const [hafalanSuratBaru, setHafalanSuratBaru] = useState<string[]>([]);
  /* Materi Hafalan Do'a-Do'a Harian (termasuk Asmaul Husna) -- ketentuan
     isian & sumbernya BELUM ditentukan owner ("buatkan dulu, nanti
     menyusul"), jadi sementara input bebas ketik, bukan dropdown spt
     Hafalan Surat. Opsional (tidak wajib), beda dari Hafalan Surat yg
     wajib. */
  const [hafalanDoaBaru, setHafalanDoaBaru] = useState('');
  const [menyimpanKlasikal, setMenyimpanKlasikal] = useState(false);

  function bukaFormKlasikal() {
    setTanggalKlasikalBaru(new Date().toISOString().slice(0, 10));
    setHafalanSuratBaru([]);
    setHafalanDoaBaru('');
    setKlasikalTerbuka(true);
  }

  function toggleHafalanSurat(nilai: string) {
    setHafalanSuratBaru((prev) => (prev.includes(nilai) ? prev.filter((v) => v !== nilai) : [...prev, nilai]));
  }

  async function simpanKlasikalBaru() {
    if (kelasId === '' || tanggalKlasikalBaru === '' || hafalanSuratBaru.length === 0) return;
    const suratTerpilih = hafalanSuratBaru.join(', ');
    const judul = 'Klasikal — Hafalan Surat: ' + suratTerpilih;
    const mingguKe = mingguKeDariTanggal(new Date(tanggalKlasikalBaru + 'T00:00:00'));
    const bulanKlasikal = Number(tanggalKlasikalBaru.slice(5, 7));
    const tahunKlasikal = Number(tanggalKlasikalBaru.slice(0, 4));

    const sementara: Materi = {
      id: idSementara--,
      minggu_ke: mingguKe,
      judul,
      status: 'belum',
      jenis: 'klasikal',
      tanggal_rencana: tanggalKlasikalBaru,
      klasikal_hafalan_surat: suratTerpilih,
      klasikal_hafalan_doa: hafalanDoaBaru.trim() === '' ? null : hafalanDoaBaru.trim(),
    };
    setMateriList((prev) => [...prev, sementara]);
    setKlasikalTerbuka(false);
    setMenyimpanKlasikal(true);

    try {
      const { error: err } = await supabase.from('jurnal_materi').insert({
        kelas_id: kelasId,
        tahun: tahunKlasikal,
        bulan: bulanKlasikal,
        minggu_ke: mingguKe,
        judul,
        tanggal_rencana: tanggalKlasikalBaru,
        jenis: 'klasikal',
        klasikal_hafalan_surat: suratTerpilih,
        klasikal_hafalan_doa: hafalanDoaBaru.trim() === '' ? null : hafalanDoaBaru.trim(),
      });
      if (err) throw new Error(err.message);
      push('Materi klasikal tersimpan.', 'sukses');
      await muatMateri();
    } catch (e) {
      setMateriList((prev) => prev.filter((m) => m.id !== sementara.id));
      push(e instanceof Error ? e.message : 'Gagal menyimpan materi klasikal.', 'error');
    } finally {
      setMenyimpanKlasikal(false);
    }
  }

  useEffect(() => {
    if (guruId == null) return;
    supabase
      .from('kelas')
      .select('id, nama')
      .eq('guru_id', guruId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => {
        const list = (data ?? []) as Kelas[];
        setKelasList(list);
        setKelasId(list.length === 1 ? list[0].id : '');
      });
  }, [guruId]);

  const muatMateri = useCallback(async () => {
    const kunci = `${kelasId}-${tahun}-${bulan}`;
    if (kelasId === '') {
      setMateriList([]);
      setKunciMateriSiap(kunci);
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('jurnal_materi')
        .select('id, minggu_ke, judul, status, jenis, tanggal_rencana, klasikal_hafalan_surat, klasikal_hafalan_doa')
        .eq('kelas_id', kelasId)
        .eq('tahun', tahun)
        .eq('bulan', bulan)
        .is('deleted_at', null)
        .order('minggu_ke', { ascending: true })
        .order('id', { ascending: true });
      if (err) throw new Error(err.message);
      setMateriList((data ?? []) as Materi[]);
      setKunciMateriSiap(kunci);
    } catch (e) {
      push(e instanceof Error ? e.message : 'Gagal memuat rencana.', 'error');
    } finally {
      setLoading(false);
    }
  }, [kelasId, tahun, bulan, push]);

  useEffect(() => {
    muatMateri();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, tahun, bulan]);

  async function simpanMateriBaru() {
    if (kelasId === '' || judulBaru.trim().length === 0 || tanggalRencanaBaru === '') return;
    const judul = judulBaru.trim();
    const mingguKe = Number(mingguBaru);

    // Optimistic: baris sementara langsung tampil, modal langsung tertutup.
    const sementara: Materi = {
      id: idSementara--,
      minggu_ke: mingguKe,
      judul,
      status: 'belum',
      jenis: 'ngaji',
      tanggal_rencana: tanggalRencanaBaru,
      klasikal_hafalan_surat: null,
      klasikal_hafalan_doa: null,
    };
    setMateriList((prev) => [...prev, sementara]);
    setTambahTerbuka(false);
    setMenyimpan(true);

    try {
      const { error: err } = await supabase.from('jurnal_materi').insert({
        kelas_id: kelasId,
        tahun,
        bulan,
        minggu_ke: mingguKe,
        judul,
        topik: topikBaru.trim() === '' ? null : topikBaru.trim(),
        tanggal_rencana: tanggalRencanaBaru,
        pertemuan_ke: pertemuanKeBaru.trim() === '' ? null : pertemuanKeBaru.trim(),
        tujuan_pembelajaran: tujuanBaru.trim() === '' ? null : tujuanBaru.trim(),
        catatan: catatanBaru.trim() === '' ? null : catatanBaru.trim(),
        referensi: referensiBaru.trim() === '' ? null : referensiBaru.trim(),
        pengingat_aktif: pengingatBaru,
      });
      if (err) throw new Error(err.message);
      push('Materi rencana tersimpan.', 'sukses');
      await muatMateri();
    } catch (e) {
      // Gagal -> tarik lagi baris sementara.
      setMateriList((prev) => prev.filter((m) => m.id !== sementara.id));
      push(e instanceof Error ? e.message : 'Gagal menyimpan materi.', 'error');
    } finally {
      setMenyimpan(false);
    }
  }

  const dataSiapUntukKelasIni = kunciMateriSiap === `${kelasId}-${tahun}-${bulan}`;

  /* Materi Ngaji & Klasikal ditampilkan sbg KARTU TERPISAH per minggu
     (diminta owner 2026-08-23) -- mingguDipakai TETAP cuma hitung Ngaji
     spt semula (totalPertemuan jg ikut, KPI itu memang soal pertemuan
     ngaji). Klasikal py turunan sendiri, mingguKlasikal, direntetkan
     terpisah di JSX (lihat komentar di sana). */
  const mingguDipakai = [1, 2, 3, 4, 5]
    .map((mk) => ({
      mingguKe: mk,
      rentang: rentangMinggu(tahun, bulan, mk),
      materi: materiList.filter((m) => m.minggu_ke === mk && m.jenis !== 'klasikal'),
    }))
    .filter((m) => m.rentang && m.materi.length > 0);

  const totalPertemuan = mingguDipakai.length;

  const mingguKlasikal = [1, 2, 3, 4, 5]
    .map((mk) => ({
      mingguKe: mk,
      rentang: rentangMinggu(tahun, bulan, mk),
      materi: materiList.filter((m) => m.minggu_ke === mk && m.jenis === 'klasikal'),
    }))
    .filter((m) => m.rentang && m.materi.length > 0);

  /* Kartu Klasikal bisa dibuka/tutup per minggu (diminta owner 2026-08-23)
     -- rincian hariannya TERSEMBUNYI bawaan, klik header (Minggu N +
     tanggal + badge Klasikal) utk buka, klik lagi utk tutup. */
  const [klasikalDetailTerbuka, setKlasikalDetailTerbuka] = useState<Set<number>>(new Set());
  function toggleKlasikalDetail(mingguKe: number) {
    setKlasikalDetailTerbuka((prev) => {
      const baru = new Set(prev);
      if (baru.has(mingguKe)) baru.delete(mingguKe);
      else baru.add(mingguKe);
      return baru;
    });
  }

  const opsiBulan = NAMA_BULAN.map((nm, idx) => ({ value: String(idx + 1), label: nm }));
  const opsiTahun = tahunPilihan.map((y) => ({ value: String(y), label: String(y) }));
  const opsiMinggu = [1, 2, 3, 4, 5]
    .filter((mk) => rentangMinggu(tahun, bulan, mk))
    .map((mk) => ({
      value: String(mk),
      label: `Minggu ${mk}`,
      sublabel: labelRentangMinggu(tahun, bulan, mk, NAMA_BULAN),
    }));

  return (
    /* h-screen + overflow-hidden -- diminta owner (20 Agt): saat pindah
       kelas, seluruh app (judul, chip, header) ikut geser/scroll krn
       sebelumnya cuma min-h-screen (tanpa overflow-hidden) -- tinggi
       <main> jadi ikut membesar/mengecil sesuai jumlah materi kelas yg
       dipilih, dan DOKUMEN itu sendiri yang scroll, bukan cuma konten
       di dalamnya. Pola SAMA PERSIS GuruAbsensiView.tsx: header dibekukan
       (shrink-0, di luar area scroll), yang scroll HANYA
       <div className="flex-1 overflow-y-auto"> di bawah -- jadi ganti
       kelas apa pun jumlah materinya, judul/chip/tombol tidak bergerak
       sedikit pun. */
    <main className="relative flex h-screen flex-col overflow-hidden bg-bg">
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <JurnalHeaderChrome tampilkanHero={false} />

      <div className="tanpa-scrollbar flex-1 overflow-y-auto px-[18px] pt-4 pb-[110px]">
        {/* Judul + ikon kalender sejajar — konsep sama dgn hero Dashboard
            (nama di kiri, ikon+caption Bulan/Tahun di kanan), diminta
            owner: pil lebar penuh yang dulu di sini DIHAPUS, gantinya
            ikon kecil di kanan atas (di bawah lonceng di top bar),
            sejajar dgn judul "Rencana Pembelajaran". Posisi popup dihitung
            dari getBoundingClientRect() ikon, teknik SAMA PERSIS
            GuruDashboard.tsx. */}
        <div className="mb-4 flex items-start justify-between gap-3">
          {/* Judul + chip digabung satu kolom kiri (bukan baris terpisah)
              -- diminta owner didekatkan lagi: sebelumnya chip nempel di
              bawah SELURUH baris (ikut tinggi kolom ikon+badge kanan yg
              lebih tinggi dari judul), bukan di bawah judul saja, jadi
              kelihatan jauh walau margin sudah dikecilkan. Sekarang chip
              ikut tinggi judul di kolom kiri sendiri, lepas dari tinggi
              kolom ikon kalender di kanan. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="pt-1.5 text-[17px] font-extrabold text-text">Rencana Pembelajaran</div>
            {kelasList.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {kelasList.map((k) => {
                  const aktif = k.id === kelasId;
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setKelasId(k.id)}
                      className={`flex shrink-0 items-center rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 text-[13.5px] font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.96] ${
                        aktif ? 'border-indigo text-indigo' : 'border-border bg-panel text-text'
                      }`}
                      style={aktif ? { background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)' } : undefined}
                    >
                      {k.nama}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              ref={ikonKalenderRef}
              type="button"
              aria-label="Pilih Bulan dan Tahun"
              onClick={() => {
                const rect = ikonKalenderRef.current?.getBoundingClientRect();
                if (rect) {
                  setPosisiPemilihBulan({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                }
                setPemilihBulanTerbuka((v) => !v);
              }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-[#EEF2FF] text-indigo transition-all duration-150 active:scale-[0.92]"
            >
              <Calendar size={19} />
            </button>
            <span className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-indigo">
              {NAMA_BULAN[bulan - 1]} {tahun}
            </span>
          </div>
        </div>

        {pemilihBulanTerbuka && posisiPemilihBulan && (
          <>
            <div className="fixed inset-0 z-[1090]" onClick={() => setPemilihBulanTerbuka(false)} />
            <div
              className="fixed z-[1100] w-[240px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
              style={{ top: posisiPemilihBulan.top, right: posisiPemilihBulan.right }}
            >
              <div className="flex gap-2">
                <SelectKustom value={String(bulan)} onChange={(v) => setBulan(Number(v))} opsi={opsiBulan} />
                <SelectKustom value={String(tahun)} onChange={(v) => setTahun(Number(v))} opsi={opsiTahun} />
              </div>
            </div>
          </>
        )}

        {/* Ringkasan Rencana */}
        <div className="mb-5 rounded-card border border-border bg-[#EEF2FF] p-4">
          <div className="mb-3 text-[13px] font-bold text-text">Ringkasan Rencana</div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo">
                <ClipboardList size={18} />
              </span>
              <div>
                <div className="text-[20px] leading-none font-extrabold text-text">{materiList.length}</div>
                <div className="text-[11px] text-text-dim">Materi</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo">
                <CalendarDays size={18} />
              </span>
              <div>
                <div className="text-[20px] leading-none font-extrabold text-text">{totalPertemuan}</div>
                <div className="text-[11px] text-text-dim">Pertemuan</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3 text-[15px] font-bold text-text">Rencana Mingguan</div>

        {/* Skeleton/pesan kosong pakai `dataSiapUntukKelasIni`, BUKAN
            `loading` mentah -- diminta owner (20 Agt): pesan "Belum ada
            materi..." sempat kedip sekilas pas ganti kelas krn `kelasId`
            berubah duluan (klik chip), baru useEffect-nya bikin
            `loading` jadi true satu tick kemudian. Di celah 1 frame itu
            kelasId sudah kelas baru tapi materiList/loading belum
            "sadar" -- kondisi list-kosong ke-detect keliru sbg "materi
            kelas ini memang kosong". `dataSiapUntukKelasIni` (kunci
            kelas+bulan+tahun yg SUDAH dikonfirmasi cocok dgn isi
            materiList) menutup celah itu: pesan kosong CUMA muncul kalau
            sudah pasti hasil fetch utk pilihan yg SEDANG aktif.
            Kartu materi (di bawah) tetap dirender independen dari ini --
            kalau ada data (baru/lama/stale), langsung tampilkan, tak
            perlu nunggu apa pun (stale-while-revalidate, tidak ada fase
            kosong di antara pergantian kelas yg sama-sama ada materi). */}
        {kelasId !== '' && !dataSiapUntukKelasIni && materiList.length === 0 && (
          <div className="mb-5 flex flex-col gap-3">
            <Skeleton className="h-[92px] w-full" />
            <Skeleton className="h-[92px] w-full" />
          </div>
        )}

        {kelasId === '' && (
          <p className="text-[13px] text-text-dim">Pilih kelas dulu utk melihat rencana.</p>
        )}
        {kelasId !== '' && dataSiapUntukKelasIni && mingguDipakai.length === 0 && mingguKlasikal.length === 0 && (
          <p className="mb-4 text-[13px] text-text-dim">
            Belum ada materi direncanakan bulan ini. Tambahkan lewat tombol di bawah.
          </p>
        )}

        {kelasId !== '' && (
          <div className="mb-5 flex flex-col gap-3">
            {mingguDipakai.map(({ mingguKe, materi }) => (
              <div key={mingguKe} className="rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-bold text-text">Minggu {mingguKe}</div>
                    <div className="text-[11.5px] text-text-dim">
                      {labelRentangMinggu(tahun, bulan, mingguKe, NAMA_BULAN)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-bold text-indigo">
                    {materi.length} Materi
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {materi.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-[13px] text-text">
                      <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-text-faint" />
                      {m.judul}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Kartu Klasikal -- TERPISAH dari kartu Minggu N Ngaji di atas,
                badge "Klasikal" gantiin "N Materi". Diminta owner
                2026-08-23: "Minggu N" + info tanggal SEBARIS (bukan
                bertumpuk lagi), dan seluruh kartu bisa diketuk utk buka/
                tutup rincian harian -- tersembunyi bawaan, ketuk header
                utk lihat, ketuk lagi utk sembunyikan lagi. Isinya, kalau
                dibuka, dirinci PER HARI KERJA (Senin-Jumat) dlm rentang
                minggu itu, bukan cuma baris yg py data -- hari yg belum
                diisi tetap tampil kosong (Haf Surat/Haf Doa blank) spy
                kelihatan "belum diisi", sesuai contoh tampilan owner. */}
            {mingguKlasikal.map(({ mingguKe, rentang, materi }) => {
              const dibuka = klasikalDetailTerbuka.has(mingguKe);
              return (
                <div
                  key={`klasikal-${mingguKe}`}
                  className="rounded-card border border-border bg-panel shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
                >
                  <button
                    type="button"
                    onClick={() => toggleKlasikalDetail(mingguKe)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 p-4 text-left"
                  >
                    <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
                      <span className="text-[14px] font-bold text-text">Minggu {mingguKe}</span>
                      <span className="truncate text-[11.5px] text-text-dim">
                        · {labelRentangMinggu(tahun, bulan, mingguKe, NAMA_BULAN)}
                      </span>
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[11px] font-bold text-sage">
                        Klasikal
                      </span>
                      <ChevronDown
                        size={16}
                        className={`text-text-faint transition-transform duration-150 ${dibuka ? 'rotate-180' : ''}`}
                      />
                    </span>
                  </button>
                  {dibuka && (
                    <div className="flex flex-col gap-2.5 border-t border-border px-4 pt-3 pb-4">
                      {hariSekolahDalamMinggu(tahun, bulan, rentang!).map(({ tgl, iso }) => {
                        const entri = materi.find((m) => m.tanggal_rencana === iso);
                        return (
                          <div key={iso} className="border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                            <div className="text-[12.5px] font-bold text-text">
                              {NAMA_HARI[tgl.getDay()]}, {formatTanggalDDMMYYYY(tgl)}
                            </div>
                            <div className="mt-1 text-[12px] text-text-dim">
                              Haf Surat: {entri?.klasikal_hafalan_surat ?? ''}
                            </div>
                            <div className="text-[12px] text-text-dim">
                              Haf Doa: {entri?.klasikal_hafalan_doa ?? ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tambahTerbuka && (
          <div
            className="fixed inset-0 z-[600] flex items-end justify-center bg-[rgba(15,23,42,0.55)] backdrop-blur-[3px] sm:items-center sm:p-6"
            onClick={() => setTambahTerbuka(false)}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-[24px] bg-panel text-left shadow-[0_24px_48px_rgba(0,0,0,0.28)] sm:rounded-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 justify-center pt-2.5 sm:hidden">
                <span className="h-1 w-9 rounded-full bg-border" />
              </div>

              <div className="flex shrink-0 items-center justify-between px-6 pt-4 pb-3">
                <div className="text-[16px] font-bold text-text">Tambah Materi Rencana</div>
                <button
                  type="button"
                  onClick={() => setTambahTerbuka(false)}
                  aria-label="Tutup"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
                >
                  <X size={15} strokeWidth={2.4} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-4">
                <FieldTambah label="Materi Ngaji" wajib>
                  <InputIkon
                    value={judulBaru}
                    onChange={setJudulBaru}
                    placeholder="Pilih dari Kurikulum atau tulis sendiri"
                    ikon={<BookOpen size={16} />}
                    list="opsi-materi-ngaji"
                  />
                  <datalist id="opsi-materi-ngaji">
                    {opsiMateriKurikulum.map((nama) => (
                      <option key={nama} value={nama} />
                    ))}
                  </datalist>
                </FieldTambah>

                <FieldTambah label="Topik">
                  <InputIkon
                    value={topikBaru}
                    onChange={setTopikBaru}
                    placeholder="Contoh: Akidah, Fiqih, Akhlak, Al-Qur'an"
                    ikon={<Tag size={16} />}
                  />
                </FieldTambah>

                <FieldTambah label="Tanggal Rencana" wajib>
                  <button
                    ref={tanggalBtnRef}
                    type="button"
                    onClick={() => {
                      const rect = tanggalBtnRef.current?.getBoundingClientRect();
                      if (rect) {
                        setPosisiTanggalPicker({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                      }
                      setTanggalPickerTerbuka((v) => !v);
                    }}
                    className={`${INPUT_STYLE} flex items-center justify-between`}
                  >
                    <span className={tanggalRencanaBaru ? 'text-text' : 'text-text-faint'}>
                      {tanggalRencanaBaru
                        ? new Date(tanggalRencanaBaru + 'T00:00:00').toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : 'Pilih tanggal'}
                    </span>
                    <Calendar size={16} className="text-text-faint" />
                  </button>
                  <TanggalPicker
                    terbuka={tanggalPickerTerbuka}
                    posisi={posisiTanggalPicker}
                    nilai={tanggalRencanaBaru}
                    onPilih={setTanggalRencanaBaru}
                    onTutup={() => setTanggalPickerTerbuka(false)}
                  />
                </FieldTambah>

                <FieldTambah label="Masukkan ke" wajib>
                  <SelectKustom value={mingguBaru} onChange={setMingguBaru} opsi={opsiMinggu} ikon={<Calendar size={16} />} />
                </FieldTambah>

                <FieldTambah label="Pertemuan ke-">
                  <InputIkon
                    value={pertemuanKeBaru}
                    onChange={setPertemuanKeBaru}
                    placeholder="Contoh: Pertemuan ke-1"
                    ikon={<Hash size={16} />}
                  />
                </FieldTambah>

                <FieldTambah label="Tujuan Pembelajaran">
                  <InputIkon
                    value={tujuanBaru}
                    onChange={setTujuanBaru}
                    placeholder="Apa yang ingin dicapai dari materi ini?"
                    ikon={<Target size={16} />}
                  />
                </FieldTambah>

                <FieldTambah label="Catatan">
                  <div className="relative">
                    <textarea
                      value={catatanBaru}
                      onChange={(e) => setCatatanBaru(e.target.value.slice(0, 200))}
                      placeholder="Catatan tambahan untuk materi ini..."
                      rows={3}
                      maxLength={200}
                      className={`${INPUT_STYLE} resize-none pr-8`}
                    />
                    <span className="pointer-events-none absolute top-2.5 right-3 text-text-faint">
                      <FileText size={16} />
                    </span>
                  </div>
                  <div className="mt-1 text-right text-[10.5px] text-text-faint">{catatanBaru.length}/200</div>
                </FieldTambah>

                <FieldTambah label="Referensi / Sumber">
                  <InputIkon
                    value={referensiBaru}
                    onChange={setReferensiBaru}
                    placeholder="Buku, ayat, hadits, atau sumber lain"
                    ikon={<Link2 size={16} />}
                  />
                </FieldTambah>

                <div className="mb-1 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-text-dim">
                      <Bell size={16} />
                    </span>
                    <div>
                      <div className="text-[12.5px] font-semibold text-text">Pengingat</div>
                      <div className="text-[10.5px] text-text-dim">Ingatkan saya sebelum tanggal rencana</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pengingatBaru}
                    onClick={() => setPengingatBaru((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-none transition-colors duration-150 ${
                      pengingatBaru ? 'bg-indigo' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
                        pengingatBaru ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex shrink-0 gap-2.5 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={() => setTambahTerbuka(false)}
                  className="flex-1 cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel-2 py-3 text-[14px] font-semibold text-text"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={judulBaru.trim().length === 0 || tanggalRencanaBaru === '' || menyimpan}
                  onClick={simpanMateriBaru}
                  className="flex flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
                >
                  <Check size={16} strokeWidth={2.6} />
                  Simpan Materi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pilih Jenis Materi -- gerbang baru sblm form (diminta owner
            2026-08-23): Materi Ngaji (per-minggu, form lama) vs Materi
            Klasikal (sesi pembukaan KBM: hafalan surat + hafalan doa). */}
        {pilihJenisTerbuka && (
          <div
            className="fixed inset-0 z-[600] flex items-end justify-center bg-[rgba(15,23,42,0.55)] backdrop-blur-[3px] sm:items-center sm:p-6"
            onClick={() => setPilihJenisTerbuka(false)}
          >
            <div
              className="flex w-full max-w-[420px] flex-col rounded-t-[24px] bg-panel text-left shadow-[0_24px_48px_rgba(0,0,0,0.28)] sm:rounded-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 justify-center pt-2.5 sm:hidden">
                <span className="h-1 w-9 rounded-full bg-border" />
              </div>
              <div className="flex shrink-0 items-center justify-between px-6 pt-4 pb-3">
                <div className="text-[16px] font-bold text-text">Tambah Materi</div>
                <button
                  type="button"
                  onClick={() => setPilihJenisTerbuka(false)}
                  aria-label="Tutup"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
                >
                  <X size={15} strokeWidth={2.4} />
                </button>
              </div>
              <div className="flex flex-col gap-2.5 px-6 pb-6">
                <button
                  type="button"
                  onClick={() => {
                    setPilihJenisTerbuka(false);
                    bukaFormTambah();
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-panel-2 p-4 text-left transition-colors duration-150 hover:border-brass"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-indigo">
                    <BookOpen size={20} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-text">Materi Ngaji</span>
                    <span className="block text-[12px] text-text-dim">Materi per-minggu spt biasa</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-text-faint" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPilihJenisTerbuka(false);
                    bukaFormKlasikal();
                  }}
                  className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-panel-2 p-4 text-left transition-colors duration-150 hover:border-brass"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[rgba(5,150,105,0.12)] text-sage">
                    <Users size={20} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-text">Materi Klasikal</span>
                    <span className="block text-[12px] text-text-dim">Sesi pembukaan: hafalan surat & doa</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-text-faint" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tambah Materi Klasikal */}
        {klasikalTerbuka && (
          <div
            className="fixed inset-0 z-[600] flex items-end justify-center bg-[rgba(15,23,42,0.55)] backdrop-blur-[3px] sm:items-center sm:p-6"
            onClick={() => setKlasikalTerbuka(false)}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-[24px] bg-panel text-left shadow-[0_24px_48px_rgba(0,0,0,0.28)] sm:rounded-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 justify-center pt-2.5 sm:hidden">
                <span className="h-1 w-9 rounded-full bg-border" />
              </div>

              <div className="flex shrink-0 items-center justify-between px-6 pt-4 pb-3">
                <div className="text-[16px] font-bold text-text">Tambah Materi Klasikal</div>
                <button
                  type="button"
                  onClick={() => setKlasikalTerbuka(false)}
                  aria-label="Tutup"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
                >
                  <X size={15} strokeWidth={2.4} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-4">
                <FieldTambah label="Tanggal" wajib>
                  <button
                    ref={tanggalKlasikalBtnRef}
                    type="button"
                    onClick={() => {
                      const rect = tanggalKlasikalBtnRef.current?.getBoundingClientRect();
                      if (rect) {
                        setPosisiTanggalKlasikalPicker({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                      }
                      setTanggalKlasikalPickerTerbuka((v) => !v);
                    }}
                    className={`${INPUT_STYLE} flex items-center justify-between`}
                  >
                    <span className={tanggalKlasikalBaru ? 'text-text' : 'text-text-faint'}>
                      {tanggalKlasikalBaru
                        ? new Date(tanggalKlasikalBaru + 'T00:00:00').toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : 'Pilih tanggal'}
                    </span>
                    <Calendar size={16} className="text-text-faint" />
                  </button>
                  <TanggalPicker
                    terbuka={tanggalKlasikalPickerTerbuka}
                    posisi={posisiTanggalKlasikalPicker}
                    nilai={tanggalKlasikalBaru}
                    onPilih={(v) => {
                      setTanggalKlasikalBaru(v);
                      /* Pengingat Jumat minggu ke-1/2 -- diminta owner
                         2026-08-23. Pengecekan "minggu ke-1/2" pakai
                         tanggal 1-14 (blok kasar rentangMinggu yg sama
                         dgn kartu Klasikal di atas), BUKAN nama hari
                         doang -- Jumat di minggu ke-3/4/5 TIDAK kena. */
                      const tgl = new Date(v + 'T00:00:00');
                      if (tgl.getDay() === 5 && tgl.getDate() <= 14) {
                        push(
                          'Ingat: Jumat minggu ke-1/2 biasanya jadwal latihan Pencak Silat Asad.',
                          'info'
                        );
                      }
                    }}
                    onTutup={() => setTanggalKlasikalPickerTerbuka(false)}
                    tanggalNonaktif={nonaktifKalenderKlasikal}
                  />
                </FieldTambah>

                <FieldTambah
                  label="Hafalan Surat-Surat Al-Qur'an"
                  wajib
                  info="Batas maksimal: satu halaman Al-Qur'an Pojok. Toleransi tambah satu surat jika diperlukan."
                >
                  {opsiHafalanSurat.length === 0 ? (
                    <div className={`${INPUT_STYLE} text-text-faint`}>Belum ada materi di Kurikulum</div>
                  ) : (
                    <div className="max-h-[260px] overflow-y-auto rounded-[var(--radius)] border border-border">
                      {opsiHafalanSurat.map((o) => {
                        const dipilih = hafalanSuratBaru.includes(o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            onClick={() => toggleHafalanSurat(o.value)}
                            aria-pressed={dipilih}
                            className={`flex w-full cursor-pointer items-center gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors duration-150 last:border-b-0 hover:bg-panel-2 ${
                              dipilih ? 'bg-[rgba(79,70,229,0.06)]' : ''
                            }`}
                          >
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border ${
                                dipilih ? 'border-indigo bg-indigo' : 'border-border bg-panel'
                              }`}
                            >
                              {dipilih && <Check size={13} strokeWidth={3} className="text-white" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-text">{o.label}</span>
                              {o.sublabel && (
                                <span className="block truncate text-[11px] text-text-faint">{o.sublabel}</span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {hafalanSuratBaru.length > 0 && (
                    <div className="mt-1.5 text-[11.5px] text-text-dim">
                      Dipilih ({hafalanSuratBaru.length}): {hafalanSuratBaru.join(', ')}
                    </div>
                  )}
                </FieldTambah>

                <FieldTambah label="Materi Hafalan Do'a-Do'a Harian">
                  <InputIkon
                    value={hafalanDoaBaru}
                    onChange={setHafalanDoaBaru}
                    placeholder="Termasuk Asmaul Husna -- ketentuan menyusul"
                    ikon={<Tag size={16} />}
                  />
                </FieldTambah>
              </div>

              <div className="flex shrink-0 gap-2.5 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={() => setKlasikalTerbuka(false)}
                  className="flex-1 cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel-2 py-3 text-[14px] font-semibold text-text"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={
                    tanggalKlasikalBaru === '' || hafalanSuratBaru.length === 0 || menyimpanKlasikal
                  }
                  onClick={simpanKlasikalBaru}
                  className="flex flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
                >
                  <Check size={16} strokeWidth={2.6} />
                  Simpan Materi
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tombol Tambah Materi — diminta owner (20 Agt): SELALU di bawah,
          fixed (tidak ikut scroll), tidak bergerak/hilang saat pindah
          kelas atau saat kelas belum dipilih. Pola SAMA PERSIS bottom-bar
          Simpan Kehadiran di GuruAbsensiView.tsx (fixed viewport-wide +
          gradient fade + wadah max-w-[430px] mx-auto supaya tombol tidak
          ikut melebar di desktop, safe-area utk notch HP). Kalau kelas
          belum dipilih, tombol tetap tampil tapi klik-nya cuma munculkan
          toast pengingat -- TIDAK membuka form (kelasId dibutuhkan utk
          simpan materi). */}
      <div
        className="fixed right-0 bottom-0 left-0 px-[18px] pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]"
        style={{ background: 'linear-gradient(180deg, rgba(248,250,252,0) 0%, var(--bg) 30%)' }}
      >
        <div className="mx-auto max-w-[430px]">
          <button
            type="button"
            onClick={() => {
              if (kelasId === '') {
                push('Pilih kelas dulu sebelum menambahkan materi.', 'info');
                return;
              }
              setPilihJenisTerbuka(true);
            }}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-[13px] text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(79,70,229,0.3)] transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
          >
            <Plus size={18} strokeWidth={2.4} />
            Tambah Materi
          </button>
        </div>
      </div>
    </main>
  );
}
