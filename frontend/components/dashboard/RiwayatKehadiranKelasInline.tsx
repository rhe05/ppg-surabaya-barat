'use client';

/* Riwayat kehadiran satu KELAS (matrix santri × tanggal kerja 1 bulan),
   dipakai INLINE di dalam kartu "Ringkasan Kehadiran" AdminKelpDashboard
   -- diminta owner 2026-08-27: admin klik kartu kelas/guru di rincian
   Ringkasan Kehadiran → riwayat kehadiran kelas itu terbuka di bawahnya,
   klik lagi → tertutup.

   READ-ONLY (beda dari app/absensi/riwayat/page.tsx yang tiap selnya bisa
   diedit) -- admin punya alat koreksi tersendiri (/kelola-absensi), di
   sini cukup untuk melihat. Palet badge & kolom merah libur meniru
   app/absensi/riwayat/page.tsx supaya konsisten dgn tampilan guru. */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LIBUR_NASIONAL_2026 } from '@/lib/liburNasional';
import { muatOverrideKelompok, type OverrideKelompok } from '@/lib/kalenderKelompok';

type Status = 'hadir' | 'izin' | 'sakit' | 'alpa';

const BADGE: Record<Status, { huruf: string; warna: string; label: string }> = {
  hadir: { huruf: 'H', warna: '#15803d', label: 'Hadir' },
  izin: { huruf: 'I', warna: '#a16207', label: 'Izin' },
  sakit: { huruf: 'S', warna: '#a16207', label: 'Sakit' },
  alpa: { huruf: 'A', warna: '#dc2626', label: 'Alpa' },
};

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function tanggalKerjaBulan(tahun: number, bulan: number): string[] {
  const jumlahHari = new Date(tahun, bulan, 0).getDate();
  const dua = (n: number) => String(n).padStart(2, '0');
  const hasil: string[] = [];
  for (let d = 1; d <= jumlahHari; d++) {
    const dow = new Date(tahun, bulan - 1, d).getDay();
    if (dow !== 0 && dow !== 6) hasil.push(`${tahun}-${dua(bulan)}-${dua(d)}`);
  }
  return hasil;
}

