'use client';

import AbsensiChart from '@/components/AbsensiChart';
import RequireAuth from '@/components/RequireAuth';
import GuruDashboard from '@/components/dashboard/GuruDashboard';
import RingkasanKpi from '@/components/dashboard/RingkasanKpi';
import PohonWilayah from '@/components/dashboard/PohonWilayah';
import { useAuth } from '@/lib/auth-context';

function AdminDashboard() {
  return (
    <main className="min-h-screen bg-bg">
      {/* .dash-header — Style_Main.html:740-752. Tombol "Keluar" yang
          dulu di sini DIHAPUS (diminta owner 20 Agt: samakan/perbaiki
          desktop admin) -- sekarang duplikat dgn logout di footer
          AdminSidebar, dan sidebar itu tampil di SEMUA halaman admin,
          jadi tombol per-halaman terpisah cuma menambah keramaian. */}
      <div className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center border-b border-border bg-panel px-5 shadow-[var(--shadow-subtle)]">
        <h1 className="m-0 text-[16px] font-semibold text-text">Dashboard</h1>
      </div>

      {/* .dash-container — Style_Main.html:838-843. Kartu info akun
          (Email/Nama/Role/Scope) yang dulu di sini DIHAPUS (diminta
          owner 20 Agt) -- itu data debug internal, bukan informasi yang
          berguna utk dilihat admin sehari-hari, dan identitas peran
          sudah tampil di footer AdminSidebar.
          pt dikecilkan (dari py-10 rata) -- diminta owner: judul "Data
          Generus - Surabaya Barat" dinaikkan sedikit, lebih dekat ke
          blok header "Dashboard" di atasnya. */}
      <div className="mx-auto w-full max-w-[1200px] px-5 pt-5 pb-10">
        <div className="mb-10">
          <RingkasanKpi />
        </div>

        <PohonWilayah />

        <AbsensiChart />
      </div>
    </main>
  );
}

/* App lama memilih dashboard berdasarkan role (Script_Main.html:227-245):
   role 'guru' dikunci ke layar mobile-nya sendiri dan tidak pernah melihat
   shell admin. Percabangan di bawah meniru itu -- murni memilih markup,
   tidak mengubah cara data di-fetch. */
function DashboardContent() {
  const { profile } = useAuth();
  if (profile?.role === 'guru') return <GuruDashboard />;
  return <AdminDashboard />;
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
