'use client';

/* Header bersama utk halaman admin. Kiri: logo+"Ruang Ngaji" di HP, judul
   halaman di desktop. Kanan: lonceng + identitas peran.

   Navigasi mobile: hamburger dropdown lama DIGANTI bottom tab bar
   (AdminBottomNav.tsx, 2026-08-27) -- dirender di sini supaya otomatis
   ada di semua halaman admin. Desktop tetap pakai AdminSidebar. */

import type { ReactNode } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { LABEL_PERAN } from '@/lib/roles';
import BellPermintaanAdmin from '@/components/notifikasi/BellPermintaanAdmin';
import AdminBottomNav from '@/components/dashboard/AdminBottomNav';

export default function AdminHeader({ judul }: { judul: ReactNode }) {
  const { profile, namaKelompok } = useAuth();
  const labelPeran = profile?.role ? (LABEL_PERAN[profile.role] ?? profile.role) : null;

  return (
    <>
      <div className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-5 shadow-[var(--shadow-subtle)]">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 items-center gap-[7px] md:hidden">
            <Image
              src="/logo-ruang-ngaji.png"
              alt="Ruang Ngaji"
              width={20}
              height={18}
              className="block shrink-0"
            />
            <span className="truncate text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          </div>
          <h1 className="m-0 hidden truncate text-[16px] font-semibold text-text md:block">{judul}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <BellPermintaanAdmin />
          {labelPeran && (
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-[12px] font-semibold text-text">{labelPeran}</div>
              {namaKelompok && <div className="text-[11px] text-text-faint">{namaKelompok}</div>}
            </div>
          )}
        </div>
      </div>

      <AdminBottomNav />
    </>
  );
}
