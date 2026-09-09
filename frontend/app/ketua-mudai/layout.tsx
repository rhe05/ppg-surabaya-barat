import RequireAuth from '@/components/RequireAuth';

export default function KetuaMudaiLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
