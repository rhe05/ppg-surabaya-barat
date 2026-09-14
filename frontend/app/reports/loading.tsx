/* Suspense fallback route-level (2026-09-14, diminta owner: "audit
   semuanya apakah masih ada yang seperti itu" -- diganti dari logo
   berdenyut generik jadi skeleton berbentuk konten, pola sama
   app/pengumuman/loading.tsx). `/reports` TIDAK punya sub-route --
   topbar+hero greeting (sama pola Dashboard) lalu satu kartu besar
   form/preview laporan (GuruLaporanView.tsx). */
import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg">
      <div className="flex items-center justify-between border-b border-border bg-panel px-[18px] py-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="mx-4 mt-4 flex flex-col gap-2 rounded-[20px] border border-border p-5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="px-[18px] pt-4 pb-24">
        <Skeleton className="h-[220px] w-full" />
      </div>
    </main>
  );
}
