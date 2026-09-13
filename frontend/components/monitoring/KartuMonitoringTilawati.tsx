'use client';

/* Kartu "Tilawati" / "Al-Qur'an" di Monitoring Pencapaian Materi --
   DIPISAH dari PencapaianMateriView.tsx (2026-09-13, diminta owner),
   pola SAMA PERSIS KartuTilawatiAlquran.tsx (Pelaksanaan) &
   KartuRiwayatTilawati.tsx (Riwayat): kelas GABUNGAN (Gabung Kelas
   "tanpa batas waktu") bisa lintas-grade (mis. kelas 3 + Pra Remaja
   SMP) -- santri kelas <=3 masuk kartu Tilawati (target dari pedoman
   statis), kelas 4+ masuk kartu Al-Qur'an (target dari Kurikulum),
   keduanya bisa tampil sekaligus. Dulu SATU kartu dgn `pakaiAlquran` +
   `kodeKelasTilawati` polos dari grade tertinggi gabungan (salah utk
   anggota grade rendah, DAN target-nya jadi target kelas yang salah).

   Isi: "Peraga Tilawati" (pengulangan khatam per jilid, HANYA Tilawati)
   + kotak Target bulan + daftar per santri (Naik/Tetap/Hal + rubrik
   BB/MB/BSH/BSB) + Keterangan rubrik. Baca-saja -- tidak ada tulis. */

