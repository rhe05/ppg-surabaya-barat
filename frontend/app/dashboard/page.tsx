'use client';

import { useRouter } from 'next/navigation';
import SantriList from '@/components/SantriList';
import GuruList from '@/components/GuruList';
import AbsensiChart from '@/components/AbsensiChart';
import RequireAuth from '@/components/RequireAuth';
import GuruDashboard from '@/components/dashboard/GuruDashboard';
import RingkasanKpi from '@/components/dashboard/RingkasanKpi';
import { useAuth } from '@/lib/auth-context';

function AdminDashboard() {
  const { user, profile, profileError, signOut } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await signOut();
    router.push('/auth/login');
  }

  return (
    <main className="min-h-screen bg-bg">
      {/* .dash-header — Style_Main.html:740-752 */}
      <div className="sticky top-0 z-10 flex h-[var(--topbar-height)] shrink-0 items-center justify-between border-b border-border bg-panel px-5 shadow-[var(--shadow-subtle)]">
        <h1 className="m-0 text-[16px] font-semibold text-text">Dashboard</h1>
        {/* .btn + .btn-secondary — Style_Main.html:4410-4438 */}
        <button
          onClick={handleLogout}
          className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border"
        >
          Keluar
        </button>
      </div>

      {/* .dash-container — Style_Main.html:838-843 */}
      <div className="mx-auto w-full max-w-[1200px] px-5 py-10">
        {/* .kpi-card sebagai panel — Style_Main.html:859-866 */}
        <div className="mb-6 rounded-card border border-border bg-panel p-6 text-[13px] shadow-[var(--shadow-card)]">
          <p>
            <span className="font-semibold text-text-dim">Email:</span> {user?.email}
          </p>
          {profile && (
            <>
              <p>
                <span className="font-semibold text-text-dim">Nama:</span>{' '}
                {profile.display_name ?? '-'}
              </p>
              <p>
                <span className="font-semibold text-text-dim">Role:</span> {profile.role ?? '-'}
              </p>
              <p>
                <span className="font-semibold text-text-dim">Scope:</span>{' '}
                {profile.scope_ppg_id
                  ? `PPG ${profile.scope_ppg_id}`
                  : profile.scope_desa_id
                    ? `Desa ${profile.scope_desa_id}`
                    : profile.scope_kelompok_id
                      ? `Kelompok ${profile.scope_kelompok_id}`
                      : '-'}
              </p>
            </>
          )}
          {profileError && <p className="text-red">{profileError}</p>}
        </div>

        <div className="mb-10">
          <RingkasanKpi />
        </div>

        {/* Kartu navigasi: aksen mengikuti .kpi-card.accent-* (Style_Main.html:891-893) */}
        <div className="mb-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            onClick={() => router.push('/absensi')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Input Absensi</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Catat kehadiran santri per tanggal
            </span>
          </button>
          <button
            onClick={() => router.push('/kelas')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-sage"
          >
            <span className="block text-[16px] font-bold text-sage">Daftar Kelas</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Lihat jadwal, ruangan, dan guru pengajar
            </span>
          </button>
          <button
            onClick={() => router.push('/kelola-absensi')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Kelola Absensi</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Perbaiki catatan kehadiran yang sudah lewat
            </span>
          </button>
          <button
            onClick={() => router.push('/statistik')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-sage"
          >
            <span className="block text-[16px] font-bold text-sage">Statistik</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Tren kehadiran, peringkat, dan demografi
            </span>
          </button>
          <button
            onClick={() => router.push('/pustaka')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Pusat Unduhan</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Modul, soal, dokumen, dan pedoman
            </span>
          </button>
          <button
            onClick={() => router.push('/guru-saya')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-sage"
          >
            <span className="block text-[16px] font-bold text-sage">Guru Saya</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Ajukan izin/cuti dan minta akses kelas
            </span>
          </button>
          <button
            onClick={() => router.push('/munaqosah')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Munaqosah</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Penilaian santri per periode dan Santri Teladan
            </span>
          </button>
          <button
            onClick={() => router.push('/pengurus')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-sage"
          >
            <span className="block text-[16px] font-bold text-sage">Pengurus Kelompok</span>
            <span className="mt-2 block text-[13px] text-text-faint">Dapukan dan pemegangnya</span>
          </button>
          <button
            onClick={() => router.push('/siklus-generus')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Siklus Generus</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Kerja, kuliah, pindah, mondok, tugas
            </span>
          </button>
          <button
            onClick={() => router.push('/pengaturan')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-sage"
          >
            <span className="block text-[16px] font-bold text-sage">Pengaturan</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Kop surat laporan dan kutipan harian
            </span>
          </button>
          <button
            onClick={() => router.push('/kalender')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Kalender Akademik</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Jadwal KBM, ujian, acara, dan libur
            </span>
          </button>
          <button
            onClick={() => router.push('/konseling')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-sage"
          >
            <span className="block text-[16px] font-bold text-sage">Bimbingan Konseling</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Catatan masalah santri dan penanganannya
            </span>
          </button>
          <button
            onClick={() => router.push('/pengumuman')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Pengumuman</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Kabar dan pemberitahuan untuk kelompok
            </span>
          </button>
          <button
            onClick={() => router.push('/jurnal')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-sage"
          >
            <span className="block text-[16px] font-bold text-sage">Jurnal KBM</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Catatan materi tiap sesi per kelas
            </span>
          </button>
          <button
            onClick={() => router.push('/monitoring')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Monitoring Kehadiran</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Rata-rata per jenjang dan kelas ngaji
            </span>
          </button>
          <button
            onClick={() => router.push('/jadwal')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-sage"
          >
            <span className="block text-[16px] font-bold text-sage">Jadwal KBM</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Sesi pengajian per kategori dan hari aktifnya
            </span>
          </button>
          <button
            onClick={() => router.push('/kurikulum')}
            className="cursor-pointer rounded-card border border-border bg-panel p-6 text-left shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass"
          >
            <span className="block text-[16px] font-bold text-brass">Kurikulum</span>
            <span className="mt-2 block text-[13px] text-text-faint">
              Program Tahunan, Semester, dan Bulanan per kelas
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SantriList />
          <GuruList />
          <div className="md:col-span-2">
            <AbsensiChart />
          </div>
        </div>
      </div>
    </main>
  );
}

/* App lama memilih dashboard berdasarkan role (Script_Main.html:227-245):
   role 'guru' dikunci ke layar mobile-nya sendiri dan tidak pernah melihat
   shell admin. Percabangan di bawah meniru itu -- murni memilih markup,
   tidak mengubah cara data di-fetch. */
function DashboardContent() {
  const { profile } = useAuth();
  if (profile?.role === 'guru') return <GuruDashboard />;
  return <AdminDashboard />;
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
