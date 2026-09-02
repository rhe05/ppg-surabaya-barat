'use client';

/* Tiga pil Bulan/Semester/Tahun Ajaran -- dipakai dua tempat (kartu
   Pengulangan di Riwayat Pembelajaran & Monitoring Materi), dijadikan
   satu komponen supaya keduanya tidak diam-diam melenceng. Gaya chip
   sama persis dgn chip kelas/filter yg sudah ada di seluruh app ini. */

import type { KunciPeriode } from '@/lib/periodeAkademik';

const OPSI: { kunci: KunciPeriode; label: string }[] = [
  { kunci: 'bulan', label: 'Bulan' },
  { kunci: 'semester', label: 'Semester' },
  { kunci: 'tahunAjaran', label: 'Tahun Ajaran' },
];

export default function PenyaringPeriode({
  kunci,
  onUbah,
}: {
  kunci: KunciPeriode;
  onUbah: (k: KunciPeriode) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {OPSI.map((o) => {
        const aktif = kunci === o.kunci;
        return (
          <button
            key={o.kunci}
            type="button"
            onClick={() => onUbah(o.kunci)}
            className={`cursor-pointer rounded-[var(--radius-button)] border-[1.5px] px-2.5 py-1 text-[11px] font-bold transition-all duration-150 active:scale-[0.96] ${
              aktif ? 'border-indigo text-indigo' : 'border-border bg-panel text-text-dim'
            }`}
            style={
              aktif
                ? { background: 'linear-gradient(135deg, var(--indigo-lembut) 0%, var(--indigo-lembut-2) 100%)' }
                : undefined
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
