'use client';

/* Tiga pil Bulan/Semester/Tahun Ajaran -- dipakai di Monitoring >
   Pencapaian Materi (sisi per-kelas & per-santri fitur Pengulangan,
   SATU pemilih utk keduanya sejak 2026-09-02 sore). Komponen sendiri
   krn bentuknya (3 chip) dipakai identik di sana; kalau nanti ada
   layar lain yg butuh periode serupa, dipakai ulang dari sini juga. */

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
    <div className="flex flex-wrap gap-1.5">
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
