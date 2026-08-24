'use client';

/* Header bersama utk halaman admin (20 Agt, putaran ketujuh) — dulu
   app/dashboard/page.tsx dan app/santri/page.tsx masing-masing menulis
   blok .dash-header sendiri (markup identik, disalin-tempel). Sekarang satu
   komponen: judul di kiri (boleh string statis spt "Dashboard" atau node
   dinamis spt "Data Generus - <cakupan>"), identitas peran (label peran +
   nama kelompok kalau ada) otomatis di kanan -- sebelumnya identitas ini
   cuma ditambahkan manual di /santri (lihat riwayat: dulu di footer
   AdminSidebar, lalu dipindah ke sana secara ad-hoc). Halaman admin lain
   yang belum pakai header ini (Guru, Kelas, dst.) tinggal pasang komponen
   ini kalau owner minta konsistensi lebih lanjut -- TIDAK diubah sekarang,
   di luar cakupan permintaan ini. */

import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { LABEL_PERAN } from '@/lib/roles';
import BellPermintaanAdmin from '@/components/notifikasi/BellPermintaanAdmin';
import MenuAdmin from '@/components/dashboard/MenuAdmin';

export default function AdminHeader({
  judul,
  tampilkanLogo,
}: {
  judul: ReactNode;
  /* Dashboard mobile admin_kelp (2026-08-24, diminta owner): di layar
     sempit sebelah hamburger tampilkan logo+nama aplikasi ("Ruang
     Ngaji"), BUKAN judul halaman "Dashboard" -- persis pola topbar
     GuruDashboard.tsx/JurnalHeaderChrome.tsx. Cuma di Dashboard, bukan
     semua halaman admin -- halaman lain (Registrasi, dst) tetap butuh
     judulnya sendiri sbg konteks navigasi. Cuma md:hidden -- di layar
     lebar AdminSidebar sudah py logo yang sama, menampilkannya lagi di
     sini cuma dobel; desktop tetap lihat teks "Dashboard" spt semula. */
  tampilkanLogo?: boolean;
}) {
  const { profile, namaKelompok } = useAuth();
  const labelPeran = profile?.role ? (LABEL_PERAN[profile.role] ?? profile.role) : null;

  /* Hamburger HANYA di layar sempit (md:hidden) -- AdminSidebar sudah
     menyediakan navigasi yang sama di layar lebar (hidden md:flex),
     dua-duanya sengaja saling melengkapi persis breakpoint yang sama
     supaya tidak pernah dobel ATAU tidak ada sama sekali. Sebelum ini
     admin di HP tidak py jalan pindah halaman selain tombol back
     browser (dilaporkan lewat kerja bareng 2026-08-24, fitur Dashboard
     Kehadiran Kelompok). */
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [posisiMenu, setPosisiMenu] = useState<{ top: number; left: number } | null>(null);
  const tombolMenuRef = useRef<HTMLButtonElement>(null);

  return (
    // .dash-header — Style_Main.html:740-752
    <div className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-5 shadow-[var(--shadow-subtle)]">
      <div className="flex min-w-0 items-center gap-2">
        <button
          ref={tombolMenuRef}
          type="button"
          aria-label="Menu"
          onClick={() => {
            const r = tombolMenuRef.current?.getBoundingClientRect();
            if (r) setPosisiMenu({ top: r.bottom + 8, left: r.left });
            setMenuTerbuka((v) => !v);
          }}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92] md:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" y1="7" x2="20" y2="7" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="17" x2="20" y2="17" />
          </svg>
        </button>
        {tampilkanLogo && (
          <div className="flex min-w-0 items-center gap-[7px] md:hidden">
            <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={20} height={18} className="block shrink-0" />
            <span className="truncate text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          </div>
        )}
        <h1
          className={`m-0 truncate text-[16px] font-semibold text-text ${tampilkanLogo ? 'hidden md:block' : ''}`}
        >
          {judul}
        </h1>
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

      <MenuAdmin terbuka={menuTerbuka} posisi={posisiMenu} onTutup={() => setMenuTerbuka(false)} />
    </div>
  );
}
