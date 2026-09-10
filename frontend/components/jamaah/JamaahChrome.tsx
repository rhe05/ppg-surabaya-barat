'use client';

/* Chrome header bersama app "Penerobos Kelp" (jamaah).
   - Top bar putih sticky: logo + "Ruang Ngaji" (kiri), hamburger (kanan).
   - Hamburger membuka drawer bawah: layar sekunder (Data Jamaah / Data
     Pengurus / Kelola Sub Kelp) + Keluar. Destinasi utama ada di
     JamaahBottomNav — di sini yang "lain-lain" saja, satu jalan per tujuan.
   - Hero navy opsional di beranda: kartu profil (monogram, nama, chip
     peran, kelompok). */

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { MapPin, Menu, X, Users, ClipboardList, Layers, LogOut } from 'lucide-react';
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
          type="button"
          aria-label="Menu"
          onClick={() => setDrawer(true)}
          className="-mr-1.5 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-text-dim active:bg-panel-2"
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
        createPortal(
          <>
            <div className="fixed inset-0 z-[560] bg-black/40" onClick={() => setDrawer(false)} />
            <div className="fixed inset-x-0 bottom-0 z-[561] mx-auto w-full max-w-[430px] rounded-t-[24px] border border-border bg-panel px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-16px_48px_rgba(0,0,0,0.28)]">
              <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border" />
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="text-[15px] font-extrabold text-text">Menu</span>
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label="Tutup"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="flex flex-col">
                {DRAWER.map((m) => {
                  const Ikon = m.ikon;
                  const on = pathname === m.href || pathname.startsWith(m.href + '/');
                  return (
                    <button
                      key={m.href}
                      type="button"
                      onClick={() => {
                        setDrawer(false);
                        router.push(m.href);
                      }}
                      className="flex cursor-pointer items-center gap-3.5 rounded-[12px] border-none bg-transparent px-2 py-3 text-left active:bg-bg"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${
                          on ? 'bg-navy text-white' : 'bg-navy-lembut text-navy'
                        }`}
                      >
                        <Ikon size={17} strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-text">{m.label}</span>
                        <span className="block text-[11.5px] text-text-dim">{m.desk}</span>
                      </span>
                    </button>
                  );
                })}
                <div className="my-1.5 h-px bg-border" />
                <button
                  type="button"
                  onClick={keluar}
                  className="flex cursor-pointer items-center gap-3.5 rounded-[12px] border-none bg-transparent px-2 py-3 text-left text-[13.5px] font-semibold text-red active:bg-bg"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-red-lembut text-red">
                    <LogOut size={17} strokeWidth={2} />
                  </span>
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
