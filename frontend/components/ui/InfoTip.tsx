'use client';

/* Ikon "i" kecil di sebelah label -- ketuk (mobile) atau hover (desktop)
   utk memunculkan gelembung penjelasan singkat. Dipakai menggantikan
   paragraf bantuan yang makan tempat di form. Gelembung `absolute` di
   bawah ikon; form pemakainya TIDAK ber-`overflow-hidden` di jalur
   ancestornya, jadi tidak perlu portal/fixed. */

import { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';

export default function InfoTip({
  children,
  label = 'Info',
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [buka, setBuka] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!buka) return;
    function diLuar(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setBuka(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setBuka(false);
    }
    document.addEventListener('mousedown', diLuar);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', diLuar);
      document.removeEventListener('keydown', esc);
    };
  }, [buka]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setBuka(true)}
      onMouseLeave={() => setBuka(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={buka}
        aria-describedby={buka ? id : undefined}
        onClick={() => setBuka((v) => !v)}
        className="flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-faint transition-colors duration-150 hover:bg-brass hover:text-white active:scale-90"
      >
        <Info size={11} strokeWidth={2.75} />
      </button>
      {buka && (
        <span
          id={id}
          role="tooltip"
          className="absolute top-[calc(100%+7px)] left-0 z-[650] w-[210px] rounded-[12px] border border-border bg-panel px-3 py-2 text-left text-[11.5px] leading-snug font-normal text-text-dim shadow-[0_8px_24px_-6px_rgba(15,23,42,0.28)]"
        >
          <span
            aria-hidden
            className="absolute -top-[5px] left-[4px] h-[9px] w-[9px] rotate-45 border-t border-l border-border bg-panel"
          />
          {children}
        </span>
      )}
    </span>
  );
}
