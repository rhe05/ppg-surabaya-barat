/* Suspense fallback route-level (2026-09-14, diminta owner: "audit
   semuanya apakah masih ada yang seperti itu" -- diganti dari logo
   berdenyut generik jadi skeleton berbentuk konten, pola sama
   app/pengumuman/loading.tsx). `/peringkat` TIDAK punya sub-route --
   bentuk daftar peringkat (baris nomor+nama+skor), masuk akal utk
   guru (PeringkatKelpMobile) maupun admin. */
import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg px-[18px] pt-4 pb-24">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <Skeleton className="mb-4 h-5 w-32" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <Skeleton className="h-[44px] flex-1" />
          </div>
        ))}
      </div>
    </main>
  );
}
