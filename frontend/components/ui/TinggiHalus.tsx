'use client';

/* Pembungkus yang mengubah tinggi kontennya SENDIRI jadi animasi CSS,
   bukan reflow instan -- dipakai kalau isi di dalamnya bisa berganti
   tinggi (Skeleton -> daftar sungguhan, daftar kelas A -> daftar kelas B
   yang jumlah barisnya beda, dst) dan owner minta "transisi smooth
   standar SaaS profesional" alih2 kartu2 di bawahnya "ngejump" seketika.

   Teknik: ResizeObserver mengukur tinggi KONTEN (div dalam, `ref`), lalu
   tinggi itu dipasang sbg `style.height` px pada pembungkus LUAR yang
   py `transition: height` + `overflow: hidden` -- setiap kali konten
   berubah tinggi, pembungkus luar mengejar via transisi CSS, bukan
   loncat instan. Opacity-fade (dipakai di tempat lain, mis. .animasi-
   konten-muncul di globals.css) TIDAK cukup di sini: opacity tidak
   mengubah KAPAN reflow terjadi, cuma menyamarkannya -- baru terasa
   "smooth" beneran kalau tingginya sendiri yang dianimasikan.

   Render PERTAMA sengaja tidak teranimasi (ResizeObserver baru
   mengukur async setelah mount) -- itu bukan masalah, karena mount
   pertama tetap terasa halus lewat fade-in opacity di pemanggilnya. */

import { useLayoutEffect, useRef, useState } from 'react';

export default function TinggiHalus({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const dalamRef = useRef<HTMLDivElement>(null);
  const [tinggi, setTinggi] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = dalamRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h != null) setTinggi(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={className}
      style={{ height: tinggi, overflow: 'hidden', transition: 'height 260ms cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <div ref={dalamRef}>{children}</div>
    </div>
  );
}
