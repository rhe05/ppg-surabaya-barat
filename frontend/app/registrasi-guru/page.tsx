'use client';

/* Halaman mobile "Registrasi" utk admin_kelompok (2026-08-24) --
   sebelumnya menu/kartu "Registrasi" di mobile admin kelp membawa ke
   /pendaftaran (antrean persetujuan akun lama), diminta owner diganti:
   tap "Registrasi" LANGSUNG ke sini, tampilan sama dgn kartu
   "Registrasi"/"Registrasi Guru" di /pengaturan desktop (Nama Lengkap +
   kelompok + tombol Daftar, daftar "Sudah Bergabung" bisa disembunyikan)
   -- guru sekelompoknya didaftarkan lewat klaim cepat yang sudah ada
   (cari_guru_untuk_klaim/klaim_akun_guru), bukan antrean persetujuan.

   Isinya numpang komponen BERSAMA (components/registrasi/RegistrasiGuru.tsx)
   yang SAMA dipakai kartu "Registrasi Guru" di /pengaturan -- TIDAK ada
   logika/RPC baru sama sekali di sini, murni pembungkus tampilan mobile
   (AdminHeader di atas -- "blok putih" yang sama dgn semua halaman admin
   lain -- + kontainer lebar HP, gaya sama dgn AdminKelpDashboard.tsx). */

import RequireAuth from '@/components/RequireAuth';
import AdminHeader from '@/components/dashboard/AdminHeader';
import RegistrasiGuru from '@/components/registrasi/RegistrasiGuru';
import { useAuth } from '@/lib/auth-context';

const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

function RegistrasiGuruContent() {
  const { profile } = useAuth();
  const bolehDaftarGuru = PERAN_TULIS.includes(profile?.role ?? '');
  const kelompokId = profile?.scope_kelompok_id ?? null;

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Registrasi" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        <div className="mb-4 text-[17px] font-extrabold text-text">Registrasi</div>
        {!bolehDaftarGuru && (
          <p className="text-[13px] text-text-dim">Anda tidak berwenang mendaftarkan guru.</p>
        )}
        {bolehDaftarGuru && !kelompokId && (
          <p className="text-[13px] text-text-dim">Akun ini belum terhubung ke kelompok mana pun.</p>
        )}
        {bolehDaftarGuru && kelompokId && <RegistrasiGuru kelompokId={kelompokId} />}
      </div>
    </main>
  );
}

export default function RegistrasiGuruPage() {
  return (
    <RequireAuth>
      <RegistrasiGuruContent />
    </RequireAuth>
  );
}
