'use client';

/* Chrome header bersama app "Penerobos Kelp" (jamaah). Top bar putih sticky
   (logo + "Ruang Ngaji", samakan dgn app guru/admin) + hero navy opsional
   di beranda: kartu gelap berlapis (primitif .hero-navy), monogram inisial,
   nama, chip peran, kelompok. Tema navy. */

import Image from 'next/image';
import { useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';

function inisialDari(nama: string) {
  const bagian = nama.split(/\s+/).filter(Boolean);
  if (bagian.length === 0) return '·';
  /* Dua kata PERTAMA — bukan pertama+terakhir (bisa membentuk singkatan
     tak sengaja yg janggal). */
  const huruf = (bagian[0][0] ?? '') + (bagian[1]?.[0] ?? '');
  return huruf.toUpperCase() || '·';
}

export default function JamaahChrome({ tampilkanHero = false }: { tampilkanHero?: boolean }) {
  const { profile, namaKelompok } = useAuth();
  const nama = profile?.display_name ?? '-';
  const inisial = useMemo(() => inisialDari(profile?.display_name ?? ''), [profile?.display_name]);

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
        <div className="px-[18px] pt-3.5">
          <div className="hero-navy animasi-konten-muncul px-[18px] py-[18px]">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[14px] font-bold text-white ring-1 ring-white/15">
                {inisial}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[19px] leading-tight font-bold text-white capitalize">
                  {nama}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-full bg-white/[0.14] px-2 py-[3px] text-[10px] font-bold tracking-[0.06em] text-white/90 uppercase">
                    Penerobos Kelp
                  </span>
                  {namaKelompok && (
                    <span className="text-[12px] font-medium text-white/70">{namaKelompok}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
