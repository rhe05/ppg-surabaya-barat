'use client';

/* Banner "sedang offline" (2026-08-28). Dirender sekali di RequireAuth
   supaya berlaku utk SEMUA layar, guru maupun admin.

   Duduk di ATAS bottom nav (bottom-[60px] saat nav guru ada) supaya
   keduanya tidak bertumpuk. Sengaja di bawah, bukan di atas: top bar tiap
   layar sudah padat, dan pesan ini bukan sesuatu yang perlu menggeser
   seluruh isi halaman ke bawah.

   Saat koneksi pulih, banner berubah hijau sebentar ("Kembali terhubung")
   lalu menghilang -- tanpa itu, guru yang sempat melihat banner merah
   tidak pernah tahu kapan boleh mencoba menyimpan lagi. */

import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useKoneksi } from '@/lib/useKoneksi';

export default function BannerOffline({ adaBottomNav = false }: { adaBottomNav?: boolean }) {
  const daring = useKoneksi();
  const [pulih, setPulih] = useState(false);
  const pernahOffline = useRef(false);

  useEffect(() => {
    if (!daring) {
      pernahOffline.current = true;
      setPulih(false);
      return;
    }
    if (!pernahOffline.current) return;
    pernahOffline.current = false;
    setPulih(true);
    const t = setTimeout(() => setPulih(false), 3000);
    return () => clearTimeout(t);
  }, [daring]);

  if (daring && !pulih) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[550] flex justify-center px-4"
      style={{
        bottom: adaBottomNav
          ? 'calc(68px + env(safe-area-inset-bottom))'
          : 'calc(14px + env(safe-area-inset-bottom))',
      }}
    >
      <div
        className={`flex max-w-[430px] items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-bold text-white shadow-[0_6px_20px_rgba(15,23,42,0.25)] ${
          daring ? 'bg-sage' : 'bg-red'
        }`}
      >
        {daring ? <Wifi size={14} /> : <WifiOff size={14} />}
        {daring ? 'Kembali terhubung' : 'Anda sedang offline'}
      </div>
    </div>
  );
}
