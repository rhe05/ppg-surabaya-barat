'use client';

/* Dashboard Kehadiran Kelompok -- mobile admin_kelompok (2026-08-24,
   Tier 1 dari 3 tier yang disepakati owner: fitur mobile admin_kelp).
   Dirender HANYA di viewport sempit (app/dashboard/page.tsx, via
   lib/useIsMobile.ts) -- di layar lebar admin_kelompok tetap melihat
   AdminDashboard biasa (desktop, TIDAK disentuh).

   Isinya (Tier 1, disepakati owner):
   1. KPI hari ini: berapa kelas sudah/belum diabsen + 4 kotak status
      (Hadir/Izin/Sakit/Alpa) se-kelompok -- lib/ringkasanAdminKelp.ts.
   2. "Guru Belum Isi Absen" -- daftar kelas+guru yang kelasnya belum
      py baris absensi hari ini, supaya admin bisa follow-up langsung.
   3. Kartu jalan pintas ke Persetujuan Generus/Akun & Pengumuman --
      halaman2 itu SENDIRI sudah cukup responsif (dicek: kartu vertikal,
      bukan tabel kaku), yang tadinya kurang cuma NAVIGASI menuju sana
      dari HP (ditambal via AdminHeader.tsx + MenuAdmin.tsx).

   Gaya visual meniru GuruDashboard.tsx (kartu kelas, kotak status warna)
   supaya "app kedua" ini terasa satu keluarga dgn app guru, bukan
   ditempel gaya lain. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Megaphone, UserCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import Skeleton from '@/components/ui/Skeleton';
import { muatRingkasanHariIni, type RingkasanHariIni } from '@/lib/ringkasanAdminKelp';

const STATUS: { kunci: keyof Omit<RingkasanHariIni, 'totalKelas' | 'kelasSudahDiabsen' | 'guruBelumIsi'>; label: string; warna: string }[] = [
  { kunci: 'hadir', label: 'HADIR', warna: '#059669' },
  { kunci: 'izin', label: 'IZIN', warna: '#4F46E5' },
  { kunci: 'sakit', label: 'SAKIT', warna: '#B45309' },
  { kunci: 'alpa', label: 'ALPA', warna: '#DC2626' },
];

function SkeletonKpi() {
  return (
    <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      <Skeleton className="h-[15px] w-2/5" />
      <div className="mt-3 grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[58px] w-full" />
        ))}
      </div>
    </div>
  );
}

export default function AdminKelpDashboard() {
  const { profile } = useAuth();
  const router = useRouter();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [ringkasan, setRingkasan] = useState<RingkasanHariIni | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jumlahPermintaan, setJumlahPermintaan] = useState(0);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const hasil = await muatRingkasanHariIni(kelompokId);
      setRingkasan(hasil);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat ringkasan.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  useEffect(() => {
    let batal = false;
    supabase
      .from('permintaan_generus')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => {
        if (!batal) setJumlahPermintaan(count ?? 0);
      });
    return () => {
      batal = true;
    };
  }, []);

  const totalStatus = ringkasan ? ringkasan.hadir + ringkasan.izin + ringkasan.sakit + ringkasan.alpa : 0;
  const persenKelasSelesai =
    ringkasan && ringkasan.totalKelas > 0
      ? Math.round((ringkasan.kelasSudahDiabsen / ringkasan.totalKelas) * 100)
      : 0;

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Dashboard" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        {loading && <SkeletonKpi />}

        {!loading && ringkasan && (
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[13px] font-bold text-text">Kehadiran Hari Ini</div>
              <div className="text-[11.5px] text-text-dim">
                {ringkasan.kelasSudahDiabsen} dari {ringkasan.totalKelas} kelas · {persenKelasSelesai}%
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {STATUS.map((st) => {
                const nilai = ringkasan[st.kunci];
                const persen = totalStatus > 0 ? Math.round((nilai / totalStatus) * 100) : null;
                return (
                  <div
                    key={st.kunci}
                    className="flex flex-col items-center gap-[3px] rounded-[10px] bg-panel-2 px-1 pt-2.5 pb-[9px]"
                  >
                    <span className="text-[18px] leading-none font-extrabold tabular-nums" style={{ color: st.warna }}>
                      {nilai}
                    </span>
                    {persen !== null && (
                      <span
                        className="rounded-full px-[7px] py-0.5 text-[10px] leading-none font-bold tabular-nums"
                        style={{ background: `${st.warna}1F`, color: st.warna }}
                      >
                        {persen}%
                      </span>
                    )}
                    <span className="mt-px text-center text-[10.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                      {st.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!loading && ringkasan && ringkasan.guruBelumIsi.length > 0 && (
          <div className="mb-4 rounded-card border border-[#FDE68A] bg-[#FFFBEB] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
            <div className="mb-2 text-[13px] font-bold text-[#92400E]">
              Guru Belum Isi Absen ({ringkasan.guruBelumIsi.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {ringkasan.guruBelumIsi.map((g) => (
                <div key={g.kelasId} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-[#92400E]">{g.kelasNama}</span>
                  <span className="text-[#92400E]/80">{g.guruNama}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && ringkasan && ringkasan.guruBelumIsi.length === 0 && ringkasan.totalKelas > 0 && (
          <p className="mb-4 text-[12.5px] text-sage">Semua kelas sudah diabsen hari ini. Alhamdulillah.</p>
        )}

        <div className="mb-3 text-[13px] font-bold text-text">Jalan Pintas</div>
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => router.push('/permintaan-generus')}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-panel p-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.05)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(217,119,6,0.12)] text-brass">
              <UserCheck size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-text">Persetujuan Generus</span>
              <span className="block text-[11.5px] text-text-dim">Tambah/pindah/naik kelas guru</span>
            </span>
            {jumlahPermintaan > 0 && (
              <span className="flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red px-[6px] text-[11px] font-bold text-white">
                {jumlahPermintaan > 9 ? '9+' : jumlahPermintaan}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push('/pendaftaran')}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-panel p-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.05)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(79,70,229,0.12)] text-indigo">
              <ClipboardCheck size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-text">Persetujuan Akun</span>
              <span className="block text-[11.5px] text-text-dim">Akun baru yang menunggu peran</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push('/pengumuman')}
            className="flex cursor-pointer items-center gap-3 rounded-card border border-border bg-panel p-3.5 text-left shadow-[0_2px_10px_rgba(0,0,0,0.05)] active:scale-[0.98]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(5,150,105,0.12)] text-sage">
              <Megaphone size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-bold text-text">Pengumuman</span>
              <span className="block text-[11.5px] text-text-dim">Buat & lihat pengumuman kelompok</span>
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}
