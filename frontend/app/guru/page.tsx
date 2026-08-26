'use client';

/* Halaman berdiri sendiri utk Data Guru — pasangan app/santri/page.tsx,
   alasan sama: item "Data Guru" sudah ada di AdminSidebar, GuruList
   dipindah dari /dashboard (setengah lebar) ke sini (ruang penuh).

   Cabang mobile admin_kelompok (2026-08-26, diminta owner: tambah "Data
   Guru" di menu utama HP) -- pola SAMA PERSIS dashboard/page.tsx
   (useIsMobile + role check): GuruList.tsx desktop adalah tabel penuh,
   tidak cocok dibuka di layar sempit (belum pernah py header/hamburger
   pun di rute ini), jadi admin_kelompok di HP melihat GuruKelpMobile.tsx
   (kartu, gaya Data Generus) -- peran/perangkat lain TIDAK berubah. */

import RequireAuth from '@/components/RequireAuth';
import GuruList from '@/components/GuruList';
import GuruKelpMobile from '@/components/dashboard/GuruKelpMobile';
import { useAuth } from '@/lib/auth-context';
import { useIsMobile } from '@/lib/useIsMobile';

function GuruContent() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();

  if (profile?.role === 'admin_kelompok' && isMobile) {
    return <GuruKelpMobile />;
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <GuruList />
    </main>
  );
}

export default function GuruPage() {
  return (
    <RequireAuth>
      <GuruContent />
    </RequireAuth>
  );
}
