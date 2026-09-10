'use client';

/* Chrome header bersama app "Penerobos Kelp" (jamaah). Pola sama
   JurnalHeaderChrome guru: top bar putih dikunci sticky + hero navy
   opsional (nama/peran/kelompok). Tema navy. */

import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';

export default function JamaahChrome({ tampilkanHero = false }: { tampilkanHero?: boolean }) {
  const { profile, namaKelompok } = useAuth();

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
      </div>

      {tampilkanHero && (
        <div className="shrink-0 overflow-hidden rounded-b-3xl bg-panel shadow-[0_6px_20px_rgba(29,78,216,0.22)]">
          <div className="bg-[linear-gradient(135deg,var(--navy)_0%,var(--navy-tua)_100%)] px-[18px] pt-4 pb-5">
            <div className="text-[20px] leading-[1.2] font-bold text-white">
              {profile?.display_name ?? '-'}
            </div>
            <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
              Penerobos Kelp
            </div>
            {namaKelompok && (
              <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
                {namaKelompok}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
