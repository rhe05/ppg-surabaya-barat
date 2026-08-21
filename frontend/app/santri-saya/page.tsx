'use client';

/* Halaman "Data Generus" — mobile guru, diletakkan di bawah Dashboard pada
   menu hamburger (MenuGuru.tsx). Guru melihat & mengelola data santri HANYA
   untuk kelas yang dia ampu sendiri; kalau mengampu >1 kelas, dia memilih
   dulu lewat KelasGate (pola yang sama dipakai /absensi).

   Tambah lewat RPC tambah_santri (kelas_ngaji dikunci ke kelas yang sedang
   dibuka), ubah lewat UPDATE langsung -- keduanya ditahan RLS/scope guru
   (migrasi 20260821120000), jadi penguncian di layar ini kenyamanan, bukan
   satu-satunya pengaman. Admin sudah punya jalur sendiri di /santri
   (desktop, tabel penuh lintas kelas) -- halaman ini tidak menggantikannya.

   "Hapus" BUKAN hapus biasa -- kartu daftar tidak punya tombol hapus sama
   sekali (diminta owner: satu tap kartu = satu aksi, buka form Ubah).
   Tombol "Hapus" ada DI DALAM form Ubah (footer, lihat prop `onHapus` di
   SantriForm) dan membuka NonaktifkanModal di bawah -- guru pilih
   Pindah/Tidak Aktif, lalu RPC nonaktifkan_santri (migrasi 20260821130000)
   mencatat peristiwa ke siklus_generus DAN men-soft-delete santri SEJAK
   TANGGAL PERISTIWA itu, satu transaksi. santri.deleted_at dipakai sbg
   "sejak kapan tidak aktif", bukan cuma "kapan diklik" -- itu yang membuat
   layar berperiode (Riwayat Kehadiran, Laporan, Statistik, dst -- lihat
   migrasi 20260821140000 & perubahan query terkait) tetap menunjukkan data
   lamanya walau sekarang santrinya sudah tidak aktif. */

import { useCallback, useEffect, useState } from 'react';
import {
  User,
  UserPlus,
  ArrowLeftRight,
  TrendingUp,
  House,
  UserRoundX,
  Check,
} from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import KelasGate, { KelasGateItem } from '@/components/absensi/KelasGate';
import SantriForm, { SantriRow, KOLOM_SANTRI } from '@/components/santri/SantriForm';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';

type Kelas = { id: number; nama: string; santri_count: number };

/* Urutan jenjang persis enum santri_jenjang -- dipakai cuma utk PRATINJAU
   di NaikKelasModal (nama lama -> nama baru); kenaikan sesungguhnya
   dihitung ULANG di server oleh RPC naikkan_jenjang_santri (migrasi
   20260821160000), bukan dikirim dari sini. */
