'use client';

/* Layar Masuk. Gayanya menyalin .login-card app lama
   (Style_Main.html:44-120) supaya guru yang pindah dari tautan lama tidak
   merasa masuk ke aplikasi yang berbeda: kartu 400px, sudut 14px, judul
   merek hijau, tombol brass, dan cincin fokus brass yang sama.

   Yang TIDAK ditiru dari layar lama, masing-masing ada alasannya:
   - Tab "Daftar": app lama punya pendaftaran mandiri untuk admin kelompok.
     Di sistem baru akun dibuat lewat dashboard Supabase oleh admin — itu
     keputusan pemilik 18 Agt 2026, dan menampilkan tab yang tidak berfungsi
     lebih buruk daripada tidak ada tab.
   - "Lupa Password?": jalur pemulihan Supabase belum disiapkan. Tautan yang
     tidak menuju ke mana-mana hanya membuat orang menunggu email yang tidak
     akan datang; ditambahkan setelah alurnya benar-benar ada.
   - "Ingat saya": Supabase sudah menyimpan sesi di peramban secara bawaan,
     jadi kotak centang itu tidak mengubah apa pun.

   Login memakai EMAIL, bukan username seperti app lama — akun Supabase
   memang berbasis email, dan menyembunyikannya di balik kata "username"
   hanya membingungkan saat orang lupa yang mana yang harus diketik. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [lihatSandi, setLihatSandi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await signIn(email, password);
      if (signInError) {
        setError(
          signInError.toLowerCase().includes('invalid')
            ? 'Email atau password salah'
            : signInError
        );
        return;
      }
      router.push('/dashboard');
    } catch {
      setError('Gagal terhubung ke server — periksa koneksi Anda');
    } finally {
      setSubmitting(false);
    }
  }

  const kelasInput =
    'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-3 text-[14px] ' +
    'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[400px] rounded-[var(--radius-lg)] bg-panel px-9 py-10 shadow-[var(--shadow-card)]"
      >
        {/* .login-brand — Style_Main.html:61-74 */}
        <div className="mb-9 text-center">
          <div className="text-[26px] font-bold text-brand-green">Ruang Ngaji</div>
          <div className="mt-1 text-[12px] text-text-dim">PPG Surabaya Barat</div>
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-[12px] font-medium text-text-dim" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Alamat email Anda"
            className={kelasInput}
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-[12px] font-medium text-text-dim" htmlFor="password">
            Password
          </label>
          {/* Tombol lihat sandi ditiru dari .login-eye-btn app lama: mengetik
              sandi di ponsel tanpa bisa memeriksanya adalah sumber kegagalan
              masuk yang paling sering. */}
          <div className="relative">
            <input
              id="password"
              type={lihatSandi ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Masukkan password"
              className={kelasInput + ' pr-11'}
            />
            <button
              type="button"
              onClick={() => setLihatSandi((v) => !v)}
              title={lihatSandi ? 'Sembunyikan password' : 'Tampilkan password'}
              className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-text-dim"
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

        {error && (
          <p className="mb-4 rounded-[var(--radius)] bg-red/10 px-3 py-2 text-[13px] text-red">
            {error}
          </p>
        )}

        {/* .login-btn — Style_Main.html:108-120 */}
        <button
          type="submit"
          disabled={submitting}
          className="mt-6 w-full cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-3 text-[14px] font-semibold text-white transition-all duration-200 disabled:opacity-50"
        >
          {submitting ? 'Memproses...' : 'Masuk'}
        </button>

        <p className="mt-5 text-center text-[11px] text-text-faint">
          Belum punya akun? Hubungi admin kelompok atau admin PPG.
        </p>
      </form>
    </main>
  );
}
