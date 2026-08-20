'use client';

/* Select custom — diminta owner (standar produk SaaS profesional): native
   <select>/<input type=date> tampil beda-beda di iOS vs Android
   (rendering dropdown/date-wheel diserahkan ke OS, tidak bisa
   distandarkan). Komponen ini gantinya utk Jurnal Mengajar -- dropdown
   sendiri (bukan OS), jadi tampilannya identik di semua perangkat, sama
   spt TanggalPicker.tsx yang sudah ada utk tanggal.

   Posisi dropdown pakai `absolute` relatif wrapper-nya sendiri (BUKAN
   `fixed`+getBoundingClientRect spt TanggalPicker/popup Bulan-Tahun) --
   komponen ini dipakai di dalam konten biasa/modal yang TIDAK overflow-
   hidden, jadi tidak kena masalah "terpotong ancestor" yang mendorong
   TanggalPicker pakai fixed. */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type OpsiSelect = { value: string; label: string; sublabel?: string };

export default function SelectKustom({
  value,
  onChange,
  opsi,
  placeholder = '-- Pilih --',
  ikon,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  opsi: OpsiSelect[];
  placeholder?: string;
  ikon?: React.ReactNode;
  disabled?: boolean;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const terpilih = opsi.find((o) => o.value === value);

  useEffect(() => {
    if (!terbuka) return;
    function tutupJikaDiluar(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setTerbuka(false);
    }
    document.addEventListener('mousedown', tutupJikaDiluar);
    return () => document.removeEventListener('mousedown', tutupJikaDiluar);
  }, [terbuka]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setTerbuka((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-left text-[13px] text-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ikon && <span className="shrink-0 text-text-faint">{ikon}</span>}
        <span className={`min-w-0 flex-1 truncate ${!terpilih ? 'text-text-faint' : ''}`}>
          {terpilih ? terpilih.label : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-text-faint" />
      </button>

      {terbuka && (
        <div className="absolute z-[1100] mt-1.5 max-h-[260px] w-full overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-panel p-1.5 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]">
          {opsi.length === 0 && (
            <div className="px-3 py-2.5 text-[12.5px] text-text-faint">Tidak ada pilihan.</div>
          )}
          {opsi.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setTerbuka(false);
              }}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius)] px-3 py-2.5 text-left text-[13px] transition-colors duration-150 hover:bg-panel-2 ${
                o.value === value ? 'font-semibold text-brass' : 'text-text'
              }`}
            >
              <span className="min-w-0 truncate">
                {o.label}
                {o.sublabel && <span className="ml-1.5 text-[11.5px] font-normal text-text-faint">{o.sublabel}</span>}
              </span>
              {o.value === value && <Check size={15} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
