'use client';

/* Halaman Kalender Akademik — padanan Modul_MaintainKalender.gs (251 baris,
   6 fungsi). Event KBM / Ujian / Acara / Libur per kelompok, ditampilkan
   sebagai grid bulanan plus daftar di bawahnya.

   Fondasi DB dibuat di migrasi 20260818160000: tabelnya RLS aktif tanpa
   policy (tertutup senyap), dan `tipe_event` yang di app lama cuma
   divalidasi kode kini dijaga CHECK constraint di Postgres.

   Guru sengaja hanya bisa MEMBACA — kepala Modul_MaintainKalender.gs
   menyebutnya "view-only access" dan policy INSERT/UPDATE/DELETE memang
   tidak memuat role guru. Tombolnya disembunyikan untuk mereka, karena
   operasi yang ditahan RLS tidak memunculkan error, hanya 0 baris. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const TIPE = ['kbm', 'ujian', 'acara', 'libur'];
const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
/* Grid dimulai Senin, mengikuti kebiasaan kalender pendidikan di sini
   (HARI_URUTAN_JKH_ app lama juga Senin dulu), bukan Minggu ala bawaan JS. */
const KEPALA_HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

const WARNA_TIPE: Record<string, string> = {
  kbm: 'bg-panel-2 text-text',
  ujian: 'bg-brass/15 text-brass',
  acara: 'bg-sage/15 text-sage',
  libur: 'bg-red/15 text-red',
};

type Kelompok = { id: number; nama: string };
type Event = {
  id: number;
  kelompok_id: number;
  tanggal: string;
  judul_event: string;
  deskripsi: string | null;
  tipe_event: string | null;
  lokasi: string | null;
  pukul_mulai: string | null;
  pukul_selesai: string | null;
};

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

const keJam = (v: string | null) => (v ? v.slice(0, 5) : '');

