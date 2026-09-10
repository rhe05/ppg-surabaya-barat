'use client';

/* Input teks + dropdown saran ketik ("seperti kotak pencarian Google"):
   dibuka saat fokus, disaring tiap ketikan (substring, case-insensitive),
   klik = terpilih. `onPilih` opsional dipanggil dgn item terpilih (bawa
   `.rec` kalau ada) — dipakai utk menarik seluruh data terkait ke form.

   Diangkat dari components/santri/SantriForm.tsx (2026-08-29) jadi
   komponen bersama. Panel melayang pakai usePanelMelayang (WAJIB utk
   panel yg bisa kepotong ancestor overflow-hidden / bottom-sheet). */

import { useCallback, useState } from 'react';
import { usePanelMelayang } from '@/lib/usePanelMelayang';
import type { SaranItem } from '@/lib/saran';

const INPUT_BAWAAN =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const LABEL_BAWAAN = 'mb-1.5 block text-[12px] font-semibold text-text';

export function FieldSaran<T = unknown>({
  label,
  wajib,
  value,
  onChange,
  onPilih,
  saran,
  placeholder,
  colSpan,
  inputClass = INPUT_BAWAAN,
  labelClass = LABEL_BAWAAN,
}: {
  label: string;
  wajib?: boolean;
  value: string;
  onChange: (v: string) => void;
  onPilih?: (item: SaranItem<T>) => void;
  saran: SaranItem<T>[];
  placeholder?: string;
  colSpan?: boolean;
  inputClass?: string;
  labelClass?: string;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const tutup = useCallback(() => setTerbuka(false), []);
  const { anchorRef, panelRef, gaya } = usePanelMelayang<HTMLInputElement>(terbuka, tutup);
  const q = value.trim().toLowerCase();
  const cocok = (q ? saran.filter((s) => s.teks.toLowerCase().includes(q)) : saran).slice(0, 8);

  return (
    <div className={colSpan ? 'relative sm:col-span-2' : 'relative'}>
      <label className={labelClass}>
        {label}
        {wajib ? ' *' : ''}
      </label>
      <input
        ref={anchorRef}
        className={inputClass}
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setTerbuka(true)}
        onBlur={() => setTimeout(() => setTerbuka(false), 150)}
        placeholder={placeholder}
      />
      {terbuka && gaya && cocok.length > 0 && (
        <div
          ref={panelRef}
          style={gaya}
          className="z-20 rounded-[var(--radius)] border border-border bg-panel shadow-[0_10px_25px_-8px_rgba(15,23,42,0.35)]"
        >
          {cocok.map((item, i) => (
            <button
              key={`${item.teks}-${i}`}
              type="button"
              /* mousedown+preventDefault supaya klik terdaftar SEBELUM
                 onBlur input menutup dropdown — kalau tidak, blur keburu
                 menutup dropdown & klik jatuh ke tempat kosong. */
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(item.teks);
                onPilih?.(item);
                setTerbuka(false);
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left text-[13px] text-text hover:bg-panel-2"
            >
              {item.teks}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
