'use client';

/* Kelola Absensi — padanan Modul_MaintainAbsensi.gs (layar admin untuk
   MEMPERBAIKI catatan absensi yang sudah lewat).

   Bedanya dengan /absensi: di sana pekerjaannya mengisi kehadiran hari
   berjalan untuk satu kelas sekaligus. Di sini pekerjaannya berbeda —
   menemukan satu catatan yang salah di antara ribuan, lalu membetulkannya.
   Karena itu bentuknya penyaring + daftar, bukan borang per kelas.

   Penjaga tabrakan yang sama seperti penyimpanan massal tetap berlaku:
   setiap perubahan menyertakan `updated_at` yang terlihat saat memuat, dan
   ditolak kalau baris itu sudah diubah sesi lain. Untuk satu baris
   kemungkinannya kecil, tapi justru di layar koreksi inilah dua orang bisa
   membetulkan hal yang sama pada waktu bersamaan.

   Hapus bersifat HALUS. Policy DELETE absensi hanya untuk admin_ppg,
   sedangkan mengisi `deleted_at` mengikuti policy UPDATE yang ber-scope —
   jadi admin kelompok tetap bisa membatalkan catatan keliru di
   kelompoknya sendiri tanpa perlu hak hapus penuh. */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const STATUS = ['hadir', 'izin', 'sakit', 'alpa'];
const WARNA: Record<string, string> = {
  hadir: 'text-sage',
  izin: 'text-brass',
  sakit: 'text-brass',
  alpa: 'text-red',
};
const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

type Kelompok = { id: number; nama: string };
type Tersemat = { nama: string; nis: string | null } | { nama: string; nis: string | null }[] | null;
type Baris = {
  id: number;
  santri_id: number;
  tanggal: string;
  status: string;
  updated_at: string;
  santri: Tersemat;
};

function satu(v: Tersemat) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

function mundurHari(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function KelolaAbsensiContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [dari, setDari] = useState(mundurHari(14));
  const [sampai, setSampai] = useState(mundurHari(0));
  const [filterStatus, setFilterStatus] = useState('');
  const [cari, setCari] = useState('');

  const [baris, setBaris] = useState<Baris[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
  }, []);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setBaris([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('absensi')
        .select('id, santri_id, tanggal, status, updated_at, santri(nama, nis)')
        .eq('kelompok_id', kelompokId)
        .gte('tanggal', dari)
        .lte('tanggal', sampai)
        .is('deleted_at', null)
        .order('tanggal', { ascending: false })
        /* Layar koreksi tidak perlu ribuan baris sekaligus; penyaring
           tanggal & status yang mempersempitnya. Batas ini juga menjaga
           halaman tetap ringan kalau rentangnya kelewat lebar. */
        .limit(500);
      if (filterStatus) q = q.eq('status', filterStatus);

      const { data, error: err } = await q;
      if (err) throw new Error(err.message);
      setBaris((data ?? []) as unknown as Baris[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat catatan absensi.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, dari, sampai, filterStatus]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function ubahStatus(b: Baris, status: string) {
    setError(null);
    setPesan(null);
    try {
      const { data, error: err } = await supabase
        .from('absensi')
        .update({ status })
        .eq('id', b.id)
        /* Penjaga versi: kalau baris sudah berubah sejak dimuat, tidak ada
           baris yang cocok dan perubahan ini TIDAK diam-diam menimpa. */
        .eq('updated_at', b.updated_at)
        .select('id');
      if (err) throw new Error(err.message);
      if (!data || data.length === 0) {
        await muat();
        setError(
          'Catatan itu baru saja diubah dari sesi lain. Tampilan sudah disegarkan — periksa lalu ulangi.'
        );
        return;
      }
      setPesan(`${satu(b.santri)?.nama ?? 'Catatan'} ${b.tanggal} diubah menjadi ${status}.`);
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah.');
    }
  }

  async function hapus(b: Baris) {
    const nama = satu(b.santri)?.nama ?? 'catatan ini';
    if (!window.confirm(`Batalkan catatan absensi ${nama} tanggal ${b.tanggal}?`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase
        .from('absensi')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', b.id);
      if (err) throw new Error(err.message);
      setPesan('Catatan dibatalkan.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membatalkan.');
    }
  }

  const tersaring = cari.trim()
    ? baris.filter((b) => {
        const s = satu(b.santri);
        const k = cari.trim().toLowerCase();
        return (
          (s?.nama ?? '').toLowerCase().includes(k) || (s?.nis ?? '').toLowerCase().includes(k)
        );
      })
    : baris;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Kelola Absensi</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Memperbaiki catatan kehadiran yang sudah lewat. Untuk mengisi kehadiran hari ini, pakai
        halaman Input Absensi.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={KELAS_LABEL}>Kelompok</label>
          <select
            className={KELAS_INPUT}
            value={kelompokId ?? ''}
            disabled={profile?.role === 'admin_kelompok' || profile?.role === 'guru'}
            onChange={(e) => setKelompokId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Pilih Kelompok --</option>
            {kelompokList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={KELAS_LABEL}>Dari</label>
          <input type="date" className={KELAS_INPUT} value={dari} onChange={(e) => setDari(e.target.value)} />
        </div>
        <div>
          <label className={KELAS_LABEL}>Sampai</label>
          <input
            type="date"
            className={KELAS_INPUT}
            value={sampai}
            onChange={(e) => setSampai(e.target.value)}
          />
        </div>
        <div>
          <label className={KELAS_LABEL}>Status</label>
          <select
            className={KELAS_INPUT}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Semua</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <input
        className={KELAS_INPUT + ' mb-4'}
        value={cari}
        onChange={(e) => setCari(e.target.value)}
        placeholder="Cari nama atau NIS santri..."
      />

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!loading && !kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}
      {!loading && kelompokId && tersaring.length === 0 && (
        <p className="text-[13px] text-text-dim">Tidak ada catatan pada rentang & saringan ini.</p>
      )}

      {!loading && tersaring.length > 0 && (
        <>
          <p className="mb-2 text-[11px] text-text-faint">
            {tersaring.length} catatan
            {baris.length === 500 ? ' (dibatasi 500 teratas — persempit rentang tanggalnya)' : ''}.
          </p>
          <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="border-b border-border bg-panel-2">
                <tr>
                  {['Tanggal', 'Santri', 'Status'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  {bolehTulis && <th className="px-3 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {tersaring.map((b) => {
                  const s = satu(b.santri);
                  return (
                    <tr key={b.id} className="hover:bg-panel-2">
                      <td className="border-b border-border px-3 py-2 whitespace-nowrap text-text">
                        {b.tanggal}
                      </td>
                      <td className="border-b border-border px-3 py-2 text-text">
                        {s?.nama ?? '-'}
                        {s?.nis && <span className="ml-2 text-[11px] text-text-faint">{s.nis}</span>}
                      </td>
                      <td className={'border-b border-border px-3 py-2 font-semibold ' + (WARNA[b.status] ?? '')}>
                        {b.status}
                      </td>
                      {bolehTulis && (
                        <td className="border-b border-border px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {STATUS.filter((s2) => s2 !== b.status).map((s2) => (
                              <button
                                key={s2}
                                onClick={() => ubahStatus(b, s2)}
                                className={KELAS_TOMBOL_SEKUNDER + ' ' + (WARNA[s2] ?? '')}
                              >
                                {s2}
                              </button>
                            ))}
                            <button onClick={() => hapus(b)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                              Batalkan
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function KelolaAbsensiPage() {
  return (
    <RequireAuth>
      <KelolaAbsensiContent />
    </RequireAuth>
  );
}
