'use client';

import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';

type Tersemat = { nama: string } | { nama: string }[] | null;

type Kelas = {
  id: number;
  nama: string;
  jam_mulai: string;
  jam_selesai: string;
  ruangan: string;
  keterangan: string | null;
  santri_count: number;
  status: string;
  kategori_kbm: Tersemat;
  guru: Tersemat;
};

function namaDari(nilai: Tersemat) {
  if (!nilai) return '-';
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? '-';
}

function jam(nilai: string | null) {
  if (!nilai) return '-';
  return nilai.slice(0, 5);
}

function KelasContent() {
  const [kelas, setKelas] = useState<Kelas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: queryError } = await supabase
          .from('kelas')
          .select(
            'id, nama, jam_mulai, jam_selesai, ruangan, keterangan, santri_count, status, kategori_kbm(nama), guru(nama)'
          )
          .is('deleted_at', null)
          .order('jam_mulai');

        if (queryError) throw new Error(queryError.message);
        if (!cancelled) setKelas(data ?? []);
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
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Kelas</h1>

      <div className="rounded-lg bg-white p-4 shadow">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-800">Daftar Kelas</h2>
          {!loading && !error && kelas.length > 0 && (
            <span className="text-sm text-gray-500">{kelas.length} kelas</span>
          )}
        </div>

        {loading && <p className="text-sm text-gray-500">Memuat data...</p>}
        {!loading && error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && kelas.length === 0 && (
          <p className="text-sm text-gray-500">No data available</p>
        )}

        {!loading && !error && kelas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4">Nama</th>
                  <th className="py-2 pr-4">Jam</th>
                  <th className="py-2 pr-4">Ruangan</th>
                  <th className="py-2 pr-4">Kategori</th>
                  <th className="py-2 pr-4">Guru</th>
                  <th className="py-2 pr-4">Santri</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {kelas.map((k) => (
                  <tr key={k.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-4 font-medium text-gray-800">
                      {k.nama}
                      {k.keterangan && (
                        <span className="ml-2 text-xs text-gray-400">{k.keterangan}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {jam(k.jam_mulai)} - {jam(k.jam_selesai)}
                    </td>
                    <td className="py-2 pr-4">{k.ruangan}</td>
                    <td className="py-2 pr-4">{namaDari(k.kategori_kbm)}</td>
                    <td className="py-2 pr-4">{namaDari(k.guru)}</td>
                    <td className="py-2 pr-4">{k.santri_count}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`rounded px-2 py-0.5 text-xs ${
                          k.status === 'aktif'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {k.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default function KelasPage() {
  return (
    <RequireAuth>
      <KelasContent />
    </RequireAuth>
  );
}
