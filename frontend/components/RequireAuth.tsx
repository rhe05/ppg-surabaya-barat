'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import AdminSidebar from '@/components/dashboard/AdminSidebar';

/* Halaman yang boleh dibuka peran `guru`, menyalin menu mobile guru app lama
   (Markup_Screens.html:229-257): Dashboard, Pilih Kelas, Jurnal, Kurikulum,
   Guru Izin + Minta Akses (keduanya di /guru-saya), Laporan. Menu Kelola
   Quote & User Management memang disembunyikan dari guru di app lama.

   RLS sudah membatasi DATA yang bisa dibaca guru, tapi tidak membatasi
   HALAMAN mana yang terbuka — tanpa daftar ini, guru yang mengetik /statistik
   atau /pendaftaran tetap masuk dan bertemu layar admin (yang isinya kosong
   atau ditolak), bukan pesan yang jelas. */
const HALAMAN_GURU = ['/dashboard', '/absensi', '/jurnal', '/kurikulum', '/guru-saya', '/reports'];

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/auth/login');
      return;
    }
    /* Profil ADA tapi belum berperan = akun baru yang belum/masih menunggu
       disetujui. Tanpa pengalihan ini ia mendarat di dashboard yang semua
       datanya ditolak RLS — terbaca sebagai aplikasi rusak, bukan sebagai
       "menunggu persetujuan".

       Syaratnya sengaja `profile !== null`, bukan `!profile?.role`: selama
       profil masih dimuat nilainya null, dan mengalihkan saat itu akan
       melempar SEMUA orang ke /onboarding sekejap sebelum profilnya tiba. */
    if (!loading && session && profile !== null && !profile.role) {
      router.replace('/onboarding');
      return;
    }
    if (
      !loading &&
      profile?.role === 'guru' &&
      pathname &&
      !HALAMAN_GURU.some((h) => pathname === h || pathname.startsWith(h + '/'))
    ) {
      router.replace('/dashboard');
    }
  }, [loading, session, profile, pathname, router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Memuat sesi...</p>
      </main>
    );
  }

  if (!session) {
    return null;
  }

  /* Sidebar navigasi desktop — HANYA utk admin_ppg/admin_desa/admin_kelompok
     (diminta owner 20 Agt: perbaiki tampilan DESKTOP admin, jangan sentuh
     mobile SAMA SEKALI). Peran 'guru' tidak pernah masuk cabang ini, jadi
     seluruh app guru (mobile) taknya persis seperti sebelumnya.
     AdminSidebar sendiri `hidden md:flex` -- di bawah breakpoint md,
     wrapper flex ini transparan (sidebar tidak makan ruang), jadi tampilan
     admin di layar sempit pun tidak berubah, cuma dapat sidebar di layar
     lebar. */
  const tampilkanSidebar = !!profile?.role && profile.role !== 'guru';
  if (!tampilkanSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