function FormEvent({
  awal,
  tanggalAwal,
  onBatal,
  onSimpan,
}: {
  awal: Event | null;
  tanggalAwal: string;
  onBatal: () => void;
  onSimpan: (isi: Record<string, unknown>) => Promise<void>;
}) {
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? tanggalAwal);
  const [judul, setJudul] = useState(awal?.judul_event ?? '');
  const [tipe, setTipe] = useState(awal?.tipe_event ?? 'acara');
  const [lokasi, setLokasi] = useState(awal?.lokasi ?? '');
  const [mulai, setMulai] = useState(keJam(awal?.pukul_mulai ?? null));
  const [selesai, setSelesai] = useState(keJam(awal?.pukul_selesai ?? null));
  const [deskripsi, setDeskripsi] = useState(awal?.deskripsi ?? '');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    /* Syarat wajib persis serverCreateCalendarEvent:93-102. */
    if (!tanggal) return setError('Tanggal wajib diisi.');
    if (!judul.trim()) return setError('Judul event wajib diisi.');
    if (!TIPE.includes(tipe)) return setError('Tipe event tidak valid.');

    setMenyimpan(true);
    try {
      await onSimpan({
        tanggal,
        judul_event: judul.trim(),
        tipe_event: tipe,
        lokasi: lokasi.trim() || null,
        pukul_mulai: mulai || null,
        pukul_selesai: selesai || null,
        deskripsi: deskripsi.trim() || null,
      });
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={simpan}
        className="my-8 w-full max-w-2xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]"
      >
        <h2 className="mb-6 text-[20px] font-bold text-text">{awal ? 'Ubah Event' : 'Tambah Event'}</h2>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Tanggal *</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Tipe *</label>
            <select className={KELAS_INPUT} value={tipe} onChange={(e) => setTipe(e.target.value)}>
              {TIPE.map((t) => (
                <option key={t} value={t}>
                  {t.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={KELAS_LABEL}>Judul *</label>
            <input
              className={KELAS_INPUT}
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="Misal: Ujian Kenaikan Jilid"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Pukul Mulai</label>
            <input
              type="time"
              className={KELAS_INPUT}
              value={mulai}
              onChange={(e) => setMulai(e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Pukul Selesai</label>
            <input
              type="time"
              className={KELAS_INPUT}
              value={selesai}
              onChange={(e) => setSelesai(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={KELAS_LABEL}>Lokasi</label>
            <input
              className={KELAS_INPUT}
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="Misal: Masjid Lt 1"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={KELAS_LABEL}>Deskripsi</label>
            <textarea
              rows={3}
              className={KELAS_INPUT}
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onBatal} className={KELAS_TOMBOL_SEKUNDER + ' px-4 py-2.5 text-[13px]'}>
            Batal
          </button>
          <button type="submit" disabled={menyimpan} className={KELAS_TOMBOL_UTAMA}>
            {menyimpan ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}

function KalenderContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');
  const kini = new Date();

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [tahun, setTahun] = useState(kini.getFullYear());
  const [bulan, setBulan] = useState(kini.getMonth() + 1);
  const [events, setEvents] = useState<Event[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Event | null>(null);
  const [tanggalPilihan, setTanggalPilihan] = useState('');

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
  }, []);

  const rentang = useMemo(() => {
    const awal = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
    const hariTerakhir = new Date(tahun, bulan, 0).getDate();
    const akhir = `${tahun}-${String(bulan).padStart(2, '0')}-${String(hariTerakhir).padStart(2, '0')}`;
    return { awal, akhir, hariTerakhir };
  }, [tahun, bulan]);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('calendar_events')
        .select(
          'id, kelompok_id, tanggal, judul_event, deskripsi, tipe_event, lokasi, pukul_mulai, pukul_selesai'
        )
        .eq('kelompok_id', kelompokId)
        .gte('tanggal', rentang.awal)
        .lte('tanggal', rentang.akhir)
        .order('tanggal');
      if (err) throw new Error(err.message);
      setEvents((data ?? []) as unknown as Event[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat kalender.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, rentang.awal, rentang.akhir]);

  useEffect(() => {
    muat();
  }, [muat]);

  const perTanggal = useMemo(() => {
    const peta = new Map<string, Event[]>();
    for (const e of events) peta.set(e.tanggal, [...(peta.get(e.tanggal) ?? []), e]);
    return peta;
  }, [events]);

  /* getDay(): Minggu=0. Grid dimulai Senin, jadi Minggu digeser ke kolom 7. */
  const kotakKosongAwal = useMemo(() => {
    const hariPertama = new Date(tahun, bulan - 1, 1).getDay();
    return (hariPertama + 6) % 7;
  }, [tahun, bulan]);

  async function simpan(isi: Record<string, unknown>) {
    if (!kelompokId) return;
    const { error: err } = sedangDiubah
      ? await supabase.from('calendar_events').update(isi).eq('id', sedangDiubah.id)
      : await supabase.from('calendar_events').insert({
          ...isi,
          kelompok_id: kelompokId,
          dibuat_oleh: profile?.id ?? null,
        });
    if (err) throw new Error(err.message);
    setFormTerbuka(false);
    setPesan(sedangDiubah ? 'Event diperbarui.' : 'Event ditambahkan.');
    await muat();
  }

  async function hapus(ev: Event) {
    if (!window.confirm(`Hapus event "${ev.judul_event}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('calendar_events').delete().eq('id', ev.id);
      if (err) throw new Error(err.message);
      setPesan('Event dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  function geserBulan(arah: -1 | 1) {
    const b = bulan + arah;
    if (b < 1) {
      setBulan(12);
      setTahun((t) => t - 1);
    } else if (b > 12) {
      setBulan(1);
      setTahun((t) => t + 1);
    } else {
      setBulan(b);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Kalender Akademik</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Jadwal KBM, ujian, acara, dan libur per kelompok. Guru dapat melihat, tidak mengubah.
      </p>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] flex-1">
          <label className={KELAS_LABEL}>Kelompok</label>
          <select
            className={KELAS_INPUT}
            value={kelompokId ?? ''}
            disabled={profile?.role === 'admin_kelompok' || profile?.role === 'guru'}
            onChange={(e) => setKelompokId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Pilih Kelompok --</option>
            {kelompokList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => geserBulan(-1)} className={KELAS_TOMBOL_SEKUNDER}>
            ←
          </button>
          <div className="min-w-[150px] text-center text-[15px] font-bold text-text">
            {NAMA_BULAN[bulan - 1]} {tahun}
          </div>
          <button onClick={() => geserBulan(1)} className={KELAS_TOMBOL_SEKUNDER}>
            →
          </button>
        </div>
        {bolehTulis && kelompokId && (
          <button
            onClick={() => {
              setSedangDiubah(null);
              setTanggalPilihan(rentang.awal);
              setFormTerbuka(true);
            }}
            className={KELAS_TOMBOL_UTAMA}
          >
            + Tambah Event
          </button>
        )}
      </div>

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}

      {kelompokId && !loading && (
        <>
          <div className="mb-6 overflow-x-auto rounded-card border border-border bg-panel p-3 shadow-[var(--shadow-card)]">
            <div className="grid min-w-[560px] grid-cols-7 gap-1">
              {KEPALA_HARI.map((h) => (
                <div key={h} className="px-2 py-2 text-center text-[11px] font-semibold text-text-dim uppercase">
                  {h}
                </div>
              ))}
              {Array.from({ length: kotakKosongAwal }).map((_, i) => (
                <div key={'kosong-' + i} />
              ))}
              {Array.from({ length: rentang.hariTerakhir }).map((_, i) => {
                const hari = i + 1;
                const iso = `${tahun}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
                const isi = perTanggal.get(iso) ?? [];
                return (
                  <button
                    key={iso}
                    onClick={() => {
                      if (!bolehTulis) return;
                      setSedangDiubah(null);
                      setTanggalPilihan(iso);
                      setFormTerbuka(true);
                    }}
                    className={
                      'min-h-[76px] rounded-[var(--radius)] border border-border p-1.5 text-left align-top ' +
                      (bolehTulis ? 'cursor-pointer hover:border-brass ' : '') +
                      (isi.length ? 'bg-panel-2' : 'bg-panel')
                    }
                  >
                    <div className="text-[11px] font-semibold text-text-dim">{hari}</div>
                    {isi.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={
                          'mt-1 truncate rounded px-1 py-0.5 text-[10px] font-semibold ' +
                          (WARNA_TIPE[ev.tipe_event ?? ''] ?? 'bg-panel-2 text-text')
                        }
                        title={ev.judul_event}
                      >
                        {ev.judul_event}
                      </div>
                    ))}
                    {isi.length > 2 && (
                      <div className="mt-1 text-[10px] text-text-dim">+{isi.length - 2} lagi</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-3 text-[15px] font-bold text-text">
            Daftar Event {NAMA_BULAN[bulan - 1]} ({events.length})
          </div>
          {events.length === 0 && (
            <p className="text-[13px] text-text-dim">Belum ada event pada bulan ini.</p>
          )}
          {events.map((ev) => (
            <div
              key={ev.id}
              className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-bold text-text">{ev.judul_event}</span>
                  <span
                    className={
                      'rounded px-2 py-0.5 text-[11px] font-semibold ' +
                      (WARNA_TIPE[ev.tipe_event ?? ''] ?? 'bg-panel-2 text-text')
                    }
                  >
                    {(ev.tipe_event ?? '-').toUpperCase()}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-text-dim">
                  {ev.tanggal}
                  {ev.pukul_mulai ? ` · ${keJam(ev.pukul_mulai)}` : ''}
                  {ev.pukul_selesai ? `–${keJam(ev.pukul_selesai)}` : ''}
                  {ev.lokasi ? ` · ${ev.lokasi}` : ''}
                </div>
                {ev.deskripsi && (
                  <div className="mt-2 whitespace-pre-line text-[13px] text-text">{ev.deskripsi}</div>
                )}
              </div>
              {bolehTulis && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSedangDiubah(ev);
                      setFormTerbuka(true);
                    }}
                    className={KELAS_TOMBOL_SEKUNDER}
                  >
                    Ubah
                  </button>
                  <button onClick={() => hapus(ev)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                    Hapus
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {formTerbuka && (
        <FormEvent
          awal={sedangDiubah}
          tanggalAwal={tanggalPilihan || rentang.awal}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpan}
        />
      )}
    </div>
  );
}

export default function KalenderPage() {
  return (
    <RequireAuth>
      <KalenderContent />
    </RequireAuth>
  );
}
