/* Suspense fallback route-level (jg berlaku /jurnal/rencana,
   /jurnal/pelaksanaan, /jurnal/riwayat) -- lihat komentar lengkap di
   app/dashboard/loading.tsx & MenuGuru.tsx. */
import Image from 'next/image';

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={40} height={36} className="animate-pulse" />
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
    </main>
  );
}
