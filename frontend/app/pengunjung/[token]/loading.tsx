/* Suspense fallback route-level (2026-09-14, diminta owner: "sekarang
   untuk admin dan penerobos" -- audit menyeluruh menemukan rute ini
   TIDAK PUNYA loading.tsx sama sekali). Rute publik demo pengunjung --
   generik netral, sama pola halaman auth/publik lain di app ini. */
import Image from 'next/image';

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={40} height={36} className="animate-pulse" />
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
    </main>
  );
}
