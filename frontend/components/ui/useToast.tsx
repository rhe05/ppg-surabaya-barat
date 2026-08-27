'use client';

/* Sistem toast APP-WIDE (2026-08-27, titik 3 polish SaaS) — dulu
   `useToast` lokal per-halaman (cuma dipakai layar Jurnal). Sekarang satu
   ToastProvider di layout.tsx: layar mana pun cukap `useToast().sukses(...)`
   / `.error(...)`, render-nya di SATU tempat konsisten (bawah topbar,
   tengah atas), animasi & durasi seragam, dukung tombol "Urungkan".

   Kompatibilitas: `push(pesan, varian)` + `dismiss(id)` + `toasts` masih
   diekspor supaya 3 komponen jurnal lama tidak perlu ditulis ulang. */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import ToastStack from './ToastStack';

export type ToastVarian = 'sukses' | 'error' | 'info';
export type ToastAksi = { label: string; jalankan: () => void };
export type ToastItem = {
  id: number;
  pesan: string;
  varian: ToastVarian;
  aksi?: ToastAksi;
};

type ToastCtx = {
  toasts: ToastItem[];
  tampil: (pesan: string, opts?: { varian?: ToastVarian; aksi?: ToastAksi; durasiMs?: number }) => void;
  sukses: (pesan: string, aksi?: ToastAksi) => void;
  error: (pesan: string) => void;
  info: (pesan: string) => void;
  tutup: (id: number) => void;
  /* alias kompat lama */
  push: (pesan: string, varian?: ToastVarian) => void;
  dismiss: (id: number) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const tutup = useCallback((id: number) => {
    setToasts((p) => p.filter((t) => t.id !== id));
    const tm = timers.current.get(id);
    if (tm) {
      clearTimeout(tm);
      timers.current.delete(id);
    }
  }, []);

  const tampil = useCallback<ToastCtx['tampil']>(
    (pesan, opts = {}) => {
      const id = ++idRef.current;
      const { varian = 'info', aksi, durasiMs } = opts;
      /* Maks 3 toast sekaligus (buang yg tertua). */
      setToasts((p) => [...p.slice(-2), { id, pesan, varian, aksi }]);
      const ms = durasiMs ?? (aksi ? 6000 : varian === 'error' ? 5000 : 3200);
      timers.current.set(
        id,
        setTimeout(() => tutup(id), ms),
      );
    },
    [tutup],
  );

  const sukses = useCallback<ToastCtx['sukses']>((p, aksi) => tampil(p, { varian: 'sukses', aksi }), [tampil]);
  const error = useCallback<ToastCtx['error']>((p) => tampil(p, { varian: 'error' }), [tampil]);
  const info = useCallback<ToastCtx['info']>((p) => tampil(p, { varian: 'info' }), [tampil]);
  const push = useCallback<ToastCtx['push']>((p, varian = 'info') => tampil(p, { varian }), [tampil]);

  return (
    <Ctx.Provider
      value={{ toasts, tampil, sukses, error, info, tutup, push, dismiss: tutup }}
    >
      {children}
      <ToastStack toasts={toasts} onDismiss={tutup} />
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast harus dipakai di dalam <ToastProvider>');
  return c;
}
