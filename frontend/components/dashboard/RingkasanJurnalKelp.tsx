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
import { ChevronDown, Send, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/useToast';
import Skeleton from '@/components/ui/Skeleton';
import PemilihBulanTahun from '@/components/ui/PemilihBulanTahun';
import {
  muatRingkasanJurnalPerKelas,
  ringkasKelompokDariKelas,
  polaAlasanTidakTersampaikan,
  kirimPengingatJurnal,
  type JurnalKelasRingkas,
  type KesehatanJurnal,
} from '@/lib/ringkasanJurnalAdminKelp';


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
  onGantiBulan,
  varian = 'admin',
  guruId = null,
}: {
  kelompokId: number | null;
  tahun: number;
  bulan: number;
  /* Kalau diisi -> tampilkan pemilih Bulan-Tahun di kanan judul (sama
     spt kartu Ringkasan Kehadiran). */
  onGantiBulan?: (bulan: number, tahun: number) => void;
  /* 'admin' -> semua kelas kelompok + tombol Kirim Pengingat.
     'guru'  -> hanya kelas guru ini, tanpa tombol pengingat, framing
                "status kelas saya" (Fase 2: pacing mengalir ke guru). */
  varian?: 'admin' | 'guru';
  guruId?: number | null;
}) {
  const utkGuru = varian === 'guru';
  const { profile } = useAuth();
  const toast = useToast();
  const [buka, setBuka] = useState(false);
  const [dilipatManual, setDilipatManual] = useState(false);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<JurnalKelasRingkas[]>([]);
  const [kelasTerbuka, setKelasTerbuka] = useState<number | null>(null);
  const [mengirim, setMengirim] = useState<number | null>(null);
  const [mengirimSemua, setMengirimSemua] = useState(false);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setList(
        await muatRingkasanJurnalPerKelas(kelompokId, tahun, bulan, utkGuru ? guruId : null),
      );
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, bulan, utkGuru, guruId]);

  useEffect(() => {
    muat();
  }, [muat]);

  /* Buka sendiri kalau ada kelas TERTINGGAL -- admin tidak perlu ingat
     mengetuk. Dihormati kalau admin sudah melipat manual. */
  useEffect(() => {
    if (!dilipatManual && list.some((k) => k.kesehatan === 'tertinggal')) setBuka(true);
  }, [list, dilipatManual]);

  function catatanKondisi(k: JurnalKelasRingkas): string {
    return [
      k.direncana === 0
        ? 'belum ada rencana materi ngaji bulan ini'
        : `${k.disampaikan}/${k.direncana} materi ngaji disampaikan`,
      k.tidakTersampaikan > 0 ? `${k.tidakTersampaikan} tidak tersampaikan` : null,
    ]
      .filter(Boolean)
      .join(', ');
  }

  // pernah diingatkan < 20 jam terakhir -> jangan spam saat "kirim semua"
  const baruDiingatkan = (k: JurnalKelasRingkas) =>
    k.pengingatTerakhir != null && Date.now() - new Date(k.pengingatTerakhir).getTime() < 20 * 3_600_000;

  async function kirim(k: JurnalKelasRingkas) {
    if (!kelompokId) return;
    setMengirim(k.kelasId);
    try {
      await kirimPengingatJurnal({
        kelompokId,
        kelasId: k.kelasId,
        kelasNama: k.kelasNama,
        guruId: k.guruId,
        guruNama: k.guruNama,
        catatan: catatanKondisi(k),
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

  async function kirimSemua() {
    if (!kelompokId) return;
    const target = list.filter((k) => k.kesehatan !== 'sehat' && !baruDiingatkan(k));
    if (target.length === 0) {
      toast.info('Semua kelas yang perlu sudah diingatkan dalam 20 jam terakhir.');
      return;
    }
    setMengirimSemua(true);
    let ok = 0;
    for (const k of target) {
      try {
        await kirimPengingatJurnal({
          kelompokId,
          kelasId: k.kelasId,
          kelasNama: k.kelasNama,
          guruId: k.guruId,
          guruNama: k.guruNama,
          catatan: catatanKondisi(k),
          dibuatOleh: profile?.id ?? null,
        });
        ok += 1;
      } catch {
        /* lanjut ke kelas berikutnya */
      }
    }
    setMengirimSemua(false);
    toast.sukses(`Pengingat terkirim ke ${ok} kelas.`);
    await muat();
  }

  if (!kelompokId) return null;

  const ringkas = ringkasKelompokDariKelas(list);
  const perluTindak = ringkas.kelasTertinggal + ringkas.kelasPerhatian;
  /* Headline HANYA muncul kalau ada yang perlu perhatian / tidak ada kelas.
     Kalau semua sehat -> tidak ada baris (kartu bersih). */
  const headline =
    list.length === 0
      ? utkGuru
        ? 'Belum ada kelas'
        : 'Belum ada kelas dengan santri'
      : perluTindak > 0
        ? utkGuru
          ? `${perluTindak} kelas perlu kamu kejar bulan ini`
          : `${perluTindak} dari ${ringkas.totalKelas} kelas perlu perhatian`
        : null;
  const headlineWarna = ringkas.kelasTertinggal > 0 ? 'var(--red)' : 'var(--brass)';

  if (loading) return <Skeleton className="mb-4 h-[92px] w-full rounded-card" />;

  const perluAksi = ringkas.kelasTertinggal > 0;
  const pola = utkGuru ? [] : polaAlasanTidakTersampaikan(list);

  return (
    <div
      className="mb-4 rounded-card border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
      style={perluAksi ? { borderColor: 'var(--red)', borderWidth: 1.5 } : { borderColor: 'var(--border)' }}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setBuka((v) => {
                if (v) setDilipatManual(true);
                return !v;
              })
            }
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
          >
            <span className="shrink-0 text-[13px] font-bold text-text">
              {utkGuru ? 'Status Jurnal Kelas Saya' : 'Ringkasan Jurnal'}
            </span>
            <ChevronDown
              size={14}
              className={`shrink-0 text-text-faint transition-transform duration-200 ${buka ? 'rotate-180' : ''}`}
            />
          </button>
          {onGantiBulan && <PemilihBulanTahun bulan={bulan} tahun={tahun} onUbah={onGantiBulan} />}
        </div>
        {headline && (
          <div
            className="mt-1 flex items-center gap-1.5 text-[11.5px] font-semibold"
            style={{ color: headlineWarna }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: headlineWarna }} />
            {headline}
          </div>
        )}
        <div className="mt-1 text-[11px] text-text-dim">
          {ringkas.kelasTerjurnal}/{ringkas.totalKelas} kelas ada jurnal ngaji
        </div>
      </div>

      {/* 5 tile ringkasan -- struktur seragam (angka / slot-pill tinggi
          tetap / label 2-baris) supaya label semua tile sebaris. */}
      <div className="mt-3 grid grid-cols-5 gap-2">
        {/* Tile gradient */}
        <div
          className="flex flex-col items-center rounded-[10px] px-1 pt-2.5 pb-2 shadow-[0_4px_14px_rgba(13,148,136,0.26),inset_0_1px_0_rgba(255,255,255,0.14)]"
          style={{ background: 'linear-gradient(155deg,#0F766E 0%,#0D9488 60%,#14B8A6 100%)' }}
        >
          <span className="text-[18px] leading-none font-extrabold text-white tabular-nums">
            {ringkas.kelasTerjurnal}
          </span>
          <span className="h-[16px]" />
          <span className="flex min-h-[24px] items-center text-center text-[10px] leading-[1.15] font-bold tracking-[0.02em] text-white/85 uppercase">
            Kelas Terjurnal
          </span>
        </div>
        {(
          [
            { n: ringkas.direncana, label: 'Direncana', c: 'var(--text-dim)', pill: false },
            { n: ringkas.disampaikan, label: 'Disampaikan', c: 'var(--sage)', pill: true },
            { n: ringkas.belum, label: 'Belum', c: 'var(--brass)', pill: true },
            { n: ringkas.tidakTersampaikan, label: 'Tdk Sampai', c: 'var(--red)', pill: true },
          ] as const
        ).map((t) => {
          const persen =
            t.pill && ringkas.direncana > 0 ? Math.round((t.n / ringkas.direncana) * 100) : null;
          return (
            <div
              key={t.label}
              className="flex flex-col items-center rounded-[10px] bg-panel-2 px-1 pt-2.5 pb-2"
            >
              <span
                className="text-[18px] leading-none font-extrabold tabular-nums"
                style={{ color: t.c }}
              >
                {t.n}
              </span>
              <span className="flex h-[16px] items-center">
                {persen !== null && (
                  <span
                    className="rounded-full px-[7px] py-0.5 text-[10px] leading-none font-bold tabular-nums"
                    style={{ background: `${t.c}1F`, color: t.c }}
                  >
                    {persen}%
                  </span>
                )}
              </span>
              <span className="flex min-h-[24px] items-center text-center text-[10px] leading-[1.15] font-bold tracking-[0.02em] text-text-dim uppercase">
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

          {pola.length > 0 && (
            <div className="rounded-[var(--radius-lg)] border border-[#FDE68A] bg-[#FFFBEB] p-3 text-[11.5px] leading-snug text-[#92400E]">
              <div className="mb-1 flex items-center gap-1.5 font-bold">
                <AlertTriangle size={13} />
                Pola terdeteksi — mungkin bukan masalah per-kelas
              </div>
              {pola.map((p, i) => (
                <div key={i} className="mt-1">
                  <span className="font-semibold">{p.jumlahKelas} kelas</span> menyebut alasan mirip:
                  “{p.contoh}” <span className="text-[#B45309]">({p.kelas.join(', ')})</span>
                </div>
              ))}
              <div className="mt-1.5 text-[10.5px] text-[#B45309]">
                Pertimbangkan tinjau penempatan/leveling kelas, atau bahas bersama para guru.
              </div>
            </div>
          )}

          {!utkGuru && perluTindak > 0 && (
            <button
              type="button"
              disabled={mengirimSemua}
              onClick={kirimSemua}
              className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-brass bg-brass px-4 py-2.5 text-[12.5px] font-bold text-white disabled:opacity-50"
            >
              <Send size={13} />
              {mengirimSemua
                ? 'Mengirim…'
                : `Kirim pengingat ke semua yang perlu (${perluTindak})`}
            </button>
          )}

          {list.map((k) => {
            const s = SEHAT[k.kesehatan];
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
                    {!utkGuru && `${k.guruNama} · `}
                    {k.santriCount} santri ·{' '}
                    {k.kelasBaru
                      ? 'kelas baru'
                      : k.disentuhTerakhir
                        ? `jurnal disentuh ${k.hariSejakDisentuh ?? 0} hari lalu`
                        : 'belum ada jurnal bulan ini'}
                  </div>
                </button>

                {/* Ringkas: materi ngaji disampaikan/direncana + klasikal */}
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-md bg-panel px-2 py-1 text-text-dim">
                    Ngaji {k.disampaikan}/{k.direncana}
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
                </div>

                {k.kemungkinanPenyebab.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 rounded-md bg-panel px-2.5 py-1.5 text-[11px] leading-snug text-text-dim">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-brass" />
                    <span>Kemungkinan penyebab: {k.kemungkinanPenyebab.join(' · ')}</span>
                  </div>
                )}

                {kelasTerbuka === k.kelasId && (
                  <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
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

                {/* Aksi: Kirim Pengingat + jejak (admin saja) */}
                {!utkGuru && k.kesehatan !== 'sehat' && (
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
