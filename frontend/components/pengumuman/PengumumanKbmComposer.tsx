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
import { Calendar, Copy, Check, Info } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KATEGORI_JENJANG } from '@/lib/kategori';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
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
  type OverrideKelompok,
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
type StatusSesi = 'hadir' | 'diganti' | 'libur';
type Override = { status: StatusSesi; penggantiId?: number };

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

/* Tiga status sesi + warna aktifnya. Label sengaja pendek ("Diganti",
   bukan "Izin - Diganti") supaya muat di sepertiga lebar kartu pada HP
   sempit tanpa terpotong. */
const STATUS_SESI: { nilai: StatusSesi; label: string; bg: string }[] = [
  { nilai: 'hadir', label: 'Hadir', bg: 'bg-sage' },
  { nilai: 'diganti', label: 'Diganti', bg: 'bg-brass' },
  { nilai: 'libur', label: 'Libur', bg: 'bg-red' },
];

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
}: {
  kelompokId: number;
  namaKelompok: string;
  onTersimpan?: () => void;
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

  const [jadwalList, setJadwalList] = useState<Jadwal[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  /* guru_id yang sedang izin pada tanggal terpilih -- dipakai utk lencana
     "Sedang izin" di kartu sesi, supaya penyusun tahu KENAPA statusnya
     sudah otomatis "Diganti". */
  const [guruIzinSet, setGuruIzinSet] = useState<Set<number>>(new Set());
  const [catatan, setCatatan] = useState(CATATAN_DEFAULT);
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

  useEffect(() => {
    supabase
      .from('guru')
      .select('id, nama')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => setGuruList(data ?? []));
  }, [kelompokId]);

  /* Kalender dikunci sama persis dgn Input Kehadiran (diminta owner
     2026-08-28): Sabtu/Minggu & tanggal merah nasional tidak bisa dipilih,
     DITUMPANGI pengecualian per kelompok (kalender_kelompok) -- tanggal
     yang ditandai "aktif" tetap boleh, yang ditandai "libur" ikut terkunci
     merah. Memakai helper bersama buatCekNonaktif, BUKAN aturan sendiri,
     supaya tidak pernah menyimpang dari layar absensi. */
  const [overrideKelompok, setOverrideKelompok] = useState<Map<string, OverrideKelompok>>(new Map());
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
      const namaKelasGabung = new Map<number, string[]>();
      for (const j of terpilih) {
        if (j.kelas_id == null) continue;
        const g = gabungAktif.get(j.kelas_id);
        if (!g) continue;
        const arr = namaKelasGabung.get(g.kelas_induk_id) ?? [];
        arr.push(petaKelas.get(j.kelas_id)?.nama ?? j.kelas);
        namaKelasGabung.set(g.kelas_induk_id, arr);
      }

      const daftar: Jadwal[] = [];
      for (const j of terpilih) {
        /* Kelas yang sedang bergabung: dilewati, sudah menempel ke induk. */
        if (j.kelas_id != null && gabungAktif.has(j.kelas_id)) continue;

        const kelasData = j.kelas_id != null ? petaKelas.get(j.kelas_id) : undefined;
        const ikut = j.kelas_id != null ? namaKelasGabung.get(j.kelas_id) : undefined;
        /* Jam & ruangan gabungan ditentukan admin -- diambil dari baris
           kelas_gabung mana pun yang menunjuk ke induk ini. */
        const aturan =
          j.kelas_id != null
            ? [...gabungAktif.values()].find((g) => g.kelas_induk_id === j.kelas_id)
            : undefined;

        daftar.push({
          id: j.id,
          kategori: j.kategori,
          kelas: ikut && ikut.length > 0 ? `${j.kelas} & ${ikut.join(' & ')}` : j.kelas,
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
      [id]: { status, penggantiId: status === 'diganti' ? prev[id]?.penggantiId : undefined },
    }));
  }
  function setPengganti(id: number, penggantiId: number) {
    setOverrides((prev) => ({ ...prev, [id]: { status: 'diganti', penggantiId } }));
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
  }, [jadwalUrut, overrides, namaGuru, namaKelompok, tanggalLabel, catatan, guruIzinSet]);

  async function salin() {
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      setError('Gagal menyalin otomatis -- salin manual dari kotak pratinjau di bawah.');
    }
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
                  {STATUS_SESI.map((s) => {
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
              </div>
            );
          })}
        </div>
      )}

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
        <button type="button" onClick={simpan} disabled={menyimpan} className={KELAS_TOMBOL_UTAMA + ' flex-1'}>
          {menyimpan ? 'Menyimpan...' : 'Simpan Pengumuman'}
        </button>
      </div>
    </div>
  );
}
