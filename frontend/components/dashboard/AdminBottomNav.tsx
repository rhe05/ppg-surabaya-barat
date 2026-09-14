'use client';

/* Bottom tab bar — navigasi utama admin di HP (2026-08-27, pengganti
   hamburger dropdown lama). Hanya `md:hidden` -- di layar lebar
   AdminSidebar tetap dipakai. Dirender SEKALI lewat AdminHeader.tsx jadi
   otomatis ada di semua halaman admin.

   4 tab langsung ke halaman paling sering dibuka + 1 tab "Menu" (bottom
   sheet) utk sisanya + Keluar. Tab aktif dicocokkan dari pathname
   (halaman turunan Data Master -> tab "Data" tetap aktif). */

import { createPortal } from 'react-dom';
import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  LayoutGrid,
  Trophy,
  Megaphone,
  Menu as MenuIcon,
  UserCheck,
  BarChart3,
  ClipboardCheck,
  Banknote,
  LogOut,
  X,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

type Tab = { label: string; href: string; ikon: typeof Home; cocok: string[] };

/* Rute yang dianggap "di bawah" tab Data (hub Data Master + turunannya). */
const RUTE_DATA = ['/data-master', '/guru', '/santri', '/kelas', '/siklus-generus', '/riwayat-guru'];

const TAB: Tab[] = [
  { label: 'Beranda', href: '/dashboard', ikon: Home, cocok: ['/dashboard'] },
  { label: 'Data', href: '/data-master', ikon: LayoutGrid, cocok: RUTE_DATA },
  { label: 'Peringkat', href: '/peringkat', ikon: Trophy, cocok: ['/peringkat'] },
  { label: 'Kabar', href: '/pengumuman', ikon: Megaphone, cocok: ['/pengumuman'] },
];

export default function AdminBottomNav() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { profile, signOut } = useAuth();
  const [menuTerbuka, setMenuTerbuka] = useState(false);

  const aktif = (t: Tab) => t.cocok.some((c) => pathname === c || pathname.startsWith(c + '/'));
  const menuAktif = TAB.every((t) => !aktif(t));

  const hrefRegistrasi = profile?.role === 'admin_kelompok' ? '/registrasi-guru' : '/pendaftaran';

  const lainnya = [
    { label: 'Keuangan', href: '/keuangan', ikon: Banknote },
    { label: 'Permintaan Generus', href: '/permintaan-generus', ikon: UserCheck },
    { label: 'Statistik', href: '/statistik', ikon: BarChart3 },
    { label: 'Registrasi', href: hrefRegistrasi, ikon: ClipboardCheck },
  ];

  /* Prefetch semua tujuan tab + isi sheet sekali di awal, pola SAMA
     PERSIS GuruBottomNav.tsx (2026-09-14, diminta owner: "audit
     semuanya apakah masih ada yang seperti itu" -- ditemukan file ini
     TIDAK PERNAH prefetch sama sekali). */
  useEffect(() => {
    for (const t of TAB) router.prefetch(t.href);
    for (const m of lainnya) router.prefetch(m.href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, hrefRegistrasi]);

  /* Tujuan yg sedang dinavigasi dari sheet "Menu" -- pola SAMA PERSIS
     GuruBottomNav.tsx (2026-09-14, diminta owner: bug sheet ditutup
     SEKETIKA sebelum navigasi selesai, menyingkap halaman sebelumnya
     sesaat -- ditemukan lewat audit menyeluruh, versi admin ini belum
     ikut diperbaiki sama sekali). Sheet TETAP TERBUKA (item yg diketuk
     diberi spinner, item lain diredupkan+dikunci) sampai `isPending`
     selesai, baru ditutup. */
  const [tujuanDinavigasi, setTujuanDinavigasi] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (tujuanDinavigasi && !isPending) {
      setMenuTerbuka(false);
      setTujuanDinavigasi(null);
    }
  }, [isPending, tujuanDinavigasi]);

  function pergi(href: string) {
    setTujuanDinavigasi(href);
    startTransition(() => {
      router.push(href);
    });
  }
  async function keluar() {
    setMenuTerbuka(false);
    await signOut();
    router.push('/auth/login');
  }

  return (
    <>
      <nav
        data-admin-nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(15,23,42,0.06)] md:hidden"
      >
        {TAB.map((t) => {
          const on = aktif(t);
          const Ikon = t.ikon;
          return (
            <button
              key={t.href}
              type="button"
              onClick={() => router.push(t.href)}
              className="flex flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-transparent px-1 pt-2 pb-1.5 active:opacity-60"
            >
              <Ikon size={20} strokeWidth={on ? 2.4 : 2} className={on ? 'text-brass' : 'text-text-faint'} />
              <span className={`text-[10px] font-bold ${on ? 'text-brass' : 'text-text-faint'}`}>
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
            className={menuAktif ? 'text-brass' : 'text-text-faint'}
          />
          <span className={`text-[10px] font-bold ${menuAktif ? 'text-brass' : 'text-text-faint'}`}>
            Menu
          </span>
        </button>
      </nav>

      {menuTerbuka &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[560] bg-black/40 md:hidden"
              onClick={() => setMenuTerbuka(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-[561] rounded-t-[24px] border border-border bg-panel px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-16px_48px_rgba(0,0,0,0.28)] md:hidden">
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
                {lainnya.map((m) => {
                  const Ikon = m.ikon;
                  const sedangDituju = tujuanDinavigasi === m.href && isPending;
                  return (
                    <button
                      key={m.href}
                      type="button"
                      onClick={() => pergi(m.href)}
                      disabled={isPending}
                      className="flex cursor-pointer items-center gap-3 rounded-[10px] border-none bg-transparent px-2 py-3 text-left text-[14px] font-semibold text-text transition-opacity duration-150 active:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
                      style={sedangDituju ? { opacity: 1 } : undefined}
                    >
                      {sedangDituju ? (
                        <Loader2 size={18} strokeWidth={2} className="shrink-0 animate-spin text-sage" />
                      ) : (
                        <Ikon size={18} strokeWidth={2} className="shrink-0 text-sage" />
                      )}
                      {m.label}
                    </button>
                  );
                })}
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={keluar}
                  disabled={isPending}
                  className="flex cursor-pointer items-center gap-3 rounded-[10px] border-none bg-transparent px-2 py-3 text-left text-[14px] font-semibold text-red disabled:cursor-not-allowed disabled:opacity-40"
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
