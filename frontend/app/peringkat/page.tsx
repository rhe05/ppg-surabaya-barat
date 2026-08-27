'use client';

/* Fitur "Peringkat" (2026-08-27) — peringkat kehadiran berbasis poin.
   Untuk saat ini khusus tampilan mobile admin_kelp (PeringkatKelpMobile);
   peran/perangkat lain diarahkan ke Statistik desktop yang sudah ada. */

import RequireAuth from '@/components/RequireAuth';
import AdminHeader from '@/components/dashboard/AdminHeader';
import { useAuth } from '@/lib/auth-context';
import PeringkatKelpMobile from '@/components/dashboard/PeringkatKelpMobile';

function PeringkatContent() {
  const { profile } = useAuth();

  if (profile?.role === 'admin_kelompok') {
    return <PeringkatKelpMobile />;
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Peringkat" />
      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-8">
        <p className="text-[13px] text-text-dim">
          Peringkat kehadiran per kelompok tersedia untuk akun admin kelompok. Untuk cakupan lebih
          luas, gunakan halaman Statistik.
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
