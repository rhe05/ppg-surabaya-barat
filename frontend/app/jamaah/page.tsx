'use client';

/* Beranda "Penerobos Kelp": hero navy (JamaahChrome) + KPI Ringkasan
   Jamaah + kartu Ringkasan Kehadiran. Navigasi ke layar lain lewat
   hamburger di header + bottom nav — beranda ini murni ringkasan. */

import JamaahChrome from '@/components/jamaah/JamaahChrome';
import RingkasanJamaahCard from '@/components/jamaah/RingkasanJamaahCard';
import RingkasanKehadiranCard from '@/components/jamaah/RingkasanKehadiranCard';

export default function JamaahBerandaPage() {
  return (
    <main className="min-h-screen bg-bg">
      <JamaahChrome tampilkanHero />
      <div className="px-[18px] pt-4 pb-10">
        <RingkasanJamaahCard />
        <RingkasanKehadiranCard />
      </div>
    </main>
  );
}
