'use client';

/* Riwayat Pembelajaran (guru mobile) — layar 3 dari 3, lihat catatan
   lengkap di RencanaPembelajaranView.tsx & migrasi
   20260820120000_jurnal_materi_rencana.sql.

   Tanggal utk baris yang BELUM disampaikan (tanggal_disampaikan null)
   ditampilkan pakai `tanggal_rencana` (migrasi 20260820130000 -- diisi
   guru sendiri di form Tambah Materi) sbg target, dgn fallback ke awal
   rentang minggunya (rentangMinggu) HANYA utk baris lama yang dibuat
   sebelum kolom tanggal_rencana ada (nilainya masih null).

   PUTARAN KEDUA (diminta owner, "standar produk SaaS profesional"): ikon
   lucide-react, <select> Kelas/Bulan/Tahun -> SelectKustom, "Memuat..."
   -> Skeleton, error inline -> toast. Hero TETAP ADA di layar ini (beda
   dari RencanaPembelajaranView.tsx). */

import { useCallback, useEffect, useState } from 'react';
import { Calendar, Search, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import Skeleton from '@/components/ui/Skeleton';
import SelectKustom from '@/components/ui/SelectKustom';
import { useToast } from '@/components/ui/useToast';
import { rentangMinggu } from '@/lib/mingguBulan';

type Kelas = { id: number; nama: string };
type Materi = {
  id: number;
  minggu_ke: number;
  judul: string;
  status: 'belum' | 'disampaikan';
  tanggal_disampaikan: string | null;
  tanggal_rencana: string | null;
};

type Filter = 'semua' | 'disampaikan' | 'belum';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatTanggal(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')} ${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export default function RiwayatPembelajaranView() {
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

  const [materiList, setMateriList] = useState<Materi[]>([]);
  const [loading, setLoading] = useState(false);
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
    try {
      const { data, error: err } = await supabase
        .from('jurnal_materi')
        .select('id, minggu_ke, judul, status, tanggal_disampaikan, tanggal_rencana')
        .eq('kelas_id', kelasId)
        .eq('tahun', tahun)
        .eq('bulan', bulan)
        .is('deleted_at', null)
        .order('minggu_ke', { ascending: true })
        .order('id', { ascending: true });
      if (err) throw new Error(err.message);
      setMateriList((data ?? []) as Materi[]);
    } catch (e) {
      push(e instanceof Error ? e.message : 'Gagal memuat riwayat.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, tahun, bulan]);

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, tahun, bulan]);

  const total = materiList.length;
  const disampaikan = materiList.filter((m) => m.status === 'disampaikan').length;
  const belum = total - disampaikan;
  const persen = total > 0 ? Math.round((disampaikan / total) * 100) : 0;

  const baris = materiList
    .map((m) => {
      const tanggal =
        m.tanggal_disampaikan ??
        m.tanggal_rencana ??
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

  const opsiKelas = kelasList.map((k) => ({ value: String(k.id), label: k.nama }));
  const opsiBulan = NAMA_BULAN.map((nm, idx) => ({ value: String(idx + 1), label: nm }));
  const opsiTahun = tahunPilihan.map((y) => ({ value: String(y), label: String(y) }));

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <JurnalHeaderChrome />

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-10">
        <div className="mb-4 text-[17px] font-extrabold text-text">Riwayat Pembelajaran</div>

        {kelasList.length > 1 && (
          <div className="mb-3">
            <SelectKustom
              value={kelasId === '' ? '' : String(kelasId)}
              onChange={(v) => setKelasId(v === '' ? '' : Number(v))}
              opsi={opsiKelas}
              placeholder="-- Pilih Kelas --"
            />
          </div>
        )}

        {/* Pil Bulan/Tahun — sama persis RencanaPembelajaranView.tsx. */}
        <div className="relative mb-4">
          <button
            type="button"
            onClick={() => setPemilihBulanTerbuka((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-4 py-3 text-left text-[14px] font-semibold text-text shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
          >
            <Calendar size={18} className="text-sage" />
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
                  <SelectKustom value={String(bulan)} onChange={(v) => setBulan(Number(v))} opsi={opsiBulan} />
                  <SelectKustom value={String(tahun)} onChange={(v) => setTahun(Number(v))} opsi={opsiTahun} />
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

            <div className="relative mb-4">
              <input
                type="text"
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari materi pembelajaran..."
                className="w-full rounded-[var(--radius)] border border-border bg-panel py-2.5 pr-3.5 pl-9 text-[13px] text-text placeholder:text-text-faint"
              />
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" />
            </div>

            {loading && (
              <div className="flex flex-col gap-2.5">
                <Skeleton className="h-[64px] w-full" />
                <Skeleton className="h-[64px] w-full" />
                <Skeleton className="h-[64px] w-full" />
              </div>
            )}
            {!loading && baris.length === 0 && (
              <p className="text-[13px] text-text-dim">Tidak ada materi yang cocok.</p>
            )}

            {!loading && (
              <div className="flex flex-col gap-2.5">
                {baris.map((m) => {
                  const sudah = m.status === 'disampaikan';
                  return (
                    <div key={m.id} className="flex items-center gap-3 rounded-card border border-border bg-panel p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${sudah ? 'bg-[#ECFDF5] text-sage' : 'bg-[#FFFBEB] text-brass'}`}>
                        {sudah ? <CheckCircle2 size={18} /> : <Clock size={18} />}
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
            )}
          </>
        )}
      </div>
    </main>
  );
}
