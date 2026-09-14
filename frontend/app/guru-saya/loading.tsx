/* Suspense fallback route-level (2026-09-14, diminta owner: "audit
   semuanya apakah masih ada yang seperti itu" -- diganti dari logo
   berdenyut generik jadi skeleton berbentuk konten, pola sama
   app/pengumuman/loading.tsx). `/guru-saya` TIDAK punya sub-route --
   judul dinamis (mis. "Izin Mengajar") + kartu form Ajukan Izin, lalu
   daftar riwayat. */
import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg px-[18px] pt-4 pb-24">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mb-4 h-5 w-40" />
      <Skeleton className="mb-5 h-[180px] w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[56px] w-full" />
        <Skeleton className="h-[56px] w-full" />
      </div>
    </main>
  );
}
