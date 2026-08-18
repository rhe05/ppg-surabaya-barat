'use client';

/* Santri Teladan + sebaran nilai — padanan serverGetSantriTeladan dan
   serverGetMunaqosahStats (Modul_MaintainMunaqosah.gs:287-410).

   Beda dari daftar penilaian di halaman induk: bagian ini melihat SATU
   PERIODE untuk SELURUH kelompok yang boleh dilihat pengguna, bukan satu
   kelompok saja. Itulah gunanya — Santri Teladan adalah pengakuan tingkat
   PPG, dan membandingkannya hanya di dalam satu kelompok menghilangkan
   maknanya.

   RLS yang menentukan batas "seluruh kelompok": admin_ppg melihat semua,
   admin_desa sebatas desanya, admin_kelompok hanya kelompoknya sendiri.
   Tidak ada satu pun pemeriksaan peran di komponen ini.

   Sebaran nilai ditampilkan sebagai deretan angka per rentang, bukan
   histogram: rentangnya cuma lima dan setiap batang akan lebih banyak
   memakan ruang daripada memberi bacaan. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const AMBANG_TELADAN = 90;

/* Rentang nilai mengikuti kebiasaan penilaian: 90 ke atas teladan, lalu
   turun per 10. Di bawah 70 digabung karena jarang dan tidak perlu
   dipecah lebih halus untuk keperluan pemantauan. */
const RENTANG = [
  { label: '90–100', min: 90, max: 100.01, warna: 'text-sage' },
  { label: '80–89', min: 80, max: 90, warna: 'text-sage' },
  { label: '70–79', min: 70, max: 80, warna: 'text-brass' },
  { label: '< 70', min: -1, max: 70, warna: 'text-red' },
];

type Baris = {
  nilai: number | null;
  santri: { nama: string; kelompok_id: number } | { nama: string; kelompok_id: number }[] | null;
};

type Kelompok = { id: number; nama: string };

function satu<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function SantriTeladan({ periodeId }: { periodeId: number }) {
  const [baris, setBaris] = useState<Baris[]>([]);
  const [kelompok, setKelompok] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: dNilai, error: e1 }, { data: dKel }] = await Promise.all([
        supabase
          .from('munaqosah')
          .select('nilai, santri!inner(nama, kelompok_id)')
          .eq('periode_id', periodeId)
          .is('deleted_at', null)
          .order('nilai', { ascending: false }),
        supabase.from('kelompok').select('id, nama'),
      ]);
      if (e1) throw new Error(e1.message);
      setBaris((dNilai ?? []) as unknown as Baris[]);
      setKelompok(new Map(((dKel ?? []) as Kelompok[]).map((k) => [k.id, k.nama])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat santri teladan.');
    } finally {
      setLoading(false);
    }
  }, [periodeId]);

  useEffect(() => {
    muat();
  }, [muat]);

  if (loading) return <p className="text-[13px] text-text-dim">Memuat...</p>;
  if (error) return <p className="text-[13px] text-red">{error}</p>;
  if (baris.length === 0) return null;

  const bernilai = baris.filter((b) => b.nilai != null);
  const teladan = bernilai.filter((b) => Number(b.nilai) >= AMBANG_TELADAN);

  return (
    <div className="mb-6 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
      <div className="mb-1 text-[15px] font-bold text-text">
        Santri Teladan &middot; {teladan.length} orang
      </div>
      <p className="mb-4 text-[11px] text-text-faint">
        Nilai {AMBANG_TELADAN} ke atas, dari seluruh kelompok yang boleh Anda lihat pada periode
        ini — bukan hanya kelompok yang sedang dipilih di atas.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {RENTANG.map((r) => {
          const n = bernilai.filter(
            (b) => Number(b.nilai) >= r.min && Number(b.nilai) < r.max
          ).length;
          return (
            <div
              key={r.label}
              className="rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2"
            >
              <div className={'text-[18px] font-bold ' + r.warna}>{n}</div>
              <div className="text-[11px] text-text-dim">{r.label}</div>
            </div>
          );
        })}
      </div>

      {teladan.length === 0 ? (
        <p className="text-[13px] text-text-dim">
          Belum ada santri yang mencapai nilai {AMBANG_TELADAN} pada periode ini.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="border-b border-border">
            <tr>
              {['#', 'Nama', 'Kelompok', 'Nilai'].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold text-text-dim uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teladan.slice(0, 20).map((b, i) => {
              const s = satu(b.santri);
              return (
                <tr key={i} className="hover:bg-panel-2">
                  <td className="border-b border-border px-2 py-2 text-text-dim">{i + 1}</td>
                  <td className="border-b border-border px-2 py-2 text-text">{s?.nama ?? '-'}</td>
                  <td className="border-b border-border px-2 py-2 text-text-dim">
                    {s ? (kelompok.get(s.kelompok_id) ?? '-') : '-'}
                  </td>
                  <td className="border-b border-border px-2 py-2 font-bold text-text">{b.nilai}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {teladan.length > 20 && (
        <p className="mt-2 text-[11px] text-text-faint">
          Menampilkan 20 teratas dari {teladan.length}.
        </p>
      )}
    </div>
  );
}
