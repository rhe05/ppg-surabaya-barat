'use client';

/* Header bersama utk halaman admin (20 Agt, putaran ketujuh) — dulu
   app/dashboard/page.tsx dan app/santri/page.tsx masing-masing menulis
   blok .dash-header sendiri (markup identik, disalin-tempel). Sekarang satu
   komponen: judul di kiri (boleh string statis spt "Dashboard" atau node
   dinamis spt "Data Generus - <cakupan>"), identitas peran (label peran +
   nama kelompok kalau ada) otomatis di kanan -- sebelumnya identitas ini
   cuma ditambahkan manual di /santri (lihat riwayat: dulu di footer
   AdminSidebar, lalu dipindah ke sana secara ad-hoc). Halaman admin lain
   yang belum pakai header ini (Guru, Kelas, dst.) tinggal pasang komponen
   ini kalau owner minta konsistensi lebih lanjut -- TIDAK diubah sekarang,
   di luar cakupan permintaan ini. */

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { LABEL_PERAN } from '@/lib/roles';

export default function AdminHeader({ judul }: { judul: ReactNode }) {
  const { profile, namaKelompok } = useAuth();
  const labelPeran = profile?.role ? (LABEL_PERAN[profile.role] ?? profile.role) : null;

  return (
    // .dash-header — Style_Main.html:740-752
    <div className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center justify-between border-b border-border bg-panel px-5 shadow-[var(--shadow-subtle)]">
      <h1 className="m-0 text-[16px] font-semibold text-text">{judul}</h1>
      {labelPeran && (
        <div className="text-right leading-tight">
          <div className="text-[12px] font-semibold text-text">{labelPeran}</div>
          {namaKelompok && <div className="text-[11px] text-text-faint">{namaKelompok}</div>}
        </div>
      )}
    </div>
  );
}
