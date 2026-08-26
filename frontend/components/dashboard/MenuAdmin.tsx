'use client';

/* Menu hamburger utk ADMIN di layar sempit (2026-08-24, Tier 1 admin_kelp
   mobile) -- AdminSidebar.tsx (navigasi 20+ halaman) SENGAJA `hidden
   md:flex`, dan sebelum komponen ini admin di HP TIDAK PUNYA navigasi
   apa pun begitu keluar dari /dashboard (AdminHeader.tsx cuma judul+
   lonceng+identitas, tidak ada jalan balik selain tombol back browser)
   -- gap nyata yang baru ketahuan pas membangun Dashboard Kehadiran
   Kelompok mobile.

   BUKAN salinan penuh 20 item AdminSidebar -- itu proyek IA mobile
   admin yang lebih besar, di luar cakupan "Tier 1" (diminta owner
   2026-08-24: Dashboard Kehadiran, Guru Belum Isi, Persetujuan Cepat,
   Pengumuman). Menu ini cuma cukup utk 4 kebutuhan itu + jalan pulang
   ke Dashboard -- item lain (Data Generus, Kelas, dst) tetap lewat
   AdminSidebar desktop utk sekarang, disusulkan kalau memang terbukti
   dibutuhkan.

   Panel digambar lewat createPortal ke document.body dgn position:fixed
   (dihitung dari getBoundingClientRect() tombol pemicu), SAMA teknik
   dgn KebabMenu.tsx/BellPermintaanGuru.tsx -- AdminHeader.tsx `sticky
   top-0`, position:absolute relatif ke situ akan ikut ke-clip/salah
   posisi begitu halaman discroll atau headernya ternyata di dalam
   ancestor overflow-hidden di suatu halaman nanti. */

import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

function itemMenu(role: string | undefined): { label: string; href: string; svg: React.ReactNode }[] {
  return [
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
      href: '/permintaan-generus',
      label: 'Permintaan Generus',
      svg: (
        <>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </>
      ),
    },
    {
      /* Data Master (2026-08-26, diminta owner: gabung jadi satu pintu) --
         hub /data-master menaungi Data Guru (/guru) & Data Generus
         (/santri), keduanya sudah py cabang mobile sendiri (GuruKelpMobile
         .tsx / AdminSantriMobile.tsx, gaya kartu spt Data Generus guru).
         Dulu item ini langsung ke /guru saja ("Data Guru") -- diganti
         begitu Data Generus admin_kelompok jg dapat tampilan mobile. */
      href: '/data-master',
      label: 'Data Master',
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
      /* admin_kelompok: "Registrasi" langsung ke /registrasi-guru
         (klaim cepat guru sekelompoknya, diminta owner 2026-08-24) --
         admin_desa/admin_ppg tetap ke /pendaftaran (antrean persetujuan
         akun lama, itu tanggung jawab mereka, bukan admin_kelompok). */
      href: role === 'admin_kelompok' ? '/registrasi-guru' : '/pendaftaran',
      label: 'Registrasi',
      svg: (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="m16 11 2 2 4-4" />
        </>
      ),
    },
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
  ];
}

export default function MenuAdmin({
  terbuka,
  posisi,
  onTutup,
}: {
  terbuka: boolean;
  posisi: { top: number; left: number } | null;
  onTutup: () => void;
}) {
  const router = useRouter();
  const { signOut, profile } = useAuth();

  if (!terbuka || !posisi) return null;

  const daftarItem = itemMenu(profile?.role ?? undefined);

  function pergi(href: string) {
    onTutup();
    router.push(href);
  }

  async function keluar() {
    onTutup();
    await signOut();
    router.push('/auth/login');
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[590]" onClick={onTutup} />
      <div
        style={{ top: posisi.top, left: posisi.left }}
        className="fixed z-[591] flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-lg)] bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
      >
        {daftarItem.map((item) => (
          <button
            key={item.href}
            type="button"
            onClick={() => pergi(item.href)}
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
    </>,
    document.body,
  );
}
