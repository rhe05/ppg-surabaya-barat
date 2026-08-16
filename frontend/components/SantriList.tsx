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
    <div>
      {/* .dash-section-title — Style_Main.html:845-850 */}
      <div className="mb-5 text-[20px] font-bold text-text">Santri</div>

      {/* .search-input — Style_Main.html:4290-4298 */}
      <input
        type="text"
        placeholder="Cari nama..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="mb-6 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
      />

      {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
      {!loading && error && <p className="text-[13px] text-red">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="text-[13px] text-text-dim">No data available</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          {/* .data-table-wrapper + .data-table — Style_Main.html:4250-4288 */}
          <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="border-b border-border bg-panel-2">
                <tr>
                  <th className="px-4 py-3.5 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase">
                    Nama
                  </th>
                  <th className="px-4 py-3.5 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase">
                    Kelompok
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.id} className="hover:bg-panel-2">
                    <td className="border-b border-border px-4 py-3.5 text-text">{s.nama}</td>
                    <td className="border-b border-border px-4 py-3.5 text-text">
                      {s.kelompok_id ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-[13px] text-text-dim">
            <span>
              Halaman {page} / {totalPages}
            </span>
            {/* .btn + .btn-secondary — Style_Main.html:4410-4438 */}
            <div className="flex gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:opacity-40"
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
