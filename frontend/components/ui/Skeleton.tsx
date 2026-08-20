'use client';

/* Loading-skeleton generik — dipakai menggantikan teks "Memuat..." di
   layar Jurnal Mengajar (diminta owner: standar produk SaaS profesional).
   Animasi pulse bawaan Tailwind (animate-pulse), tanpa keyframe custom. */

export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[var(--radius)] bg-panel-2 ${className}`} />;
}
