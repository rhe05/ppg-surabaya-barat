'use client';

/* Deteksi viewport sempit (breakpoint md Tailwind, 768px) via
   window.matchMedia -- dipakai HANYA utk admin_kelompok (2026-08-24,
   fitur "Dashboard Kehadiran Kelompok" mobile): guru SELALU dikunci ke
   tampilan mobile apa pun device-nya (RequireAuth.tsx), jadi tidak perlu
   deteksi run-time; admin sebaliknya perlu DUA tampilan berbeda
   tergantung device sungguhan (sidebar desktop vs dashboard mobile
   sendiri), makanya baru sekarang hook ini dibutuhkan.

   Kembalikan `null` selama belum diketahui (server-render/render pertama
   sebelum efek jalan -- window belum ada), BUKAN `false` -- pemanggil
   WAJIB menampilkan layar netral (spt loading logo RequireAuth) selama
   null, supaya tidak sempat kelihatan salah pilih tampilan (desktop
   dulu baru "lompat" ke mobile) sepersekian detik pas mount, pola yang
   sama dgn `siap` di AdminSidebar.tsx (localStorage ciut/lebar). */

import { useEffect, useState } from 'react';

export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
