'use client';

/* Menu hamburger mobile guru — menyalin persis .ia-menu-dropdown app lama
   (Markup_Screens.html:227-269, Style_Main.html:4945-5024): overlay gelap +
   panel melayang di bawah tombol hamburger, ikon+label per baris, garis
   pemisah sebelum Keluar.

   Item yang TIDAK dibawa: Pilih Kelas (sudah jadi bagian /absensi di app
   baru, bukan layar terpisah), Kelola Quote (fitur admin, disembunyikan
   juga di app lama via display:none), User Management (khusus admin).
   RequireAuth (components/RequireAuth.tsx) sudah membatasi guru ke
   halaman-halaman ini persis — menu ini cuma pintu masuknya.

   Pengumuman (2026-08-23) — fitur baru "Pengumuman Jadwal KBM": guru
   susun+salin teks pengumuman WA dari jadwal_kbm hari itu, lihat
   components/pengumuman/PengumumanKbmComposer.tsx. */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

/* SATU daftar tetap, dalam urutan tampil persis — diminta owner secara
   eksplisit setelah urutannya kelihatan tidak konsisten: sebelumnya
   Kehadiran & Jurnal Mengajar dirender lewat 2 tombol terpisah SEBELUM
   .map() ITEM_MENU (yang Dashboard-nya ada DI DALAM array itu), jadi
   urutan sesungguhnya di kode adalah Kehadiran → Jurnal → Dashboard → ...,
   bukan Dashboard duluan. Digabung jadi satu array supaya urutannya
   langsung terbaca top-to-bottom di sini, tidak tersebar di dua tempat.

   `aksi` (buka popup chooser) dan `href` (pindah halaman langsung) SALING
   EKSKLUSIF per item — persis app lama: Kehadiran & Jurnal Mengajar buka
   popup pilihan (Input vs Riwayat / Input vs Edit), sisanya pindah
   halaman langsung. */
const ITEM_MENU: {
  label: string;
  svg: React.ReactNode;
  href?: string;
  aksi?: 'kehadiran' | 'jurnal';
}[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    svg: (
      <>
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </>
    ),
  },
  {
    href: '/santri-saya',
    label: 'Data Generus',
    svg: (
      <>
        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
        <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
      </>
    ),
  },
  {
    aksi: 'kehadiran',
    label: 'Kehadiran',
    svg: (
      <>
        <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="m9 14 2 2 4-4" />
      </>
    ),
  },
  {
    aksi: 'jurnal',
    label: 'Jurnal Mengajar',
    svg: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </>
    ),
  },
  {
    href: '/kurikulum',
    label: 'Kurikulum',
    svg: (
      <>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        <path d="M8 7h8" />
        <path d="M8 11h8" />
      </>
    ),
  },
  {
    href: '/guru-saya',
    label: 'Guru Izin',
    svg: (
      <>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 2v4" />
        <path d="M16 2v4" />
      </>
    ),
  },
  {
    href: '/guru-saya?v=akses',
    label: 'Minta Akses',
    svg: (
      <>
        <circle cx="12" cy="8" r="5" />
        <path d="M20 21a8 8 0 0 0-16 0" />
      </>
    ),
  },
  {
    href: '/pengumuman',
    label: 'Pengumuman',
    svg: (
      <>
        <path d="M10.268 21a2 2 0 0 0 3.464 0" />
        <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
      </>
    ),
  },
  {
    href: '/reports',
    label: 'Laporan',
    svg: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h6" />
      </>
    ),
  },
];

export default function MenuGuru({
  terbuka,
  onTutup,
  onKehadiran,
  onJurnal,
}: {
  terbuka: boolean;
  onTutup: () => void;
  onKehadiran: () => void;
  onJurnal: () => void;
}) {
  const router = useRouter();
  const { signOut } = useAuth();

  /* Prefetch SEMUA tujuan href begitu menu ini DIBUKA (bukan pas
     diklik) -- diperbaiki 2026-08-23, gantinya "tutup belakangan" yg
     bikin app terasa lambat (laporan owner: "dulu klik langsung
     bereaksi, sekarang ada jeda"). Duduk perkaranya: nutup popup dulu
     baru pindah halaman (pola SEMULA, sblm 2026-08-23 pagi) itu
     TERASA instan krn popup-nya sendiri yg kasih reaksi visual instan
     -- tapi kalau chunk halaman tujuan belum pernah dimuat, Dashboard
     polos di baliknya sempat kelihatan SEBELUM router selesai
     berpindah (bug yg diperbaiki 2026-08-23 pagi dgn "biarkan popup
     tetap terbuka sampai unmount"). Itu MENGHILANGKAN bug flash tapi
     jg MENGHILANGKAN reaksi instan (popup diam menunggu, terasa
     lambat utk SEMUA navigasi). Prefetch di sini menyerang akar
     masalah keduanya sekaligus: begitu chunk halaman tujuan sudah
     dimuat duluan (selagi menu masih terbuka, guru belum tentu
     langsung klik), pindah halaman jadi HAMPIR SEKETIKA begitu diklik
     -- popup boleh nutup instan lagi (reaksi cepat) TANPA sempat
     kelihatan Dashboard polos (krn halaman barunya sudah siap). */
  useEffect(() => {
    if (!terbuka) return;
    for (const item of ITEM_MENU) {
      if (item.href) router.prefetch(item.href);
    }
  }, [terbuka, router]);

  if (!terbuka) return null;

  function klikItem(item: (typeof ITEM_MENU)[number]) {
    if (item.aksi === 'kehadiran') {
      onTutup();
      onKehadiran();
    } else if (item.aksi === 'jurnal') {
      onTutup();
      onJurnal();
    } else if (item.href) {
      /* onTutup() SEBELUM router.push() -- dikembalikan (diperbaiki
         2026-08-23), lihat komentar prefetch di atas ttg kenapa. */
      onTutup();
      router.push(item.href);
    }
  }

  async function keluar() {
    onTutup();
    await signOut();
    router.push('/auth/login');
  }

  return (
    <>
      {/* .ia-menu-overlay — klik di luar panel menutup menu */}
      <div className="fixed inset-0 z-[90] bg-black/25" onClick={onTutup} />

      {/* .ia-menu-dropdown */}
      <div className="absolute top-[62px] left-[18px] z-[91] flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-lg)] bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.22)]">
        {ITEM_MENU.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => klikItem(item)}
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-sage"
            >
              {item.svg}
            </svg>
            <span>{item.label}</span>
          </button>
        ))}

        <div className="mx-1 my-1.5 h-px bg-border" />

        <button
          type="button"
          onClick={keluar}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-red active:bg-bg"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-red"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Keluar</span>
        </button>
      </div>
    </>
  );
}
