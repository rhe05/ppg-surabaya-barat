'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '@/lib/supabase';

type Absensi = {
  id: number;
  status: string | null;
  [key: string]: unknown;
};

type ChartRow = {
  name: string;
  jumlah: number;
};

export default function AbsensiChart() {
  const [absensi, setAbsensi] = useState<Absensi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        /* Dibatasi 30 hari terakhir (2026-08-26, audit resource Supabase --
           SUPABASE_RESOURCE_AUDIT.md temuan CRITICAL #1) -- sebelumnya
           menyapu SELURUH tabel `absensi` tanpa batas tanggal, dipanggil
           tiap kali Dashboard dibuka. Tabel itu tumbuh terus (satu baris
           per santri per kelas per hari); tanpa batas ini jadi full-table
           scan berulang yang paling mungkin jadi penyebab CPU Supabase
           penuh. 30 hari cukup utk grafik ringkasan Hadir/Tidak Hadir ini
           (bukan laporan historis -- itu ada di /reports & /statistik). */
        const sejak = new Date();
        sejak.setDate(sejak.getDate() - 30);
        const sejakStr = sejak.toISOString().slice(0, 10);

        const UKURAN_HALAMAN = 1000;
        const semua: Absensi[] = [];
        for (let dari = 0; ; dari += UKURAN_HALAMAN) {
          const { data, error: queryError } = await supabase
            .from('absensi')
            .select('id, status')
            .is('deleted_at', null)
            .gte('tanggal', sejakStr)
            .order('id', { ascending: true })
            .range(dari, dari + UKURAN_HALAMAN - 1);
          if (queryError) throw new Error(queryError.message);
          const batch: Absensi[] = data ?? [];
          semua.push(...batch);
          if (batch.length < UKURAN_HALAMAN) break;
        }
        if (!cancelled) setAbsensi(semua);
      } catch {
        if (!cancelled) setError('Error loading data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hadirCount = absensi.filter((a) => a.status === 'hadir').length;
  const tidakHadirCount = absensi.length - hadirCount;

  const chartData: ChartRow[] = [
    { name: 'Hadir', jumlah: hadirCount },
    { name: 'Tidak Hadir', jumlah: tidakHadirCount },
  ];

  // Hadir = --sage, sama di ketiga komponen status app lama. "Tidak Hadir"
  // bukan status di app lama (di sana terpisah izin/sakit/alpa), jadi tidak
  // ada warna yang bisa disalin -- dipakai --text-faint yang netral.
  const warnaBatang = ['var(--sage)', 'var(--text-faint)'];

  return (
    /* .kpi-card sebagai panel — Style_Main.html:859-866 */
    <div className="rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]">
      {/* .dash-section-title — Style_Main.html:845-850 */}
      <div className="mb-5 text-[20px] font-bold text-text">Absensi (30 Hari Terakhir)</div>

      {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
      {!loading && error && <p className="text-[13px] text-red">{error}</p>}
      {!loading && !error && absensi.length === 0 && (
        <p className="text-[13px] text-text-dim">No data available</p>
      )}

      {!loading && !error && absensi.length > 0 && (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-dim)', fontSize: 12 }}
                stroke="var(--border)"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--text-dim)', fontSize: 12 }}
                stroke="var(--border)"
              />
              <Tooltip
                cursor={{ fill: 'var(--panel-2)' }}
                contentStyle={{
                  background: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-card)',
                  fontSize: 13,
                  color: 'var(--text)',
                }}
              />
              <Bar dataKey="jumlah" radius={[4, 4, 0, 0]}>
                {chartData.map((baris, i) => (
                  <Cell key={baris.name} fill={warnaBatang[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
