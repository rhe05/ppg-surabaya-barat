'use client';

/* Kartu navigasi ke /pendaftaran, khusus admin. Menampilkan jumlah permintaan
   yang menunggu supaya antrean tidak diam-diam menumpuk: orang yang mendaftar
   TIDAK bisa berbuat apa-apa sampai ada admin yang meninjau, jadi angka ini
   satu-satunya isyarat bahwa ada yang menunggu.

   Hitungannya `head: true` — hanya jumlah, tidak menarik satu baris pun. RLS
   pendaftaran_read_scoped sudah menyaring: admin kelompok hanya menghitung
   permintaan guru di kelompoknya sendiri. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const PERAN_ADMIN = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

export default function KartuPendaftaran() {
  const { profile } = useAuth();
  const router = useRouter();
  const [menunggu, setMenunggu] = useState<number | null>(null);
  const adalahAdmin = PERAN_ADMIN.includes(profile?.role ?? '');

  useEffect(() => {
    if (!adalahAdmin) return;
    let dibatalkan = false;
    supabase
      .from('pendaftaran_akun')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'menunggu')
      .then(({ count }) => {
        if (!dibatalkan) setMenunggu(count ?? 0);
      });
    return () => {
      dibatalkan = true;
    };
  }, [adalahAdmin]);

  if (!adalahAdmin) return null;

  return (
    <button
      onClick={() => router.push('/pendaftaran')}
      className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
    >
      <span className="flex items-center gap-2.5">
        <span className="text-[16px] font-bold text-brass">Pendaftaran Akun</span>
        {menunggu !== null && menunggu > 0 && (
          <span className="rounded-[var(--radius-button)] bg-brass px-2.5 py-0.5 text-[12px] font-bold text-white">
            {menunggu}
          </span>
        )}
      </span>
      <span className="mt-2 block text-[13px] text-text-faint">
        {menunggu === null
          ? 'Setujui peran & kelompok akun baru'
          : menunggu > 0
            ? `${menunggu} permintaan menunggu persetujuan Anda`
            : 'Tidak ada permintaan yang menunggu'}
      </span>
    </button>
  );
}
