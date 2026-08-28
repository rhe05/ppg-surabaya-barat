'use client';

/* Kartu galat + tombol "Coba Lagi" (2026-08-28) — pengganti pola lama
   `{error && <p className="text-[13px] text-red">{error}</p>}` yang
   tersebar di hampir semua layar.

   Dua masalah pola lama: (1) baris merah kecil itu memberi tahu ada
   masalah tapi TIDAK memberi jalan keluar — satu-satunya cara mencoba lagi
   adalah memuat ulang seluruh halaman; (2) galat koneksi tampil sebagai
   "Failed to fetch", istilah yang tidak berarti apa-apa bagi guru.
   `pesanGalatRamah` menerjemahkan yang pertama, `onCobaLagi` menyelesaikan
   yang kedua.

   `onCobaLagi` opsional — kalau layarnya tidak punya fungsi muat ulang
   yang bisa dipanggil, kartunya tetap tampil tanpa tombol. */

import { AlertCircle, RotateCw } from 'lucide-react';
import { pesanGalatRamah } from '@/lib/useKoneksi';

export default function PesanGalat({
  pesan,
  onCobaLagi,
  sedangMemuat = false,
  className = '',
}: {
  pesan: string;
  onCobaLagi?: () => void;
  sedangMemuat?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-card border border-[rgba(220,38,38,0.25)] bg-[rgba(220,38,38,0.05)] p-3.5 ${className}`}
    >
      <AlertCircle size={17} className="mt-px shrink-0 text-red" />
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] leading-relaxed font-semibold text-text">
          {pesanGalatRamah(pesan)}
        </p>
        {onCobaLagi && (
          <button
            type="button"
            disabled={sedangMemuat}
            onClick={onCobaLagi}
            className="mt-2.5 flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border border-red bg-panel px-3 py-1.5 text-[12px] font-bold text-red active:scale-[0.98] disabled:opacity-50"
          >
            <RotateCw size={13} className={sedangMemuat ? 'animate-spin' : ''} />
            {sedangMemuat ? 'Memuat...' : 'Coba Lagi'}
          </button>
        )}
      </div>
    </div>
  );
}
