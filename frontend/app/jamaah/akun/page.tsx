'use client';

/* Akun — tab ke-4 bottom nav Penerobos Kelp. Identitas akun + Keluar. */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, LogOut } from 'lucide-react';
import JamaahChrome from '@/components/jamaah/JamaahChrome';
import { useAuth } from '@/lib/auth-context';

function inisialDari(nama: string) {
  const b = nama.split(/\s+/).filter(Boolean);
  if (b.length === 0) return '·';
  return ((b[0][0] ?? '') + (b[1]?.[0] ?? '')).toUpperCase() || '·';
}

export default function AkunPenerobosPage() {
  const router = useRouter();
  const { user, profile, namaKelompok, signOut } = useAuth();
  const nama = profile?.display_name ?? '-';
  const inisial = useMemo(() => inisialDari(profile?.display_name ?? ''), [profile?.display_name]);
  const [keluar, setKeluar] = useState(false);

  async function lakukanKeluar() {
    setKeluar(true);
    await signOut();
    router.push('/auth/login');
  }

  return (
    <main className="min-h-screen bg-bg">
      <JamaahChrome />
      <div className="px-[18px] pt-4 pb-10">
        <div className="label-mikro mb-2.5">Akun</div>

        <div className="hero-navy animasi-konten-muncul flex items-center gap-3.5 px-[18px] py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-green text-[15px] font-bold text-white ring-1 ring-white/10">
            {inisial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[18px] leading-tight font-bold text-white capitalize">
              {nama}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-full bg-hijau px-2 py-[3px] text-[10px] font-bold tracking-[0.05em] text-white uppercase">
                Penerobos Kelp
              </span>
              {namaKelompok && (
                <span className="flex items-center gap-1 text-[12px] font-medium text-white/65">
                  <MapPin size={11} strokeWidth={2} />
                  {namaKelompok}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="kartu-premium mt-4 overflow-hidden">
          <BarisInfo label="Email" nilai={user?.email ?? '—'} />
          <BarisInfo label="Peran" nilai="Penerobos Kelp" />
          <BarisInfo label="Kelompok" nilai={namaKelompok ?? '—'} />
        </div>

        <button
          type="button"
          onClick={lakukanKeluar}
          disabled={keluar}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border border-border bg-panel px-5 py-3 text-[13.5px] font-bold text-red active:scale-[0.99] disabled:opacity-50"
        >
          <LogOut size={16} strokeWidth={2} />
          {keluar ? 'Keluar…' : 'Keluar'}
        </button>

        <p className="mt-8 text-center text-[11px] text-text-faint">
          Ruang Ngaji · Penerobos Kelp
        </p>
      </div>
    </main>
  );
}

function BarisInfo({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="baris-daftar flex items-center justify-between gap-3 px-4 py-3.5">
      <span className="label-mikro shrink-0">{label}</span>
      <span className="min-w-0 truncate text-[13px] font-semibold text-text">{nilai}</span>
    </div>
  );
}
