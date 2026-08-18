'use client';

/* Halaman Siklus Generus — padanan Modul_MaintainSiklusGenerus.gs (165
   baris, 4 fungsi). Pencatatan perpindahan generus: kerja, kuliah, pindah,
   mondok, tugas, atau tidak aktif.

   `nama` sengaja DISIMPAN sebagai kolom sendiri walau sudah ada santri_id.
   Itu bawaan app lama dan memang berguna: kalau santri-nya kelak dihapus
   atau berganti nama, catatan siklus tetap menyebut nama saat peristiwa itu
   terjadi. Form ini mengisinya otomatis dari santri yang dipilih.

   Fondasi DB (policy) dibuat di migrasi 20260818170000. */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

/* Harus cocok persis dgn enum siklus_generus_jenis. */
const JENIS = ['Kerja', 'Kuliah', 'Pindah', 'Mondok', 'Tugas', 'Tidak Aktif'];
const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

type Kelompok = { id: number; nama: string };
type Santri = { id: number; nama: string };
type Siklus = {
  id: number;
  kelompok_id: number;
  santri_id: number;
  nama: string;
  jenis_siklus: string;
  tanggal: string;
  lokasi: string | null;
  instansi: string | null;
  keterangan: string | null;
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

const hariIni = () => new Date().toISOString().slice(0, 10);

function SiklusContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [santriList, setSantriList] = useState<Santri[]>([]);
  const [daftar, setDaftar] = useState<Siklus[]>([]);

  const [santriId, setSantriId] = useState('');
  const [jenis, setJenis] = useState('');
  const [tanggal, setTanggal] = useState(hariIni());
  const [lokasi, setLokasi] = useState('');
  const [instansi, setInstansi] = useState('');
  const [keterangan, setKeterangan] = useState('');

  const [loading, setLoading] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  /* Catatan yang sedang diubah. app lama punya serverUpdateSiklusGenerus
     tapi formnya hanya bisa menambah; di sini form yang sama dipakai
     ulang untuk mengubah supaya tidak ada dua tempat mengetik hal yang
     sama. */
  const [sedangDiubah, setSedangDiubah] = useState<Siklus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
  }, []);

  useEffect(() => {
    async function load() {
      if (!kelompokId) {
        setSantriList([]);
        return;
      }
      const { data } = await supabase
        .from('santri')
        .select('id, nama')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama');
      setSantriList((data ?? []) as unknown as Santri[]);
    }
    load();
  }, [kelompokId]);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setDaftar([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('siklus_generus')
        .select('id, kelompok_id, santri_id, nama, jenis_siklus, tanggal, lokasi, instansi, keterangan')
        .eq('kelompok_id', kelompokId)
        .order('tanggal', { ascending: false });
      if (err) throw new Error(err.message);
      setDaftar((data ?? []) as unknown as Siklus[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data siklus.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function simpan() {
    if (!kelompokId || !santriId || !jenis || !tanggal) {
      setError('Santri, jenis siklus, dan tanggal wajib diisi.');
      return;
    }
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const isiUbah = {
        jenis_siklus: jenis,
        tanggal,
        lokasi: lokasi.trim() || null,
        instansi: instansi.trim() || null,
        keterangan: keterangan.trim() || null,
      };
      const { error: err } = sedangDiubah
        ? await supabase.from('siklus_generus').update(isiUbah).eq('id', sedangDiubah.id)
        : await supabase.from('siklus_generus').insert({
        kelompok_id: kelompokId,
        santri_id: Number(santriId),
        /* Nama dibekukan saat pencatatan — lihat catatan di kepala berkas. */
        nama: santriList.find((s) => s.id === Number(santriId))?.nama ?? '',
        jenis_siklus: jenis,
        tanggal,
        lokasi: lokasi.trim() || null,
        instansi: instansi.trim() || null,
        keterangan: keterangan.trim() || null,
        dicatat_oleh: profile?.id ?? null,
          });
      if (err) throw new Error(err.message);
      setPesan(sedangDiubah ? 'Catatan siklus diperbarui.' : 'Catatan siklus tersimpan.');
      setSedangDiubah(null);
      setSantriId('');
      setJenis('');
      setLokasi('');
      setInstansi('');
      setKeterangan('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapus(s: Siklus) {
    if (!window.confirm(`Hapus catatan siklus ${s.nama} (${s.jenis_siklus})?`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('siklus_generus').delete().eq('id', s.id);
      if (err) throw new Error(err.message);
      setPesan('Catatan dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Siklus Generus</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Catatan perpindahan generus: kerja, kuliah, pindah, mondok, tugas, atau tidak aktif.
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
          <div className="mb-3 text-[13px] font-bold text-text">
            {sedangDiubah ? 'Ubah Catatan Siklus' : 'Catat Siklus Baru'}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={KELAS_LABEL}>Santri *</label>
              <select
                className={KELAS_INPUT}
                value={santriId}
                /* Santri tidak bisa dipindah setelah tercatat: catatan siklus
                   melekat pada orang tertentu, dan menggantinya berarti
                   memalsukan riwayat orang lain. */
                disabled={!!sedangDiubah}
                onChange={(e) => setSantriId(e.target.value)}
              >
                <option value="">-- Pilih Santri --</option>
                {santriList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={KELAS_LABEL}>Jenis Siklus *</label>
              <select className={KELAS_INPUT} value={jenis} onChange={(e) => setJenis(e.target.value)}>
                <option value="">-- Pilih Jenis --</option>
                {JENIS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={KELAS_LABEL}>Tanggal *</label>
              <input
                type="date"
                className={KELAS_INPUT}
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
              />
            </div>
            <div>
              <label className={KELAS_LABEL}>Lokasi</label>
              <input
                className={KELAS_INPUT}
                value={lokasi}
                onChange={(e) => setLokasi(e.target.value)}
                placeholder="Kota / daerah tujuan"
              />
            </div>
            <div>
              <label className={KELAS_LABEL}>Instansi</label>
              <input
                className={KELAS_INPUT}
                value={instansi}
                onChange={(e) => setInstansi(e.target.value)}
                placeholder="Kampus / perusahaan / pondok"
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
          <div className="mt-4 flex gap-3">
          <button onClick={simpan} disabled={sibuk} className={KELAS_TOMBOL_UTAMA}>
            {sibuk ? 'Menyimpan...' : sedangDiubah ? 'Simpan Perubahan' : 'Simpan'}
          </button>
          {sedangDiubah && (
            <button
              onClick={() => {
                setSedangDiubah(null);
                setSantriId('');
                setJenis('');
                setLokasi('');
                setInstansi('');
                setKeterangan('');
              }}
              className={KELAS_TOMBOL_SEKUNDER + ' px-4 py-2.5 text-[13px]'}
            >
              Batal
            </button>
          )}
          </div>
        </div>
      )}

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!loading && !kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}
      {!loading && kelompokId && daftar.length === 0 && (
        <p className="text-[13px] text-text-dim">Belum ada catatan siklus untuk kelompok ini.</p>
      )}

      {!loading && daftar.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="border-b border-border bg-panel-2">
              <tr>
                {['Tanggal', 'Nama', 'Jenis', 'Lokasi', 'Instansi'].map((h) => (
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
              {daftar.map((s) => (
                <tr key={s.id} className="hover:bg-panel-2">
                  <td className="border-b border-border px-3 py-3 whitespace-nowrap text-text">
                    {s.tanggal}
                  </td>
                  <td className="border-b border-border px-3 py-3 text-text">{s.nama}</td>
                  <td className="border-b border-border px-3 py-3 text-text">{s.jenis_siklus}</td>
                  <td className="border-b border-border px-3 py-3 text-text-dim">{s.lokasi ?? '—'}</td>
                  <td className="border-b border-border px-3 py-3 text-text-dim">
                    {s.instansi ?? '—'}
                  </td>
                  {bolehTulis && (
                    <td className="border-b border-border px-3 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSedangDiubah(s);
                            setSantriId(String(s.santri_id));
                            setJenis(s.jenis_siklus);
                            setTanggal(s.tanggal);
                            setLokasi(s.lokasi ?? '');
                            setInstansi(s.instansi ?? '');
                            setKeterangan(s.keterangan ?? '');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={KELAS_TOMBOL_SEKUNDER}
                        >
                          Ubah
                        </button>
                        <button onClick={() => hapus(s)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                          Hapus
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SiklusGenerusPage() {
  return (
    <RequireAuth>
      <SiklusContent />
    </RequireAuth>
  );
}
