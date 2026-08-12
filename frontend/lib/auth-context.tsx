'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  display_name: string | null;
  role: string | null;
  scope_ppg_id: number | null;
  scope_desa_id: number | null;
  scope_kelompok_id: number | null;
  is_active: boolean;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
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
        .select('id, display_name, role, scope_ppg_id, scope_desa_id, scope_kelompok_id, is_active')
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

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, profileError, loading, signIn, signOut }}
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
