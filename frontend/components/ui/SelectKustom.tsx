'use client';

/* Select custom — diminta owner (standar produk SaaS profesional): native
   <select>/<input type=date> tampil beda-beda di iOS vs Android
   (rendering dropdown/date-wheel diserahkan ke OS, tidak bisa
   distandarkan). Komponen ini gantinya utk Jurnal Mengajar -- dropdown
   sendiri (bukan OS), jadi tampilannya identik di semua perangkat, sama
   spt TanggalPicker.tsx yang sudah ada utk tanggal.

   Posisi panel: `position: fixed` dgn koordinat dari getBoundingClientRect()
   tombol pemicu -- SAMA teknik TanggalPicker. Versi lama pakai `absolute`
   relatif wrapper; itu terpotong begitu komponen dipakai di dalam kartu
   ber-`overflow-hidden` (mis. kartu "Buku Jilid" Tilawati di Pelaksanaan
   Pembelajaran -- santri paling bawah dropdown-nya kepotong, tidak bisa
   di-scroll ke pilihan berikutnya). `fixed` lolos dari overflow ancestor
   selama tidak ada `transform` di ancestor (app ini memang menghindarinya,
   lihat komentar `konten-muncul` di globals.css). Panel juga BALIK KE ATAS
   kalau ruang bawah kurang. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export type OpsiSelect = { value: string; label: string; sublabel?: string };

const MAKS_TINGGI_PANEL = 260;

export default function SelectKustom({
  value,
  onChange,
  opsi,
  placeholder = '-- Pilih --',
  ikon,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  opsi: OpsiSelect[];
  placeholder?: string;
  ikon?: React.ReactNode;
  disabled?: boolean;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [posisi, setPosisi] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxH: number;
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const terpilih = opsi.find((o) => o.value === value);

  const hitungPosisi = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const ruangBawah = window.innerHeight - r.bottom - 8;
    const ruangAtas = r.top - 8;
    const balikKeAtas = ruangBawah < Math.min(MAKS_TINGGI_PANEL, 160) && ruangAtas > ruangBawah;
    setPosisi({
      left: r.left,
      width: r.width,
      maxH: Math.min(MAKS_TINGGI_PANEL, balikKeAtas ? ruangAtas : ruangBawah),
      ...(balikKeAtas
        ? { bottom: window.innerHeight - r.top + 6 }
        : { top: r.bottom + 6 }),
    });
  }, []);

  useEffect(() => {
    if (terbuka) hitungPosisi();
  }, [terbuka, hitungPosisi]);

  useEffect(() => {
    if (!terbuka) return;
    function tutupJikaDiluar(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setTerbuka(false);
    }
    function tutupSaatScroll(e: Event) {
      // Scroll DI DALAM daftar opsi sendiri jangan menutup panel.
      if (panelRef.current && panelRef.current.contains(e.target as Node)) return;
      setTerbuka(false);
    }
    function keluar() {
      setTerbuka(false);
    }
    document.addEventListener('mousedown', tutupJikaDiluar);
    // Scroll di container mana pun (bukan cuma window) -> tutup, supaya panel
    // tidak "menggantung" di koordinat lama.
    window.addEventListener('scroll', tutupSaatScroll, true);
    window.addEventListener('resize', keluar);
    return () => {
      document.removeEventListener('mousedown', tutupJikaDiluar);
      window.removeEventListener('scroll', tutupSaatScroll, true);
      window.removeEventListener('resize', keluar);
    };
  }, [terbuka]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setTerbuka((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-left text-[13px] text-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        {ikon && <span className="shrink-0 text-text-faint">{ikon}</span>}
        <span className={`min-w-0 flex-1 truncate ${!terpilih ? 'text-text-faint' : ''}`}>
          {terpilih ? terpilih.label : placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-text-faint" />
      </button>

      {terbuka && posisi && (
        <div
          ref={panelRef}
          className="fixed z-[1100] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-panel p-1.5 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
          style={{
            left: posisi.left,
            width: posisi.width,
            maxHeight: posisi.maxH,
            ...(posisi.top != null ? { top: posisi.top } : { bottom: posisi.bottom }),
          }}
        >
          {opsi.length === 0 && (
            <div className="px-3 py-2.5 text-[12.5px] text-text-faint">Tidak ada pilihan.</div>
          )}
          {opsi.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setTerbuka(false);
              }}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius)] px-3 py-2.5 text-left text-[13px] transition-colors duration-150 hover:bg-panel-2 ${
                o.value === value ? 'font-semibold text-brass' : 'text-text'
              }`}
            >
              <span className="min-w-0 truncate">
                {o.label}
                {o.sublabel && <span className="ml-1.5 text-[11.5px] font-normal text-text-faint">{o.sublabel}</span>}
              </span>
              {o.value === value && <Check size={15} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
