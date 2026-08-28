'use client';

/* Bottom tab bar GURU (2026-08-28) — pengganti hamburger dropdown 11 item
   yang selama ini jadi SATU-SATUNYA jalan guru berpindah layar
   (GuruDashboard sendiri nol tombol navigasi). Menyusul pola yang sudah
   dipakai admin sejak 2026-08-27 (AdminBottomNav.tsx).

   Dirender SEKALI di RequireAuth.tsx (gerbang tunggal yang sudah
   membungkus SEMUA halaman guru) -- bukan di tiap chrome (GuruDashboard /
   GuruAbsensiView / JurnalHeaderChrome punya topbar masing-masing), supaya
   tidak ada layar yang diam-diam ketinggalan navnya.

   4 tab paling sering dipakai harian + 1 tab "Menu" (bottom sheet) utk
   sisanya + Keluar. Kehadiran & Jurnal SENGAJA membuka popup pemilih yang
   sama dgn menu lama (KehadiranChooser/JurnalChooser: Input vs Riwayat /
   Rencana vs Pelaksanaan vs Riwayat), bukan langsung pindah halaman --
   perilaku ini sudah dikenal guru, tidak diubah.

   Lebar dikunci max-w-[430px] mx-auto: RequireAuth mengunci seluruh app
   guru ke kolom 430px, tapi elemen `fixed` di dalamnya tetap mengacu ke
   viewport SUNGGUHAN (RequireAuth sengaja tidak memakai `transform`, lihat
   komentar panjang di sana) -- jadi pembatasan lebar dilakukan DI DALAM
   elemen fixed ini, pola yang sama dgn tombol "Simpan Kehadiran". */

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  House,
  ClipboardCheck,
  NotebookPen,
  GraduationCap,
  Menu as MenuIcon,
  BookOpen,
  Banknote,
  Trophy,
  Megaphone,
  CalendarDays,
  UserRound,
  FileText,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import KehadiranChooser from '@/components/dashboard/KehadiranChooser';
import JurnalChooser from '@/components/dashboard/JurnalChooser';

type Tab = {
  label: string;
  ikon: typeof House;
  href?: string;
  aksi?: 'kehadiran' | 'jurnal';
  cocok: string[];
};

const TAB: Tab[] = [
  { label: 'Beranda', ikon: House, href: '/dashboard', cocok: ['/dashboard'] },
  { label: 'Kehadiran', ikon: ClipboardCheck, aksi: 'kehadiran', cocok: ['/absensi'] },
  { label: 'Jurnal', ikon: NotebookPen, aksi: 'jurnal', cocok: ['/jurnal'] },
  { label: 'Generus', ikon: GraduationCap, href: '/santri-saya', cocok: ['/santri-saya'] },
];

const LAINNYA: { label: string; href: string; ikon: typeof House }[] = [
  { label: 'Kurikulum', href: '/kurikulum', ikon: BookOpen },
  { label: 'Tabungan', href: '/tabungan', ikon: Banknote },
  { label: 'Peringkat', href: '/peringkat', ikon: Trophy },
  { label: 'Pengumuman', href: '/pengumuman', ikon: Megaphone },
  { label: 'Guru Izin', href: '/guru-saya', ikon: CalendarDays },
  { label: 'Minta Akses', href: '/guru-saya?v=akses', ikon: UserRound },
  { label: 'Laporan', href: '/reports', ikon: FileText },
];

export default function GuruBottomNav() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { signOut } = useAuth();
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [kehadiranTerbuka, setKehadiranTerbuka] = useState(false);
  const [jurnalTerbuka, setJurnalTerbuka] = useState(false);

  const aktif = (t: Tab) => t.cocok.some((c) => pathname === c || pathname.startsWith(c + '/'));
  const menuAktif = TAB.every((t) => !aktif(t));

  /* Prefetch semua tujuan tab + isi sheet sekali di awal -- alasan sama
     persis dgn MenuGuru.tsx (2026-08-23): tanpa ini, chunk halaman tujuan
     baru diminta SAAT diklik, dan Dashboard polos sempat kelihatan
     sebelum pindah. */
  useEffect(() => {
    for (const t of TAB) if (t.href) router.prefetch(t.href);
    for (const m of LAINNYA) router.prefetch(m.href);
  }, [router]);

  function klikTab(t: Tab) {
    if (t.aksi === 'kehadiran') setKehadiranTerbuka(true);
    else if (t.aksi === 'jurnal') setJurnalTerbuka(true);
    else if (t.href) router.push(t.href);
  }

  function pergi(href: string) {
    setMenuTerbuka(false);
    router.push(href);
  }

  async function keluar() {
    setMenuTerbuka(false);
    await signOut();
    router.push('/auth/login');
  }

  return (
    <>
      <KehadiranChooser terbuka={kehadiranTerbuka} onTutup={() => setKehadiranTerbuka(false)} />
      <JurnalChooser terbuka={jurnalTerbuka} onTutup={() => setJurnalTerbuka(false)} />

      <nav
        data-guru-nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(15,23,42,0.06)]"
      >
        <div className="mx-auto flex w-full max-w-[430px]">
          {TAB.map((t) => {
            const on = aktif(t);
            const Ikon = t.ikon;
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => klikTab(t)}
                className="flex flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-transparent px-1 pt-2 pb-1.5 active:opacity-60"
              >
                <Ikon
                  size={20}
                  strokeWidth={on ? 2.4 : 2}
                  className={on ? 'text-sage' : 'text-text-faint'}
                />
                <span className={`text-[10px] font-bold ${on ? 'text-sage' : 'text-text-faint'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuTerbuka(true)}
            className="flex flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-transparent px-1 pt-2 pb-1.5 active:opacity-60"
          >
            <MenuIcon
              size={20}
              strokeWidth={menuAktif ? 2.4 : 2}
              className={menuAktif ? 'text-sage' : 'text-text-faint'}
            />
            <span className={`text-[10px] font-bold ${menuAktif ? 'text-sage' : 'text-text-faint'}`}>
              Menu
            </span>
          </button>
        </div>
      </nav>

      {menuTerbuka &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[560] bg-black/40" onClick={() => setMenuTerbuka(false)} />
            <div className="fixed inset-x-0 bottom-0 z-[561] mx-auto w-full max-w-[430px] rounded-t-[24px] border border-border bg-panel px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-16px_48px_rgba(0,0,0,0.28)]">
              <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border" />
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[15px] font-extrabold text-text">Menu</span>
                <button
                  type="button"
                  onClick={() => setMenuTerbuka(false)}
                  aria-label="Tutup"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex flex-col">
                {LAINNYA.map((m) => {
                  const Ikon = m.ikon;
                  return (
                    <button
                      key={m.href}
                      type="button"
                      onClick={() => pergi(m.href)}
                      className="flex cursor-pointer items-center gap-3 rounded-[10px] border-none bg-transparent px-2 py-3 text-left text-[14px] font-semibold text-text active:bg-bg"
                    >
                      <Ikon size={18} strokeWidth={2} className="shrink-0 text-sage" />
                      {m.label}
                    </button>
                  );
                })}
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={keluar}
                  className="flex cursor-pointer items-center gap-3 rounded-[10px] border-none bg-transparent px-2 py-3 text-left text-[14px] font-semibold text-red active:bg-bg"
                >
                  <LogOut size={18} strokeWidth={2} className="shrink-0 text-red" />
                  Keluar
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
