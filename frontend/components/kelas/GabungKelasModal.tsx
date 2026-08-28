'use client';

/* "Gabung Kelas" (2026-08-28, diminta owner) — penggabungan SEMENTARA
   satu kelas ke kelas induk, biasanya karena gurunya izin beberapa hari.

   Jam & ruangan DITENTUKAN ADMIN di sini (pilihan owner), bukan ikut
   induk begitu saja: jam kedua kelas sering berbeda -- contoh nyata dari
   owner, Kls 4 pukul 15.45 sedangkan Pra Remaja 16.45 -- jadi menebak
   salah satunya pasti keliru di sebagian kasus.

   Hasilnya langsung terbaca di Pengumuman Jadwal KBM: kelas yang
   bergabung berhenti muncul sebagai sesi tersendiri dan namanya menempel
   ke sesi induk ("Kls 4 & Pra Remaja SMP"). Tabel: kelas_gabung
   (migrasi 20260828200000). */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Trash2, Merge, CalendarDays, Clock } from 'lucide-react';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import JamPicker, { type PosisiJam } from '@/components/ui/JamPicker';
import { useToast } from '@/components/ui/useToast';
import {
  muatSemuaGabung,
  simpanGabung,
  hapusGabung,
  type BarisGabung,
} from '@/lib/kelasGabungGilir';

type KelasOpsi = { id: number; nama: string; jam_mulai: string; jam_selesai: string; ruangan: string };

