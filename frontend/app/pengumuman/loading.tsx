/* Suspense fallback route-level (2026-09-14, diminta owner: "klik
   pengumuman sekilas tampilan berada pada dashboard beranda ... saya
   mau proses transisi wajib ada sekelton wajib smooth") -- BEDA dari
   app/dashboard/loading.tsx (logo berdenyut netral, sengaja generik
   krn dibagi banyak sub-route). `/pengumuman` TIDAK punya sub-route
   sama sekali (satu-satunya file di segmen ini selain page.tsx), jadi
   aman dibuat skeleton BERBENTUK KONTEN -- kartu-kartu ini kebetulan
   masuk akal utk KEDUA tampilan (guru: kartu kelas komposer WA; admin:
   kartu daftar pengumuman), jadi tidak perlu tahu peran dulu.

   Next.js App Router menampilkan berkas ini SEKETIKA begitu navigasi
   ke /pengumuman dimulai, MENGGANTIKAN halaman sebelumnya (bukan
   menunggu halaman lama tetap utuh atau berkedip ke konten yg salah)
   -- ini pengaman TAMBAHAN di luar perbaikan GuruBottomNav.tsx (yg
   sekarang menahan bottom-sheet "Menu" tetap terbuka dgn indikator
   sampai navigasi benar2 selesai, spy Dashboard di baliknya tidak
   sempat "kelihatan sekilas" saat sheet ditutup). */
import Skeleton from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg px-[18px] pt-4 pb-24">
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="mb-1.5 h-5 w-52" />
      <Skeleton className="mb-5 h-3.5 w-64" />
      <Skeleton className="mb-4 h-11 w-full" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-[92px] w-full" />
        <Skeleton className="h-[92px] w-full" />
        <Skeleton className="h-[92px] w-full" />
      </div>
    </main>
  );
}
