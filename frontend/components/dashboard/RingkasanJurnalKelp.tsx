'use client';

/* "Ringkasan Jurnal Pembelajaran" -- kartu pemantauan jurnal per kelas
   utk admin kelp (Fase 1, 2026-09-09). Konsep & bahasa visual DISAMAKAN
   dgn kartu "Ringkasan Kehadiran" (AdminKelpDashboard): kartu bisa
   dilipat, baris 5 tile ringkasan, daftar per-kelas yang bisa dibuka,
   pemilih bulan yang SAMA (prop `bulan`/`tahun` dari induk).

   Yang membedakan dari sekadar hitungan:
   - status KESEHATAN per kelas, daftar diurut yang paling bermasalah dulu;
   - PACING Tilawati vs pedoman;
   - KEMUNGKINAN PENYEBAB (guru izin / tanggal libur) supaya admin tidak
     salah menegur;
   - kejujuran data basi ("data terakhir N hari lalu");
   - tombol "Kirim Pengingat" -> lonceng guru + jejak kapan terakhir. */

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, ChevronDown, Send, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/useToast';
import Skeleton from '@/components/ui/Skeleton';
import {
  muatRingkasanJurnalPerKelas,
  ringkasKelompokDariKelas,
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
  sehat: { titik: 'var(--sage)', teks: 'var(--sage)', label: 'Sehat', bg: 'rgba(5,150,105,0.08)' },
  perhatian: { titik: 'var(--brass)', teks: 'var(--brass)', label: 'Perlu perhatian', bg: 'rgba(217,119,6,0.08)' },
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

export default function RingkasanJurnalKelp({
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
      setList(await muatRingkasanJurnalPerKelas(kelompokId, tahun, bulan));
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, bulan]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function kirim(k: JurnalKelasRingkas) {
    if (!kelompokId) return;
    setMengirim(k.kelasId);
    try {
      const ringkasKondisi = [
        k.direncana === 0 ? 'belum ada rencana bulan ini' : `${k.disampaikan}/${k.direncana} materi disampaikan`,
        k.tidakTersampaikan > 0 ? `${k.tidakTersampaikan} tidak tersampaikan` : null,
        k.tilawati && k.tilawati.santriDinilai >= 2 && k.tilawati.bb + k.tilawati.mb > k.tilawati.bsh + k.tilawati.bsb
          ? 'Tilawati di bawah target'
          : null,
      ]
        .filter(Boolean)
        .join(', ');
      await kirimPengingatJurnal({
        kelompokId,
        kelasId: k.kelasId,
        kelasNama: k.kelasNama,
        guruId: k.guruId,
        guruNama: k.guruNama,
        catatan: ringkasKondisi,
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

  const ringkas = ringkasKelompokDariKelas(list);
  const perluTindak = ringkas.kelasTertinggal + ringkas.kelasPerhatian;
  const headline =
    list.length === 0
      ? 'Belum ada kelas dengan santri'
      : perluTindak === 0
        ? 'Semua kelas sehat bulan ini'
        : `${perluTindak} dari ${ringkas.totalKelas} kelas perlu perhatian`;
  const headlineWarna =
    perluTindak === 0 ? 'var(--sage)' : ringkas.kelasTertinggal > 0 ? 'var(--red)' : 'var(--brass)';

  if (loading) return <Skeleton className="mb-4 h-[92px] w-full rounded-card" />;

  return (
    <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        className="flex w-full cursor-pointer items-start justify-between gap-3 border-none bg-transparent p-0 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-text">
              <ClipboardList size={14} className="text-text-dim" />
              Ringkasan Jurnal Pembelajaran
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-text-faint transition-transform duration-200 ${buka ? 'rotate-180' : ''}`}
            />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: headlineWarna }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: headlineWarna }} />
            {headline}
          </div>
          <div className="mt-0.5 text-[11px] text-text-dim">
            {NAMA_BULAN[bulan - 1]} {tahun} · {ringkas.kelasTerjurnal}/{ringkas.totalKelas} kelas ada jurnal
          </div>
        </div>
      </button>

      {/* 5 tile ringkasan -- pola sama Ringkasan Kehadiran */}
      <div className="mt-3 grid grid-cols-5 gap-2">
        <div
          className="flex flex-col items-center gap-[3px] rounded-[10px] px-1 pt-2.5 pb-[9px] shadow-[0_4px_14px_rgba(13,148,136,0.26),inset_0_1px_0_rgba(255,255,255,0.14)]"
          style={{ background: 'linear-gradient(155deg,#0F766E 0%,#0D9488 60%,#14B8A6 100%)' }}
        >
          <span className="text-[18px] leading-none font-extrabold text-white tabular-nums">
            {ringkas.kelasTerjurnal}
          </span>
          <span className="mt-px text-center text-[10px] font-bold tracking-[0.02em] text-white/85 uppercase">
            Kelas
            <br />
            Terjurnal
          </span>
        </div>
        {(
          [
            { n: ringkas.direncana, label: 'Direncana', c: 'var(--text-dim)' },
            { n: ringkas.disampaikan, label: 'Disampaikan', c: 'var(--sage)' },
            { n: ringkas.belum, label: 'Belum', c: 'var(--brass)' },
            { n: ringkas.tidakTersampaikan, label: 'Tdk Sampai', c: 'var(--red)' },
          ] as const
        ).map((t) => {
          const persen = ringkas.direncana > 0 ? Math.round((t.n / ringkas.direncana) * 100) : null;
          const pakaiPersen = t.label !== 'Direncana' && persen !== null;
          return (
            <div
              key={t.label}
              className="flex flex-col items-center gap-[3px] rounded-[10px] bg-panel-2 px-1 pt-2.5 pb-[9px]"
            >
              <span className="text-[18px] leading-none font-extrabold tabular-nums" style={{ color: t.c }}>
                {t.n}
              </span>
              {pakaiPersen && (
                <span
                  className="rounded-full px-[7px] py-0.5 text-[10px] leading-none font-bold tabular-nums"
                  style={{ background: `${t.c}1F`, color: t.c }}
                >
                  {persen}%
                </span>
              )}
              <span className="mt-px text-center text-[10.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                {t.label}
              </span>
            </div>
          );
        })}
      </div>

      {buka && (
        <div className="mt-4 flex flex-col gap-2.5 border-t border-border pt-4">
          {list.length === 0 && (
            <p className="text-[12.5px] text-text-dim">Belum ada kelas dengan santri di kelompok ini.</p>
          )}
          {list.map((k) => {
            const s = SEHAT[k.kesehatan];
            const t = k.tilawati;
            const tilawatiLemah = t != null && t.santriDinilai >= 2 && t.bb + t.mb > t.bsh + t.bsb;
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
                    {k.guruNama} · {k.santriCount} santri ·{' '}
                    {k.kelasBaru
                      ? 'kelas baru'
                      : k.disentuhTerakhir
                        ? `jurnal disentuh ${k.hariSejakDisentuh ?? 0} hari lalu`
                        : 'belum ada jurnal bulan ini'}
                  </div>
                </button>

                {/* Ringkas selalu tampil: rasio ngaji/klasikal + tilawati */}
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-md bg-panel px-2 py-1 text-text-dim">
                    Ngaji {k.ngajiDisampaikan}/{k.ngajiDirencana}
                  </span>
                  <span className="rounded-md bg-panel px-2 py-1 text-text-dim">
                    Klasikal {k.klasikalDisampaikan}/{k.klasikalDirencana}
                  </span>
                  {k.tidakTersampaikan > 0 && (
                    <span
                      className="rounded-md px-2 py-1"
                      style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--red)' }}
                    >
                      {k.tidakTersampaikan} tidak tersampaikan
                    </span>
                  )}
                  {t && (
                    <span
                      className="rounded-md px-2 py-1"
                      style={
                        tilawatiLemah
                          ? { background: 'rgba(217,119,6,0.12)', color: 'var(--brass)' }
                          : { background: 'rgba(5,150,105,0.1)', color: 'var(--sage)' }
                      }
                    >
                      Tilawati {tilawatiLemah ? 'di bawah target' : 'sesuai target'}
                    </span>
                  )}
                </div>

                {k.kemungkinanPenyebab.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-panel px-2.5 py-1.5 text-[11px] leading-snug text-text-dim">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-brass" />
                    <span>Kemungkinan penyebab: {k.kemungkinanPenyebab.join(' · ')}</span>
                  </div>
                )}

                {kelasTerbuka === k.kelasId && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                    {t && (
                      <div className="text-[11.5px] leading-snug text-text-dim">
                        <span className="font-bold text-text">Target Tilawati bulan ini:</span> {t.labelTarget}
                        {t.santriDinilai > 0 && (
                          <div className="mt-1">
                            Capaian {t.santriDinilai} santri dinilai — BSB {t.bsb} · BSH {t.bsh} · MB {t.mb} · BB {t.bb}
                            {t.naik + t.tetap > 0 && ` · ${t.naik} Naik, ${t.tetap} Tetap`}
                          </div>
                        )}
                      </div>
                    )}
                    {k.alasanTidakTersampaikan.length > 0 && (
                      <div className="text-[11.5px] leading-snug text-text-dim">
                        <span className="font-bold text-text">Alasan tidak tersampaikan:</span>
                        <ul className="mt-0.5 list-disc pl-4">
                          {k.alasanTidakTersampaikan.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="text-[10.5px] text-text-faint">
                      {k.disampaikanTerakhir
                        ? `Materi terakhir disampaikan ${k.hariSejakDisampaikan} hari lalu.`
                        : k.disentuhTerakhir
                          ? `Jurnal terakhir diubah ${k.hariSejakDisentuh} hari lalu, belum ada yang disampaikan.`
                          : 'Guru belum membuat entri jurnal bulan ini.'}
                    </div>
                  </div>
                )}

                {/* Aksi: Kirim Pengingat + jejak */}
                {k.kesehatan !== 'sehat' && (
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
        </div>
      )}
    </div>
  );
}
