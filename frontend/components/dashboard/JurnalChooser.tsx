'use client';

/* Popup pilihan "Jurnal Mengajar" — menyalin persis .ia-jr-chooser-modal app
   lama (Markup_Screens.html:786-810, Style_Main.html:6695-6810, kelas
   .ia-jr-chooser-opt-input indigo/.ia-jr-chooser-opt-edit amber). Kembaran
   KehadiranChooser.tsx, tema warna beda.

   RIWAYAT (20 Agt): awalnya ketiga tombol menuju /jurnal yang SAMA (jurnal
   harian lama, materi teks bebas). Diminta owner "buatkan isi aplikasinya
   kurang lebih spt [screenshot 3 layar]" -- sekarang TIGA layar terpisah
   sungguhan (components/jurnal/*View.tsx, tabel baru `jurnal_materi`,
   migrasi 20260820120000): Rencana Pembelajaran (/jurnal/rencana) susun
   materi per minggu, Pelaksanaan Pembelajaran (/jurnal/pelaksanaan)
   tandai materi minggu berjalan disampaikan/belum + catatan, Riwayat
   Pembelajaran (/jurnal/riwayat) progres % + filter + pencarian. /jurnal
   (lama, jurnal_kbm) TETAP ADA TIDAK DIUBAH -- masih dipakai admin utk
   rekap lintas-guru (RekapJurnal), popup ini sekarang tidak lagi menuju
   ke sana.

   Label & ikon diminta owner sebelumnya: "Input Jurnal"/"Edit Jurnal" ->
   "Rencana Pembelajaran" (BookOpen)/"Pelaksanaan Pembelajaran"
   (ClipboardCheck), + kartu ketiga "Riwayat Pembelajaran" (History, tema
   teal). Subjudul ketiga kartu hitam (text-text), bukan abu-abu
   (text-text-dim).

   PUTARAN KEDUA (diminta owner, standar produk profesional): ikon SVG
   tulis-tangan diganti library lucide-react sungguhan (sebelumnya
   disalin manual dari path Lucide -- sekarang pakai package-nya
   langsung, lebih terawat & konsisten dgn ikon lain kalau nanti
   di-update lucide-react-nya). */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ClipboardCheck, History, ChevronRight, X } from 'lucide-react';

const TUJUAN = ['/jurnal/rencana', '/jurnal/pelaksanaan', '/jurnal/riwayat'];

export default function JurnalChooser({
  terbuka,
  onTutup,
}: {
  terbuka: boolean;
  onTutup: () => void;
}) {
  const router = useRouter();

  /* Prefetch ketiga tujuan begitu popup ini DIBUKA -- diperbaiki
     2026-08-23, lihat komentar panjang di MenuGuru.tsx ttg kenapa
     ("dulu klik langsung bereaksi, sekarang ada jeda" -- gantinya
     "tutup belakangan" yg dulu dipakai utk perbaiki flash Dashboard,
     ternyata bikin app terasa lambat di SEMUA navigasi). Prefetch
     menyerang akar masalah keduanya: popup boleh nutup instan lagi
     (reaksi cepat) krn halaman tujuannya sudah siap duluan. */
  useEffect(() => {
    if (!terbuka) return;
    for (const tujuan of TUJUAN) router.prefetch(tujuan);
  }, [terbuka, router]);

  if (!terbuka) return null;

  /* onTutup() SEBELUM router.push() -- dikembalikan (diperbaiki
     2026-08-23), lihat komentar prefetch di atas ttg kenapa. */
  function pergi(tujuan: string) {
    onTutup();
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
          <X size={16} strokeWidth={2.4} />
        </button>

        <div className="mb-1 text-[17px] font-extrabold text-text">Jurnal Mengajar</div>
        <div className="mb-[18px] text-[12.5px] text-text">Pilih salah satu untuk melanjutkan.</div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => pergi('/jurnal/rencana')}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 p-[13px_14px] text-left transition-all duration-150 hover:border-[#4F46E5] hover:shadow-[0_4px_14px_rgba(79,70,229,0.16)] active:scale-[0.98]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
            >
              <BookOpen size={20} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold text-text">Rencana Pembelajaran</span>
              <span className="block text-[10.5px] text-text">
                Susun materi yang akan disampaikan pada minggu atau bulan ini
              </span>
            </span>
            <span className="shrink-0 text-text-faint">
              <ChevronRight size={16} strokeWidth={2.4} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => pergi('/jurnal/pelaksanaan')}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 p-[13px_14px] text-left transition-all duration-150 hover:border-[#D97706] hover:shadow-[0_4px_14px_rgba(217,119,6,0.16)] active:scale-[0.98]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)' }}
            >
              <ClipboardCheck size={20} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold text-text">Pelaksanaan Pembelajaran</span>
              <span className="block text-[10.5px] text-text">
                Konfirmasi materi yang telah disampaikan setelah kegiatan mengajar
              </span>
            </span>
            <span className="shrink-0 text-text-faint">
              <ChevronRight size={16} strokeWidth={2.4} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => pergi('/jurnal/riwayat')}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 p-[13px_14px] text-left transition-all duration-150 hover:border-[#0D9488] hover:shadow-[0_4px_14px_rgba(13,148,136,0.16)] active:scale-[0.98]"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #0D9488 0%, #14B8A6 100%)' }}
            >
              <History size={20} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15.5px] font-bold text-text">Riwayat Pembelajaran</span>
              <span className="block text-[10.5px] text-text">
                Tinjau materi yang sudah dan belum disampaikan pada periode tertentu.
              </span>
            </span>
            <span className="shrink-0 text-text-faint">
              <ChevronRight size={16} strokeWidth={2.4} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
