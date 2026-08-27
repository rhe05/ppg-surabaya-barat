'use client';

/* "Statistik" — mobile admin_kelp (2026-08-27, diminta owner). Isi:
   PERINGKAT KEHADIRAN berbasis poin (hadir 3 / izin-sakit 1 / alpa 0),
   10 teratas, terpisah utk Generus & Guru, bisa pilih Bulan+Tahun lewat
   pemilih premium (components/ui/PilihBulanTahun.tsx). Rumus poin di
   lib/peringkatKehadiran.ts. */

import { useCallback, useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import PilihBulanTahun from '@/components/ui/PilihBulanTahun';
import {
  muatPeringkatGenerus,
  muatPeringkatGuru,
  type BarisPeringkat,
} from '@/lib/peringkatKehadiran';

type Tab = 'generus' | 'guru';

const MEDALI = ['#D97706', '#94A3B8', '#B45309']; // emas / perak / perunggu (token brass-ish)

export default function StatistikKelpMobile() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [tab, setTab] = useState<Tab>('generus');

  const [baris, setBaris] = useState<BarisPeringkat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const hasil =
        tab === 'generus'
          ? await muatPeringkatGenerus(kelompokId, tahun, bulan)
          : await muatPeringkatGuru(kelompokId, tahun, bulan);
      setBaris(hasil);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat peringkat.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, bulan, tab]);

  useEffect(() => {
    muat();
  }, [muat]);

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Statistik" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold text-text">Peringkat Kehadiran</div>
            <div className="mt-0.5 text-[11.5px] text-text-dim">
              10 poin tertinggi &middot; hari kerja
            </div>
          </div>
          <PilihBulanTahun
            bulan={bulan}
            tahun={tahun}
            onChange={(b, t) => {
              setBulan(b);
              setTahun(t);
            }}
          />
        </div>

        {/* Segmen Generus / Guru */}
        <div className="mb-4 flex rounded-full border border-border bg-panel-2 p-1">
          {(['generus', 'guru'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                tab === t ? 'bg-panel text-text shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-text-dim'
              }`}
            >
              {t === 'generus' ? 'Generus' : 'Guru'}
            </button>
          ))}
        </div>

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="mb-4 text-[13px] text-text-dim">Menghitung...</p>}

        {!loading && !error && baris.length === 0 && (
          <div className="rounded-card border border-border bg-panel p-6 text-center shadow-[var(--shadow-card)]">
            <Award size={24} className="mx-auto mb-2 text-text-faint" />
            <p className="text-[13px] text-text-dim">
              Belum ada data kehadiran {tab === 'generus' ? 'generus' : 'guru'} pada bulan ini.
            </p>
          </div>
        )}

        {!loading && baris.length > 0 && (
          <ol className="flex flex-col gap-2">
            {baris.map((b, i) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-card border border-border bg-panel p-3.5 shadow-[var(--shadow-card)]"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums"
                  style={
                    i < 3
                      ? { background: `${MEDALI[i]}1F`, color: MEDALI[i] }
                      : { background: 'var(--panel-2)', color: 'var(--text-dim)' }
                  }
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-text">{b.nama}</div>
                  <div className="mt-0.5 text-[11px] text-text-dim">
                    Hadir {b.hadir}
                    {b.izin > 0 ? ` · Izin ${b.izin}` : ''}
                    {b.alpa > 0 ? ` · Alpa ${b.alpa}` : ''}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[16px] leading-none font-extrabold tabular-nums text-teal">
                    {b.poin}
                  </div>
                  <div className="text-[9.5px] font-bold tracking-[0.04em] text-text-faint uppercase">
                    Poin
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-5 rounded-[var(--radius)] bg-panel-2 px-3.5 py-3 text-[11px] leading-relaxed text-text-dim">
          <span className="font-bold text-text">Poin:</span> Hadir = 3 &nbsp;&middot;&nbsp; Izin
          (sakit / keperluan keluarga) = 1 &nbsp;&middot;&nbsp; Alpa = 0.
          {tab === 'guru' && (
            <>
              {' '}
              Untuk guru, <span className="font-semibold">Hadir</span> = jumlah hari mengisi absensi
              kelasnya; <span className="font-semibold">Izin</span> = hari yang tercatat di Guru Izin.
            </>
          )}
        </div>
      </div>
    </main>
  );
}
