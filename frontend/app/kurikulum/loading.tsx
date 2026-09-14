/* Suspense fallback route-level (2026-09-14, diminta owner: "audit
   semuanya apakah masih ada yang seperti itu" -- diganti dari logo
   berdenyut generik jadi skeleton berbentuk konten, pola sama
   app/pengumuman/loading.tsx). `/kurikulum` TIDAK punya sub-route --
   bentuk awalnya (belum pilih kelas) grid tombol jenjang. */
import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg px-[18px] pt-4 pb-24">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="mb-1.5 h-5 w-32" />
      <Skeleton className="mb-5 h-3.5 w-56" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </main>
  );
}
