'use client';

/* Minta tautan pemulihan password.

   App lama memverifikasi identitas sendiri (Kelompok + Nama + Kelas) lalu
   menampilkan password baru di layar. Di sini Supabase yang mengirim tautan
   ke email pemilik akun — jauh lebih aman, tapi konsekuensinya: yang tidak
   ingat email akunnya harus lewat admin, dan itu disebutkan di layar.

   Hasilnya SELALU ditampilkan sebagai "kalau email terdaftar, tautan sudah
   dikirim" — halaman ini publik, dan membedakan "email tidak ada" dari
   "email ada" akan mengubahnya jadi alat pengecek keanggotaan. */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';

export default function LupaPasswordPage() {
  const { kirimTautanResetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [terkirim, setTerkirim] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: errKirim } = await kirimTautanResetPassword(email.trim());
      // Batas laju Supabase perlu tetap terlihat — kalau disembunyikan, orang
      // akan menekan tombolnya berkali-kali dan mengira emailnya nyasar.
      if (errKirim && errKirim.toLowerCase().includes('rate limit')) {
        setError('Terlalu sering mencoba. Tunggu sekitar satu menit, lalu ulangi.');
        return;
      }
      setTerkirim(true);
    } catch {
      setError('Gagal terhubung ke server — periksa koneksi Anda');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[400px] rounded-[var(--radius-lg)] bg-panel px-9 py-10 shadow-[var(--shadow-card)]">
        <div className="mb-9 flex flex-col items-center gap-2.5 text-center">
          <Image src="/ruang-ngaji-logo.png" alt="Ruang Ngaji" width={44} height={40} priority />
          <div className="text-[26px] font-bold text-brand-green">Lupa Password</div>
        </div>

        {terkirim ? (
          <>
            <p className="rounded-[var(--radius)] bg-[#ECFDF5] px-3.5 py-3 text-[13px] text-[#047857]">
              Kalau <strong>{email.trim()}</strong> terdaftar, tautan penggantian password sudah
              dikirim ke sana. Tautannya berlaku satu kali dan kedaluwarsa dalam satu jam.
            </p>
            <p className="mt-4 text-[12.5px] text-text-dim">
              Tidak menerima apa pun? Periksa folder spam. Kalau tetap tidak ada, kemungkinan email
              akun Anda berbeda — hubungi admin kelompok.
            </p>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="mb-5 text-[13px] text-text-dim">
              Masukkan email akun Anda. Kami kirimkan tautan untuk membuat password baru.
            </p>

            <div className="mb-4">
              <label className="mb-2 block text-[12px] font-medium text-text-dim" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email akun Anda"
                className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-3 text-[14px] text-text placeholder:text-text-faint focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
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
              {submitting ? 'Mengirim...' : 'Kirim Tautan'}
            </button>
          </form>
        )}

        <div className="mt-5 text-center">
          <Link href="/auth/login" className="text-[12.5px] text-text-dim hover:text-brass hover:underline">
            Kembali ke Masuk
          </Link>
        </div>
      </div>
    </main>
  );
}
