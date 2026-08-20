'use client';

import RequireAuth from '@/components/RequireAuth';
import PelaksanaanPembelajaranView from '@/components/jurnal/PelaksanaanPembelajaranView';

export default function PelaksanaanPembelajaranPage() {
  return (
    <RequireAuth>
      <PelaksanaanPembelajaranView />
    </RequireAuth>
  );
}
