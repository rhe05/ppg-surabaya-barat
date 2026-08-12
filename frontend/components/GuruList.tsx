'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Guru = {
  id: number;
  nama: string;
  kategori: string | null;
  [key: string]: unknown;
};

export default function GuruList() {
  const [guru, setGuru] = useState<Guru[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from('guru')
          .select('id, nama, kategori');
        if (queryError) throw new Error(queryError.message);
        if (!cancelled) setGuru(data ?? []);
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

  return (
    <div className="rounded-lg bg-white p-4 shadow hover:shadow-md transition-shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Guru</h2>

      {loading && <p className="text-sm text-gray-500">Memuat data...</p>}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && guru.length === 0 && (
        <p className="text-sm text-gray-500">No data available</p>
      )}

      {!loading && !error && guru.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-4">Nama</th>
                <th className="py-2 pr-4">Kategori</th>
              </tr>
            </thead>
            <tbody>
              {guru.map((g) => (
                <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 pr-4">{g.nama}</td>
                  <td className="py-2 pr-4">{g.kategori ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
