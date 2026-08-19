'use client';

/* Popup status setelah Simpan Kehadiran — menyalin persis .ia-status-modal
   app lama (Markup_Screens.html: iaStatusModalOverlay, Style_Main.html:
   5858-6020, ikon dari IA_STATUS_MODAL_ICONS_ Script_Main.html:2936-2939).

   Dua "tone": sukses (hijau, centang, boleh menampilkan kutipan alih-alih
   pesan biasa — persis "Quote Of The Day" app lama) dan peringatan (amber,
   tanda seru dlm lingkaran) utk kondisi yang menahan penyimpanan (tanggal
   masa depan, sesi belum mulai, sedang mengajukan izin). */

type Tone = 'success' | 'warning';

function IkonCentang() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IkonSeru() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
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

export default function StatusModal({
  terbuka,
  tone,
  judul,
  pesan,
  kutipan,
  labelTombol = 'Mengerti',
  onTombol,
}: {
  terbuka: boolean;
  tone: Tone;
  judul: string;
  pesan?: string;
  kutipan?: string;
  labelTombol?: string;
  onTombol: () => void;
}) {
  if (!terbuka) return null;

  const sukses = tone === 'success';

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-6 backdrop-blur-[3px]">
      <div className="relative w-full max-w-[340px] rounded-[24px] bg-panel px-[26px] pt-8 pb-[26px] text-center shadow-[0_24px_48px_rgba(0,0,0,0.28)]">
        {/* .ia-status-modal-x — Style_Main.html:5882-5899. Diminta owner:
            tombol silang di pojok kanan atas kartu, sama seperti popup
            lain (KehadiranChooser dst) — sebelumnya cuma bisa ditutup
            lewat tombol besar di bawah. Aksinya SAMA dgn tombol itu
            (onTombol), tidak ada beda perilaku "batal" vs "mengerti". */}
        <button
          type="button"
          onClick={onTombol}
          aria-label="Tutup"
          className="absolute top-3.5 right-3.5 flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim transition-transform duration-150 active:scale-90"
        >
          <IkonSilang />
        </button>

        <div
          className="mx-auto mb-[18px] flex h-16 w-16 items-center justify-center rounded-full"
          style={
            sukses
              ? {
                  background: 'rgba(5,150,105,0.12)',
                  color: 'var(--brand-green)',
                  boxShadow: '0 0 0 6px rgba(5,150,105,0.06)',
                }
              : {
                  background: 'rgba(217,119,6,0.12)',
                  color: '#D97706',
                  boxShadow: '0 0 0 6px rgba(217,119,6,0.08)',
                }
          }
        >
          {sukses ? <IkonCentang /> : <IkonSeru />}
        </div>

        <div className="mb-2 text-[17px] font-extrabold text-text">{judul}</div>

        {kutipan ? (
          <div
            className="mb-6 rounded-2xl border px-4 pt-4 pb-3.5 text-center"
            style={{
              background: 'linear-gradient(160deg, rgba(255,209,102,0.14), rgba(5,150,105,0.06))',
              borderColor: 'rgba(255,209,102,0.4)',
            }}
          >
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[10.5px] font-extrabold tracking-[0.06em] text-[#B45309] uppercase">
              <span className="h-1 w-1 rounded-full bg-[#FFD166]" />
              Quote Of The Day
              <span className="h-1 w-1 rounded-full bg-[#FFD166]" />
            </div>
            <div className="text-[13.5px] leading-relaxed font-semibold text-text">
              &ldquo;{kutipan}&rdquo;
            </div>
          </div>
        ) : (
          pesan && <p className="mb-6 text-[13.5px] leading-relaxed text-text-dim">{pesan}</p>
        )}

        <button
          type="button"
          onClick={onTombol}
          className="w-full cursor-pointer rounded-[var(--radius-lg)] border-none py-[13px] text-[14px] font-bold text-white active:scale-[0.97]"
          style={
            sukses
              ? {
                  background: 'linear-gradient(135deg, var(--sage), var(--brand-green))',
                  boxShadow: '0 6px 16px rgba(5,150,105,0.28)',
                }
              : {
                  background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                  boxShadow: '0 6px 16px rgba(217,119,6,0.28)',
                }
          }
        >
          {labelTombol}
        </button>
      </div>
    </div>
  );
}
