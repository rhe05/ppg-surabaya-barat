'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import AdminSidebar from '@/components/dashboard/AdminSidebar';
import GuruBottomNav from '@/components/dashboard/GuruBottomNav';
import JamaahBottomNav from '@/components/jamaah/JamaahBottomNav';
import BannerOffline from '@/components/ui/BannerOffline';
import PengunjungBar from '@/components/ui/PengunjungBar';

/* Halaman yang boleh dibuka peran `guru`, menyalin menu mobile guru app lama
   (Markup_Screens.html:229-257): Dashboard, Pilih Kelas, Jurnal, Kurikulum,
   Guru Izin + Minta Akses (keduanya di /guru-saya), Laporan. Menu Kelola
   Quote & User Management memang disembunyikan dari guru di app lama.

   RLS sudah membatasi DATA yang bisa dibaca guru, tapi tidak membatasi
   HALAMAN mana yang terbuka — tanpa daftar ini, guru yang mengetik /statistik
   atau /pendaftaran tetap masuk dan bertemu layar admin (yang isinya kosong
   atau ditolak), bukan pesan yang jelas. */
const HALAMAN_GURU = [
  '/dashboard',
  '/absensi',
  '/jurnal',
  '/kurikulum',
  '/guru-saya',
  '/reports',
  '/santri-saya',
  '/pengumuman',
  '/tabungan',
  '/peringkat',
  /* Ditambahkan 2026-09-02, dibuka lebar sore harinya: Monitoring kini
     fitur berdiri sendiri di menu utama guru (GuruBottomNav > Lainnya),
     BUKAN tautan tersembunyi dari layar lain. Tab "Pencapaian Materi"
     terbuka utk guru (terbatas kelasnya sendiri, mendarat langsung di
     tab itu); tab "Kehadiran" di halaman yang SAMA tetap admin-only --
     dibedakan di dalam app/monitoring/page.tsx sendiri, bukan lewat rute
     terpisah. */
  '/monitoring',
];

/* Peran 'penerobos' (Penerobos Kelp, migrasi 20260909150000) dikunci ke
   app jamaah pengajian. Semua rute lain -> dialihkan ke /jamaah. */
const HALAMAN_PENEROBOS = ['/jamaah'];

/* Peran 'ketua_mudai' (Ketua Muda-i, migrasi 20260909180000) — untuk
   sekarang belum punya aplikasi; diarahkan ke halaman "fitur menyusul". */
const HALAMAN_KETUA_MUDAI = ['/ketua-mudai'];

/* Peran 'pengunjung' (fitur demo via link, migrasi 20260911xxxxxx) — data
   FIKTIF di satu kelompok contoh, read-only. Boleh menjelajah KEDUA app
   mobile sekaligus (App Guru + Penerobos Kelp), gantian lewat
   PengunjungBar — bukan dikunci ke satu app spt peran lain. */
