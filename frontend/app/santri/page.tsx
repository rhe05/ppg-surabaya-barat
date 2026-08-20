'use client';

/* Halaman berdiri sendiri utk Data Santri — diminta owner (20 Agt): item
   "Data Santri" sudah ada di AdminSidebar tapi belum ada tujuannya.
   Sebelumnya SantriList cuma komponen yang nempel di /dashboard (setengah
   lebar, berbagi baris dgn GuruList); sekarang dipindah ke halaman sendiri
   biar dapat ruang penuh dan cocok dgn nav sidebar yang sudah menunjuk ke
   /santri, sama seperti /kelola-absensi dkk yang juga satu halaman = satu
   fitur.

   Header "Data Generus - <cakupan>" (20 Agt, putaran keempat): data yang
   ditampilkan mencakup SELURUH Surabaya Barat utk admin_ppg, jadi judulnya
   harus bilang itu -- kalau login admin_desa/admin_kelompok, cakupannya
   dipersempit ke desa/kelompok merekasendiri (RLS yang sudah membatasi data
   query SantriList; judul ini cuma label, TIDAK pernah menampilkan nama
   desa/kelompok lain milik peran yang lebih sempit). Blok header sama persis
   dgn .dash-header Dashboard (app/dashboard/page.tsx) -- putih, sticky,
   border-b -- diminta owner supaya konsisten antar halaman admin. */

import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import SantriList from '@/components/SantriList';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

function JudulHalaman() {
  const { profile, namaKelompok } = useAuth();
  const [namaDesa, setNamaDesa] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (profile?.role === 'admin_desa' && profile.scope_desa_id) {
      supabase
        .from('desa')
        .select('nama')
        .eq('id', profile.scope_desa_id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setNamaDesa(data?.nama ?? null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [profile?.role, profile?.scope_desa_id]);

  const cakupan =
    profile?.role === 'admin_desa'
      ? namaDesa
      : profile?.role === 'admin_kelompok'
        ? namaKelompok
        : 'Surabaya Barat';

  return (
    <h1 className="m-0 text-[16px] font-semibold text-text">
      Data Generus{cakupan ? ` - ${cakupan}` : ''}
    </h1>
  );
}

export default function SantriPage() {
  return (
    <RequireAuth>
      <main className="min-h-screen bg-bg">
        {/* .dash-header — samakan dgn app/dashboard/page.tsx */}
        <div className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center border-b border-border bg-panel px-5 shadow-[var(--shadow-subtle)]">
          <JudulHalaman />
        </div>

        <div className="mx-auto w-full max-w-[1200px] px-5 pt-5 pb-10">
          <SantriList />
        </div>
      </main>
    </RequireAuth>
  );
}
