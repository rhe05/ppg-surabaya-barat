'use client';

/* Pemilih Bulan + Tahun "premium" — kartu melayang di bawah tombol pemicu,
   gaya SAMA dgn popup kalender KPI di AdminKelpDashboard.tsx & Riwayat
   Kehadiran (posisi dihitung dari getBoundingClientRect tombol, position
   fixed, dirender di luar wrapper mana pun supaya tidak ke-clip overflow).
   Trigger = pill "Agustus 2026" + ikon kalender. */

import { useRef, useState } from 'react';
import { Calendar } from 'lucide-react';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const SELECT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text';

export default function PilihBulanTahun({
  bulan,
  tahun,
  onChange,
  tahunOpsi,
}: {
  bulan: number; // 1-12
  tahun: number;
  onChange: (bulan: number, tahun: number) => void;
  tahunOpsi?: number[];
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [posisi, setPosisi] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  const now = new Date();
  const tahunList = tahunOpsi ?? [now.getFullYear() - 1, now.getFullYear()];

  function toggle() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPosisi({ top: r.bottom + 8, right: window.innerWidth - r.right });
    setTerbuka((v) => !v);
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={toggle}
        aria-label="Pilih Bulan dan Tahun"
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-panel-2 px-3 py-1.5 text-[12px] font-bold text-text active:scale-[0.96]"
      >
        <Calendar size={14} className="text-indigo" />
        {NAMA_BULAN[bulan - 1]} {tahun}
      </button>

      {terbuka && posisi && (
        <>
          <div className="fixed inset-0 z-[1090]" onClick={() => setTerbuka(false)} />
          <div
            className="fixed z-[1100] w-[240px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
            style={{ top: posisi.top, right: posisi.right }}
          >
            <div className="flex gap-2">
              <select
                className={SELECT}
                value={bulan}
                onChange={(e) => onChange(Number(e.target.value), tahun)}
              >
                {NAMA_BULAN.map((nm, i) => (
                  <option key={nm} value={i + 1}>
                    {nm}
                  </option>
                ))}
              </select>
              <select
                className={SELECT}
                value={tahun}
                onChange={(e) => onChange(bulan, Number(e.target.value))}
              >
                {tahunList.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </>
  );
}
