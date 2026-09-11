'use client';

/* Halaman publik "Pengunjung" (fitur demo aplikasi via link, 2026-09-11).
   TANPA RequireAuth (pola sama /kebijakan-privasi) -- siapa pun boleh
   membuka SEBELUM login, itu justru tujuannya. Alur:
   1. Cek token via RPC publik cek_akses_pengunjung (anon boleh eksekusi).
   2. Kalau valid: tombol "Masuk dengan Google" -- token dititip di
      localStorage dulu (redirectTo Google cuma satu utk semua alur,
      tidak bisa bawa param sendiri), lalu signInWithGoogle() biasa.
      /auth/callback yang mengklaim token itu via RPC
      klaim_akses_pengunjung setelah sesi terbentuk.
   3. Kalau tidak valid/kadaluwarsa: pesan + arahan hubungi admin PPG. */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { ShieldCheck, Clock, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type Status = 'memuat' | 'valid' | 'invalid';

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function PengunjungTokenPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { signInWithGoogle } = useAuth();

  const [status, setStatus] = useState<Status>('memuat');
  const [berlakuSampai, setBerlakuSampai] = useState<string | null>(null);
  const [masuk, setMasuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    (async () => {
      const { data, error: err } = await supabase.rpc('cek_akses_pengunjung', {
        p_token: token,
      });
      if (batal) return;
      const baris = Array.isArray(data) ? data[0] : data;
      if (err || !baris?.valid) {
        setStatus('invalid');
        return;
      }
      setBerlakuSampai(baris.berlaku_sampai ?? null);
      setStatus('valid');
    })();
    return () => {
      batal = true;
    };
  }, [token]);

  async function masukDenganGoogle() {
    setMasuk(true);
    setError(null);
    window.localStorage.setItem('pengunjung_token', token);
    const { error: err } = await signInWithGoogle();
    if (err) {
      window.localStorage.removeItem('pengunjung_token');
      setError(err);
      setMasuk(false);
    }
    /* Sukses: browser dialihkan Google, komponen ini tidak lagi relevan. */
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[420px] rounded-[var(--radius-lg)] border border-border bg-panel px-7 py-9 text-center shadow-[var(--shadow-card)]">
        <Image
          src="/logo-ruang-ngaji.png"
          alt="Ruang Ngaji"
          width={40}
          height={36}
          className="mx-auto"
        />
        <h1 className="mt-4 text-[18px] font-extrabold text-text">Demo Aplikasi Ruang Ngaji</h1>

        {status === 'memuat' && (
          <p className="mt-3 text-[13px] text-text-dim">Memeriksa link&hellip;</p>
        )}

        {status === 'invalid' && (
          <>
            <div className="mt-4 flex items-center justify-center gap-2 rounded-card border border-red-lembut bg-red-lembut px-3.5 py-3">
              <AlertCircle size={16} className="shrink-0 text-red" />
              <span className="text-[12.5px] font-semibold text-red">
                Link tidak valid atau sudah kadaluwarsa.
              </span>
            </div>
            <p className="mt-3 text-[12.5px] text-text-dim">
              Hubungi admin PPG untuk mendapatkan link demo yang baru.
            </p>
          </>
        )}

        {status === 'valid' && (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-text-dim">
              Anda akan melihat aplikasi ini dengan <b className="text-text">data contoh</b> —
              bukan data jamaah/santri sungguhan. Cukup masuk dengan akun Google Anda, tanpa
              perlu daftar.
            </p>

            {berlakuSampai && (
              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-text-faint">
                <Clock size={12} />
                Link berlaku sampai {formatTanggal(berlakuSampai)}
              </div>
            )}

            {error && <p className="mt-3 text-[12.5px] font-semibold text-red">{error}</p>}

            <button
              type="button"
              onClick={masukDenganGoogle}
              disabled={masuk}
              className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-[var(--radius-button)] border border-border bg-panel px-4 py-3 text-[13.5px] font-bold text-text transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82Z" />
                <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.12A12 12 0 0 0 12 24Z" />
                <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.6H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.4l4-3.12Z" />
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.6l4 3.12C6.22 6.86 8.87 4.75 12 4.75Z" />
              </svg>
              {masuk ? 'Menyiapkan…' : 'Masuk dengan Google'}
            </button>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-text-faint">
              <ShieldCheck size={12} />
              Akses hanya-lihat, tidak bisa mengubah data.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
