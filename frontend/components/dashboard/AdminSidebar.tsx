'use client';

/* Sidebar navigasi desktop utk admin_ppg/admin_desa/admin_kelompok — TIDAK
   pernah dilihat guru (dia dikunci ke GuruDashboard/GuruAbsensiView mobile,
   lihat RequireAuth.tsx). Diminta owner (20 Agt): tampilan DESKTOP admin
   minimal menyamai app lama, boleh lebih baik, dilarang norak/AI-slop —
   MOBILE (termasuk seluruh app guru) TIDAK BOLEH disentuh.

   Sebelum ini app baru SAMA SEKALI tidak punya navigasi persisten: 20-an
   halaman admin (kelas, kelola-absensi, statistik, dst.) cuma bisa dibuka
   lewat kartu di /dashboard, lalu balik lagi lewat tombol back browser —
   tidak ada jalan pintas pindah antar halaman. Itu regresi nyata dari app
   lama yang punya sidebar tetap (.app-sidebar, Markup_Screens.html:1032-
   1135) di kiri, konten di kanan. Komponen ini reimplementasi shell itu:

   - Lebar 240px lapang / 68px ciut (persis app lama, Style_Main.html:372-
     383), transisi width, ciut tersimpan di localStorage (app lama TIDAK
     mengingat pilihan ini antar sesi -- perbaikan kecil yang diminta
     owner: "boleh lebih baik").
   - Ikon 24x24 line-icon (stroke, bukan fill) SAMA gaya dgn MenuGuru.tsx
     dan seluruh app -- ikon Dashboard/Absensi/Munaqosah/Konseling/
     Kalender/Pustaka/Laporan/Statistik disalin literal dari SVG app lama
     (path sama persis) demi kontinuitas visual; ikon utk halaman yang
     tidak ada di app lama (Kelas, Jadwal, Jurnal, Kurikulum, Monitoring,
     Pengumuman, Pengurus, Siklus Generus, Pengaturan, Pendaftaran) dibuat
     baru tapi menyalin KONVENSI yang sama (viewBox 24, stroke-width 2,
     round cap/join, warna currentColor) supaya tidak ada yang terlihat
     "nempel belakangan".
   - Dikelompokkan per bagian (Utama/Kehadiran/Akademik/Santri & Guru/
     Organisasi) dgn label kecil -- app lama satu daftar rata 12 item
     tanpa pengelompokan; ini PENINGKATAN sengaja (diminta owner: "boleh
     lebih baik", standar sidebar modern selalu dikelompokkan begini utk
     nav sepanjang ini), bukan copy 1:1.
   - "Persetujuan Akun" (/pendaftaran) hanya utk 3 peran admin, sama
     seperti app/pendaftaran/page.tsx (PERAN_ADMIN).
   - Item "User Management" app lama SENGAJA TIDAK ada di sini -- belum
     ada halaman setara di app baru (di luar cakupan tugas ini, bukan
     terlewat).
   - "Data Santri"/"Data Guru" (20 Agt, PUTARAN KEDUA): diminta owner
     ditambahkan sesudahnya -- sebelumnya SENGAJA tidak ada karena bukan
     halaman sendiri (cuma komponen SantriList/GuruList yang nempel di
     /dashboard). Sekarang app/santri & app/guru (baru) jadi tujuannya,
     dan komponen itu dipindah keluar dari /dashboard supaya tidak
     dobel. Kartu-kartu navigasi lain di /dashboard yang cuma duplikat
     link sidebar (Input Absensi, Daftar Kelas, dst. -- 16 kartu) & kartu
     KartuPendaftaran.tsx juga DIHAPUS bersamaan (diminta owner: "sudah
     ada di sidebar, hilangkan saja biar rapi") -- lihat app/dashboard/
     page.tsx, komponen KartuPendaftaran.tsx ikut dihapus krn jadi tidak
     dipakai di mana pun.
   - Pohon Desa›Kelompok app lama (utk pindah KONTEKS antar kelompok)
     SENGAJA TIDAK dibawa -- itu keputusan desain lama yang sudah
     didokumentasikan di PohonWilayah.tsx: app baru tidak punya state
     konteks-kelompok global lintas halaman, tiap halaman punya pemilih
     kelompoknya sendiri; menirunya di sini berarti menambah state global
     yang harus dijaga konsisten di 20+ halaman demi 1 jalan pintas. */

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