import { useEffect, useMemo, useState } from 'react';
import Skeleton from '@/components/ui/Skeleton';
import { muatBukuJilidKelas, labelBukuJilid, type BukuJilidSantri } from '@/lib/tilawati';
import { muatMateriBulan, type MateriJurnal } from '@/lib/dataGuru';
import {
  targetTilawatiPeriode,
  labelTargetPeriode,
  posisiTilawati,
  statusPencapaianTilawati,
  LABEL_STATUS_PENCAPAIAN,
  type StatusPencapaian,
} from '@/lib/pedomanTilawati';
import {
  targetAlquranPeriode,
  posisiJuzTerakhir,
  statusPencapaianAlquran,
  type TargetAlquranPeriode,
} from '@/lib/targetAlquranKurikulum';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
function tanggalPendek(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
/* Halaman terakhir Peraga Tilawati = batas "Halaman Peraga Tilawati"
   (1-20) di borang Rencana Pembelajaran -- kembar PERSIS konstanta yg
   sama di PencapaianMateriView.tsx (induk), disalin krn kartu ini
   dipisah jadi berkas sendiri. */
const PERAGA_HAL_AKHIR = 20;

export default function KartuMonitoringTilawati({
  judul,
  pakaiAlquran,
  anggotaIds,
  kodeKelas,
  bulan,
  tahun,
  awal,
  akhir,
}: {
  judul: string;
  pakaiAlquran: boolean;
  anggotaIds: number[];
  /* Kode grade Kurikulum ('1'..'12'/'PAUD-TK') dari anggota TERTINGGI di
     bucket ini -- dasar lookup target (lib/kelasKurikulum.ts
     `pisahTilawatiAlquran`). */
  kodeKelas: string;
  bulan: number;
  tahun: number;
  awal: string;
  akhir: string;
}) {
  const anggotaKey = anggotaIds.join(',');

  const [tilawatiRingkas, setTilawatiRingkas] = useState<BukuJilidSantri[]>([]);
  const [loadingTilawati, setLoadingTilawati] = useState(false);
  const [errorTilawati, setErrorTilawati] = useState<string | null>(null);
  useEffect(() => {
    if (anggotaIds.length === 0) {
      setTilawatiRingkas([]);
      return;
    }
    let batal = false;
    setLoadingTilawati(true);
    setErrorTilawati(null);
    muatBukuJilidKelas(anggotaIds, awal, akhir)
      .then((d) => {
        if (!batal) setTilawatiRingkas(d);
      })
      .catch((e) => {
        if (!batal) setErrorTilawati(e instanceof Error ? e.message : 'Gagal memuat data.');
      })
      .finally(() => {
        if (!batal) setLoadingTilawati(false);
      });
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anggotaKey, awal, akhir]);

  const [peragaMateri, setPeragaMateri] = useState<MateriJurnal[]>([]);
  const [loadingPeraga, setLoadingPeraga] = useState(false);
  useEffect(() => {
    if (pakaiAlquran || anggotaIds.length === 0) {
      setPeragaMateri([]);
      return;
    }
    let batal = false;
    setLoadingPeraga(true);
    muatMateriBulan(anggotaIds, tahun, bulan)
      .then((d) => {
        if (batal) return;
        setPeragaMateri(
          d.filter(
            (m) =>
              m.jenis !== 'klasikal' &&
              (/peraga tilawati/i.test(m.judul) || /^baca huruf al-?qur/i.test(m.judul.trim())),
          ),
        );
      })
      .finally(() => {
        if (!batal) setLoadingPeraga(false);
      });
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anggotaKey, tahun, bulan, pakaiAlquran]);

  const peragaTampil = useMemo(() => {
    const peta = new Map<string, { jilid: string; khatam: number; terakhir: string; urut: number }>();
    for (const m of peragaMateri) {
      if (m.status !== 'disampaikan') continue;
      const mj = m.judul.match(/Jilid\s+(\d+)/i);
      const jilid = mj ? mj[1] : /paud/i.test(m.judul) ? 'Paud' : '—';
      let maxHal = 0;
      for (const h of m.judul.matchAll(/hal\s+(\d+)(?:\s*[–-]\s*(\d+))?/gi)) {
        maxHal = Math.max(maxHal, Number(h[1]), h[2] ? Number(h[2]) : 0);
      }
      const tgl = m.tanggal_disampaikan ?? '';
      const cur =
        peta.get(jilid) ??
        { jilid, khatam: 0, terakhir: '', urut: mj ? Number(mj[1]) : jilid === 'Paud' ? 0 : 99 };
      if (maxHal >= PERAGA_HAL_AKHIR) cur.khatam += 1;
      if (tgl > cur.terakhir) cur.terakhir = tgl;
      peta.set(jilid, cur);
    }
    return [...peta.values()].sort((a, b) => a.urut - b.urut);
  }, [peragaMateri]);

  const targetTilawati = useMemo(
    () => (pakaiAlquran ? null : targetTilawatiPeriode(kodeKelas, bulan)),
    [pakaiAlquran, kodeKelas, bulan],
  );
  const [targetAlquran, setTargetAlquran] = useState<TargetAlquranPeriode | null>(null);
  useEffect(() => {
    if (!pakaiAlquran || kodeKelas === '') {
      setTargetAlquran(null);
      return;
    }
    let batal = false;
    targetAlquranPeriode(kodeKelas, tahun, bulan)
      .then((t) => {
        if (!batal) setTargetAlquran(t);
      })
      .catch(() => {
        if (!batal) setTargetAlquran(null);
      });
    return () => {
      batal = true;
    };
  }, [pakaiAlquran, kodeKelas, tahun, bulan]);

  return (
    <>
      <div className="label-mikro mb-2">{judul}</div>

      {!pakaiAlquran && (
        <>
          <div className="mb-1.5 text-[12px] font-semibold text-text-dim">Peraga Tilawati</div>
          {loadingPeraga && <Skeleton className="mb-5 h-[52px] w-full" />}
          {!loadingPeraga && (
            <div className="kartu-premium mb-5 overflow-hidden">
              {peragaTampil.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-text-dim">
                  Belum ada Peraga Tilawati yang disampaikan pada periode ini.
                </p>
              ) : (
                peragaTampil.map((b) => (
                  <div key={b.jilid} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                    <span className="min-w-0 truncate text-[13px] font-semibold text-text">
                      Peraga Tilawati {b.jilid === 'Paud' ? 'Paud' : `Jilid ${b.jilid}`}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      {b.khatam > 0 ? (
                        <span className="angka-metrik text-[15px] text-sage">{b.khatam}×</span>
                      ) : (
                        <span className="text-[11px] whitespace-nowrap text-text-faint">sedang berjalan</span>
                      )}
                      {b.terakhir && (
                        <span className="text-[11px] whitespace-nowrap text-text-faint">
                          terakhir {tanggalPendek(b.terakhir)}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {!pakaiAlquran && <div className="mb-1.5 text-[12px] font-semibold text-text-dim">Buku Jilid Tilawati</div>}
      {targetTilawati && (
        <div className="mb-2 rounded-[var(--radius)] bg-indigo-lembut px-3 py-2 text-[12px] font-semibold text-indigo">
          Target {NAMA_BULAN[bulan - 1]}: {labelTargetPeriode(targetTilawati)}
        </div>
      )}
      {targetAlquran && (
        <div className="mb-2 rounded-[var(--radius)] bg-indigo-lembut px-3 py-2 text-[12px] font-semibold text-indigo">
          Target {NAMA_BULAN[bulan - 1]}: {[targetAlquran.juz, targetAlquran.target].filter(Boolean).join(' · ')}
        </div>
      )}
      {loadingTilawati && <Skeleton className="mb-5 h-[52px] w-full" />}
      {errorTilawati && <p className="mb-5 text-[13px] text-red">{errorTilawati}</p>}
      {!loadingTilawati && !errorTilawati && (
        <div className="kartu-premium mb-5 overflow-hidden">
          {tilawatiRingkas.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-text-dim">Belum ada santri di kelas ini.</p>
          ) : (
            tilawatiRingkas.map((s) => {
              const posisi =
                s.terakhirJilid || s.terakhirHalaman
                  ? [
                      s.terakhirJilid ? (/paud/i.test(s.terakhirJilid) ? 'Paud' : labelBukuJilid(s.terakhirJilid)) : null,
                      s.terakhirHalaman ? `Hal ${s.terakhirHalaman}` : null,
                      s.terakhirSurat,
                      s.terakhirAyat ? `Ayat ${s.terakhirAyat}` : null,
                    ]
                      .filter(Boolean)
                      .join(' ')
                  : null;
              const sPos = posisiTilawati(s.terakhirJilid, s.terakhirHalaman);
              const status: StatusPencapaian | null = !s.adaCatatan
                ? null
                : pakaiAlquran
                  ? statusPencapaianAlquran(
                      posisiJuzTerakhir(s.terakhirJilid),
                      targetAlquran?.juz ?? null,
                      targetAlquran?.juzSemesterLalu ?? null,
                    )
                  : statusPencapaianTilawati(kodeKelas, bulan, sPos);
              return (
                <div key={s.santriId} className="flex items-start justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-text">{s.nama}</span>
                    <span className="block text-[11px] text-text-faint">
                      {s.adaCatatan ? (posisi ?? '—') : 'Belum ada catatan bulan ini'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {s.adaCatatan && (
                      <>
                        {s.naik > 0 && (
                          <span className="rounded-full bg-sage-lembut px-2.5 py-1 text-[11px] font-bold text-sage">
                            {s.naik}× Naik
                          </span>
                        )}
                        {s.tetap > 0 && (
                          <span className="rounded-full bg-brass-lembut px-2.5 py-1 text-[11px] font-bold text-brass">
                            {s.tetap}× Tetap
                          </span>
                        )}
                        <span className="rounded-full bg-indigo-lembut px-2.5 py-1 text-[11px] font-bold text-indigo">
                          {s.halProgres} Hal
                        </span>
                      </>
                    )}
                    {status && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          status === 'BB'
                            ? 'bg-red-lembut text-red'
                            : status === 'MB'
                              ? 'bg-brass-lembut text-brass'
                              : status === 'BSH'
                                ? 'bg-sage-lembut text-sage'
                                : 'bg-indigo-lembut text-indigo'
                        }`}
                        title={LABEL_STATUS_PENCAPAIAN[status].panjang}
                      >
                        {status}
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
      {(targetTilawati || targetAlquran) && !loadingTilawati && !errorTilawati && (
        <div className="mb-5 rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2.5">
          <div className="label-mikro mb-1.5">Keterangan</div>
          <ul className="space-y-0.5 text-[11px] leading-snug text-text-dim">
            {(['BB', 'MB', 'BSH', 'BSB'] as StatusPencapaian[]).map((k) => (
              <li key={k}>
                <span className="font-bold text-text">{LABEL_STATUS_PENCAPAIAN[k].singkat}</span>{' '}
                : {LABEL_STATUS_PENCAPAIAN[k].panjang} ({LABEL_STATUS_PENCAPAIAN[k].arti})
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
