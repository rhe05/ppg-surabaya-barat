'use client';

/* Kartu "Monitoring" -- admin kelp mobile. Pemantauan PENCAPAIAN santri
   (Buku Jilid Tilawati vs pedoman), terpisah dari kartu "Ringkasan Jurnal
   Ngaji" yang memantau apakah guru merencana & menyampaikan materi.

   Konsep & bahasa visual sama dgn kartu ringkasan lain: kartu lipat,
   5 tile, daftar per-kelas yang bisa dibuka, pemilih bulan yg sama.
   Sumber data sama (muatRingkasanJurnalPerKelas) -- field `tilawati` +
   `kesehatanTilawati` sudah dihitung di sana. */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, ChevronDown, ChevronRight, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/useToast';
import Skeleton from '@/components/ui/Skeleton';
import {
  muatRingkasanJurnalPerKelas,
  urutkanUntukMonitoring,
  ringkasMonitoringKelompok,
  kirimPengingatJurnal,
  type JurnalKelasRingkas,
  type KesehatanJurnal,
} from '@/lib/ringkasanJurnalAdminKelp';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const SEHAT: Record<
  KesehatanJurnal,
  { titik: string; teks: string; label: string; bg: string }
> = {
  sehat: { titik: 'var(--sage)', teks: 'var(--sage)', label: 'Sesuai target', bg: 'rgba(5,150,105,0.08)' },
  perhatian: { titik: 'var(--brass)', teks: 'var(--brass)', label: 'Di bawah target', bg: 'rgba(217,119,6,0.08)' },
  tertinggal: { titik: 'var(--red)', teks: 'var(--red)', label: 'Tertinggal', bg: 'rgba(220,38,38,0.08)' },
};

function lalu(iso: string): string {
  const hari = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (hari <= 0) return 'hari ini';
  if (hari === 1) return 'kemarin';
  if (hari < 7) return `${hari} hari lalu`;
  if (hari < 30) return `${Math.floor(hari / 7)} minggu lalu`;
  return `${Math.floor(hari / 30)} bulan lalu`;
}

