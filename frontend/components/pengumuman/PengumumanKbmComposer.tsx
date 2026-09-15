'use client';

/* Komposer "Pengumuman Jadwal KBM" -- porting SETIA dari generator app lama
   (Script_Main.html:8092-8365, generatePengumumanKBMText_): guru pilih
   tanggal, jadwal_kbm hari itu dirangkai otomatis jadi teks siap-tempel WA
   (format persis contoh owner -- salam, judul tebal, tiap sesi bernomor
   emoji, ikon 📍⏰🏠, catatan bernomor tebal di akhir), lalu bisa disalin
   atau disimpan sbg baris `pengumuman` (migrasi 20260823110000 baru
   membuka INSERT utk peran guru, scoped ke kelompoknya sendiri).

   Kategori "Cabe Rawit" dikelompokkan PER GURU (satu guru bisa py
   beberapa sesi/kelas sekaligus, app lama menyebutnya blok "Pengajar
   <nama>") -- kategori jenjang lain (Pra Remaja SMP/Remaja SMA/Muda-Mudi)
   satu blok PER SESI, urutan mengikuti KATEGORI_JENJANG (lib/kategori.ts,
   sama persis KATEGORI_JADWAL_UI_ app lama).

   Status Hadir/Diganti/Libur per sesi HANYA memengaruhi TEKS yang
   dihasilkan (persis pkbmOverrides_ app lama -- state sesi React, bukan
   ditulis ke jadwal_kbm) -- jadwal aslinya tidak tersentuh, guru yang mau
   membetulkan jadwal beneran tetap lewat layar /jadwal. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Copy, Check, Info, MessageCircle, Merge, Plus, Trash2, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KATEGORI_JENJANG } from '@/lib/kategori';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import GabungKelasModal from '@/components/kelas/GabungKelasModal';
import {
  muatKelasRingkas,
  muatGabungAktif,
  guruGiliran,
  type KelasRingkas,
  type GabungKelas,
} from '@/lib/kelasGabungGilir';
import {
  muatOverrideKelompok,
  buatCekNonaktif,
  type PetaOverride,
} from '@/lib/kalenderKelompok';
import { nonaktifAkhirPekanLibur } from '@/lib/liburNasional';

type Jadwal = {
  id: number;
  kategori: string;
  kelas: string;
  guru_id: number | null;
  jam_mulai: string;
  jam_selesai: string;
  ruangan: string | null;
  keterangan: string | null;
};
type Guru = { id: number; nama: string };
type StatusSesi = 'hadir' | 'diganti' | 'libur' | 'dialihkan';
type Override = { status: StatusSesi; penggantiId?: number; dialihkanKe?: string };

/* "Dialihkan" (2026-09-15, diminta owner): dua jenjang ini paling sering
   pindah ke kegiatan pengajian lain (Teks/Daerahan/Desa Kumpul/dst),
   BEDA dari "Diganti" (guru lain, kelas TETAP jalan spt biasa) -- di sini
   KELAS-nya sendiri yang tidak jalan, digantikan kegiatan lain sama
   sekali. Sengaja cuma dua jenjang ini (bukan semua kategori) -- jenjang
   lain jarang berubah, owner: "karena yang sering berubah hanya dua ini". */
const KATEGORI_BISA_DIALIHKAN = ['Pra Remaja SMP', 'Remaja SMA'];
/* Contoh isian, BUKAN daftar tertutup -- kolomnya tetap teks bebas
   (input drop-down), owner minta tetap fleksibel: "bisa di tambah
   kegiatan yang lain". Kolom <datalist> di bawah cuma bantu ketik cepat. */
const CONTOH_DIALIHKAN = [
  'Pengajian Teks',
  'Pengajian Daerahan',
  'Pengajian Desa Kumpul',
  'Pengajian Penerobosan Pusat',
  'Pengajian CAI',
];

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const EMOJI_ANGKA = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
/* Isi baku catatan -- mengikuti contoh owner 2026-08-28, tapi ditulis
   dengan ejaan penuh (bukan singkatan "Jgn"/"Utk") supaya terbaca rapi di
   grup WA wali murid. Tetap bisa diubah guru lewat kotak Catatan. */
const CATATAN_DEFAULT = [
  'Datang tepat waktu, jangan terlambat',
  'Memakai seragam TPQ',
  'Jangan lupa membawa uang untuk shodaqoh qurban & kas',
].join('\n');

function angkaEmoji(n: number) {
  return n <= EMOJI_ANGKA.length ? EMOJI_ANGKA[n - 1] : `${n}.`;
}
function formatJam(j: string) {
  return (j || '').slice(0, 5).replace(':', '.');
}
const dua = (n: number) => String(n).padStart(2, '0');
function iso(d: Date) {
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}
function hariIni() {
  return iso(new Date());
}

type CekNonaktif = (tglStr: string, tgl: Date) => { alasan: string; merah?: boolean } | null;

/* Tanggal aktif pertama mulai dari `mulai` (inklusif) -- maju sehari demi
   sehari sampai `cek` bilang tanggal itu tidak terkunci.

   Dibutuhkan karena TIDAK ADA satu pun kategori KBM yang berjalan
   Sabtu/Minggu (jadwal_kategori_hari: semuanya Senin-Jumat), sementara
   tanggal baku komposer ini dulu `hari ini` mentah. Akibatnya setiap
   kali layar dibuka di akhir pekan, jadwalnya kosong -- kartu sesi,
   nama pengajar, dan tombol Hadir/Diganti/Libur semuanya lenyap -- dan
   tanggal yang sedang terpilih itu justru tanggal yang kalendernya
   sendiri menolak dipilih. Buntu total, dan terbaca sbg "layarnya
   kembali ke model lama" (dilaporkan owner 2026-08-29, kena di guru
   MAUPUN admin kelompok).

   Batas 14 hari cuma penjaga: kalau sampai dua pekan penuh terkunci,
   kembalikan tanggal asalnya dan biarkan layar jujur bilang belum ada
   jadwal -- lebih baik daripada gelang tak berujung. */
function hariAktifTerdekat(mulai: string, cek: CekNonaktif): string {
  const d = new Date(mulai + 'T00:00:00');
  for (let i = 0; i < 14; i++) {
    const s = iso(d);
    if (!cek(s, d)) return s;
    d.setDate(d.getDate() + 1);
  }
  return mulai;
}

