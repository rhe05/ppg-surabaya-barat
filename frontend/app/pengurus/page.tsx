'use client';

/* Halaman Pengurus Kelompok — padanan Modul_MaintainPengurus.gs (153 baris,
   3 fungsi). Daftar dapukan pengurus per kelompok.

   Aturan yang dipertahankan dari app lama: sebagian besar dapukan hanya
   boleh dipegang SATU orang, sehingga menyimpan dapukan yang sama berarti
   MENGGANTI pemegangnya (upsert), bukan menambah baris kedua. Kekecualiannya
   ditandai `jabatan_pengurus.is_multi_holder` — di seed hanya "Wk Pembina
   Generus Kelp", persis MULTI_HOLDER_JABATAN_ (Modul_MaintainPengurus.gs:30).

   Fondasi DB (policy + seed 10 dapukan) dibuat di migrasi 20260818170000;
   sebelumnya tabelnya RLS aktif tanpa policy dan daftar jabatannya kosong. */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

type Kelompok = { id: number; nama: string };
type Jabatan = { id: number; nama: string; is_multi_holder: boolean; urutan: number };
type Tersemat = { nama: string } | { nama: string }[] | null;
type Pengurus = {
  id: number;
  kelompok_id: number;
  jabatan_id: number;
  nama: string;
  mulai_dapukan: string | null;
  keterangan: string | null;
  jabatan_pengurus: Tersemat;
};

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';
const KELAS_TOMBOL_UTAMA =
  'cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] ' +
  'font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

function PengurusContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [jabatanList, setJabatanList] = useState<Jabatan[]>([]);
  const [daftar, setDaftar] = useState<Pengurus[]>([]);

  const [jabatanId, setJabatanId] = useState('');
  const [nama, setNama] = useState('');
  const [mulai, setMulai] = useState('');
  const [keterangan, setKeterangan] = useState('');

  const [loading, setLoading] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: dKel }, { data: dJab }] = await Promise.all([
        supabase.from('kelompok').select('id, nama').order('nama'),
        supabase.from('jabatan_pengurus').select('id, nama, is_multi_holder, urutan').order('urutan'),
      ]);
      setKelompokList(dKel ?? []);
      setJabatanList((dJab ?? []) as unknown as Jabatan[]);
    }
    load();
  }, []);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setDaftar([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('pengurus_kelp')
        .select('id, kelompok_id, jabatan_id, nama, mulai_dapukan, keterangan, jabatan_pengurus(nama)')
        .eq('kelompok_id', kelompokId);
      if (err) throw new Error(err.message);
      setDaftar((data ?? []) as unknown as Pengurus[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengurus.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function simpan() {
    if (!kelompokId || !jabatanId || !nama.trim()) {
      setError('Jabatan dan nama wajib diisi.');
      return;
    }
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const jab = jabatanList.find((j) => j.id === Number(jabatanId));
      const isi = {
        nama: nama.trim(),
        mulai_dapukan: mulai || null,
        keterangan: keterangan.trim() || null,
      };

      /* Dapukan tunggal: GANTI pemegang yang ada, bukan tambah baris kedua
         (serverSavePengurus app lama melakukan upsert untuk kasus ini). */
      const sudahAda = !jab?.is_multi_holder
        ? daftar.find((p) => p.jabatan_id === Number(jabatanId))
        : undefined;

      const { error: err } = sudahAda
        ? await supabase.from('pengurus_kelp').update(isi).eq('id', sudahAda.id)
        : await supabase.from('pengurus_kelp').insert({
            ...isi,
            kelompok_id: kelompokId,
            jabatan_id: Number(jabatanId),
            dicatat_oleh: profile?.id ?? null,
          });
      if (err) throw new Error(err.message);

      setPesan(sudahAda ? `Pemegang dapukan diganti menjadi ${isi.nama}.` : 'Pengurus disimpan.');
      setNama('');
      setMulai('');
      setKeterangan('');
      setJabatanId('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapus(p: Pengurus) {
    if (!window.confirm(`Hapus ${p.nama} dari kepengurusan?`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('pengurus_kelp').delete().eq('id', p.id);
      if (err) throw new Error(err.message);
      setPesan('Pengurus dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Pengurus Kelompok</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Daftar dapukan pengurus. Sebagian besar dapukan hanya untuk satu orang — menyimpan dapukan
        yang sama akan mengganti pemegangnya.
      </p>

      <div className="mb-6 max-w-sm">
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

      {bolehTulis && kelompokId && (
        <div className="mb-6 rounded-card border border-border bg-panel-2 p-4">
          <div className="mb-3 text-[13px] font-bold text-text">Tetapkan Pengurus</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={KELAS_LABEL}>Jabatan *</label>
              <select
                className={KELAS_INPUT}
                value={jabatanId}
                onChange={(e) => setJabatanId(e.target.value)}
              >
                <option value="">-- Pilih Jabatan --</option>
                {jabatanList.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.nama}
                    {j.is_multi_holder ? ' (boleh lebih dari satu)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={KELAS_LABEL}>Nama *</label>
              <input className={KELAS_INPUT} value={nama} onChange={(e) => setNama(e.target.value)} />
            </div>
            <div>
              <label className={KELAS_LABEL}>Mulai Dapukan</label>
              <input
                type="date"
                className={KELAS_INPUT}
                value={mulai}
                onChange={(e) => setMulai(e.target.value)}
              />
            </div>
            <div>
              <label className={KELAS_LABEL}>Keterangan</label>
              <input
                className={KELAS_INPUT}
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
              />
            </div>
          </div>
          <button onClick={simpan} disabled={sibuk} className={KELAS_TOMBOL_UTAMA + ' mt-4'}>
            {sibuk ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      )}

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!loading && !kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}
      {!loading && kelompokId && daftar.length === 0 && (
        <p className="text-[13px] text-text-dim">Belum ada pengurus tercatat untuk kelompok ini.</p>
      )}

      {!loading && daftar.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="border-b border-border bg-panel-2">
              <tr>
                {['Jabatan', 'Nama', 'Mulai', 'Keterangan'].map((h) => (
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
              {daftar.map((p) => {
                const jab = Array.isArray(p.jabatan_pengurus)
                  ? p.jabatan_pengurus[0]
                  : p.jabatan_pengurus;
                return (
                  <tr key={p.id} className="hover:bg-panel-2">
                    <td className="border-b border-border px-3 py-3 text-text">{jab?.nama ?? '-'}</td>
                    <td className="border-b border-border px-3 py-3 text-text">{p.nama}</td>
                    <td className="border-b border-border px-3 py-3 text-text">
                      {p.mulai_dapukan ?? '—'}
                    </td>
                    <td className="border-b border-border px-3 py-3 text-text-dim">
                      {p.keterangan ?? '—'}
                    </td>
                    {bolehTulis && (
                      <td className="border-b border-border px-3 py-3">
                        <button onClick={() => hapus(p)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                          Hapus
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PengurusPage() {
  return (
    <RequireAuth>
      <PengurusContent />
    </RequireAuth>
  );
}
