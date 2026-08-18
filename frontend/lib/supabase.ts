import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

/* "Ingat saya di perangkat ini" (layar Masuk app lama).
   Supabase menyimpan sesi di localStorage secara bawaan — artinya SELALU
   diingat, kotak centangnya tidak akan mengubah apa pun. Supaya kotak itu
   benar-benar berarti, sesi diarahkan ke penyimpanan yang berbeda:

     dicentang    -> localStorage  (bertahan setelah peramban ditutup)
     tidak        -> sessionStorage (hilang begitu tab ditutup)

   Nilainya ditulis SEBELUM signInWithPassword dipanggil, supaya token hasil
   login mendarat di penyimpanan yang benar. setItem juga menghapus kunci yang
   sama dari penyimpanan lawannya — tanpa itu, token lama di localStorage akan
   tertinggal dan orang yang sengaja TIDAK mencentang tetap ikut teringat. */
const KUNCI_INGAT = 'rn.ingat-saya';

function ingatDiPerangkatIni(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(KUNCI_INGAT) !== '0';
}

export function setIngatSaya(ingat: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KUNCI_INGAT, ingat ? '1' : '0');
}

const penyimpananSesi = {
  getItem(kunci: string) {
    if (typeof window === 'undefined') return null;
    const gudang = ingatDiPerangkatIni() ? window.localStorage : window.sessionStorage;
    return gudang.getItem(kunci);
  },
  setItem(kunci: string, nilai: string) {
    if (typeof window === 'undefined') return;
    if (ingatDiPerangkatIni()) {
      window.localStorage.setItem(kunci, nilai);
      window.sessionStorage.removeItem(kunci);
    } else {
      window.sessionStorage.setItem(kunci, nilai);
      window.localStorage.removeItem(kunci);
    }
  },
  removeItem(kunci: string) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(kunci);
    window.sessionStorage.removeItem(kunci);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: penyimpananSesi,
    persistSession: true,
    autoRefreshToken: true,
    /* Wajib true: tautan "Lupa Password?" dari email mendarat di
       /auth/reset-password dengan token di fragmen URL, dan hanya opsi ini
       yang menukarnya jadi sesi pemulihan. */
    detectSessionInUrl: true,
  },
});
