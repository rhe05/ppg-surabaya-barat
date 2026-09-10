'use client';

/* Card KPI "Ringkasan Jamaah" di beranda Penerobos Kelp — Total + kategori
   guru (MS/GB/MT) + rincian demografi. SELECT jamaah (kolom KPI) + SELECT
   guru (kategori), hitung 100% di memori.
   MS = jamaah.status_keluarga + guru.kategori. GB/MT = guru.kategori saja.
   Tap → Data Jamaah. */

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
  KATEGORI_MT,
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
  mt: 0,
  mukim: 0,
  musiman: 0,
  pindah: 0,
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
      const hitung = (kat: string) => guru.filter((g) => g.kategori === kat).length;
      setKpi(
        hitungKpiJamaah(
          (rJam.data ?? []) as unknown as JamaahKpiRow[],
          hitung(STATUS_MS),
          hitung(KATEGORI_GB),
          hitung(KATEGORI_MT),
        ),
      );
      setLoading(false);
    })();
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  if (loading) return <Skeleton className="mb-4 h-[318px] w-full rounded-card" />;

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

      <div className="mt-3">
        <span className="angka-metrik block text-[30px] leading-none text-text">{k.total}</span>
        <span className="label-mikro mt-1.5 block text-[9.5px] text-text-dim">Total Jamaah</span>
      </div>

      {/* Kategori guru sekelompok */}
      <div className="mt-4 grid grid-cols-3 border-t border-border pt-4">
        <Utama n={k.ms} l="MS" />
        <Utama n={k.gb} l="GB" garis />
        <Utama n={k.mt} l="MT" garis />
      </div>

      {/* Demografi jamaah */}
      <div className="mt-4 grid grid-cols-3 gap-y-4 border-t border-border pt-4">
        <Stat n={k.lakiLaki} l="Laki-laki" />
        <Stat n={k.perempuan} l="Perempuan" />
        <Stat n={k.kk} l="Kepala Keluarga" />
        <Stat n={k.duda} l="Duda" />
        <Stat n={k.janda} l="Janda" />
        <Stat n={k.lansia} l="Lansia" />
      </div>

      {/* Domisili */}
      <div className="mt-4 grid grid-cols-3 gap-y-4 border-t border-border pt-4">
        <Stat n={k.mukim} l="Mukim" />
        <Stat n={k.musiman} l="Musiman" />
        <Stat n={k.pindah} l="Pindah" />
      </div>

      <p className="mt-3.5 border-t border-border pt-2.5 text-[10px] leading-relaxed text-text-faint">
        MS Muballigh/ot Setempat &nbsp;·&nbsp; GB Guru Bantu &nbsp;·&nbsp; MT Muballigh/ot Tugasan
      </p>
    </button>
  );
}

function Utama({ n, l, garis }: { n: number; l: string; garis?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 ${garis ? 'border-l border-border' : ''}`}>
      <span className="angka-metrik text-[22px] text-navy">{n}</span>
      <span className="label-mikro text-[9.5px] text-text-dim">{l}</span>
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