const HALAMAN_PENGUNJUNG = [...HALAMAN_GURU, ...HALAMAN_PENEROBOS];

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, profileError } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/auth/login');
      return;
    }
    /* Profil ADA tapi belum berperan = akun baru yang belum/masih menunggu
       disetujui. Tanpa pengalihan ini ia mendarat di dashboard yang semua
       datanya ditolak RLS — terbaca sebagai aplikasi rusak, bukan sebagai
       "menunggu persetujuan".

       Syaratnya sengaja `profile !== null`, bukan `!profile?.role`: selama
       profil masih dimuat nilainya null, dan mengalihkan saat itu akan
       melempar SEMUA orang ke /onboarding sekejap sebelum profilnya tiba. */
    if (!loading && session && profile !== null && !profile.role) {
      router.replace('/onboarding');
      return;
    }
    if (
      !loading &&
      profile?.role === 'guru' &&
      pathname &&
      !HALAMAN_GURU.some((h) => pathname === h || pathname.startsWith(h + '/'))
    ) {
      router.replace('/dashboard');
    }
    if (
      !loading &&
      profile?.role === 'penerobos' &&
      pathname &&
      !HALAMAN_PENEROBOS.some((h) => pathname === h || pathname.startsWith(h + '/'))
    ) {
      router.replace('/jamaah');
    }
    if (
      !loading &&
      profile?.role === 'ketua_mudai' &&
      pathname &&
      !HALAMAN_KETUA_MUDAI.some((h) => pathname === h || pathname.startsWith(h + '/'))
    ) {
      router.replace('/ketua-mudai');
    }
    if (
      !loading &&
      profile?.role === 'pengunjung' &&
      pathname &&
      !HALAMAN_PENGUNJUNG.some((h) => pathname === h || pathname.startsWith(h + '/'))
    ) {
      router.replace('/jamaah');
    }
  }, [loading, session, profile, pathname, router]);

  /* Peran 'pengunjung' — cek masa berlaku link (30 hari) SENDIRI, sekali
     per profil (diminta owner: "sudah 30 hari, akun tidak bisa dipakai,
     harus izin lagi ke admin aplikasi"). Tanpa ini, akses yang kadaluwarsa
     cuma ditahan RLS -- guru/kelas/jamaah dst balik nol tanpa penjelasan,
     terbaca sbg aplikasi rusak, bukan "izin Anda berakhir". RPC
     status_akses_pengunjung() (migrasi 20260911130000) SECURITY DEFINER
     krn pengunjung_akses sendiri RLS-nya admin_ppg-only. Re-otorisasi =
     admin_ppg buat link baru; begitu akun yg sama klaim ulang,
     klaim_akses_pengunjung menimpa pengunjung_akses_id ke token baru --
     "izin lagi ke admin" sudah otomatis lewat jalur klaim itu. */
  const [statusPengunjung, setStatusPengunjung] = useState<'memuat' | 'aktif' | 'berakhir'>('memuat');
  useEffect(() => {
    if (profile?.role !== 'pengunjung') return;
    let batal = false;
    setStatusPengunjung('memuat');
    supabase.rpc('status_akses_pengunjung').then(
      ({ data }) => {
        if (batal) return;
        const baris = Array.isArray(data) ? data[0] : data;
        setStatusPengunjung(baris?.valid ? 'aktif' : 'berakhir');
      },
      () => {
        if (!batal) setStatusPengunjung('berakhir');
      },
    );
    return () => {
      batal = true;
    };
  }, [profile?.id, profile?.role]);

  const layarMemuat = (
    /* Logo berdenyut (bukan teks "Memuat sesi..." polos) -- diminta owner
       2026-08-23, standar produk SaaS profesional. Ini titik loading yang
       PALING SERING dilihat di seluruh app (muncul di SETIAP pemuatan
       halaman, sebelum peran diketahui), tapi peran itu sendiri (guru vs
       admin, layout beda total) BELUM diketahui di sini -- jadi sengaja
       branding netral, bukan skeleton layout tertentu yang bisa salah
       tebak bentuk halamannya. */
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <Image
        src="/logo-ruang-ngaji.png"
        alt="Ruang Ngaji"
        width={40}
        height={36}
        className="animate-pulse"
      />
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
    </main>
  );

  if (loading) {
    return layarMemuat;
  }

  if (!session) {
    return null;
  }

  /* `loading` cuma menandai getSession() selesai -- `profile` (penentu
     guru/admin, sidebar-atau-tidak, kolom 430px-atau-tidak) baru dimuat
     lewat efek TERPISAH setelah `session` diketahui (auth-context.tsx),
     jadi ada jendela sesaat: session sudah ada, profile masih null.
     Tanpa penjagaan ini, jendela itu jatuh ke cabang paling bawah
     (`return <>{children}</>`) -- konten dirender TANPA sidebar admin
     MAUPUN kolom 430px, alias lebar penuh "desktop" -- baru sepersekian
     detik kemudian berpindah ke layout yang benar begitu profile.role
     tiba. Di HP (viewport sudah sempit) jendela ini nyaris tak terlihat,
     tapi di KOMPUTER lompatannya jelas kelihatan (dilaporkan owner:
     "dashboard desktop, jump/flip sekilas, lalu kembali"). Kalau
     profileError sudah ada (mis. "Profil tidak ditemukan"), profile TETAP
     null selamanya -- guard ini otomatis lepas supaya tidak nyangkut di
     loading selamanya, perilaku utk kasus error tidak berubah. */
  if (session && profile === null && !profileError) {
    return layarMemuat;
  }

  /* Sidebar navigasi desktop — HANYA utk admin_ppg/admin_desa/admin_kelompok
     (diminta owner 20 Agt: perbaiki tampilan DESKTOP admin, jangan sentuh
     mobile SAMA SEKALI). Peran mobile-only ('guru', 'penerobos',
     'ketua_mudai') TIDAK boleh masuk cabang ini — mereka punya layout &
     bottom nav sendiri di bawah. (Bug: 'penerobos'/'ketua_mudai' dulu
     ke-shadow ke cabang admin ini sehingga JamaahBottomNav tak pernah
     dirender di HP.)
     AdminSidebar sendiri `hidden md:flex` -- di bawah breakpoint md,
     wrapper flex ini transparan (sidebar tidak makan ruang), jadi tampilan
     admin di layar sempit pun tidak berubah, cuma dapat sidebar di layar
     lebar. */
  const PERAN_MOBILE = ['guru', 'penerobos', 'ketua_mudai', 'pengunjung'];
  const tampilkanSidebar = !!profile?.role && !PERAN_MOBILE.includes(profile.role);
  if (tampilkanSidebar) {
    return (
      <div className="flex min-h-screen animasi-konten-muncul">
        <AdminSidebar />
        <div className="min-w-0 flex-1">{children}</div>
        {/* Admin di HP juga punya bottom nav (AdminBottomNav lewat
            AdminHeader), jadi banner diangkat sama tingginya. */}
        <BannerOffline adaBottomNav />
      </div>
    );
  }

  /* App guru dikunci ke lebar HP (diminta owner 20 Agt): dibuka lewat
     browser desktop, seluruh markup guru (GuruDashboard dkk) TIDAK punya
     batas lebar sendiri sehingga melebar penuh ke lebar jendela desktop --
     grid statistik 5-kolom jadi lebar sekali, terasa rusak. Bukan
     tanggung jawab tiap halaman guru utk membatasi diri sendiri; satu
     bungkus di sini (gerbang tunggal yang sudah ada, sama seperti
     AdminSidebar di atas) cukup utk SEMUA halaman guru sekaligus.
     max-w-[430px] w-full: di HP sungguhan (viewport < 430px) w-full yang
     menang, bungkus ini transparan -- tampilan guru TIDAK berubah sama
     sekali di sana, cuma diam-diam di-cap di layar lebar.

     SENGAJA tidak diberi `transform` di sini utk menjadikannya containing
     block bagi descendant `position: fixed` (godaan wajar, krn tombol
     "Simpan Kehadiran" di GuruAbsensiView.tsx tetap fixed ke viewport
     LUAR kolom ini, bukan ke 430px-nya). Sudah dicoba & DIBATALKAN:
     GuruDashboard punya popup Bulan/Tahun yg posisinya dihitung dari
     getBoundingClientRect()+window.innerWidth (keduanya SELALU relatif ke
     viewport SUNGGUHAN, tidak tahu-menahu soal transform ancestor) --
     kalau kolom ini jadi containing block sementara perhitungan
     posisinya masih pakai window.innerWidth, popup itu akan melenceng ke
     kiri layar desktop. Elemen fixed yang lebar sendiri (spt tombol
     Simpan) diperbaiki LANGSUNG di komponennya (bungkus max-w-[430px]
     mx-auto DI DALAM elemen fixed itu), bukan lewat trik ancestor di
     sini. */
  /* GuruBottomNav dirender DI SINI (gerbang tunggal semua halaman guru),
     bukan di tiap chrome -- guru punya 3 topbar berbeda (GuruDashboard,
     GuruAbsensiView, JurnalHeaderChrome) dan menaruh nav di masing-masing
     berarti cepat atau lambat ada layar yang ketinggalan. Ruang bawah
     supaya konten tidak ketutup nav diatur di globals.css lewat
     `body:has([data-guru-nav]) main` -- BUKAN padding di kolom ini:
     GuruAbsensiView memakai `h-screen overflow-hidden`, dan menambah
     padding pada pembungkusnya membuat halaman jadi 100vh+60px (muncul
     scroll tipis yang tidak seharusnya ada). Lewat :has(), padding cuma
     berlaku saat navnya memang dirender -- di layar tugas yang navnya
     sengaja disembunyikan, padding itu otomatis ikut hilang. */
  if (profile?.role === 'guru') {
    return (
      <div className="min-h-screen w-full bg-border">
        <div className="animasi-konten-muncul mx-auto min-h-screen w-full max-w-[430px] bg-bg shadow-[0_0_40px_rgba(15,23,42,0.12)]">
          {children}
        </div>
        <GuruBottomNav />
        <BannerOffline adaBottomNav />
      </div>
    );
  }

  /* App "Penerobos Kelp" — sama pola kolom 430px + bottom nav seperti
     guru, tapi navnya JamaahBottomNav & temanya navy. Peran 'penerobos'
     tidak pernah masuk cabang sidebar admin di atas. */
  if (profile?.role === 'penerobos') {
    return (
      <div className="min-h-screen w-full bg-border">
        <div className="animasi-konten-muncul mx-auto min-h-screen w-full max-w-[430px] bg-bg shadow-[0_0_40px_rgba(15,23,42,0.12)]">
          {children}
        </div>
        <JamaahBottomNav />
        <BannerOffline adaBottomNav />
      </div>
    );
  }

  /* Peran 'ketua_mudai' — belum ada aplikasi; kolom 430px polos, isinya
     halaman "fitur menyusul" (app/ketua-mudai/page.tsx). */
  if (profile?.role === 'ketua_mudai') {
    return (
      <div className="min-h-screen w-full bg-border">
        <div className="animasi-konten-muncul mx-auto min-h-screen w-full max-w-[430px] bg-bg shadow-[0_0_40px_rgba(15,23,42,0.12)]">
          {children}
        </div>
        <BannerOffline />
      </div>
    );
  }

  /* Peran 'pengunjung' — demo aplikasi via link (fitur 2026-09-11). Data
     FIKTIF, read-only, satu kelompok contoh. Boleh gonta-ganti App Guru
     <-> Penerobos Kelp lewat PengunjungBar (deteksi dari pathname),
     bukan dikunci ke satu app spt peran lain — makanya dua bottom nav
     dirender bergantian, bukan satu tetap. */
  if (profile?.role === 'pengunjung') {
    if (statusPengunjung === 'memuat') {
      return layarMemuat;
    }
    if (statusPengunjung === 'berakhir') {
      return <PengunjungBerakhir />;
    }
    const modeJamaah = pathname?.startsWith('/jamaah');
    return (
      <div className="min-h-screen w-full bg-border">
        <div className="animasi-konten-muncul mx-auto min-h-screen w-full max-w-[430px] bg-bg shadow-[0_0_40px_rgba(15,23,42,0.12)]">
          <PengunjungBar aktif={modeJamaah ? 'jamaah' : 'guru'} />
          {children}
        </div>
        {modeJamaah ? <JamaahBottomNav /> : <GuruBottomNav />}
        <BannerOffline adaBottomNav />
      </div>
    );
  }

  return (
    <>
      {children}
      <BannerOffline />
    </>
  );
}

