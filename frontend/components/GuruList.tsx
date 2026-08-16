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
    <div>
      {/* .dash-section-title — Style_Main.html:845-850 */}
      <div className="mb-5 text-[20px] font-bold text-text">Guru</div>

      {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
      {!loading && error && <p className="text-[13px] text-red">{error}</p>}
      {!loading && !error && guru.length === 0 && (
        <p className="text-[13px] text-text-dim">No data available</p>
      )}

      {!loading && !error && guru.length > 0 && (
        /* .data-table-wrapper + .data-table — Style_Main.html:4250-4288 */
        <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="border-b border-border bg-panel-2">
              <tr>
                <th className="px-4 py-3.5 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase">
                  Nama
                </th>
                <th className="px-4 py-3.5 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase">
                  Kategori
                </th>
              </tr>
            </thead>
            <tbody>
              {guru.map((g) => (
                <tr key={g.id} className="hover:bg-panel-2">
                  <td className="border-b border-border px-4 py-3.5 text-text">{g.nama}</td>
                  <td className="border-b border-border px-4 py-3.5 text-text">
                    {g.kategori ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