type ItemNav = {
  href: string;
  label: string;
  svg: React.ReactNode;
};

type Bagian = {
  label: string;
  item: ItemNav[];
};

const PERAN_ADMIN = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

const LABEL_PERAN: Record<string, string> = {
  admin_ppg: 'Admin Aplikasi',
  admin_desa: 'Admin Desa',
  admin_kelompok: 'Admin Kelompok',
  guru: 'Guru',
};

// Ikon disalin literal dari Markup_Screens.html:1048-1109 (path SVG sama
// persis) supaya sidebar baru terasa sambungan app lama, bukan asing.
const BAGIAN: Bagian[] = [
  {
    label: 'Utama',
    item: [
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
    ],
  },
  {
    // Diminta owner (20 Agt): "Data Santri"/"Data Guru" belum punya tujuan
    // -- app/santri, app/guru (baru) memindahkan SantriList/GuruList dari
    // /dashboard (dulu berbagi baris setengah lebar) ke halaman sendiri.
    // Ikon topi wisuda & dua-orang disalin literal dari legacy
    // Markup_Screens.html:1054/1060 (Data Santri/Data Guru) -- sebelumnya
    // path ini kepakai duluan di "Daftar Kelas"/"Pengurus Kelompok", sudah
    // diganti (lihat bawah) supaya tidak ada 2 item beda pakai ikon sama.
    label: 'Data Master',
    item: [
      {
        href: '/santri',
        // Diminta owner: "Data Santri" -> "Data Generus" (href /santri &
        // ikon TIDAK berubah, cuma labelnya).
        label: 'Data Generus',
        svg: (
          <>
            <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
            <path d="M22 10v6" />
            <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
          </>
        ),
      },
      {
        href: '/guru',
        label: 'Data Guru',
        svg: (
          <>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        ),
      },
      {
        // Diminta owner (20 Agt, putaran ketiga): dipindah dari "Organisasi"
        // ke sini + nama diganti dari "Pengurus Kelompok" -- daftar
        // dapukan/pemegangnya dilihat sebagai data master (spt Data Santri/
        // Data Guru), bukan aktivitas organisasi berjalan.
        href: '/pengurus',
        label: 'Data Pengurus',
        svg: (
          <>
            <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </>
        ),
      },
    ],
  },
  {
    label: 'Kehadiran',
    item: [
      {
        href: '/absensi',
        label: 'Input Absensi',
        svg: (
          <>
            <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <path d="m9 14 2 2 4-4" />
          </>
        ),
      },
      {
        href: '/kelola-absensi',
        label: 'Kelola Absensi',
        svg: (
          <>
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </>
        ),
      },
      {
        href: '/statistik',
        label: 'Statistik',
        svg: (
          <>
            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
          </>
        ),
      },
      {
        href: '/monitoring',
        label: 'Monitoring',
        svg: (
          <>
            <path d="M3 12h4l3 8 4-16 3 8h4" />
          </>
        ),
      },
    ],
  },
  {
    label: 'Akademik',
    item: [
      {
        href: '/kelas',
        label: 'Daftar Kelas',
        svg: (
          <>
            <path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1a2 2 0 0 1 2.485 1.94Z" />
            <path d="M13 4h3a2 2 0 0 1 2 2v14" />
            <path d="M13 20h6" />
            <path d="M10 12v.01" />
          </>
        ),
      },
      {
        href: '/jadwal',
        label: 'Jadwal KBM',
        svg: (
          <>
            <path d="M8 2v4" />
            <path d="M16 2v4" />
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M3 10h18" />
            <path d="M12 14v4" />
            <path d="M10 16h4" />
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
        href: '/jurnal',
        label: 'Jurnal KBM',
        svg: (
          <>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="m9 10 2 2 4-4" />
          </>
        ),
      },
      {
        href: '/kalender',
        label: 'Kalender Akademik',
        svg: (
          <>
            <path d="M8 2v4" />
            <path d="M16 2v4" />
            <rect width="18" height="18" x="3" y="4" rx="2" />
            <path d="M3 10h18" />
            <path d="M8 14h.01" />
            <path d="M12 14h.01" />
            <path d="M16 14h.01" />
            <path d="M8 18h.01" />
            <path d="M12 18h.01" />
            <path d="M16 18h.01" />
          </>
        ),
      },
    ],
  },
  {
    label: 'Santri & Guru',
    item: [
      {
        href: '/munaqosah',
        label: 'Munaqosah',
        svg: (
          <>
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
          </>
        ),
      },
      {
        href: '/konseling',
        label: 'Bimbingan Konseling',
        svg: (
          <>
            <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" />
            <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />
          </>
        ),
      },
      {
        href: '/siklus-generus',
        label: 'Siklus Generus',
        svg: (
          <>
            <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
            <path d="M16 7h6v6" />
          </>
        ),
      },
    ],
  },
  {
    label: 'Organisasi',
    item: [
      {
        href: '/pengumuman',
        label: 'Pengumuman',
        svg: (
          <>
            <path d="m3 11 18-5v12L3 14v-3z" />
            <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
          </>
        ),
      },
      {
        href: '/pustaka',
        label: 'Pusat Unduhan',
        svg: (
          <>
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            <path d="M12 10v6" />
            <path d="m15 13-3 3-3-3" />
          </>
        ),
      },
      {
        href: '/reports',
        label: 'Laporan & Export',
        svg: (
          <>
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </>
        ),
      },
    ],
  },
];

const ITEM_PENDAFTARAN: ItemNav = {
  href: '/pendaftaran',
  label: 'Persetujuan Akun',
  svg: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m16 11 2 2 4-4" />
    </>
  ),
};

