'use client';

/* Tujuan tautan pemulihan dari email.

   Supabase menaruh token di FRAGMEN url (#access_token=...&type=recovery),
   dan klien menukarnya jadi sesi saat modul dimuat karena
   detectSessionInUrl: true (lib/supabase.ts). Jadi halaman ini tidak perlu
   membaca token sendiri — cukup menunggu sesi muncul lewat AuthProvider.

   Tautan kedaluwarsa TIDAK memberi sesi; Supabase malah menaruh
   #error=...&error_description=... di fragmen yang sama. Itu dibaca di sini
   supaya orangnya tahu tautannya basi, bukan sekadar melihat layar kosong. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';

export default function ResetPasswordPage() {
  const { session, loading, gantiPassword } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [ulangi, setUlangi] = useState('');
  const [lihatSandi, setLihatSandi] = useState(false);
  const [errorTautan, setErrorTautan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selesai, setSelesai] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fragmen = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (fragmen.get('error')) {
      setErrorTautan(
        fragmen.get('error_code') === 'otp_expired'
          ? 'Tautan ini sudah kedaluwarsa atau pernah dipakai. Minta tautan baru.'
          : (fragmen.get('error_description') ?? 'Tautan pemulihan tidak berlaku.')
      );
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }
    if (password !== ulangi) {
      setError('Dua kolom password tidak sama');
      return;
    }

    setSubmitting(true);
    try {
      const { error: errGanti } = await gantiPassword(password);
      if (errGanti) {
        setError(errGanti);
        return;
      }
      setSelesai(true);
      setTimeout(() => router.push('/dashboard'), 1800);
    } catch {
      setError('Gagal terhubung ke server — periksa koneksi Anda');
    } finally {
      setSubmitting(false);
    }
  }

  const kelasInput =
    'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-3 text-[14px] ' +
    'text-text placeholder:text-text-faint focus:border-brass ' +
    'focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[400px] rounded-[var(--radius-lg)] bg-panel px-9 py-10 shadow-[var(--shadow-card)]">
        <div className="mb-9 flex flex-col items-center gap-2.5 text-center">
          <Image src="/ruang-ngaji-logo.png" alt="Ruang Ngaji" width={44} height={40} priority />
          <div className="text-[26px] font-bold text-brand-green">Password Baru</div>
        </div>

        {errorTautan ? (
          <>
            <p className="rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
              {errorTautan}
            </p>
            <Link
              href="/auth/lupa-password"
              className="mt-6 block w-full cursor-pointer rounded-[var(--radius-button)] bg-brass px-4 py-[13px] text-center text-[14px] font-semibold text-white"
            >
              Minta Tautan Baru
            </Link>
          </>
        ) : loading ? (
          <p className="text-center text-[13px] text-text-dim">Memeriksa tautan...</p>
        ) : !session ? (
          <>
            <p className="rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
              Tautan pemulihan tidak terbaca. Buka halaman ini lewat tautan di email Anda, atau
              minta tautan baru.
            </p>
            <Link
              href="/auth/lupa-password"
              className="mt-6 block w-full cursor-pointer rounded-[var(--radius-button)] bg-brass px-4 py-[13px] text-center text-[14px] font-semibold text-white"
            >
              Minta Tautan Baru
            </Link>
          </>
        ) : selesai ? (
          <p className="rounded-[var(--radius)] bg-[#ECFDF5] px-3.5 py-3 text-[13px] text-[#047857]">
            Password berhasil diganti. Mengalihkan ke dashboard...
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="mb-2 block text-[12px] font-medium text-text-dim" htmlFor="pw">
                Password Baru
              </label>
              <div className="relative">
                <input
                  id="pw"
                  type={lihatSandi ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className={kelasInput + ' pr-11'}
                />
                <button
                  type="button"
                  onClick={() => setLihatSandi((v) => !v)}
                  title={lihatSandi ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center border-none bg-transparent text-text-faint hover:text-text-dim"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                    <circle cx="12" cy="12" r="3" />
                    {!lihatSandi && <path d="M3 3l18 18" />}
                  </svg>
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-2 block text-[12px] font-medium text-text-dim" htmlFor="pw2">
                Ulangi Password
              </label>
              <input
                id="pw2"
                type={lihatSandi ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={ulangi}
                onChange={(e) => setUlangi(e.target.value)}
                placeholder="Ketik ulang password baru"
                className={kelasInput}
              />
            </div>

            {error && (
              <p className="mt-5 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full cursor-pointer rounded-[var(--radius-button)] border-none bg-brass px-4 py-[13px] text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Menyimpan...' : 'Simpan Password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