export default function RiwayatKehadiranKelasInline({
  kelasId,
  kelompokId,
  tahun,
  bulan,
}: {
  kelasId: number;
  kelompokId: number;
  tahun: number;
  bulan: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [baris, setBaris] = useState<{ id: number; nama: string; sel: Record<string, Status> }[]>([]);
  const [override, setOverride] = useState<Map<string, OverrideKelompok>>(new Map());

  useEffect(() => {
    let batal = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const dua = (n: number) => String(n).padStart(2, '0');
        const awal = `${tahun}-${dua(bulan)}-01`;
        const akhirTanggal = new Date(tahun, bulan, 0).getDate();
        const akhir = `${tahun}-${dua(bulan)}-${dua(akhirTanggal)}`;

        /* Santri yang pindah/nonaktif SETELAH bulan ini dimulai tetap ikut
           -- deleted_at = "sejak kapan tidak aktif" (migrasi 20260821130000). */
        const { data: dataSantri, error: errSantri } = await supabase
          .from('santri')
          .select('id, nama, nama_panggilan')
          .eq('kelas_id', kelasId)
          .or(`deleted_at.is.null,deleted_at.gt.${awal}`);
        if (errSantri) throw new Error(errSantri.message);

        const santriList = (dataSantri ?? []).slice().sort((a, b) => {
          const na = (a.nama_panggilan || a.nama).trim();
          const nb = (b.nama_panggilan || b.nama).trim();
          return na.localeCompare(nb, 'id');
        });
        const santriIds = santriList.map((s) => s.id);

        const selMap: Record<number, Record<string, Status>> = {};
        if (santriIds.length > 0) {
          const UKURAN_HALAMAN = 1000;
          for (let dari = 0; ; dari += UKURAN_HALAMAN) {
            const { data, error: errAbsensi } = await supabase
              .from('absensi')
              .select('santri_id, tanggal, status')
              .in('santri_id', santriIds)
              .gte('tanggal', awal)
              .lte('tanggal', akhir)
              .is('deleted_at', null)
              .order('id', { ascending: true })
              .range(dari, dari + UKURAN_HALAMAN - 1);
            if (errAbsensi) throw new Error(errAbsensi.message);
            const batch = data ?? [];
            batch.forEach((b) => {
              (selMap[b.santri_id] ??= {})[b.tanggal] = b.status as Status;
            });
            if (batch.length < UKURAN_HALAMAN) break;
          }
        }

        const ovr = await muatOverrideKelompok(kelompokId);
        if (batal) return;
        setOverride(ovr);
        setBaris(
          santriList.map((s) => ({
            id: s.id,
            nama: (s.nama_panggilan || s.nama).trim(),
            sel: selMap[s.id] ?? {},
          })),
        );
      } catch (e) {
        if (!batal) setError(e instanceof Error ? e.message : 'Gagal memuat riwayat.');
      } finally {
        if (!batal) setLoading(false);
      }
    })();
    return () => {
      batal = true;
    };
  }, [kelasId, kelompokId, tahun, bulan]);

  const tanggalList = tanggalKerjaBulan(tahun, bulan);

  if (loading) return <p className="mt-3 text-[12px] text-text-dim">Memuat riwayat…</p>;
  if (error) return <p className="mt-3 text-[12px] text-red">{error}</p>;
  if (baris.length === 0)
    return <p className="mt-3 text-[12px] text-text-dim">Belum ada santri di kelas ini.</p>;

  return (
    <div className="mt-3 max-h-[60vh] overflow-auto rounded-[var(--radius)] border border-border bg-panel">
      <table className="border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-[4] min-w-[80px] border-r border-b border-border bg-panel-2 px-2 py-1.5 text-center text-[10.5px] font-bold text-text">
              Santri
            </th>
            {tanggalList.map((tgl) => {
              const d = new Date(tgl + 'T00:00:00');
              const namaLibur = LIBUR_NASIONAL_2026[tgl];
              const ov = override.get(tgl);
              const liburKelompok = ov?.jenis === 'libur' ? ov.catatan || 'Libur' : null;
              const merah = !!namaLibur || !!liburKelompok;
              return (
                <th
                  key={tgl}
                  title={namaLibur || liburKelompok || undefined}
                  className={`sticky top-0 z-[3] min-w-[38px] border-r border-b border-border px-1.5 py-1.5 text-center text-[10.5px] font-bold ${
                    merah ? 'bg-[#FEF2F2] text-red' : 'bg-panel-2 text-text'
                  }`}
                >
                  {d.getDate()}
                  <span
                    className={`mt-0.5 block text-[8.5px] font-semibold ${merah ? 'text-red' : 'text-text-dim'}`}
                  >
                    {liburKelompok ? 'Libur' : HARI_PENDEK[d.getDay()]}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {baris.map((r, idx) => (
            <tr key={r.id} className={idx % 2 === 1 ? 'bg-panel-2/40' : undefined}>
              <td className="sticky left-0 z-[1] min-w-[80px] border-r border-border bg-panel px-2 py-1.5 text-left text-[12px] font-semibold text-text">
                {r.nama}
              </td>
              {tanggalList.map((tgl) => {
                /* Tanggal libur -> selalu kosong. Baris absensinya sudah
                   di-soft-delete oleh bersihkanAbsensiTanggalLibur saat
                   Ringkasan Kehadiran dimuat; guard ini menjaga kalau
                   pemuatannya balapan. */
                const libur = override.get(tgl)?.jenis === 'libur';
                const st = libur ? undefined : r.sel[tgl];
                return (
                  <td key={tgl} className="border-r border-border px-1.5 py-1.5 text-center">
                    <span
                      title={libur ? 'Libur' : st ? BADGE[st].label : 'Belum diisi'}
                      className="inline-flex h-[20px] w-5 items-center justify-center rounded-[5px] text-[10.5px] font-extrabold"
                      style={
                        st
                          ? { background: BADGE[st].warna, color: '#fff' }
                          : { color: 'var(--text-faint)' }
                      }
                    >
                      {st ? BADGE[st].huruf : '—'}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
