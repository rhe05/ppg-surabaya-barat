'use client';

/* Lonceng "Permintaan Masuk" utk ADMIN (AdminHeader.tsx) -- badge angka =
   permintaan Data Generus guru berstatus pending yang terlihat sesuai
   scope RLS (permintaan_generus_select_scoped, migrasi 20260821180000:
   admin_kelompok -> kelompoknya, admin_desa -> desanya, admin_ppg ->
   semua). Klik langsung ke /permintaan-generus -- BEDA dari lonceng guru
   (BellPermintaanGuru.tsx) yang punya dropdown sendiri, krn admin sudah
   py halaman daftar lengkap dgn tombol Setujui/Tolak (pola sama dgn
   "Persetujuan Akun" -> /pendaftaran, bukan dropdown). */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const PERAN_ADMIN = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

export default function BellPermintaanAdmin() {
  const { profile } = useAuth();
  const router = useRouter();
  const [jumlah, setJumlah] = useState(0);

  useEffect(() => {
    if (!profile?.role || !PERAN_ADMIN.includes(profile.role)) return;
    let cancelled = false;
    supabase
      .from('permintaan_generus')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => {
        if (!cancelled) setJumlah(count ?? 0);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.role]);

  if (!profile?.role || !PERAN_ADMIN.includes(profile.role)) return null;

  return (
    <button
      type="button"
      aria-label="Permintaan Generus"
      onClick={() => router.push('/permintaan-generus')}
      className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
    >
      <Bell size={18} strokeWidth={2} />
      {jumlah > 0 && (
        <span className="absolute top-1 right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-red px-[3px] text-[9px] font-bold text-white">
          {jumlah > 9 ? '9+' : jumlah}
        </span>
      )}
    </button>
  );
}
