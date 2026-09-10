'use client';

/* Posisi panel melayang (dropdown/combobox/saran) yang ditambatkan ke satu
   elemen pemicu. Pakai `position: fixed` + koordinat dari
   getBoundingClientRect() -- SAMA teknik TanggalPicker/KebabMenu -- supaya
   panel TIDAK terpotong oleh ancestor ber-`overflow-hidden` (mis. kartu
   `.kartu-premium`, atau bottom-sheet). `fixed` lolos dari overflow ancestor
   selama tidak ada `transform` di ancestor (app ini memang menghindarinya,
   lihat komentar `konten-muncul` di globals.css).

   Yang di-handle di sini: hitung koordinat + lebar + tinggi maks, BALIK KE
   ATAS kalau ruang bawah kurang. Saat halaman di-scroll ATAU di-resize panel
   IKUT BERGESER mengikuti pemicu (bukan menutup) -- keyboard virtual HP
   memicu resize + auto-scroll saat input baru difokus; kalau panel ditutup
   di sini dropdown tak pernah sempat tampil. Panel baru ditutup kalau
   pemicunya benar-benar keluar viewport. Deteksi klik-di-luar SENGAJA
   tidak di sini -- tiap pemakai punya caranya sendiri (onBlur, mousedown
   ke wrapper, dst). */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

const MAKS_TINGGI = 260;
const AMBANG_BALIK_ATAS = 160;

export function usePanelMelayang<T extends HTMLElement = HTMLElement>(
  terbuka: boolean,
  tutup: () => void,
) {
  const anchorRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [gaya, setGaya] = useState<CSSProperties | null>(null);

  const hitung = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ruangBawah = window.innerHeight - r.bottom - 8;
    const ruangAtas = r.top - 8;
    const keAtas = ruangBawah < Math.min(MAKS_TINGGI, AMBANG_BALIK_ATAS) && ruangAtas > ruangBawah;
    setGaya({
      position: 'fixed',
      left: r.left,
      width: r.width,
      maxHeight: Math.min(MAKS_TINGGI, keAtas ? ruangAtas : ruangBawah),
      overflowY: 'auto',
      ...(keAtas ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }, []);

  useEffect(() => {
    if (terbuka) hitung();
    else setGaya(null); // jangan biarkan koordinat lama nyangkut saat dibuka lagi
  }, [terbuka, hitung]);

  useEffect(() => {
    if (!terbuka) return;
    /* Scroll ATAU resize: panel IKUT pemicu (reposisi), tidak ditutup.
       `resize` khususnya dipicu keyboard virtual HP saat input difokus —
       kalau di sini `tutup()` dropdown lenyap sebelum sempat dipakai.
       Ditutup hanya kalau pemicu benar-benar keluar viewport. */
    function saatGeser(e: Event) {
      if (e.type === 'scroll' && panelRef.current && panelRef.current.contains(e.target as Node)) return;
      const el = anchorRef.current;
      if (!el) return tutup();
      const r = el.getBoundingClientRect();
      const terlihat = r.bottom > 0 && r.top < window.innerHeight;
      if (terlihat) hitung();
      else tutup();
    }
    window.addEventListener('scroll', saatGeser, true);
    window.addEventListener('resize', saatGeser);
    return () => {
      window.removeEventListener('scroll', saatGeser, true);
      window.removeEventListener('resize', saatGeser);
    };
  }, [terbuka, tutup, hitung]);

  return { anchorRef, panelRef, gaya };
}
