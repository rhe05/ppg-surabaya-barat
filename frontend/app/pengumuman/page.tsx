'use client';

/* Halaman Pengumuman — padanan Modul_MaintainPengumuman.gs (149 baris,
   4 fungsi). Daftar pengumuman per kelompok, terbaru dulu, dengan kategori
   baku dari KATEGORI_PENGUMUMAN_ app lama.

   Fondasi DB-nya baru dibuat di migrasi 20260818140000: tabel `pengumuman`
   dan `kategori_pengumuman` sebelumnya punya RLS aktif TANPA policy sama
   sekali — tertutup senyap, SELECT selalu 0 baris — dan tabel kategorinya
   kosong karena di app lama nilainya cuma konstanta di kode.

   Dua hal yang berbeda dari tabel lain di app ini:
   - Kategori BOLEH kosong. App lama menerima entri tanpa kategori (mis.
     dari generator pengumuman KBM yang mencakup beberapa jenjang) dan
     memasukkannya ke bucket "Lainnya", bukan menolaknya.
   - Hapus bersifat PERMANEN dan boleh dilakukan admin kelompok sendiri.
     Tabelnya tidak punya `deleted_at`, dan pengumuman memang catatan
     berumur pendek yang dicabut sendiri oleh pembuatnya. */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];
const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type Kategori = { id: number; nama: string; urutan: number };
type Kelompok = { id: number; nama: string };
type Tersemat = { nama: string } | { nama: string }[] | null;
type Pengumuman = {
  id: number;
  kelompok_id: number;
  kategori_pengumuman_id: number | null;
  judul: string;
  isi: string;
  tanggal: string;
  kategori_pengumuman: Tersemat;
};

function namaKategori(nilai: Tersemat) {
  if (!nilai) return 'Lainnya';
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? 'Lainnya';
}

function tanggalPanjang(iso: string) {
  const [t, b, h] = [iso.slice(0, 4), Number(iso.slice(5, 7)), iso.slice(8, 10)];
  return `${h} ${NAMA_BULAN[b - 1] ?? b} ${t}`;
}

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

