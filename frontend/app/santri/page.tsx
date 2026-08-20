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
   border-b -- diminta owner supaya konsisten antar halaman admin.

   Identitas peran di pojok kanan atas (20 Agt, putaran keenam): dulu ada di
   footer AdminSidebar (di atas tombol Keluar) -- diminta owner PINDAH ke
   sini, sejajar dgn judul "Data Generus - ...". Isinya SAMA PERSIS dgn yang
   dulu di sidebar (label peran + nama kelompok kalau ada), cuma lokasinya
   yang berubah; sumber labelnya lib/roles.ts supaya tidak drift kalau nanti
   dipakai lagi di tempat lain. */

import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import SantriList from '@/components/SantriList';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { LABEL_PERAN } from '@/lib/roles';

function useCakupanDesa() {
  const { profile } = useAuth();
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

  return namaDesa;
}

function JudulHalaman() {
  const { profile, namaKelompok } = useAuth();
  const namaDesa = useCakupanDesa();

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

function IdentitasPeran() {
  const { profile, namaKelompok } = useAuth();
  const labelPeran = profile?.role ? (LABEL_PERAN[profile.role] ?? profile.role) : null;
  if (!labelPeran) return null;

  return (
    <div className="text-right leading-tight">
      <div className="text-[12px] font-semibold text-text">{labelPeran}</div>
      {namaKelompok && <div className="text-[11px] text-text-faint">{namaKelompok}</div>}
    </div>
  );
}

export default function SantriPage() {
  return (
    <RequireAuth>
      <main className="min-h-screen bg-bg">
        {/* .dash-header — samakan dgn app/dashboard/page.tsx */}
        <div className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center justify-between border-b border-border bg-panel px-5 shadow-[var(--shadow-subtle)]">
          <JudulHalaman />
          <IdentitasPeran />
        </div>

        <div className="mx-auto w-full max-w-[1200px] px-5 pt-5 pb-10">
          <SantriList />
        </div>
      </main>
    </RequireAuth>
  );
}
