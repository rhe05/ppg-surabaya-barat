'use client';

import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

type Absensi = {
  id: number;
  kelompok_id: number | null;
  status: string | null;
  [key: string]: unknown;
};

type SummaryRow = {
  kelompok_id: number | string;
  hadir: number;
  total: number;
  percentage: number;
};

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceSummaryReport() {
  const [absensiList, setAbsensiList] = useState<Absensi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const UKURAN_HALAMAN = 1000;
        const semua: Absensi[] = [];
        for (let dari = 0; ; dari += UKURAN_HALAMAN) {
          const { data, error: queryError } = await supabase
            .from('absensi')
            .select('id, kelompok_id, status')
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(dari, dari + UKURAN_HALAMAN - 1);
          if (queryError) throw new Error(queryError.message);
          const batch: Absensi[] = data ?? [];
          semua.push(...batch);
          if (batch.length < UKURAN_HALAMAN) break;
        }
        if (!cancelled) setAbsensiList(semua);
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

  const summary: SummaryRow[] = useMemo(() => {
    const byKelompok = new Map<number | string, { hadir: number; total: number }>();
    for (const a of absensiList) {
      const key = a.kelompok_id ?? 'Tidak diketahui';
      const entry = byKelompok.get(key) ?? { hadir: 0, total: 0 };
      entry.total += 1;
      if (a.status === 'hadir') entry.hadir += 1;
      byKelompok.set(key, entry);
    }
    return Array.from(byKelompok.entries())
      .map(([kelompok_id, v]) => ({
        kelompok_id,
        hadir: v.hadir,
        total: v.total,
        percentage: v.total > 0 ? Math.round((v.hadir / v.total) * 100) : 0,
      }))
      .sort((a, b) => String(a.kelompok_id).localeCompare(String(b.kelompok_id), undefined, { numeric: true }));
  }, [absensiList]);

  function exportPdf() {
    setPdfError(null);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(16);
      doc.text('Laporan Ringkasan Absensi', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`Tanggal cetak: ${todayStamp()}`, pageWidth / 2, 25, { align: 'center' });

      autoTable(doc, {
        startY: 33,
        head: [['Kelompok', 'Hadir', 'Total', 'Persentase']],
        body: summary.map((r) => [
          String(r.kelompok_id),
          String(r.hadir),
          String(r.total),
          `${r.percentage}%`,
        ]),
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Halaman ${i} / ${pageCount} — dicetak ${new Date().toLocaleString('id-ID')}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }

      doc.save(`Laporan_Absensi_Summary_${todayStamp()}.pdf`);
    } catch {
      setPdfError('Gagal membuat PDF');
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow hover:shadow-md transition-shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Ringkasan Absensi per Kelompok</h2>

      {loading && <p className="text-sm text-gray-500">Memuat data...</p>}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && summary.length === 0 && (
        <p className="text-sm text-gray-500">No data available</p>
      )}

      {!loading && !error && summary.length > 0 && (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4">Kelompok</th>
                  <th className="py-2 pr-4">Hadir</th>
                  <th className="py-2 pr-4">Total</th>
                  <th className="py-2 pr-4">Persentase</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={String(r.kelompok_id)} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-4">{r.kelompok_id}</td>
                    <td className="py-2 pr-4">{r.hadir}</td>
                    <td className="py-2 pr-4">{r.total}</td>
                    <td className="py-2 pr-4">{r.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <button
              onClick={exportPdf}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Export PDF
            </button>
            {pdfError && <p className="mt-2 text-sm text-red-600">{pdfError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
