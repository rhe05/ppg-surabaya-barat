'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type Tersemat = { nama: string } | { nama: string }[] | null;

type Kelas = {
  id: number;
  nama: string;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  santri_count: number;
  kategori_kbm: Tersemat;
};

// Style_Main.html:695-700 (IA_GURU_KATEGORI_SINGKATAN_)
const SINGKATAN_KATEGORI: Record<string, string> = {
  'Muballigh Tugasan': 'MT',
  'Muballigh Setempat': 'MS',
  'Guru Mutu': 'GM',
  'Guru Bantu': 'GB',
};

const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function namaDari(nilai: Tersemat) {
  if (!nilai) return null;
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? null;
}

function jam(nilai: string | null) {
  if (!nilai) return null;
  return nilai.slice(0, 5);
}

// Style_Main.html renderer: jamMulai–jamSelesai · Durasi N Menit
function durasiMenit(mulai: string | null, selesai: string | null) {
  const a = jam(mulai);
  const b = jam(selesai);
  if (!a || !b) return null;
  const [ha, ma] = a.split(':').map(Number);
  const [hb, mb] = b.split(':').map(Number);
  if ([ha, ma, hb, mb].some((n) => Number.isNaN(n))) return null;
  const selisih = hb * 60 + mb - (ha * 60 + ma);
  return selisih > 0 ? selisih : null;
}

