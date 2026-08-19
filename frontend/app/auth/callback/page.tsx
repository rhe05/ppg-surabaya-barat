'use client';

/* Pendaratan setelah kembali dari Google.

   Penukaran kode -> sesi TIDAK dikerjakan halaman ini: klien Supabase
   (lib/supabase.ts) dibuat dengan detectSessionInUrl: true, jadi ia sendiri
   yang membaca ?code= di URL dan menukarnya. Halaman ini cuma menunggu sesi
   itu muncul lewat onAuthStateChange, lalu melempar ke /dashboard.

   Kalau Google mengembalikan penolakan (mis. orangnya membatalkan, atau
   provider Google belum dinyalakan di project Supabase), pesannya datang
   sebagai ?error_description= atau #error_description= — ditampilkan apa
   adanya supaya kegagalan konfigurasi tidak menyamar jadi layar memuat abadi. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dariQuery = new URLSearchParams(window.location.search);
    const dariFragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const pesan =
      dariQuery.get('error_description') ??
      dariQuery.get('error') ??
      dariFragment.get('error_description') ??
      dariFragment.get('error');
    if (pesan) {
      setError(pesan);
      return;
    }

    let selesai = false;
    function lanjut() {
      if (selesai) return;
      selesai = true;
      router.replace('/dashboard');
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) lanjut();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) lanjut();
    });

    /* Jaring pengaman: tanpa ini, sesi yang tidak pernah terbentuk (kode
       kedaluwarsa, verifier hilang karena beda peramban) berhenti sebagai
       "Menyiapkan sesi..." selamanya. */
    const batas = setTimeout(() => {
      if (!selesai) setError('Sesi tidak terbentuk. Silakan coba masuk lagi.');
    }, 10000);

    return () => {
      clearTimeout(batas);
      listener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[400px] rounded-[var(--radius-lg)] bg-panel px-9 py-10 text-center shadow-[var(--shadow-card)]">
        {error ? (
          <>
            <p className="rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
              {error}
            </p>
            <Link
              href="/auth/login"
              className="mt-5 inline-block text-[13px] font-semibold text-brass hover:underline"
            >
              Kembali ke layar Masuk
            </Link>
          </>
        ) : (
          <p className="text-[14px] text-text-dim">Menyiapkan sesi...</p>
        )}
      </div>
    </main>
  );
}
