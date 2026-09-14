/* Suspense fallback route-level (2026-09-14, diminta owner: "audit
   semuanya apakah masih ada yang seperti itu" -- ditemukan lewat audit
   menyeluruh: `/monitoring` TIDAK PUNYA `loading.tsx` sama sekali).
   Rute ini TIDAK punya sub-route, jadi aman dibuat skeleton berbentuk
   konten -- bentuknya masuk akal utk guru (langsung "Pencapaian
   Materi": judul+chip kelas+kalender, lalu kartu target+daftar) MAUPUN
   admin (judul+tab Kehadiran/Pencapaian Materi), pola sama
   app/pengumuman/loading.tsx. */
import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg px-[18px] pt-4 pb-24">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      </div>
      <Skeleton className="mb-2 h-3 w-40" />
      <Skeleton className="mb-5 h-11 w-full" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-[68px] w-full" />
        <Skeleton className="h-[68px] w-full" />
        <Skeleton className="h-[68px] w-full" />
      </div>
    </main>
  );
}
