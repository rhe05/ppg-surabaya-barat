'use client';

/* "Data Master" — hub mobile admin_kelompok (2026-08-26, diminta owner:
   satu pintu menu utama yang menaungi Data Guru, Data Generus & Data
   Kelas, dataset yang tadinya diakses lewat item menu terpisah/tidak
   ada sama sekali di HP). Halaman ini sendiri TIDAK menampilkan data
   apa pun -- cuma tiga kartu navigasi ke /guru, /santri, dan /kelas,
   yang masing-masing SUDAH bercabang ke tampilan kartu mobile miliknya
   sendiri (GuruKelpMobile.tsx / AdminSantriMobile.tsx / KelasKelpMobile
   .tsx, gaya sama persis dgn "Data Generus" milik guru di
   app/santri-saya). */

import { useRouter } from 'next/navigation';
import { CalendarDays, GraduationCap, Users } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import AdminHeader from '@/components/dashboard/AdminHeader';

const KARTU = [
  {
    href: '/guru',
    label: 'Data Guru',
    deskripsi: 'Tambah, ubah, dan lihat data guru kelompok Anda',
    ikon: GraduationCap,
    warna: 'text-brass',
    bg: 'bg-[rgba(217,119,6,0.12)]',
  },
  {
    href: '/santri',
    label: 'Data Generus',
    deskripsi: 'Tambah, ubah, dan lihat data generus kelompok Anda',
    ikon: Users,
    warna: 'text-indigo',
    bg: 'bg-[rgba(79,70,229,0.12)]',
  },
  {
    href: '/kelas',
    label: 'Data Kelas',
    deskripsi: 'Tambah/ubah kelas dan tetapkan guru pengampunya',
    ikon: CalendarDays,
    warna: 'text-sage',
    bg: 'bg-[rgba(5,150,105,0.12)]',
  },
];

function DataMasterContent() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Data Master" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        <div className="flex flex-col gap-2.5">
          {KARTU.map((k) => {
            const Ikon = k.ikon;
            return (
              <button
                key={k.href}
                type="button"
                onClick={() => router.push(k.href)}
                className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-panel p-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.05)] active:scale-[0.98]"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${k.bg} ${k.warna}`}>
                  <Ikon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-bold text-text">{k.label}</span>
                  <span className="block text-[11.5px] text-text-dim">{k.deskripsi}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default function DataMasterPage() {
  return (
    <RequireAuth>
      <DataMasterContent />
    </RequireAuth>
  );
}