const ITEM_PENGATURAN: ItemNav = {
  href: '/pengaturan',
  label: 'Pengaturan',
  svg: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

const KUNCI_CIUT = 'ppg_sidebar_ciut';

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, namaKelompok, signOut } = useAuth();

  const [ciut, setCiut] = useState(false);
  const [siap, setSiap] = useState(false);
  const hoverRef = useRef<HTMLDivElement>(null);

  // Ciut/lebar diingat lintas sesi (localStorage) — app lama tidak
  // mengingat ini, perbaikan kecil sesuai "boleh lebih baik".
  useEffect(() => {
    const tersimpan = window.localStorage.getItem(KUNCI_CIUT);
    if (tersimpan === '1') setCiut(true);
    setSiap(true);
  }, []);

  function toggleCiut() {
    setCiut((v) => {
      const baru = !v;
      window.localStorage.setItem(KUNCI_CIUT, baru ? '1' : '0');
      return baru;
    });
  }

  async function keluar() {
    await signOut();
    router.push('/auth/login');
  }

  const boleh = profile?.role ? PERAN_ADMIN.includes(profile.role) : false;
  const labelPeran = profile?.role ? (LABEL_PERAN[profile.role] ?? profile.role) : null;

  function tautan(item: ItemNav) {
    const aktif = pathname === item.href || pathname?.startsWith(item.href + '/');
    return (
      <Link
        key={item.href}
        href={item.href}
        title={ciut ? item.label : undefined}
        className={
          'flex items-center gap-3 border-l-[3px] px-5 py-2.5 text-[13px] font-medium transition-colors duration-150 ' +
          (ciut ? 'justify-center px-3' : '') +
          (aktif
            ? ' border-brass bg-[rgba(217,119,6,0.05)] font-semibold text-brass'
            : ' border-transparent text-text-dim hover:bg-panel-2 hover:text-text')
        }
      >
        <svg
          viewBox="0 0 24 24"
          width="19"
          height="19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
          style={{ opacity: aktif ? 1 : 0.9 }}
        >
          {item.svg}
        </svg>
        {!ciut && <span className="truncate">{item.label}</span>}
      </Link>
    );
  }

  return (
    <aside
      ref={hoverRef}
      className={
        'sticky top-0 hidden h-screen shrink-0 flex-col overflow-y-auto border-r border-border bg-panel md:flex' +
        (siap ? ' transition-[width] duration-200' : '')
      }
      style={{ width: ciut ? 68 : 240 }}
    >
      {/* Logo — Style_Main.html:453-471. Saat ciut, kontainer dipusatkan
          (bukan rata kiri dgn px-5 spt versi lapang) dan ikon diperbesar
          sedikit (28px, dari 22px) -- diminta owner: presisi dgn ukuran
          ikon menu di bawahnya (19px stroke-icon terasa "ramai" garisnya,
          jadi logo raster perlu sedikit lebih besar drpd ikon garis biar
          bobot visualnya setara, bukan English 1:1 px). */}
      <div
        className={
          'sticky top-0 z-[5] flex h-[var(--topbar-height)] shrink-0 items-center gap-2 border-b border-border bg-panel' +
          (ciut ? ' justify-center px-2' : ' justify-between px-5')
        }
      >
        <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
          <Image
            src="/logo-ruang-ngaji.png"
            alt="Ruang Ngaji"
            width={ciut ? 28 : 22}
            height={ciut ? 26 : 20}
            className="block shrink-0"
          />
          {!ciut && (
            <span className="truncate text-[15px] font-bold whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          )}
        </div>
        {!ciut && (
          <button
            type="button"
            onClick={toggleCiut}
            aria-label="Ciutkan menu"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] border-none bg-transparent text-text-dim hover:bg-panel-2 hover:text-text"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {ciut && (
          <button
            type="button"
            onClick={toggleCiut}
            aria-label="Lebarkan menu"
            title="Lebarkan menu"
            className="absolute inset-0 cursor-pointer border-none bg-transparent"
          />
        )}
      </div>

      {/* Menu berkelompok — dgn label bagian, PENINGKATAN sengaja dari app
          lama (lihat komentar atas berkas). */}
      <nav className="flex-1 py-3">
        {BAGIAN.map((bag) => (
          <div key={bag.label} className="mb-1">
            {!ciut && (
              <div className="px-5 pt-3 pb-1.5 text-[10.5px] font-bold tracking-[0.06em] text-text-faint uppercase">
                {bag.label}
              </div>
            )}
            {bag.item.map(tautan)}
          </div>
        ))}

        {boleh && (
          <div className="mb-1">
            {!ciut && (
              <div className="px-5 pt-3 pb-1.5 text-[10.5px] font-bold tracking-[0.06em] text-text-faint uppercase">
                Akun
              </div>
            )}
            {tautan(ITEM_PENDAFTARAN)}
          </div>
        )}

        <div className="mb-1">
          {!ciut && (
            <div className="px-5 pt-3 pb-1.5 text-[10.5px] font-bold tracking-[0.06em] text-text-faint uppercase">
              Lainnya
            </div>
          )}
          {tautan(ITEM_PENGATURAN)}
        </div>
      </nav>

      {/* Footer: identitas peran + logout — Style_Main.html:668-694 */}
      <div className="sticky bottom-0 z-[5] shrink-0 border-t border-border bg-panel">
        {!ciut && (labelPeran || namaKelompok) && (
          <div className="px-5 pt-3 pb-1">
            {labelPeran && (
              <div className="truncate text-[12px] font-semibold text-text">{labelPeran}</div>
            )}
            {namaKelompok && (
              <div className="truncate text-[11px] text-text-faint">{namaKelompok}</div>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={keluar}
          title={ciut ? 'Keluar' : undefined}
          className={
            'flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-5 py-2.5 text-left text-[13px] font-medium text-text-dim hover:bg-[rgba(220,38,38,0.05)] hover:text-red' +
            (ciut ? ' justify-center px-3' : '')
          }
        >
          <svg
            viewBox="0 0 24 24"
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {!ciut && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  );
}
