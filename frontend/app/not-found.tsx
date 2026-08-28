/* Layar 404 milik app (2026-08-28) — menggantikan halaman "404 | This page
   could not be found" bawaan Next.js yang berbahasa Inggris dan tidak
   memberi jalan kembali. */

import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-8 text-center">
      <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={44} height={40} />
      <div>
        <h1 className="text-[17px] font-extrabold text-text">Halaman tidak ditemukan</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-dim">
          Alamat yang Anda buka tidak ada, atau sudah dipindahkan.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="rounded-[var(--radius)] border border-brass bg-brass px-5 py-2.5 text-[13px] font-bold text-white no-underline active:scale-[0.98]"
      >
        Kembali ke Beranda
      </Link>
    </main>
  );
}
