'use client';

/* Card KPI "Ringkasan Jamaah" di beranda Penerobos Kelp.

   Tata letak sengaja: SATU angka pahlawan (total jamaah aktif) + satu bar
   komposisi L/P + daftar bergaris-rambut (bukan grid angka rata tengah) +
   satu baris domisili di kaki. Pola dasbor SaaS premium — mengkurasi, bukan
   menumpuk metrik. Data & query TIDAK berubah dari versi sebelumnya:
   SELECT jamaah (kolom KPI) + SELECT guru (kategori), hitung 100% di memori.
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

const nf = new Intl.NumberFormat('id-ID');
/* Nol → "–" (teks-faint) supaya mata tak tertarik ke kategori kosong. */
const tampil = (n: number) => (n === 0 ? '–' : nf.format(n));

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

  if (loading) return <Skeleton className="mb-4 h-[513px] w-full rounded-card" />;

  const k = kpi ?? KOSONG;
  const lp = k.lakiLaki + k.perempuan;
  const pctL = lp > 0 ? (k.lakiLaki / lp) * 100 : 0;

  return (
    <button
      type="button"
      onClick={() => router.push('/jamaah/data')}
      className="kartu-premium animasi-konten-muncul mb-4 block w-full p-5 text-left transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <span className="label-mikro">Ringkasan Jamaah</span>
        <ChevronRight size={15} className="shrink-0 text-text-faint" />
      </div>

      {/* Angka pahlawan */}
      <div className="mt-3.5">
        <AngkaHero nilai={k.total} />
        <span className="mt-1.5 block text-[12px] text-text-dim">jamaah aktif</span>
      </div>

      {/* Komposisi laki-laki / perempuan */}
      <div className="mt-4">
        {lp > 0 ? (
          <div className="flex h-1.5 w-full overflow-hidden rounded-full">
            <span className="h-full" style={{ width: `${pctL}%`, background: 'var(--hijau)' }} />
            <span
              className="h-full"
              style={{ width: `${100 - pctL}%`, background: 'rgba(78, 125, 98, 0.32)' }}
            />
          </div>
        ) : (
          <div className="h-1.5 w-full rounded-full bg-border" />
        )}
        <p className="mt-2 text-[11.5px] text-text-dim">
          Laki-laki <span className="font-semibold text-text">{tampil(k.lakiLaki)}</span>
          <span className="mx-1.5 text-text-faint">·</span>
          Perempuan <span className="font-semibold text-text">{tampil(k.perempuan)}</span>
        </p>
      </div>

      {/* Rincian — daftar bergaris rambut, bukan grid */}
      <div className="mt-5 border-t border-border pt-1">
        <Baris l="Kepala keluarga" n={k.kk} />
        <Baris l="Duda" n={k.duda} />
        <Baris l="Janda" n={k.janda} />
        <Baris l="Lansia (60+)" n={k.lansia} />
        <Baris l="Muballigh/ot setempat" n={k.ms} />
        <Baris l="Guru bantu" n={k.gb} />
        <Baris l="Muballigh/ot tugasan" n={k.mt} />
      </div>

      {/* Domisili — satu baris tenang di kaki */}
      <p className="mt-4 border-t border-border pt-3.5 text-[11.5px] leading-relaxed text-text-dim">
        Mukim <span className="font-semibold text-text">{tampil(k.mukim)}</span>
        <span className="mx-1.5 text-text-faint">·</span>
        Musiman <span className="font-semibold text-text">{tampil(k.musiman)}</span>
        <span className="mx-1.5 text-text-faint">·</span>
        Pindah <span className="font-semibold text-text">{tampil(k.pindah)}</span>
      </p>
    </button>
  );
}

/* Angka pahlawan dengan count-up 0→nilai sekali saat muncul (hormati
   prefers-reduced-motion). */
function AngkaHero({ nilai }: { nilai: number }) {
  const [tampak, setTampak] = useState(0);

  useEffect(() => {
    const kurangiGerak =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (kurangiGerak || nilai === 0) {
      setTampak(nilai);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const DURASI = 280;
    const langkah = (t: number) => {
      const p = Math.min(1, (t - t0) / DURASI);
      setTampak(Math.round(nilai * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(langkah);
    };
    raf = requestAnimationFrame(langkah);
    return () => cancelAnimationFrame(raf);
  }, [nilai]);

  return (
    <span className="angka-metrik block text-[38px] leading-none text-text">{nf.format(tampak)}</span>
  );
}

function Baris({ l, n }: { l: string; n: number }) {
  return (
    <div className="baris-daftar flex items-center justify-between py-2">
      <span className="text-[13px] text-text-dim">{l}</span>
      <span className="angka-metrik text-[14.5px] text-text">{tampil(n)}</span>
    </div>
  );
}
