'use client';

/* Beranda "Penerobos Kelp". Fase A: hero + pintasan. Card "Ringkasan
   Kehadiran" ditambahkan di Fase C. */

import { useRouter } from 'next/navigation';
import { Users, CalendarCheck, History, Layers } from 'lucide-react';
import JamaahChrome from '@/components/jamaah/JamaahChrome';

const PINTASAN = [
  { label: 'Data Jamaah', desk: 'Daftar & kelola data jamaah', href: '/jamaah/data', ikon: Users },
  { label: 'Input Kehadiran', desk: 'Catat kehadiran per acara', href: '/jamaah/kehadiran', ikon: CalendarCheck },
  { label: 'Riwayat Kehadiran', desk: 'Rekap kehadiran acara lalu', href: '/jamaah/riwayat', ikon: History },
  { label: 'Kelola Sub Kelp', desk: 'Pembagian jamaah dalam kelompok', href: '/jamaah/sub-kelp', ikon: Layers },
];

export default function JamaahBerandaPage() {
  const router = useRouter();
  return (
    <main className="min-h-screen bg-bg">
      <JamaahChrome tampilkanHero />
      <div className="px-[18px] pt-4 pb-10">
        <div className="mb-3 text-[15px] font-extrabold text-text">Menu</div>
        <div className="grid grid-cols-1 gap-2.5">
          {PINTASAN.map((p) => {
            const Ikon = p.ikon;
            return (
              <button
                key={p.href}
                type="button"
                onClick={() => router.push(p.href)}
                className="flex items-center gap-3.5 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-lembut text-navy">
                  <Ikon size={19} strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-text">{p.label}</span>
                  <span className="block text-[11.5px] text-text-dim">{p.desk}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
