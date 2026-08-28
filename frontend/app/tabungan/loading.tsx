/* Suspense fallback route-level -- lihat komentar lengkap di
   app/dashboard/loading.tsx. Ditambahkan 2026-08-28: dua rute terbaru
   (/tabungan, /peringkat) sempat terlewat, jadi terasa lebih lambat
   dibuka daripada rute guru lain yang sudah punya berkas ini. */
import Image from 'next/image';

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={40} height={36} className="animate-pulse" />
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
    </main>
  );
}
