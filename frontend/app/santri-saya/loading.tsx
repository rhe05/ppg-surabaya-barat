/* Suspense fallback route-level (2026-09-14, diminta owner: "audit
   semuanya apakah masih ada yang seperti itu" -- diganti dari logo
   berdenyut generik jadi skeleton berbentuk konten, pola sama
   app/pengumuman/loading.tsx). `/santri-saya` TIDAK punya sub-route --
   topbar+judul "Data Generus" lalu daftar kartu santri. */
import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg px-[18px] pt-4 pb-24">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-36" />
      </div>
      <Skeleton className="mb-4 h-5 w-36" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[56px] w-full" />
        ))}
      </div>
    </main>
  );
}
