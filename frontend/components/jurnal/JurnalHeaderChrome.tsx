'use client';

/* Chrome header bersama utk 3 layar Jurnal Mengajar (Rencana/Pelaksanaan/
   Riwayat Pembelajaran) — hamburger+bell(+hero nama/peran/kelompok), pola
   SAMA PERSIS GuruDashboard.tsx/riwayat/page.tsx/GuruLaporanView.tsx,
   diekstrak jadi satu komponen supaya TIDAK ngedrift antar 3 layar baru
   ini (pelajaran dari LaporanPerkembanganCetak.tsx — dulu 2 versi
   terpisah diam-diam beda).

   SENGAJA TANPA ikon kalender di hero (beda dari Dashboard/Riwayat/
   Laporan): pemilih Bulan/Tahun di 3 layar ini berbentuk pil lebar penuh
   di dalam konten (persis screenshot owner), bukan ikon kecil di hero —
   jadi tidak butuh slot kanan hero sama sekali. Pelaksanaan bahkan tidak
   butuh pemilih bulan/tahun sama sekali (selalu "hari ini").

   PUTARAN KEDUA (diminta owner): hero hijau (nama/peran/kelompok) BOLEH
   disembunyikan lewat prop `tampilkanHero` -- alasan: hero itu murni
   pengulangan info yang sudah dilihat guru di Dashboard, dan utk layar
   turunan/detail spt Rencana Pembelajaran itu jadi berat tanpa nilai
   tambah (standar produk profesional: hero besar reserved utk layar tab
   utama, layar sub-alur cukup top bar ringkas). Top bar putih (hamburger
   + brand + bell) TETAP SELALU tampil apa pun nilai prop ini -- itu
   satu-satunya jalan guru kembali ke menu, tidak boleh hilang. */

import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import BellPermintaanGuru from '@/components/notifikasi/BellPermintaanGuru';

const SINGKATAN_KATEGORI: Record<string, string> = {
  'Muballigh Tugasan': 'MT',
  'Muballigh Setempat': 'MS',
  'Guru Mutu': 'GM',
  'Guru Bantu': 'GB',
};

export default function JurnalHeaderChrome({ tampilkanHero = true }: { tampilkanHero?: boolean }) {
  const { profile, namaKelompok, kategoriGuru } = useAuth();

  const singkatan = kategoriGuru ? (SINGKATAN_KATEGORI[kategoriGuru] ?? kategoriGuru) : null;
  const barisRole = singkatan ? `Guru Generus - ${singkatan}` : null;

  return (
    <>
      <div className={`shrink-0 bg-panel ${tampilkanHero ? 'overflow-hidden rounded-b-3xl shadow-[0_6px_20px_rgba(5,150,105,0.22)]' : 'border-b border-border shadow-[var(--shadow-subtle)]'}`}>
        <div className="flex items-center gap-2.5 bg-panel px-[18px] pt-3.5 pb-3">
          <div className="flex min-w-0 flex-1 items-center justify-start gap-[7px]">
            <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={20} height={18} className="block shrink-0" />
            <span className="text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <BellPermintaanGuru />
          </div>
        </div>

        {tampilkanHero && (
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
        )}
      </div>
    </>
  );
}
