/* Skeleton generik "topbar + judul + N kartu" (2026-09-14, diminta
   owner: "audit semuanya apakah masih ada yang seperti itu" -- banyak
   rute admin flat TIDAK PUNYA `loading.tsx` sama sekali). Dipakai
   sebagai `loading.tsx` route-level utk rute yg TIDAK punya sub-route
   (kalau punya sub-route, `loading.tsx`-nya WAJIB tetap generik netral
   spt app/dashboard/loading.tsx versi lama -- lihat app/absensi/
   loading.tsx/app/jurnal/loading.tsx, JANGAN diganti komponen ini).
   Bentuknya cukup umum utk hub/list/form sederhana; halaman dgn bentuk
   sangat khas (mis. Dashboard/Reports dgn hero) tetap py loading.tsx
   sendiri, bukan pakai komponen ini. */
import Skeleton from './Skeleton';

export default function SkeletonHalaman({ jumlahKartu = 3 }: { jumlahKartu?: number }) {
  return (
    <main className="min-h-screen bg-bg px-[18px] pt-4 pb-24">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mb-5 h-5 w-40" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: jumlahKartu }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full" />
        ))}
      </div>
    </main>
  );
}