export default function MonitoringKelp({
  kelompokId,
  tahun,
  bulan,
}: {
  kelompokId: number | null;
  tahun: number;
  bulan: number;
}) {
  const { profile } = useAuth();
  const toast = useToast();
  const [buka, setBuka] = useState(false);
  const [dilipatManual, setDilipatManual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<JurnalKelasRingkas[]>([]);
  const [kelasTerbuka, setKelasTerbuka] = useState<number | null>(null);
  const [mengirim, setMengirim] = useState<number | null>(null);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setList(urutkanUntukMonitoring(await muatRingkasanJurnalPerKelas(kelompokId, tahun, bulan)));
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, bulan]);

  useEffect(() => {
    muat();
  }, [muat]);

  useEffect(() => {
    if (!dilipatManual && list.some((k) => k.kesehatanTilawati === 'tertinggal')) setBuka(true);
  }, [list, dilipatManual]);

  async function kirim(k: JurnalKelasRingkas) {
    if (!kelompokId) return;
    setMengirim(k.kelasId);
    try {
      const t = k.tilawati;
      const catatan = t
        ? `Tilawati di bawah target — ${t.bb + t.mb} dari ${t.santriDinilai} santri belum sesuai (target: ${t.labelTarget}).`
        : 'Tilawati perlu diperhatikan.';
      await kirimPengingatJurnal({
        kelompokId,
        kelasId: k.kelasId,
        kelasNama: k.kelasNama,
        guruId: k.guruId,
        guruNama: k.guruNama,
        catatan,
        dibuatOleh: profile?.id ?? null,
      });
      toast.sukses(`Pengingat terkirim ke ${k.guruNama} (lewat lonceng).`);
      await muat();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengirim pengingat.');
    } finally {
      setMengirim(null);
    }
  }

  if (!kelompokId) return null;
  if (loading) return <Skeleton className="mb-4 h-[92px] w-full rounded-card" />;

  const r = ringkasMonitoringKelompok(list);
  const perluTindak = r.kelasTertinggal + r.kelasPerhatian;
  const dinilai = list.filter((k) => k.kesehatanTilawati !== 'takberlaku');
  const takBerlaku = list.filter((k) => k.kesehatanTilawati === 'takberlaku');

  const headline =
    r.kelasDinilai === 0
      ? 'Belum ada capaian Tilawati untuk dinilai'
      : perluTindak === 0
        ? 'Semua kelas sesuai target Tilawati'
        : `${perluTindak} kelas di bawah target Tilawati`;
  const headlineWarna =
    r.kelasDinilai === 0 ? 'var(--text-dim)' : perluTindak === 0 ? 'var(--sage)' : r.kelasTertinggal > 0 ? 'var(--red)' : 'var(--brass)';
  const perluAksi = r.kelasTertinggal > 0;

  return (
    <div
      className="mb-4 rounded-card border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
      style={perluAksi ? { borderColor: 'var(--red)', borderWidth: 1.5 } : { borderColor: 'var(--border)' }}
    >
      <button
        type="button"
        onClick={() =>
          setBuka((v) => {
            if (v) setDilipatManual(true);
            return !v;
          })
        }
        className="flex w-full cursor-pointer items-start justify-between gap-3 border-none bg-transparent p-0 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-text">
              <LineChart size={14} className="text-text-dim" />
              Monitoring
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-text-faint transition-transform duration-200 ${buka ? 'rotate-180' : ''}`}
            />
          </div>
          <div
            className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold"
            style={{ color: headlineWarna }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: headlineWarna }} />
            {headline}
          </div>
          <div className="mt-0.5 text-[11px] text-text-dim">
            {NAMA_BULAN[bulan - 1]} {tahun} · Buku Jilid Tilawati vs pedoman
          </div>
        </div>
      </button>

      {/* 5 tile -- struktur seragam dgn kartu lain */}
      <div className="mt-3 grid grid-cols-5 gap-2">
        <div
          className="flex flex-col items-center rounded-[10px] px-1 pt-2.5 pb-2 shadow-[0_4px_14px_rgba(13,148,136,0.26),inset_0_1px_0_rgba(255,255,255,0.14)]"
          style={{ background: 'linear-gradient(155deg,#0F766E 0%,#0D9488 60%,#14B8A6 100%)' }}
        >
          <span className="text-[18px] leading-none font-extrabold text-white tabular-nums">{r.kelasDinilai}</span>
          <span className="h-[16px]" />
          <span className="flex min-h-[24px] items-center text-center text-[10px] leading-[1.15] font-bold tracking-[0.02em] text-white/85 uppercase">
            Kelas Dinilai
          </span>
        </div>
        {(
          [
            { n: r.bsb, label: 'BSB', c: '#0D9488' },
            { n: r.bsh, label: 'BSH', c: 'var(--sage)' },
            { n: r.mb, label: 'MB', c: 'var(--brass)' },
            { n: r.bb, label: 'BB', c: 'var(--red)' },
          ] as const
        ).map((t) => (
          <div
            key={t.label}
            className="flex flex-col items-center rounded-[10px] bg-panel-2 px-1 pt-2.5 pb-2"
          >
            <span className="text-[18px] leading-none font-extrabold tabular-nums" style={{ color: t.c }}>
              {t.n}
            </span>
            <span className="h-[16px]" />
            <span className="flex min-h-[24px] items-center text-center text-[10px] leading-[1.15] font-bold tracking-[0.02em] text-text-dim uppercase">
              {t.label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-center text-[10px] text-text-faint">
        Santri: BB kurang · MB mendekati · BSH sesuai · BSB melebihi target
      </div>

      {buka && (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
          {dinilai.length === 0 && (
            <p className="text-[12.5px] text-text-dim">
              Belum ada catatan Buku Jilid Tilawati bulan ini untuk kelas dalam pedoman (PAUD–kelas 3).
            </p>
          )}
          {dinilai.map((k) => {
            const s = SEHAT[(k.kesehatanTilawati as KesehatanJurnal) ?? 'sehat'];
            const t = k.tilawati!;
            return (
              <div key={k.kelasId} className="rounded-[var(--radius-lg)] border border-border bg-panel-2 p-3.5">
                <button
                  type="button"
                  onClick={() => setKelasTerbuka((c) => (c === k.kelasId ? null : k.kelasId))}
                  className="w-full cursor-pointer border-none bg-transparent p-0 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[14px] font-bold text-text">{k.kelasNama}</span>
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                        style={{ background: s.bg, color: s.teks }}
                      >
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.titik }} />
                        {s.label}
                      </span>
                    </div>
                    <ChevronDown
                      size={15}
                      className={`shrink-0 text-text-faint transition-transform duration-200 ${
                        kelasTerbuka === k.kelasId ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                  <div className="mt-1 text-[12px] font-semibold text-text-dim">
                    {k.guruNama} · {t.santriDinilai}/{k.santriCount} santri dinilai
                    {t.naik + t.tetap > 0 && ` · ${t.naik} Naik, ${t.tetap} Tetap`}
                  </div>
                </button>

                <div className="mt-2 text-[11px] leading-snug text-text-dim">
                  <span className="font-bold text-text">Target bulan ini:</span> {t.labelTarget}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  {(
                    [
                      { n: t.bsb, l: 'BSB', c: '#0D9488' },
                      { n: t.bsh, l: 'BSH', c: 'var(--sage)' },
                      { n: t.mb, l: 'MB', c: 'var(--brass)' },
                      { n: t.bb, l: 'BB', c: 'var(--red)' },
                    ] as const
                  )
                    .filter((x) => x.n > 0)
                    .map((x) => (
                      <span
                        key={x.l}
                        className="rounded-md px-2 py-1"
                        style={{ background: `${x.c}1A`, color: x.c }}
                      >
                        {x.l} {x.n}
                      </span>
                    ))}
                </div>

                {k.kesehatanTilawati !== 'sehat' && (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[10.5px] text-text-faint">
                      {k.pengingatTerakhir ? `Pengingat terakhir: ${lalu(k.pengingatTerakhir)}` : 'Belum pernah diingatkan'}
                    </span>
                    <button
                      type="button"
                      disabled={mengirim === k.kelasId}
                      onClick={() => kirim(k)}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-brass bg-brass px-3 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-50"
                    >
                      <Send size={12} />
                      {mengirim === k.kelasId ? 'Mengirim…' : 'Kirim Pengingat'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {takBerlaku.length > 0 && (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-3 text-[11px] text-text-faint">
              Belum dinilai / di luar pedoman Tilawati:{' '}
              {takBerlaku.map((k) => k.kelasNama).join(', ')}
            </div>
          )}

          <Link
            href="/monitoring"
            className="mt-1 flex items-center justify-center gap-1 text-[12px] font-bold text-brass"
          >
            Buka Monitoring Pencapaian Materi lengkap
            <ChevronRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}
