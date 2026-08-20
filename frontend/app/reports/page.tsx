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
import AdminHeader from '@/components/dashboard/AdminHeader';
import GuruLaporanView from '@/components/laporan/GuruLaporanView';
import { useAuth } from '@/lib/auth-context';

type Tab = 'progress' | 'summary';

const TAB: { nilai: Tab; label: string }[] = [
  { nilai: 'progress', label: 'Perkembangan Santri' },
  { nilai: 'summary', label: 'Ringkasan Absensi' },
];

function ReportsContent() {
  const [tab, setTab] = useState<Tab>('progress');

  return (
    <main className="min-h-screen bg-bg print:bg-white">
      <AdminHeader judul="Laporan & Export" />

      <div className="mx-auto w-full max-w-[1200px] px-5 pt-5 pb-10 print:p-0">
        {/* Segmented control brass, samakan dgn bahasa desain admin
            lainnya (AdminHeader dkk) -- bukan tab biru generik. */}
        <div className="mb-5 inline-flex gap-1 rounded-[var(--radius)] border border-border bg-panel-2 p-1 print:hidden">
          {TAB.map((t) => (
            <button
              key={t.nilai}
              type="button"
              onClick={() => setTab(t.nilai)}
              className={`cursor-pointer rounded-[calc(var(--radius)-2px)] px-3.5 py-2 text-[13px] font-semibold transition-all duration-150 ${
                tab === t.nilai ? 'bg-panel text-brass shadow-[var(--shadow-subtle)]' : 'text-text-dim hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

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