function hariIni() {
  const d = new Date();
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}
function fmtTgl(iso: string) {
  const [y, m, d] = iso.split('-');
  const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(d)} ${b[Number(m) - 1] ?? m} ${y}`;
}

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none';
const LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

export default function GabungKelasModal({
  kelompokId,
  kelasList,
  olehId,
  onTutup,
}: {
  kelompokId: number;
  kelasList: KelasOpsi[];
  olehId: string | null;
  onTutup: () => void;
}) {
  const { sukses } = useToast();
  const [daftar, setDaftar] = useState<BarisGabung[]>([]);
  const [kelasId, setKelasId] = useState('');
  const [indukId, setIndukId] = useState('');
  const [mulai, setMulai] = useState(hariIni());
  const [selesai, setSelesai] = useState(hariIni());
  const [jamMulai, setJamMulai] = useState('');
  const [jamSelesai, setJamSelesai] = useState('');
  const [ruangan, setRuangan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Kalender & jam kustom, samakan dgn fitur lain (2026-08-28). Satu
     instance masing-masing, dipakai bergantian oleh dua field. */
  const [tglAktif, setTglAktif] = useState<'mulai' | 'selesai' | null>(null);
  const [posTgl, setPosTgl] = useState<PosisiPicker | null>(null);
  const refMulai = useRef<HTMLButtonElement>(null);
  const refSelesai = useRef<HTMLButtonElement>(null);

  const [jamAktif, setJamAktif] = useState<'mulai' | 'selesai' | null>(null);
  const [posJam, setPosJam] = useState<PosisiJam | null>(null);
  const refJamMulai = useRef<HTMLButtonElement>(null);
  const refJamSelesai = useRef<HTMLButtonElement>(null);

  function bukaTgl(f: 'mulai' | 'selesai', ref: React.RefObject<HTMLButtonElement | null>) {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPosTgl({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setTglAktif(f);
  }
  function bukaJam(f: 'mulai' | 'selesai', ref: React.RefObject<HTMLButtonElement | null>) {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPosJam({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setJamAktif(f);
  }

  const namaKelas = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama])), [kelasList]);

  async function muat() {
    try {
      setDaftar(await muatSemuaGabung(kelompokId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat daftar gabung.');
    }
  }
  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelompokId]);

  /* Isi jam & ruangan dgn milik kelas INDUK begitu induknya dipilih --
     sekadar titik awal yang masuk akal, admin tetap bebas mengubah. */
  function pilihInduk(v: string) {
    setIndukId(v);
    const k = kelasList.find((x) => String(x.id) === v);
    if (k) {
      setJamMulai(k.jam_mulai.slice(0, 5));
      setJamSelesai(k.jam_selesai.slice(0, 5));
      setRuangan(k.ruangan);
    }
  }

  async function simpan() {
    setError(null);
    if (!kelasId || !indukId) return setError('Pilih kelas yang digabung dan kelas induknya.');
    if (kelasId === indukId) return setError('Kelas dan kelas induk tidak boleh sama.');
    if (selesai < mulai) return setError('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    setSibuk(true);
    try {
      await simpanGabung(
        kelompokId,
        {
          kelas_id: Number(kelasId),
          kelas_induk_id: Number(indukId),
          tanggal_mulai: mulai,
          tanggal_selesai: selesai,
          jam_mulai: jamMulai || null,
          jam_selesai: jamSelesai || null,
          ruangan: ruangan.trim() || null,
          catatan: null,
        },
        olehId,
      );
      sukses('Penggabungan kelas disimpan.');
      setKelasId('');
      setIndukId('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapus(id: number) {
    try {
      await hapusGabung(id);
      sukses('Penggabungan dibatalkan.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membatalkan.');
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <TanggalPicker
        terbuka={tglAktif !== null}
        posisi={posTgl}
        nilai={tglAktif === 'selesai' ? selesai : mulai}
        onPilih={(v) => {
          if (tglAktif === 'mulai') {
            setMulai(v);
            /* Jangan biarkan rentang terbalik. */
            if (selesai < v) setSelesai(v);
          } else {
            setSelesai(v);
          }
        }}
        onTutup={() => setTglAktif(null)}
      />
      <JamPicker
        terbuka={jamAktif !== null}
        posisi={posJam}
        nilai={jamAktif === 'selesai' ? jamSelesai : jamMulai}
        onPilih={(v) => (jamAktif === 'mulai' ? setJamMulai(v) : setJamSelesai(v))}
        onTutup={() => setJamAktif(null)}
      />
      <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[17px] font-extrabold text-text">Gabung Kelas</h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Kelas yang Digabung *</label>
              <select className={INPUT} value={kelasId} onChange={(e) => setKelasId(e.target.value)}>
                <option value="">-- Pilih kelas --</option>
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Ikut ke Kelas *</label>
              <select className={INPUT} value={indukId} onChange={(e) => pilihInduk(e.target.value)}>
                <option value="">-- Pilih kelas induk --</option>
                {kelasList
                  .filter((k) => String(k.id) !== kelasId)
                  .map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.nama}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Mulai *</label>
              <button
                type="button"
                ref={refMulai}
                onClick={() => bukaTgl('mulai', refMulai)}
                className={`${INPUT} flex items-center justify-between text-left`}
              >
                {fmtTgl(mulai)}
                <CalendarDays size={14} className="shrink-0 text-text-faint" />
              </button>
            </div>
            <div>
              <label className={LABEL}>Sampai *</label>
              <button
                type="button"
                ref={refSelesai}
                onClick={() => bukaTgl('selesai', refSelesai)}
                className={`${INPUT} flex items-center justify-between text-left`}
              >
                {fmtTgl(selesai)}
                <CalendarDays size={14} className="shrink-0 text-text-faint" />
              </button>
            </div>
            <div>
              <label className={LABEL}>Jam Mulai</label>
              <button
                type="button"
                ref={refJamMulai}
                onClick={() => bukaJam('mulai', refJamMulai)}
                className={`${INPUT} flex items-center justify-between text-left tabular-nums`}
              >
                {jamMulai || <span className="text-text-faint">Pilih jam</span>}
                <Clock size={14} className="shrink-0 text-text-faint" />
              </button>
            </div>
            <div>
              <label className={LABEL}>Jam Selesai</label>
              <button
                type="button"
                ref={refJamSelesai}
                onClick={() => bukaJam('selesai', refJamSelesai)}
                className={`${INPUT} flex items-center justify-between text-left tabular-nums`}
              >
                {jamSelesai || <span className="text-text-faint">Pilih jam</span>}
                <Clock size={14} className="shrink-0 text-text-faint" />
              </button>
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Ruangan</label>
              <input className={INPUT} value={ruangan} onChange={(e) => setRuangan(e.target.value)} placeholder="Misal: Masjid Lt. 1" />
            </div>
          </div>

          {error && <p className="mb-3 text-[12px] text-red">{error}</p>}

          <button
            type="button"
            disabled={sibuk}
            onClick={simpan}
            className="mb-6 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            <Merge size={15} /> {sibuk ? 'Menyimpan...' : 'Gabungkan'}
          </button>

          <div className="mb-2 text-[12px] font-bold tracking-[0.02em] text-text-dim uppercase">
            Penggabungan Tercatat ({daftar.length})
          </div>
          {daftar.length === 0 ? (
            <p className="py-3 text-[12.5px] text-text-dim">Belum ada penggabungan.</p>
          ) : (
            <div className="flex flex-col">
              {daftar.map((g) => (
                <div key={g.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-text">
                      {namaKelas.get(g.kelas_id) ?? `#${g.kelas_id}`} &rarr;{' '}
                      {namaKelas.get(g.kelas_induk_id) ?? `#${g.kelas_induk_id}`}
                    </div>
                    <div className="text-[11px] text-text-dim">
                      {fmtTgl(g.tanggal_mulai)} s/d {fmtTgl(g.tanggal_selesai)}
                      {g.jam_mulai ? ` · ${g.jam_mulai.slice(0, 5)}-${(g.jam_selesai ?? '').slice(0, 5)}` : ''}
                      {g.ruangan ? ` · ${g.ruangan}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => hapus(g.id)}
                    aria-label="Batalkan penggabungan"
                    className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-red active:opacity-60"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
