'use client';

/* Dialog konfirmasi milik app (2026-08-28) — pengganti `window.confirm()`
   yang sebelumnya dipakai 4 layar guru (Jurnal, Kurikulum, Guru Izin,
   Pengumuman). `window.confirm` memunculkan kotak abu-abu bawaan browser
   LENGKAP dengan alamat "ruang-ngaji.vercel.app" di judulnya: satu-satunya
   momen di seluruh aplikasi yang membongkar bahwa ini halaman web, bukan
   aplikasi. Ia juga memblokir thread, tidak bisa diberi gaya, dan tidak
   membedakan aksi biasa dari aksi merusak.

   Pemakaian (mengembalikan Promise<boolean>, jadi kode pemanggil nyaris
   tidak berubah dari bentuk `if (!window.confirm(...)) return;`):

     const { konfirmasi, dialog } = useKonfirmasi();
     ...
     if (!(await konfirmasi({ judul: 'Hapus jurnal?', bahaya: true }))) return;
     ...
     return (<> ... {dialog} </>);

   `dialog` WAJIB dirender pemanggil (dipasang sekali di mana saja dalam
   pohonnya) — sengaja tidak lewat provider global supaya tidak ada layar
   yang diam-diam bergantung pada context yang belum terpasang. */

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export type OpsiKonfirmasi = {
  judul: string;
  pesan?: string;
  labelYa?: string;
  labelTidak?: string;
  /* true = aksi merusak (hapus/batalkan) -> tombol merah + ikon peringatan. */
  bahaya?: boolean;
};

export function useKonfirmasi() {
  const [opsi, setOpsi] = useState<OpsiKonfirmasi | null>(null);
  const janji = useRef<((setuju: boolean) => void) | null>(null);

  const konfirmasi = useCallback((o: OpsiKonfirmasi) => {
    setOpsi(o);
    return new Promise<boolean>((resolve) => {
      janji.current = resolve;
    });
  }, []);

  const tutup = useCallback((setuju: boolean) => {
    setOpsi(null);
    janji.current?.(setuju);
    janji.current = null;
  }, []);

  const dialog =
    opsi && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[700] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
            <div
              role="alertdialog"
              aria-modal="true"
              className="w-full max-w-[400px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.3)] sm:rounded-card"
            >
              <div className="flex gap-3.5">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    opsi.bahaya
                      ? 'bg-[rgba(220,38,38,0.12)] text-red'
                      : 'bg-[rgba(217,119,6,0.12)] text-brass'
                  }`}
                >
                  {opsi.bahaya ? <AlertTriangle size={19} /> : <HelpCircle size={19} />}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="text-[15.5px] leading-snug font-extrabold text-text">
                    {opsi.judul}
                  </h2>
                  {opsi.pesan && (
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-dim">{opsi.pesan}</p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => tutup(false)}
                  className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
                >
                  {opsi.labelTidak ?? 'Batal'}
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => tutup(true)}
                  className={`flex-1 cursor-pointer rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-bold text-white active:scale-[0.98] ${
                    opsi.bahaya ? 'border-red bg-red' : 'border-brass bg-brass'
                  }`}
                >
                  {opsi.labelYa ?? (opsi.bahaya ? 'Hapus' : 'Lanjutkan')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { konfirmasi, dialog };
}
