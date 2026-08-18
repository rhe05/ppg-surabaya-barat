'use client';

/* Halaman root. Sebelumnya masih halaman contoh bawaan create-next-app —
   pengunjung alamat utama aplikasi disambut logo Next.js dan tulisan
   "To get started, edit page.tsx".

   Tugasnya cuma satu: mengarahkan. Yang sudah login ke /dashboard, yang
   belum ke /auth/login. Tidak ada isi sendiri, jadi tidak ada yang perlu
   dirawat dua kali saat dashboard berubah. */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? '/dashboard' : '/auth/login');
  }, [loading, session, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-panel p-6">
      <div className="text-center">
        <h1 className="text-[24px] font-bold text-text">Ruang Ngaji</h1>
        <p className="mt-2 text-[13px] text-text-dim">PPG Surabaya Barat</p>
        <p className="mt-6 text-[13px] text-text-faint">Mengalihkan...</p>
      </div>
    </main>
  );
}
