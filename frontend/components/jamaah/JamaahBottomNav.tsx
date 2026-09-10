'use client';

/* Bottom tab bar app "Penerobos Kelp" (jamaah pengajian). Pola sama
   GuruBottomNav: dirender SEKALI di RequireAuth sebagai sibling <main>,
   dikunci max-w-[430px], padding bawah halaman diatur globals.css lewat
   body:has([data-jamaah-nav]) main. Tema navy. */

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { House, Users, CalendarCheck, Layers, LogOut, X, History, ClipboardList } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

type Tab = { label: string; ikon: typeof House; href: string; cocok: string[] };

const TAB: Tab[] = [
  { label: 'Beranda', ikon: House, href: '/jamaah', cocok: ['/jamaah'] },
  { label: 'Jamaah', ikon: Users, href: '/jamaah/data', cocok: ['/jamaah/data'] },
  { label: 'Kehadiran', ikon: CalendarCheck, href: '/jamaah/kehadiran', cocok: ['/jamaah/kehadiran'] },
];

const LAINNYA: { label: string; href: string; ikon: typeof House }[] = [
  { label: 'Riwayat Kehadiran', href: '/jamaah/riwayat', ikon: History },
  { label: 'Data Pengurus', href: '/jamaah/pengurus', ikon: ClipboardList },
  { label: 'Kelola Sub Kelp', href: '/jamaah/sub-kelp', ikon: Layers },
];

export default function JamaahBottomNav() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { signOut } = useAuth();
  const [menuTerbuka, setMenuTerbuka] = useState(false);

  /* Beranda hanya "aktif" saat path PERSIS /jamaah — biar tidak menyala
     di /jamaah/data dst. Tab lain cocok prefix. */
  const aktif = (t: Tab) =>
    t.href === '/jamaah'
      ? pathname === '/jamaah'
      : t.cocok.some((c) => pathname === c || pathname.startsWith(c + '/'));
  const menuAktif = LAINNYA.some((m) => pathname === m.href || pathname.startsWith(m.href + '/'));

  useEffect(() => {
    for (const t of TAB) router.prefetch(t.href);
    for (const m of LAINNYA) router.prefetch(m.href);
  }, [router]);

  async function keluar() {
    setMenuTerbuka(false);
    await signOut();
    router.push('/auth/login');
  }

  return (
    <>
      <nav
        data-jamaah-nav
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
                onClick={() => router.push(t.href)}
                className="flex flex-1 cursor-pointer flex-col items-center gap-1 border-none bg-transparent px-1 pt-2 pb-1.5 active:opacity-60"
              >
                <Ikon size={20} strokeWidth={on ? 2.4 : 2} className={on ? 'text-navy' : 'text-text-faint'} />
                <span className={`text-[10px] font-bold ${on ? 'text-navy' : 'text-text-faint'}`}>
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
            <Layers size={20} strokeWidth={menuAktif ? 2.4 : 2} className={menuAktif ? 'text-navy' : 'text-text-faint'} />
            <span className={`text-[10px] font-bold ${menuAktif ? 'text-navy' : 'text-text-faint'}`}>Menu</span>
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
                      onClick={() => {
                        setMenuTerbuka(false);
                        router.push(m.href);
                      }}
                      className="flex cursor-pointer items-center gap-3 rounded-[10px] border-none bg-transparent px-2 py-3 text-left text-[14px] font-semibold text-text active:bg-bg"
                    >
                      <Ikon size={18} strokeWidth={2} className="shrink-0 text-navy" />
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
