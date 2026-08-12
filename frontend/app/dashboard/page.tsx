'use client';

import { useRouter } from 'next/navigation';
import SantriList from '@/components/SantriList';
import GuruList from '@/components/GuruList';
import AbsensiChart from '@/components/AbsensiChart';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';

function DashboardContent() {
  const { user, profile, profileError, signOut } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push('/auth/login');
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={handleLogout}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Keluar
        </button>
      </div>

      <div className="mb-6 rounded-lg bg-white p-4 text-sm shadow">
        <p>
          <span className="font-medium">Email:</span> {user?.email}
        </p>
        {profile && (
          <>
            <p>
              <span className="font-medium">Nama:</span> {profile.display_name ?? '-'}
            </p>
            <p>
              <span className="font-medium">Role:</span> {profile.role ?? '-'}
            </p>
            <p>
              <span className="font-medium">Scope:</span>{' '}
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
        {profileError && <p className="text-red-600">{profileError}</p>}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <SantriList />
        <GuruList />
        <div className="md:col-span-2">
          <AbsensiChart />
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
