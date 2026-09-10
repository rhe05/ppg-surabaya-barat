'use client';

/* Card KPI "Ringkasan Jamaah" di beranda Penerobos Kelp — Total + MS +
   rincian demografi. SELECT jamaah (kolom KPI) + SELECT guru (kategori),
   hitung 100% di memori. MS (Muballigh/ot Setempat) digabung dari
   jamaah.status_keluarga + guru.kategori. Tap → Data Jamaah. */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import Skeleton from '@/components/ui/Skeleton';
import {
  hitungKpiJamaah,
  KOLOM_JAMAAH_KPI,
  STATUS_MS,
  type KpiJamaah,
  type JamaahKpiRow,
} from '@/lib/jamaah';

const KOSONG: KpiJamaah = {
  total: 0,
  duda: 0,
  janda: 0,
  kk: 0,
  lakiLaki: 0,
  perempuan: 0,
  lansia: 0,
  ms: 0,
};

export default function RingkasanJamaahCard() {
  const router = useRouter();
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [kpi, setKpi] = useState<KpiJamaah | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    let batal = false;
    (async () => {
      const [rJam, rGuru] = await Promise.all([
        supabase
          .from('jamaah')
          .select(KOLOM_JAMAAH_KPI)
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null),
        /* MS dari data pokok (guru.kategori). Kalau RLS penerobos belum
           aktif (migrasi 20260910180000) → balik kosong, MS jamaah tetap. */
        supabase
          .from('guru')
          .select('id', { count: 'exact', head: true })
          .eq('kelompok_id', kelompokId)
          .eq('kategori', STATUS_MS)
          .is('deleted_at', null),
      ]);
      if (batal) return;
      setKpi(
        hitungKpiJamaah((rJam.data ?? []) as unknown as JamaahKpiRow[], rGuru.count ?? 0),
      );
      setLoading(false);
    })();
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  if (loading) return <Skeleton className="mb-4 h-[236px] w-full rounded-card" />;

  const k = kpi ?? KOSONG;

  return (
    <button
      type="button"
      onClick={() => router.push('/jamaah/data')}
      className="kartu-premium animasi-konten-muncul mb-4 block w-full p-4 text-left transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <span className="label-mikro">Ringkasan Jamaah</span>
        <ChevronRight size={14} className="shrink-0 text-text-faint" />
      </div>

      <div className="mt-3 flex items-stretch">
        <div className="flex flex-1 flex-col">
          <span className="angka-metrik text-[30px] leading-none text-text">{k.total}</span>
          <span className="label-mikro mt-1.5 text-[9.5px] text-text-dim">Total Jamaah</span>
        </div>
        <div className="mx-3 w-px self-stretch bg-border" />
        <div className="flex flex-1 flex-col">
          <span className="angka-metrik text-[30px] leading-none text-navy">{k.ms}</span>
          <span className="label-mikro mt-1.5 text-[9.5px] text-text-dim">MS · Muballigh/ot Setempat</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-y-4 border-t border-border pt-4">
        <Stat n={k.lakiLaki} l="Laki-laki" />
        <Stat n={k.perempuan} l="Perempuan" />
        <Stat n={k.kk} l="Kepala Keluarga" />
        <Stat n={k.duda} l="Duda" />
        <Stat n={k.janda} l="Janda" />
        <Stat n={k.lansia} l="Lansia" />
      </div>
    </button>
  );
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="angka-metrik text-[19px] text-text">{n}</span>
      <span className="label-mikro text-center text-[9px] leading-tight text-text-dim">{l}</span>
    </div>
  );
}
