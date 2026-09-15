'use client';

/* Petunjuk "Pasang ke Layar Utama" (2026-09-15, diminta owner: keluhan
   guru iPhone Kelp Bangun Rejo "tidak bisa install/buka" -- setelah digali,
   Safari-nya sendiri sudah bisa dibuka NORMAL, cuma gurunya tidak tahu
   caranya "install" krn iPhone TIDAK punya tombol Install spt Android
   (satu-satunya jalan: Safari > Bagikan > Tambah ke Layar Utama).

   AjakanPasangApp.tsx SUDAH menjelaskan ini, TAPI cuma sekali muncul lalu
   hilang selamanya begitu ditutup (localStorage) -- begitu guru menutupnya
   tanpa sempat paham, tidak ada jalan lagi utk melihatnya lagi. Modal ini
   TIDAK terikat localStorage sama sekali, dipanggil dari menu "Cara Pasang
   Aplikasi" (guru & admin kelp), jadi bisa dibuka ulang kapan pun. */

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { X, Share, MoreVertical } from 'lucide-react';

type Platform = 'ios' | 'android' | 'lain' | 'terpasang' | null;

const LANGKAH_NOMOR =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage-lembut text-[12px] font-bold text-sage';

export default function CaraPasangAppModal({
  terbuka,
  onTutup,
}: {
  terbuka: boolean;
  onTutup: () => void;
}) {
  const [platform, setPlatform] = useState<Platform>(null);

  useEffect(() => {
    if (!terbuka) return;
    const sudahTerpasang =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (sudahTerpasang) {
      setPlatform('terpasang');
      return;
    }
    const ua = window.navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) setPlatform('ios');
    else if (/android/i.test(ua)) setPlatform('android');
    else setPlatform('lain');
  }, [terbuka]);

  if (!terbuka) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[570] bg-black/40" onClick={onTutup} />
      <div className="fixed inset-x-0 bottom-0 z-[571] mx-auto w-full max-w-[430px] rounded-t-[24px] border border-border bg-panel px-5 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_-16px_48px_rgba(0,0,0,0.28)]">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[16px] font-extrabold text-text">Pasang ke Layar Utama</span>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={15} />
          </button>
        </div>

        {platform === 'terpasang' && (
          <p className="text-[13px] text-text-dim">
            Aplikasi ini sudah terpasang di perangkat Anda -- buka dari ikon Ruang Ngaji di layar
            utama, bukan dari browser.
          </p>
        )}

        {platform === 'ios' && (
          <ol className="flex flex-col gap-3.5">
            <li className="flex items-start gap-3">
              <span className={LANGKAH_NOMOR}>1</span>
              <span className="text-[13px] leading-relaxed text-text">
                Buka halaman ini lewat <b>Safari</b> (bukan Chrome atau dalam aplikasi WhatsApp) --
                cuma Safari yang bisa memasang ke layar utama di iPhone.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={LANGKAH_NOMOR}>2</span>
              <span className="flex flex-wrap items-center gap-1 text-[13px] leading-relaxed text-text">
                Ketuk ikon <Share size={15} className="inline shrink-0 text-sage" /> <b>Bagikan</b> di
                bar bawah Safari.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={LANGKAH_NOMOR}>3</span>
              <span className="text-[13px] leading-relaxed text-text">
                Gulir ke bawah daftarnya, ketuk <b>&ldquo;Tambah ke Layar Utama&rdquo;</b>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={LANGKAH_NOMOR}>4</span>
              <span className="text-[13px] leading-relaxed text-text">
                Ketuk <b>&ldquo;Tambah&rdquo;</b> di pojok kanan atas -- ikon Ruang Ngaji muncul di
                layar utama, bisa dibuka langsung spt aplikasi biasa (tanpa address bar).
              </span>
            </li>
          </ol>
        )}

        {platform === 'android' && (
          <ol className="flex flex-col gap-3.5">
            <li className="flex items-start gap-3">
              <span className={LANGKAH_NOMOR}>1</span>
              <span className="text-[13px] leading-relaxed text-text">
                Buka halaman ini lewat <b>Chrome</b>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={LANGKAH_NOMOR}>2</span>
              <span className="flex flex-wrap items-center gap-1 text-[13px] leading-relaxed text-text">
                Ketuk ikon titik tiga <MoreVertical size={15} className="inline shrink-0 text-sage" />{' '}
                di pojok kanan atas Chrome.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className={LANGKAH_NOMOR}>3</span>
              <span className="text-[13px] leading-relaxed text-text">
                Pilih <b>&ldquo;Instal aplikasi&rdquo;</b> atau <b>&ldquo;Tambahkan ke Layar
                Utama&rdquo;</b>.
              </span>
            </li>
          </ol>
        )}

        {platform === 'lain' && (
          <p className="text-[13px] text-text-dim">
            Buka halaman ini dari HP (Safari di iPhone, atau Chrome di Android) untuk bisa dipasang
            ke layar utama.
          </p>
        )}
      </div>
    </>,
    document.body,
  );
}
