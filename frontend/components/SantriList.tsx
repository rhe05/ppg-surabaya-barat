'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Santri = {
  id: number;
  nama: string;
  kelompok_id: number | null;
  [key: string]: unknown;
};

const PAGE_SIZE = 10;

export default function SantriList() {
  const [santri, setSantri] = useState<Santri[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from('santri')
          .select('id, nama, kelompok_id');
        if (queryError) throw new Error(queryError.message);
        if (!cancelled) setSantri(data ?? []);
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? santri.filter((s) => s.nama?.toLowerCase().includes(term))
      : santri;
    return [...rows].sort((a, b) => (a.kelompok_id ?? 0) - (b.kelompok_id ?? 0));
  }, [santri, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="rounded-lg bg-white p-4 shadow hover:shadow-md transition-shadow">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-800">Santri</h2>
        <input
          type="text"
          placeholder="Cari nama..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="w-40 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {loading && <p className="text-sm text-gray-500">Memuat data...</p>}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-gray-500">No data available</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4">Nama</th>
                  <th className="py-2 pr-4">Kelompok</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-4">{s.nama}</td>
                    <td className="py-2 pr-4">{s.kelompok_id ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <span>
              Halaman {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
