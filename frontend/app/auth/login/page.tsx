'use client';

/* Layar Masuk — menyalin .login-card app lama (Style_Main.html:52-238,
   markup Markup_Screens.html:12-76) sedekat mungkin: kartu 400px, logo
   kitab + judul merek hijau 26px, tab pil Masuk/Daftar, label 12px, tombol
   pil brass (Masuk) / hijau (Daftar), cincin fokus brass.

   Perbedaan yang disengaja terhadap app lama:
   - Field Masuk berlabel "Username / Email" seperti aslinya, tapi yang
     diterima Supabase HANYA email. Kalau yang diketik bukan email, pesan
     kesalahannya menyebut itu secara langsung, bukan "password salah" —
     kegagalan paling membingungkan saat pindah dari app lama.
   - "Lupa Password?" app lama memverifikasi Kelompok+Nama+Kelas sendiri;
     di sini memakai email pemulihan Supabase (/auth/lupa-password).
   - Daftar tidak lagi meminta identitas lengkap: akun lahir dengan role
     NULL (trigger handle_new_auth_user), lalu admin yang menetapkan peran &
     kelompok. Itu sebabnya pesan suksesnya menyebut penantian itu alih-alih
     melempar orang ke dashboard kosong. */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

type Tab = 'masuk' | 'daftar';

function IkonMata({ terbuka }: { terbuka: boolean }) {
  return (
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
      {!terbuka && <path d="M3 3l18 18" />}
    </svg>
  );
}

/* .login-input + :focus — Style_Main.html:93-110 */
const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-3 text-[14px] ' +
  'text-text placeholder:text-text-faint focus:border-brass ' +
  'focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';

