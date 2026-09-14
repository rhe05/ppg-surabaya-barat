/* Suspense fallback route-level (2026-09-14, diminta owner: "sekarang
   untuk admin dan penerobos" -- audit menyeluruh menemukan rute ini
   TIDAK PUNYA loading.tsx sama sekali). Rute flat, tanpa sub-route. */
import SkeletonHalaman from '@/components/ui/SkeletonHalaman';

export default function Loading() {
  return <SkeletonHalaman jumlahKartu={3} />;
}