const JENJANG_URUT = ['PAUD/TK', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja'];
function jenjangBerikutnya(sekarang: string | null): string | null {
  if (!sekarang) return null;
  const idx = JENJANG_URUT.indexOf(sekarang);
  if (idx === -1 || idx === JENJANG_URUT.length - 1) return null;
  return JENJANG_URUT[idx + 1];
}

/* Satu sumber kebenaran per aksi massal: label bilah bawah, keterangan
   ajakan, dan warna (kartu tercentang, tombol bilah bawah) -- dipakai di
   3 tempat (caption, kartu, bilah bawah) supaya menambah aksi baru cukup
   nambah satu baris di sini, bukan menambah ternary baru di 3 tempat. */
const MASSAL: Record<
  'pindah' | 'naik' | 'pindah_domisili' | 'non_aktif',
  { label: string; ajakan: string; border: string; bg: string; bgLembut: string }
> = {
  pindah: {
    label: 'Pindah',
    ajakan: 'Ketuk santri yang mau dipindah kelasnya, boleh lebih dari satu.',
    border: 'border-indigo',
    bg: 'border-indigo bg-indigo',
    bgLembut: 'bg-[rgba(79,70,229,0.05)]',
  },
  naik: {
    label: 'Naik Kelas',
    ajakan: 'Ketuk santri yang mau dinaikkan jenjangnya, boleh lebih dari satu.',
    border: 'border-sage',
    bg: 'border-sage bg-sage',
    bgLembut: 'bg-[rgba(5,150,105,0.05)]',
  },
  pindah_domisili: {
    label: 'Pindah Domisili',
    ajakan: 'Ketuk santri yang mau ditandai Pindah Domisili, boleh lebih dari satu.',
    border: 'border-brass',
    bg: 'border-brass bg-brass',
    bgLembut: 'bg-[rgba(217,119,6,0.05)]',
  },
  non_aktif: {
    label: 'Non Aktif',
    ajakan: 'Ketuk santri yang mau ditandai Non Aktif, boleh lebih dari satu.',
    border: 'border-red',
    bg: 'border-red bg-red',
    bgLembut: 'bg-[rgba(220,38,38,0.05)]',
  },
};

function hariIni() {
  const now = new Date();
  const lokal = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return lokal.toISOString().slice(0, 10);
}

/* Konfirmasi "Pindah Domisili" / "Non Aktif" -- aksi massal (mode centang,
   sama pola dgn Pindah Kelas & Naik Kelas), pengganti tombol "Hapus" yang
   dulu ada DI DALAM form Ubah (satu santri). `jenis` sudah tetap ditentukan
   dari menu mana yang diklik (bukan radio pilihan lagi spt versi lama) --
   RPC nonaktifkan_santri (migrasi 20260821130000, jadi massal di migrasi
   20260821170000) mencatat siklus_generus + soft-delete SEMUA santri
   terpilih sejak tanggal yang sama, satu transaksi. */
function NonaktifkanMassalModal({
  jenis,
  judul,
  deskripsi,
  jumlah,
  onKonfirmasi,
  onBatal,
}: {
  jenis: 'Pindah' | 'Tidak Aktif';
  judul: string;
  deskripsi: string;
  jumlah: number;
  onKonfirmasi: (tanggal: string, keterangan: string) => Promise<void>;
  onBatal: () => void;
}) {
  const [tanggal, setTanggal] = useState(hariIni);
  const [keterangan, setKeterangan] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan() {
    setMenyimpan(true);
    setError(null);
    try {
      await onKonfirmasi(tanggal, keterangan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-[430px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <h2 className="mb-1 text-[17px] font-bold text-text">{judul}</h2>
        <p className="mb-4 text-[12.5px] text-text-dim">
          {jumlah} santri terpilih {deskripsi} sejak tanggal di bawah. Riwayat kehadiran
          sebelumnya tetap tersimpan utuh di laporan.
        </p>

        <label className="mb-1.5 block text-[12px] font-semibold text-text">Sejak Tanggal</label>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        <label className="mb-1.5 block text-[12px] font-semibold text-text">
          Keterangan (opsional)
        </label>
        <input
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder={jenis === 'Pindah' ? 'Misal: pindah ke TPQ Al-Ikhlas' : ''}
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={menyimpan}
            onClick={simpan}
            className={`flex-1 cursor-pointer rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40 ${
              jenis === 'Pindah' ? 'border-brass bg-brass' : 'border-red bg-red'
            }`}
          >
            {menyimpan ? 'Menyimpan...' : judul}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Popup 2 pilihan di bawah tombol ikon orang (pengganti tombol teks
   "+ Generus") -- pola dropdown-menu standar SaaS: overlay transparan +
   panel melayang nempel ke tombol pemicu (anchor via `absolute` di
   wrapper `relative`, BUKAN dihitung dari getBoundingClientRect spt
   KelasGate/TanggalPicker -- posisinya selalu sama relatif tombolnya,
   tidak perlu hitung ulang). */
function TambahMenu({
  terbuka,
  onTutup,
  onTambah,
  onPindahKelas,
  onPindahDomisili,
  onNaikKelas,
  onNonAktif,
  bisaPindahKelas,
}: {
  terbuka: boolean;
  onTutup: () => void;
  onTambah: () => void;
  onPindahKelas: () => void;
  onPindahDomisili: () => void;
  onNaikKelas: () => void;
  onNonAktif: () => void;
  bisaPindahKelas: boolean;
}) {
  if (!terbuka) return null;
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onTutup} />
      <div className="absolute top-full right-0 z-[91] mt-2 flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-lg)] border border-border bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
        <button
          type="button"
          onClick={() => {
            onTutup();
            onTambah();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
        >
          <UserPlus size={18} strokeWidth={2} className="shrink-0 text-brass" />
          <span>Generus</span>
        </button>
        <button
          type="button"
          disabled={!bisaPindahKelas}
          onClick={() => {
            onTutup();
            onPindahKelas();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowLeftRight size={18} strokeWidth={2} className="shrink-0 text-indigo" />
          <span>Pindah Kelas</span>
        </button>
        {!bisaPindahKelas && (
          <p className="px-3 pt-1 pb-1.5 text-[11px] text-text-faint">
            Anda hanya mengampu satu kelas.
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            onTutup();
            onPindahDomisili();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
        >
          <House size={18} strokeWidth={2} className="shrink-0 text-brass" />
          <span>Pindah Domisili</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onTutup();
            onNaikKelas();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
        >
          <TrendingUp size={18} strokeWidth={2} className="shrink-0 text-sage" />
          <span>Naik Kelas</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onTutup();
            onNonAktif();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
        >
          <UserRoundX size={18} strokeWidth={2} className="shrink-0 text-red" />
          <span>Non Aktif</span>
        </button>
      </div>
    </>
  );
}

/* Konfirmasi "Pindah Kelas" -- muncul SETELAH guru memilih santri (mode
   centang di daftar) & menekan tombol "Pindah" di bilah bawah. Menampilkan
   berapa santri terpilih + daftar kelas tujuan (kelas guru sendiri yang
   LAIN dari kelas yang sedang dibuka -- satu-satunya tujuan yang valid dari
   layar ini). RPC pindah_kelas_santri (migrasi 20260821150000) sebenarnya
   juga mengizinkan kelas tujuan milik guru lain dalam kelompok yang sama,
   tapi layar ini cuma tahu kelas guru yang sedang login. */
function PindahKelasModal({
  jumlah,
  opsiKelas,
  onKonfirmasi,
  onBatal,
}: {
  jumlah: number;
  opsiKelas: Kelas[];
  onKonfirmasi: (kelasTujuanId: number) => Promise<void>;
  onBatal: () => void;
}) {
  const [kelasTujuanId, setKelasTujuanId] = useState<number | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function konfirmasi() {
    if (kelasTujuanId === null) return;
    setMenyimpan(true);
    setError(null);
    try {
      await onKonfirmasi(kelasTujuanId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memindah kelas.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-[430px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <h2 className="mb-1 text-[17px] font-bold text-text">Pindah Kelas</h2>
        <p className="mb-4 text-[12.5px] text-text-dim">
          {jumlah} santri terpilih akan dipindah ke kelas yang Anda pilih di bawah ini.
        </p>

        <div className="mb-4 flex flex-col gap-2.5">
          {opsiKelas.map((k) => (
            <label
              key={k.id}
              className={`flex cursor-pointer items-center gap-2.5 rounded-card border-[1.5px] p-3 ${
                kelasTujuanId === k.id ? 'border-indigo bg-[rgba(79,70,229,0.06)]' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="kelas_tujuan"
                className="shrink-0"
                checked={kelasTujuanId === k.id}
                onChange={() => setKelasTujuanId(k.id)}
              />
              <span className="text-[13.5px] font-bold text-text">Kelas {k.nama}</span>
            </label>
          ))}
        </div>

        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={menyimpan || kelasTujuanId === null}
            onClick={konfirmasi}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-indigo bg-indigo px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {menyimpan ? 'Memindah...' : 'Pindah'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Konfirmasi "Naik Kelas" -- naikkan JENJANG (bukan kelas_ngaji/kelas_id
   spt "Pindah Kelas") satu tingkat sekaligus utk semua santri terpilih.
   Tidak perlu pilih tujuan (beda dari Pindah Kelas): tujuannya selalu
   "satu tingkat di atas jenjang masing-masing", jadi cukup pratinjau +
   konfirmasi. Santri yang sudah di jenjang tertinggi (Remaja) ditandai
   & dilewati server (RPC naikkan_jenjang_santri, migrasi 20260821160000),
   bukan menggagalkan permintaan yang lain. */
function NaikKelasModal({
  daftarSantri,
  onKonfirmasi,
  onBatal,
}: {
  daftarSantri: SantriRow[];
  onKonfirmasi: () => Promise<void>;
  onBatal: () => void;
}) {
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bisaNaik = daftarSantri.filter((s) => jenjangBerikutnya(s.jenjang_saat_ini) !== null);
  const sudahMentok = daftarSantri.length - bisaNaik.length;

  async function konfirmasi() {
    setMenyimpan(true);
    setError(null);
    try {
      await onKonfirmasi();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menaikkan jenjang.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-[430px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <h2 className="mb-1 text-[17px] font-bold text-text">Naik Kelas</h2>
        <p className="mb-4 text-[12.5px] text-text-dim">
          Jenjang tiap santri terpilih naik satu tingkat.
        </p>

        <div className="mb-4 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
          {daftarSantri.map((s) => {
            const berikutnya = jenjangBerikutnya(s.jenjang_saat_ini);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-card border border-border p-3"
              >
                <span className="min-w-0 truncate text-[13px] font-semibold text-text">{s.nama}</span>
                {berikutnya ? (
                  <span className="shrink-0 text-[11.5px] font-bold text-sage">
                    {s.jenjang_saat_ini} → {berikutnya}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-text-faint">sudah tertinggi</span>
                )}
              </div>
            );
          })}
        </div>

        {sudahMentok > 0 && (
          <p className="mb-3 text-[11.5px] text-text-faint">
            {sudahMentok} santri sudah di jenjang tertinggi, tidak ikut dinaikkan.
          </p>
        )}

        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={menyimpan || bisaNaik.length === 0}
            onClick={konfirmasi}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-sage bg-sage px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {menyimpan ? 'Menaikkan...' : 'Naikkan'}
          </button>
        </div>
      </div>
    </div>
  );
}

const JENJANG_SINGKAT: Record<string, string> = {
  'PAUD/TK': 'PAUD/TK',
  'Cabe Rawit': 'Cabe Rawit',
  'Pra Remaja': 'Pra Remaja',
  'Remaja SMA': 'Remaja SMA',
  Remaja: 'Remaja',
};

function IkonKelas() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}

function DataGenerusContent() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | null>(null);
  const [gateTerbuka, setGateTerbuka] = useState(false);

  const [santri, setSantri] = useState<SantriRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [santriDiubah, setSantriDiubah] = useState<SantriRow | null>(null);

  const [menuTambahTerbuka, setMenuTambahTerbuka] = useState(false);
  /* null = mode normal (tap kartu = buka Ubah). Selain itu = mode centang
     aksi massal -- tap kartu memilih/batal pilih, bukan buka form. Satu
     set state dipakai bergantian utk ke-4 aksi supaya UI kartu & bilah
     bawah tidak perlu diduplikasi 4x. */
  const [modeMassal, setModeMassal] = useState<
    'pindah' | 'naik' | 'pindah_domisili' | 'non_aktif' | null
  >(null);
  const [terpilihMassal, setTerpilihMassal] = useState<Set<number>>(new Set());
  const [konfirmasiPindahTerbuka, setKonfirmasiPindahTerbuka] = useState(false);
  const [konfirmasiNaikTerbuka, setKonfirmasiNaikTerbuka] = useState(false);
  const [konfirmasiNonaktifTerbuka, setKonfirmasiNonaktifTerbuka] = useState(false);
  const [pesanTerkirim, setPesanTerkirim] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function muatKelas() {
      if (!guruId) {
        setKelasList([]);
        return;
      }
      const { data } = await supabase
        .from('kelas')
        .select('id, nama, santri_count')
        .eq('guru_id', guruId)
        .is('deleted_at', null)
        .order('nama');
      if (cancelled) return;
      const daftar = data ?? [];
      setKelasList(daftar);
      if (daftar.length === 1) setKelasId(daftar[0].id);
      else if (daftar.length > 1) setGateTerbuka(true);
    }
    muatKelas();
    return () => {
      cancelled = true;
    };
  }, [guruId]);

  const muatSantri = useCallback(async () => {
    if (!kelasId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('santri')
      .select(KOLOM_SANTRI)
      .eq('kelas_id', kelasId)
      .is('deleted_at', null)
      .order('nama');
    if (err) setError(err.message);
    else setSantri((data ?? []) as unknown as SantriRow[]);
    setLoading(false);
  }, [kelasId]);

  useEffect(() => {
    muatSantri();
  }, [muatSantri]);

  const kelasAktif = kelasList.find((k) => k.id === kelasId) ?? null;
  const gateDaftar: KelasGateItem[] = kelasList.map((k) => ({
    id: k.id,
    nama: k.nama,
    jumlah: k.santri_count,
  }));

  const santriTersaring = cari.trim()
    ? santri.filter(
        (s) =>
          s.nama.toLowerCase().includes(cari.trim().toLowerCase()) ||
          (s.nis ?? '').toLowerCase().includes(cari.trim().toLowerCase()),
      )
    : santri;

  function bukaTambah() {
    setSantriDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(s: SantriRow) {
    setSantriDiubah(s);
    setFormTerbuka(true);
  }
  function selesaiForm(diajukan?: boolean) {
    setFormTerbuka(false);
    setSantriDiubah(null);
    muatSantri();
    if (diajukan) tampilkanPesanTerkirim();
  }
  function tampilkanPesanTerkirim() {
    setPesanTerkirim('Permintaan terkirim, menunggu persetujuan Admin Kelp.');
    setTimeout(() => setPesanTerkirim(null), 5000);
  }
  function mulaiModeMassal(mode: 'pindah' | 'naik' | 'pindah_domisili' | 'non_aktif') {
    setTerpilihMassal(new Set());
    setModeMassal(mode);
  }
  function batalModeMassal() {
    setModeMassal(null);
    setTerpilihMassal(new Set());
  }
  function toggleTerpilih(id: number) {
    setTerpilihMassal((s) => {
      const baru = new Set(s);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  }
  /* Keempat aksi massal ini TIDAK LAGI memanggil pindah_kelas_santri/
     naikkan_jenjang_santri/nonaktifkan_santri langsung (migrasi
     20260821180000, fungsi2 itu sekarang admin-only) -- semua lewat
     ajukan_permintaan_generus(), ditahan pending sampai Admin Kelp
     menyetujui/menolak (lonceng di top bar). */
  async function konfirmasiPindahKelas(kelasTujuanId: number) {
    const { error: err } = await supabase.rpc('ajukan_permintaan_generus', {
      p: {
        jenis: 'pindah_kelas',
        payload: { santri_ids: Array.from(terpilihMassal), kelas_tujuan_id: kelasTujuanId },
      },
    });
    if (err) throw new Error(err.message);
    setKonfirmasiPindahTerbuka(false);
    batalModeMassal();
    muatSantri();
    tampilkanPesanTerkirim();
  }
  async function konfirmasiNaikKelas() {
    const { error: err } = await supabase.rpc('ajukan_permintaan_generus', {
      p: { jenis: 'naik_kelas', payload: { santri_ids: Array.from(terpilihMassal) } },
    });
    if (err) throw new Error(err.message);
    setKonfirmasiNaikTerbuka(false);
    batalModeMassal();
    muatSantri();
    tampilkanPesanTerkirim();
  }
  async function konfirmasiNonaktifMassal(tanggal: string, keterangan: string) {
    const jenis = modeMassal === 'pindah_domisili' ? 'pindah_domisili' : 'non_aktif';
    const { error: err } = await supabase.rpc('ajukan_permintaan_generus', {
      p: { jenis, payload: { santri_ids: Array.from(terpilihMassal), tanggal, keterangan } },
    });
    if (err) throw new Error(err.message);
    setKonfirmasiNonaktifTerbuka(false);
    batalModeMassal();
    muatSantri();
    tampilkanPesanTerkirim();
  }

  if (!guruId) {
    return (
      <main className="relative flex min-h-screen flex-col bg-bg">
        <JurnalHeaderChrome tampilkanHero={false} />
        <div className="mx-auto w-full max-w-3xl p-6">
          <h1 className="mb-2 text-[24px] font-bold text-text">Data Generus</h1>
          <p className="text-[13px] text-text-dim">
            Halaman ini untuk akun yang tertaut ke data guru. Akun Anda belum punya tautan itu
            (<code>profiles.guru_id</code> masih kosong), jadi Data Generus belum bisa dipakai.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-bg">
      {/* Top bar putih (hamburger + brand + bell), TANPA hero hijau --
          samakan dgn layar turunan Jurnal (Rencana Pembelajaran dkk, lihat
          JurnalHeaderChrome.tsx): layar sub-alur spt ini tidak perlu
          mengulang info yang sudah dilihat guru di Dashboard, tapi tetap
          butuh jalan kembali ke menu. */}
      <JurnalHeaderChrome tampilkanHero={false} />
      <div className="mx-auto w-full max-w-3xl px-[18px] pt-4 pb-8">
      <KelasGate
        terbuka={gateTerbuka}
        ikon={<IkonKelas />}
        judul="Pilih Kelas"
        subjudul="Jenengan mengajar lebih dari satu kelas. Pilih salah satu untuk melihat Data Generus-nya."
        daftar={gateDaftar}
        onPilih={(item) => {
          setKelasId(item.id);
          setGateTerbuka(false);
        }}
        onBatal={() => setGateTerbuka(false)}
      />

      {formTerbuka && kelasAktif && (
        <SantriForm
          santri={santriDiubah}
          kelasNgajiTerkunci={kelasAktif.nama}
          onSelesai={selesaiForm}
          onBatal={() => setFormTerbuka(false)}
        />
      )}

      {/* Toast "menunggu persetujuan" -- muncul sesaat tiap kali salah satu
          dari 5 aksi guru diajukan (migrasi 20260821180000), auto-hilang
          5 detik. fixed spt tombol/bilah lain di layar ini -- lihat
          catatan max-w-[430px] di elemen fixed serupa. */}
      {pesanTerkirim && (
        <div className="fixed inset-x-0 top-4 z-[600] flex justify-center px-6">
          <div className="w-full max-w-[430px] rounded-[var(--radius-lg)] border border-indigo bg-[#EEF2FF] px-4 py-3 text-[13px] font-semibold text-indigo shadow-[0_8px_24px_rgba(79,70,229,0.2)]">
            {pesanTerkirim}
          </div>
        </div>
      )}

      {/* Judul + chip pilih kelas digabung satu kolom, pola SAMA PERSIS
          RencanaPembelajaranView.tsx: chip langsung mengganti kelasId di
          tempat (tanpa popup) begitu ada >1 kelas, chip aktif ditandai
          indigo. Popup KelasGate di atas tetap ada, tapi cuma kepakai
          otomatis sekali saat layar pertama dibuka (>1 kelas & belum ada
          pilihan) -- lihat efek muatKelas(). */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="pt-1.5 text-[17px] font-extrabold text-text">Data Generus</div>
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
        {/* Mode aksi massal aktif (Pindah/Naik Kelas) -> tombol jadi "Batal"
            (keluar mode centang). Selain itu -> tombol ikon orang bulat,
            sejajar judul, di bawah lonceng top bar (pengganti tombol teks
            "+ Generus" sebelumnya + popup 3 pilihan). */}
        {kelasAktif && (
          <div className="relative mt-1.5 shrink-0">
            {modeMassal ? (
              <button
                type="button"
                onClick={batalModeMassal}
                className="cursor-pointer rounded-full border border-border bg-panel-2 px-4 py-2 text-[13px] font-bold text-text active:scale-[0.96]"
              >
                Batal
              </button>
            ) : (
              <button
                type="button"
                aria-label="Tambah / Pindah / Naik Kelas"
                onClick={() => setMenuTambahTerbuka((v) => !v)}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-brass text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] active:scale-[0.92]"
              >
                <User size={19} strokeWidth={2} />
              </button>
            )}
            <TambahMenu
              terbuka={menuTambahTerbuka}
              onTutup={() => setMenuTambahTerbuka(false)}
              onTambah={bukaTambah}
              onPindahKelas={() => mulaiModeMassal('pindah')}
              onPindahDomisili={() => mulaiModeMassal('pindah_domisili')}
              onNaikKelas={() => mulaiModeMassal('naik')}
              onNonAktif={() => mulaiModeMassal('non_aktif')}
              bisaPindahKelas={kelasList.length > 1}
            />
          </div>
        )}
      </div>

      {kelasList.length === 0 && (
        <p className="mt-4 text-[13px] text-text-dim">
          Anda belum mengampu kelas mana pun, jadi belum ada Data Generus yang bisa ditampilkan.
        </p>
      )}

      {kelasAktif && (
        <>
          {modeMassal && (
            <p className="-mt-2 mb-4 text-[12.5px] text-text-dim">{MASSAL[modeMassal].ajakan}</p>
          )}

          <div className="my-4">
            <input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama atau NIS..."
              className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
            />
          </div>

          {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
          {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

          {!loading && santriTersaring.length === 0 && (
            <p className="text-[13px] text-text-dim">
              {cari.trim() ? 'Tidak ada yang cocok.' : 'Kelas ini belum punya santri.'}
            </p>
          )}

          <div className="flex flex-col gap-2.5">
            {santriTersaring.map((s) => {
              const dicentang = terpilihMassal.has(s.id);
              const warna = modeMassal ? MASSAL[modeMassal] : null;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (modeMassal ? toggleTerpilih(s.id) : bukaUbah(s))}
                  className={`flex items-center justify-between gap-3 rounded-card border-[1.5px] p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99] ${
                    warna && dicentang ? `${warna.border} ${warna.bgLembut}` : 'border-border bg-panel'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {modeMassal && (
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          dicentang ? `${warna!.bg} text-white` : 'border-border text-transparent'
                        }`}
                      >
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold text-text">{s.nama}</div>
                      <div className="mt-0.5 text-[11.5px] text-text-faint">
                        NIS {s.nis ?? '-'} ·{' '}
                        {s.gender === 'L' ? 'Laki-laki' : s.gender === 'P' ? 'Perempuan' : '-'}
                      </div>
                    </div>
                  </div>
                  {s.jenjang_saat_ini && (
                    <span className="shrink-0 rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[10.5px] font-bold text-sage">
                      {JENJANG_SINGKAT[s.jenjang_saat_ini] ?? s.jenjang_saat_ini}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Bilah aksi bawah, muncul HANYA dlm mode aksi massal -- fixed
              ke viewport sungguhan spt catatan di komponen lain (bungkus
              RequireAuth mobile sengaja bukan containing block). */}
          {modeMassal && (
            <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-6">
              <div className="flex w-full max-w-[430px] items-center justify-between gap-3 rounded-full border border-border bg-panel px-5 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
                <span className="text-[13px] font-semibold text-text">
                  {terpilihMassal.size} dipilih
                </span>
                <button
                  type="button"
                  disabled={terpilihMassal.size === 0}
                  onClick={() => {
                    if (modeMassal === 'pindah') setKonfirmasiPindahTerbuka(true);
                    else if (modeMassal === 'naik') setKonfirmasiNaikTerbuka(true);
                    else setKonfirmasiNonaktifTerbuka(true);
                  }}
                  className={`cursor-pointer rounded-full border px-5 py-2 text-[13px] font-bold text-white active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 ${MASSAL[modeMassal].bg}`}
                >
                  {MASSAL[modeMassal].label}
                </button>
              </div>
            </div>
          )}

          {konfirmasiPindahTerbuka && (
            <PindahKelasModal
              jumlah={terpilihMassal.size}
              opsiKelas={kelasList.filter((k) => k.id !== kelasId)}
              onKonfirmasi={konfirmasiPindahKelas}
              onBatal={() => setKonfirmasiPindahTerbuka(false)}
            />
          )}

          {konfirmasiNaikTerbuka && (
            <NaikKelasModal
              daftarSantri={santri.filter((s) => terpilihMassal.has(s.id))}
              onKonfirmasi={konfirmasiNaikKelas}
              onBatal={() => setKonfirmasiNaikTerbuka(false)}
            />
          )}

          {konfirmasiNonaktifTerbuka &&
            (modeMassal === 'pindah_domisili' || modeMassal === 'non_aktif') && (
              <NonaktifkanMassalModal
                jenis={modeMassal === 'pindah_domisili' ? 'Pindah' : 'Tidak Aktif'}
                judul={MASSAL[modeMassal].label}
                deskripsi={
                  modeMassal === 'pindah_domisili'
                    ? 'akan ditandai pindah domisili'
                    : 'akan ditandai tidak aktif'
                }
                jumlah={terpilihMassal.size}
                onKonfirmasi={konfirmasiNonaktifMassal}
                onBatal={() => setKonfirmasiNonaktifTerbuka(false)}
              />
            )}
        </>
      )}
      </div>
    </main>
  );
}

export default function DataGenerusPage() {
  return (
    <RequireAuth>
      <DataGenerusContent />
    </RequireAuth>
  );
}
