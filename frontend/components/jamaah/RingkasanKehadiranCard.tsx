'use client';

/* Card "Ringkasan Kehadiran" di beranda Penerobos Kelp — bulan berjalan.
   Kerangka seukuran kartu asli supaya tak melompat. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Skeleton from '@/components/ui/Skeleton';
import { muatRingkasKehadiranBulan, type RingkasBulan } from '@/lib/jamaahKehadiran';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export default function RingkasanKehadiranCard() {
  const router = useRouter();
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const skrg = new Date();
  const bulan = skrg.getMonth() + 1;
  const tahun = skrg.getFullYear();

  const [data, setData] = useState<RingkasBulan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let batal = false;
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    muatRingkasKehadiranBulan(kelompokId, tahun, bulan)
      .then((r) => !batal && setData(r))
      .catch(() => !batal && setData(null))
      .finally(() => !batal && setLoading(false));
    return () => {
      batal = true;
    };
  }, [kelompokId, tahun, bulan]);

  if (loading) return <Skeleton className="mb-4 h-[132px] w-full rounded-card" />;

  const acaraTerakhir = data?.acara[0] ?? null;

  return (
    <button
      type="button"
      onClick={() => router.push('/jamaah/riwayat')}
      className="animasi-konten-muncul mb-4 block w-full rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-text">Ringkasan Kehadiran</span>
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-text-dim">
          {NAMA_BULAN[bulan - 1]} {tahun}
          <ChevronRight size={13} />
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile nilai={String(data?.jumlahAcara ?? 0)} label="Acara" warna="var(--navy)" />
        <Tile nilai={String(data?.totalKehadiran ?? 0)} label="Total Hadir" warna="var(--sage)" />
        <Tile
          nilai={data?.persenHadir != null ? `${data.persenHadir}%` : '—'}
          label="Rata-rata"
          warna="var(--navy)"
        />
      </div>

      <div className="mt-2.5 text-[11px] text-text-dim">
        {acaraTerakhir
          ? `Terakhir: ${acaraTerakhir.judul} — ${acaraTerakhir.hadir} hadir`
          : 'Belum ada acara bulan ini'}
      </div>
    </button>
  );
}

function Tile({ nilai, label, warna }: { nilai: string; label: string; warna: string }) {
  return (
    <div className="flex flex-col items-center rounded-[10px] bg-panel-2 px-1 py-2.5">
      <span className="text-[18px] leading-none font-extrabold tabular-nums" style={{ color: warna }}>
        {nilai}
      </span>
      <span className="mt-1 text-center text-[9.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
        {label}
      </span>
    </div>
  );
}
