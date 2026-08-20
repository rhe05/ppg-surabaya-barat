'use client';

/* /reports dipakai DUA peran (RequireAuth.tsx: HALAMAN_GURU) -- guru lewat
   menu "Laporan" (MenuGuru.tsx), admin lewat sidebar "Laporan & Export"
   (AdminSidebar.tsx). Diminta owner (20 Agt): tampilan guru disamakan dgn
   screenshot app lama (kartu Laporan Perkembangan Santri) -- TANPA
   mengubah tampilan admin, jadi dicabang di sini berdasar profile.role,
   bukan menimpa ReportsContent yang sudah ada. */

import { useState } from 'react';
import SantriProgressReport from '@/components/SantriProgressReport';
import AttendanceSummaryReport from '@/components/AttendanceSummaryReport';
import RequireAuth from '@/components/RequireAuth';
import GuruLaporanView from '@/components/laporan/GuruLaporanView';
import { useAuth } from '@/lib/auth-context';

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

function ReportsGate() {
  const { profile } = useAuth();
  if (profile?.role === 'guru') return <GuruLaporanView />;
  return <ReportsContent />;
}

export default function ReportsPage() {
  return (
    <RequireAuth>
      <ReportsGate />
    </RequireAuth>
  );
}
