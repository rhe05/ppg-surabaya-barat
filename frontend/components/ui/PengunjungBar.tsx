'use client';

/* Bilah khusus peran `pengunjung` (fitur demo via link, 2026-09-11).
   Data yang dilihat FIKTIF (satu kelompok contoh), read-only. Berbeda
   dari peran mobile lain: pengunjung TIDAK dikunci ke satu app, jadi
   dia dapat bilah ini utk gonta-ganti App Guru <-> Penerobos Kelp +
   Keluar — satu-satunya cara navigasi lintas-app krn masing-masing
   chrome (JurnalHeaderChrome/JamaahChrome) tidak saling tahu. */

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function PengunjungBar({ aktif }: { aktif: 'guru' | 'jamaah' }) {
  const router = useRouter();
  const { signOut } = useAuth();

  async function keluar() {
    await signOut();
    router.push('/auth/login');
  }

  return (
    <div className="sticky top-0 z-40 flex items-center gap-2 border-b border-[#FDE68A] bg-[#FFFBEB] px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-[#92400E]">
        Mode Pengunjung &middot; Data Contoh
      </span>
      <div className="flex shrink-0 items-center gap-1 rounded-full bg-white/70 p-0.5">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
            aktif === 'guru' ? 'bg-[#92400E] text-white' : 'text-[#92400E]'
          }`}
        >
          Guru
        </button>
        <button
          type="button"
          onClick={() => router.push('/jamaah')}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
            aktif === 'jamaah' ? 'bg-[#92400E] text-white' : 'text-[#92400E]'
          }`}
        >
          Penerobos
        </button>
      </div>
      <button
        type="button"
        aria-label="Keluar"
        onClick={keluar}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-none bg-transparent text-[#92400E]"
      >
        <LogOut size={13} strokeWidth={2.2} />
      </button>
    </div>
  );
}
