'use client';

/* Halaman "Guru Saya" — bagian alur mobile guru dari Modul_InputAbsen.gs
   yang belum punya padanan: pengajuan Izin/Cuti dan permintaan akses kelas
   milik guru lain. Input absensinya sendiri sudah ada di /absensi.

   Fondasi DB dibuat di migrasi 20260818190000.

   ⚠️ PEMETAAN NILAI: app lama memakai jenis izin 'harian', sedangkan enum
   Postgres `guru_izin_jenis` bernilai 'izin' | 'cuti'. Jadi "Izin Harian"
   di layar tersimpan sebagai 'izin'. Jangan kirim 'harian' — Postgres akan
   menolaknya.

   Aturan yang dijaga basis data, bukan cuma layar ini:
   - Satu guru tidak bisa punya dua rentang izin yang beririsan (EXCLUDE
     constraint). App lama memeriksanya di kode, sehingga dua pengajuan
     berbarengan bisa lolos berdua.
   - Permintaan akses hanya bisa diputus PEMILIK kelas, bukan pemohon. */

import PesanGalat from '@/components/ui/PesanGalat';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import { useKonfirmasi } from '@/components/ui/useKonfirmasi';
import { useToast } from '@/components/ui/useToast';
import EmptyState from '@/components/ui/EmptyState';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { CalendarDays } from 'lucide-react';

const JENIS_IZIN = [
  { nilai: 'izin', label: 'Izin Harian' },
  { nilai: 'cuti', label: 'Cuti' },
];
const ALASAN = [
  { nilai: 'sakit', label: 'Sakit' },
  { nilai: 'lainnya', label: 'Lainnya' },
];

type Izin = {
  id: number;
  jenis: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  alasan_kategori: string | null;
  alasan_detail: string | null;
};

type Kelas = { id: number; nama: string; guru_id: number | null };
type Tersemat = { nama: string } | { nama: string }[] | null;
type Permintaan = {
  id: number;
  kelas_id: number;
  tanggal: string;
  requester_guru_id: number;
  owner_guru_id: number;
  status: string;
  keterangan: string | null;
  kelas: Tersemat;
};

function namaDari(nilai: Tersemat) {
  if (!nilai) return '-';
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? '-';
}

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';
const KELAS_TOMBOL_UTAMA =
  'cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] ' +
  'font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

const hariIni = () => new Date().toISOString().slice(0, 10);

/* 'YYYY-MM-DD' -> "28 Agu 2026", utk tombol pemicu TanggalPicker. */
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtTgl(v: string) {
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  return `${d} ${BULAN_SINGKAT[m - 1] ?? m} ${y}`;
}

