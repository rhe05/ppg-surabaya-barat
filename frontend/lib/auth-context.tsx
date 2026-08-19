'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, setIngatSaya } from '@/lib/supabase';

// PostgREST mengembalikan relasi tersemat sebagai objek atau array satu elemen,
// tergantung cara ia menyimpulkan kardinalitas. Pola yang sama sudah dipakai di
// app/kelas/page.tsx (type Tersemat).
type Tersemat<T> = T | T[] | null;

function satuDari<T>(nilai: Tersemat<T>): T | null {
  if (!nilai) return null;
  return Array.isArray(nilai) ? (nilai[0] ?? null) : nilai;
}

type Profile = {
  id: string;
  display_name: string | null;
  role: string | null;
  guru_id: number | null;
  scope_ppg_id: number | null;
  scope_desa_id: number | null;
  scope_kelompok_id: number | null;
  is_active: boolean;
  kelompok: Tersemat<{ nama: string }>;
  guru: Tersemat<{ kategori: string | null }>;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  namaKelompok: string | null;
  kategoriGuru: string | null;
  profileError: string | null;
  loading: boolean;
  signIn: (email: string, password: string, ingat?: boolean) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; perluKonfirmasiEmail: boolean }>;
  signInWithGoogle: (ingat?: boolean) => Promise<{ error: string | null }>;
  kirimTautanResetPassword: (email: string) => Promise<{ error: string | null }>;
  gantiPassword: (passwordBaru: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setSession(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.user) {
        setProfile(null);
        setProfileError(null);
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, display_name, role, guru_id, scope_ppg_id, scope_desa_id, scope_kelompok_id, is_active, kelompok:scope_kelompok_id(nama), guru:guru_id(kategori)',
        )
        .eq('id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setProfileError(error.message);
        setProfile(null);
      } else if (!data) {
        setProfileError('Profil tidak ditemukan untuk akun ini');
        setProfile(null);
      } else {
        setProfile(data);
        setProfileError(null);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function signIn(email: string, password: string, ingat = true) {
    // Ditetapkan SEBELUM login: penentu localStorage vs sessionStorage di
    // lib/supabase.ts dibaca saat token sesi ditulis, yaitu di dalam
    // signInWithPassword ini.
    setIngatSaya(ingat);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error ? error.message : null };
  }

  /* Pendaftaran mandiri. Baris `profiles` TIDAK dibuat di sini — trigger
     `handle_new_auth_user()` (migrasi 20260805080137, Section 6) sudah
     menyalin setiap baris auth.users baru ke profiles dengan role = NULL.
     Role & scope diisi admin belakangan; sampai itu terjadi akun tidak punya
     akses ke data mana pun (semua RLS menolak profil ber-role NULL).

     Kalau konfirmasi email menyala di project Supabase, signUp balik dengan
     session = null — orangnya harus klik tautan di email dulu. Dibedakan lewat
     perluKonfirmasiEmail supaya layar Masuk tidak menyuruh orang menunggu
     email yang tidak pernah dikirim, atau sebaliknya. */
  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return {
      error: error ? error.message : null,
      perluKonfirmasiEmail: !error && !data.session,
    };
  }

  /* Masuk dengan Google. Sama seperti signUp di atas, akun Google yang baru
     pertama kali masuk tetap dibuatkan baris `profiles` oleh trigger
     handle_new_auth_user() dengan role = NULL — peran & kelompoknya
     ditetapkan admin belakangan.

     signInWithOAuth mengalihkan SELURUH halaman ke Google, jadi tidak ada
     sesi yang bisa dikembalikan di sini; sesinya baru terbentuk saat orangnya
     mendarat kembali di /auth/callback. setIngatSaya dipanggil DULU karena
     alur PKCE menitipkan code verifier ke penyimpanan yang sama dengan token
     sesi (lib/supabase.ts) — kalau tidak disamakan lebih dulu, verifier dan
     token bisa mendarat di penyimpanan berbeda dan penukaran kode gagal. */
  async function signInWithGoogle(ingat = true) {
    setIngatSaya(ingat);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    return { error: error ? error.message : null };
  }

  async function kirimTautanResetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { error: error ? error.message : null };
  }

  async function gantiPassword(passwordBaru: string) {
    const { error } = await supabase.auth.updateUser({
      password: passwordBaru,
    });
    return { error: error ? error.message : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        namaKelompok: satuDari(profile?.kelompok ?? null)?.nama ?? null,
        kategoriGuru: satuDari(profile?.guru ?? null)?.kategori ?? null,
        profileError,
        loading,
        signIn,
        signUp,
        signInWithGoogle,
        kirimTautanResetPassword,
        gantiPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
