'use client';

/* Popup pilihan "Kehadiran" — menyalin persis .ia-jr-chooser-modal app lama
   (Markup_Screens.html:757-782, Style_Main.html:6695-6810): kartu bulat
   putih, judul + subjudul rata kiri, dua kartu pilihan dengan ikon gradient
   dan panah di kanan.

   Input Kehadiran = alur lama (/absensi, sudah ada). Riwayat Kehadiran =
   fitur baru (matrix santri × tanggal, /absensi/riwayat) yang di app lama
   sendiri baru ditambahkan belakangan — bukan hasil migrasi, ini pertama
   kali dibangun di app baru. */

import { useRouter } from 'next/navigation';

function IkonInput() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

function IkonRiwayat() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function IkonPanah() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function IkonSilang() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function KehadiranChooser({
  terbuka,
  onTutup,
}: {
  terbuka: boolean;
  onTutup: () => void;
}) {
  const router = useRouter();

  if (!terbuka) return null;

  /* TIDAK panggil onTutup() sebelum router.push() -- sama pola dgn
     perbaikan JurnalChooser.tsx (2026-08-23, laporan owner "sekilas
     tampil Dashboard" saat pindah halaman). Lihat komentar lengkap di
     sana. */
  function pilih(tujuan: string) {
    router.push(tujuan);
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-6 backdrop-blur-[3px]"
      onClick={onTutup}
    >
      <div
        className="relative w-full max-w-[360px] rounded-[24px] bg-panel px-[26px] pt-[30px] pb-[26px] text-left shadow-[0_24px_48px_rgba(0,0,0,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onTutup}
          aria-label="Tutup"
          className="absolute top-3.5 right-3.5 flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
        >
          <IkonSilang />
        </button>

        <div className="mb-1 text-[17px] font-extrabold text-text">Kehadiran</div>
        <div className="mb-[18px] text-[12.5px] text-text">Pilih salah satu untuk melanjutkan.</div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => pilih('/absensi')}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 p-[13px_14px] text-left transition-all duration-150 hover:border-brand-green hover:shadow-[0_4px_14px_rgba(107,153,117,0.18)] active:scale-[0.98]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, var(--sage), var(--brand-green))' }}
            >
              <IkonInput />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-text">Input Kehadiran</span>
              <span className="block text-[11.5px] text-text-dim">Catat kehadiran santri hari ini</span>
            </span>
            <span className="shrink-0 text-text-faint">
              <IkonPanah />
            </span>
          </button>

          <button
            type="button"
            onClick={() => pilih('/absensi/riwayat')}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 p-[13px_14px] text-left transition-all duration-150 hover:border-[#2563EB] hover:shadow-[0_4px_14px_rgba(37,99,235,0.16)] active:scale-[0.98]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' }}
            >
              <IkonRiwayat />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-text">Riwayat Kehadiran</span>
              <span className="block text-[11.5px] text-text-dim">Lihat kehadiran yang sudah tercatat</span>
            </span>
            <span className="shrink-0 text-text-faint">
              <IkonPanah />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
