'use client';

/* Fitur "Peringkat" (2026-08-27) — peringkat kehadiran berbasis poin.
   - admin_kelompok (mobile): PeringkatKelpMobile penuh (bisa atur poin).
   - guru (mobile, 2026-08-28): PeringkatKelpMobile `hanyaLihat` — lihat
     saja, tidak bisa mengubah nilai poin.
   Peran/perangkat lain diarahkan ke Statistik desktop yang sudah ada. */

import RequireAuth from '@/components/RequireAuth';
import AdminHeader from '@/components/dashboard/AdminHeader';
import { useAuth } from '@/lib/auth-context';
import PeringkatKelpMobile from '@/components/dashboard/PeringkatKelpMobile';

function PeringkatContent() {
  const { profile } = useAuth();

  if (profile?.role === 'admin_kelompok') {
    return <PeringkatKelpMobile />;
  }
  if (profile?.role === 'guru') {
    return <PeringkatKelpMobile hanyaLihat />;
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Peringkat" />
      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-8">
        <p className="text-[13px] text-text-dim">
          Peringkat kehadiran per kelompok tersedia untuk akun admin kelompok dan guru. Untuk cakupan
          lebih luas, gunakan halaman Statistik.
        </p>
      </div>
    </main>
  );
}

export default function PeringkatPage() {
  return (
    <RequireAuth>
      <PeringkatContent />
    </RequireAuth>
  );
}
