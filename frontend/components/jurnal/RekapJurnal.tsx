'use client';

/* Rekap jurnal sebulan — padanan serverGetJurnalListKelompok
   (Modul_Jurnal.gs:212). Grid kelas × tanggal: tanda centang berarti
   jurnalnya sudah diisi hari itu.

   Gunanya bukan membaca isi jurnal (itu ada di panel riwayat), melainkan
   melihat SIAPA YANG BELUM mengisi. Karena itu bentuknya matriks kehadiran
   pengisian, bukan daftar — daftar 8 kelas × 22 hari akan jadi 176 baris
   yang tidak bisa dibaca sekilas.

   Hanya hari kerja yang ditampilkan, sama seperti matriks kehadiran
   santri: akhir pekan tidak pernah ada KBM. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Kelas = { id: number; nama: string };
type Jurnal = { kelas_id: number; tanggal: string };

export default function RekapJurnal({
  kelompokId,
  tahun,
  bulan,
}: {
  kelompokId: number;
  tahun: number;
  bulan: number;
}) {
  const [kelas, setKelas] = useState<Kelas[]>([]);
  const [jurnal, setJurnal] = useState<Jurnal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tanggalKerja = useMemo(() => {
    const akhir = new Date(tahun, bulan, 0).getDate();
    const daftar: string[] = [];
    for (let d = 1; d <= akhir; d++) {
      const hari = new Date(tahun, bulan - 1, d).getDay();
      if (hari !== 0 && hari !== 6)
        daftar.push(`${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return daftar;
  }, [tahun, bulan]);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const awal = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
      const akhirHari = new Date(tahun, bulan, 0).getDate();
      const akhir = `${tahun}-${String(bulan).padStart(2, '0')}-${String(akhirHari).padStart(2, '0')}`;

      const [{ data: dKelas }, { data: dJurnal, error: e1 }] = await Promise.all([
        supabase
          .from('kelas')
          .select('id, nama')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null)
          .order('nama'),
        supabase
          .from('jurnal_kbm')
          .select('kelas_id, tanggal')
          .eq('kelompok_id', kelompokId)
          .gte('tanggal', awal)
          .lte('tanggal', akhir)
          .is('deleted_at', null),
      ]);
      if (e1) throw new Error(e1.message);
      setKelas((dKelas ?? []) as unknown as Kelas[]);
      setJurnal((dJurnal ?? []) as unknown as Jurnal[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat rekap jurnal.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, bulan]);

  useEffect(() => {
    muat();
  }, [muat]);

  const terisi = useMemo(
    () => new Set(jurnal.map((j) => `${j.kelas_id}|${j.tanggal}`)),
    [jurnal]
  );

  if (loading) return <p className="text-[13px] text-text-dim">Memuat rekap...</p>;
  if (error) return <p className="text-[13px] text-red">{error}</p>;
  if (kelas.length === 0)
    return (
      <p className="text-[13px] text-text-dim">
        Kelompok ini belum punya kelas, jadi belum ada yang bisa direkap.
      </p>
    );

  return (
    <div>
      <div className="mb-1 text-[15px] font-bold text-text">Rekap Pengisian Jurnal</div>
      <p className="mb-4 text-[11px] text-text-faint">
        Centang berarti jurnal hari itu sudah diisi. Hanya hari kerja yang ditampilkan.
      </p>

      <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
        <table className="border-collapse text-left text-[11px]">
          <thead className="border-b border-border bg-panel-2">
            <tr>
              <th className="sticky left-0 z-10 min-w-[150px] bg-panel-2 px-3 py-2 font-semibold text-text-dim uppercase">
                Kelas
              </th>
              {tanggalKerja.map((t) => (
                <th key={t} className="px-1.5 py-2 text-center font-semibold text-text-dim">
                  {t.slice(8)}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-semibold text-text-dim uppercase">Terisi</th>
            </tr>
          </thead>
          <tbody>
            {kelas.map((k) => {
              const jumlah = tanggalKerja.filter((t) => terisi.has(`${k.id}|${t}`)).length;
              return (
                <tr key={k.id} className="hover:bg-panel-2">
                  <td className="sticky left-0 z-10 border-b border-border bg-panel px-3 py-1.5 text-text">
                    {k.nama}
                  </td>
                  {tanggalKerja.map((t) => {
                    const ada = terisi.has(`${k.id}|${t}`);
                    return (
                      <td
                        key={t}
                        className={
                          'border-b border-border px-1.5 py-1.5 text-center font-bold ' +
                          (ada ? 'text-sage' : 'text-text-faint')
                        }
                        title={`${k.nama} · ${t} · ${ada ? 'terisi' : 'belum diisi'}`}
                      >
                        {ada ? '✓' : '·'}
                      </td>
                    );
                  })}
                  <td className="border-b border-border px-2 py-1.5 text-center font-semibold text-text">
                    {jumlah}/{tanggalKerja.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
