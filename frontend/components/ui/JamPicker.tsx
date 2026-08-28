'use client';

/* Pemilih jam melayang (2026-08-28, diminta owner: "tampilan pilihan jam
   yang modern dan premium") — pengganti <input type="time"> bawaan
   browser yang tampilannya berbeda-beda tiap perangkat, sama alasannya
   dgn TanggalPicker.

   Dua kolom bergulir: JAM (00-23) & MENIT (kelipatan `langkahMenit`,
   baku 5 — jadwal KBM di app ini selalu jatuh di kelipatan 5, dan daftar
   60 menit penuh cuma membuat gulirannya panjang tanpa guna).

   Penempatan & pola tutupnya menyalin TanggalPicker: `position: fixed`
   dgn koordinat dari getBoundingClientRect() pemicunya (dihitung
   pemanggil), plus lapisan transparan penuh layar utk menutup. Nilai
   dikirim balik SEKETIKA tiap kolom disentuh -- tidak ada tombol OK,
   supaya sekali sentuh langsung terasa hasilnya. */

import { useEffect, useRef } from 'react';

export type PosisiJam = { top: number; right: number };

const dua = (n: number) => String(n).padStart(2, '0');

export default function JamPicker({
  terbuka,
  posisi,
  nilai,
  onPilih,
  onTutup,
  langkahMenit = 5,
}: {
  terbuka: boolean;
  posisi: PosisiJam | null;
  /* 'HH:MM'. Kosong dianggap 00:00 supaya kolomnya tetap punya sorotan. */
  nilai: string;
  onPilih: (v: string) => void;
  onTutup: () => void;
  langkahMenit?: number;
}) {
  const kolomJam = useRef<HTMLDivElement>(null);
  const kolomMenit = useRef<HTMLDivElement>(null);

  const [jamKini, menitKini] = (nilai || '00:00').split(':').map((n) => Number(n) || 0);
  const daftarJam = Array.from({ length: 24 }, (_, i) => i);
  const daftarMenit = Array.from({ length: Math.ceil(60 / langkahMenit) }, (_, i) => i * langkahMenit);

  /* Gulirkan nilai terpilih ke tengah begitu dibuka -- tanpa ini, jam
     15.45 mengharuskan pengguna menggulir jauh dari 00 tiap kali. */
  useEffect(() => {
    if (!terbuka) return;
    const kePosisi = (wadah: HTMLDivElement | null, indeks: number) => {
      if (!wadah) return;
      const anak = wadah.children[indeks] as HTMLElement | undefined;
      if (anak) wadah.scrollTop = anak.offsetTop - wadah.clientHeight / 2 + anak.clientHeight / 2;
    };
    kePosisi(kolomJam.current, daftarJam.indexOf(jamKini));
    const iMenit = daftarMenit.indexOf(Math.round(menitKini / langkahMenit) * langkahMenit);
    kePosisi(kolomMenit.current, iMenit < 0 ? 0 : iMenit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terbuka]);

  if (!terbuka || !posisi) return null;

  const kelasSel = (aktif: boolean) =>
    `cursor-pointer rounded-[10px] px-2 py-2 text-center text-[14px] tabular-nums transition-colors ${
      aktif ? 'bg-brass font-extrabold text-white' : 'font-semibold text-text hover:bg-panel-2'
    }`;

  return (
    <>
      <div className="fixed inset-0 z-[1090]" onClick={onTutup} />
      <div
        className="fixed z-[1100] w-[196px] rounded-[var(--radius-lg)] border border-border bg-panel p-3 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
        style={{ top: posisi.top, right: posisi.right }}
      >
        <div className="mb-2 flex items-center justify-center gap-1 text-[19px] font-extrabold tabular-nums text-text">
          <span>{dua(jamKini)}</span>
          <span className="text-text-faint">:</span>
          <span>{dua(menitKini)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-center text-[10px] font-bold tracking-[0.06em] text-text-faint uppercase">
              Jam
            </div>
            <div
              ref={kolomJam}
              className="tanpa-scrollbar flex max-h-[176px] flex-col gap-0.5 overflow-y-auto"
            >
              {daftarJam.map((j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => onPilih(`${dua(j)}:${dua(menitKini)}`)}
                  className={kelasSel(j === jamKini)}
                >
                  {dua(j)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 text-center text-[10px] font-bold tracking-[0.06em] text-text-faint uppercase">
              Menit
            </div>
            <div
              ref={kolomMenit}
              className="tanpa-scrollbar flex max-h-[176px] flex-col gap-0.5 overflow-y-auto"
            >
              {daftarMenit.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onPilih(`${dua(jamKini)}:${dua(m)}`)}
                  className={kelasSel(m === menitKini)}
                >
                  {dua(m)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
