/* Suspense fallback route-level -- diminta owner 2026-08-23, laporan
   "dulu klik langsung bereaksi, sekarang ada jeda" (lihat komentar
   panjang di components/dashboard/MenuGuru.tsx). Next.js App Router
   menampilkan berkas ini SEKETIKA begitu navigasi ke segmen ini (dan
   segmen di bawahnya, kalau ada) dimulai -- pengaman tambahan di luar
   prefetch (MenuGuru/JurnalChooser/KehadiranChooser): kalau prefetch
   belum sempat selesai (mis. koneksi lambat), guru tetap melihat
   sesuatu yg jelas "sedang berpindah", bukan diam menunggu halaman
   sebelumnya utuh atau berkedip ke konten yg salah.

   Sama gaya dgn RequireAuth.tsx (logo berdenyut, netral) -- BUKAN
   skeleton bentuk halaman tertentu, krn berkas ini dibagi sama semua
   route di bawah segmen ini (mis. loading.tsx di app/jurnal/ jg
   dipakai /jurnal/rencana, /jurnal/pelaksanaan, /jurnal/riwayat). */
import Image from 'next/image';

export default function Loading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={40} height={36} className="animate-pulse" />
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
    </main>
  );
}
