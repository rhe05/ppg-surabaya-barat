'use client';

/* Placeholder shimmer utk daftar kartu (2026-08-27, titik 3 polish SaaS)
   -- ganti teks "Memuat..." di layar daftar admin kelp mobile. Bentuknya
   meniru kartu sungguhan (baris nama + subteks + badge kanan) supaya
   pergantian ke konten asli tidak "meloncat". */

import Skeleton from './Skeleton';

export default function SkeletonKartuList({ jumlah = 5 }: { jumlah?: number }) {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {Array.from({ length: jumlah }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4"
        >
          <div className="min-w-0 flex-1">
            <Skeleton className="h-[13px] w-[45%]" />
            <Skeleton className="mt-2 h-[10px] w-[70%]" />
          </div>
          <Skeleton className="h-[22px] w-[64px] rounded-full" />
        </div>
      ))}
    </div>
  );
}
