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
  if (tampilkanSidebar) {
    return (
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }

  /* App guru dikunci ke lebar HP (diminta owner 20 Agt): dibuka lewat
     browser desktop, seluruh markup guru (GuruDashboard dkk) TIDAK punya
     batas lebar sendiri sehingga melebar penuh ke lebar jendela desktop --
     grid statistik 5-kolom jadi lebar sekali, terasa rusak. Bukan
     tanggung jawab tiap halaman guru utk membatasi diri sendiri; satu
     bungkus di sini (gerbang tunggal yang sudah ada, sama seperti
     AdminSidebar di atas) cukup utk SEMUA halaman guru sekaligus.
     max-w-[430px] w-full: di HP sungguhan (viewport < 430px) w-full yang
     menang, bungkus ini transparan -- tampilan guru TIDAK berubah sama
     sekali di sana, cuma diam-diam di-cap di layar lebar.

     SENGAJA tidak diberi `transform` di sini utk menjadikannya containing
     block bagi descendant `position: fixed` (godaan wajar, krn tombol
     "Simpan Kehadiran" di GuruAbsensiView.tsx tetap fixed ke viewport
     LUAR kolom ini, bukan ke 430px-nya). Sudah dicoba & DIBATALKAN:
     GuruDashboard punya popup Bulan/Tahun yg posisinya dihitung dari
     getBoundingClientRect()+window.innerWidth (keduanya SELALU relatif ke
     viewport SUNGGUHAN, tidak tahu-menahu soal transform ancestor) --
     kalau kolom ini jadi containing block sementara perhitungan
     posisinya masih pakai window.innerWidth, popup itu akan melenceng ke
     kiri layar desktop. Elemen fixed yang lebar sendiri (spt tombol
     Simpan) diperbaiki LANGSUNG di komponennya (bungkus max-w-[430px]
     mx-auto DI DALAM elemen fixed itu), bukan lewat trik ancestor di
     sini. */
  if (profile?.role === 'guru') {
    return (
      <div className="min-h-screen w-full bg-border">
        <div className="mx-auto min-h-screen w-full max-w-[430px] bg-bg shadow-[0_0_40px_rgba(15,23,42,0.12)]">
          {children}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
