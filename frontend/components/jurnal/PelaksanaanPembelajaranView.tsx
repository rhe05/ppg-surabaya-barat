'use client';

/* Pelaksanaan Pembelajaran (guru mobile) — layar 2 dari 3, lihat catatan
   lengkap di RencanaPembelajaranView.tsx & migrasi
   20260820120000_jurnal_materi_rencana.sql.

   Selalu "hari ini": minggu_ke dihitung dari tanggal hari ini
   (mingguKeDariTanggal), materi yang tampil = seluruh baris jurnal_materi
   milik kelas pada minggu berjalan (baik yang sudah maupun belum
   disampaikan) -- guru mencentang satu-satu.

   PENYIMPANAN OTOMATIS sejak 2026-09-02 (diminta owner): tombol "Simpan
   Pelaksanaan" DIHAPUS. Tiap centang langsung ditulis ke DB, dan bilah
   bawah cuma melaporkan keadaannya ("Tersimpan · 11.14" / "Ada yang
   belum tersimpan" + Coba Lagi). Sebelumnya semua perubahan ditahan di
   state sampai tombol Simpan ditekan -- alasan lamanya "biar guru bisa
   ralat dulu" kalah oleh risiko nyatanya: guru mencentang di tengah KBM
   sambil memegang HP, sekali layar terkunci/telepon masuk sebelum
   Simpan ditekan, seluruh centang hilang tanpa jejak. Ralat tetap bisa:
   centang ulang saja, tulisan berikutnya menimpa yang sebelumnya.

   PUTARAN KETIGA (2026-09-02 sore, diminta owner): kolom "Catatan" yang
   dulu muncul di bawah baris yang dicentang, dan tombol "Tambah materi
   tambahan" (borang judul bebas per minggu) -- KEDUANYA DIHAPUS, "tidak
   digunakan oleh guru". Kolom `catatan`/`catatan_asli` TETAP ada di tipe
   `Baris` & payload penyimpanan (data lama yang mungkin sudah terlanjur
   terisi tidak disentuh), cuma jalan UI utk mengisinya yang dicabut.

   ⚠️ Layar Input Kehadiran (app/absensi/page.tsx) SENGAJA tidak ikut
   berubah -- di sana satu tombol Simpan masih dipertahankan karena
   penulisannya berbentuk satu sesi absensi ber-versi (cek konflik
   lost-update), bukan baris-baris berdiri sendiri seperti di sini.

   PENGUNCIAN MENURUT TANGGAL (2026-09-02, diminta owner "hampir sama
   seperti input kehadiran"): materi menampilkan tanggal rencananya, dan
   baru boleh ditandai kalau harinya sudah berjalan -- materi yang
   dijadwalkan besok terkunci, materi hari ini terkunci sampai jam mulai
   kelas lewat, materi hari-hari yang sudah lewat bebas disusulkan. Lihat
   alasanTerkunci(). Tanggal yang TERCATAT saat guru mencentang adalah
   tanggal rencananya (bukan "hari ini" seperti dulu), dan guru bisa
   mengubahnya lewat "Disampaikan pada" di baris yang terbuka.

   PUTARAN KEDUA (diminta owner, "standar produk SaaS profesional"): ikon
   lucide-react, <select> Kelas -> SelectKustom, "Memuat..." -> Skeleton,
   pesan/error inline -> toast. Hero TETAP ADA di layar ini (beda dari
   RencanaPembelajaranView.tsx yang hero-nya dihapus khusus) -- diminta
   owner cuma utk Rencana Pembelajaran. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Check, ArrowUp, Equal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import Skeleton from '@/components/ui/Skeleton';
import SelectKustom from '@/components/ui/SelectKustom';
import TinggiHalus from '@/components/ui/TinggiHalus';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import { mingguKeDariTanggal, rentangMinggu, labelRentangMinggu } from '@/lib/mingguBulan';
import { pecahJudulMateri } from '@/lib/judulMateri';
import { muatKelasGuru, muatMateriBulan, tandaiMateriBerubah, type KelasJurnal , buangSemuaSinggahan } from '@/lib/dataGuru';
import { muatTanggalAsad, kelasIkutAsad } from '@/lib/klasikalAsad';
import TarikUntukSegarkan from '@/components/ui/TarikUntukSegarkan';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type Kelas = KelasJurnal;
type Baris = {
  /* Kunci LOKAL yang tidak pernah berubah selama baris hidup di layar.
     Semua penjadwalan simpan & penanda baris terbuka dikunci ke uid ini,
     bukan ke id. */
  uid: string;
  /* `id: null` sebelum insert pertama baris ini tersimpan ke server --
     dulu jalan utama masuknya lewat tombol "Tambah materi tambahan"
     (DIHAPUS 2026-09-02 sore, "tidak digunakan oleh guru"); ditinggal
     apa adanya di tipe & alur simpan sbg jaring pengaman umum, bukan
     krn masih ada jalan UI yang membuatnya. */
  id: number | null;
  judul: string;
  status: 'belum' | 'disampaikan';
  catatan: string;
  /* Nilai yang TERAKHIR benar-benar ada di server. Dipakai utk tahu
     baris mana yang masih tertinggal saat penyimpanan gagal. */
  statusAsli: 'belum' | 'disampaikan';
  catatanAsli: string;
  /* Tanggal RENCANA (disusun di layar Rencana Pembelajaran). Dipakai dua
     hal sekaligus (2026-09-02, diminta owner): ditampilkan di baris, dan
     jadi dasar penguncian -- materi yang dijadwalkan besok tidak boleh
     ditandai hari ini. */
  tanggalRencana: string | null;
  /* Tanggal materi itu BENAR-BENAR disampaikan. Dulu selalu diisi
     otomatis "hari ini"; sekarang bisa diatur guru (mis. Rabu ini
     menandai materi Senin lalu -- yang tercatat harus Senin, bukan
     Rabu). Null saat status 'belum'. */
  tanggalDisampaikan: string | null;
  tanggalDisampaikanAsli: string | null;
  /* Versi baris yang TERAKHIR dilihat layar ini. Dikirim balik sbg
     penjaga saat menyimpan; null utk baris yang belum pernah tersimpan
     (lihat catatan `id` di atas). */
  updatedAt: string | null;
  mingguKe: number;
  /* jenis 'klasikal' = materi Klasikal, yang isinya DUA materi
     sekaligus (hafalan surat + hafalan doa) di kolomnya sendiri. */
  jenis: string;
  hafalanSurat: string | null;
  hafalanDoa: string | null;
};

type StatusSimpan = 'diam' | 'menyimpan' | 'tersimpan' | 'gagal';

