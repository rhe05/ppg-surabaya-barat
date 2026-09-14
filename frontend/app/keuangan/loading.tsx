/* Suspense fallback route-level (2026-09-14, diminta owner: "audit
   semuanya apakah masih ada yang seperti itu" -- ditemukan lewat audit
   menyeluruh: `/keuangan` TIDAK PUNYA `loading.tsx` sama sekali,
   Next.js diam total sesaat sebelum konten muncul, tanpa indikator
   transisi apa pun). Rute ini TIDAK punya sub-route (hanya page.tsx
   langsung), jadi aman dibuat skeleton berbentuk konten spesifik --
   pola sama app/pengumuman/loading.tsx: 3 kartu menu (Tabungan/Infaq
   Pengajian/Shodaqoh). */
import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg px-[18px] pt-4 pb-24">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mb-4 h-5 w-32" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="kartu-premium flex w-full items-center gap-3 p-4">
            <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
            <div className="flex-1">
              <Skeleton className="mb-1.5 h-3.5 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
