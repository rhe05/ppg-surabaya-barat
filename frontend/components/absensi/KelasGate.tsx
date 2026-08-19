'use client';

/* Popup "Pilih Kelas" — menyalin persis .ia-kg-modal app lama
   (Markup_Screens.html:614-633, Style_Main.html:6047-6390): kartu bulat
   melayang, ikon gradient di atas, judul + subjudul, daftar kartu kelas
   yang bisa ditekan (lingkaran centang + nama + info + jumlah santri),
   footer Batal/Masuk.

   Dipakai dari /absensi (Input Kehadiran) saat guru mengampu >1 kelas —
   di app lama popup serupa juga dipakai Riwayat Kehadiran & Jurnal, tapi
   di sini komponennya digeneralkan lewat props supaya bisa dipakai ulang
   tanpa duplikasi CSS/markup. */

import { useState } from 'react';

export type KelasGateItem = {
  id: number;
  nama: string;
  badge?: string | null;
  info?: string | null;
  jumlah?: number | null;
};

function IkonSpinner() {
  return (
    <span
      className="h-[38px] w-[38px] animate-spin rounded-full border-[3px] border-[rgba(5,150,105,0.16)]"
      style={{ borderTopColor: 'var(--sage)' }}
    />
  );
}

function IkonCentang() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function KelasGate({
  terbuka,
  memuat = false,
  ikon,
  judul,
  subjudul,
  daftar,
  onPilih,
  onBatal,
}: {
  terbuka: boolean;
  memuat?: boolean;
  ikon: React.ReactNode;
  judul: string;
  subjudul: string;
  daftar: KelasGateItem[];
  onPilih: (item: KelasGateItem) => void;
  onBatal: () => void;
}) {
  const [terpilih, setTerpilih] = useState<number | null>(null);

  if (!terbuka) return null;

  return (
    <div className="fixed inset-0 z-[550] flex items-center justify-center bg-[rgba(15,23,42,0.6)] p-6 backdrop-blur-[4px]">
      <div className="flex max-h-[86vh] w-full max-w-[440px] flex-col rounded-[26px] bg-panel p-[26px_20px_18px] shadow-[0_-16px_48px_rgba(0,0,0,0.32)]">
        <div className="mb-[18px] shrink-0 text-center">
          <div
            className="mx-auto mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white shadow-[0_8px_20px_rgba(5,150,105,0.32)]"
            style={{
              background: 'linear-gradient(135deg, var(--sage) 0%, var(--brand-green) 100%)',
            }}
          >
            {ikon}
          </div>
          <div className="mb-1.5 text-[18px] font-extrabold text-text">{judul}</div>
          <div className="px-2 text-[12.5px] leading-relaxed text-text">{subjudul}</div>
        </div>

        {memuat ? (
          <div className="flex flex-col items-center justify-center gap-3.5 py-9 pb-[42px]">
            <IkonSpinner />
            <div className="text-[12.5px] font-semibold text-text-dim">Memuat kelas...</div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5 overflow-y-auto px-0.5 pt-0.5 pb-1">
              {daftar.map((item) => {
                const aktif = terpilih === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTerpilih(item.id)}
                    className={`relative flex items-center gap-3 rounded-[18px] border-[1.5px] p-3.5 text-left transition-all duration-150 active:scale-[0.98] ${
                      aktif
                        ? 'border-sage shadow-[0_6px_18px_rgba(5,150,105,0.2)]'
                        : 'border-border bg-panel-2'
                    }`}
                    style={
                      aktif
                        ? { background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' }
                        : undefined
                    }
                  >
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white ${
                        aktif ? 'border-sage text-white' : 'border-border text-transparent'
                      }`}
                      style={aktif ? { background: 'var(--sage)' } : undefined}
                    >
                      <IkonCentang />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[14.5px] font-bold text-text">Kelas {item.nama}</span>
                        {item.badge && (
                          <span className="rounded-full bg-[rgba(5,150,105,0.12)] px-2 py-0.5 text-[10px] font-bold text-sage">
                            {item.badge}
                          </span>
                        )}
                      </span>
                      {item.info && (
                        <span className="mt-0.5 block text-[12px] text-text">{item.info}</span>
                      )}
                    </span>
                    {item.jumlah != null && (
                      <span className="flex shrink-0 flex-col items-center text-[15px] font-extrabold text-sage">
                        {item.jumlah}
                        <span className="text-[9px] font-semibold tracking-[0.03em] text-text-faint uppercase">
                          Santri
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex shrink-0 gap-2.5">
              <button
                type="button"
                onClick={onBatal}
                className="shrink-0 cursor-pointer rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 px-[18px] py-[13px] text-[14px] font-bold text-text-dim active:scale-[0.97]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={terpilih === null}
                onClick={() => {
                  const item = daftar.find((d) => d.id === terpilih);
                  if (item) onPilih(item);
                }}
                className="flex-1 cursor-pointer rounded-[var(--radius-lg)] border-none py-[13px] text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(5,150,105,0.28)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
                style={{ background: 'linear-gradient(135deg, var(--sage), var(--brand-green))' }}
              >
                Masuk
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
