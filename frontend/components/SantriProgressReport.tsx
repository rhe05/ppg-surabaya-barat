'use client';

import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

type Santri = {
  id: number;
  nama: string;
  kelompok_id: number | null;
  [key: string]: unknown;
};

type Absensi = {
  id: number;
  santri_id: number;
  status: string | null;
  tanggal: string;
  [key: string]: unknown;
};

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default function SantriProgressReport() {
  const [santriList, setSantriList] = useState<Santri[]>([]);
  const [absensiList, setAbsensiList] = useState<Absensi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [santriRes, absensiRes] = await Promise.all([
          supabase.from('santri').select('id, nama, kelompok_id'),
          supabase.from('absensi').select('id, santri_id, status, tanggal'),
        ]);
        if (santriRes.error) throw new Error(santriRes.error.message);
        if (absensiRes.error) throw new Error(absensiRes.error.message);
        if (!cancelled) {
          setSantriList(santriRes.data ?? []);
          setAbsensiList(absensiRes.data ?? []);
        }
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

  const selectedSantri = useMemo(
    () => santriList.find((s) => s.id === selectedId) ?? null,
    [santriList, selectedId]
  );

  const santriAbsensi = useMemo(
    () => absensiList.filter((a) => a.santri_id === selectedId),
    [absensiList, selectedId]
  );

  const hadirCount = santriAbsensi.filter((a) => a.status === 'hadir').length;
  const totalCount = santriAbsensi.length;
  const percentage = totalCount > 0 ? Math.round((hadirCount / totalCount) * 100) : 0;

  function exportPdf() {
    if (!selectedSantri) return;
    setPdfError(null);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(16);
      doc.text('Laporan Perkembangan Santri', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`Tanggal cetak: ${todayStamp()}`, pageWidth / 2, 25, { align: 'center' });

      doc.setFontSize(11);
      doc.text(`Nama: ${selectedSantri.nama}`, 14, 36);
      doc.text(`Kelompok: ${selectedSantri.kelompok_id ?? '-'}`, 14, 43);
      doc.text(`Kehadiran: ${hadirCount} / ${totalCount} (${percentage}%)`, 14, 50);

      autoTable(doc, {
        startY: 58,
        head: [['Tanggal', 'Status']],
        body: santriAbsensi.map((a) => [a.tanggal, a.status ?? '-']),
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

      doc.save(`Laporan_Perkembangan_${selectedSantri.nama.replace(/\s+/g, '_')}_${todayStamp()}.pdf`);
    } catch {
      setPdfError('Gagal membuat PDF');
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow hover:shadow-md transition-shadow">
      <h2 className="mb-4 text-lg font-semibold text-gray-800">Laporan Perkembangan Santri</h2>

      {loading && <p className="text-sm text-gray-500">Memuat data...</p>}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && santriList.length === 0 && (
        <p className="text-sm text-gray-500">No data available</p>
      )}

      {!loading && !error && santriList.length > 0 && (
        <div className="space-y-4">
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 sm:w-64"
          >
            <option value="">Pilih santri...</option>
            {santriList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>

          {selectedSantri && (
            <div className="rounded border border-gray-200 p-3 text-sm">
              <p>
                <span className="font-medium">Nama:</span> {selectedSantri.nama}
              </p>
              <p>
                <span className="font-medium">Kelompok:</span> {selectedSantri.kelompok_id ?? '-'}
              </p>
              <p>
                <span className="font-medium">Kehadiran:</span> {hadirCount} / {totalCount} (
                {percentage}%)
              </p>
              {totalCount === 0 && (
                <p className="mt-1 text-gray-500">No data available untuk santri ini</p>
              )}
            </div>
          )}

          {selectedSantri && (
            <div>
              <button
                onClick={exportPdf}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Export PDF
              </button>
              {pdfError && <p className="mt-2 text-sm text-red-600">{pdfError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
