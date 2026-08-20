'use client';

import RequireAuth from '@/components/RequireAuth';
import RiwayatPembelajaranView from '@/components/jurnal/RiwayatPembelajaranView';

export default function RiwayatPembelajaranPage() {
  return (
    <RequireAuth>
      <RiwayatPembelajaranView />
    </RequireAuth>
  );
}
