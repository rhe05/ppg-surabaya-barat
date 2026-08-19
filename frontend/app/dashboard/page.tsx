'use client';

import AbsensiChart from '@/components/AbsensiChart';
import RequireAuth from '@/components/RequireAuth';
import GuruDashboard from '@/components/dashboard/GuruDashboard';
import RingkasanKpi from '@/components/dashboard/RingkasanKpi';
import PohonWilayah from '@/components/dashboard/PohonWilayah';
import { useAuth } from '@/lib/auth-context';

function AdminDashboard() {
  const { user, profile, profileError } = useAuth();

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

      {/* .dash-container — Style_Main.html:838-843 */}
      <div className="mx-auto w-full max-w-[1200px] px-5 py-10">
        {/* .kpi-card sebagai panel — Style_Main.html:859-866 */}
        <div className="mb-6 rounded-card border border-border bg-panel p-6 text-[13px] shadow-[var(--shadow-card)]">
          <p>
            <span className="font-semibold text-text-dim">Email:</span> {user?.email}
          </p>
          {profile && (
            <>
              <p>
                <span className="font-semibold text-text-dim">Nama:</span>{' '}
                {profile.display_name ?? '-'}
              </p>
              <p>
                <span className="font-semibold text-text-dim">Role:</span> {profile.role ?? '-'}
              </p>
              <p>
                <span className="font-semibold text-text-dim">Scope:</span>{' '}
                {profile.scope_ppg_id
                  ? `PPG ${profile.scope_ppg_id}`
                  : profile.scope_desa_id
                    ? `Desa ${profile.scope_desa_id}`
                    : profile.scope_kelompok_id
                      ? `Kelompok ${profile.scope_kelompok_id}`
                      : '-'}
              </p>
            </>
          )}
          {profileError && <p className="text-red">{profileError}</p>}
        </div>

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
