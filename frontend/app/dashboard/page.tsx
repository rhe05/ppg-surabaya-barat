'use client';

import Image from 'next/image';
import AbsensiChart from '@/components/AbsensiChart';
import RequireAuth from '@/components/RequireAuth';
import GuruDashboard from '@/components/dashboard/GuruDashboard';
import AdminKelpDashboard from '@/components/dashboard/AdminKelpDashboard';
import RingkasanKpi from '@/components/dashboard/RingkasanKpi';
import PohonWilayah from '@/components/dashboard/PohonWilayah';
import AdminHeader from '@/components/dashboard/AdminHeader';
import { useAuth } from '@/lib/auth-context';
import { useIsMobile } from '@/lib/useIsMobile';

function AdminDashboard() {
  return (
    <main className="min-h-screen bg-bg">
      {/* Header bersama (20 Agt, putaran ketujuh) — components/dashboard/
          AdminHeader.tsx, dulu blok ini ditulis sendiri di sini. Tombol
          "Keluar" yang dulu ada di sini DIHAPUS (diminta owner 20 Agt:
          samakan/perbaiki desktop admin) -- sekarang duplikat dgn logout
          di footer AdminSidebar, dan sidebar itu tampil di SEMUA halaman
          admin, jadi tombol per-halaman terpisah cuma menambah keramaian. */}
      <AdminHeader judul="Dashboard" />

      {/* .dash-container — Style_Main.html:838-843. Kartu info akun
          (Email/Nama/Role/Scope) yang dulu di sini DIHAPUS (diminta
          owner 20 Agt) -- itu data debug internal, bukan informasi yang
          berguna utk dilihat admin sehari-hari, dan identitas peran
          sudah tampil di footer AdminSidebar.
          pt dikecilkan (dari py-10 rata) -- diminta owner: judul "Data
          Generus - Surabaya Barat" dinaikkan sedikit, lebih dekat ke
          blok header "Dashboard" di atasnya. */}
      <div className="mx-auto w-full max-w-[1200px] px-5 pt-5 pb-10">
        <div className="mb-10">
          <RingkasanKpi />
        </div>

        <PohonWilayah />

        <AbsensiChart />
      </div>
    </main>
  );
}

function LayarMemuatDashboard() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={40} height={36} className="animate-pulse" />
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
    </main>
  );
}

/* App lama memilih dashboard berdasarkan role (Script_Main.html:227-245):
   role 'guru' dikunci ke layar mobile-nya sendiri dan tidak pernah melihat
   shell admin. Percabangan di bawah meniru itu -- murni memilih markup,
   tidak mengubah cara data di-fetch.

   Guard `!profile?.role` (2026-08-24, dilaporkan owner: klik "Masuk" di
   /auth/login lalu router.push('/dashboard') sempat kelihatan sekilas
   "dashboard desktop" sebelum ke tampilan yg benar) -- RequireAuth.tsx
   sendiri SUDAH menahan di layar loading selama `profile` masih null,
   tapi begitu profile TIBA, komponen ini langsung jalan; kalau pada
   render itu `profile.role` belum genap terisi (mis. akun baru yg
   belum diarahkan ke /onboarding, atau jendela sangat singkat sesaat
   query profil baru selesai) percabangan LAMA di bawah ini jatuh ke
   `return <AdminDashboard />` (fallback paling akhir) HANYA krn bukan
   'guru'/'admin_kelompok' -- padahal itu bukan berarti admin_ppg/desa,
   melainkan "belum tahu". Guard ini menutup celah itu: jangan pernah
   defaultkan ke tampilan desktop selama peran belum benar2 diketahui. */
function DashboardContent() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();

  if (!profile?.role) return <LayarMemuatDashboard />;

  if (profile.role === 'guru') return <GuruDashboard />;

  if (profile.role === 'admin_kelompok') {
    if (isMobile === null) return <LayarMemuatDashboard />;
    if (isMobile) return <AdminKelpDashboard />;
  }

  return <AdminDashboard />;
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
