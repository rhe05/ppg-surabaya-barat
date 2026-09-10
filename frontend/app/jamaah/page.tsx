'use client';

/* Beranda "Penerobos Kelp". Hero navy (JamaahChrome) + kartu Ringkasan
   Kehadiran + menu (satu kartu premium, baris terbagi hairline). */

import { useRouter } from 'next/navigation';
import { Users, CalendarCheck, History, Layers, ClipboardList, ChevronRight } from 'lucide-react';
import JamaahChrome from '@/components/jamaah/JamaahChrome';
import RingkasanKehadiranCard from '@/components/jamaah/RingkasanKehadiranCard';

const PINTASAN = [
  { label: 'Data Jamaah', desk: 'Daftar & kelola data jamaah', href: '/jamaah/data', ikon: Users },
  { label: 'Data Pengurus', desk: 'Susunan Kepengurusan Kelompok', href: '/jamaah/pengurus', ikon: ClipboardList },
  { label: 'Input Kehadiran', desk: 'Catat Kehadiran Per Kegiatan', href: '/jamaah/kehadiran', ikon: CalendarCheck },
  { label: 'Riwayat Kehadiran', desk: 'Rekap kehadiran acara lalu', href: '/jamaah/riwayat', ikon: History },
  { label: 'Kelola Sub Kelp', desk: 'Pembagian Jamaah Dalam Sub Kelompok', href: '/jamaah/sub-kelp', ikon: Layers },
];

export default function JamaahBerandaPage() {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-bg">
      <JamaahChrome tampilkanHero />
      <div className="px-[18px] pt-4 pb-10">
        <RingkasanKehadiranCard />

        <div className="label-mikro mb-2.5">Menu</div>
        <div className="kartu-premium animasi-konten-muncul overflow-hidden">
          {PINTASAN.map((p) => {
            const Ikon = p.ikon;
            return (
              <button
                key={p.href}
                type="button"
                onClick={() => router.push(p.href)}
                className="baris-daftar flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors active:bg-panel-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-navy-lembut text-navy">
                  <Ikon size={18} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold tracking-[-0.01em] text-text">
                    {p.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-text-dim">{p.desk}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-text-faint" />
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
