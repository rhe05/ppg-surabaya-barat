'use client';

import JamaahChrome from '@/components/jamaah/JamaahChrome';

export default function KehadiranPage() {
  return (
    <main className="min-h-screen bg-bg">
      <JamaahChrome />
      <div className="px-[18px] pt-10 text-center">
        <div className="text-[15px] font-extrabold text-text">Input Kehadiran</div>
        <p className="mt-1.5 text-[12.5px] text-text-dim">
          Fitur ini sedang disiapkan (Fase B: buat acara &rarr; catat kehadiran).
        </p>
      </div>
    </main>
  );
}
