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
   mingguBulan.ts) -- SEJAK 2026-09-02 mengikuti hari Senin (Senin selalu
   membuka minggu baru), bukan lagi blok tetap 1-7/8-14/dst. Tetap BUKAN
   diturunkan dari hari KBM sungguhan di jadwal_kbm.

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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Calendar, Hash, FileText, Bell,
  X, Plus, Check, CalendarDays, ClipboardList, Users, ChevronRight, Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import Skeleton from '@/components/ui/Skeleton';
import KebabMenu from '@/components/ui/KebabMenu';
import SelectKustom, { type OpsiSelect } from '@/components/ui/SelectKustom';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import { rentangMinggu, labelRentangMinggu, mingguKeDariTanggal } from '@/lib/mingguBulan';
import { namaMateriTampil, KELAS_LABEL_BACA_HURUF } from '@/lib/kategori';
import { LIBUR_NASIONAL_2026 } from '@/lib/liburNasional';
import { muatOverrideKelompok, buatCekNonaktif, type OverrideKelompok } from '@/lib/kalenderKelompok';
import { muatTanggalAsad, tandaiAsad, batalkanAsad, kelasIkutAsad } from '@/lib/klasikalAsad';
import { barisHafalanDariTeks, uraikanBarisHafalan } from '@/lib/hafalanSurat';
import { uraikanTargetDoa, adalahMenerampilkanJenjangSebelumnya } from '@/lib/materiHafalanDoa';
import { pesanGalatDb } from '@/lib/pesanGalatDb';
import {
  muatKelasGuru,
  muatMateriBulan,
  muatProtaKelompok,
  tandaiMateriBerubah,
  namaKategori,
  type ProtaBaris,
} from '@/lib/dataGuru';

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
   Minggu N sendiri (rentangMinggu, lib/mingguBulan.ts) blok 7 hari yang
   dimulai hari Senin (Minggu 1 boleh lebih pendek, mengikuti kepala
   bulan), jadi baris yg ditampilkan cuma yg jatuh di hari kerja. */
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

/* Dua tanggal Senin-Jumat pertama & terakhir dlm rentang minggu itu --
   dipakai kartu Klasikal (diminta owner 2026-08-23). BEDA dari
   labelRentangMinggu (blok kalender kasar 7 hari, dipakai kartu Ngaji,
   TIDAK disentuh): ini cuma buang Sabtu/Minggu di ujung, TIDAK
   dipecah walau ada tanggal merah di tengahnya (mis. "24-28 Agustus
   2026" tetap ditampilkan utuh walau tgl 25-nya libur) -- tanggal
   merah cuma mengurangi angka di jumlahHariAktifMinggu di bawah,
   bukan memecah rentang tanggalnya. */
function labelRentangAktifMinggu(tahun: number, bulan: number, rentang: { awal: number; akhir: number }) {
  const hariKerja: number[] = [];
  for (let d = rentang.awal; d <= rentang.akhir; d++) {
    if (new Date(tahun, bulan - 1, d).getDay() % 6 !== 0) hariKerja.push(d);
  }
  if (hariKerja.length === 0) return '—';
  const awal = hariKerja[0];
  const akhir = hariKerja[hariKerja.length - 1];
  const rentangStr = awal === akhir ? `${awal}` : `${awal}-${akhir}`;
  return `${rentangStr} ${NAMA_BULAN[bulan - 1]} ${tahun}`;
}

/* Jumlah hari aktif ngaji sungguhan (Senin-Jumat DIKURANGI tanggal
   merah, numpang LIBUR_NASIONAL_2026 yg sama dgn kalender Tanggal
   Materi Klasikal -- lihat keterbatasan lintas-tahunnya di komentar
   LIBUR_NASIONAL_2026) -- ditampilkan terpisah di sebelah
   labelRentangAktifMinggu sbg "N Hari Aktif", diminta owner 2026-08-23. */
