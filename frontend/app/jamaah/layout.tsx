import RequireAuth from '@/components/RequireAuth';

/* Semua halaman /jamaah (app "Penerobos Kelp") dibungkus RequireAuth
   sekali di sini — RequireAuth sendiri yang memasang kolom 430px +
   JamaahBottomNav untuk peran 'penerobos', dan mengalihkan peran lain. */
export default function JamaahLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
