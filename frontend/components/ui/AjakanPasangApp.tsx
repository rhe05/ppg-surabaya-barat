'use client';

/* Ajakan memasang app ke layar utama (2026-09-01, diminta owner).

   Alasan: PWA-nya sudah siap sejak 2026-08-27 (app/manifest.ts, mode
   standalone) tapi guru harus tahu sendiri menu "titik tiga > Tambahkan ke
   layar utama" -- praktis tidak ada yang memasang. Bilah ini muncul SEKALI,
   bisa ditutup, dan setelah ditutup/terpasang tidak pernah muncul lagi.

   Dua jalur, karena browsernya beda perilaku:
   - Chrome Android (dan Chrome/Edge desktop): peristiwa
     `beforeinstallprompt` ditahan (preventDefault) lalu dipanggil ulang
     saat guru menekan "Pasang" -- ini SATU-SATUNYA cara memunculkan dialog
     pasang dari dalam halaman, dan hanya boleh dipanggil dari klik asli.
   - Safari iOS: TIDAK punya peristiwa itu sama sekali, pemasangan wajib
     lewat menu Bagikan. Jadi di sana bilahnya cuma memberi petunjuk
     (tanpa tombol Pasang) -- bukan tombol yang tidak melakukan apa-apa.

   Sengaja dirender di app/layout.tsx (bukan RequireAuth) supaya ikut
   tampil di halaman login: di situlah guru baru pertama kali membuka app.
   Posisinya melayang di atas bottom nav, pola & offset sama dgn
   BannerOffline.tsx supaya tidak bertumpuk dgn nav. */

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X, Share } from 'lucide-react';

const KUNCI = 'ajakan_pasang_ditutup';

type PeristiwaPasang = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function AjakanPasangApp() {
  const [peristiwa, setPeristiwa] = useState<PeristiwaPasang | null>(null);
  const [modeIOS, setModeIOS] = useState(false);
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    /* localStorage bisa melempar (mode privat/site data diblokir) -- jangan
       sampai itu menggagalkan render halaman. */
    try {
      if (localStorage.getItem(KUNCI)) return;
    } catch {}

    const sudahTerpasang =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (sudahTerpasang) return;

    const ua = window.navigator.userAgent;
    // Chrome/Firefox/Edge di iOS memakai mesin Safari tapi TIDAK punya menu
    // "Tambah ke Layar Utama" -- percuma memberi petunjuk Bagikan di sana.
    if (/iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua)) {
      setModeIOS(true);
      setTampil(true);
      return;
    }

    const saatBisaPasang = (e: Event) => {
      e.preventDefault();
      setPeristiwa(e as PeristiwaPasang);
      setTampil(true);
    };
    const saatTerpasang = () => tutup();
    window.addEventListener('beforeinstallprompt', saatBisaPasang);
    window.addEventListener('appinstalled', saatTerpasang);
    return () => {
      window.removeEventListener('beforeinstallprompt', saatBisaPasang);
      window.removeEventListener('appinstalled', saatTerpasang);
    };
  }, []);

  function tutup() {
    setTampil(false);
    try {
      localStorage.setItem(KUNCI, new Date().toISOString());
    } catch {}
  }

  async function pasang() {
    if (!peristiwa) return;
    await peristiwa.prompt();
    // Ditolak sekalipun bilahnya tidak dimunculkan lagi -- guru sudah tahu
    // fitur ini ada, memunculkannya berulang cuma mengganggu.
    await peristiwa.userChoice;
    tutup();
  }

  if (!tampil) return null;

  return (
    <div
      className="fixed inset-x-0 z-[555] flex justify-center px-4"
      style={{ bottom: 'calc(76px + env(safe-area-inset-bottom))' }}
    >
      <div className="flex w-full max-w-[430px] items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-panel p-3 shadow-[0_12px_32px_rgba(15,23,42,0.18)]">
        <Image
          src="/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="shrink-0 rounded-[10px]"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-text">Pasang Ruang Ngaji</p>
          {modeIOS ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11.5px] text-text-dim">
              Ketuk <Share size={12} className="inline shrink-0" /> Bagikan, lalu pilih
              &ldquo;Tambah ke Layar Utama&rdquo;.
            </p>
          ) : (
            <p className="mt-0.5 text-[11.5px] text-text-dim">
              Buka langsung dari layar utama, tanpa address bar.
            </p>
          )}
        </div>
        {!modeIOS && (
          <button
            type="button"
            onClick={pasang}
            className="shrink-0 cursor-pointer rounded-full border border-brass bg-brass px-4 py-2 text-[12.5px] font-bold text-white active:scale-[0.96]"
          >
            Pasang
          </button>
        )}
        <button
          type="button"
          onClick={tutup}
          aria-label="Tutup ajakan pasang"
          className="shrink-0 cursor-pointer rounded-full border-none bg-transparent p-1.5 text-text-faint active:bg-bg"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
