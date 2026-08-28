'use client';

/* Tarik-untuk-segarkan (2026-08-28). Dipasang di Dashboard guru — layar
   "rumah" yang paling sering dibuka dan paling wajar untuk disegarkan
   (statistik kehadiran berubah sepanjang hari).

   Kenapa perlu padahal peramban punya bawaan: begitu app dipasang lewat
   "Tambahkan ke Layar Utama" (manifest standalone, lihat app/manifest.ts),
   Chrome TIDAK lagi menyediakan tarik-untuk-segarkan bawaan — di mode itu
   satu-satunya cara memuat ulang adalah menutup dan membuka app. Justru di
   mode itulah app ini paling banyak dipakai guru.

   BATASAN yang disengaja supaya tidak mengganggu gulir normal:
   - Hanya aktif kalau halaman benar-benar di posisi paling atas
     (window.scrollY <= 0) SAAT jari mulai menyentuh.
   - Hanya bereaksi pada tarikan ke BAWAH; tarikan ke atas dilepas
     sepenuhnya ke peramban.
   - preventDefault baru dipanggil setelah tarikan melewati ambang kecil,
     jadi sentuhan biasa (tap, gulir ke bawah) tidak pernah dicegat.
   - `overscroll-behavior-y: contain` dipasang HANYA selama komponen ini
     terpasang, supaya tarik bawaan peramban tidak jalan berbarengan di
     layar ini — dan layar lain tetap punya perilaku bawaannya.

   Tidak dipakai di layar yang menggulir wadah dalam (GuruAbsensiView
   memakai h-screen + overflow-hidden): di sana window.scrollY selalu 0
   sehingga penjaga "sudah di paling atas" kehilangan artinya. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

const AMBANG = 70; // px tarikan sebelum segarkan dijalankan
const MAKS = 110; // px tarikan maksimum yang ditampilkan

export default function TarikUntukSegarkan({
  onSegarkan,
  children,
}: {
  onSegarkan: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [tarik, setTarik] = useState(0);
  const [sedang, setSedang] = useState(false);
  const mulaiY = useRef<number | null>(null);
  const aktif = useRef(false);

  const selesaikan = useCallback(async () => {
    setSedang(true);
    try {
      await onSegarkan();
    } finally {
      setSedang(false);
      setTarik(0);
    }
  }, [onSegarkan]);

  useEffect(() => {
    const sebelumnya = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = 'contain';

    function onStart(e: TouchEvent) {
      if (window.scrollY > 0 || sedang) {
        mulaiY.current = null;
        return;
      }
      mulaiY.current = e.touches[0].clientY;
      aktif.current = false;
    }

    function onMove(e: TouchEvent) {
      if (mulaiY.current == null || sedang) return;
      const delta = e.touches[0].clientY - mulaiY.current;
      if (delta <= 0) {
        /* Jari bergerak ke atas = gulir biasa. Lepaskan sepenuhnya. */
        mulaiY.current = null;
        setTarik(0);
        return;
      }
      if (delta < 8) return; // sentuhan kecil, belum dianggap tarikan
      aktif.current = true;
      if (e.cancelable) e.preventDefault();
      /* Redam supaya terasa "berat" makin jauh ditarik. */
      setTarik(Math.min(MAKS, delta * 0.5));
    }

    function onEnd() {
      if (mulaiY.current == null) return;
      const cukup = aktif.current && tarik >= AMBANG * 0.5;
      mulaiY.current = null;
      aktif.current = false;
      if (cukup) selesaikan();
      else setTarik(0);
    }

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.body.style.overscrollBehaviorY = sebelumnya;
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [tarik, sedang, selesaikan]);

  const tampil = sedang ? 44 : tarik;
  const siap = tarik >= AMBANG * 0.5;

  return (
    <>
      <div
        aria-hidden={tampil === 0}
        className="pointer-events-none fixed inset-x-0 top-0 z-[45] flex justify-center overflow-hidden"
        style={{ height: tampil, transition: sedang || tarik === 0 ? 'height 200ms' : undefined }}
      >
        <span
          className="mt-2 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-panel shadow-[0_4px_12px_rgba(15,23,42,0.15)]"
          style={{ opacity: Math.min(1, tampil / 40) }}
        >
          <RotateCw
            size={15}
            className={sedang ? 'animate-spin text-sage' : siap ? 'text-sage' : 'text-text-faint'}
            style={sedang ? undefined : { transform: `rotate(${tampil * 3}deg)` }}
          />
        </span>
      </div>
      {children}
    </>
  );
}
