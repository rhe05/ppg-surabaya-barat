'use client';

/* Chrome header bersama app "Penerobos Kelp" (jamaah).
   - Top bar putih sticky: logo + "Ruang Ngaji" (kiri), hamburger (kanan).
   - Hamburger membuka menu DROPDOWN dari kanan atas (di bawah tombolnya,
     bukan bottom-sheet): layar sekunder (Data Jamaah / Data Pengurus /
     Kelola Sub Kelp) + Keluar. Destinasi utama ada di JamaahBottomNav.
   - Hero navy opsional di beranda: kartu profil (monogram, nama, chip
     peran, kelompok). */

import Image from 'next/image';
import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { MapPin, Menu, Users, ClipboardList, Layers, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

function inisialDari(nama: string) {
  const bagian = nama.split(/\s+/).filter(Boolean);
  if (bagian.length === 0) return '·';
  const huruf = (bagian[0][0] ?? '') + (bagian[1]?.[0] ?? '');
  return huruf.toUpperCase() || '·';
}

const DRAWER: { label: string; href: string; ikon: typeof Users; desk: string }[] = [
  { label: 'Data Jamaah', href: '/jamaah/data', ikon: Users, desk: 'Daftar & kelola data jamaah' },
  { label: 'Data Pengurus', href: '/jamaah/pengurus', ikon: ClipboardList, desk: 'Susunan Kepengurusan Kelompok' },
  { label: 'Kelola Sub Kelp', href: '/jamaah/sub-kelp', ikon: Layers, desk: 'Pembagian Jamaah Dalam Sub Kelompok' },
];

export default function JamaahChrome({ tampilkanHero = false }: { tampilkanHero?: boolean }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const { profile, namaKelompok, signOut } = useAuth();
  const nama = profile?.display_name ?? '-';
  const inisial = useMemo(() => inisialDari(profile?.display_name ?? ''), [profile?.display_name]);

  const [drawer, setDrawer] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);

  function bukaMenu() {
    const r = tombolRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    setDrawer(true);
  }

  async function keluar() {
    setDrawer(false);
    await signOut();
    router.push('/auth/login');
  }

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-border bg-panel px-[18px] pt-3.5 pb-3 shadow-[var(--shadow-subtle)]">
        <div className="flex min-w-0 flex-1 items-center justify-start gap-[7px]">
          <Image
            src="/logo-ruang-ngaji.png"
            alt="Ruang Ngaji"
            width={20}
            height={18}
            className="block shrink-0"
          />
          <span className="text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
            Ruang Ngaji
          </span>
        </div>
        <button
          ref={tombolRef}
          type="button"
          aria-label="Menu"
          aria-expanded={drawer}
          onClick={() => (drawer ? setDrawer(false) : bukaMenu())}
          className={`-mr-1.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none transition-colors ${
            drawer ? 'bg-panel-2 text-text' : 'bg-transparent text-text-dim'
          } active:bg-panel-2`}
        >
          <Menu size={20} strokeWidth={2} />
        </button>
      </div>

      {tampilkanHero && (
        <div className="px-[18px] pt-3.5">
          <div className="hero-navy animasi-konten-muncul flex items-center gap-3.5 px-[18px] py-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-green text-[14px] font-bold text-white ring-1 ring-white/10">
              {inisial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[18px] leading-tight font-bold text-white capitalize">
                {nama}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-hijau px-2 py-[3px] text-[10px] font-bold tracking-[0.05em] text-white uppercase">
                  Penerobos Kelp
                </span>
                {namaKelompok && (
                  <span className="flex items-center gap-1 text-[12px] font-medium text-white/65">
                    <MapPin size={11} strokeWidth={2} />
                    {namaKelompok}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {drawer &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[560]" onClick={() => setDrawer(false)} aria-hidden />
            <div
              role="menu"
              style={{ top: pos.top, right: pos.right }}
              className="animasi-toast-masuk fixed z-[561] w-[256px] origin-top-right overflow-hidden rounded-[14px] border border-border bg-panel p-1.5 shadow-[0_16px_44px_-8px_rgba(15,23,42,0.28)]"
            >
              {DRAWER.map((m) => {
                const Ikon = m.ikon;
                const on = pathname === m.href || pathname.startsWith(m.href + '/');
                return (
                  <button
                    key={m.href}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDrawer(false);
                      router.push(m.href);
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border-none bg-transparent px-2 py-2.5 text-left active:bg-bg"
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${
                        on ? 'bg-navy text-white' : 'bg-navy-lembut text-navy'
                      }`}
                    >
                      <Ikon size={16} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-text">{m.label}</span>
                      <span className="block truncate text-[11px] text-text-dim">{m.desk}</span>
                    </span>
                  </button>
                );
              })}
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                role="menuitem"
                onClick={keluar}
                className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] border-none bg-transparent px-2 py-2.5 text-left text-[13px] font-semibold text-red active:bg-bg"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-red-lembut text-red">
                  <LogOut size={16} strokeWidth={2} />
                </span>
                Keluar
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
