'use client';

/* Halaman berdiri sendiri utk Data Santri — diminta owner (20 Agt): item
   "Data Santri" sudah ada di AdminSidebar tapi belum ada tujuannya.
   Sebelumnya SantriList cuma komponen yang nempel di /dashboard (setengah
   lebar, berbagi baris dgn GuruList); sekarang dipindah ke halaman sendiri
   biar dapat ruang penuh dan cocok dgn nav sidebar yang sudah menunjuk ke
   /santri, sama seperti /kelola-absensi dkk yang juga satu halaman = satu
   fitur. */

import RequireAuth from '@/components/RequireAuth';
import SantriList from '@/components/SantriList';

export default function SantriPage() {
  return (
    <RequireAuth>
      <main className="mx-auto max-w-5xl p-6">
        <SantriList />
      </main>
    </RequireAuth>
  );
}
