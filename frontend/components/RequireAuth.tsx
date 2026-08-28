'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import AdminSidebar from '@/components/dashboard/AdminSidebar';
import GuruBottomNav from '@/components/dashboard/GuruBottomNav';
import BannerOffline from '@/components/ui/BannerOffline';

/* Halaman yang boleh dibuka peran `guru`, menyalin menu mobile guru app lama
   (Markup_Screens.html:229-257): Dashboard, Pilih Kelas, Jurnal, Kurikulum,
   Guru Izin + Minta Akses (keduanya di /guru-saya), Laporan. Menu Kelola
   Quote & User Management memang disembunyikan dari guru di app lama.

   RLS sudah membatasi DATA yang bisa dibaca guru, tapi tidak membatasi
   HALAMAN mana yang terbuka — tanpa daftar ini, guru yang mengetik /statistik
   atau /pendaftaran tetap masuk dan bertemu layar admin (yang isinya kosong
   atau ditolak), bukan pesan yang jelas. */
const HALAMAN_GURU = [
  '/dashboard',
  '/absensi',
  '/jurnal',
  '/kurikulum',
  '/guru-saya',
  '/reports',
  '/santri-saya',
  '/pengumuman',
  '/tabungan',
  '/peringkat',
];

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, profileError } = useAuth();
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

  const layarMemuat = (
    /* Logo berdenyut (bukan teks "Memuat sesi..." polos) -- diminta owner
       2026-08-23, standar produk SaaS profesional. Ini titik loading yang
       PALING SERING dilihat di seluruh app (muncul di SETIAP pemuatan
       halaman, sebelum peran diketahui), tapi peran itu sendiri (guru vs
       admin, layout beda total) BELUM diketahui di sini -- jadi sengaja
       branding netral, bukan skeleton layout tertentu yang bisa salah
       tebak bentuk halamannya. */
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <Image
        src="/logo-ruang-ngaji.png"
        alt="Ruang Ngaji"
        width={40}
        height={36}
        className="animate-pulse"
      />
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
    </main>
  );

  if (loading) {
    return layarMemuat;
  }

  if (!session) {
    return null;
  }

  /* `loading` cuma menandai getSession() selesai -- `profile` (penentu
     guru/admin, sidebar-atau-tidak, kolom 430px-atau-tidak) baru dimuat
     lewat efek TERPISAH setelah `session` diketahui (auth-context.tsx),
     jadi ada jendela sesaat: session sudah ada, profile masih null.
     Tanpa penjagaan ini, jendela itu jatuh ke cabang paling bawah
     (`return <>{children}</>`) -- konten dirender TANPA sidebar admin
     MAUPUN kolom 430px, alias lebar penuh "desktop" -- baru sepersekian
     detik kemudian berpindah ke layout yang benar begitu profile.role
     tiba. Di HP (viewport sudah sempit) jendela ini nyaris tak terlihat,
     tapi di KOMPUTER lompatannya jelas kelihatan (dilaporkan owner:
     "dashboard desktop, jump/flip sekilas, lalu kembali"). Kalau
     profileError sudah ada (mis. "Profil tidak ditemukan"), profile TETAP
     null selamanya -- guard ini otomatis lepas supaya tidak nyangkut di
     loading selamanya, perilaku utk kasus error tidak berubah. */
  if (session && profile === null && !profileError) {
    return layarMemuat;
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
      <div className="flex min-h-screen animasi-konten-muncul">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
        {/* Admin di HP juga punya bottom nav (AdminBottomNav lewat
            AdminHeader), jadi banner diangkat sama tingginya. */}
        <BannerOffline adaBottomNav />
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
  /* GuruBottomNav dirender DI SINI (gerbang tunggal semua halaman guru),
     bukan di tiap chrome -- guru punya 3 topbar berbeda (GuruDashboard,
     GuruAbsensiView, JurnalHeaderChrome) dan menaruh nav di masing-masing
     berarti cepat atau lambat ada layar yang ketinggalan. Ruang bawah
     supaya konten tidak ketutup nav diatur di globals.css lewat
     `body:has([data-guru-nav]) main` -- BUKAN padding di kolom ini:
     GuruAbsensiView memakai `h-screen overflow-hidden`, dan menambah
     padding pada pembungkusnya membuat halaman jadi 100vh+60px (muncul
     scroll tipis yang tidak seharusnya ada). Lewat :has(), padding cuma
     berlaku saat navnya memang dirender -- di layar tugas yang navnya
     sengaja disembunyikan, padding itu otomatis ikut hilang. */
  if (profile?.role === 'guru') {
    return (
      <div className="min-h-screen w-full bg-border">
        <div className="animasi-konten-muncul mx-auto min-h-screen w-full max-w-[430px] bg-bg shadow-[0_0_40px_rgba(15,23,42,0.12)]">
          {children}
        </div>
        <GuruBottomNav />
        <BannerOffline adaBottomNav />
      </div>
    );
  }

  return (
    <>
      {children}
      <BannerOffline />
    </>
  );
}
