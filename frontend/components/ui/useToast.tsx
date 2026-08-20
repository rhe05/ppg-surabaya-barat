'use client';

/* Sistem toast ringan — diminta owner (standar produk SaaS profesional),
   menggantikan teks pesan/error inline yang dulu dipakai layar Jurnal
   Mengajar. Sengaja LOKAL per-halaman (bukan context/provider global di
   layout.tsx) -- toast di sini murni notifikasi hasil aksi 1 layar
   (simpan/hapus/gagal), tidak perlu bertahan lintas navigasi, jadi tidak
   perlu provider app-wide yang menambah risiko ke seluruh app. */

import { useCallback, useRef, useState } from 'react';

export type ToastVarian = 'sukses' | 'error' | 'info';
export type ToastItem = { id: number; pesan: string; varian: ToastVarian };

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (pesan: string, varian: ToastVarian = 'info') => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, pesan, varian }]);
      setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );

  return { toasts, push, dismiss };
}