function GuruSayaContent() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const kelompokId = profile?.scope_kelompok_id ?? null;

  /* ?v=akses -> tampilkan HANYA fitur "Minta Akses Kelas"; selain itu
     (v=izin / tanpa param) -> HANYA fitur "Guru Izin". Dua item menu
     (MenuGuru.tsx) menunjuk ke halaman yang sama dgn param beda -- owner
     2026-08-28: "Minta Akses bocor di layar Guru Izin". */
  const view = useSearchParams().get('v') === 'akses' ? 'akses' : 'izin';
  const judul = view === 'akses' ? 'Minta Akses Kelas' : 'Guru Izin';

  const [izinList, setIzinList] = useState<Izin[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [masuk, setMasuk] = useState<Permintaan[]>([]);
  const [keluar, setKeluar] = useState<Permintaan[]>([]);

  const [jenis, setJenis] = useState('izin');
  const [mulai, setMulai] = useState(hariIni());
  const [selesai, setSelesai] = useState(hariIni());
  const [alasan, setAlasan] = useState('sakit');
  const [detail, setDetail] = useState('');

  const [kelasId, setKelasId] = useState('');
  const [tanggalMinta, setTanggalMinta] = useState(hariIni());
  const [keterangan, setKeterangan] = useState('');

  const [loading, setLoading] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const { konfirmasi, dialog } = useKonfirmasi();

  /* Kalender kustom (TanggalPicker) menggantikan <input type="date">
     bawaan browser -- diminta owner 2026-08-28, samakan dgn fitur lain
     (Input Kehadiran, form Santri, Tabungan). SATU instance dipakai
     bergantian utk 3 field; `tglAktif` menandai field mana yang sedang
     dibuka. Aman krn view 'izin' dan 'akses' tidak pernah tampil
     bersamaan (dipisah ?v=akses). */
  const [tglAktif, setTglAktif] = useState<'mulai' | 'selesai' | 'minta' | null>(null);
  const [posTgl, setPosTgl] = useState<PosisiPicker | null>(null);
  const refMulai = useRef<HTMLButtonElement>(null);
  const refSelesai = useRef<HTMLButtonElement>(null);
  const refMinta = useRef<HTMLButtonElement>(null);

  function bukaTgl(
    field: 'mulai' | 'selesai' | 'minta',
    ref: React.RefObject<HTMLButtonElement | null>,
  ) {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPosTgl({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setTglAktif(field);
  }
  const { sukses } = useToast();
  /* Pesan sukses tampil sebagai toast melayang, bukan teks hijau kecil di
     tengah halaman yang mudah terlewat (2026-08-28). Dijembatani dari state
     `pesan` yang sudah ada supaya SELURUH pemanggil setPesan() ikut, tanpa
     perlu menyentuh satu per satu. */
  useEffect(() => {
    if (!pesan) return;
    sukses(pesan);
    setPesan(null);
  }, [pesan, sukses]);

  /* Jumlah izin bulan berjalan — padanan serverGetGuruIzinCountBulanIni
     (Modul_InputAbsen.gs:1515). Di app lama dipakai memunculkan konfirmasi
     mulai izin KEDUA ke atas. Di sini ditampilkan terus terang sebagai
     angka: memberi tahu lebih jujur daripada menghalangi dengan popup,
     dan gurunya tetap bisa mengajukan. */
  const jumlahBulanIni = useMemo(() => {
    const bulanIni = new Date().toISOString().slice(0, 7);
    return izinList.filter((i) => i.tanggal_mulai.startsWith(bulanIni)).length;
  }, [izinList]);

  /* Saran alasan dari pengajuan sebelumnya — padanan
     serverGetGuruIzinAlasanSuggestions (Modul_InputAbsen.gs:1489). Diambil
     dari riwayat guru ini sendiri, bukan seluruh kelompok: alasan izin
     bersifat pribadi dan tidak pantas disodorkan ke orang lain. */
  const saranAlasan = useMemo(
    () =>
      [
        ...new Set(
          izinList
            .filter((i) => i.alasan_kategori === 'lainnya' && (i.alasan_detail ?? '').trim() !== '')
            .map((i) => (i.alasan_detail ?? '').trim())
        ),
      ].slice(0, 5),
    [izinList]
  );

  const muat = useCallback(async () => {
    if (!guruId || !kelompokId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: dIzin }, { data: dKelas }, { data: dReq }] = await Promise.all([
        supabase
          .from('guru_izin')
          .select('id, jenis, tanggal_mulai, tanggal_selesai, alasan_kategori, alasan_detail')
          .eq('guru_id', guruId)
          .order('tanggal_mulai', { ascending: false }),
        supabase
          .from('kelas')
          .select('id, nama, guru_id')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null)
          .order('nama'),
        supabase
          .from('akses_kelas_request')
          .select('id, kelas_id, tanggal, requester_guru_id, owner_guru_id, status, keterangan, kelas(nama)')
          .order('created_at', { ascending: false }),
      ]);
      setIzinList((dIzin ?? []) as unknown as Izin[]);
      setKelasList((dKelas ?? []) as unknown as Kelas[]);
      const semua = (dReq ?? []) as unknown as Permintaan[];
      /* RLS sudah membatasi ke permintaan yang menyangkut guru ini; di sini
         tinggal memisahkan mana yang masuk dan mana yang keluar. */
      setMasuk(semua.filter((r) => r.owner_guru_id === guruId));
      setKeluar(semua.filter((r) => r.requester_guru_id === guruId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [guruId, kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function ajukanIzin() {
    if (!guruId || !kelompokId) return;
    setError(null);
    setPesan(null);
    /* Syarat sama persis serverSubmitGuruIzin:1546-1560. */
    if (selesai < mulai) return setError('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if (alasan === 'lainnya' && !detail.trim()) return setError('Ketik alasan izin Anda.');

    setSibuk(true);
    try {
      const { error: err } = await supabase.from('guru_izin').insert({
        kelompok_id: kelompokId,
        guru_id: guruId,
        jenis,
        tanggal_mulai: mulai,
        tanggal_selesai: selesai,
        alasan_kategori: alasan,
        /* Alasan "sakit" tidak menyimpan detail, mengikuti app lama. */
        alasan_detail: alasan === 'sakit' ? null : detail.trim(),
      });
      if (err) {
        if (err.code === '23P01')
          throw new Error(
            'Anda sudah mengajukan izin yang mencakup tanggal tersebut. Tidak bisa mengajukan izin dobel.'
          );
        throw new Error(err.message);
      }
      setPesan(jenis === 'cuti' ? 'Cuti berhasil diajukan.' : 'Izin berhasil diajukan.');
      setDetail('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengajukan izin.');
    } finally {
      setSibuk(false);
    }
  }

  async function batalkanIzin(i: Izin) {
    const setuju = await konfirmasi({
      judul: 'Batalkan pengajuan izin?',
      pesan: `Pengajuan ${i.tanggal_mulai} s/d ${i.tanggal_selesai} akan dihapus.`,
      bahaya: true,
      labelYa: 'Batalkan',
      labelTidak: 'Kembali',
    });
    if (!setuju) return;
    const { error: err } = await supabase.from('guru_izin').delete().eq('id', i.id);
    if (err) setError(err.message);
    else {
      setPesan('Pengajuan dibatalkan.');
      await muat();
    }
  }

  async function mintaAkses() {
    if (!guruId || !kelompokId || !kelasId) {
      setError('Kelas wajib dipilih.');
      return;
    }
    const kelas = kelasList.find((k) => k.id === Number(kelasId));
    if (!kelas?.guru_id) {
      setError('Kelas itu belum punya guru pengampu.');
      return;
    }
    if (kelas.guru_id === guruId) {
      setError('Itu kelas Anda sendiri.');
      return;
    }

    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('akses_kelas_request').insert({
        kelompok_id: kelompokId,
        kelas_id: Number(kelasId),
        tanggal: tanggalMinta,
        requester_user_id: profile?.id ?? null,
        requester_guru_id: guruId,
        owner_guru_id: kelas.guru_id,
        status: 'pending',
        keterangan: keterangan.trim() || null,
      });
      if (err) throw new Error(err.message);
      setPesan('Permintaan terkirim, menunggu persetujuan guru pemilik kelas.');
      setKeterangan('');
      setKelasId('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim permintaan.');
    } finally {
      setSibuk(false);
    }
  }

  async function putuskan(r: Permintaan, keputusan: 'approved' | 'rejected') {
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase
        .from('akses_kelas_request')
        .update({ status: keputusan, diputuskan_pada: new Date().toISOString() })
        .eq('id', r.id);
      if (err) throw new Error(err.message);
      setPesan(keputusan === 'approved' ? 'Permintaan disetujui.' : 'Permintaan ditolak.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memutuskan.');
    }
  }

  if (!guruId) {
    return (
      <main className="relative flex min-h-screen flex-col bg-bg">
        <JurnalHeaderChrome tampilkanHero={false} />
        <div className="mx-auto w-full max-w-3xl p-6">
          <h1 className="mb-2 text-[24px] font-bold text-text">{judul}</h1>
          <p className="text-[13px] text-text-dim">
            Halaman ini untuk akun yang tertaut ke data guru. Akun Anda belum punya tautan itu
            (<code>profiles.guru_id</code> masih kosong).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col bg-bg">
      {dialog}
      <TanggalPicker
        terbuka={tglAktif !== null}
        posisi={posTgl}
        nilai={tglAktif === 'mulai' ? mulai : tglAktif === 'selesai' ? selesai : tanggalMinta}
        onPilih={(v) => {
          if (tglAktif === 'mulai') {
            setMulai(v);
            /* Aturan lama dipertahankan: memundurkan tanggal mulai melewati
               tanggal selesai ikut menggeser selesainya, supaya rentangnya
               tidak pernah terbalik (ditolak serverSubmitGuruIzin). */
            if (selesai < v) setSelesai(v);
          } else if (tglAktif === 'selesai') {
            setSelesai(v);
          } else {
            setTanggalMinta(v);
          }
        }}
        onTutup={() => setTglAktif(null)}
      />
      <JurnalHeaderChrome tampilkanHero={false} />
      <div className="mx-auto w-full max-w-3xl px-[18px] pt-4 pb-10">
      {/* Keterangan di bawah judul DIHAPUS khusus tampilan Guru Izin
          (diminta owner 2026-08-28) -- kartu "Ajukan Izin / Cuti" tepat di
          bawahnya sudah menjelaskan sendiri. Tampilan Minta Akses tetap
          punya keterangannya karena alurnya (minta ke guru lain + memutus
          permintaan masuk) tidak segamblang itu. Margin judul menyesuaikan
          supaya jarak ke konten tetap sama saat keterangannya tidak ada. */}
      <h1
        className={`text-[20px] font-extrabold text-text ${view === 'akses' ? 'mb-2' : 'mb-6'}`}
      >
        {judul}
      </h1>
      {view === 'akses' && (
        <p className="mb-6 text-[13px] text-text-dim">
          Minta akses mengisi absensi kelas guru lain, dan putuskan permintaan yang masuk untuk
          kelas Anda.
        </p>
      )}

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}
      {loading && <SkeletonKartuList jumlah={3} />}

      {view === 'izin' && (
        <>
      {/* ── Ajukan izin ── */}
      <div className="mb-6 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-1 text-[15px] font-bold text-text">Ajukan Izin / Cuti</div>
        <p className="mb-4 text-[11px] text-text-faint">
          Bulan ini Anda sudah mengajukan {jumlahBulanIni} kali.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Jenis</label>
            <select className={KELAS_INPUT} value={jenis} onChange={(e) => setJenis(e.target.value)}>
              {JENIS_IZIN.map((j) => (
                <option key={j.nilai} value={j.nilai}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Alasan</label>
            <select className={KELAS_INPUT} value={alasan} onChange={(e) => setAlasan(e.target.value)}>
              {ALASAN.map((a) => (
                <option key={a.nilai} value={a.nilai}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal Mulai</label>
            <button
              type="button"
              ref={refMulai}
              onClick={() => bukaTgl('mulai', refMulai)}
              className={`${KELAS_INPUT} flex items-center justify-between text-left`}
            >
              {fmtTgl(mulai)}
              <CalendarDays size={14} className="shrink-0 text-text-faint" />
            </button>
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal Selesai</label>
            <button
              type="button"
              ref={refSelesai}
              onClick={() => bukaTgl('selesai', refSelesai)}
              className={`${KELAS_INPUT} flex items-center justify-between text-left`}
            >
              {fmtTgl(selesai)}
              <CalendarDays size={14} className="shrink-0 text-text-faint" />
            </button>
          </div>
          {alasan === 'lainnya' && (
            <div className="sm:col-span-2">
              <label className={KELAS_LABEL}>Keterangan Alasan *</label>
              <input
                className={KELAS_INPUT}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Tulis alasan Anda"
                list="saran-alasan"
              />
              <datalist id="saran-alasan">
                {saranAlasan.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          )}
        </div>
        <button onClick={ajukanIzin} disabled={sibuk} className={KELAS_TOMBOL_UTAMA + ' mt-4'}>
          {sibuk ? 'Mengirim...' : 'Ajukan'}
        </button>
      </div>

      {/* ── Riwayat izin ── */}
      <div className="mb-8">
        <div className="mb-3 text-[15px] font-bold text-text">Riwayat Izin Saya ({izinList.length})</div>
        {izinList.length === 0 && (
          <EmptyState ikon={<CalendarDays size={22} />} judul="Belum ada pengajuan izin" deskripsi="Pengajuan izin yang Anda buat akan muncul di sini." />
        )}
        {izinList.map((i) => (
          <div
            key={i.id}
            className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-panel px-4 py-3"
          >
            <div>
              <span className="text-[13px] font-semibold text-text">
                {i.jenis === 'cuti' ? 'Cuti' : 'Izin Harian'}
              </span>
              <span className="ml-2 text-[12px] text-text-dim">
                {i.tanggal_mulai}
                {i.tanggal_selesai !== i.tanggal_mulai ? ` s/d ${i.tanggal_selesai}` : ''}
                {i.alasan_kategori ? ` · ${i.alasan_kategori}` : ''}
                {i.alasan_detail ? ` — ${i.alasan_detail}` : ''}
              </span>
            </div>
            <button onClick={() => batalkanIzin(i)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
              Batalkan
            </button>
          </div>
        ))}
      </div>
        </>
      )}

      {view === 'akses' && (
        <>
      {/* ── Minta akses kelas ── */}
      <div className="mb-6 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 text-[15px] font-bold text-text">Minta Akses Kelas Guru Lain</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Kelas</label>
            <select className={KELAS_INPUT} value={kelasId} onChange={(e) => setKelasId(e.target.value)}>
              <option value="">-- Pilih Kelas --</option>
              {kelasList
                .filter((k) => k.guru_id !== guruId)
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal</label>
            <button
              type="button"
              ref={refMinta}
              onClick={() => bukaTgl('minta', refMinta)}
              className={`${KELAS_INPUT} flex items-center justify-between text-left`}
            >
              {fmtTgl(tanggalMinta)}
              <CalendarDays size={14} className="shrink-0 text-text-faint" />
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className={KELAS_LABEL}>Keterangan</label>
            <input
              className={KELAS_INPUT}
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Alasan meminta akses"
            />
          </div>
        </div>
        <button onClick={mintaAkses} disabled={sibuk || !kelasId} className={KELAS_TOMBOL_UTAMA + ' mt-4'}>
          Kirim Permintaan
        </button>
      </div>

      {/* ── Permintaan masuk ── */}
      <div className="mb-8">
        <div className="mb-3 text-[15px] font-bold text-text">
          Permintaan Masuk ({masuk.filter((r) => r.status === 'pending').length} menunggu)
        </div>
        {masuk.length === 0 && (
          <p className="text-[13px] text-text-dim">Tidak ada permintaan untuk kelas Anda.</p>
        )}
        {masuk.map((r) => (
          <div
            key={r.id}
            className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-panel px-4 py-3"
          >
            <div>
              <span className="text-[13px] font-semibold text-text">{namaDari(r.kelas)}</span>
              <span className="ml-2 text-[12px] text-text-dim">
                {r.tanggal} · {r.status}
                {r.keterangan ? ` — ${r.keterangan}` : ''}
              </span>
            </div>
            {r.status === 'pending' && (
              <div className="flex gap-2">
                <button onClick={() => putuskan(r, 'approved')} className={KELAS_TOMBOL_SEKUNDER + ' text-sage'}>
                  Setujui
                </button>
                <button onClick={() => putuskan(r, 'rejected')} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                  Tolak
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Permintaan saya ── */}
      <div>
        <div className="mb-3 text-[15px] font-bold text-text">Permintaan Saya ({keluar.length})</div>
        {keluar.length === 0 && (
          <p className="text-[13px] text-text-dim">Anda belum pernah meminta akses kelas.</p>
        )}
        {keluar.map((r) => (
          <div
            key={r.id}
            className="mb-2 rounded-card border border-border bg-panel px-4 py-3 text-[13px] text-text"
          >
            {namaDari(r.kelas)}
            <span className="ml-2 text-[12px] text-text-dim">
              {r.tanggal} · {r.status}
            </span>
          </div>
        ))}
      </div>
        </>
      )}
      </div>
    </main>
  );
}

export default function GuruSayaPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <GuruSayaContent />
      </Suspense>
    </RequireAuth>
  );
}
