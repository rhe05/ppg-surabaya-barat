'use client';

/* Riwayat Pembelajaran (guru mobile) — layar 3 dari 3, lihat catatan
   lengkap di RencanaPembelajaranView.tsx & migrasi
   20260820120000_jurnal_materi_rencana.sql.

   Tanggal utk baris yang BELUM disampaikan (tanggal_disampaikan null)
   ditampilkan pakai tanggal AWAL rentang minggunya (rentangMinggu) sbg
   perkiraan/target -- bukan tanggal presisi kapan akan diajarkan (app ini
   tidak melacak itu), murni supaya baris tetap punya sesuatu utk
   diurutkan & ditampilkan spt baris yang sudah disampaikan. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import { rentangMinggu } from '@/lib/mingguBulan';

type Kelas = { id: number; nama: string };
type Materi = {
  id: number;
  minggu_ke: number;
  judul: string;
  status: 'belum' | 'disampaikan';
  tanggal_disampaikan: string | null;
};

type Filter = 'semua' | 'disampaikan' | 'belum';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const SELECT_STYLE =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text';

function formatTanggal(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')} ${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export default function RiwayatPembelajaranView() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];
  const [pemilihBulanTerbuka, setPemilihBulanTerbuka] = useState(false);

  const [materiList, setMateriList] = useState<Materi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('semua');
  const [cari, setCari] = useState('');

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

  const muat = useCallback(async () => {
    if (kelasId === '') {
      setMateriList([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('jurnal_materi')
        .select('id, minggu_ke, judul, status, tanggal_disampaikan')
        .eq('kelas_id', kelasId)
        .eq('tahun', tahun)
        .eq('bulan', bulan)
        .is('deleted_at', null)
        .order('minggu_ke', { ascending: true })
        .order('id', { ascending: true });
      if (err) throw new Error(err.message);
      setMateriList((data ?? []) as Materi[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat riwayat.');
    } finally {
      setLoading(false);
    }
  }, [kelasId, tahun, bulan]);

  useEffect(() => {
    muat();
  }, [muat]);

  const total = materiList.length;
  const disampaikan = materiList.filter((m) => m.status === 'disampaikan').length;
  const belum = total - disampaikan;
  const persen = total > 0 ? Math.round((disampaikan / total) * 100) : 0;

  const baris = materiList
    .map((m) => {
      const tanggal =
        m.tanggal_disampaikan ??
        (() => {
          const r = rentangMinggu(tahun, bulan, m.minggu_ke);
          if (!r) return null;
          return `${tahun}-${String(bulan).padStart(2, '0')}-${String(r.awal).padStart(2, '0')}`;
        })();
      return { ...m, tanggal };
    })
    .filter((m) => (filter === 'semua' ? true : m.status === filter))
    .filter((m) => m.judul.toLowerCase().includes(cari.trim().toLowerCase()))
    .sort((a, b) => (a.tanggal ?? '').localeCompare(b.tanggal ?? ''));

  const FILTER_TAB: { nilai: Filter; label: string }[] = [
    { nilai: 'semua', label: 'Semua' },
    { nilai: 'disampaikan', label: 'Disampaikan' },
    { nilai: 'belum', label: 'Belum' },
  ];

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <JurnalHeaderChrome />

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-10">
        <div className="mb-4 text-[17px] font-extrabold text-text">Riwayat Pembelajaran</div>

        {kelasList.length > 1 && (
          <div className="mb-3">
            <select
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value === '' ? '' : Number(e.target.value))}
              className={SELECT_STYLE}
            >
              <option value="">-- Pilih Kelas --</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Pil Bulan/Tahun — sama persis RencanaPembelajaranView.tsx. */}
        <div className="relative mb-4">
          <button
            type="button"
            onClick={() => setPemilihBulanTerbuka((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-4 py-3 text-left text-[14px] font-semibold text-text shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M3 10h18" />
            </svg>
            <span className="flex-1">
              {NAMA_BULAN[bulan - 1]} {tahun}
            </span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-faint)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {pemilihBulanTerbuka && (
            <>
              <div className="fixed inset-0 z-[1090]" onClick={() => setPemilihBulanTerbuka(false)} />
              <div className="absolute z-[1100] mt-2 w-full rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]">
                <div className="flex gap-2">
                  <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={SELECT_STYLE}>
                    {NAMA_BULAN.map((nm, idx) => (
                      <option key={nm} value={idx + 1}>
                        {nm}
                      </option>
                    ))}
                  </select>
                  <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={SELECT_STYLE}>
                    {tahunPilihan.map((y) => (
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

        {kelasId === '' ? (
          <p className="text-[13px] text-text-dim">Pilih kelas dulu utk melihat riwayat.</p>
        ) : (
          <>
            {/* Progres Pembelajaran */}
            <div className="mb-5 rounded-card border border-border bg-[#EEF2FF] p-4">
              <div className="mb-1 text-[12px] font-bold text-text">Progres Pembelajaran</div>
              <div className="flex items-center justify-between">
                <div className="text-[30px] leading-none font-extrabold text-indigo">{persen}%</div>
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 36 36" width="64" height="64">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="4" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="var(--indigo)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${(persen / 100) * 97.4} 97.4`}
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-indigo transition-[width] duration-500" style={{ width: `${persen}%` }} />
              </div>
              <div className="mt-3 flex justify-between text-center">
                <div>
                  <div className="text-[16px] font-extrabold text-text">{total}</div>
                  <div className="text-[10.5px] text-text-dim">Direncanakan</div>
                </div>
                <div>
                  <div className="text-[16px] font-extrabold text-sage">{disampaikan}</div>
                  <div className="text-[10.5px] text-text-dim">Disampaikan</div>
                </div>
                <div>
                  <div className="text-[16px] font-extrabold text-brass">{belum}</div>
                  <div className="text-[10.5px] text-text-dim">Belum Disampaikan</div>
                </div>
              </div>
            </div>

            {/* Filter tab */}
            <div className="mb-3 flex gap-2">
              {FILTER_TAB.map((f) => (
                <button
                  key={f.nilai}
                  type="button"
                  onClick={() => setFilter(f.nilai)}
                  className={`flex-1 cursor-pointer rounded-[var(--radius)] border py-2 text-[12.5px] font-semibold transition-all duration-150 ${
                    filter === f.nilai
                      ? 'border-indigo bg-indigo text-white'
                      : 'border-border bg-panel text-text-dim'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari materi pembelajaran..."
              className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text placeholder:text-text-faint"
            />

            {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
            {!loading && error && <p className="text-[13px] text-red">{error}</p>}
            {!loading && !error && baris.length === 0 && (
              <p className="text-[13px] text-text-dim">Tidak ada materi yang cocok.</p>
            )}

            <div className="flex flex-col gap-2.5">
              {baris.map((m) => {
                const sudah = m.status === 'disampaikan';
                return (
                  <div key={m.id} className="flex items-center gap-3 rounded-card border border-border bg-panel p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${sudah ? 'bg-[#ECFDF5] text-sage' : 'bg-[#FFFBEB] text-brass'}`}>
                      {sudah ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <path d="m8.5 12 2.5 2.5 5-5" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M12 7v5l3 2" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11.5px] text-text-dim">{m.tanggal ? formatTanggal(m.tanggal) : '—'}</div>
                      <div className="text-[14px] font-bold text-text">{m.judul}</div>
                      <div className={`text-[11px] font-semibold ${sudah ? 'text-sage' : 'text-brass'}`}>
                        {sudah ? 'Disampaikan' : 'Belum Disampaikan'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