/* Status sesi baku + warna aktifnya. Label sengaja pendek ("Diganti",
   bukan "Izin - Diganti") supaya muat di seperempat lebar kartu pada HP
   sempit tanpa terpotong. "Dialihkan" TIDAK dimasukkan di sini -- cuma
   muncul di kartu kategori KATEGORI_BISA_DIALIHKAN (lihat pemakaiannya
   di render kartu sesi). */
const STATUS_SESI: { nilai: StatusSesi; label: string; bg: string }[] = [
  { nilai: 'hadir', label: 'Hadir', bg: 'bg-sage' },
  { nilai: 'diganti', label: 'Diganti', bg: 'bg-brass' },
  { nilai: 'libur', label: 'Libur', bg: 'bg-red' },
];
const STATUS_DIALIHKAN = { nilai: 'dialihkan' as const, label: 'Dialihkan', bg: 'bg-indigo' };

const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';
const KELAS_SELECT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-2.5 py-1.5 text-[12.5px] ' +
  'text-text focus:border-brass focus:outline-none';
const KELAS_TOMBOL_UTAMA =
  'flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] border border-brass ' +
  'bg-brass px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border ' +
  'bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:opacity-50';

export default function PengumumanKbmComposer({
  kelompokId,
  namaKelompok,
  onTersimpan,
  olehId = null,
}: {
  kelompokId: number;
  namaKelompok: string;
  onTersimpan?: () => void;
  /* Dipakai sbg kelas_gabung.dibuat_oleh saat guru menggabung kelas
     langsung dari sini (2026-09-15, diminta owner: "guru bisa eksekusi
     sendiri tanpa izin ke admin kelp"). Opsional -- kalau pemanggil tidak
     mengirim, GabungKelasModal cukup menyimpan NULL. */
  olehId?: string | null;
}) {
  /* Aturan akhir pekan + libur nasional itu statis (fungsi murni, tanpa
     DB), jadi tanggal awalnya sudah bisa benar SEKETIKA -- tidak ada
     kedipan "belum ada jadwal" lalu berpindah sendiri. Pengecualian
     per-kelompok baru datang belakangan & disempurnakan di efek di bawah. */
  const [tanggal, setTanggal] = useState(() =>
    hariAktifTerdekat(hariIni(), nonaktifAkhirPekanLibur),
  );
  /* Begitu pengguna memilih tanggal sendiri, penyesuaian otomatis berhenti
     selamanya -- termasuk kalau ia sengaja membuka tanggal lampau. */
  const dipilihManual = useRef(false);
  const [pickerTerbuka, setPickerTerbuka] = useState(false);
  const [posisiPicker, setPosisiPicker] = useState<PosisiPicker | null>(null);
  /* Kartu "Kegiatan KBM" bisa dilipat (2026-09-15, diminta owner: "kalau
     saya klik langsung terhide spt di fitur jurnal") -- pola & mulai
     dari `true` disalin dari KartuRiwayatTilawati.tsx. */
  const [kbmTerbuka, setKbmTerbuka] = useState(true);

  const [jadwalList, setJadwalList] = useState<Jadwal[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  /* guru_id yang sedang izin pada tanggal terpilih -- dipakai utk lencana
     "Sedang izin" di kartu sesi, supaya penyusun tahu KENAPA statusnya
     sudah otomatis "Diganti". */
  const [guruIzinSet, setGuruIzinSet] = useState<Set<number>>(new Set());
  const [catatan, setCatatan] = useState(CATATAN_DEFAULT);
  /* Kartu kegiatan tambahan di luar KBM (2026-09-15, diminta owner) --
     judul+isi teks bebas, TIDAK disimpan ke DB manapun (beda dari Catatan
     yang memang template dipakai ulang) -- cuma bagian dari pengumuman
     yang sedang disusun sesi ini, hilang begitu komponen di-mount ulang,
     sama spt override status sesi KBM. */
  type KegiatanLain = { id: string; judul: string; isi: string };
  const [kegiatanLain, setKegiatanLain] = useState<KegiatanLain[]>([]);
  function tambahKegiatan() {
    setKegiatanLain((prev) => [...prev, { id: crypto.randomUUID(), judul: '', isi: '' }]);
  }
  function ubahKegiatan(id: string, field: 'judul' | 'isi', nilai: string) {
    setKegiatanLain((prev) => prev.map((k) => (k.id === id ? { ...k, [field]: nilai } : k)));
  }
  function hapusKegiatan(id: string) {
    setKegiatanLain((prev) => prev.filter((k) => k.id !== id));
  }
  /* Jumlah baris jadwal_kbm kelompok ini TANPA saringan hari -- dipakai
     hanya utk membedakan "belum ada jadwal sama sekali" dari "ada, tapi
     tidak berjalan di hari ini" pada pesan layar kosong. */
  const [jumlahJadwalSemua, setJumlahJadwalSemua] = useState(0);

  /* Mulai dari `true`, BUKAN false (diperbaiki 2026-08-28, laporan owner
     "muncul flip satu kedipan tampilan lama"). Dgn nilai awal false,
     render pertama terjadi saat jadwalList masih [] dan pemuatan belum
     dimulai -- cabang "Belum ada Jadwal KBM di tanggal ini" sempat
     terlukis satu frame, baru berganti "Memuat jadwal..." lalu isi
     sebenarnya. Itu yang terbaca sebagai kedipan tampilan lama. */
  const [loading, setLoading] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* "Gabung Kelas" langsung dari Pengumuman (2026-09-15, diminta owner) --
     dulu cuma bisa lewat Data Kelas (admin_kelompok). RLS `kelas_gabung`
     kini juga menerima peran guru (migrasi 20260915100000), scoped ke
     kelompoknya sendiri -- BEBAS kelas mana pun ke kelas induk mana pun
     di kelompok itu, tidak dibatasi ke kelas yang dia ampu (pilihan owner).
     Modalnya sendiri (GabungKelasModal) tidak berubah sama sekali, cuma
     dipasang di sini juga. */
  const [kelasOpsi, setKelasOpsi] = useState<
    { id: number; nama: string; jam_mulai: string; jam_selesai: string; ruangan: string }[]
  >([]);
  const [gabungTerbuka, setGabungTerbuka] = useState(false);

  useEffect(() => {
    supabase
      .from('guru')
      .select('id, nama')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => setGuruList(data ?? []));
    supabase
      .from('kelas')
      .select('id, nama, jam_mulai, jam_selesai, ruangan')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => setKelasOpsi(data ?? []));
  }, [kelompokId]);

  /* Muat template Catatan tersimpan milik kelompok ini (2026-09-15,
     perbaikan bug: sebelumnya `catatan` cuma state lokal, jadi "Simpan
     Pengumuman" tidak benar-benar menyimpan ISIAN catatan -- kembali ke
     CATATAN_DEFAULT tiap refresh). Belum pernah disimpan (baris belum
     ada) -> tetap pakai CATATAN_DEFAULT, bukan kosong. */
  useEffect(() => {
    let batal = false;
    supabase
      .from('pengumuman_catatan')
      .select('catatan')
      .eq('kelompok_id', kelompokId)
      .maybeSingle()
      .then(({ data }) => {
        if (!batal && data?.catatan) setCatatan(data.catatan);
      });
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  /* Kalender dikunci sama persis dgn Input Kehadiran (diminta owner
     2026-08-28): Sabtu/Minggu & tanggal merah nasional tidak bisa dipilih,
     DITUMPANGI pengecualian per kelompok (kalender_kelompok) -- tanggal
     yang ditandai "aktif" tetap boleh, yang ditandai "libur" ikut terkunci
     merah. Memakai helper bersama buatCekNonaktif, BUKAN aturan sendiri,
     supaya tidak pernah menyimpang dari layar absensi. */
  const [overrideKelompok, setOverrideKelompok] = useState<PetaOverride>(new Map());
  useEffect(() => {
    if (!kelompokId) return;
    let batal = false;
    muatOverrideKelompok(kelompokId).then((peta) => {
      if (batal) return;
      setOverrideKelompok(peta);
      /* Penyempurnaan tanggal awal: kelompok ini mungkin meliburkan hari
         kerja biasa (mis. "Pengajian Penerobosan"). Tanggal statis di
         atas tidak tahu-menahu soal itu, jadi dihitung ulang begitu
         petanya tiba. Biasanya hasilnya sama persis -> setTanggal
         dilewati React, tidak ada pemuatan ulang. */
      if (dipilihManual.current) return;
      const cek = buatCekNonaktif(peta);
      setTanggal((kini) => hariAktifTerdekat(kini, cek));
    });
    return () => {
      batal = true;
    };
  }, [kelompokId]);
  const cekNonaktif = useMemo(() => buatCekNonaktif(overrideKelompok), [overrideKelompok]);

  /* Jadwal dicocokkan lewat HARI AKTIF kategorinya, BUKAN `tanggal` persis
     (diperbaiki 2026-08-28, laporan owner "masih belum muncul").

     Duduk perkaranya: `jadwal_kbm` memang jadwal BERULANG per kategori --
     layar /jadwal sengaja membiarkan kolom `hari`/`tanggal` kosong (lihat
     komentar di app/jadwal/page.tsx), dan hari mana saja sebuah kategori
     berjalan disimpan terpisah di `jadwal_kategori_hari.hari_aktif`
     ("Senin,Selasa,..."). Versi lama komposer ini menyaring
     `.eq('tanggal', tanggal)`, sehingga hanya cocok untuk baris yang
     kebetulan punya tanggal persis -- di produksi cuma ada 7 baris warisan
     migrasi bertanggal 20 Juli 2026, jadi di tanggal LAIN hasilnya selalu
     kosong dan pengumuman tidak pernah bisa dibuat.

     Baris dgn `tanggal` terisi tetap ikut kalau tanggalnya sama persis
     (jalur sesi sekali-jalan), di-dedup lewat id supaya tidak dobel. */
  const muat = useCallback(async () => {
    if (!tanggal) return;
    setLoading(true);
    setError(null);
    try {
      const namaHari = NAMA_HARI[new Date(tanggal + 'T00:00:00').getDay()];

      const [
        { data: dJadwal, error: e1 },
        { data: dHari, error: e2 },
        hasilIzin,
        daftarKelas,
        gabungAktif,
      ] = await Promise.all([
          supabase
            .from('jadwal_kbm')
            .select('id, kategori, kelas, kelas_id, guru_id, jam_mulai, jam_selesai, ruangan, keterangan, tanggal')
            .eq('kelompok_id', kelompokId)
            .order('jam_mulai'),
          supabase
            .from('jadwal_kategori_hari')
            .select('hari_aktif, kategori_kbm(nama)')
            .eq('kelompok_id', kelompokId),
          /* Guru yang sedang izin pada tanggal itu. Lewat RPC, BUKAN
             SELECT langsung: policy guru_izin membatasi guru ke barisnya
             sendiri, sedangkan penyusun pengumuman justru perlu tahu izin
             REKANNYA. RPC-nya sengaja cuma mengembalikan guru_id --
             alasan izin tetap tertutup (migrasi 20260828180000).
             Galatnya SENGAJA tidak dilempar (supabase-js mengembalikan
             {data,error}, tidak melempar): kalau migrasinya belum jalan,
             sisa layar ini tetap berfungsi penuh -- cuma penandaan
             otomatisnya yang absen. */
          supabase.rpc('guru_izin_pada_tanggal', {
            p_kelompok_id: kelompokId,
            p_tanggal: tanggal,
          }),
          /* Data Kelas + penggabungan aktif. Sejak migrasi 20260828200000
             `kelas` adalah SUMBER KEBENARAN utk "siapa yang mengajar" --
             jadwal_kbm.guru_id cuma cadangan utk baris lama yang belum
             tertaut. Di-catch supaya layar tetap hidup kalau migrasinya
             belum dijalankan. */
          muatKelasRingkas(kelompokId).catch(() => [] as KelasRingkas[]),
          muatGabungAktif(kelompokId, tanggal).catch(() => new Map<number, GabungKelas>()),
        ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);

      /* Cukup TAHU siapa yang izin -- alasannya tidak dipakai sama sekali
         (owner 2026-08-28: "sampaikan saja guru sedang izin, tidak perlu
         detailnya"). Fungsi RPC-nya memang juga mengembalikan jenis &
         kategori, tapi sengaja diabaikan di sini supaya tidak ada jalan
         alasan izin bocor ke grup WA wali murid. */
      const guruIzin = new Set<number>(
        ((hasilIzin?.data ?? []) as { guru_id: number }[]).map((r) => r.guru_id),
      );
      setGuruIzinSet(guruIzin);

      /* Kategori yang berjalan pada hari itu. Kalau tabel hari-aktifnya
         belum diisi sama sekali, JANGAN diam-diam mengosongkan jadwal --
         perlakukan semua kategori sebagai aktif, supaya layar ini tetap
         berguna dan bukan malah kosong tanpa penjelasan. */
      const barisHari = (dHari ?? []) as { hari_aktif: string | null; kategori_kbm: { nama: string } | { nama: string }[] | null }[];
      const aktifHariIni = new Set<string>();
      for (const b of barisHari) {
        const k = Array.isArray(b.kategori_kbm) ? b.kategori_kbm[0] : b.kategori_kbm;
        if (!k?.nama) continue;
        const daftar = (b.hari_aktif ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        if (daftar.includes(namaHari)) aktifHariIni.add(k.nama);
      }
      const adaAturanHari = barisHari.length > 0;

      const semua = (dJadwal ?? []) as (Jadwal & { tanggal: string | null; kelas_id: number | null })[];
      setJumlahJadwalSemua(semua.length);
      const terpilih = semua.filter(
        (j) => j.tanggal === tanggal || !adaAturanHari || aktifHariIni.has(j.kategori),
      );

      const petaKelas = new Map<number, KelasRingkas>(daftarKelas.map((k) => [k.id, k]));

      /* Terapkan Data Kelas ke tiap baris jadwal (diminta owner
         2026-08-28: "edit Data Kelas otomatis terintegrasi ke pengumuman"):

         1. GILIR GURU -- kalau kelasnya punya guru kedua + titik acuan,
            nama yang tampil adalah yang benar-benar giliran pada tanggal
            itu, bukan selalu guru utama.
         2. GABUNG KELAS -- kelas yang sedang ikut ke kelas induk TIDAK
            lagi muncul sebagai sesi tersendiri; namanya ditempelkan ke
            sesi induknya ("Kls 4 & Pra Remaja SMP"), dan jam/ruangan
            memakai yang ditentukan admin saat menggabung.

         Format teks WA-nya sendiri TIDAK berubah sama sekali (diminta
         owner) -- yang berubah cuma ISI baris kelas/pengajar/jam. */
      /* BUG (2026-09-14, ditemukan owner: "yang gabung kelas 4 dan kelas
         3 saat ini hanya muncul info nya kelas 4 saja") -- versi lama
         mengambil nama kelas yang IKUT GABUNG dari baris `jadwal_kbm`
         MILIK KELAS ITU SENDIRI (loop `terpilih`), padahal kelas yang
         ikut gabung MEMANG SENGAJA tidak selalu punya baris jadwal
         sendiri (case Kelp Petemon: kelas "3" gabung ke "4" tanpa
         jadwal_kbm terpisah) -- namanya jadi TIDAK PERNAH ketemu, sesi
         induk tampil polos tanpa "& <nama>". Diperbaiki: ambil LANGSUNG
         dari `gabungAktif` (SEMUA hubungan gabung yang aktif tanggal
         ini, sudah dimuat via muatGabungAktif di atas) + `petaKelas`
         (nama live) -- TIDAK bergantung sama sekali pada ada/tidaknya
         baris jadwal_kbm milik kelas yang digabung. */
      const namaKelasGabung = new Map<number, string[]>();
      for (const [kelasId, g] of gabungAktif) {
        const nama = petaKelas.get(kelasId)?.nama;
        if (!nama) continue;
        const arr = namaKelasGabung.get(g.kelas_induk_id) ?? [];
        arr.push(nama);
        namaKelasGabung.set(g.kelas_induk_id, arr);
      }

      const daftar: Jadwal[] = [];
      for (const j of terpilih) {
        /* Kelas yang sedang bergabung: dilewati, sudah menempel ke induk. */
        if (j.kelas_id != null && gabungAktif.has(j.kelas_id)) continue;

        const kelasData = j.kelas_id != null ? petaKelas.get(j.kelas_id) : undefined;
        const ikut = j.kelas_id != null ? namaKelasGabung.get(j.kelas_id) : undefined;
        /* Nama kelas SESI ITU SENDIRI (2026-09-14, diminta owner: "data
           yang tampil di pengumuman saat ini adalah data yang lama") --
           WAJIB dari `kelas.nama` LIVE (petaKelas via kelas_id), BUKAN
           `j.kelas` (teks beku disalin ke jadwal_kbm saat baris itu
           dibuat, tidak ikut ter-update saat admin merestrukturisasi
           Data Kelas, mis. "2 & 3A" dipecah jadi "2A"/"2B"/"3&4"). Baris
           gabungan (`ikut`, line di atas) SUDAH benar pakai
           `petaKelas.get(...)?.nama` sejak awal -- BUG-nya nama kelas
           UTAMA di sini yang masih polos `j.kelas`, tidak konsisten.
           Fallback ke `j.kelas` cuma utk baris lama yang `kelas_id`-nya
           belum tertaut sama sekali. */
        const namaKelasIni = kelasData?.nama ?? j.kelas;
        /* Jam & ruangan gabungan ditentukan admin -- diambil dari baris
           kelas_gabung mana pun yang menunjuk ke induk ini. */
        const aturan =
          j.kelas_id != null
            ? [...gabungAktif.values()].find((g) => g.kelas_induk_id === j.kelas_id)
            : undefined;

        daftar.push({
          id: j.id,
          kategori: j.kategori,
          kelas: ikut && ikut.length > 0 ? `${namaKelasIni} & ${ikut.join(' & ')}` : namaKelasIni,
          guru_id: kelasData ? guruGiliran(kelasData, tanggal) : j.guru_id,
          jam_mulai: (ikut && aturan?.jam_mulai) || j.jam_mulai,
          jam_selesai: (ikut && aturan?.jam_selesai) || j.jam_selesai,
          ruangan: (ikut && aturan?.ruangan) || j.ruangan,
          keterangan: j.keterangan,
        });
      }
      setJadwalList(daftar);

      /* Sesi milik guru yang sedang izin langsung disetel "Diganti" --
         penyusun pengumuman tinggal memilih penggantinya, tidak perlu
         ingat sendiri siapa yang izin hari itu. Tetap bisa diubah manual
         (mis. gurunya batal izin) karena ini cuma nilai AWAL override. */
      const awal: Record<number, Override> = {};
      for (const j of daftar) {
        if (j.guru_id != null && guruIzin.has(j.guru_id)) awal[j.id] = { status: 'diganti' };
      }
      setOverrides(awal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat jadwal.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tanggal]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaGuru = useCallback(
    (id: number | null) => guruList.find((g) => g.id === id)?.nama ?? '-',
    [guruList]
  );

  function setStatus(id: number, status: StatusSesi) {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        status,
        penggantiId: status === 'diganti' ? prev[id]?.penggantiId : undefined,
        dialihkanKe: status === 'dialihkan' ? prev[id]?.dialihkanKe : undefined,
      },
    }));
  }
  function setPengganti(id: number, penggantiId: number) {
    setOverrides((prev) => ({ ...prev, [id]: { status: 'diganti', penggantiId } }));
  }
  function setDialihkanKe(id: number, dialihkanKe: string) {
    setOverrides((prev) => ({ ...prev, [id]: { status: 'dialihkan', dialihkanKe } }));
  }

  const jadwalUrut = useMemo(
    () =>
      [...jadwalList].sort((a, b) => {
        const ia = KATEGORI_JENJANG.indexOf(a.kategori);
        const ib = KATEGORI_JENJANG.indexOf(b.kategori);
        if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.jam_mulai.localeCompare(b.jam_mulai);
      }),
    [jadwalList]
  );

  const jumlahBelumAdaPengganti = useMemo(
    () =>
      jadwalUrut.filter((j) => {
        const ov = overrides[j.id];
        return ov?.status === 'diganti' && !ov.penggantiId;
      }).length,
    [jadwalUrut, overrides],
  );
  const jumlahDialihkanBelumDiisi = useMemo(
    () =>
      jadwalUrut.filter((j) => {
        const ov = overrides[j.id];
        return ov?.status === 'dialihkan' && !ov.dialihkanKe?.trim();
      }).length,
    [jadwalUrut, overrides],
  );

  const tanggalObj = tanggal ? new Date(tanggal + 'T00:00:00') : null;
  const tanggalLabel = tanggalObj
    ? `${NAMA_HARI[tanggalObj.getDay()]}, ${tanggalObj.getDate()} ${NAMA_BULAN[tanggalObj.getMonth()]} ${tanggalObj.getFullYear()}`
    : '(pilih tanggal)';

  /* Layar kosong WAJIB menjelaskan dirinya sendiri (2026-08-29, setelah
     owner dua kali melaporkan "pengumuman kembali ke model lama").

     Duduk perkaranya: dulu cabang kosong cuma menulis "Belum ada Jadwal
     KBM di tanggal ini" -- kalimat buta yang tidak membedakan "hari ini
     memang bukan hari KBM" dari "datanya hilang". Dibuka di hari Sabtu,
     layar ini kosong melompong dan terbaca sebagai aplikasi rusak /
     tampilan lama, padahal datanya sehat sempurna.

     Tanggal bakunya sendiri sudah digeser ke hari aktif terdekat, jadi
     kasus Sabtu tidak muncul lagi dengan sendirinya. Tapi pengguna tetap
     BISA memilih tanggal terkunci, dan jadwalnya tetap bisa kosong karena
     sebab lain -- jadi tiap sebab disebut terang-terangan berikut ke mana
     harus pergi utk membetulkannya. */
  const alasanKosong = useMemo(() => {
    if (jadwalUrut.length > 0) return null;
    const d = tanggal ? new Date(tanggal + 'T00:00:00') : null;
    const terkunci = d ? cekNonaktif(tanggal, d) : null;
    if (terkunci)
      return `${terkunci.alasan} — tidak ada KBM di tanggal ini. Pilih tanggal lain lewat kalender di atas.`;
    if (jumlahJadwalSemua === 0)
      return 'Kelompok ini belum punya Jadwal KBM sama sekali. Jadwalnya disusun di menu Jadwal, bukan di layar ini.';
    return 'Tidak ada kategori KBM yang berjalan di hari ini. Hari aktif tiap kategori diatur di menu Jadwal.';
  }, [jadwalUrut.length, tanggal, cekNonaktif, jumlahJadwalSemua]);

  const teks = useMemo(() => {
    type Efektif = Jadwal & {
      penggantiDari?: string;
      /* Guru yang digantikan memang sedang izin -- melengkapi penanda
         "menggantikan X" yang sudah ada, BUKAN baris baru: format teks WA
         tidak boleh berubah (diminta owner). */
      sedangIzin?: boolean;
      menungguPengganti?: boolean;
      /* "Dialihkan" (2026-09-15) -- kelas TIDAK jalan spt biasa, dipindah
         total ke kegiatan lain (Pengajian Teks/Daerahan/dst). Beda dari
         "Diganti": guru yang berubah, "Dialihkan": kegiatannya berubah. */
      dialihkanKe?: string;
      dialihkanKosong?: boolean;
    };
    const efektif: Efektif[] = [];
    for (const j of jadwalUrut) {
      const ov = overrides[j.id];
      if (ov?.status === 'libur') continue;
      if (ov?.status === 'diganti' && ov.penggantiId) {
        efektif.push({
          ...j,
          guru_id: ov.penggantiId,
          penggantiDari: namaGuru(j.guru_id),
          sedangIzin: j.guru_id != null && guruIzinSet.has(j.guru_id),
        });
      } else if (ov?.status === 'diganti') {
        /* Ditandai diganti tapi penggantinya BELUM dipilih. Jangan diam-
           diam mencetak nama guru yang justru sedang izin -- wali murid
           akan menunggu orang yang tidak datang. Ditandai terang-terangan
           supaya penyusun sadar pengumumannya belum siap dikirim. */
        efektif.push({ ...j, menungguPengganti: true });
      } else if (ov?.status === 'dialihkan') {
        const namaKegiatan = ov.dialihkanKe?.trim();
        efektif.push(namaKegiatan ? { ...j, dialihkanKe: namaKegiatan } : { ...j, dialihkanKosong: true });
      } else {
        efektif.push(j);
      }
    }

    const baris: string[] = [];
    baris.push('Assalamualaikum Wr. Wb.');
    baris.push('');
    baris.push(`*Pengumuman Jadwal KBM Generus ${namaKelompok}*`);
    baris.push('');
    baris.push(`📌 *${tanggalLabel}*`);

    let nomor = 0;

    const cabeRawit = efektif.filter((j) => j.kategori === 'Cabe Rawit');
    const perGuru: { guruId: number | null; guruNama: string; sesi: Efektif[] }[] = [];
    for (const j of cabeRawit) {
      let g = perGuru.find((x) => x.guruId === j.guru_id);
      if (!g) {
        g = { guruId: j.guru_id, guruNama: namaGuru(j.guru_id), sesi: [] };
        perGuru.push(g);
      }
      g.sesi.push(j);
    }
    for (const g of perGuru) {
      nomor += 1;
      baris.push('');
      baris.push(`${angkaEmoji(nomor)} *Pengajar ${g.guruNama}*`);
      /* Sesi milik satu pengajar dirapatkan TANPA baris kosong di antaranya
         (contoh owner 2026-08-28) -- satu blok pengajar terbaca sebagai
         satu kesatuan di WhatsApp, jarak cuma antar-pengajar. */
      g.sesi.forEach((j, i) => {
        baris.push(
          `📍 *Sesi ${i + 1} : Kls ${j.kelas}*${j.penggantiDari ? ` _(menggantikan ${j.penggantiDari}${j.sedangIzin ? ` yang sedang izin` : ''})_` : j.menungguPengganti ? ` _(pengajar izin -- pengganti belum ditentukan)_` : ''}`
        );
        baris.push(
          `⏰ Jam : ${formatJam(j.jam_mulai)} - ${formatJam(j.jam_selesai)} WIB${j.keterangan ? ' (' + j.keterangan + ')' : ''}`
        );
        baris.push(`*Tempat : ${j.ruangan ?? '-'}*`);
      });
    }

    for (const kat of KATEGORI_JENJANG.filter((k) => k !== 'Cabe Rawit')) {
      for (const j of efektif.filter((x) => x.kategori === kat)) {
        nomor += 1;
        baris.push('');
        baris.push(`${angkaEmoji(nomor)} *Kelas ${kat}*`);
        if (j.dialihkanKe) {
          baris.push(`📍 *Dialihkan ke ${j.dialihkanKe}*`);
        } else if (j.dialihkanKosong) {
          baris.push(`📍 *Dialihkan -- kegiatan belum diisi*`);
        } else {
          baris.push(
            j.menungguPengganti
              ? `📍 *Pengajar : _(izin -- pengganti belum ditentukan)_*`
              : `📍 *Pengajar ${namaGuru(j.guru_id)}*${j.penggantiDari ? ` _(menggantikan ${j.penggantiDari}${j.sedangIzin ? ` yang sedang izin` : ''})_` : ''}`
          );
          baris.push(
            `⏰ Jam : ${formatJam(j.jam_mulai)} - ${formatJam(j.jam_selesai)} WIB${j.keterangan ? ' (' + j.keterangan + ')' : ''}`
          );
          baris.push(`*Tempat : ${j.ruangan ?? '-'}*`);
        }
      }
    }

    /* Kartu kegiatan tambahan -- lanjut penomoran dari sesi KBM di atas,
       jadi terbaca satu daftar kegiatan yang sama, bukan dua daftar
       terpisah. Kartu kosong (judul & isi kosong dua-duanya) dilewati,
       tidak ikut membuat nomor kosong di teks WA. */
    for (const k of kegiatanLain) {
      const judul = k.judul.trim();
      const isi = k.isi.trim();
      if (!judul && !isi) continue;
      nomor += 1;
      baris.push('');
      baris.push(`${angkaEmoji(nomor)} *${judul || 'Kegiatan'}*`);
      if (isi) isi.split('\n').forEach((baris_) => baris.push(baris_));
    }

    if (nomor === 0) {
      baris.push('');
      baris.push('_(Belum ada Jadwal KBM di tanggal ini)_');
    }

    const catatanBaris = catatan
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (catatanBaris.length > 0) {
      baris.push('');
      baris.push('*Note :*');
      catatanBaris.forEach((n, i) => baris.push(`*${i + 1}. ${n}*`));
    }

    baris.push('');
    baris.push('Alhamdulillahi jaza kumullohu khoiro 🙏🏻');
    baris.push('');
    baris.push('Wassalamualaikum Wr. Wb.');

    return baris.join('\n');
  }, [jadwalUrut, overrides, namaGuru, namaKelompok, tanggalLabel, catatan, guruIzinSet, kegiatanLain]);

  async function salin() {
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      setError('Gagal menyalin otomatis -- salin manual dari kotak pratinjau di bawah.');
    }
  }

  /* Bagikan lewat WhatsApp (2026-09-14, diminta owner: "kak dina bisa
     share jadwal dari aplikasi terserah mau dikirimkan ke siapa, tanpa
     biaya, proses sangat cepat, dan tidak berpengaruh ke supabase") --
     skema URL "wa.me/?text=..." bawaan WhatsApp: TANPA nomor tujuan,
     jadi WhatsApp sendiri yang menampilkan pemilih kontak/grup ke siapa
     mau dikirim. 100% klien, TIDAK ada panggilan Supabase sama sekali --
     terpisah total dari `simpan()` (yang menulis ke tabel `pengumuman`).

     ⚠️ `location.href`, BUKAN `window.open(..., '_blank')` (diminta
     owner 2026-09-14: "loading nya lama banget") -- app ini PWA
     `display: 'standalone'` (app/manifest.ts). Di PWA standalone TIDAK
     ADA konsep "tab": `window.open` dgn `_blank` terpaksa membuka
     proses/jendela browser BARU dari nol, kelihatan lambat (bisa
     beberapa detik). `wa.me` justru dirancang sbg App Link/deep-link
     ke aplikasi WhatsApp -- itu cuma langsung & cepat kalau navigasinya
     di WINDOW YANG SAMA, spy OS bisa langsung mengambil-alih ke app
     WhatsApp tanpa basa-basi buka tab baru dulu. Tidak ada risiko
     kehilangan data krn ini bukan form submit -- teksnya sudah selesai
     disusun & sekadar diserahkan ke WhatsApp. */
  function bagikanWhatsapp() {
    window.location.href = `https://wa.me/?text=${encodeURIComponent(teks)}`;
  }

  async function simpan() {
    setMenyimpan(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('pengumuman').insert({
        kelompok_id: kelompokId,
        judul: `Jadwal KBM ${tanggalLabel}`,
        isi: teks,
        tanggal,
      });
      if (err) throw new Error(err.message);
      /* Simpan template Catatan-nya juga (bukan cuma teks jadi di atas) --
         supaya isian ini tetap ada lain kali komposer dibuka, TIDAK
         kembali ke CATATAN_DEFAULT bawaan kode (bug dilaporkan owner
         2026-09-15). Galat di sini SENGAJA tidak menggagalkan simpan
         pengumuman utamanya -- cukup dicatat, jangan sampai guru pikir
         pengumumannya gagal tersimpan gara-gara catatan. */
      const { error: errCatatan } = await supabase
        .from('pengumuman_catatan')
        .upsert({ kelompok_id: kelompokId, catatan, diubah_oleh: olehId });
      if (errCatatan) console.error('Gagal menyimpan template catatan:', errCatatan.message);
      setPesan('Pengumuman tersimpan.');
      onTersimpan?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Kartu "Kegiatan KBM" (2026-09-15, diminta owner) -- membungkus
         penyusun jadwal KBM yang sudah ada supaya layar Pengumuman siap
         menaungi BEBERAPA jenis kegiatan sekaligus (KBM cuma yang
         pertama). Catatan/Pratinjau/tombol aksi di bawah TETAP di luar
         kartu ini -- itu milik pengumuman GABUNGAN semua kegiatan,
         bukan cuma KBM. */}
      <div className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
        <button
          type="button"
          onClick={() => setKbmTerbuka((v) => !v)}
          className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent p-0 text-left"
        >
          <span className="text-[14px] font-extrabold text-text">Kegiatan KBM</span>
          <ChevronDown
            size={16}
            className={`shrink-0 text-text-faint transition-transform duration-150 ${kbmTerbuka ? 'rotate-180' : ''}`}
          />
        </button>
        {kbmTerbuka && (
        <div className="mt-3 flex flex-col gap-4">
      <div>
        <label className={KELAS_LABEL}>Tanggal KBM</label>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPosisiPicker({ top: r.bottom + 6, right: window.innerWidth - r.right });
            setPickerTerbuka(true);
          }}
          className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text"
        >
          <span>{tanggalLabel}</span>
          <Calendar size={16} className="text-text-dim" />
        </button>
        <TanggalPicker
          terbuka={pickerTerbuka}
          posisi={posisiPicker}
          nilai={tanggal}
          onPilih={(v) => {
            dipilihManual.current = true;
            setTanggal(v);
          }}
          onTutup={() => setPickerTerbuka(false)}
          tanggalNonaktif={cekNonaktif}
        />
      </div>

      {/* Pemicu Gabung Kelas -- ditaruh di bawah tanggal, sebelum daftar
          sesi, supaya guru yang baru sadar jamnya perlu diubah tidak perlu
          scroll jauh. Efeknya baru terlihat di pratinjau setelah `muat()`
          dipanggil ulang (lihat onTutup di bawah). */}
      <button
        type="button"
        onClick={() => setGabungTerbuka(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:bg-border"
      >
        <Merge size={14} /> Gabung Kelas & Ubah Jam
      </button>

      {/* Skeleton berbentuk kartu sesi, bukan teks "Memuat..." polos --
          tingginya mendekati kartu asli sehingga isi di bawahnya tidak
          melompat saat data datang (sumber kedipan kedua). */}
      {loading && <SkeletonKartuList jumlah={3} />}

      {!loading && jadwalUrut.length === 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-border bg-panel-2 px-3.5 py-3 text-[13px] text-text-dim">
          <Info size={15} className="mt-px shrink-0 text-text-faint" />
          <span>{alasanKosong}</span>
        </div>
      )}

      {!loading && jadwalUrut.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {jadwalUrut.map((j) => {
            const ov = overrides[j.id];
            const status = ov?.status ?? 'hadir';
            /* Tombol "Dialihkan" cuma utk dua jenjang yang sering pindah
               kegiatan (owner 2026-09-15) -- jenjang lain tetap 3 status
               spt semula. */
            const opsiStatus = KATEGORI_BISA_DIALIHKAN.includes(j.kategori)
              ? [...STATUS_SESI, STATUS_DIALIHKAN]
              : STATUS_SESI;
            return (
              <div key={j.id} className="rounded-[var(--radius)] border border-border bg-panel p-3">
                {/* Info kelas: 3 baris ber-truncate, TIDAK lagi berebut ruang
                    dgn kontrol status. Sebelumnya info & <select> berdampingan
                    dalam satu baris flex -- blok kiri tanpa `min-w-0` (jadi
                    tidak bisa menyusut) melawan <select> `shrink-0` yang
                    lebarnya dipaksa teks opsi terpanjang, hasilnya kartu
                    melebar keluar layar HP (dilaporkan owner 2026-08-28). */}
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-text">
                    {j.kategori === 'Cabe Rawit' ? `Kelas ${j.kelas}` : `Kelas ${j.kategori}`}
                  </div>
                  <div className="flex items-center gap-1.5 text-[12px] text-text-dim">
                    <span className="truncate">{namaGuru(j.guru_id)}</span>
                    {j.guru_id != null && guruIzinSet.has(j.guru_id) && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[rgba(217,119,6,0.12)] px-1.5 py-px text-[9.5px] font-bold text-brass">
                        SEDANG IZIN
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[11.5px] text-text-faint">
                    {formatJam(j.jam_mulai)}-{formatJam(j.jam_selesai)} &middot; {j.ruangan ?? '-'}
                  </div>
                </div>

                {/* Segmented 3-status selebar kartu -- menggantikan <select>
                    sempit di pojok. Lebarnya ditentukan kartu (flex-1 per
                    tombol), bukan panjang teks opsi, jadi tidak mungkin
                    melebar lagi seberapa pun sempit layarnya. */}
                <div className="mt-2.5 flex gap-1 rounded-[var(--radius)] border border-border bg-panel-2 p-0.5">
                  {opsiStatus.map((s) => {
                    const on = status === s.nilai;
                    return (
                      <button
                        key={s.nilai}
                        type="button"
                        onClick={() => setStatus(j.id, s.nilai)}
                        className={`min-w-0 flex-1 cursor-pointer truncate rounded-[calc(var(--radius)-3px)] border-none px-1 py-1.5 text-[11.5px] font-bold transition-colors ${
                          on ? `${s.bg} text-white` : 'bg-transparent text-text-dim'
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                {status === 'diganti' && (
                  <select
                    className={KELAS_SELECT + ' mt-2'}
                    value={ov?.penggantiId ?? ''}
                    onChange={(e) => setPengganti(j.id, Number(e.target.value))}
                  >
                    <option value="">-- Digantikan oleh --</option>
                    {guruList
                      .filter((g) => g.id !== j.guru_id)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nama}
                        </option>
                      ))}
                  </select>
                )}
                {status === 'dialihkan' && (
                  <>
                    {/* Teks BEBAS, bukan pilihan tertutup (diminta owner:
                        "berikan juga editable atau fleksible bisa di
                        tambah kegiatan yang lain") -- <datalist> cuma
                        bantu ketik cepat lewat contoh yang sudah ada,
                        tidak membatasi isian ke daftar itu saja. */}
                    <input
                      list={`dialihkan-opsi-${j.id}`}
                      className={KELAS_SELECT + ' mt-2'}
                      placeholder="Nama kegiatan pengganti, mis. Pengajian Teks"
                      value={ov?.dialihkanKe ?? ''}
                      onChange={(e) => setDialihkanKe(j.id, e.target.value)}
                    />
                    <datalist id={`dialihkan-opsi-${j.id}`}>
                      {CONTOH_DIALIHKAN.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
        </div>
        )}
      </div>

      {/* Kartu kegiatan TAMBAHAN, bebas isi (2026-09-15, diminta owner:
         "berikan juga tombol utk menambah card yang lain editable dan
         fleksible") -- beda dari kartu Kegiatan KBM di atas yang datanya
         otomatis dari jadwal_kbm, ini judul+isi teks bebas sepenuhnya,
         utk kegiatan yang belum (atau tidak akan pernah) punya komposer
         khusus sendiri. Ikut masuk ke pengumuman gabungan lewat `teks`
         di bawah, bernomor lanjutan dari sesi KBM. TIDAK disimpan ke DB
         apa pun -- isinya cuma bagian dari pengumuman yang sedang disusun
         SAAT INI, bukan template yang dipakai ulang spt Catatan. */}
      {kegiatanLain.map((k) => (
        <div key={k.id} className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
          <div className="mb-2 flex items-center gap-2">
            <input
              className={KELAS_SELECT + ' flex-1 font-bold'}
              placeholder="Nama kegiatan"
              value={k.judul}
              onChange={(e) => ubahKegiatan(k.id, 'judul', e.target.value)}
            />
            <button
              type="button"
              aria-label="Hapus kartu kegiatan"
              onClick={() => hapusKegiatan(k.id)}
              className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-red active:opacity-60"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <textarea
            rows={3}
            className={KELAS_SELECT + ' py-2.5'}
            placeholder="Isi pengumuman kegiatan ini"
            value={k.isi}
            onChange={(e) => ubahKegiatan(k.id, 'isi', e.target.value)}
          />
        </div>
      ))}

      <div>
        <label className={KELAS_LABEL}>Catatan (baris terpisah, otomatis diberi nomor)</label>
        <textarea
          rows={3}
          className={KELAS_SELECT + ' py-2.5'}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
        />
      </div>

      {/* Penjaga terakhir sebelum pengumuman disalin: ada sesi yang
          gurunya izin tapi penggantinya belum dipilih. Tanpa peringatan
          ini, teksnya tetap tersalin dan wali murid membaca "pengganti
          belum ditentukan" tanpa ada yang sadar. */}
      {jumlahBelumAdaPengganti > 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-[rgba(217,119,6,0.3)] bg-[rgba(217,119,6,0.06)] px-3.5 py-2.5 text-[12px] font-semibold text-brass">
          <span className="shrink-0">⚠️</span>
          <span>
            {jumlahBelumAdaPengganti} sesi gurunya sedang izin dan penggantinya belum dipilih.
            Tentukan pengganti dulu sebelum pengumuman dikirim.
          </span>
        </div>
      )}
      {/* Sama polanya dgn peringatan pengganti di atas -- sesi ditandai
          Dialihkan tapi kolom nama kegiatannya masih kosong. */}
      {jumlahDialihkanBelumDiisi > 0 && (
        <div className="flex items-start gap-2 rounded-[var(--radius)] border border-[rgba(217,119,6,0.3)] bg-[rgba(217,119,6,0.06)] px-3.5 py-2.5 text-[12px] font-semibold text-brass">
          <span className="shrink-0">⚠️</span>
          <span>
            {jumlahDialihkanBelumDiisi} sesi ditandai Dialihkan tapi nama kegiatannya belum diisi.
            Isi dulu sebelum pengumuman dikirim.
          </span>
        </div>
      )}

      <div>
        <label className={KELAS_LABEL}>Pratinjau</label>
        <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] border border-border bg-panel-2 p-3.5 font-sans text-[12.5px] leading-relaxed text-text">
          {teks}
        </pre>
      </div>

      {pesan && <p className="text-[13px] text-sage">{pesan}</p>}
      {error && <p className="text-[13px] text-red">{error}</p>}

      <div className="flex gap-2.5">
        <button type="button" onClick={salin} className={KELAS_TOMBOL_SEKUNDER + ' flex-1'}>
          {tersalin ? <Check size={15} /> : <Copy size={15} />}
          {tersalin ? 'Tersalin' : 'Salin Teks'}
        </button>
        {/* Tombol WhatsApp -- pola & warna sama KELAS_TOMBOL_UTAMA
            (flex/rounded/padding), cuma warnanya hijau WhatsApp (#25D366)
            spy langsung dikenali guru sbg jalur berbagi, beda dari
            "Simpan Pengumuman" (kuning brass, menulis ke Supabase). */}
        <button
          type="button"
          onClick={bagikanWhatsapp}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[#25D366] bg-[#25D366] px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 active:scale-[0.97]"
        >
          <MessageCircle size={15} />
          WhatsApp
        </button>
      </div>
      <button type="button" onClick={simpan} disabled={menyimpan} className={KELAS_TOMBOL_UTAMA + ' w-full'}>
        {menyimpan ? 'Menyimpan...' : 'Simpan Pengumuman'}
      </button>

      {/* Ditaruh PALING BAWAH (diminta owner 2026-09-15) -- housekeeping
         "tambah kartu kegiatan baru", terpisah dari alur susun/pratinjau/
         kirim di atasnya supaya tidak menyela alur utama. */}
      <button
        type="button"
        onClick={tambahKegiatan}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] border border-dashed border-border bg-transparent px-4 py-2.5 text-[12.5px] font-semibold text-text-dim transition-colors hover:bg-panel-2"
      >
        <Plus size={14} /> Tambah Kegiatan
      </button>

      {gabungTerbuka && (
        <GabungKelasModal
          kelompokId={kelompokId}
          kelasList={kelasOpsi}
          olehId={olehId}
          onTutup={() => {
            setGabungTerbuka(false);
            /* Muat ulang supaya pratinjau langsung mencerminkan gabungan
               yang baru saja disimpan/dibatalkan -- tanpa ini guru harus
               ganti tanggal bolak-balik dulu baru terlihat. */
            muat();
          }}
        />
      )}
    </div>
  );
}
