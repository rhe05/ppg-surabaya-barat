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

/* App lama memilih dashboard berdasarkan role (Script_Main.html:227-245):
   role 'guru' dikunci ke layar mobile-nya sendiri dan tidak pernah melihat
   shell admin. Percabangan di bawah meniru itu -- murni memilih markup,
   tidak mengubah cara data di-fetch.

   admin_kelompok (2026-08-24, Tier 1 fitur mobile admin_kelp) DAPAT DUA
   markup tergantung device SUNGGUHAN, beda dari guru yang selalu satu
   markup apa pun device-nya -- di layar lebar tetap AdminDashboard biasa
   (sidebar desktop, TIDAK disentuh), di layar sempit AdminKelpDashboard
   (kartu KPI + jalan pintas, gaya GuruDashboard). useIsMobile null
   selama belum diketahui (window belum ada) -- SENGAJA ditahan di layar
   netral, BUKAN default ke salah satu markup, supaya tidak sempat
   kelihatan salah pilih lalu "lompat" begitu device sungguhan diketahui
   (pola sama dgn `siap` di AdminSidebar.tsx). */
function DashboardContent() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();

  if (profile?.role === 'guru') return <GuruDashboard />;

  if (profile?.role === 'admin_kelompok') {
    if (isMobile === null) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
          <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={40} height={36} className="animate-pulse" />
          <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
        </main>
      );
    }
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
