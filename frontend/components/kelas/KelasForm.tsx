'use client';

/* Form tambah/ubah kelas — dipindah dari app/kelas/page.tsx (2026-08-26)
   supaya bisa dipakai ulang di KelasKelpMobile.tsx (kartu Data Kelas
   admin_kelompok mobile, dibuka dari /data-master), sama pola dgn
   components/guru/GuruForm.tsx & components/santri/SantriForm.tsx --
   satu form dipakai desktop (/kelas, tabel) & mobile (kartu). Tidak ada
   perubahan perilaku dari versi lama di app/kelas/page.tsx, murni
   dipindah + diekspor. */

import { useState } from 'react';
import { KATEGORI_JENJANG } from '@/lib/kategori';

export type KategoriKbm = { id: number; nama: string };
export type Guru = { id: number; nama: string };
export type KelasRow = {
  id: number;
  kelompok_id: number;
  nama: string;
  kategori_kbm_id: number;
  guru_id: number | null;
  jam_mulai: string;
  jam_selesai: string;
  ruangan: string;
  keterangan: string | null;
  santri_count: number;
  status: string;
};

export const KOLOM_KELAS =
  'id, kelompok_id, nama, kategori_kbm_id, guru_id, jam_mulai, jam_selesai, ruangan, keterangan, santri_count, status';

export const STATUS_KELAS = ['aktif', 'tidak_aktif'];

const keJam = (v: string | null) => (v ? v.slice(0, 5) : '');

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

export default function KelasForm({
  awal,
  kategoriList,
  guruList,
  onBatal,
  onSimpan,
}: {
  awal: KelasRow | null;
  kategoriList: KategoriKbm[];
  guruList: Guru[];
  onBatal: () => void;
  onSimpan: (isi: Record<string, unknown>) => Promise<void>;
}) {
  const [nama, setNama] = useState(awal?.nama ?? '');
  const [kategoriId, setKategoriId] = useState(awal ? String(awal.kategori_kbm_id) : '');
  const [guruId, setGuruId] = useState(awal?.guru_id != null ? String(awal.guru_id) : '');
  const [mulai, setMulai] = useState(keJam(awal?.jam_mulai ?? null) || '15:45');
  const [selesai, setSelesai] = useState(keJam(awal?.jam_selesai ?? null) || '16:30');
  const [ruangan, setRuangan] = useState(awal?.ruangan ?? '');
  const [keterangan, setKeterangan] = useState(awal?.keterangan ?? '');
  const [status, setStatus] = useState(awal?.status ?? 'aktif');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Dropdown kategori dibatasi 4 kategori JENJANG. Sisi lain dari tabel
     kategori_kbm berisi mata pelajaran kurikulum yang tidak berlaku di
     sini — lihat lib/kategori.ts. */
  const kategoriJenjang = kategoriList.filter((k) => KATEGORI_JENJANG.includes(k.nama));

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nama.trim()) return setError('Nama kelas wajib diisi.');
    if (!kategoriId) return setError('Kategori wajib dipilih.');
    if (!mulai || !selesai) return setError('Jam mulai dan selesai wajib diisi.');
    if (!ruangan.trim()) return setError('Ruangan wajib diisi.');

    setMenyimpan(true);
    try {
      await onSimpan({
        nama: nama.trim(),
        kategori_kbm_id: Number(kategoriId),
        guru_id: guruId ? Number(guruId) : null,
        jam_mulai: mulai,
        jam_selesai: selesai,
        ruangan: ruangan.trim(),
        keterangan: keterangan.trim() || null,
        status,
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
        <h2 className="mb-6 text-[20px] font-bold text-text">{awal ? 'Ubah Kelas' : 'Tambah Kelas'}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Nama Kelas *</label>
            <input
              className={KELAS_INPUT}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Misal: 1A, 2 & 3A, PAUD/TK B"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kategori *</label>
            <select
              className={KELAS_INPUT}
              value={kategoriId}
              onChange={(e) => setKategoriId(e.target.value)}
            >
              <option value="">-- Pilih Kategori --</option>
              {kategoriJenjang.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Guru Pengampu</label>
            <select className={KELAS_INPUT} value={guruId} onChange={(e) => setGuruId(e.target.value)}>
              <option value="">-- Belum ditentukan --</option>
              {guruList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Ruangan *</label>
            <input
              className={KELAS_INPUT}
              value={ruangan}
              onChange={(e) => setRuangan(e.target.value)}
              placeholder="Misal: Masjid Lt 1"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Jam Mulai *</label>
            <input type="time" className={KELAS_INPUT} value={mulai} onChange={(e) => setMulai(e.target.value)} />
          </div>
          <div>
            <label className={KELAS_LABEL}>Jam Selesai *</label>
            <input
              type="time"
              className={KELAS_INPUT}
              value={selesai}
              onChange={(e) => setSelesai(e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Status</label>
            <select className={KELAS_INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_KELAS.map((s) => (
                <option key={s} value={s}>
                  {s === 'aktif' ? 'Aktif' : 'Tidak Aktif'}
                </option>
              ))}
            </select>
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

        {error && <p className="mt-4 text-[13px] text-red">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
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
