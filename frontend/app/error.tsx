'use client';

/* Error boundary route-level (2026-08-28). Tanpa berkas ini, satu galat
   render yang tidak tertangkap memunculkan layar galat mentah Next.js --
   latar putih, teks hitam, jejak tumpukan. Untuk guru yang membuka app
   ini di HP, itu terbaca sebagai "aplikasinya rusak total" dan tidak ada
   jalan keluar selain menutup tab.

   Ganti dengan layar sopan berbahasa Indonesia + tombol coba lagi
   (reset() me-render ulang segmen tanpa memuat ulang halaman). */

import { useEffect } from 'react';
import Image from 'next/image';
import { RotateCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app error]', error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-8 text-center">
      <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={44} height={40} />
      <div>
        <h1 className="text-[17px] font-extrabold text-text">Ada yang tidak beres</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
          Halaman ini gagal ditampilkan. Coba muat ulang — kalau masih sama, tutup lalu buka
          kembali aplikasinya.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-brass bg-brass px-5 py-2.5 text-[13px] font-bold text-white active:scale-[0.98]"
      >
        <RotateCw size={15} /> Coba Lagi
      </button>
      {error.digest && (
        <p className="text-[10.5px] text-text-faint">Kode galat: {error.digest}</p>
      )}
    </main>
  );
}
