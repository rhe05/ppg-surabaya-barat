'use client';

/* Popup pilihan "Jurnal Mengajar" — menyalin persis .ia-jr-chooser-modal app
   lama (Markup_Screens.html:786-810, Style_Main.html:6695-6810, kelas
   .ia-jr-chooser-opt-input indigo/.ia-jr-chooser-opt-edit amber). Kembaran
   KehadiranChooser.tsx, tema warna beda.

   Berbeda dari Kehadiran (yang Riwayat-nya benar-benar fitur baru): di app
   BARU, /jurnal SUDAH menggabungkan input dan riwayat+edit dalam satu
   halaman — pilih tanggal hari ini untuk mengisi, klik "Buka" pada baris
   Riwayat Kelas Ini untuk mengubah entri lama. Karena itu kedua tombol di
   sini menuju halaman yang SAMA; popup ini murni membantu guru memilih niat
   (isi baru vs ubah lama) sebelum masuk, bukan mengarahkan ke dua alur
   terpisah seperti app lama (yang memang dua tampilan berbeda).

   Label & ikon diminta owner (20 Agt): "Input Jurnal"/"Edit Jurnal" ->
   "Rencana Pembelajaran" (IkonBookOpen)/"Pelaksanaan Pembelajaran"
   (IkonClipboardCheck) -- istilah kurikulum yang lebih jelas drpd sekadar
   "input"/"edit". Subjudul kedua kartu jg diminta hitam (text-text),
   bukan abu-abu (text-text-dim). */

import { useRouter } from 'next/navigation';

// Lucide "book-open" — diminta owner (Rencana Pembelajaran).
function IkonBookOpen() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

// Lucide "clipboard-check" — diminta owner (Pelaksanaan Pembelajaran).
// Sama persis ikon "Kehadiran" di MenuGuru.tsx.
function IkonClipboardCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  );
}

function IkonPanah() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function IkonSilang() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function JurnalChooser({
  terbuka,
  onTutup,
}: {
  terbuka: boolean;
  onTutup: () => void;
}) {
  const router = useRouter();

  if (!terbuka) return null;

  function pergi() {
    onTutup();
    router.push('/jurnal');
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

        <div className="mb-1 text-[17px] font-extrabold text-text">Jurnal Mengajar</div>
        <div className="mb-[18px] text-[12.5px] text-text">Pilih salah satu untuk melanjutkan.</div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={pergi}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 p-[13px_14px] text-left transition-all duration-150 hover:border-[#4F46E5] hover:shadow-[0_4px_14px_rgba(79,70,229,0.16)] active:scale-[0.98]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
            >
              <IkonBookOpen />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-text">Rencana Pembelajaran</span>
              <span className="block text-[11.5px] text-text">
                Susun materi yang akan disampaikan pada minggu atau bulan ini
              </span>
            </span>
            <span className="shrink-0 text-text-faint">
              <IkonPanah />
            </span>
          </button>

          <button
            type="button"
            onClick={pergi}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 p-[13px_14px] text-left transition-all duration-150 hover:border-[#D97706] hover:shadow-[0_4px_14px_rgba(217,119,6,0.16)] active:scale-[0.98]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)' }}
            >
              <IkonClipboardCheck />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold text-text">Pelaksanaan Pembelajaran</span>
              <span className="block text-[11.5px] text-text">
                Konfirmasi materi yang telah disampaikan setelah kegiatan mengajar
              </span>
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
