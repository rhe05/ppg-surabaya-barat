'use client';

import RequireAuth from '@/components/RequireAuth';
import RencanaPembelajaranView from '@/components/jurnal/RencanaPembelajaranView';

export default function RencanaPembelajaranPage() {
  return (
    <RequireAuth>
      <RencanaPembelajaranView />
    </RequireAuth>
  );
}
