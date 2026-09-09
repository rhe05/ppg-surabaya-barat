'use client';

/* Loading-skeleton generik — dipakai menggantikan teks "Memuat..." di
   layar Jurnal Mengajar (diminta owner: standar produk SaaS profesional).
   Kilau kiri→kanan (.kerangka di globals.css) — lebih halus dibanding
   kedip animate-pulse; hormat prefers-reduced-motion. */

export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`kerangka rounded-[var(--radius)] ${className}`} />;
}