function jumlahHariAktifMinggu(tahun: number, bulan: number, rentang: { awal: number; akhir: number }) {
  let jumlah = 0;
  for (let d = rentang.awal; d <= rentang.akhir; d++) {
    const tgl = new Date(tahun, bulan - 1, d);
    if (tgl.getDay() % 6 === 0) continue;
    const iso = `${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (LIBUR_NASIONAL_2026[iso]) continue;
    jumlah += 1;
  }
  return jumlah;
}

/* Kode kelas Kurikulum, urut PAUD-TK dulu -- dipakai HANYA utk memotong
   daftar "s.d. kelas N" pada dropdown Hafalan Surat klasikal di bawah.
   Kode ini beda namespace dari `kelas.nama` (ruang guru, "1A") -- lihat
   komentar KATEGORI_TARGET_SEMESTER_GANDA / opsiMateriKurikulum di
   bawah utk masalah tanpa-kolom-penghubungnya. */
const KELAS_KURIKULUM_URUT = [
  'PAUD-TK', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
];
/* Ruang "Pra Remaja"/SMP berhenti di kelas 9, ruang SMA melanjutkan ke
   10-12 (diminta owner 2026-09-02). Dulu keduanya sama2 mentok di 9
   karena kelas 10-12 memang belum ada di Kurikulum. */
const BATAS_SMP = KELAS_KURIKULUM_URUT.indexOf('9') + 1;

/* Penguraian teks Prota Hafalan Surat jadi surat satu per satu dipindah
   ke lib/hafalanSurat.ts (2026-09-02) supaya bisa diuji langsung ke data
   produksi lewat tools/uji-hafalan-surat.mjs -- lihat berkas itu. */

/* Ruang guru "N" -> daftar kelas Kurikulum yang boleh disarankan,
   KUMULATIF PAUD-TK s.d. N (dipakai bareng Hafalan Surat & Hafalan
   Do'a -- dulu cuma di dalam opsiHafalanSurat, dipisah 2026-09-02
   supaya opsiHafalanDoa bisa memakainya jg tanpa menyalin ulang).
   Lihat komentar panjang di opsiHafalanSurat utk alasan lengkapnya. */
function kelasTargetKumulatif(namaRuangRaw: string): string[] {
  const namaRuang = namaRuangRaw.toLowerCase();
  if (namaRuang.includes('paud')) return ['PAUD-TK'];
  if (namaRuang.includes('sma')) return KELAS_KURIKULUM_URUT;
  if (/remaja|smp/.test(namaRuang)) return KELAS_KURIKULUM_URUT.slice(0, BATAS_SMP);
  const angka = [...namaRuang.matchAll(/\d+/g)].map((m) => Number(m[0]));
  const batasAtas = angka.length > 0 ? Math.max(...angka) : 0;
  return KELAS_KURIKULUM_URUT.slice(0, batasAtas + 1);
}

function labelKelasKurikulum(k: string | null) {
  return k === 'PAUD-TK' ? 'PAUD/TK' : `Kelas ${k}`;
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
          <div className="absolute top-full left-0 z-[701] mt-1.5 w-[230px] rounded-[var(--radius)] border border-border bg-panel p-2.5 text-[11px] leading-snug font-normal text-text shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
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
  sembunyikanPenanda,
  labelGelap,
  children,
}: {
  label: string;
  wajib?: boolean;
  /* Opsional: teks tooltip info singkat, muncul lewat ikon (i) di
     samping label -- lihat LabelInfo di atas. */
  info?: string;
  /* Sembunyikan tanda wajib(*)/(Opsional) bawaan sepenuhnya -- dipakai
     kalau field itu memang opsional tapi ownernya tidak mau tag
     "(Opsional)" ikut tampil sama sekali (diminta owner 2026-09-02
     utk field Hafalan Do'a-Do'a Harian: "hapus tulisan opsional"). */
  sembunyikanPenanda?: boolean;
  /* Label `text-text` (hitam pekat, --text: #0F172A) drpd `text-text-dim`
     bawaan (abu-abu) -- dipakai KHUSUS 3 field Tambah Materi Klasikal
     (diminta owner 2026-09-02: "ubah warna font dari abu abu menjadi
     hitam pekat ... Tanggal, Hafalan Surat-Surat Al-Qur'an, Hafalan
     Do'a-Do'a Harian", tujuannya keterbacaan di rekaman layar). Token
     yg SUDAH ADA (dipakai jg utk teks isi/heading di seluruh app),
     bukan warna baru -- tetap satu bahasa desain. */
  labelGelap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label
        className={`mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold ${labelGelap ? 'text-text' : 'text-text-dim'}`}
      >
        {label} {!sembunyikanPenanda && wajib && <span className="text-red">*</span>}
        {!sembunyikanPenanda && !wajib && <span className="font-normal text-text-faint"> (Opsional)</span>}
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
  const { push } = useToast();

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
  /* SATU pengambilan kurikulum untuk seluruh layar (audit 2026-09-02).
     Dulu tabel yang sama ditembak DUA KALI lewat dua efek terpisah --
     sekali utk saran "Materi Ngaji", sekali utk daftar Hafalan Surat --
     dan yang kedua ikut `kelasId` sehingga menembak ulang tiap kali guru
     mengetuk chip kelas. Sekarang: ambil sekali (disinggahkan di
     lib/dataGuru.ts), saring di aplikasi. */
  const [protaKelompok, setProtaKelompok] = useState<ProtaBaris[]>([]);

  useEffect(() => {
    const kelompokId = profile?.scope_kelompok_id;
    if (!kelompokId) return;
    let batal = false;
    muatProtaKelompok(kelompokId, tahun).then((data) => {
      if (!batal) setProtaKelompok(data);
    });
    return () => {
      batal = true;
    };
  }, [profile?.scope_kelompok_id, tahun]);

  /* Saran "Materi Ngaji" disaring ke jenjang kelas ruang ini (diminta
     owner 2026-09-03: "jika kelas di bawah kelas 4 maka ... tidak
     muncul Bacaan Al-Qur'an karena itu khusus kelas 4 ke atas").
     Kumulatif PAUD-TK s.d. kelas ruang -- pola SAMA PERSIS
     opsiHafalanSurat/opsiHafalanDoa. Dulu SENGAJA union semua kelas
     (khawatir salah petakan ruang->kurikulum), tapi kedua opsi Hafalan
     sudah pakai pemetaan yg sama & terbukti, jadi konsisten. */
  const opsiMateriKurikulum = useMemo(() => {
    if (kelasId === '') return [];
    const namaRuang = kelasList.find((k) => k.id === kelasId)?.nama ?? '';
    const kelasTarget = kelasTargetKumulatif(namaRuang);
    const daftar = protaKelompok
      .filter((b) => kelasTarget.includes(b.kelas ?? ''))
      .map((b) => {
        const namaAsli = namaKategori(b.kategori_kbm);
        return namaAsli ? namaMateriTampil(namaAsli, b.kelas) : null;
      })
      .filter((v): v is string => v !== null);
    return [...new Set(daftar)].sort();
  }, [protaKelompok, kelasId, kelasList]);

  /* Pengecualian kalender per kelompok (kalender_kelompok, 2026-08-24) --
     kelp yang tetap masuk di tanggal merah ('aktif') atau libur mendadak
     di hari kerja biasa ('libur'), diatur admin lewat /pengaturan. Cuma
     dipakai utk MENGUNCI kalender Tanggal Materi Klasikal (tanggalNonaktif
     di bawah) -- pewarnaan hari libur di kartu Klasikal (LIBUR_NASIONAL_2026
     langsung) SENGAJA TIDAK disentuh, diminta owner eksplisit ("kalender
     tanggal merah biarkan saja tetap merah"). */
  const [overrideKelompok, setOverrideKelompok] = useState<Map<string, OverrideKelompok>>(new Map());
  useEffect(() => {
    const kelompokId = profile?.scope_kelompok_id;
    if (!kelompokId) return;
    let batal = false;
    muatOverrideKelompok(kelompokId).then((peta) => {
      if (!batal) setOverrideKelompok(peta);
    });
    return () => {
      batal = true;
    };
  }, [profile?.scope_kelompok_id]);
  const cekNonaktif = useMemo(() => buatCekNonaktif(overrideKelompok), [overrideKelompok]);

  /* Tanggal Pencak Silat ASAD se-kelompok (2026-09-03) -- pada tanggal
     ini tidak ada klasikal, KECUALI kelas Remaja/SMA (kelasIkutAsad).
     Se-kelompok: satu guru menandai, semua ikut. Guru mana pun bisa
     batalkan. `muatAsad` dipanggil ulang tiap kali ada tanda/batal. */
  const [tanggalAsad, setTanggalAsad] = useState<Set<string>>(new Set());
  const muatAsad = useCallback(async () => {
    const kelompokId = profile?.scope_kelompok_id;
    if (!kelompokId) return;
    setTanggalAsad(await muatTanggalAsad(kelompokId));
  }, [profile?.scope_kelompok_id]);
  useEffect(() => {
    void muatAsad();
  }, [muatAsad]);

  const namaRuangAktif = kelasList.find((k) => k.id === kelasId)?.nama ?? '';
  const kelasIniIkutAsad = namaRuangAktif !== '' && kelasIkutAsad(namaRuangAktif);
  const [prosesAsad, setProsesAsad] = useState(false);

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
  const opsiHafalanSurat = useMemo<OpsiSelect[]>(() => {
    if (kelasId === '' || protaKelompok.length === 0) return [];
    const namaRuang = kelasList.find((k) => k.id === kelasId)?.nama ?? '';
    const kelasTarget = kelasTargetKumulatif(namaRuang);

    /* Penyaringan kelas yang dulu dilakukan server lewat .in('kelas', ...)
       kini dilakukan di sini -- datanya sudah ada di memori. */
    const data = protaKelompok.filter((b) => kelasTarget.includes(b.kelas ?? ''));
    const peta = new Map<string, OpsiSelect>();
    /* Urutkan menurut kelas (PAUD/TK, 1, 2, ... 12) lalu semester --
       diminta owner 2026-09-02. Hasil dari PostgREST datang tanpa
       urutan yang dijamin, jadi dulu daftarnya tampak teracak
       (mis. Kelas 4 lalu Kelas 8). `kelasTarget` sudah tersusun
       menurut KELAS_KURIKULUM_URUT, jadi cukup ikuti indeksnya --
       `.order('kelas')` di sisi server TIDAK bisa dipakai: kolomnya
       teks, "10" akan mendahului "2". */
    const urutKelas = (k: string | null) => {
      const i = kelasTarget.indexOf(k ?? '');
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const barisTerurut = [...data].sort((a, b) => urutKelas(a.kelas) - urutKelas(b.kelas));
    for (const b of barisTerurut) {
      if (namaKategori(b.kategori_kbm) !== "Hafalan Surat-Surat Al-Qur'an") continue;
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
                sublabel: `${labelKelasKurikulum(b.kelas)} · Sem ${semester}`,
              });
            }
          }
        }
      }
    }
    return [...peta.values()];
  }, [protaKelompok, kelasId, kelasList]);

  /* Opsi "Hafalan Do'a-Do'a Harian" -- pola SAMA PERSIS Hafalan Surat di
     atas (diminta owner 2026-09-02: "saya sudah masukan materi hafalan
     doa doa harian di prota masing masing kelas tolong uraikan seperti
     materi hafalan surat"), cuma penguraian teksnya beda: baris bernomor
     polos ("1. X\n2. Y", lib/materiHafalanDoa.ts uraikanTargetDoa),
     bukan format "s/d" spt Hafalan Surat. SENGAJA TIDAK dipakai
     gabungkanDoaDuaSemester (yang menggabung Asmaul Husna 2 semester
     jadi satu, dipakai di Laporan Perkembangan Santri) -- di sini guru
     justru perlu tahu PERSIS semester berapa tiap materi berasal
     (diminta owner: "berikan keterangan kelas di bawah haf doa dan sem
     berapa 1 atau 2"), jadi Asmaul Husna Sem 1 & Sem 2 sengaja tetap
     dua baris terpisah dgn sublabel semesternya masing-masing.

     "Menerampilkan hafalan do'a pada jenjang sebelumnya" DIBUANG dari
     daftar (2026-09-02, diminta owner: "hapus setiap kelas yang ada
     materi ... cukup hapus di fitur ini saja") -- bukan materi baru
     utk dipilih guru, cuma instruksi "ulangi materi jenjang sebelumnya"
     yg selalu ikut nempel di tiap baris Prota. Predikatnya di lib/
     materiHafalanDoa.ts, DIPAKAI BARENG dgn LaporanPerkembanganCetak.tsx
     yg justru TETAP menampilkannya (diminta owner eksplisit: jangan
     dihapus di laporan) -- makanya bukan cuma dilewati manual di sini,
     tapi predikat yg SAMA supaya kedua tempat tidak diam-diam
     ngedrift soal baris mana yg dianggap "instruksi", bukan "materi".

     Asmaul Husna PENGKHUSUSAN, khusus fitur ini saja (2026-09-02,
     diminta owner): label cukup "Asmaul Husna" (rentang "(1 sampai
     20)" dari Prota TIDAK ditampilkan -- itu target SATU SEMESTER
     penuh, bukan yg benar2 disampaikan hari itu). `value`-nya SENGAJA
     bukan lagi teks aslinya (yg memuat angka & jadi beda2 per
     kelas/semester), tapi kunci STABIL `asmaul-husna:<kelas>:<semester>`
     -- supaya toggle/pencocokan tidak bergantung pada angka yg
     nantinya diketik ULANG oleh guru sendiri (lihat asmaulHusnaRentang
     & simpanKlasikalBaru di bawah: dua kolom angka muncul saat item
     ini dicentang, guru isi rentang yg BENAR2 diajarkan hari itu,
     bukan target semester penuh dari Prota). */
  const opsiHafalanDoa = useMemo<OpsiSelect[]>(() => {
    if (kelasId === '' || protaKelompok.length === 0) return [];
    const namaRuang = kelasList.find((k) => k.id === kelasId)?.nama ?? '';
    const kelasTarget = kelasTargetKumulatif(namaRuang);

    const data = protaKelompok.filter((b) => kelasTarget.includes(b.kelas ?? ''));
    const peta = new Map<string, OpsiSelect>();
    const urutKelas = (k: string | null) => {
      const i = kelasTarget.indexOf(k ?? '');
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const barisTerurut = [...data].sort((a, b) => urutKelas(a.kelas) - urutKelas(b.kelas));
    for (const b of barisTerurut) {
      if (namaKategori(b.kategori_kbm) !== "Hafalan Do'a-Do'a Harian") continue;
      for (const [teks, semester] of [
        [b.target, 1],
        [b.target2, 2],
      ] as const) {
        for (const item of uraikanTargetDoa(teks)) {
          if (adalahMenerampilkanJenjangSebelumnya(item)) continue;
          const asmaulHusna = /^Asmaul\s+Husna/i.test(item);
          const value = asmaulHusna ? `asmaul-husna:${b.kelas}:${semester}` : item;
          const label = asmaulHusna ? 'Asmaul Husna' : item;
          if (!peta.has(value)) {
            peta.set(value, {
              value,
              label,
              sublabel: `${labelKelasKurikulum(b.kelas)} · Sem ${semester}`,
            });
          }
        }
      }
    }
    return [...peta.values()];
  }, [protaKelompok, kelasId, kelasList]);

  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  const [judulBaru, setJudulBaru] = useState('');
  const [tanggalRencanaBaru, setTanggalRencanaBaru] = useState('');
  const [tanggalPickerTerbuka, setTanggalPickerTerbuka] = useState(false);
  const [posisiTanggalPicker, setPosisiTanggalPicker] = useState<PosisiPicker | null>(null);
  const tanggalBtnRef = useRef<HTMLButtonElement>(null);
  const [pertemuanKeBaru, setPertemuanKeBaru] = useState('');
  const [catatanBaru, setCatatanBaru] = useState('');
  const [pengingatBaru, setPengingatBaru] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  /* Peraga Tilawati (halaman) -- muncul OTOMATIS di borang Materi Ngaji
     KHUSUS saat: ruang jenjang PAUD-TK s.d. 3 DAN materi terpilih
     "Baca Huruf Al-Qur'an" (diminta owner 2026-09-03). Disimpan sbg
     bagian `judul`: "Baca Huruf Al-Qur'an: Peraga Tilawati hal X-Y". */
  const [peragaTilawatiDari, setPeragaTilawatiDari] = useState('');
  const [peragaTilawatiSampai, setPeragaTilawatiSampai] = useState('');
  const [peragaJilidBaru, setPeragaJilidBaru] = useState('');
  const [peragaTeknikBaru, setPeragaTeknikBaru] = useState('');
  const gradeRuangAktif = kelasTargetKumulatif(namaRuangAktif).at(-1) ?? '';
  const tampilPeragaTilawati =
    judulBaru.trim() === "Baca Huruf Al-Qur'an" && KELAS_LABEL_BACA_HURUF.includes(gradeRuangAktif);

  function bukaFormTambah() {
    setJudulBaru('');
    setTanggalRencanaBaru(new Date().toISOString().slice(0, 10));
    setPertemuanKeBaru('');
    setPeragaTilawatiDari('');
    setPeragaTilawatiSampai('');
    setPeragaJilidBaru('');
    setPeragaTeknikBaru('');
    setCatatanBaru('');
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
  /* Materi Hafalan Do'a-Do'a Harian -- cek list, pola SAMA PERSIS
     Hafalan Surat (2026-09-02, diminta owner) sejak Prota kategori itu
     diisi owner. Tetap opsional (tidak wajib), beda dari Hafalan Surat
     yg wajib -- satu Klasikal tetap sah kalau cuma Hafalan Surat tanpa
     Do'a. */
  const [hafalanDoaBaru, setHafalanDoaBaru] = useState<string[]>([]);
  /* Rentang Asmaul Husna yg BENAR2 diajarkan hari itu, diketik guru
     sendiri -- kunci = value opsi ("asmaul-husna:<kelas>:<semester>"),
     dua kolom angka MUNCUL OTOMATIS di bawah baris itu begitu
     dicentang (diminta owner 2026-09-02, khusus fitur ini). Lihat
     komentar panjang di opsiHafalanDoa utk kenapa `value`-nya bukan
     teks aslinya lagi. */
  const [asmaulHusnaRentang, setAsmaulHusnaRentang] = useState<
    Record<string, { dari: string; sampai: string }>
  >({});
  const [menyimpanKlasikal, setMenyimpanKlasikal] = useState(false);
  /* null = mode Tambah (INSERT baris baru). Angka = mode Ubah (UPDATE
     baris itu) -- diminta owner 2026-08-23, dibuka lewat titik-tiga di
     kartu Klasikal (lihat KebabMenu di JSX). */
  const [editKlasikalId, setEditKlasikalId] = useState<number | null>(null);

  function bukaFormKlasikal() {
    setEditKlasikalId(null);
    setTanggalKlasikalBaru(new Date().toISOString().slice(0, 10));
    setHafalanSuratBaru([]);
    setHafalanDoaBaru([]);
    setAsmaulHusnaRentang({});
    setKlasikalTerbuka(true);
  }

  function bukaEditKlasikal(m: Materi) {
    setEditKlasikalId(m.id);
    setTanggalKlasikalBaru(m.tanggal_rencana ?? '');
    setHafalanSuratBaru(
      m.klasikal_hafalan_surat
        ? m.klasikal_hafalan_surat.split(',').map((s) => s.trim()).filter((s) => s !== '')
        : []
    );
    const segmenDoa = m.klasikal_hafalan_doa
      ? m.klasikal_hafalan_doa.split(',').map((s) => s.trim()).filter((s) => s !== '')
      : [];
    /* "Asmaul Husna (X sampai Y)" tersimpan dgn ANGKA guru sendiri, jadi
       tidak bisa dicocokkan balik ke value opsi apa adanya (value opsi
       sekarang kunci stabil tanpa angka). Terbaik-usaha: pasangkan
       URUT ke opsi Asmaul Husna yg tersedia utk kelas ini -- biasanya
       cuma 1 relevan (guru jarang mengajar 2 semester sekaligus),
       kalau kebetulan ada 2 baris tersimpan & 2 opsi tersedia jg tetap
       terpasang benar selama urutannya konsisten. */
    const segmenAsmaulHusna = segmenDoa.filter((s) => /^Asmaul\s+Husna/i.test(s));
    const segmenLain = segmenDoa.filter((s) => !/^Asmaul\s+Husna/i.test(s));
    const opsiAsmaulHusna = opsiHafalanDoa.filter((o) => o.value.startsWith('asmaul-husna:'));
    const rentangBaru: Record<string, { dari: string; sampai: string }> = {};
    const nilaiDoa = [...segmenLain];
    segmenAsmaulHusna.forEach((s, i) => {
      const opsi = opsiAsmaulHusna[i];
      if (!opsi) return;
      nilaiDoa.push(opsi.value);
      const cocok = s.match(/(\d+)\s*(?:sampai|s\/d|-|–)\s*(\d+)/i);
      if (cocok) rentangBaru[opsi.value] = { dari: cocok[1], sampai: cocok[2] };
    });
    setHafalanDoaBaru(nilaiDoa);
    setAsmaulHusnaRentang(rentangBaru);
    setKlasikalTerbuka(true);
  }

  function toggleHafalanSurat(nilai: string) {
    setHafalanSuratBaru((prev) => (prev.includes(nilai) ? prev.filter((v) => v !== nilai) : [...prev, nilai]));
  }

  function toggleHafalanDoa(nilai: string) {
    setHafalanDoaBaru((prev) => (prev.includes(nilai) ? prev.filter((v) => v !== nilai) : [...prev, nilai]));
  }

  function ubahRentangAsmaulHusna(value: string, field: 'dari' | 'sampai', teks: string) {
    setAsmaulHusnaRentang((prev) => ({
      ...prev,
      [value]: { dari: prev[value]?.dari ?? '', sampai: prev[value]?.sampai ?? '', [field]: teks },
    }));
  }

  /* Teks yg BENAR2 tersimpan ke DB utk satu opsi Do'a terpilih -- opsi
     biasa apa adanya, opsi Asmaul Husna dibangun dari rentang yg
     diketik guru (BUKAN target semester penuh dari Prota). Dipakai jg
     di ringkasan "Dipilih (N): ..." spy tidak menampilkan kunci
     internal mentah ("asmaul-husna:1:1"). */
  function teksDoaTersimpan(value: string): string {
    if (!value.startsWith('asmaul-husna:')) return value;
    const r = asmaulHusnaRentang[value];
    if (r && r.dari.trim() !== '' && r.sampai.trim() !== '') {
      return `Asmaul Husna (${r.dari.trim()} sampai ${r.sampai.trim()})`;
    }
    return 'Asmaul Husna';
  }

  const tanggalKlasikalAdalahAsad =
    kelasIniIkutAsad && tanggalKlasikalBaru !== '' && tanggalAsad.has(tanggalKlasikalBaru);

  async function tandaiTanggalAsad() {
    const kelompokId = profile?.scope_kelompok_id;
    if (!kelompokId || tanggalKlasikalBaru === '') return;
    setProsesAsad(true);
    try {
      await tandaiAsad(kelompokId, tanggalKlasikalBaru, profile?.id ?? null);
      await muatAsad();
      setKlasikalTerbuka(false);
      push(
        'Tanggal ditandai Pencak Silat ASAD — klasikal dilewati untuk semua kelas (kecuali Remaja/SMA).',
        'sukses',
      );
    } catch (e) {
      push(pesanGalatDb(e, 'Gagal menandai Pencak Silat ASAD.'), 'error');
    } finally {
      setProsesAsad(false);
    }
  }

  async function batalkanTanggalAsad(tanggal: string) {
    const kelompokId = profile?.scope_kelompok_id;
    if (!kelompokId) return;
    setProsesAsad(true);
    try {
      await batalkanAsad(kelompokId, tanggal);
      await muatAsad();
      push('Penanda Pencak Silat ASAD dibatalkan.', 'sukses');
    } catch (e) {
      push(pesanGalatDb(e, 'Gagal membatalkan Pencak Silat ASAD.'), 'error');
    } finally {
      setProsesAsad(false);
    }
  }

  async function simpanKlasikalBaru() {
    if (kelasId === '' || tanggalKlasikalBaru === '' || hafalanSuratBaru.length === 0) return;
    if (tanggalKlasikalAdalahAsad) {
      push('Tanggal ini Pencak Silat ASAD — tidak ada klasikal. Batalkan dulu penandanya bila keliru.', 'info');
      return;
    }
    const suratTerpilih = hafalanSuratBaru.join(', ');
    const judul = 'Klasikal — Hafalan Surat: ' + suratTerpilih;
    const mingguKe = mingguKeDariTanggal(new Date(tanggalKlasikalBaru + 'T00:00:00'));
    const bulanKlasikal = Number(tanggalKlasikalBaru.slice(5, 7));
    const tahunKlasikal = Number(tanggalKlasikalBaru.slice(0, 4));
    const doaTerpilih = hafalanDoaBaru.map(teksDoaTersimpan).join(', ');
    const doa = doaTerpilih === '' ? null : doaTerpilih;
    const idDiubah = editKlasikalId;

    const sementara: Materi = {
      id: idDiubah ?? idSementara--,
      minggu_ke: mingguKe,
      judul,
      status: 'belum',
      jenis: 'klasikal',
      tanggal_rencana: tanggalKlasikalBaru,
      klasikal_hafalan_surat: suratTerpilih,
      klasikal_hafalan_doa: doa,
    };
    /* Penjaga dobel LAPIS PERTAMA (2026-09-02, dilaporkan owner: muncul
       dua Klasikal di tanggal yang sama). Satu baris klasikal sudah
       memuat hafalan surat DAN hafalan doa sekaligus, jadi satu tanggal
       cukup satu baris — menambah lagi di tanggal yang sama artinya guru
       sebenarnya ingin MENGUBAH yang sudah ada. Lapis keduanya indeks
       unik di basis data (migrasi 20260902140000); yang ini ada supaya
       guru dapat kalimat yang bisa ditindak, bukan galat mentah. */
    if (!idDiubah) {
      const sudahAda = materiList.find(
        (m) => m.jenis === 'klasikal' && m.tanggal_rencana === tanggalKlasikalBaru
      );
      if (sudahAda) {
        push(
          'Materi Klasikal untuk tanggal itu sudah ada. Ubah yang sudah ada lewat titik-tiga di kartu minggunya.',
          'info'
        );
        setMenyimpanKlasikal(false);
        return;
      }
    }

    const materiListSebelum = materiList;
    setMateriList((prev) =>
      idDiubah ? prev.map((m) => (m.id === idDiubah ? sementara : m)) : [...prev, sementara]
    );
    setKlasikalTerbuka(false);
    setMenyimpanKlasikal(true);

    try {
      const payload = {
        kelas_id: kelasId,
        tahun: tahunKlasikal,
        bulan: bulanKlasikal,
        minggu_ke: mingguKe,
        judul,
        tanggal_rencana: tanggalKlasikalBaru,
        jenis: 'klasikal',
        klasikal_hafalan_surat: suratTerpilih,
        klasikal_hafalan_doa: doa,
      };
      const { error: err } = idDiubah
        ? await supabase.from('jurnal_materi').update(payload).eq('id', idDiubah)
        : await supabase.from('jurnal_materi').insert(payload);
      if (err) throw new Error(err.message);
      push(idDiubah ? 'Materi klasikal diperbarui.' : 'Materi klasikal tersimpan.', 'sukses');
      tandaiMateriBerubah(kelasId, tahun, bulan);
      await muatMateri();
    } catch (e) {
      setMateriList(materiListSebelum);
      push(pesanGalatDb(e, 'Gagal menyimpan materi klasikal.'), 'error');
    } finally {
      setMenyimpanKlasikal(false);
    }
  }

  useEffect(() => {
    if (guruId == null) return;
    muatKelasGuru(guruId).then((list) => {
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
      setMateriList(await muatMateriBulan(kelasId, tahun, bulan));
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
    let judul = judulBaru.trim();
    /* Peraga Tilawati (kondisi khusus di atas): rentang halaman jadi
       bagian judul supaya tampil di kartu Rencana & Pelaksanaan tanpa
       kolom DB baru. "Pertemuan ke" pakai field pertemuan_ke biasa. */
    if (tampilPeragaTilawati) {
      const d = peragaTilawatiDari.trim();
      const s = peragaTilawatiSampai.trim();
      const rentang = d && s ? `${d}–${s}` : d || s;
      const jilid = peragaJilidBaru.trim();
      let inti = "Baca Huruf Al-Qur'an";
      if (jilid) inti += ` — Jilid ${jilid}`;
      const bagian: string[] = [];
      if (rentang) bagian.push(`Peraga Tilawati hal ${rentang}`);
      if (peragaTeknikBaru) bagian.push(`Teknik ${peragaTeknikBaru}`);
      judul = bagian.length > 0 ? `${inti}: ${bagian.join(' · ')}` : inti;
    }
    /* Minggu + bulan/tahun diturunkan dari Tanggal, sama spt Materi
       Klasikal (dropdown "Masukkan ke" dihapus 2026-09-03, diminta
       owner). */
    const mingguKe = mingguKeDariTanggal(new Date(tanggalRencanaBaru + 'T00:00:00'));
    const bulanBaru = Number(tanggalRencanaBaru.slice(5, 7));
    const tahunBaru = Number(tanggalRencanaBaru.slice(0, 4));

    /* Penjaga dobel lapis pertama utk materi ngaji: judul yang sama di
       kelas & tanggal yang sama. Dibandingkan tanpa peduli huruf
       besar-kecil, sama dengan indeks uniknya di basis data (migrasi
       20260902140000) -- "Baca Simak" dan "baca simak" itu satu materi. */
    const bentrok = materiList.find(
      (m) =>
        m.jenis !== 'klasikal' &&
        m.tanggal_rencana === tanggalRencanaBaru &&
        m.judul.trim().toLowerCase() === judul.toLowerCase()
    );
    if (bentrok) {
      push(`Materi "${judul}" sudah ada di tanggal itu.`, 'info');
      return;
    }

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
        tahun: tahunBaru,
        bulan: bulanBaru,
        minggu_ke: mingguKe,
        judul,
        tanggal_rencana: tanggalRencanaBaru,
        pertemuan_ke: pertemuanKeBaru.trim() === '' ? null : pertemuanKeBaru.trim(),
        catatan: catatanBaru.trim() === '' ? null : catatanBaru.trim(),
        pengingat_aktif: pengingatBaru,
      });
      if (err) throw new Error(err.message);
      push('Materi rencana tersimpan.', 'sukses');
      tandaiMateriBerubah(kelasId, tahunBaru, bulanBaru);
      await muatMateri();
    } catch (e) {
      // Gagal -> tarik lagi baris sementara.
      setMateriList((prev) => prev.filter((m) => m.id !== sementara.id));
      push(pesanGalatDb(e, 'Gagal menyimpan materi.'), 'error');
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

  /* Kartu Klasikal SELALU tampil Minggu 1-4 (diminta owner 2026-08-23) --
     BEDA dari kartu Ngaji (mingguDipakai) yg cuma tampil kalau py data.
     Minggu 5 ikut cuma kalau bulannya memang punya (rentangMinggu balik
     non-null) -- Februari non-kabisat (28 hari, pas 4x7) satu2nya bulan
     yg TIDAK dapat Minggu 5, semua bulan lain (29-31 hari) dapat. */
  const mingguKlasikal = [1, 2, 3, 4, 5]
    .map((mk) => ({
      mingguKe: mk,
      rentang: rentangMinggu(tahun, bulan, mk),
      materi: materiList.filter((m) => m.minggu_ke === mk && m.jenis === 'klasikal'),
    }))
    .filter((m) => m.rentang !== null);

  /* Semua kartu Minggu N Klasikal dibungkus SATU kartu bulan (diminta
     owner 2026-08-23) -- "Materi Klasikal Agustus 2026 . 19 Hari Aktif",
     19 = jumlah total jumlahHariAktifMinggu seluruh minggu bulan itu.
     Tersembunyi bawaan, ketuk utk buka rincian per-minggu spt sekarang. */
  const totalHariAktifBulan = mingguKlasikal.reduce(
    (jumlah, { rentang }) => jumlah + jumlahHariAktifMinggu(tahun, bulan, rentang!),
    0
  );
  const [klasikalBulanTerbuka, setKlasikalBulanTerbuka] = useState(false);

  /* Ada tanggal Pencak Silat ASAD di bulan+kelas yg sedang dilihat --
     dipakai utk badge merah di kepala kartu "Materi Klasikal <bulan>"
     DAN membuka kartunya otomatis (owner 2026-09-03: label harus
     kelihatan tanpa perlu buka-buka kartu). */
  const adaAsadBulanIni =
    kelasIniIkutAsad &&
    [...tanggalAsad].some(
      (t) => Number(t.slice(0, 4)) === tahun && Number(t.slice(5, 7)) === bulan,
    );
  useEffect(() => {
    if (adaAsadBulanIni) setKlasikalBulanTerbuka(true);
  }, [adaAsadBulanIni]);

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
                      className={`flex shrink-0 items-center rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 text-[13px] font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.96] ${
                        aktif ? 'border-indigo text-indigo' : 'border-border bg-panel text-text'
                      }`}
                      style={aktif ? { background: 'linear-gradient(135deg, var(--indigo-lembut) 0%, var(--indigo-lembut-2) 100%)' } : undefined}
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
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-indigo-lembut text-indigo transition-all duration-150 active:scale-[0.92]"
            >
              <Calendar size={19} />
            </button>
            <span className="rounded-full bg-indigo-lembut px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-indigo">
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
        <div className="mb-5 rounded-card border border-border bg-indigo-lembut p-4">
          <div className="mb-3 text-[13px] font-bold text-text">Ringkasan Rencana</div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo">
                <ClipboardList size={18} />
              </span>
              <div>
                <div className="angka-metrik text-[17px] leading-none text-text">{materiList.length}</div>
                <div className="text-[11px] text-text-dim">Materi</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo">
                <CalendarDays size={18} />
              </span>
              <div>
                <div className="angka-metrik text-[17px] leading-none text-text">{totalPertemuan}</div>
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
                    <div className="text-[15px] font-bold text-text">Minggu {mingguKe}</div>
                    <div className="text-[11px] text-text-dim">
                      {labelRentangMinggu(tahun, bulan, mingguKe, NAMA_BULAN)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-lembut px-2.5 py-1 text-[11px] font-bold text-indigo">
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

            {/* Kartu bulan Klasikal -- membungkus SEMUA kartu Minggu N
                Klasikal di bawah jadi satu. Tersembunyi bawaan, ketuk
                header ("Materi Klasikal Agustus 2026 . 19 Hari Aktif")
                utk buka rincian per-minggu.

                DIGERBANG (dataSiapUntukKelasIni || materiList.length > 0)
                -- diperbaiki 2026-08-23, laporan owner "kartu ini lompat
                ke bawah lalu balik lagi pas ganti kelas". Akar
                masalahnya: kartu ini dulu render TANPA syarat (langsung
                begitu kelasId terisi), padahal Skeleton di atasnya (lihat
                komentar dataSiapUntukKelasIni) baru hilang belakangan
                stlh fetch selesai -- jadi sempat ada sesaat Skeleton
                (tinggi tetap ~200px) + kartu ini tampil BARENGAN, lalu
                Skeleton hilang & baris Rencana Mingguan asli (tinggi
                beda) menggantikannya, mendorong kartu ini naik/turun ke
                posisi akhirnya. Sekarang kartu ini SAMA gerbangnya dgn
                "Skeleton hilang" (kebalikan logisnya persis), jadi
                keduanya selalu berganti serentak, tidak pernah tumpang
                tindih sesaat. materiList.length>0 tetap disertakan (bukan
                cuma dataSiapUntukKelasIni) supaya stale-while-revalidate
                pas ganti antar-kelas yg sama2 sudah py cache tetap mulus
                (tidak sempat hilang-muncul lagi). */}
            {(dataSiapUntukKelasIni || materiList.length > 0) && (
            <div className="rounded-card border border-border bg-panel shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
              <button
                type="button"
                onClick={() => setKlasikalBulanTerbuka((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent p-4 text-left"
              >
                <span className="text-[15px] font-bold text-text">
                  Materi Klasikal {NAMA_BULAN[bulan - 1]} {tahun}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {adaAsadBulanIni && (
                    <span className="rounded-full bg-[rgba(220,38,38,0.1)] px-2.5 py-1 text-[11px] font-bold text-red">
                      Ada ASAD
                    </span>
                  )}
                  <span className="rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[11px] font-bold text-sage">
                    {totalHariAktifBulan} Hari Aktif
                  </span>
                </span>
              </button>
              {klasikalBulanTerbuka && (
                <div className="flex flex-col gap-3 border-t border-border p-4">
            {/* Kartu Klasikal -- TERPISAH dari kartu Minggu N Ngaji di atas,
                badge "Klasikal" gantiin "N Materi". SELALU tampil Minggu
                1-4 (+5 kalau bulannya punya) -- BEDA dari kartu Ngaji yg
                cuma tampil kalau py data. "Minggu N" + info tanggal
                SEBARIS, judul bisa diketuk utk buka/tutup rincian harian
                -- tersembunyi bawaan, ketuk utk lihat, ketuk lagi utk
                sembunyikan lagi. Isinya, kalau dibuka, dirinci PER HARI
                KERJA (Senin-Jumat) dlm rentang minggu itu, bukan cuma
                baris yg py data -- hari yg belum diisi tetap tampil
                kosong (Haf Surat/Haf Doa blank) spy kelihatan "belum
                diisi". Titik-tiga (diminta owner 2026-08-23): SATU per
                minggu, diletakkan di baris Senin (hari pertama, kanan
                atas sejajar nama harinya) -- SELALU ada, termasuk minggu
                yg masih kosong (sebelumnya cuma muncul kalau py data).
                Minggu yg py data -> daftar "Ubah <Hari>" per hari yg
                terisi. Minggu yg masih kosong -> "Tambah Materi Klasikal"
                (buka borang, tanggal Senin minggu itu diisi otomatis). */}
            {mingguKlasikal.map(({ mingguKe, rentang, materi }) => {
              const dibuka = klasikalDetailTerbuka.has(mingguKe);
              const materiKlasikalMinggu = materi.filter(
                (m): m is Materi & { tanggal_rencana: string } => m.tanggal_rencana !== null
              );
              /* Titik-tiga SELALU ada di tiap kartu minggu (diminta owner
                 2026-08-23, sebelumnya cuma muncul di minggu yg py data) --
                 minggu yg SUDAH py data menawarkan "Ubah <Hari>" per hari
                 yg terisi; minggu yg MASIH kosong menawarkan "Tambah
                 Materi Klasikal" (langsung buka borang, tanggal Senin
                 minggu itu diisi otomatis sbg titik awal yg wajar). */
              const seninMingguIni = hariSekolahDalamMinggu(tahun, bulan, rentang!)[0]?.iso;
              const itemUbahMinggu =
                materiKlasikalMinggu.length > 0
                  ? materiKlasikalMinggu.map((m) => ({
                      /* "Edit Materi" (diminta owner 2026-08-23) -- nama
                         hari TETAP disertakan (mis. "Edit Materi Senin")
                         krn daftar ini bisa berisi lebih dari satu hari
                         sekaligus, tanpa nama hari jadi tidak bisa
                         dibedakan mana yg mana. */
                      label: 'Edit Materi ' + NAMA_HARI[new Date(m.tanggal_rencana + 'T00:00:00').getDay()],
                      onClick: () => bukaEditKlasikal(m),
                    }))
                  : seninMingguIni
                    ? [
                        {
                          label: '+ Materi Klasikal',
                          onClick: () => {
                            bukaFormKlasikal();
                            setTanggalKlasikalBaru(seninMingguIni);
                          },
                        },
                      ]
                    : [];
              return (
                <div
                  key={`klasikal-${mingguKe}`}
                  className="rounded-card border border-border bg-panel shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex items-center justify-between gap-2 p-4">
                    <button
                      type="button"
                      onClick={() => toggleKlasikalDetail(mingguKe)}
                      className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-1.5 border-none bg-transparent text-left"
                    >
                      <span className="text-[15px] font-bold text-text">Minggu {mingguKe}</span>
                      <span className="truncate text-[11px] text-text-dim">
                        · {labelRentangAktifMinggu(tahun, bulan, rentang!)} · {jumlahHariAktifMinggu(tahun, bulan, rentang!)}{' '}
                        Hari Aktif
                      </span>
                    </button>
                    <span className="shrink-0 rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[11px] font-bold text-sage">
                      Klasikal
                    </span>
                  </div>
                  {/* Label ASAD selalu tampil di kartu minggu (tanpa perlu
                      dibuka) begitu ada tanggal ASAD di minggu itu -- owner
                      2026-09-03: "khusus di hari jumat akan tampil pencak
                      silat asad". */}
                  {(() => {
                    const asadHari = hariSekolahDalamMinggu(tahun, bulan, rentang!).filter(
                      ({ iso }) => kelasIniIkutAsad && tanggalAsad.has(iso),
                    );
                    if (asadHari.length === 0) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.05)] px-4 py-2 text-[12px] font-bold text-red">
                        <span>
                          Pencak Silat ASAD — tidak ada klasikal
                          <span className="font-semibold">
                            {' '}
                            ({asadHari.map(({ tgl }) => `${NAMA_HARI[tgl.getDay()]} ${tgl.getDate()}`).join(', ')})
                          </span>
                        </span>
                        {asadHari.map(({ iso }) => (
                          <button
                            key={iso}
                            type="button"
                            disabled={prosesAsad}
                            onClick={() => batalkanTanggalAsad(iso)}
                            className="cursor-pointer rounded-full border border-border bg-panel px-2 py-0.5 text-[11px] font-semibold text-text-dim disabled:opacity-50"
                          >
                            Batalkan
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  {dibuka && (
                    <div className="flex flex-col gap-2.5 border-t border-border px-4 pt-3 pb-4">
                      {hariSekolahDalamMinggu(tahun, bulan, rentang!).map(({ tgl, iso }, indeks) => {
                        const entri = materi.find((m) => m.tanggal_rencana === iso);
                        /* Tanggal merah dikasih warna beda (diminta owner
                           2026-08-23) -- baris itu TETAP tampil (bukan
                           disembunyikan, guru mungkin masih perlu tahu
                           ada libur di hari itu), nama liburnya ikut
                           ditampilkan spy jelas kenapa merah. */
                        const namaLibur = LIBUR_NASIONAL_2026[iso];
                        const hariIniAsad = kelasIniIkutAsad && tanggalAsad.has(iso);
                        return (
                          <div key={iso} className="border-t border-border pt-2.5 first:border-t-0 first:pt-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className={`text-[12px] font-bold ${namaLibur ? 'text-red' : 'text-text'}`}>
                                {NAMA_HARI[tgl.getDay()]}, {formatTanggalDDMMYYYY(tgl)}
                                {namaLibur && <span className="ml-1 font-semibold">· {namaLibur}</span>}
                              </div>
                              {indeks === 0 && <KebabMenu item={itemUbahMinggu} />}
                            </div>
                            {hariIniAsad ? (
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[12px] font-bold text-red">
                                  Pencak Silat ASAD — tidak ada klasikal
                                </span>
                                <button
                                  type="button"
                                  disabled={prosesAsad}
                                  onClick={() => batalkanTanggalAsad(iso)}
                                  className="cursor-pointer rounded-full border border-border bg-panel px-2 py-0.5 text-[11px] font-semibold text-text-dim disabled:opacity-50"
                                >
                                  Batalkan
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="mt-1 text-[12px] text-text-dim">
                                  Haf Surat: {entri?.klasikal_hafalan_surat ?? ''}
                                </div>
                                <div className="text-[12px] text-text-dim">
                                  Haf Doa: {entri?.klasikal_hafalan_doa ?? ''}
                                </div>
                              </>
                            )}
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
            </div>
            )}
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
                <div className="text-[17px] font-bold text-text">Tambah Materi Rencana</div>
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
                {/* "Tanggal" di urutan PALING ATAS + tanpa dropdown Minggu
                    (diminta owner 2026-09-03: "buat seperti materi
                    klasikal"). Minggu diturunkan otomatis dari tanggal
                    ini di simpanMateriBaru, sama spt Materi Klasikal. */}
                <FieldTambah label="Tanggal" wajib>
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

                {/* KHUSUS: ruang jenjang PAUD-TK s.d. 3 + materi "Baca
                    Huruf Al-Qur'an" -> Peraga Tilawati (rentang halaman)
                    + Pertemuan ke, sebaris (diminta owner 2026-09-03).
                    Menggantikan field "Pertemuan ke-" biasa selama
                    kondisi ini aktif. */}
                {tampilPeragaTilawati ? (
                  /* Blok khusus "Baca Huruf Al-Qur'an" jenjang bawah
                     (diminta owner 2026-09-03, beberapa putaran rapi):
                     Peraga Tilawati (rentang halaman) di baris sendiri,
                     lalu Jilid / Pertemuan ke / Teknik ke sejajar 3
                     kolom, lalu pengingat "Buku Tilawati Jilid". */
                  <div className="mb-3.5 space-y-3">
                    <div>
                      <label className="mb-1.5 block text-[12px] font-semibold text-text">
                        Peraga Tilawati
                      </label>
                      <div className="flex items-center gap-2">
                        {([
                          [peragaTilawatiDari, setPeragaTilawatiDari] as const,
                          [peragaTilawatiSampai, setPeragaTilawatiSampai] as const,
                        ]).map(([nilai, set], i) => (
                          <Fragment key={i}>
                            {i === 1 && <span className="shrink-0 text-[12px] text-text-faint">s/d</span>}
                            <div className="relative flex-1">
                              {/* "hal" hilang begitu halaman diketik. */}
                              {!nilai && (
                                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[12px] text-text-faint">
                                  hal
                                </span>
                              )}
                              <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                value={nilai}
                                onChange={(e) => set(e.target.value)}
                                className={`w-full rounded-[var(--radius)] border border-border bg-panel py-2.5 text-[13px] text-text focus:border-brass focus:outline-none ${
                                  nilai ? 'px-3 text-center' : 'pr-3 pl-9'
                                }`}
                              />
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="mb-1.5 block text-[12px] font-semibold whitespace-nowrap text-text">
                          Jilid
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={peragaJilidBaru}
                          onChange={(e) => setPeragaJilidBaru(e.target.value)}
                          className="w-full rounded-[var(--radius)] border border-border bg-panel px-2 py-2.5 text-center text-[13px] text-text focus:border-brass focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[12px] font-semibold whitespace-nowrap text-text">
                          Pertemuan ke
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={pertemuanKeBaru}
                          onChange={(e) => setPertemuanKeBaru(e.target.value)}
                          className="w-full rounded-[var(--radius)] border border-border bg-panel px-2 py-2.5 text-center text-[13px] text-text focus:border-brass focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold whitespace-nowrap text-text">
                          Teknik ke
                          <LabelInfo teks="Teknik membaca klasikal peraga" />
                        </label>
                        {/* Segmented 1/2/3 -- elegan, bukan <select>
                            bawaan browser (diminta owner 2026-09-03).
                            Ketuk lagi utk batal pilih. */}
                        <div className="flex overflow-hidden rounded-[var(--radius)] border border-border">
                          {['1', '2', '3'].map((t) => {
                            const aktif = peragaTeknikBaru === t;
                            return (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setPeragaTeknikBaru((v) => (v === t ? '' : t))}
                                className={`flex-1 py-2.5 text-[13px] font-bold transition-colors duration-100 ${
                                  t !== '1' ? 'border-l border-border' : ''
                                } ${aktif ? 'bg-indigo text-white' : 'bg-panel text-text-dim active:bg-panel-2'}`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Jilid buku tiap santri beda -> pengingat, bukan input. */}
                    <div>
                      <label className="mb-1.5 block text-[12px] font-semibold text-text">
                        Buku Tilawati Jilid
                      </label>
                      <div className="rounded-[var(--radius)] border border-dashed border-border bg-panel-2 px-3 py-2.5 text-[13px] text-text-dim">
                        Sesuai Kondisi Setiap Santri
                      </div>
                    </div>
                  </div>
                ) : (
                  <FieldTambah label="Pertemuan ke-">
                    <InputIkon
                      value={pertemuanKeBaru}
                      onChange={setPertemuanKeBaru}
                      placeholder="Contoh: Pertemuan ke-1"
                      ikon={<Hash size={16} />}
                    />
                  </FieldTambah>
                )}

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
                  <div className="mt-1 text-right text-[11px] text-text-faint">{catatanBaru.length}/200</div>
                </FieldTambah>

                <div className="mb-1 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-text-dim">
                      <Bell size={16} />
                    </span>
                    <div>
                      <div className="text-[12px] font-semibold text-text">Pengingat</div>
                      <div className="text-[11px] text-text-dim">Ingatkan saya sebelum tanggal rencana</div>
                    </div>
                  </div>
                  {/* Sakelar: knob dipusatkan lewat flex + geser lewat
                      inline-style translateX (bukan kelas arbitrer
                      Tailwind yang bisa diam-diam gagal ter-generate di
                      v4) -- perbaikan owner 2026-09-03 "bulatnya keluar
                      jalur". */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pengingatBaru}
                    onClick={() => setPengingatBaru((v) => !v)}
                    className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-none p-0 transition-colors duration-150"
                    style={{ background: pengingatBaru ? 'var(--indigo)' : 'var(--border)' }}
                  >
                    <span
                      className="block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150"
                      style={{ transform: pengingatBaru ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>
              </div>

              <div className="flex shrink-0 gap-2.5 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={() => setTambahTerbuka(false)}
                  className="flex-1 cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel-2 py-3 text-[15px] font-semibold text-text"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={judulBaru.trim().length === 0 || tanggalRencanaBaru === '' || menyimpan}
                  onClick={simpanMateriBaru}
                  className="flex flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-3 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--indigo) 0%, var(--violet) 100%)' }}
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
                <div className="text-[17px] font-bold text-text">Tambah Materi</div>
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
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-lembut text-indigo">
                    <BookOpen size={20} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold text-text">Materi Ngaji</span>
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
                    <span className="block text-[15px] font-bold text-text">Materi Klasikal</span>
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
                <div className="text-[17px] font-bold text-text">
                  {editKlasikalId ? 'Ubah Materi Klasikal' : 'Tambah Materi Klasikal'}
                </div>
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
                <FieldTambah label="Tanggal" wajib labelGelap>
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
                    tanggalNonaktif={cekNonaktif}
                  />
                </FieldTambah>

                {/* Pencak Silat ASAD (2026-09-03) -- Jumat minggu ke-1/2
                    (Kelp Petemon; kelp lain waktunya beda) seluruh
                    kelompok latihan Pencak Silat ASAD, TIDAK ADA
                    klasikal hari itu. Tombol ini menandai tanggal
                    terpilih SE-KELOMPOK: begitu satu guru menekan,
                    semua guru kelompok itu ikut. Tidak muncul utk kelas
                    Remaja/SMA (kelasIkutAsad = false). */}
                {kelasIniIkutAsad && tanggalKlasikalBaru !== '' && (
                  tanggalKlasikalAdalahAsad ? (
                    <div className="mb-3.5 rounded-[var(--radius)] border border-[rgba(220,38,38,0.4)] bg-[rgba(220,38,38,0.06)] p-3">
                      <div className="text-[12px] font-semibold text-text">
                        Tanggal ini ditandai Pencak Silat ASAD
                      </div>
                      <div className="mt-0.5 text-[11px] text-text-dim">
                        Tidak ada klasikal hari ini untuk semua kelas kelompok (kecuali Remaja/SMA).
                      </div>
                      <button
                        type="button"
                        disabled={prosesAsad}
                        onClick={() => batalkanTanggalAsad(tanggalKlasikalBaru)}
                        className="mt-2 cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel px-3 py-1.5 text-[12px] font-semibold text-text disabled:opacity-50"
                      >
                        Batalkan penanda ASAD
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={prosesAsad}
                      onClick={tandaiTanggalAsad}
                      className="mb-3.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border border-dashed border-[rgba(220,38,38,0.45)] bg-[rgba(220,38,38,0.04)] py-2.5 text-[13px] font-bold text-red disabled:opacity-50"
                    >
                      Tandai Pencak Silat ASAD (tidak ada klasikal)
                    </button>
                  )
                )}

                <FieldTambah
                  label="Hafalan Surat-Surat Al-Qur'an"
                  wajib
                  labelGelap
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
                    <div className="mt-1.5 text-[11px] text-text-dim">
                      Dipilih ({hafalanSuratBaru.length}): {hafalanSuratBaru.join(', ')}
                    </div>
                  )}
                </FieldTambah>

                <FieldTambah label="Hafalan Do&rsquo;a-Do&rsquo;a Harian" sembunyikanPenanda labelGelap>
                  {opsiHafalanDoa.length === 0 ? (
                    <div className={`${INPUT_STYLE} text-text-faint`}>Belum ada materi di Kurikulum</div>
                  ) : (
                    <div className="max-h-[320px] overflow-y-auto rounded-[var(--radius)] border border-border">
                      {opsiHafalanDoa.map((o) => {
                        const dipilih = hafalanDoaBaru.includes(o.value);
                        const asmaulHusna = o.value.startsWith('asmaul-husna:');
                        return (
                          <div key={o.value} className="border-b border-border last:border-b-0">
                            <button
                              type="button"
                              onClick={() => toggleHafalanDoa(o.value)}
                              aria-pressed={dipilih}
                              className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-panel-2 ${
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

                            {/* Asmaul Husna dicentang -> dua kolom angka rentang
                                muncul otomatis (diminta owner 2026-09-02, KHUSUS
                                fitur ini): "No X s/d X" -- guru mengisi rentang
                                yg BENAR2 diajarkan hari itu, bukan target satu
                                semester penuh dari Prota. */}
                            {asmaulHusna && dipilih && (
                              <div className="flex items-center gap-2 bg-panel-2 px-3 py-2.5 pl-[38px]">
                                <span className="shrink-0 text-[11px] font-semibold text-text-dim">No.</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  value={asmaulHusnaRentang[o.value]?.dari ?? ''}
                                  onChange={(e) => ubahRentangAsmaulHusna(o.value, 'dari', e.target.value)}
                                  placeholder="dari"
                                  className="w-16 rounded-[var(--radius)] border border-border bg-panel px-2 py-1.5 text-center text-[13px] text-text focus:border-brass focus:outline-none"
                                />
                                <span className="shrink-0 text-[11px] font-semibold text-text-dim">s/d</span>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  value={asmaulHusnaRentang[o.value]?.sampai ?? ''}
                                  onChange={(e) => ubahRentangAsmaulHusna(o.value, 'sampai', e.target.value)}
                                  placeholder="sampai"
                                  className="w-16 rounded-[var(--radius)] border border-border bg-panel px-2 py-1.5 text-center text-[13px] text-text focus:border-brass focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {hafalanDoaBaru.length > 0 && (
                    <div className="mt-1.5 text-[11px] text-text-dim">
                      Dipilih ({hafalanDoaBaru.length}): {hafalanDoaBaru.map(teksDoaTersimpan).join(', ')}
                    </div>
                  )}
                </FieldTambah>
              </div>

              <div className="flex shrink-0 gap-2.5 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={() => setKlasikalTerbuka(false)}
                  className="flex-1 cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel-2 py-3 text-[15px] font-semibold text-text"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={
                    tanggalKlasikalBaru === '' || hafalanSuratBaru.length === 0 || menyimpanKlasikal || tanggalKlasikalAdalahAsad
                  }
                  onClick={simpanKlasikalBaru}
                  className="flex flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-3 text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--indigo) 0%, var(--violet) 100%)' }}
                >
                  <Check size={16} strokeWidth={2.6} />
                  {editKlasikalId ? 'Simpan Perubahan' : 'Simpan Materi'}
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
        /* +60px = tinggi GuruBottomNav (2026-08-28), tombol duduk di atas
           tab bar. Sama dgn GuruAbsensiView.tsx. */
        className="fixed right-0 bottom-0 left-0 px-[18px] pt-3.5 pb-[calc(74px+env(safe-area-inset-bottom))]"
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
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-[13px] text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(79,70,229,0.3)] transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, var(--indigo) 0%, var(--violet) 100%)' }}
          >
            <Plus size={18} strokeWidth={2.4} />
            Tambah Materi
          </button>
        </div>
      </div>
    </main>
  );
}
