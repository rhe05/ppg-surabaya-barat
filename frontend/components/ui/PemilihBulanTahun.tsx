'use client';

/* Pemilih Bulan + Tahun MODERN (2026-09-09, diminta owner) -- pemicu teks
   "Bulan - Tahun" (tanpa ikon, tanpa border, warna indigo, seperti link),
   popup kartu melayang: baris tahun (panah ‹ › + angka tahun yang bisa
   diklik -> grid tahun) lalu grid 12 bulan. BUKAN <select> bawaan browser.
   Posisi fixed dari getBoundingClientRect supaya tidak ke-clip. */

import { useRef, useState } from 'react';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

export default function PemilihBulanTahun({
  bulan,
  tahun,
  onUbah,
}: {
  bulan: number; // 1-12
  tahun: number;
  onUbah: (bulan: number, tahun: number) => void;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [posisi, setPosisi] = useState<{ top: number; right: number } | null>(null);
  const [thnLihat, setThnLihat] = useState(tahun);
  const [pilihThn, setPilihThn] = useState(false);
  const tombolRef = useRef<HTMLButtonElement>(null);
  const thnSekarang = new Date().getFullYear();
  const thnMin = thnSekarang - 5;
  const thnMax = thnSekarang + 1;
  const daftarThn: number[] = [];
  for (let y = thnMax; y >= thnMin; y--) daftarThn.push(y);

  function toggle() {
    const r = tombolRef.current?.getBoundingClientRect();
    if (r) setPosisi({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setThnLihat(tahun);
    setPilihThn(false);
    setTerbuka((v) => !v);
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={tombolRef}
        onClick={toggle}
        className="cursor-pointer border-none bg-transparent text-[12px] font-bold text-indigo active:opacity-70"
      >
        {NAMA_BULAN[bulan - 1]} - {tahun}
      </button>
      {terbuka && posisi && (
        <>
          <div className="fixed inset-0 z-[1090]" onClick={() => setTerbuka(false)} />
          <div
            className="fixed z-[1100] w-[248px] rounded-[var(--radius-lg)] border border-border bg-panel p-3 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
            style={{ top: posisi.top, right: posisi.right }}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <button
                type="button"
                disabled={pilihThn || thnLihat <= thnMin}
                onClick={() => setThnLihat((y) => Math.max(thnMin, y - 1))}
                aria-label="Tahun sebelumnya"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-panel-2 text-text-dim disabled:opacity-30"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setPilihThn((v) => !v)}
                className={`rounded-[var(--radius)] px-3 py-1 text-[14px] font-extrabold tabular-nums transition-colors ${
                  pilihThn ? 'bg-brass text-white' : 'text-text hover:bg-panel-2'
                }`}
              >
                {thnLihat}
              </button>
              <button
                type="button"
                disabled={pilihThn || thnLihat >= thnMax}
                onClick={() => setThnLihat((y) => Math.min(thnMax, y + 1))}
                aria-label="Tahun berikutnya"
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-border bg-panel-2 text-text-dim disabled:opacity-30"
              >
                ›
              </button>
            </div>

            {pilihThn ? (
              <div className="grid grid-cols-3 gap-1.5">
                {daftarThn.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setThnLihat(y);
                      setPilihThn(false);
                    }}
                    className={`cursor-pointer rounded-[var(--radius)] py-2 text-[12px] font-bold tabular-nums transition-colors ${
                      y === thnLihat ? 'bg-brass text-white' : 'bg-panel-2 text-text-dim hover:bg-panel-2/70'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {BULAN_SINGKAT.map((nm, i) => {
                  const aktif = i + 1 === bulan && thnLihat === tahun;
                  return (
                    <button
                      key={nm}
                      type="button"
                      onClick={() => {
                        onUbah(i + 1, thnLihat);
                        setTerbuka(false);
                      }}
                      className={`cursor-pointer rounded-[var(--radius)] py-2 text-[12px] font-bold transition-colors ${
                        aktif ? 'bg-brass text-white' : 'bg-panel-2 text-text-dim hover:bg-panel-2/70'
                      }`}
                    >
                      {nm}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
