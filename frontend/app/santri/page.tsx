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
   desa/kelompok lain milik peran yang lebih sempit).

   Header komponen bersama (20 Agt, putaran ketujuh): dulu halaman ini
   menulis blok .dash-header sendiri (identik dgn punya Dashboard, disalin-
   tempel) + identitas peran ditambahkan manual di sini. Sekarang keduanya
   dari components/dashboard/AdminHeader.tsx satu sumber -- lihat komponen
   itu utk identitas peran (dulu di footer AdminSidebar, riwayat lengkap di
   sana). */

import { useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import SantriList from '@/components/SantriList';
import AdminHeader from '@/components/dashboard/AdminHeader';
import AdminSantriMobile from '@/components/dashboard/AdminSantriMobile';
import { useAuth } from '@/lib/auth-context';
import { useIsMobile } from '@/lib/useIsMobile';
import { supabase } from '@/lib/supabase';

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

  return <>Data Generus{cakupan ? ` - ${cakupan}` : ''}</>;
}

/* Cabang mobile admin_kelompok (2026-08-26, diminta owner: "Data Master"
   -> Data Generus) -- pola SAMA PERSIS app/guru/page.tsx: SantriList
   desktop adalah tabel penuh yang tidak cocok di layar sempit, jadi
   admin_kelompok di HP melihat AdminSantriMobile.tsx (kartu, gaya Data
   Generus guru) -- peran/perangkat lain TIDAK berubah. */
function SantriContent() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();

  if (profile?.role === 'admin_kelompok' && isMobile) {
    return <AdminSantriMobile />;
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul={<JudulHalaman />} />

      <div className="mx-auto w-full max-w-[1200px] px-5 pt-5 pb-10">
        <SantriList />
      </div>
    </main>
  );
}

export default function SantriPage() {
  return (
    <RequireAuth>
      <SantriContent />
    </RequireAuth>
  );
}