/* .login-btn — Style_Main.html:112-129 */
const KELAS_TOMBOL =
  'mt-6 w-full cursor-pointer rounded-[var(--radius-button)] border-none px-4 py-[13px] ' +
  'text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('masuk');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ingatSaya, setIngatSayaState] = useState(true);
  const [lihatSandi, setLihatSandi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function gantiTab(baru: Tab) {
    setTab(baru);
    setError(null);
    setSukses(null);
    setPassword('');
    setLihatSandi(false);
  }

  async function handleMasuk(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSukses(null);

    if (!email.includes('@')) {
      setError(
        'Masuk sekarang memakai alamat email, bukan username app lama. Ketik email akun Anda.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const { error: errMasuk } = await signIn(email.trim(), password, ingatSaya);
      if (errMasuk) {
        setError(
          errMasuk.toLowerCase().includes('invalid') ? 'Email atau password salah' : errMasuk
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

  async function handleDaftar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSukses(null);

    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }

    setSubmitting(true);
    try {
      const { error: errDaftar, perluKonfirmasiEmail } = await signUp(email.trim(), password);
      if (errDaftar) {
        setError(
          errDaftar.toLowerCase().includes('already registered')
            ? 'Email ini sudah terdaftar — silakan masuk atau pakai Lupa Password'
            : errDaftar
        );
        return;
      }
      setPassword('');
      setSukses(
        perluKonfirmasiEmail
          ? 'Akun dibuat. Buka email Anda dan klik tautan konfirmasi, lalu hubungi admin kelompok agar peran dan kelompok Anda ditetapkan.'
          : 'Akun dibuat. Hubungi admin kelompok agar peran dan kelompok Anda ditetapkan — sebelum itu data belum bisa dibuka.'
      );
    } catch {
      setError('Gagal terhubung ke server — periksa koneksi Anda');
    } finally {
      setSubmitting(false);
    }
  }

  const tabAktif = 'bg-panel shadow-[var(--shadow-subtle)]';
  const tabPasif = 'bg-transparent text-text-faint';

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[400px] rounded-[var(--radius-lg)] bg-panel px-9 py-10 shadow-[var(--shadow-card)]">
        {/* .login-brand — Style_Main.html:62-79 */}
        <div className="mb-9 flex flex-col items-center gap-2.5 text-center">
          <Image src="/ruang-ngaji-logo.png" alt="Ruang Ngaji" width={44} height={40} priority />
          <div className="text-[26px] font-bold text-brand-green">Ruang Ngaji</div>
        </div>

        {/* .login-tabs — Style_Main.html:146-176 */}
        <div className="mb-2 flex gap-1 rounded-[var(--radius-button)] bg-panel-2 p-1">
          <button
            type="button"
            onClick={() => gantiTab('masuk')}
            className={`flex-1 cursor-pointer rounded-[var(--radius-button)] border-none p-2.5 text-[13px] font-semibold transition-colors duration-150 ${
              tab === 'masuk' ? `${tabAktif} text-brass` : tabPasif
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => gantiTab('daftar')}
            className={`flex-1 cursor-pointer rounded-[var(--radius-button)] border-none p-2.5 text-[13px] font-semibold transition-colors duration-150 ${
              tab === 'daftar' ? `${tabAktif} text-brand-green` : tabPasif
            }`}
          >
            Daftar
          </button>
        </div>

        {tab === 'masuk' ? (
          <form onSubmit={handleMasuk}>
            <div className="mt-6 mb-4">
              <label className="mb-2 block text-[12px] font-medium text-text-dim" htmlFor="email">
                Username / Email
              </label>
              <input
                id="email"
                type="text"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Username atau email"
                className={KELAS_INPUT}
              />
            </div>

            <div className="mb-4">
              <label
                className="mb-2 block text-[12px] font-medium text-text-dim"
                htmlFor="password"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={lihatSandi ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password"
                  className={KELAS_INPUT + ' pr-11'}
                />
                <button
                  type="button"
                  onClick={() => setLihatSandi((v) => !v)}
                  title={lihatSandi ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center border-none bg-transparent text-text-faint hover:text-text-dim"
                >
                  <IkonMata terbuka={lihatSandi} />
                </button>
              </div>
            </div>

            {/* Baris "Ingat saya" + "Lupa Password?" — Markup_Screens.html:41-46 */}
            <div className="-mt-1 mb-4 flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-text">
                <input
                  type="checkbox"
                  checked={ingatSaya}
                  onChange={(e) => setIngatSayaState(e.target.checked)}
                  className="h-4 w-4 accent-brass"
                />
                Ingat saya di perangkat ini
              </label>
              <Link
                href="/auth/lupa-password"
                className="text-[12.5px] whitespace-nowrap text-text-dim hover:text-brass hover:underline"
              >
                Lupa Password?
              </Link>
            </div>

            {error && (
              <p className="mt-5 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
                {error}
              </p>
            )}

            <button type="submit" disabled={submitting} className={KELAS_TOMBOL + ' bg-brass'}>
              {submitting ? 'Memproses...' : 'Masuk'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleDaftar}>
            <div className="mt-6 mb-4">
              <label
                className="mb-2 block text-[12px] font-medium text-text-dim"
                htmlFor="daftarEmail"
              >
                Email
              </label>
              <input
                id="daftarEmail"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className={KELAS_INPUT}
              />
            </div>

            <div className="mb-4">
              <label
                className="mb-2 block text-[12px] font-medium text-text-dim"
                htmlFor="daftarPassword"
              >
                Buat Password
              </label>
              <div className="relative">
                <input
                  id="daftarPassword"
                  type={lihatSandi ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className={KELAS_INPUT + ' pr-11'}
                />
                <button
                  type="button"
                  onClick={() => setLihatSandi((v) => !v)}
                  title={lihatSandi ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center border-none bg-transparent text-text-faint hover:text-text-dim"
                >
                  <IkonMata terbuka={lihatSandi} />
                </button>
              </div>
            </div>

            {error && (
              <p className="mt-5 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
                {error}
              </p>
            )}
            {sukses && (
              <p className="mt-5 rounded-[var(--radius)] bg-[#ECFDF5] px-3.5 py-3 text-[13px] text-[#047857]">
                {sukses}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className={KELAS_TOMBOL + ' bg-brand-green'}
            >
              {submitting ? 'Memproses...' : 'Daftar'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
