'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
        const { data, error: queryError } = await supabase
          .from('absensi')
          .select('id, status');
        if (queryError) throw new Error(queryError.message);
        if (!cancelled) setAbsensi(data ?? []);
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

  return (
    <div className="rounded-lg bg-white p-4 shadow hover:shadow-md transition-shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Absensi</h2>

      {loading && <p className="text-sm text-gray-500">Memuat data...</p>}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && absensi.length === 0 && (
        <p className="text-sm text-gray-500">No data available</p>
      )}

      {!loading && !error && absensi.length > 0 && (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="jumlah" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