function FormPengumuman({
  awal,
  kategoriList,
  onBatal,
  onSimpan,
}: {
  awal: Pengumuman | null;
  kategoriList: Kategori[];
  onBatal: () => void;
  onSimpan: (isi: Record<string, unknown>) => Promise<void>;
}) {
  const [judul, setJudul] = useState(awal?.judul ?? '');
  const [isi, setIsi] = useState(awal?.isi ?? '');
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? hariIni());
  const [kategoriId, setKategoriId] = useState(
    awal?.kategori_pengumuman_id != null ? String(awal.kategori_pengumuman_id) : ''
  );
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!judul.trim()) return setError('Judul wajib diisi.');
    if (!isi.trim()) return setError('Isi pengumuman wajib diisi.');
    if (!tanggal) return setError('Tanggal wajib diisi.');

    setMenyimpan(true);
    try {
      await onSimpan({
        judul: judul.trim(),
        isi: isi.trim(),
        tanggal,
        /* Kosong disimpan NULL, bukan ditolak — lihat catatan di kepala berkas. */
        kategori_pengumuman_id: kategoriId ? Number(kategoriId) : null,
      });
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={simpan}
        className="my-8 w-full max-w-2xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]"
      >
        <h2 className="mb-6 text-[20px] font-bold text-text">
          {awal ? 'Ubah Pengumuman' : 'Buat Pengumuman'}
        </h2>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <label className={KELAS_LABEL}>Kategori</label>
            <select
              className={KELAS_INPUT}
              value={kategoriId}
              onChange={(e) => setKategoriId(e.target.value)}
            >
              <option value="">-- Tanpa kategori --</option>
              {kategoriList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className={KELAS_LABEL}>Judul *</label>
          <input
            className={KELAS_INPUT}
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Misal: Libur KBM pekan depan"
          />
        </div>
        <div className="mb-4">
          <label className={KELAS_LABEL}>Isi *</label>
          <textarea
            rows={6}
            className={KELAS_INPUT}
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            placeholder="Tulis isi pengumuman di sini"
          />
        </div>

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onBatal} className={KELAS_TOMBOL_SEKUNDER + ' px-4 py-2.5 text-[13px]'}>
            Batal
          </button>
          <button type="submit" disabled={menyimpan} className={KELAS_TOMBOL_UTAMA}>
            {menyimpan ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PengumumanContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [kategoriList, setKategoriList] = useState<Kategori[]>([]);
  const [daftar, setDaftar] = useState<Pengumuman[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Pengumuman | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: dKel }, { data: dKat }] = await Promise.all([
        supabase.from('kelompok').select('id, nama').order('nama'),
        supabase.from('kategori_pengumuman').select('id, nama, urutan').order('urutan'),
      ]);
      setKelompokList(dKel ?? []);
      setKategoriList((dKat ?? []) as unknown as Kategori[]);
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
        .from('pengumuman')
        .select('id, kelompok_id, kategori_pengumuman_id, judul, isi, tanggal, kategori_pengumuman(nama)')
        .eq('kelompok_id', kelompokId)
        .order('tanggal', { ascending: false });
      if (err) throw new Error(err.message);
      setDaftar((data ?? []) as unknown as Pengumuman[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengumuman.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function simpan(isi: Record<string, unknown>) {
    if (!kelompokId) return;
    const { error: err } = sedangDiubah
      ? await supabase.from('pengumuman').update(isi).eq('id', sedangDiubah.id)
      : await supabase.from('pengumuman').insert({
          ...isi,
          kelompok_id: kelompokId,
          dibuat_oleh: profile?.id ?? null,
        });
    if (err) throw new Error(err.message);
    setFormTerbuka(false);
    setPesan(sedangDiubah ? 'Pengumuman diperbarui.' : 'Pengumuman dibuat.');
    await muat();
  }

  async function hapus(p: Pengumuman) {
    if (!window.confirm(`Hapus pengumuman "${p.judul}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('pengumuman').delete().eq('id', p.id);
      if (err) throw new Error(err.message);
      setPesan('Pengumuman dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Pengumuman</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Pengumuman per kelompok, terbaru lebih dulu. Guru bisa membaca pengumuman kelompoknya.
      </p>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[240px] flex-1">
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
          <button
            onClick={() => {
              setSedangDiubah(null);
              setFormTerbuka(true);
            }}
            className={KELAS_TOMBOL_UTAMA}
          >
            + Buat Pengumuman
          </button>
        )}
      </div>

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!loading && !kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}
      {!loading && kelompokId && daftar.length === 0 && (
        <p className="text-[13px] text-text-dim">Belum ada pengumuman untuk kelompok ini.</p>
      )}

      {!loading &&
        daftar.map((p) => (
          <div
            key={p.id}
            className="mb-4 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-text">{p.judul}</span>
                  <span className="rounded-[var(--radius)] border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-text-dim">
                    {namaKategori(p.kategori_pengumuman)}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-text-dim">{tanggalPanjang(p.tanggal)}</div>
                <div className="mt-3 whitespace-pre-line text-[13px] text-text">{p.isi}</div>
              </div>
              {bolehTulis && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSedangDiubah(p);
                      setFormTerbuka(true);
                    }}
                    className={KELAS_TOMBOL_SEKUNDER}
                  >
                    Ubah
                  </button>
                  <button onClick={() => hapus(p)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                    Hapus
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

      {formTerbuka && (
        <FormPengumuman
          awal={sedangDiubah}
          kategoriList={kategoriList}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpan}
        />
      )}
    </div>
  );
}

export default function PengumumanPage() {
  return (
    <RequireAuth>
      <PengumumanContent />
    </RequireAuth>
  );
}
