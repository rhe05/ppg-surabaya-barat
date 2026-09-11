'use client';

/* Bottom tab bar app "Penerobos Kelp". Dirender SEKALI di RequireAuth
   sebagai sibling <main>, dikunci max-w-[430px]; padding bawah halaman
   diatur globals.css lewat body:has([data-jamaah-nav]) main.

   max-w-[430px] mx-auto ada di elemen <nav> ITU SENDIRI (bukan cuma
   pembungkus di dalamnya) -- kalau cuma pembungkusnya yg dibatasi,
   LATAR PUTIH nav (bg-panel + border-t + shadow) tetap melebar penuh
   ke tepi jendela di layar lebar (dilaporkan owner: beda dgn topbar yg
   memang sudah terkunci 430px krn ada DI DALAM kolom). Pola disamakan
   dgn bottom-sheet "Menu" di GuruBottomNav.tsx yg sudah benar sejak awal.

   4 destinasi utama. Layar sekunder (Data Jamaah / Data Pengurus / Kelola
   Sub Kelp / Keluar) lewat hamburger di header (JamaahChrome), bukan di
   sini — satu jalan per tujuan. Active state = hijau logo. */

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { House, CalendarCheck, FileText, UserRound } from 'lucide-react';

type Tab = { label: string; ikon: typeof House; href: string; tepat?: boolean };

const TAB: Tab[] = [
  { label: 'Beranda', ikon: House, href: '/jamaah', tepat: true },
  { label: 'Kegiatan', ikon: CalendarCheck, href: '/jamaah/kehadiran' },
  { label: 'Laporan', ikon: FileText, href: '/jamaah/riwayat' },
  { label: 'Akun', ikon: UserRound, href: '/jamaah/akun' },
];

export default function JamaahBottomNav() {
  const router = useRouter();
  const pathname = usePathname() ?? '';

  const aktif = (t: Tab) =>
    t.tepat ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + '/');

  useEffect(() => {
    for (const t of TAB) router.prefetch(t.href);
  }, [router]);

  return (
    <nav
      data-jamaah-nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] border-t border-border bg-panel pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(15,23,42,0.06)]"
    >
      <div className="flex w-full">
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
              <Ikon
                size={20}
                strokeWidth={on ? 2.4 : 2}
                className={on ? 'text-hijau' : 'text-text-faint'}
              />
              <span className={`text-[10px] font-bold ${on ? 'text-hijau' : 'text-text-faint'}`}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
