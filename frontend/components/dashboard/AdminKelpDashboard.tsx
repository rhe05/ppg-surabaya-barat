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

   Susulan Tier 2 (2026-08-24):
   4. "Kalender Hari Ini" -- quick-toggle kalender_kelompok (lib/
      kalenderKelompok.ts) LANGSUNG dari HP, tanpa buka /pengaturan
      desktop -- kebutuhan aslinya "hujan deras, libur mendadak hari
      ini" itu keputusan cepat, bukan yg mau diketik lewat form desktop.
      Kelola tanggal LAIN (bukan hari ini) tetap lewat /pengaturan.
   5. "Guru Sedang Izin/Cuti" -- read-only, guru_izin TIDAK py alur
      persetujuan admin (self-declared), murni "siapa yg tidak masuk
      hari ini" spy admin tahu tanpa perlu ditanya manual.
   6. "Kehadiran 30 Hari" -- ringkas persen + tren mini, numpang RPC
      statistik_kehadiran yg sudah ada (dipakai /statistik desktop),
      TIDAK ada query/RPC baru -- "Lihat Detail" ke /statistik utk
      analisis penuh (per kelompok, top/bottom santri, demografi).

   Gaya visual meniru GuruDashboard.tsx (kartu kelas, kotak status warna)
   supaya "app kedua" ini terasa satu keluarga dgn app guru, bukan
   ditempel gaya lain. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarOff, CalendarCheck2, ClipboardCheck, Megaphone, UserCheck, UserX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import Skeleton from '@/components/ui/Skeleton';
import { muatRingkasanHariIni, muatGuruSedangIzin, tanggalHariIniLokal, type RingkasanHariIni, type GuruIzinAktif } from '@/lib/ringkasanAdminKelp';

type StatusKalenderHariIni = { id: number; jenis: 'aktif' | 'libur'; catatan: string | null } | null;
type TitikTren = { tanggal: string; persen: number | null };
type StatistikRingkas = { persen: number | null; tren: TitikTren[] };

