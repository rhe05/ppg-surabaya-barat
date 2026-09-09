'use client';

/* Riwayat Kehadiran jamaah — pilih bulan, lihat rekap Per Acara / Per
   Jamaah. Data lewat lib/jamaahKehadiran (3 query per bulan). */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import PemilihBulanTahun from '@/components/ui/PemilihBulanTahun';
import Skeleton from '@/components/ui/Skeleton';
import PesanGalat from '@/components/ui/PesanGalat';
import { STATUS_HADIR, type SubKelp } from '@/lib/jamaah';
import { muatRingkasKehadiranBulan, type RingkasBulan } from '@/lib/jamaahKehadiran';
import { supabase } from '@/lib/supabase';

function tglSingkat(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function RiwayatKehadiran() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const skrg = new Date();
  const [bulan, setBulan] = useState(skrg.getMonth() + 1);
  const [tahun, setTahun] = useState(skrg.getFullYear());
  const [tab, setTab] = useState<'acara' | 'jamaah'>('acara');
  const [data, setData] = useState<RingkasBulan | null>(null);
  const [subKelp, setSubKelp] = useState<SubKelp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acaraTerbuka, setAcaraTerbuka] = useState<number | null>(null);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [r, rS] = await Promise.all([
        muatRingkasKehadiranBulan(kelompokId, tahun, bulan),
        supabase
          .from('sub_kelp')
          .select('id, kelompok_id, nama, keterangan')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null),
      ]);
      setData(r);
      setSubKelp((rS.data ?? []) as unknown as SubKelp[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat rekap.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, bulan]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaSub = new Map(subKelp.map((s) => [s.id, s.nama]));

  return (
    <div className="px-[18px] pt-4 pb-10">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[17px] font-extrabold text-text">Riwayat Kehadiran</div>
        <PemilihBulanTahun
          bulan={bulan}
          tahun={tahun}
          onUbah={(b, t) => {
            setBulan(b);
            setTahun(t);
          }}
        />
      </div>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <Skeleton className="h-[120px] w-full rounded-card" />
      ) : !data || data.jumlahAcara === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-panel px-5 py-8 text-center text-[13px] text-text-dim">
          Belum ada acara pada bulan ini.
        </p>
      ) : (
        <>
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center rounded-[10px] bg-panel-2 px-1 py-2.5">
                <span className="text-[18px] leading-none font-extrabold text-navy tabular-nums">
                  {data.jumlahAcara}
                </span>
                <span className="mt-1 text-[9.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                  Acara
                </span>
              </div>
              <div className="flex flex-col items-center rounded-[10px] bg-panel-2 px-1 py-2.5">
                <span className="text-[18px] leading-none font-extrabold text-sage tabular-nums">
                  {data.totalKehadiran}
                </span>
                <span className="mt-1 text-[9.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                  Total Hadir
                </span>
              </div>
              <div className="flex flex-col items-center rounded-[10px] bg-panel-2 px-1 py-2.5">
                <span className="text-[18px] leading-none font-extrabold text-navy tabular-nums">
                  {data.persenHadir != null ? `${data.persenHadir}%` : '—'}
                </span>
                <span className="mt-1 text-[9.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                  Rata-rata
                </span>
              </div>
            </div>
          </div>

          <div className="mb-3 flex gap-2">
            {(
              [
                ['acara', 'Per Acara'],
                ['jamaah', 'Per Jamaah'],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-full border-[1.5px] px-3.5 py-1.5 text-[12.5px] font-bold active:scale-95 ${
                  tab === k ? 'border-navy bg-navy-lembut text-navy' : 'border-border bg-panel text-text-dim'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === 'acara' ? (
            <div className="flex flex-col gap-2.5">
              {data.acara.map((a) => (
                <div key={a.id} className="rounded-card border border-border bg-panel p-3.5 shadow-[var(--shadow-subtle)]">
                  <button
                    type="button"
                    onClick={() => setAcaraTerbuka((c) => (c === a.id ? null : a.id))}
                    className="flex w-full items-start justify-between gap-2 border-none bg-transparent p-0 text-left"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-bold text-text">{a.judul}</div>
                      <div className="mt-0.5 text-[11px] text-text-dim">
                        {tglSingkat(a.tanggal)}
                        {a.sub_kelp_id != null ? ` · ${namaSub.get(a.sub_kelp_id) ?? 'Sub Kelp'}` : ' · Gabungan'}
                      </div>
                    </div>
                    <ChevronDown
                      size={15}
                      className={`shrink-0 text-text-faint transition-transform ${acaraTerbuka === a.id ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {STATUS_HADIR.map((st) => (
                      <span
                        key={st.kunci}
                        className="rounded-md px-2 py-1 text-[11px] font-bold tabular-nums"
                        style={{ background: st.pill, color: st.warna }}
                      >
                        {st.label[0]}{st.label.slice(1).toLowerCase()} {a[st.kunci]}
                      </span>
                    ))}
                    <span className="rounded-md bg-panel-2 px-2 py-1 text-[11px] font-bold text-text-dim tabular-nums">
                      dari {a.totalJamaah}
                    </span>
                  </div>
                  {acaraTerbuka === a.id && a.totalDicatat === 0 && (
                    <p className="mt-2 text-[11px] text-text-faint">Kehadiran acara ini belum dicatat.</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {data.jamaah
                .slice()
                .sort((a, b) => b.hadir / b.totalAcara - a.hadir / a.totalAcara || a.nama.localeCompare(b.nama))
                .map((j) => {
                  const pct = j.totalAcara > 0 ? Math.round((j.hadir / j.totalAcara) * 100) : 0;
                  return (
                    <div
                      key={j.id}
                      className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-3 shadow-[var(--shadow-subtle)]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-bold text-text">{j.nama}</div>
                        <div className="mt-0.5 text-[10.5px] text-text-dim">
                          Hadir {j.hadir}/{j.totalAcara}
                          {j.izin + j.sakit + j.alpa > 0
                            ? ` · I${j.izin} S${j.sakit} A${j.alpa}`
                            : ''}
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums"
                        style={{
                          background: pct >= 75 ? 'rgba(5,150,105,0.12)' : pct >= 50 ? 'rgba(180,83,9,0.12)' : 'rgba(220,38,38,0.12)',
                          color: pct >= 75 ? '#059669' : pct >= 50 ? '#B45309' : '#DC2626',
                        }}
                      >
                        {pct}%
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
