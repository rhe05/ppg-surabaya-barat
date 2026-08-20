'use client';

import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import type { ToastItem } from './useToast';

const GAYA: Record<string, { kelas: string; Ikon: typeof Info }> = {
  sukses: { kelas: 'border-[#A7F3D0] bg-[#ECFDF5] text-sage', Ikon: CheckCircle2 },
  error: { kelas: 'border-[#FCA5A5] bg-[#FEF2F2] text-red', Ikon: XCircle },
  info: { kelas: 'border-border bg-panel text-text', Ikon: Info },
};

export default function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed inset-x-0 top-3 z-[2000] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const { kelas, Ikon } = GAYA[t.varian];
        return (
          <div
            key={t.id}
            className={`flex w-full max-w-[380px] items-start gap-2.5 rounded-[var(--radius)] border px-4 py-3 text-[13px] font-semibold shadow-[0_8px_24px_rgba(0,0,0,0.14)] ${kelas}`}
          >
            <Ikon size={18} className="mt-px shrink-0" />
            <span className="min-w-0 flex-1">{t.pesan}</span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Tutup notifikasi"
              className="shrink-0 cursor-pointer border-none bg-transparent p-0.5 opacity-60 hover:opacity-100"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
