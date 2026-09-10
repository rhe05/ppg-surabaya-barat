'use client';

/* Card KPI "Ringkasan Jamaah" di beranda Penerobos Kelp — Total + MS + GB
   + rincian demografi. SELECT jamaah (kolom KPI) + SELECT guru (kategori),
   hitung 100% di memori.
   MS (Muballigh/ot Setempat) = jamaah.status_keluarga + guru.kategori.
   GB (Guru Bantu) = guru.kategori saja. Tap → Data Jamaah. */

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
  KATEGORI_GB,
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
  gb: 0,
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
        /* Data pokok guru sekelompok. Kalau RLS penerobos belum aktif
           (migrasi 20260910180000) → balik kosong, MS jamaah tetap. */
        supabase
          .from('guru')
          .select('kategori')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null),
      ]);
      if (batal) return;
      const guru = (rGuru.data ?? []) as { kategori: string | null }[];
      const msGuru = guru.filter((g) => g.kategori === STATUS_MS).length;
      const gbGuru = guru.filter((g) => g.kategori === KATEGORI_GB).length;
      setKpi(
        hitungKpiJamaah((rJam.data ?? []) as unknown as JamaahKpiRow[], msGuru, gbGuru),
      );
      setLoading(false);
    })();
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  if (loading) return <Skeleton className="mb-4 h-[248px] w-full rounded-card" />;

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

      {/* Total + MS + GB */}
      <div className="mt-3 flex items-stretch">
        <Utama n={k.total} l="Total Jamaah" />
        <div className="mx-2.5 w-px self-stretch bg-border" />
        <Utama n={k.ms} l="MS" aksen />
        <div className="mx-2.5 w-px self-stretch bg-border" />
        <Utama n={k.gb} l="GB" aksen />
      </div>

      {/* Demografi */}
      <div className="mt-4 grid grid-cols-3 gap-y-4 border-t border-border pt-4">
        <Stat n={k.lakiLaki} l="Laki-laki" />
        <Stat n={k.perempuan} l="Perempuan" />
        <Stat n={k.kk} l="Kepala Keluarga" />
        <Stat n={k.duda} l="Duda" />
        <Stat n={k.janda} l="Janda" />
        <Stat n={k.lansia} l="Lansia" />
      </div>

      <p className="mt-3.5 border-t border-border pt-2.5 text-[10px] leading-relaxed text-text-faint">
        MS Muballigh/ot Setempat &nbsp;·&nbsp; GB Guru Bantu
      </p>
    </button>
  );
}

function Utama({ n, l, aksen }: { n: number; l: string; aksen?: boolean }) {
  return (
    <div className="flex flex-1 flex-col">
      <span className={`angka-metrik text-[26px] leading-none ${aksen ? 'text-navy' : 'text-text'}`}>
        {n}
      </span>
      <span className="label-mikro mt-1.5 text-[9.5px] text-text-dim">{l}</span>
    </div>
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
