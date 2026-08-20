'use client';

/* Chrome header bersama utk 3 layar Jurnal Mengajar (Rencana/Pelaksanaan/
   Riwayat Pembelajaran) — hamburger+bell+hero nama/peran/kelompok, pola
   SAMA PERSIS GuruDashboard.tsx/riwayat/page.tsx/GuruLaporanView.tsx,
   diekstrak jadi satu komponen supaya TIDAK ngedrift antar 3 layar baru
   ini (pelajaran dari LaporanPerkembanganCetak.tsx — dulu 2 versi
   terpisah diam-diam beda).

   SENGAJA TANPA ikon kalender di hero (beda dari Dashboard/Riwayat/
   Laporan): pemilih Bulan/Tahun di 3 layar ini berbentuk pil lebar penuh
   di dalam konten (persis screenshot owner), bukan ikon kecil di hero —
   jadi tidak butuh slot kanan hero sama sekali. Pelaksanaan bahkan tidak
   butuh pemilih bulan/tahun sama sekali (selalu "hari ini"). */

import Image from 'next/image';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import MenuGuru from '@/components/dashboard/MenuGuru';
import KehadiranChooser from '@/components/dashboard/KehadiranChooser';
import JurnalChooser from '@/components/dashboard/JurnalChooser';

const SINGKATAN_KATEGORI: Record<string, string> = {
  'Muballigh Tugasan': 'MT',
  'Muballigh Setempat': 'MS',
  'Guru Mutu': 'GM',
  'Guru Bantu': 'GB',
};

export default function JurnalHeaderChrome() {
  const { profile, namaKelompok, kategoriGuru } = useAuth();
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [chooserTerbuka, setChooserTerbuka] = useState(false);
  const [jurnalChooserTerbuka, setJurnalChooserTerbuka] = useState(false);

  const singkatan = kategoriGuru ? (SINGKATAN_KATEGORI[kategoriGuru] ?? kategoriGuru) : null;
  const barisRole = singkatan ? `Guru Generus - ${singkatan}` : null;

  return (
    <>
      <MenuGuru
        terbuka={menuTerbuka}
        onTutup={() => setMenuTerbuka(false)}
        onKehadiran={() => setChooserTerbuka(true)}
        onJurnal={() => setJurnalChooserTerbuka(true)}
      />
      <KehadiranChooser terbuka={chooserTerbuka} onTutup={() => setChooserTerbuka(false)} />
      <JurnalChooser terbuka={jurnalChooserTerbuka} onTutup={() => setJurnalChooserTerbuka(false)} />

      <div className="shrink-0 overflow-hidden rounded-b-3xl bg-panel shadow-[0_6px_20px_rgba(5,150,105,0.22)]">
        <div className="flex items-center gap-2.5 bg-panel px-[18px] pt-3.5 pb-3">
          <button
            type="button"
            aria-label="Menu Utama"
            onClick={() => setMenuTerbuka((v) => !v)}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-start gap-[7px]">
            <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={20} height={18} className="block shrink-0" />
            <span className="text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Permintaan Masuk"
              className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </div>
        </div>

        <div className="bg-[linear-gradient(135deg,#059669_0%,#6B9975_100%)] px-[18px] pt-4 pb-5">
          <div className="text-[20px] leading-[1.2] font-bold text-white">
            {profile?.display_name ?? '-'}
          </div>
          {barisRole && (
            <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
              {barisRole}
            </div>
          )}
          {namaKelompok && (
            <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
              {namaKelompok}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
