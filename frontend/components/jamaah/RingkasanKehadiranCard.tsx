'use client';

/* Card "Ringkasan Kehadiran" di beranda Penerobos Kelp — bulan berjalan.
   Kerangka seukuran kartu asli supaya tak melompat. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, CalendarDays, Users, TrendingUp, Info, CalendarCheck } from 'lucide-react';
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

  if (loading) return <Skeleton className="mb-4 h-[194px] w-full rounded-card" />;

  const acaraTerakhir = data?.acara[0] ?? null;

  return (
    <button
      type="button"
      onClick={() => router.push('/jamaah/riwayat')}
      className="kartu-premium animasi-konten-muncul mb-4 block w-full p-4 text-left transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="label-mikro">Ringkasan Kehadiran</span>
        <span className="flex items-center gap-0.5 text-[11px] font-semibold text-text-dim">
          {NAMA_BULAN[bulan - 1]} {tahun}
          <ChevronRight size={13} />
        </span>
      </div>

      <div className="mt-4 flex items-stretch">
        <Metrik ikon={CalendarDays} nilai={String(data?.jumlahAcara ?? 0)} label="Acara" />
        <Pemisah />
        <Metrik ikon={Users} nilai={String(data?.totalKehadiran ?? 0)} label="Total Hadir" />
        <Pemisah />
        <Metrik
          ikon={TrendingUp}
          nilai={data?.persenHadir != null ? `${data.persenHadir}%` : '—'}
          label="Rata-rata"
        />
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-[10px] bg-hijau-lembut px-3 py-2.5">
        {acaraTerakhir ? (
          <CalendarCheck size={14} strokeWidth={2} className="shrink-0 text-hijau" />
        ) : (
          <Info size={14} strokeWidth={2} className="shrink-0 text-hijau" />
        )}
        <span className="min-w-0 truncate text-[11.5px] text-text-dim">
          {acaraTerakhir
            ? `Terakhir: ${acaraTerakhir.judul} — ${acaraTerakhir.hadir} hadir`
            : 'Belum ada acara pada bulan ini'}
        </span>
      </div>
    </button>
  );
}

function Pemisah() {
  return <div className="mx-1 my-1.5 w-px self-stretch bg-border" />;
}

function Metrik({
  ikon: Ikon,
  nilai,
  label,
}: {
  ikon: typeof CalendarDays;
  nilai: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-hijau-lembut text-hijau">
        <Ikon size={14} strokeWidth={2} />
      </span>
      <span className="angka-metrik mt-0.5 text-[25px] text-text">{nilai}</span>
      <span className="label-mikro text-[9.5px] text-text-dim">{label}</span>
    </div>
  );
}
