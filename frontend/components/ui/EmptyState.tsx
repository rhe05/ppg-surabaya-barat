'use client';

/* Empty-state seragam (2026-08-27, lanjutan polish SaaS) — ganti teks
   telanjang "Belum ada X" di layar daftar admin kelp: ikon dalam
   lingkaran + judul + deskripsi + tombol aksi opsional. Border putus-putus
   supaya jelas ini "kosong menunggu diisi", bukan kartu data. */

import type { ReactNode } from 'react';

export default function EmptyState({
  ikon,
  judul,
  deskripsi,
  aksi,
}: {
  ikon: ReactNode;
  judul: string;
  deskripsi?: string;
  aksi?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-panel px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-panel-2 text-text-faint">
        {ikon}
      </div>
      <div className="text-[14px] font-bold text-text">{judul}</div>
      {deskripsi && <p className="mt-1 max-w-[280px] text-[12px] text-text-dim">{deskripsi}</p>}
      {aksi && (
        <button
          type="button"
          onClick={aksi.onClick}
          className="mt-4 cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2 text-[12.5px] font-bold text-white active:scale-[0.97]"
        >
          {aksi.label}
        </button>
      )}
    </div>
  );
}
