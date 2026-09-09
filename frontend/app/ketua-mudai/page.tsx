'use client';

/* Landing sementara peran "Ketua Muda-i" — perannya aktif tapi
   aplikasinya belum dibuat. */

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Sparkles, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function KetuaMudaiPage() {
  const router = useRouter();
  const { profile, namaKelompok, signOut } = useAuth();

  async function keluar() {
    await signOut();
    router.push('/auth/login');
  }

  return (
    <main className="min-h-screen bg-bg">
      <div className="flex items-center gap-2.5 border-b border-border bg-panel px-[18px] pt-3.5 pb-3 shadow-[var(--shadow-subtle)]">
        <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={20} height={18} className="block shrink-0" />
        <span className="text-[15px] font-extrabold tracking-[0.01em] text-brand-green">Ruang Ngaji</span>
      </div>

      <div className="px-[18px] pt-10">
        <div className="rounded-card border border-border bg-panel p-6 text-center shadow-[var(--shadow-card)]">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brass-lembut text-brass">
            <Sparkles size={22} />
          </div>
          <div className="text-[16px] font-extrabold text-text">Peran Ketua Muda-i aktif</div>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] text-text-dim">
            Halo{profile?.display_name ? `, ${profile.display_name}` : ''}. Akun Anda sudah
            disetujui sebagai Ketua Muda-i
            {namaKelompok ? ` ${namaKelompok}` : ''}. Aplikasi khusus untuk peran ini
            sedang disiapkan — nantikan pembaruannya.
          </p>
          <button
            type="button"
            onClick={keluar}
            className="mt-5 inline-flex items-center gap-2 rounded-[var(--radius-button)] border border-border bg-transparent px-4 py-2 text-[13px] font-semibold text-red/80 hover:border-red hover:bg-[#FEF2F2] hover:text-red"
          >
            <LogOut size={15} />
            Keluar
          </button>
        </div>
      </div>
    </main>
  );
}