const GAYA_TOOLTIP = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-card)',
  fontSize: 12,
  color: 'var(--text)',
};

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

  const [kalenderHariIni, setKalenderHariIni] = useState<StatusKalenderHariIni>(null);
  const [memuatKalender, setMemuatKalender] = useState(true);
  const [sibukKalender, setSibukKalender] = useState(false);

  const [guruIzin, setGuruIzin] = useState<GuruIzinAktif[]>([]);

  const [statistik, setStatistik] = useState<StatistikRingkas | null>(null);
  const [memuatStatistik, setMemuatStatistik] = useState(true);

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

  const muatKalenderHariIni = useCallback(async () => {
    if (!kelompokId) {
      setMemuatKalender(false);
      return;
    }
    setMemuatKalender(true);
    const { data } = await supabase
      .from('kalender_kelompok')
      .select('id, jenis, catatan')
      .eq('kelompok_id', kelompokId)
      .eq('tanggal', tanggalHariIniLokal())
      .maybeSingle();
    setKalenderHariIni((data as StatusKalenderHariIni) ?? null);
    setMemuatKalender(false);
  }, [kelompokId]);

  useEffect(() => {
    muatKalenderHariIni();
  }, [muatKalenderHariIni]);

  async function tandaiLiburHariIni() {
    if (!kelompokId) return;
    setSibukKalender(true);
    try {
      const { error: err } = await supabase.from('kalender_kelompok').insert({
        kelompok_id: kelompokId,
        tanggal: tanggalHariIniLokal(),
        jenis: 'libur',
        dibuat_oleh: profile?.id ?? null,
      });
      if (err) throw new Error(err.message);
      await Promise.all([muatKalenderHariIni(), muat()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menandai libur.');
    } finally {
      setSibukKalender(false);
    }
  }

  async function batalkanKalenderHariIni() {
    if (!kalenderHariIni) return;
    setSibukKalender(true);
    try {
      const { error: err } = await supabase.from('kalender_kelompok').delete().eq('id', kalenderHariIni.id);
      if (err) throw new Error(err.message);
      await Promise.all([muatKalenderHariIni(), muat()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membatalkan.');
    } finally {
      setSibukKalender(false);
    }
  }

  useEffect(() => {
    if (!kelompokId) return;
    let batal = false;
    muatGuruSedangIzin(kelompokId)
      .then((hasil) => {
        if (!batal) setGuruIzin(hasil);
      })
      .catch(() => {
        // Non-kritis -- gagal diam-diam, bagian sekunder dashboard.
      });
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  useEffect(() => {
    if (!kelompokId) {
      setMemuatStatistik(false);
      return;
    }
    let batal = false;
    setMemuatStatistik(true);
    (async () => {
      const { data } = await supabase.rpc('statistik_kehadiran', {
        p: { kelompok_id: kelompokId, hari: 30 },
      });
      if (batal) return;
      const hasil = data as { ringkas?: { persen: number | null }; tren?: TitikTren[] } | null;
      setStatistik({ persen: hasil?.ringkas?.persen ?? null, tren: hasil?.tren ?? [] });
      setMemuatStatistik(false);
    })();
    return () => {
      batal = true;
    };
  }, [kelompokId]);

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

        {!memuatKalender && (
          <div
            className={`mb-4 flex items-center gap-3 rounded-card border p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.04)] ${
              kalenderHariIni ? 'border-[#FDE68A] bg-[#FFFBEB]' : 'border-border bg-panel'
            }`}
          >
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                kalenderHariIni ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-panel-2 text-text-dim'
              }`}
            >
              {kalenderHariIni?.jenis === 'libur' ? <CalendarOff size={17} /> : <CalendarCheck2 size={17} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[12.5px] font-bold ${kalenderHariIni ? 'text-[#92400E]' : 'text-text'}`}>
                {kalenderHariIni
                  ? kalenderHariIni.jenis === 'libur'
                    ? 'Hari ini ditandai LIBUR'
                    : 'Hari ini ditandai TETAP AKTIF'
                  : 'Kalender hari ini normal'}
              </div>
              {kalenderHariIni?.catatan && (
                <div className="text-[11px] text-[#92400E]/80">{kalenderHariIni.catatan}</div>
              )}
            </div>
            {kalenderHariIni ? (
              <button
                type="button"
                disabled={sibukKalender}
                onClick={batalkanKalenderHariIni}
                className="shrink-0 cursor-pointer rounded-[var(--radius-button)] border border-[#B45309] bg-transparent px-3 py-1.5 text-[11.5px] font-bold text-[#B45309] disabled:opacity-50"
              >
                Batalkan
              </button>
            ) : (
              <button
                type="button"
                disabled={sibukKalender}
                onClick={tandaiLiburHariIni}
                className="shrink-0 cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel-2 px-3 py-1.5 text-[11.5px] font-bold text-text disabled:opacity-50"
              >
                Tandai Libur
              </button>
            )}
          </div>
        )}

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

        {guruIzin.length > 0 && (
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-text">
              <UserX size={15} className="text-text-dim" />
              Guru Sedang Izin/Cuti ({guruIzin.length})
            </div>
            <div className="flex flex-col gap-1.5">
              {guruIzin.map((g) => (
                <div key={g.guruId} className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-text">{g.guruNama}</span>
                  <span className="text-text-dim">
                    {g.jenis === 'cuti' ? 'Cuti' : 'Izin'} s.d. {g.tanggalSelesai}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!memuatStatistik && statistik && statistik.tren.length > 0 && (
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[13px] font-bold text-text">Kehadiran 30 Hari</div>
              <button
                type="button"
                onClick={() => router.push('/statistik')}
                className="cursor-pointer border-none bg-transparent text-[11.5px] font-bold text-brass"
              >
                Lihat Detail
              </button>
            </div>
            {statistik.persen !== null && (
              <div className="mb-1 text-[22px] font-extrabold text-text">{statistik.persen}%</div>
            )}
            <div className="h-[90px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={statistik.tren} margin={{ top: 4, right: 4, bottom: 0, left: -30 }}>
                  <XAxis
                    dataKey="tanggal"
                    tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
                    stroke="var(--border)"
                    tickFormatter={(t: string) => t.slice(5)}
                    minTickGap={30}
                  />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={GAYA_TOOLTIP}
                    formatter={(v) => [`${v}%`, 'Kehadiran']}
                  />
                  <Line type="monotone" dataKey="persen" stroke="var(--brass)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
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
