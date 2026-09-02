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

import { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, Search, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import Skeleton from '@/components/ui/Skeleton';
import SelectKustom from '@/components/ui/SelectKustom';
import { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import { rentangMinggu } from '@/lib/mingguBulan';
import { pecahJudulMateri } from '@/lib/judulMateri';

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
  const [posisiPemilihBulan, setPosisiPemilihBulan] = useState<PosisiPicker | null>(null);
  const ikonKalenderRef = useRef<HTMLButtonElement>(null);

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

  const opsiBulan = NAMA_BULAN.map((nm, idx) => ({ value: String(idx + 1), label: nm }));
  const opsiTahun = tahunPilihan.map((y) => ({ value: String(y), label: String(y) }));

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      {/* Hero hijau DIHAPUS (diminta owner 2026-09-02) -- menyusul
          keputusan yang sama di Rencana & Pelaksanaan Pembelajaran. Top
          bar putih (hamburger + brand + lonceng) TETAP: itu satu-satunya
          jalan guru kembali ke menu. */}
      <JurnalHeaderChrome tampilkanHero={false} />

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-10">
        {/* Kepala layar SAMA PERSIS Rencana & Pelaksanaan (diminta owner):
            judul + chip kelas di kiri, ikon kalender + pil Bulan/Tahun di
            kanan. Sebelumnya di layar ini kelas dipilih lewat dropdown
            selebar layar dan bulan lewat pil selebar layar juga -- dua
            baris penuh yang tidak ada di dua layar saudaranya. */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="pt-1.5 text-[17px] font-extrabold text-text">Riwayat Pembelajaran</div>
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
                      style={
                        aktif
                          ? {
                              background:
                                'linear-gradient(135deg, var(--indigo-lembut) 0%, var(--indigo-lembut-2) 100%)',
                            }
                          : undefined
                      }
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

        {kelasId === '' ? (
          <p className="text-[13px] text-text-dim">Pilih kelas dulu utk melihat riwayat.</p>
        ) : (
          <>
            {/* Progres bulan ini. Donat DIPERTAHANKAN di layar ini (beda
                dgn Pelaksanaan yang donatnya dicabut): di sini angkanya
                memang perbandingan sebulan penuh, bukan 1-3 materi hari
                itu. Yang dirapikan: latar heksa mentah #EEF2FF -> kartu
                premium biasa + tiga angka memakai tangga huruf baku. */}
            <div className="kartu-premium mb-5 p-4">
              <div className="label-mikro mb-2">Progres {NAMA_BULAN[bulan - 1]} {tahun}</div>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="angka-metrik text-[24px] leading-none text-text">{persen}%</div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-panel-2">
                    <div
                      className="h-full rounded-full bg-sage transition-[width] duration-500"
                      style={{ width: `${persen}%` }}
                    />
                  </div>
                </div>
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 36 36" width="64" height="64">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="4" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="var(--sage)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${(persen / 100) * 97.4} 97.4`}
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                </div>
              </div>
              <div className="mt-3 flex justify-between border-t border-border pt-3 text-center">
                <div>
                  <div className="angka-metrik text-[15px] text-text">{total}</div>
                  <div className="text-[11px] text-text-dim">Direncanakan</div>
                </div>
                <div>
                  <div className="angka-metrik text-[15px] text-sage">{disampaikan}</div>
                  <div className="text-[11px] text-text-dim">Disampaikan</div>
                </div>
                <div>
                  <div className="angka-metrik text-[15px] text-brass">{belum}</div>
                  <div className="text-[11px] text-text-dim">Belum</div>
                </div>
              </div>
            </div>

            {/* Saringan status: chip, satu bahasa dgn chip kelas di atas
                -- sebelumnya tiga tombol kotak selebar layar dgn isian
                indigo penuh, yang membuatnya terbaca sbg aksi utama
                halaman padahal cuma penyaring. */}
            <div className="mb-3 flex gap-2">
              {FILTER_TAB.map((f) => (
                <button
                  key={f.nilai}
                  type="button"
                  onClick={() => setFilter(f.nilai)}
                  className={`cursor-pointer rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all duration-150 active:scale-[0.96] ${
                    filter === f.nilai
                      ? 'border-indigo text-indigo'
                      : 'border-border bg-panel text-text-dim'
                  }`}
                  style={
                    filter === f.nilai
                      ? {
                          background:
                            'linear-gradient(135deg, var(--indigo-lembut) 0%, var(--indigo-lembut-2) 100%)',
                        }
                      : undefined
                  }
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

            {/* SATU kartu berisi baris berpemisah -- bentuk yang sama dgn
                daftar materi di Pelaksanaan, bukan setumpuk kartu
                berbayang masing-masing. */}
            {!loading && baris.length > 0 && (
              <div className="kartu-premium overflow-hidden">
                {baris.map((m) => {
                  const sudah = m.status === 'disampaikan';
                  const { kategori, utama, rincian } = pecahJudulMateri(m.judul);
                  return (
                    <div key={m.id} className="flex items-start gap-3 border-b border-border px-3.5 py-3 last:border-b-0">
                      <span
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          sudah ? 'bg-sage-lembut text-sage' : 'bg-brass-lembut text-brass'
                        }`}
                      >
                        {sudah ? <CheckCircle2 size={17} /> : <Clock size={17} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="label-mikro">
                          {[kategori, m.tanggal ? formatTanggal(m.tanggal) : null].filter(Boolean).join(' · ') ||
                            '—'}
                        </div>
                        <div className="text-[15px] font-bold text-text">{utama}</div>
                        {rincian && (
                          <div className="mt-0.5 text-[12px] leading-snug text-text-dim">{rincian}</div>
                        )}
                        <div className={`mt-0.5 text-[12px] font-semibold ${sudah ? 'text-sage' : 'text-brass'}`}>
                          {sudah ? 'Disampaikan' : 'Belum disampaikan'}
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
