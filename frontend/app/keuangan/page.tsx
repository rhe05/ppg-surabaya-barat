'use client';

/* Hub "Keuangan" (2026-09-11) -- pintu masuk tunggal ke dua fitur uang
   yang model datanya sengaja TIDAK disatukan: Tabungan (per-SANTRI,
   wajib santri_id) dan Infaq Pengajian (global per kelas, tanpa
   atribusi ke anak). Owner memutuskan digabung di sini, bukan
   dicampur jadi satu tabel/layar. */

import { useRouter } from 'next/navigation';
import { Banknote, HandCoins, HandHeart, ChevronRight } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import AdminHeader from '@/components/dashboard/AdminHeader';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import { useAuth } from '@/lib/auth-context';

const MENU = [
  {
    label: 'Tabungan',
    deskripsi: 'Tabungan generus per anak — Rekreasi, Qurban, dst.',
    href: '/tabungan',
    ikon: Banknote,
    warna: 'text-brass',
    bg: 'bg-brass-lembut',
  },
  {
    label: 'Infaq Pengajian',
    deskripsi: 'Infaq terkumpul per kelas, dicatat global (bukan per anak).',
    href: '/infaq-pengajian',
    ikon: HandCoins,
    warna: 'text-sage',
    bg: 'bg-sage-lembut',
  },
  {
    label: 'Shodaqoh',
    deskripsi: 'Jenis bebas diatur (Generus Sakit, Tali Asih Guru, dst) -- per anak atau global.',
    href: '/shodaqoh',
    ikon: HandHeart,
    warna: 'text-indigo',
    bg: 'bg-indigo-lembut',
  },
];

function KeuanganContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin_kelompok';
  const router = useRouter();

  return (
    <main className="relative flex min-h-screen flex-col bg-bg">
      {isAdmin ? <AdminHeader judul="Keuangan" /> : <JurnalHeaderChrome tampilkanHero={false} />}

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-24">
        <h1 className="mb-4 text-[17px] font-extrabold tracking-[-0.01em] text-text">Keuangan</h1>

        <div className="flex flex-col gap-3">
          {MENU.map((m) => {
            const Ikon = m.ikon;
            return (
              <button
                key={m.href}
                type="button"
                onClick={() => router.push(m.href)}
                className="kartu-premium flex w-full cursor-pointer items-center gap-3 p-4 text-left active:scale-[0.99]"
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${m.bg} ${m.warna}`}>
                  <Ikon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold text-text">{m.label}</div>
                  <div className="mt-0.5 truncate text-[12px] text-text-dim">{m.deskripsi}</div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-text-faint" />
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default function KeuanganPage() {
  return (
    <RequireAuth>
      <KeuanganContent />
    </RequireAuth>
  );
}
