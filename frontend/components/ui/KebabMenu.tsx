'use client';

/* Menu titik-tiga bersama -- dipindah dari app/kurikulum/page.tsx
   (2026-08-23) supaya bisa dipakai jg di RencanaPembelajaranView.tsx
   (kartu Klasikal, tombol edit per minggu) tanpa menduplikasi logika
   posisi portal-nya.

   Panel digambar lewat createPortal ke document.body dgn position:fixed
   (dihitung dari getBoundingClientRect() tombol), BUKAN absolute
   relatif ke tombolnya -- absolute ke-clip tak kelihatan kalau tombolnya
   ada di dalam kartu/wrapper yg overflow-hidden (mis. animasi buka/
   tutup kurikulum, atau sudut kartu membulat) dan box-nya berhenti
   PERSIS di baris terakhir, tidak ada slack vertikal utk dropdown yg
   terbuka ke bawah. position:fixed lolos dari overflow-hidden leluhur
   manapun (containing block-nya viewport, bukan box tsb). */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export default function KebabMenu({ item }: { item: { label: string; onClick: () => void; merah?: boolean }[] }) {
  const [terbuka, setTerbuka] = useState(false);
  const [posisi, setPosisi] = useState<{ top: number; left: number } | null>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);
  if (item.length === 0) return null;

  function buka() {
    const r = tombolRef.current?.getBoundingClientRect();
    if (!r) return;
    const LEBAR_PANEL = 160;
    const TINGGI_PANEL_PERKIRAAN = item.length * 36 + 12;
    const bukaKeAtas = r.bottom + TINGGI_PANEL_PERKIRAAN + 4 > window.innerHeight;
    setPosisi({
      top: bukaKeAtas ? r.top - TINGGI_PANEL_PERKIRAAN - 4 : r.bottom + 4,
      left: Math.max(8, r.right - LEBAR_PANEL),
    });
    setTerbuka(true);
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={tombolRef}
        type="button"
        aria-label="Aksi lain"
        onClick={(e) => {
          e.stopPropagation();
          if (terbuka) setTerbuka(false);
          else buka();
        }}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-text-dim transition-colors duration-150 hover:bg-panel-2"
      >
        <MoreVertical size={17} strokeWidth={2} />
      </button>
      {terbuka &&
        posisi &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setTerbuka(false)} />
            <div
              style={{ top: posisi.top, left: posisi.left }}
              className="fixed z-[91] flex w-[160px] flex-col gap-0.5 rounded-[var(--radius-lg)] border border-border bg-panel p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
            >
              {item.map((it) => (
                <button
                  key={it.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTerbuka(false);
                    it.onClick();
                  }}
                  className={
                    'w-full cursor-pointer rounded-[8px] border-none bg-transparent px-2.5 py-2 text-left text-[13px] font-semibold active:bg-bg ' +
                    (it.merah ? 'text-red' : 'text-text')
                  }
                >
                  {it.label}
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