/* Layar blokir utk peran `pengunjung` yang link-nya sudah lewat 30 hari
   atau dicabut admin_ppg. TIDAK merender {children} sama sekali --
   pengunjung kadaluwarsa tak boleh menjelajah layar app apa pun, cuma
   pesan + Keluar. Re-otorisasi: minta admin_ppg buat link baru, klaim
   ulang dgn akun Google yang sama. */
function PengunjungBerakhir() {
  const router = useRouter();
  const { signOut } = useAuth();

  async function keluar() {
    await signOut();
    router.push('/auth/login');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[400px] rounded-[var(--radius-lg)] border border-border bg-panel px-7 py-9 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-lembut text-red">
          <ShieldAlert size={22} strokeWidth={2} />
        </span>
        <h1 className="mt-4 text-[17px] font-extrabold text-text">Akses Pengunjung Berakhir</h1>
        <p className="mt-2.5 text-[13px] leading-relaxed text-text-dim">
          Izin demo aplikasi Anda sudah lewat 30 hari atau dicabut. Hubungi admin PPG untuk
          mendapatkan link akses yang baru.
        </p>
        <button
          type="button"
          onClick={keluar}
          className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border border-border bg-panel px-4 py-2.5 text-[13px] font-bold text-text-dim active:scale-[0.98]"
        >
          <LogOut size={14} strokeWidth={2.2} />
          Keluar
        </button>
      </div>
    </main>
  );
}