function todayStr() {
  const d = new Date();
  const dua = (n: number) => String(n).padStart(2, '0');
  /* JANGAN toISOString(): itu UTC, dan di WIB (UTC+7) tanggal 1 pukul
     00.30 akan terbaca sbg tanggal 31 bulan sebelumnya -- persis bug #31
     di ERROR_LOG. Sejak layar ini mengunci baris berdasarkan tanggal,
     salah satu hari berarti materi hari ini ikut terkunci. */
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

/* Tilawati (2026-09-03): Buku Jilid maks 6, Halaman maks 44 (diminta
   owner). Angka di luar rentang dijepit; kosong tetap kosong. */
const TILAWATI_MAKS_JILID = 6;
const TILAWATI_MAKS_HALAMAN = 44;
function jepitTilawati(v: string, maks: number): string {
  const d = v.replace(/[^0-9]/g, '');
  if (d === '') return '';
  return String(Math.min(Math.max(Number(d), 1), maks));
}
/* Prefill hari ini dari catatan terakhir: kalau terakhir "naik", halaman
   maju satu; kalau lewat 44, pindah jilid berikutnya halaman 1 (maks
   jilid 6). Status hari ini dikosongkan -- guru yang memutuskan. */
function lanjutkanTilawati(last: { jilid: string; halaman: string; status: string }): {
  jilid: string;
  halaman: string;
  status: '' | 'naik' | 'tetap';
} {
  let jil = Number(last.jilid);
  let hal = Number(last.halaman);
  if (last.status === 'naik' && Number.isFinite(hal) && hal >= 1) {
    hal += 1;
    if (hal > TILAWATI_MAKS_HALAMAN) {
      hal = 1;
      if (Number.isFinite(jil) && jil >= 1) jil = Math.min(jil + 1, TILAWATI_MAKS_JILID);
    }
  }
  return {
    jilid: Number.isFinite(jil) && jil >= 1 ? String(Math.min(jil, TILAWATI_MAKS_JILID)) : last.jilid,
    halaman:
      Number.isFinite(hal) && hal >= 1 ? String(Math.min(hal, TILAWATI_MAKS_HALAMAN)) : last.halaman,
    status: '',
  };
}

function jamSekarangStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function tanggalPanjang(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function tanggalPendek(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}


export default function PelaksanaanPembelajaranView() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const { push } = useToast();

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const tanggalLabel = sekarang.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /* Bulan/Tahun/Minggu skrg BISA DIPILIH (diminta owner 2026-08-23,
     ikon kalender + info Bulan/Tahun sama spt RencanaPembelajaranView.tsx)
     -- sebelumnya SELALU "hari ini" (ketiganya diturunkan langsung dari
     `sekarang`, bukan state). Default awal tetap bulan/tahun/minggu
     berjalan (persis perilaku lama), guru cuma sekarang BISA geser ke
     minggu/bulan lain utk menyusulkan pelaksanaan yg lupa ditandai. */
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const [mingguKe, setMingguKe] = useState(mingguKeDariTanggal(sekarang));
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];
  const [pemilihBulanTerbuka, setPemilihBulanTerbuka] = useState(false);
  const [posisiPemilihBulan, setPosisiPemilihBulan] = useState<PosisiPicker | null>(null);
  const ikonKalenderRef = useRef<HTMLButtonElement>(null);

  /* Minggu yg sedang dipilih tidak selalu ada di bulan baru (mis. pindah
     dari bulan berminggu-5 ke bulan berminggu-4) -- turunkan ke minggu
     terakhir yg valid drpd diam-diam query minggu yg tidak ada. */
  useEffect(() => {
    if (!rentangMinggu(tahun, bulan, mingguKe)) {
      let mkValid = 1;
      for (let mk = 1; mk <= 5; mk++) if (rentangMinggu(tahun, bulan, mk)) mkValid = mk;
      setMingguKe(mkValid);
    }
  }, [tahun, bulan, mingguKe]);

  /* Dipakai utk membedakan label "Hari Ini"/"Minggu Ini" (default, spt
     semula) vs "Minggu {N}" polos (guru sedang menengok minggu/bulan
     lain, bukan yg berjalan sekarang). */
  const apakahMingguIni =
    tahun === sekarang.getFullYear() &&
    bulan === sekarang.getMonth() + 1 &&
    mingguKe === mingguKeDariTanggal(sekarang);

  const [baris, setBaris] = useState<Baris[]>([]);
  const [terbukaUid, setTerbukaUid] = useState<string | null>(null); // baris yg catatannya sedang diperluas
  /* Jam berjalan, disegarkan tiap menit. Penguncian "sesi belum mulai"
     bergantung jam, dan tanpa denyut ini baris tetap terkunci sampai
     guru menyentuh layar -- guru yang membuka aplikasi 5 menit sebelum
     KBM akan mengira aplikasinya rusak. */
  /* Kalender "Disampaikan pada" -- satu instans dipakai bergantian oleh
     baris mana pun yang sedang membukanya (uid-nya disimpan di sini),
     bukan satu kalender per baris. */
  const [tanggalPickerUid, setTanggalPickerUid] = useState<string | null>(null);
  const [posisiTanggalBaris, setPosisiTanggalBaris] = useState<PosisiPicker | null>(null);
  const tombolTanggalRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const [jamKini, setJamKini] = useState(jamSekarangStr());
  useEffect(() => {
    const t = setInterval(() => setJamKini(jamSekarangStr()), 60_000);
    return () => clearInterval(t);
  }, []);
  const [loading, setLoading] = useState(false);
  const [statusSimpan, setStatusSimpan] = useState<StatusSimpan>('diam');
  const [jamTersimpan, setJamTersimpan] = useState<string | null>(null);
  /* Salinan `baris` terbaru utk dipakai penyimpanan tertunda (catatan
     diketik -> tunggu 900ms). Tanpa ref, timeout akan menyimpan nilai
     yang sudah basi -- itu tepat kelas bug yang paling berbahaya di
     penyimpanan otomatis: yang tersimpan bukan yang terlihat. */
  const barisRef = useRef<Baris[]>([]);
  barisRef.current = baris;
  const tundaRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const rantaiRef = useRef<Map<string, Promise<void>>>(new Map());
  /* Bersihkan timer tertunda saat komponen dilepas -- kalau tidak, ganti
     kelas/bulan sambil mengetik catatan bisa menulis catatan itu ke
     baris minggu yang sudah tidak ditampilkan. */
  useEffect(() => {
    const timer = tundaRef.current;
    return () => {
      timer.forEach((t) => clearTimeout(t));
      timer.clear();
    };
  }, []);

  /* DUA kartu pembungkus: "Materi Klasikal" & "Materi Ngaji", pola sama
     Rencana Pembelajaran (diminta owner 2026-09-03). Keduanya terbuka
     bawaan -- Pelaksanaan dipakai tiap hari, menutup = satu ketukan
     ekstra sebelum kerja pokok. */
  const [klasikalCardTerbuka, setKlasikalCardTerbuka] = useState(true);
  const [ngajiCardTerbuka, setNgajiCardTerbuka] = useState(true);
  /* Minggu yang kartunya terbentang -- kunci = "<jenis>-<mingguKe>"
     supaya kartu minggu di kedua card berdiri sendiri. Bawaannya minggu
     berjalan (kedua jenis). */
  const [mingguTerbuka, setMingguTerbuka] = useState<Set<string>>(() => {
    const mk = mingguKeDariTanggal(new Date());
    return new Set([`klasikal-${mk}`, `ngaji-${mk}`]);
  });
  /* Dropdown Minggu di popup kalender = "buka minggu itu" (di kedua
     card). */
  useEffect(() => {
    setMingguTerbuka((prev) => {
      const baru = new Set(prev);
      baru.add(`klasikal-${mingguKe}`);
      baru.add(`ngaji-${mingguKe}`);
      return baru;
    });
  }, [mingguKe]);
  function toggleKartuMinggu(kunci: string) {
    setMingguTerbuka((prev) => {
      const baru = new Set(prev);
      if (baru.has(kunci)) baru.delete(kunci);
      else baru.add(kunci);
      return baru;
    });
  }

  useEffect(() => {
    if (guruId == null) return;
    muatKelasGuru(guruId).then((list) => {
      setKelasList(list);
      setKelasId(list.length === 1 ? list[0].id : '');
    });
  }, [guruId]);

  /* Tanggal Pencak Silat ASAD se-kelompok (2026-09-03) -- di layar ini
     HANYA pemberitahuan pasif: kalau ada tanggal ASAD (biasanya Jumat)
     di minggu itu, muncul baris "Pencak Silat ASAD - tidak ada
     klasikal" di kartu minggu. TIDAK ada cek-list utk ditandai
     (diminta owner). Kelas Remaja/SMA dikecualikan. */
  const [tanggalAsad, setTanggalAsad] = useState<Set<string>>(new Set());
  const muatAsad = useCallback(async () => {
    const kelompokId = profile?.scope_kelompok_id;
    if (!kelompokId) return;
    setTanggalAsad(await muatTanggalAsad(kelompokId));
  }, [profile?.scope_kelompok_id]);
  useEffect(() => {
    void muatAsad();
  }, [muatAsad]);

  const muat = useCallback(async () => {
    if (kelasId === '') {
      setBaris([]);
      return;
    }
    setLoading(true);
    try {
      const data = await muatMateriBulan(kelasId, tahun, bulan);
      setBaris(
        data.map((m) => ({
          uid: `db-${m.id}`,
          id: m.id,
          judul: m.judul,
          status: m.status as 'belum' | 'disampaikan',
          catatan: m.catatan ?? '',
          statusAsli: m.status as 'belum' | 'disampaikan',
          catatanAsli: m.catatan ?? '',
          tanggalRencana: m.tanggal_rencana ?? null,
          tanggalDisampaikan: m.tanggal_disampaikan ?? null,
          tanggalDisampaikanAsli: m.tanggal_disampaikan ?? null,
          updatedAt: m.updated_at,
          mingguKe: m.minggu_ke,
          jenis: m.jenis,
          hafalanSurat: m.klasikal_hafalan_surat ?? null,
          hafalanDoa: m.klasikal_hafalan_doa ?? null,
        })),
      );
    } catch (e) {
      push(e instanceof Error ? e.message : 'Gagal memuat materi.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, tahun, bulan]);

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, tahun, bulan]);

  /* ── Kartu "Tilawati" (2026-09-03, diminta owner) ──────────────────
     Per santri di kelas: Buku Jilid / Halaman / Naik|Tetap, dicatat
     guru "hari ini". Tabel tilawati_pelaksanaan (migrasi 20260903120000),
     UNIQUE (santri_id, tanggal) -> upsert. Auto-save 700ms setelah
     berhenti mengetik; langsung utk pilihan Naik/Tetap. */
  type BarisTilawati = { jilid: string; halaman: string; status: '' | 'naik' | 'tetap' };
  const [tilawatiCardTerbuka, setTilawatiCardTerbuka] = useState(false);
  const [tilawatiSantri, setTilawatiSantri] = useState<{ id: number; nama: string }[]>([]);
  const [tilawati, setTilawati] = useState<Record<number, BarisTilawati>>({});
  const [loadingTilawati, setLoadingTilawati] = useState(false);
  const tilawatiRef = useRef<Record<number, BarisTilawati>>({});
  tilawatiRef.current = tilawati;
  const tundaTilawatiRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const timers = tundaTilawatiRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const muatTilawati = useCallback(async () => {
    if (kelasId === '') {
      setTilawatiSantri([]);
      setTilawati({});
      return;
    }
    setLoadingTilawati(true);
    try {
      const hariIni = todayStr();
      const [sRes, tRes] = await Promise.all([
        supabase.from('santri').select('id, nama').eq('kelas_id', kelasId).is('deleted_at', null).order('nama'),
        supabase
          .from('tilawati_pelaksanaan')
          .select('santri_id, tanggal, buku_jilid, halaman, status')
          .eq('kelas_id', kelasId)
          .lte('tanggal', hariIni)
          .order('tanggal', { ascending: true }),
      ]);
      if (sRes.error) throw new Error(sRes.error.message);
      if (tRes.error) throw new Error(tRes.error.message);
      setTilawatiSantri((sRes.data ?? []) as { id: number; nama: string }[]);

      /* Kumpulkan riwayat per santri. Kalau hari ini belum ada catatan
         DAN catatan terakhir "naik" -> halaman OTOMATIS pindah ke
         berikutnya (diminta owner 2026-09-03). Prefill ini display-only
         sampai guru menekan Naik/Tetap. */
      const perSantri = new Map<number, { tanggal: string; jilid: string; halaman: string; status: string }[]>();
      for (const r of (tRes.data ?? []) as {
        santri_id: number;
        tanggal: string;
        buku_jilid: string | null;
        halaman: string | null;
        status: string | null;
      }[]) {
        const arr = perSantri.get(r.santri_id) ?? [];
        arr.push({
          tanggal: r.tanggal,
          jilid: r.buku_jilid ?? '',
          halaman: r.halaman ?? '',
          status: r.status ?? '',
        });
        perSantri.set(r.santri_id, arr);
      }
      const peta: Record<number, BarisTilawati> = {};
      for (const [sid, arr] of perSantri) {
        const todayRow = arr.find((x) => x.tanggal === hariIni);
        if (todayRow) {
          peta[sid] = {
            jilid: todayRow.jilid,
            halaman: todayRow.halaman,
            status: (todayRow.status as '' | 'naik' | 'tetap') || '',
          };
          continue;
        }
        const last = [...arr].reverse().find((x) => x.tanggal < hariIni);
        if (last) peta[sid] = lanjutkanTilawati(last);
      }
      setTilawati(peta);
    } catch (e) {
      push(e instanceof Error ? e.message : 'Gagal memuat Tilawati.', 'error');
    } finally {
      setLoadingTilawati(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId]);
  useEffect(() => {
    muatTilawati();
  }, [muatTilawati]);

  const simpanTilawati = useCallback(
    async (santriId: number) => {
      if (kelasId === '') return;
      const b = tilawatiRef.current[santriId] ?? { jilid: '', halaman: '', status: '' as const };
      try {
        const { error } = await supabase.from('tilawati_pelaksanaan').upsert(
          {
            kelas_id: kelasId,
            santri_id: santriId,
            tanggal: todayStr(),
            buku_jilid: b.jilid.trim() === '' ? null : b.jilid.trim(),
            halaman: b.halaman.trim() === '' ? null : b.halaman.trim(),
            status: b.status === '' ? null : b.status,
            dibuat_oleh: profile?.id ?? null,
          },
          { onConflict: 'santri_id,tanggal' },
        );
        if (error) throw new Error(error.message);
      } catch (e) {
        push(e instanceof Error ? e.message : 'Gagal menyimpan Tilawati.', 'error');
      }
    },
    [kelasId, profile?.id, push],
  );

  function ubahTilawati(santriId: number, patch: Partial<BarisTilawati>, langsung: boolean) {
    setTilawati((prev) => {
      const cur: BarisTilawati = prev[santriId] ?? { jilid: '', halaman: '', status: '' };
      return { ...prev, [santriId]: { ...cur, ...patch } };
    });
    const timers = tundaTilawatiRef.current;
    const lama = timers.get(santriId);
    if (lama) clearTimeout(lama);
    timers.set(
      santriId,
      setTimeout(
        () => {
          timers.delete(santriId);
          void simpanTilawati(santriId);
        },
        langsung ? 0 : 700,
      ),
    );
  }

  /* ── Penyimpanan OTOMATIS (2026-09-02, diminta owner) ──────────────
     Tombol "Simpan Pelaksanaan" dihapus: tiap centang langsung ditulis,
     catatan ditulis 900ms setelah guru berhenti mengetik. Alasannya
     praktis, bukan gaya-gayaan -- guru mencentang di tengah KBM sambil
     memegang HP; sekali layar terkunci/telepon masuk sebelum tombol
     Simpan ditekan, seluruh centangnya hilang tanpa jejak.

     Yang disimpan adalah SATU BARIS per panggilan (bukan batch semua
     baris spt dulu), supaya satu baris gagal tidak menyeret baris lain
     dan bisa dicoba ulang sendiri. `statusAsli`/`catatanAsli` sekarang
     berperan sbg "nilai terakhir yang sudah ada di server" -- itu yang
     membuat bilah bawah tahu masih ada yang tertinggal. */
  const simpanBaris = useCallback(
    async (uid: string) => {
      if (kelasId === '') return;
      const b = barisRef.current.find((x) => x.uid === uid);
      if (!b) return;
      const status = b.status;
      const catatan = b.catatan;
      const catatanDb = catatan.trim() === '' ? null : catatan.trim();
      /* Bukan lagi "selalu hari ini": yang tercatat adalah tanggal yang
         dipegang baris ini (baku dari tanggal rencana, bisa diubah guru). */
      const tanggal = status === 'disampaikan' ? (b.tanggalDisampaikan ?? todayStr()) : null;
      setStatusSimpan('menyimpan');
      try {
        if (b.id === null) {
          const { data, error: err } = await supabase
            .from('jurnal_materi')
            .insert({
              kelas_id: kelasId,
              tahun,
              bulan,
              /* Minggu diambil dari BARISNYA, bukan dari minggu yang
                 sedang dipilih di kalender: sejak seluruh minggu bulan
                 itu tampil sekaligus, guru bisa menambah materi di kartu
                 minggu mana pun. */
              minggu_ke: b.mingguKe,
              judul: b.judul,
              status,
              tanggal_disampaikan: tanggal,
              catatan: catatanDb,
            })
            .select('id, updated_at')
            .single();
          if (err) throw new Error(err.message);
          setBaris((prev) =>
            prev.map((x) =>
              x.uid === uid
                ? {
                    ...x,
                    id: data.id,
                    updatedAt: data.updated_at,
                    statusAsli: status,
                    catatanAsli: catatan,
                    tanggalDisampaikanAsli: tanggal,
                  }
                : x
            ),
          );
        } else {
          /* PENJAGA VERSI (2026-09-02). Sebelumnya penulisan ini cuma
             `.eq('id', ...)`: dua guru yang berbagi satu kelas lewat
             "kelas pinjam" bisa saling menimpa catatan tanpa peringatan,
             dan yang kalah tidak akan pernah tahu -- datanya hilang tanpa
             jejak, jenis bug yang tidak pernah dilaporkan siapa pun.
             Sekarang penulisan HARUS cocok dgn versi baris yang dilihat
             layar ini; kalau tidak cocok, 0 baris terpengaruh. Pola sama
             persis dgn absensi (simpan_absensi_kelas & Riwayat Kehadiran). */
          const { data, error: err } = await supabase
            .from('jurnal_materi')
            .update({ status, tanggal_disampaikan: tanggal, catatan: catatanDb })
            .eq('id', b.id)
            .eq('updated_at', b.updatedAt ?? '')
            .select('updated_at');
          if (err) throw new Error(err.message);
          if (!data || data.length === 0) {
            /* Bentrok: baris sudah diubah sesi lain. Muat ulang dari
               server -- JANGAN menimpa diam-diam, dan jangan pula membuang
               kabar ini ke dalam status "gagal" biasa yang menyarankan
               Coba Lagi (mencoba lagi hanya akan menimpa pekerjaan orang). */
            tandaiMateriBerubah(kelasId, tahun, bulan);
            push('Materi ini baru diubah dari perangkat lain. Layar dimuat ulang.', 'info');
            setStatusSimpan('diam');
            await muat();
            return;
          }
          setBaris((prev) =>
            prev.map((x) =>
              x.uid === uid
                ? {
                    ...x,
                    updatedAt: data[0].updated_at,
                    statusAsli: status,
                    catatanAsli: catatan,
                    tanggalDisampaikanAsli: tanggal,
                  }
                : x
            ),
          );
        }
        /* Singgahan bersama dibuang supaya Rencana & Riwayat tidak
           menampilkan keadaan sebelum centang ini saat dibuka sebentar
           lagi (lib/dataGuru.ts). */
        tandaiMateriBerubah(kelasId, tahun, bulan);
        setJamTersimpan(
          new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        );
        setStatusSimpan('tersimpan');
      } catch (e) {
        /* Nilai lokal SENGAJA tidak dikembalikan ke nilai server: yang
           terlihat di layar tetap apa yang guru pilih, dan bilah bawah
           menyatakan bahwa itu belum tersimpan + menyediakan Coba Lagi.
           Membatalkan centang guru diam-diam jauh lebih membingungkan. */
        setStatusSimpan('gagal');
        push(e instanceof Error ? e.message : 'Gagal menyimpan.', 'error');
      }
    },
    [kelasId, tahun, bulan, push],
  );

  function jadwalkanSimpan(uid: string, jeda: number) {
    const timer = tundaRef.current;
    const lama = timer.get(uid);
    if (lama) clearTimeout(lama);
    timer.set(
      uid,
      setTimeout(() => {
        timer.delete(uid);
        /* Penulisan untuk SATU baris diserialkan lewat rantai janji:
           centang-batal-centang cepat bisa membuat dua permintaan
           bersamaan, dan tanpa rantai ini urutan tibanya di server tidak
           dijamin -- yang tersimpan bisa jadi centang yang LEBIH LAMA.
           simpanBaris tidak pernah melempar (galatnya ditangkap di
           dalam), jadi rantainya tidak bisa putus. */
        const rantai = rantaiRef.current;
        const berikut = (rantai.get(uid) ?? Promise.resolve()).then(() => simpanBaris(uid));
        rantai.set(uid, berikut);
      }, jeda),
    );
  }

  function toggleStatus(uid: string) {
    const asal = barisRef.current.find((b) => b.uid === uid);
    if (!asal) return;
    /* Penahan kedua, di samping kotak centang yang memang sudah
       dinonaktifkan: baris terkunci tidak boleh berubah lewat jalan lain
       mana pun (mis. jam mulai terlewati saat baris sedang terbuka). */
    const terkunci = alasanTerkunci(asal);
    if (terkunci) {
      push(terkunci, 'info');
      return;
    }
    setBaris((prev) =>
      prev.map((b) => {
        if (b.uid !== uid) return b;
        const status = b.status === 'disampaikan' ? 'belum' : 'disampaikan';
        return {
          ...b,
          status,
          tanggalDisampaikan:
            status === 'disampaikan' ? (b.tanggalDisampaikan ?? tanggalDisampaikanBaku(b)) : null,
        };
      }),
    );
    setTerbukaUid((prev) => (prev === uid ? prev : uid));
    /* Jeda 0: tetap lewat setTimeout supaya simpanBaris membaca barisRef
       SESUDAH setBaris di atas terpasang, bukan nilai sebelum toggle. */
    jadwalkanSimpan(uid, 0);
  }

  /* Guru mengubah "materi ini tersampaikan hari apa" lewat kalender di
     baris yang terbuka. Tanggal masa depan tidak bisa dipilih (kalender
     mematikannya), jadi di sini cukup menyimpan. */
  function ubahTanggalDisampaikan(uid: string, iso: string) {
    setBaris((prev) => prev.map((b) => (b.uid === uid ? { ...b, tanggalDisampaikan: iso } : b)));
    jadwalkanSimpan(uid, 0);
  }

  /* "Coba Lagi" di bilah bawah: simpan ulang SEMUA baris yang nilainya
     masih beda dari server, satu per satu. */
  async function simpanUlangYangTertinggal() {
    for (const b of barisRef.current) {
      if (
        b.id === null ||
        b.status !== b.statusAsli ||
        b.catatan !== b.catatanAsli ||
        b.tanggalDisampaikan !== b.tanggalDisampaikanAsli
      ) {
        await simpanBaris(b.uid);
      }
    }
  }

  const direncanakan = baris.length;
  const disampaikan = baris.filter((b) => b.status === 'disampaikan').length;
  const persen = direncanakan > 0 ? Math.round((disampaikan / direncanakan) * 100) : 0;

  /* ── Penguncian menurut tanggal (2026-09-02, diminta owner) ─────────
     Meniru tiga penahan Input Kehadiran, seperlunya untuk layar ini:

     1. Materi yang tanggal rencananya MASIH DI DEPAN tidak boleh
        ditandai sama sekali -- menandai materi besok sbg "sudah
        disampaikan" hari ini itu laporan palsu, bukan sekadar salah
        ketik.
     2. Materi HARI INI baru boleh ditandai setelah jam mulai kelasnya
        lewat (kolom kelas.jam_mulai, sumber yang sama dipakai penahan
        "Sesi Belum Dimulai" di app/absensi/page.tsx).
     3. Materi yang tanggalnya SUDAH LEWAT bebas ditandai kapan saja --
        justru itu gunanya layar ini (hari Rabu menyusulkan materi Senin).

     Materi tanpa tanggal rencana (mis. peninggalan "Tambah materi
     tambahan", DIHAPUS 2026-09-02 sore) diperlakukan sbg materi hari
     ini: ikut aturan nomor 2. */
  /* ── Kelompokkan per MINGGU, seperti Rencana Pembelajaran ───────────
     (2026-09-02, diminta owner). Layar ini dulu cuma menampilkan SATU
     minggu terpilih; sekarang seluruh minggu bulan itu tampil sbg kartu
     sendiri-sendiri. Minggu 5 ikut hanya kalau bulannya memang punya --
     rentangMinggu balik null utk Februari non-kabisat (28 hari, pas 4x7),
     satu-satunya bulan tanpa Minggu 5.

     Urutan di dalam minggu: KLASIKAL DULU (hafalan surat + hafalan doa),
     baru materi KBM -- urutan yang sama dgn Rencana Pembelajaran, dan
     memang urutan mengajarnya. */
  /* Dibungkus useMemo (audit 2026-09-02): pengelompokan + pengurutan ini
     dulu dihitung ulang di SETIAP render, termasuk tiap denyut jam per
     menit dan tiap ketikan catatan. */
  const mingguDipakai = useMemo(
    () =>
      [1, 2, 3, 4, 5]
        .map((mk) => ({
          mingguKe: mk,
          rentang: rentangMinggu(tahun, bulan, mk),
          isi: baris
            .filter((b) => b.mingguKe === mk)
            .sort((a, b) => {
              const bobot = (x: Baris) => (x.jenis === 'klasikal' ? 0 : 1);
              if (bobot(a) !== bobot(b)) return bobot(a) - bobot(b);
              return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
            }),
        }))
        .filter((m) => m.rentang !== null),
    [baris, tahun, bulan]
  );

  const kelasAktif = kelasList.find((k) => k.id === kelasId) ?? null;
  const jamMulaiKelas = kelasAktif?.jam_mulai ? kelasAktif.jam_mulai.slice(0, 5) : null;
  const kelasIniIkutAsad = kelasAktif != null && kelasIkutAsad(kelasAktif.nama);

  function alasanTerkunci(b: Baris): string | null {
    const hariIni = todayStr();
    const tgl = b.tanggalRencana;
    if (tgl && tgl > hariIni) {
      return `Baru bisa ditandai ${tanggalPanjang(tgl)}.`;
    }
    if ((!tgl || tgl === hariIni) && jamMulaiKelas && jamKini < jamMulaiKelas) {
      return `Sesi ngaji kelas ini baru mulai jam ${jamMulaiKelas.replace(':', '.')}.`;
    }
    return null;
  }

  /* Tanggal yang dicatat saat guru mencentang: tanggal RENCANA-nya
     (itulah hari materi ini semestinya disampaikan), kecuali kalau
     rencananya belum lewat -- pakai hari ini. Guru tetap bisa
     mengubahnya sendiri lewat pemilih tanggal di baris yang terbuka. */
  function tanggalDisampaikanBaku(b: Baris): string {
    const hariIni = todayStr();
    if (b.tanggalRencana && b.tanggalRencana <= hariIni) return b.tanggalRencana;
    return hariIni;
  }

  /* Masih ada yang belum sampai ke server? Sumber kebenarannya sama
     dengan yang dipakai simpanUlangYangTertinggal, jadi bilah bawah dan
     tombol Coba Lagi tidak mungkin berbeda pendapat. */
  const adaTertinggal = baris.some(
    (b) =>
      b.id === null ||
      b.status !== b.statusAsli ||
      b.catatan !== b.catatanAsli ||
      b.tanggalDisampaikan !== b.tanggalDisampaikanAsli
  );

  const opsiBulan = NAMA_BULAN.map((nm, idx) => ({ value: String(idx + 1), label: nm }));
  const opsiTahun = tahunPilihan.map((y) => ({ value: String(y), label: String(y) }));
  const opsiMinggu = [1, 2, 3, 4, 5]
    .filter((mk) => rentangMinggu(tahun, bulan, mk))
    .map((mk) => ({
      value: String(mk),
      label: `Minggu ${mk}`,
      sublabel: labelRentangMinggu(tahun, bulan, mk, NAMA_BULAN),
    }));

  /* Tarik-untuk-segarkan (audit 2026-09-02, temuan 05): komponennya
     sudah ada & dipakai Dashboard guru, tapi tiga layar jurnal belum.
     Penting khusus di app yang dipasang ke Layar Utama -- di mode
     standalone Chrome TIDAK menyediakan tarik-bawaan, jadi tanpa ini
     satu-satunya cara memuat ulang adalah menutup app. */
  async function segarkan() {
    buangSemuaSinggahan();
    await Promise.all([muat(), muatAsad(), muatTilawati()]);
  }

  /* ── Dua kartu "Materi Klasikal" / "Materi Ngaji" (2026-09-03, diminta
     owner, pola sama Rencana Pembelajaran) ──────────────────────────── */
  const hitungJenis = (kl: boolean) => {
    const rel = baris.filter((b) => (kl ? b.jenis === 'klasikal' : b.jenis !== 'klasikal'));
    return { total: rel.length, sudah: rel.filter((b) => b.status === 'disampaikan').length };
  };
  const nKlasikal = hitungJenis(true);
  const nNgaji = hitungJenis(false);

  /* Satu baris materi (kotak centang + judul + rincian + pemilih
     "Disampaikan pada"). Diekstrak supaya kedua kartu memakainya. */
  function barisMateri(b: Baris) {
    const dicentang = b.status === 'disampaikan';
    const diperluas = terbukaUid === b.uid;
    const terkunci = alasanTerkunci(b);
    const { kategori, utama, rincian } = pecahJudulMateri(b.judul);
    const judulBaris = b.jenis === 'klasikal' ? 'Klasikal' : utama;
    const labelBaris = b.jenis === 'klasikal' ? null : kategori;
    return (
      <div key={b.uid} className="border-t border-border px-3.5 py-3">
        <button
          type="button"
          onClick={() => toggleStatus(b.uid)}
          aria-disabled={terkunci !== null}
          className={`flex w-full items-start gap-3 border-none bg-transparent p-0 text-left ${
            terkunci ? 'cursor-default' : 'cursor-pointer'
          }`}
        >
          <span
            className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150 ${
              dicentang
                ? 'border-sage bg-sage'
                : terkunci
                  ? 'border-border bg-panel-2'
                  : 'border-border bg-panel'
            }`}
          >
            {dicentang && <Check size={13} strokeWidth={3} color="#fff" />}
          </span>
          <span className="min-w-0 flex-1">
            {(labelBaris || b.tanggalRencana) && (
              <span className="label-mikro block">
                {[labelBaris, b.tanggalRencana ? tanggalPendek(b.tanggalRencana) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <span
              className={`block text-[15px] font-bold ${
                dicentang || terkunci ? 'text-text-dim' : 'text-text'
              }`}
            >
              {judulBaris}
            </span>
            {b.jenis === 'klasikal' ? (
              <>
                {b.hafalanSurat && (
                  <span className="mt-1 block text-[12px] leading-snug text-text-dim">
                    <span className="font-semibold text-text">Hafalan Surat:</span> {b.hafalanSurat}
                  </span>
                )}
                {b.hafalanDoa && (
                  <span className="mt-0.5 block text-[12px] leading-snug text-text-dim">
                    <span className="font-semibold text-text">Hafalan Do&rsquo;a:</span> {b.hafalanDoa}
                  </span>
                )}
                {!b.hafalanSurat && !b.hafalanDoa && rincian && (
                  <span className="mt-0.5 block text-[12px] leading-snug text-text-dim">{rincian}</span>
                )}
              </>
            ) : (
              rincian && (
                <span className="mt-0.5 block text-[12px] leading-snug text-text-dim">{rincian}</span>
              )
            )}
            {terkunci && (
              <span className="mt-1 block text-[12px] leading-snug text-text-faint">{terkunci}</span>
            )}
          </span>
        </button>

        {diperluas && !terkunci && dicentang && (
          <div className="mt-2.5 pl-[34px]">
            <label className="label-mikro mb-1 block">Disampaikan pada</label>
            <button
              type="button"
              ref={(el) => {
                tombolTanggalRef.current[b.uid] = el;
              }}
              onClick={() => {
                const rect = tombolTanggalRef.current[b.uid]?.getBoundingClientRect();
                if (rect) {
                  setPosisiTanggalBaris({
                    top: rect.bottom + 6,
                    right: window.innerWidth - rect.right,
                  });
                }
                setTanggalPickerUid((v) => (v === b.uid ? null : b.uid));
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2 text-[13px] text-text"
            >
              <span>
                {b.tanggalDisampaikan ? tanggalPanjang(b.tanggalDisampaikan) : 'Pilih tanggal'}
              </span>
              <Calendar size={15} className="text-text-faint" />
            </button>
          </div>
        )}
      </div>
    );
  }

  /* Daftar kartu Minggu N untuk satu jenis (klasikal/ngaji). */
  function daftarMinggu(jenis: 'klasikal' | 'ngaji') {
    if (loading && baris.length === 0) {
      return (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-[52px] w-full" />
          <Skeleton className="h-[52px] w-full" />
        </div>
      );
    }
    const adalahKlasikal = jenis === 'klasikal';
    const kartu = mingguDipakai
      .map((grup) => {
        const isi = grup.isi.filter((b) =>
          adalahKlasikal ? b.jenis === 'klasikal' : b.jenis !== 'klasikal',
        );
        const asadMingguIni: string[] =
          adalahKlasikal && kelasIniIkutAsad && grup.rentang
            ? Array.from(
                { length: grup.rentang.akhir - grup.rentang.awal + 1 },
                (_, i) =>
                  `${tahun}-${String(bulan).padStart(2, '0')}-${String(
                    grup.rentang!.awal + i,
                  ).padStart(2, '0')}`,
              ).filter((iso) => tanggalAsad.has(iso))
            : [];
        if (isi.length === 0 && asadMingguIni.length === 0) return null;
        const kunci = `${jenis}-${grup.mingguKe}`;
        const terbukaMinggu = mingguTerbuka.has(kunci);
        const sudah = isi.filter((b) => b.status === 'disampaikan').length;
        return (
          <div
            key={kunci}
            className={`overflow-hidden rounded-[var(--radius)] border border-border bg-panel transition-opacity duration-200 ${
              loading ? 'pointer-events-none opacity-40' : 'opacity-100'
            }`}
          >
            <button
              type="button"
              onClick={() => toggleKartuMinggu(kunci)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent px-3.5 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-text">Minggu {grup.mingguKe}</span>
                <span className="block text-[12px] text-text-dim">
                  {labelRentangMinggu(tahun, bulan, grup.mingguKe, NAMA_BULAN)}
                </span>
              </span>
              <span className="shrink-0 text-[12px] font-semibold text-text-dim">
                {isi.length === 0 ? '—' : `${sudah}/${isi.length}`}
              </span>
            </button>
            {terbukaMinggu && isi.length === 0 && asadMingguIni.length === 0 && (
              <p className="border-t border-border px-3.5 py-3.5 text-[13px] text-text-dim">
                Belum ada materi minggu ini.
              </p>
            )}
            {terbukaMinggu && isi.map((b) => barisMateri(b))}
            {terbukaMinggu &&
              asadMingguIni.map((iso) => (
                <div
                  key={`asad-${iso}`}
                  className="border-t border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.05)] px-3.5 py-2.5"
                >
                  <span className="block text-[12px] font-bold text-red">{tanggalPanjang(iso)}</span>
                  <span className="block text-[12px] text-text-dim">
                    Pencak Silat ASAD — tidak ada klasikal hari ini.
                  </span>
                </div>
              ))}
          </div>
        );
      })
      .filter(Boolean);
    if (kartu.length === 0) {
      return (
        <p className="text-[13px] text-text-dim">
          Belum ada Materi {adalahKlasikal ? 'Klasikal' : 'Ngaji'} untuk periode ini.
        </p>
      );
    }
    return kartu;
  }

  return (
    <TarikUntukSegarkan onSegarkan={segarkan}>
    <main className="flex min-h-screen flex-col bg-bg">
      {/* Hero hijau (nama/peran/kelompok) DIHAPUS (diminta owner 2026-08-23,
          susulan dari keputusan yg sama di RencanaPembelajaranView.tsx) --
          murni pengulangan info yang sudah dilihat guru di Dashboard, tidak
          ada nilai tambah utk layar sub-alur spt ini. Top bar putih
          (hamburger+brand+bell) TETAP ADA -- itu satu-satunya jalan guru
          kembali ke menu, tidak boleh hilang (lihat JurnalHeaderChrome.tsx). */}
      <JurnalHeaderChrome tampilkanHero={false} />

      {/* pb-[86px]: ruang utk bilah aksi yang menempel di bawah, supaya
          baris terakhir daftar tidak tertutup tombol Simpan. */}
      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-[86px]">
        {/* Judul + chip kelas kiri, ikon kalender + info Bulan/Tahun kanan --
            konsep & markup SAMA PERSIS RencanaPembelajaranView.tsx (diminta
            owner 2026-08-23). Popup-nya (di bawah) py SATU dropdown lebih
            banyak drpd punya Rencana: Minggu, krn Pelaksanaan kerja per-
            minggu (bukan menampilkan semua minggu bulan itu sekaligus spt
            Rencana) -- perlu tahu PERSIS minggu mana yg mau ditengok. */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="pt-1.5 text-[17px] font-extrabold text-text">Pelaksanaan Pembelajaran</div>
            {/* Konteks waktu dinyatakan SEKALI, di sini (2026-09-02,
                diminta owner). Sebelumnya disebut empat kali dalam satu
                layar: pil bulan, kartu tanggal hijau, judul "Pertemuan
                Hari Ini", judul "Materi Hari Ini" -- kartu hijaunya
                dihapus dan kedua judul di bawah tidak lagi mengulang
                "Hari Ini". */}
            <div className="text-[12px] text-text-dim">
              {apakahMingguIni ? tanggalLabel : labelRentangMinggu(tahun, bulan, mingguKe, NAMA_BULAN)}
              {' · '}
              Minggu {mingguKe}
            </div>
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
              aria-label="Pilih Bulan, Tahun, dan Minggu"
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
              <div className="mb-2 flex gap-2">
                <SelectKustom value={String(bulan)} onChange={(v) => setBulan(Number(v))} opsi={opsiBulan} />
                <SelectKustom value={String(tahun)} onChange={(v) => setTahun(Number(v))} opsi={opsiTahun} />
              </div>
              <SelectKustom value={String(mingguKe)} onChange={(v) => setMingguKe(Number(v))} opsi={opsiMinggu} />
            </div>
          </>
        )}

        {/* Kartu tanggal hijau muda DIHAPUS 2026-09-02 (diminta owner):
            isinya sudah pindah jadi baris keterangan di bawah judul.
            Selain mengulang, warnanya jg salah kaprah -- hijau/--sage di
            app ini berarti POSITIF/berhasil, dipakai utk info netral
            (tanggal) warnanya jadi kehilangan arti. */}

        {kelasId === '' ? (
          <p className="text-[13px] text-text-dim">Pilih kelas dulu utk melihat pelaksanaan minggu ini.</p>
        ) : (
          /* TinggiHalus (2026-08-24, ronde kedua): fade-in opacity SAJA
             (percobaan pertama) tidak cukup -- itu menyamarkan tampilan,
             tapi REFLOW-nya (kartu2 di bawah "Materi Hari Ini" pindah
             posisi) tetap terjadi seketika, terutama saat Skeleton
             (tinggi tetap 3x52px) diganti daftar sungguhan yang jumlah
             barisnya beda (dilaporkan owner masih "ngejump" khususnya pas
             pilih Kelas 1). TinggiHalus mengukur tinggi konten via
             ResizeObserver lalu menganimasikan tinggi PEMBUNGKUS via CSS
             `transition: height` -- kartu2 di bawahnya sekarang IKUT
             tergeser halus, bukan loncat instan. key={kelasId} tetap
             dipertahankan (remount tiap kelas berganti) supaya fade-in
             opacity awal + reset animasi tetap jalan; remount ini AMAN
             thd data krn `baris` dkk hidup di state komponen induk. */
          <TinggiHalus>
            <div key={kelasId} className="animasi-konten-muncul">
            {/* Kemajuan pertemuan: SATU baris + bilah tipis (2026-09-02,
                diminta owner). Sebelumnya kartu ini menyatakan fakta yang
                sama tiga kali -- angka Direncanakan, angka Disampaikan,
                dan cincin donat persen. Utk satu-dua materi (kasus lazim
                di layar ini) donat 0% cuma dekorasi. Donat tetap dipakai
                di Riwayat, tempat angkanya besar & perbandingannya
                bermakna. */}
            <div className="kartu-premium mb-5 px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-[13px] text-text-dim">
                  <span className="angka-metrik text-[15px] text-text">{disampaikan}</span> dari{' '}
                  <span className="angka-metrik text-[15px] text-text">{direncanakan}</span> materi disampaikan
                </div>
                <div className="angka-metrik shrink-0 text-[12px] text-text-dim">{persen}%</div>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                <div
                  className="h-full rounded-full bg-sage transition-[width] duration-300"
                  style={{ width: `${persen}%` }}
                />
              </div>
            </div>

            {/* DUA kartu: "Materi Klasikal" & "Materi Ngaji" -- pola sama
                Rencana Pembelajaran (diminta owner 2026-09-03). Isi tiap
                kartu = daftar kartu Minggu N milik jenis itu (helper
                daftarMinggu di atas). Keduanya terbuka bawaan. */}
            <div className="kartu-premium mb-4 overflow-hidden">
              <button
                type="button"
                onClick={() => setKlasikalCardTerbuka((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent p-4 text-left"
              >
                <span className="text-[15px] font-bold text-text">Materi Klasikal</span>
                <span className="shrink-0 rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[11px] font-bold text-sage">
                  {nKlasikal.sudah}/{nKlasikal.total} Materi
                </span>
              </button>
              {klasikalCardTerbuka && (
                <div className="flex flex-col gap-3 border-t border-border p-3">
                  {daftarMinggu('klasikal')}
                </div>
              )}
            </div>

            <div className="kartu-premium mb-4 overflow-hidden">
              <button
                type="button"
                onClick={() => setNgajiCardTerbuka((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent p-4 text-left"
              >
                <span className="text-[15px] font-bold text-text">Materi Ngaji</span>
                <span className="shrink-0 rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[11px] font-bold text-sage">
                  {nNgaji.sudah}/{nNgaji.total} Materi
                </span>
              </button>
              {ngajiCardTerbuka && (
                <div className="flex flex-col gap-3 border-t border-border p-3">
                  {daftarMinggu('ngaji')}
                </div>
              )}
            </div>

            {/* Kartu "Tilawati" (2026-09-03, diminta owner) -- per santri
                di kelas: Buku Jilid / Halaman / Naik|Tetap, simpan
                otomatis. */}
            <div className="kartu-premium mb-4 overflow-hidden">
              <button
                type="button"
                onClick={() => setTilawatiCardTerbuka((v) => !v)}
                className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent p-4 text-left"
              >
                <span className="text-[15px] font-bold text-text">Tilawati</span>
                <span className="shrink-0 rounded-full bg-indigo-lembut px-2.5 py-1 text-[11px] font-bold text-indigo">
                  {tilawatiSantri.length} Santri
                </span>
              </button>
              {tilawatiCardTerbuka && (
                <div className="border-t border-border p-3">
                  {loadingTilawati && tilawatiSantri.length === 0 ? (
                    <div className="flex flex-col gap-2.5">
                      <Skeleton className="h-[92px] w-full" />
                      <Skeleton className="h-[92px] w-full" />
                    </div>
                  ) : tilawatiSantri.length === 0 ? (
                    <p className="text-[13px] text-text-dim">Belum ada santri di kelas ini.</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {tilawatiSantri.map((s) => {
                        const t = tilawati[s.id] ?? { jilid: '', halaman: '', status: '' as const };
                        return (
                          <div
                            key={s.id}
                            className="rounded-[var(--radius)] border border-border bg-panel p-3"
                          >
                            <div className="mb-2 text-[13px] font-bold text-text">{s.nama}</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="label-mikro mb-1 block">Buku Jilid (1–6)</label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={TILAWATI_MAKS_JILID}
                                  value={t.jilid}
                                  onChange={(e) =>
                                    ubahTilawati(s.id, { jilid: jepitTilawati(e.target.value, TILAWATI_MAKS_JILID) }, false)
                                  }
                                  className="w-full rounded-[var(--radius)] border border-border bg-panel px-2.5 py-2 text-center text-[13px] text-text focus:border-brass focus:outline-none"
                                />
                              </div>
                              <div>
                                <label className="label-mikro mb-1 block">Halaman (1–44)</label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={TILAWATI_MAKS_HALAMAN}
                                  value={t.halaman}
                                  onChange={(e) =>
                                    ubahTilawati(s.id, { halaman: jepitTilawati(e.target.value, TILAWATI_MAKS_HALAMAN) }, false)
                                  }
                                  className="w-full rounded-[var(--radius)] border border-border bg-panel px-2.5 py-2 text-center text-[13px] text-text focus:border-brass focus:outline-none"
                                />
                              </div>
                            </div>
                            {/* Sakelar Naik / Tetap -- pil modern: track
                                cekung, tombol aktif "terangkat" + ikon,
                                ketuk lagi utk batal (diminta owner
                                2026-09-03). */}
                            <div className="mt-2.5 flex gap-1.5 rounded-full bg-panel-2 p-1">
                              {([
                                { opt: 'naik', label: 'Naik', Ikon: ArrowUp, warna: 'var(--sage)' },
                                { opt: 'tetap', label: 'Tetap', Ikon: Equal, warna: 'var(--indigo)' },
                              ] as const).map(({ opt, label, Ikon, warna }) => {
                                const aktif = t.status === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => ubahTilawati(s.id, { status: aktif ? '' : opt }, true)}
                                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-bold transition-all duration-150 active:scale-[0.97] ${
                                      aktif
                                        ? 'text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]'
                                        : 'bg-transparent text-text-dim'
                                    }`}
                                    style={aktif ? { background: warna } : undefined}
                                  >
                                    <Ikon size={15} strokeWidth={2.6} />
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            </div>
          </TinggiHalus>
        )}
      </div>

      {/* Kalender "Disampaikan pada". Tanggal yang akan datang dimatikan
          -- aturan yang sama dengan penguncian baris: pelaksanaan hanya
          bisa dicatat untuk hari yang sudah berjalan. */}
      <TanggalPicker
        terbuka={tanggalPickerUid !== null}
        posisi={posisiTanggalBaris}
        nilai={baris.find((b) => b.uid === tanggalPickerUid)?.tanggalDisampaikan ?? todayStr()}
        onPilih={(v) => {
          if (tanggalPickerUid) ubahTanggalDisampaikan(tanggalPickerUid, v);
          setTanggalPickerUid(null);
        }}
        onTutup={() => setTanggalPickerUid(null)}
        tanggalNonaktif={(tglStr) =>
          tglStr > todayStr() ? { alasan: 'Belum terjadi' } : null
        }
      />

      {/* Bilah aksi menempel di bawah (2026-09-02, diminta owner).
          Sebelumnya tombol ini ikut menggulung di ujung halaman dgn
          gradien + bayangan hijau menyala (0 6px 16px rgba(5,150,105,.3))
          -- bayangan berwarna itu penanda paling cepat "dibuat asal".
          Sekarang: isi warna solid, bayangan nyaris tak ada, garis rambut
          pemisah di atas bilah, dan tombolnya MATI selama tidak ada yang
          berubah supaya tidak mengundang tekan-tekan tanpa guna. */}
      {kelasId !== '' && (
        <div className="bilah-aksi-bawah">
          <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-3 px-[18px] py-3">
            {statusSimpan === 'menyimpan' ? (
              <span className="text-[13px] text-text-dim">Menyimpan...</span>
            ) : adaTertinggal || statusSimpan === 'gagal' ? (
              <span className="text-[13px] font-semibold text-red">Ada yang belum tersimpan</span>
            ) : statusSimpan === 'tersimpan' ? (
              <span className="flex items-center gap-1.5 text-[13px] text-text-dim">
                <Check size={15} strokeWidth={2.6} className="text-sage" />
                Tersimpan{jamTersimpan ? ` · ${jamTersimpan}` : ''}
              </span>
            ) : (
              /* Keadaan istirahat: sekalian memberi tahu guru bahwa
                 memang TIDAK ADA tombol simpan yang harus ia cari. */
              <span className="text-[13px] text-text-faint">Perubahan tersimpan otomatis</span>
            )}
            {(adaTertinggal || statusSimpan === 'gagal') && statusSimpan !== 'menyimpan' && (
              <button
                type="button"
                onClick={simpanUlangYangTertinggal}
                className="shrink-0 cursor-pointer rounded-[var(--radius-button)] border-none bg-sage px-4 py-2 text-[13px] font-bold text-white active:scale-[0.98]"
              >
                Coba Lagi
              </button>
            )}
          </div>
        </div>
      )}
    </main>
    </TarikUntukSegarkan>
  );
}
