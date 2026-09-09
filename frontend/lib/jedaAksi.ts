'use client';

/* "Stun" aksi — mencegah satu handler async ditembak berkali-kali:
   1. selama panggilan sebelumnya masih berjalan  -> abaikan
   2. dalam `jedaMs` sejak panggilan terakhir dimulai -> abaikan

   Latar: 2026-09-10 ditemukan sebuah klien (tab peramban lama) terjebak
   memanggil simpan_absensi_kelas ~20x/detik selama berminggu-minggu —
   tiap panggilan kena error 40001 lalu langsung dicoba lagi. Server kini
   punya pagar (batasi_laju, migrasi 20260910100000); ini pagar sisi klien
   supaya handler baru tidak bisa lagi memicu badai request seperti itu.

   Pola: bungkus handler yang memanggil supabase.rpc()/insert()/update()
   yang dipicu tombol.

     const simpan = useJedaAksi(handleSimpan);      // pakai `simpan` di onClick
*/

import { useCallback, useRef } from 'react';

export function useJedaAksi<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts?: { jedaMs?: number },
): (...args: A) => Promise<R | undefined> {
  const jedaMs = opts?.jedaMs ?? 1200;
  const sibuk = useRef(false);
  const mulaiTerakhir = useRef(0);

  return useCallback(
    async (...args: A) => {
      if (sibuk.current) return undefined;
      const sekarang = Date.now();
      if (sekarang - mulaiTerakhir.current < jedaMs) return undefined;
      sibuk.current = true;
      mulaiTerakhir.current = sekarang;
      try {
        return await fn(...args);
      } finally {
        sibuk.current = false;
      }
    },
    [fn, jedaMs],
  );
}
