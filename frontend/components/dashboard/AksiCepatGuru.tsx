'use client';

/* Aksi cepat Dashboard guru (2026-08-28). Sebelum ini GuruDashboard sama
   sekali TIDAK punya tombol navigasi -- satu-satunya jalan berpindah layar
   adalah hamburger di pojok, jadi tugas harian yang paling sering
   dikerjakan (isi kehadiran, tulis jurnal) selalu butuh 2 tap + membaca
   daftar 11 item. Empat pintasan ini menaruh pekerjaan itu satu tap dari
   layar pertama, pola baku aplikasi produktivitas.

   Kehadiran & Jurnal memakai popup pemilih yang SAMA dgn tab bar
   (KehadiranChooser/JurnalChooser: Input vs Riwayat / Rencana vs
   Pelaksanaan vs Riwayat) -- bukan jalur baru, supaya tidak ada dua
   perilaku berbeda utk satu tujuan yang sama. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, NotebookPen, GraduationCap, Banknote } from 'lucide-react';
import KehadiranChooser from '@/components/dashboard/KehadiranChooser';
import JurnalChooser from '@/components/dashboard/JurnalChooser';

type Aksi = {
  label: string;
  ikon: typeof ClipboardCheck;
  warna: string;
  latar: string;
  href?: string;
  aksi?: 'kehadiran' | 'jurnal';
};

const AKSI: Aksi[] = [
  {
    label: 'Kehadiran',
    ikon: ClipboardCheck,
    warna: 'var(--sage)',
    latar: 'rgba(5,150,105,0.12)',
    aksi: 'kehadiran',
  },
  {
    label: 'Jurnal',
    ikon: NotebookPen,
    warna: 'var(--indigo)',
    latar: 'rgba(79,70,229,0.12)',
    aksi: 'jurnal',
  },
  {
    label: 'Generus',
    ikon: GraduationCap,
    warna: 'var(--brass)',
    latar: 'rgba(217,119,6,0.12)',
    href: '/santri-saya',
  },
  {
    label: 'Tabungan',
    ikon: Banknote,
    warna: 'var(--teal)',
    latar: 'rgba(13,148,136,0.12)',
    href: '/tabungan',
  },
];

export default function AksiCepatGuru() {
  const router = useRouter();
  const [kehadiranTerbuka, setKehadiranTerbuka] = useState(false);
  const [jurnalTerbuka, setJurnalTerbuka] = useState(false);

  useEffect(() => {
    for (const a of AKSI) if (a.href) router.prefetch(a.href);
  }, [router]);

  return (
    <>
      <KehadiranChooser terbuka={kehadiranTerbuka} onTutup={() => setKehadiranTerbuka(false)} />
      <JurnalChooser terbuka={jurnalTerbuka} onTutup={() => setJurnalTerbuka(false)} />

      <div className="mb-2.5 grid grid-cols-4 gap-2">
        {AKSI.map((a) => {
          const Ikon = a.ikon;
          return (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                if (a.aksi === 'kehadiran') setKehadiranTerbuka(true);
                else if (a.aksi === 'jurnal') setJurnalTerbuka(true);
                else if (a.href) router.push(a.href);
              }}
              className="flex cursor-pointer flex-col items-center gap-1.5 rounded-card border border-border bg-panel px-1 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition-transform duration-150 active:scale-[0.96]"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: a.latar, color: a.warna }}
              >
                <Ikon size={17} strokeWidth={2.2} />
              </span>
              <span className="text-[10.5px] leading-none font-bold text-text">{a.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
