'use client';

/* Kartu "Pengulangan Materi Klasikal" di Riwayat Pembelajaran -- sisi
   PER KELAS dari fitur Pengulangan (disepakati owner 2026-09-02; sisi
   PER SANTRI ada di Monitoring > Pencapaian Materi, lihat
   components/monitoring/PencapaianMateriView.tsx & percakapan yang
   menyertainya utk alasan pemisahannya).

   SENGAJA punya penyaring periode SENDIRI (Bulan/Semester/Tahun Ajaran),
   terpisah dari filter Bulan/Tahun matriks kehadiran di atasnya -- guru
   ingin tahu "sudah berapa kali" biasanya utk rentang yang LEBIH LEBAR
   drpd satu bulan (semester/tahun ajaran), sedangkan matriks di atas
   memang soal satu bulan. Menyatukan keduanya jadi satu filter akan
   memaksa salah satu kebutuhan mengalah.

   Murni informasi -- TIDAK ADA ambang tercapai/belum tercapai (diminta
   owner eksplisit: fitur ini sekadar pemberitahuan jumlah, bukan
   penilaian). */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { muatPengulanganKelas, type PengulanganKelas } from '@/lib/dataGuru';
import { rentangPeriode, type KunciPeriode } from '@/lib/periodeAkademik';
import PenyaringPeriode from './PenyaringPeriode';

function tanggalPendek(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function KartuPengulanganKelas({ kelasId }: { kelasId: number }) {
  const [kunci, setKunci] = useState<KunciPeriode>('bulan');
  /* Acuan "sekarang" DIHITUNG SEKALI saat kartu dipasang -- kartu ini
     selalu berarti "periode berjalan" (Bulan/Semester/Tahun Ajaran INI),
     tidak ikut menyusuri bulan lampau spt matriks di atasnya. Kalau
     nanti dibutuhkan menengok periode lampau, itu perluasan terpisah. */
  const [acuan] = useState(() => {
    const d = new Date();
    return { tahun: d.getFullYear(), bulan: d.getMonth() + 1 };
  });
  const periode = useMemo(
    () => rentangPeriode(kunci, acuan.tahun, acuan.bulan),
    [kunci, acuan]
  );

  const [baris, setBaris] = useState<PengulanganKelas[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let batal = false;
    setLoading(true);
    setError(null);
    muatPengulanganKelas(kelasId, periode.awal, periode.akhir)
      .then((d) => {
        if (!batal) setBaris(d);
      })
      .catch((e) => {
        if (!batal) setError(e instanceof Error ? e.message : 'Gagal memuat pengulangan.');
      })
      .finally(() => {
        if (!batal) setLoading(false);
      });
    return () => {
      batal = true;
    };
  }, [kelasId, periode.awal, periode.akhir]);

  return (
    <div className="kartu-premium mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-4 py-3">
        <div>
          <div className="text-[15px] font-bold text-text">Pengulangan Materi Klasikal</div>
          <div className="text-[12px] text-text-dim">{periode.label}</div>
        </div>
        <PenyaringPeriode kunci={kunci} onUbah={setKunci} />
      </div>

      {loading && <p className="px-4 py-3 text-[13px] text-text-dim">Memuat...</p>}
      {error && <p className="px-4 py-3 text-[13px] text-red">{error}</p>}
      {!loading && !error && baris.length === 0 && (
        <p className="px-4 py-3 text-[13px] text-text-dim">
          Belum ada materi Klasikal yang disampaikan pada periode ini.
        </p>
      )}
      {!loading &&
        !error &&
        baris.map((b) => (
          <div
            key={b.nama_surat}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 truncate text-[13px] font-semibold text-text">{b.nama_surat}</span>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span className="angka-metrik text-[15px] text-sage">{b.jumlah}×</span>
              <span className="text-[11px] whitespace-nowrap text-text-faint">
                terakhir {tanggalPendek(b.terakhir)}
              </span>
            </span>
          </div>
        ))}

      {/* SATU-SATUNYA jalan guru menuju sisi per-santri ("satu jalan saja
          per tujuan" -- tidak ada tab bawah baru, tidak ada tautan kedua
          di menu lain). */}
      <Link
        href="/monitoring"
        className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 text-[13px] font-semibold text-indigo transition-colors duration-150 active:opacity-70"
      >
        Lihat pengulangan per santri
        <ChevronRight size={16} strokeWidth={2.4} />
      </Link>
    </div>
  );
}
