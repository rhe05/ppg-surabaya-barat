'use client';

/* Halaman berdiri sendiri utk Data Guru — pasangan app/santri/page.tsx,
   alasan sama: item "Data Guru" sudah ada di AdminSidebar, GuruList
   dipindah dari /dashboard (setengah lebar) ke sini (ruang penuh). */

import RequireAuth from '@/components/RequireAuth';
import GuruList from '@/components/GuruList';

export default function GuruPage() {
  return (
    <RequireAuth>
      <main className="mx-auto max-w-5xl p-6">
        <GuruList />
      </main>
    </RequireAuth>
  );
}