export default function GuruDashboard() {
  const { profile, namaKelompok, kategoriGuru } = useAuth();
  const [kelas, setKelas] = useState<Kelas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const guruId = profile?.guru_id ?? null;

  const load = useCallback(async () => {
    if (guruId == null) {
      setKelas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('kelas')
        .select('id, nama, jam_mulai, jam_selesai, ruangan, santri_count, kategori_kbm(nama)')
        .eq('guru_id', guruId)
        .is('deleted_at', null)
        .order('jam_mulai');
      if (queryError) throw new Error(queryError.message);
      setKelas(data ?? []);
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  }, [guruId]);

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) load();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const sekarang = new Date();
  const labelTanggal = `${NAMA_HARI[sekarang.getDay()]}, ${sekarang.getDate()} ${
    NAMA_BULAN[sekarang.getMonth()]
  } ${sekarang.getFullYear()}`;
  const labelBulan = `${NAMA_BULAN[sekarang.getMonth()]} - ${sekarang.getFullYear()}`;

  const singkatan = kategoriGuru ? (SINGKATAN_KATEGORI[kategoriGuru] ?? kategoriGuru) : null;
  const barisRole = singkatan ? `Guru Generus - ${singkatan}` : null;

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      {/* .ia-header — Style_Main.html:4859-4865 */}
      <div className="shrink-0 overflow-hidden rounded-b-3xl bg-panel shadow-[0_6px_20px_rgba(5,150,105,0.22)]">
        {/* .ia-topbar — :4867-4901 */}
        <div className="flex items-center gap-2.5 bg-panel px-[18px] pt-3.5 pb-3">
          {/* .ia-hamburger-btn — :4945-4958. Belum ada sidebar padanannya di Next.js. */}
          <button
            type="button"
            aria-label="Menu Utama"
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>

          {/* .ia-app-brand — :4875-4895 */}
          <div className="flex min-w-0 flex-1 items-center justify-start gap-[7px]">
            <Image
              src="/logo-ruang-ngaji.png"
              alt="Ruang Ngaji"
              width={20}
              height={18}
              className="block shrink-0"
            />
            <span className="text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          </div>

          {/* .ia-icon-btn — :5046-5064 */}
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Permintaan Masuk"
              className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </div>
        </div>

        {/* .ia-header-hero — :4903-4910 */}
        <div className="flex items-start justify-between gap-2.5 bg-[linear-gradient(135deg,#059669_0%,#6B9975_100%)] px-[18px] pt-4 pb-5">
          {/* .ia-greeting — :5026-5044 */}
          <div className="min-w-0 flex-1">
            <div className="text-[20px] leading-[1.2] font-bold text-white">
              {profile?.display_name ?? '-'}
            </div>
            {barisRole && (
              <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
                {barisRole}
              </div>
            )}
            {namaKelompok && (
              <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
                {namaKelompok}
              </div>
            )}
          </div>

          {/* .ia-header-hero-right — :4912-4918 */}
          <div className="flex shrink-0 flex-col items-end gap-[7px]">
            {/* .ia-icon-btn-hero — :5066-5073 */}
            <button
              type="button"
              aria-label="Pilih tanggal"
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-white/20 text-white transition-all duration-150 active:bg-white/[0.32]"
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
              >
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </button>

            {/* .ia-greeting-date — :4920-4943. Titik 6px #FFD166, bukan ikon. */}
            <span className="inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[rgba(255,209,102,0.85)] bg-white/[0.14] px-[11px] py-1 text-[11.5px] font-bold tracking-[0.01em] whitespace-nowrap text-white shadow-[0_0_0_3px_rgba(255,209,102,0.14)]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FFD166]" />
              {labelTanggal}
            </span>
          </div>
        </div>
      </div>

      {/* .ia-dashboard-view — :5212-5216 */}
      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-[100px]">
        {/* .ia-dashboard-toolbar + .ia-filter-btn-plain — :5218-5266 */}
        <div className="mb-3 flex justify-end">
          <span className="py-1 text-[13.5px] font-bold text-sage">{labelBulan}</span>
        </div>

        {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
        {!loading && error && <p className="text-[13px] text-red">{error}</p>}

        {!loading && !error && guruId == null && (
          <div className="rounded-card border border-border bg-panel p-4 text-[12.5px] text-text-dim shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            Akun ini belum terhubung ke data guru, sehingga daftar kelas belum bisa ditampilkan.
          </div>
        )}

        {!loading && !error && guruId != null && kelas.length === 0 && (
          <div className="rounded-card border border-border bg-panel p-4 text-[12.5px] text-text-dim shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            Belum ada kelas yang terdaftar atas nama Anda.
          </div>
        )}

        {!loading &&
          !error &&
          kelas.map((k) => {
            const kategori = namaDari(k.kategori_kbm);
            const menit = durasiMenit(k.jam_mulai, k.jam_selesai);
            const info: string[] = [];
            if (k.ruangan) info.push(k.ruangan);
            info.push(`${k.santri_count} Santri`);
            if (jam(k.jam_mulai) && jam(k.jam_selesai)) {
              info.push(
                `${jam(k.jam_mulai)}–${jam(k.jam_selesai)}${
                  menit != null ? ` · Durasi ${menit} Menit` : ''
                }`
              );
            }

            return (
              /* .ia-dash-card — :5337-5343 */
              <div
                key={k.id}
                className="mb-2.5 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
              >
                {/* .ia-dash-card-head + -kelas + -jenjang — :5345-5362 */}
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[15px] font-bold text-text">
                    {k.nama}
                    {kategori === 'Cabe Rawit' && (
                      <span className="text-[12px] font-semibold text-sage"> · Cabe Rawit</span>
                    )}
                  </span>
                </div>

                {/* .ia-dash-card-info — :5387-5392 */}
                <div className="mb-1 text-[12.5px] font-semibold text-text">{info.join(' · ')}</div>

                {/* Placeholder statistik. Baris .ia-dash-stat-row (5 kolom, :5407-5411)
                   sengaja dipertahankan supaya tata letaknya tidak bergeser saat
                   angka aslinya menyusul. Tanda "—", BUKAN 0 -- datanya memang
                   belum dihitung, bukan nol. */}
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {['HARI AKTIF', 'HADIR', 'IZIN', 'SAKIT', 'ALPA'].map((label) => (
                    <div
                      key={label}
                      className="flex flex-col items-center gap-[3px] rounded-[10px] bg-panel-2 px-1 pt-2.5 pb-[9px]"
                    >
                      <span className="text-[18px] leading-none font-extrabold text-text-faint">
                        —
                      </span>
                      <span className="mt-px text-center text-[10.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[11px] font-medium text-text-faint">
                  Statistik kehadiran belum tersedia — fitur laporan kelas belum aktif.
                </div>
              </div>
            );
          })}
      </div>
    </main>
  );
}
