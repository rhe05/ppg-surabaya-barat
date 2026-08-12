'use client';

import { useState } from 'react';
import SantriProgressReport from '@/components/SantriProgressReport';
import AttendanceSummaryReport from '@/components/AttendanceSummaryReport';
import RequireAuth from '@/components/RequireAuth';

type Tab = 'progress' | 'summary';

function ReportsContent() {
  const [tab, setTab] = useState<Tab>('progress');

  return (
    <main className="min-h-screen bg-gray-50 p-6 print:bg-white print:p-0">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Laporan</h1>

      <div className="mb-6 flex gap-2 print:hidden">
        <button
          onClick={() => setTab('progress')}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            tab === 'progress' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 shadow'
          }`}
        >
          Perkembangan Santri
        </button>
        <button
          onClick={() => setTab('summary')}
          className={`rounded px-3 py-1.5 text-sm font-medium ${
            tab === 'summary' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 shadow'
          }`}
        >
          Ringkasan Absensi
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {tab === 'progress' ? <SantriProgressReport /> : <AttendanceSummaryReport />}
      </div>
    </main>
  );
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <ReportsContent />
    </RequireAuth>
  );
}
