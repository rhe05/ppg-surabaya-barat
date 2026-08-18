'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import GuruForm, { KOLOM_GURU, type GuruRow } from '@/components/guru/GuruForm';
import { unduhXlsx } from '@/lib/xlsx';

/* Kolom yang ikut diekspor. App lama punya pemilih kolom; di sini daftarnya
   tetap — kolom yang benar-benar dipakai saat mencetak data guru. Yang
   diekspor adalah baris HASIL SARINGAN yang sedang tampil, bukan seluruh
   tabel, supaya apa yang diunduh sama dengan apa yang dilihat. */
const KOLOM_EKSPOR_GURU: { judul: string; ambil: (g: GuruRow) => unknown }[] = [
  { judul: 'Nama', ambil: (g) => g.nama },
  { judul: 'Kategori', ambil: (g) => g.kategori },
  { judul: 'Jenis Kelamin', ambil: (g) => g.jenis_kelamin },
  { judul: 'Tempat Lahir', ambil: (g) => g.tempat_lahir },
  { judul: 'Tanggal Lahir', ambil: (g) => g.tanggal_lahir },
  { judul: 'Mulai Mengajar', ambil: (g) => g.mulai_mengajar },
  { judul: 'Lama Mengajar', ambil: (g) => g.lama_mengajar },
  { judul: 'Pendidikan', ambil: (g) => g.pendidikan },
  { judul: 'Nomor WA', ambil: (g) => g.nomor_wa },
  { judul: 'Alamat', ambil: (g) => g.alamat },
  { judul: 'RT', ambil: (g) => g.rt },
  { judul: 'RW', ambil: (g) => g.rw },
  { judul: 'Kelurahan', ambil: (g) => g.kelurahan },
  { judul: 'Kecamatan', ambil: (g) => g.kecamatan },
  { judul: 'Kabupaten/Kota', ambil: (g) => g.kabupaten_kota },
  { judul: 'Provinsi', ambil: (g) => g.provinsi },
  { judul: 'Kode Pos', ambil: (g) => g.kode_pos },
  { judul: 'Kelompok', ambil: (g) => g.kelompok_id },
];

const PAGE_SIZE = 10;

/* Peran yang boleh menulis guru. Cocok dgn policy guru_insert_admin
   (migrasi 20260818090000) / guru_update_admin di produksi — guru sendiri
   sengaja TIDAK termasuk, sama seperti di app lama. */
const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

export default function GuruList() {
  const { profile } = useAuth();
  const [guru, setGuru] = useState<GuruRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<GuruRow | null>(null);
  const [pesanAksi, setPesanAksi] = useState<string | null>(null);
  const [errorAksi, setErrorAksi] = useState<string | null>(null);

  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');
  /* Hanya admin_ppg yang punya policy DELETE (guru_delete_ppg_only).
     Admin lain menghapus secara halus lewat UPDATE deleted_at. */
  const hapusPermanen = profile?.role === 'admin_ppg';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('guru')
        .select(KOLOM_GURU)
        .is('deleted_at', null)
        .order('nama');
      if (queryError) throw new Error(queryError.message);
      setGuru((data ?? []) as unknown as GuruRow[]);
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) load();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function hapus(g: GuruRow) {
    const konfirmasi = hapusPermanen
      ? `Hapus PERMANEN "${g.nama}" dari database? Tindakan ini tidak bisa dibatalkan.`
      : `Hapus "${g.nama}" dari daftar?`;
    if (!window.confirm(konfirmasi)) return;

    setErrorAksi(null);
    setPesanAksi(null);
    try {
      const { error: err } = hapusPermanen
        ? await supabase.from('guru').delete().eq('id', g.id)
        : await supabase
            .from('guru')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', g.id);
      if (err) throw new Error(err.message);
      setPesanAksi(
        hapusPermanen ? `"${g.nama}" dihapus permanen.` : `"${g.nama}" dihapus dari daftar.`
      );
      await load();
    } catch (e) {
      setErrorAksi(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? guru.filter(
          (g) =>
            g.nama?.toLowerCase().includes(term) || (g.kategori ?? '').toLowerCase().includes(term)
        )
      : guru;
    return [...rows].sort((a, b) => (a.kelompok_id ?? 0) - (b.kelompok_id ?? 0));
  }, [guru, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        {/* .dash-section-title — Style_Main.html:845-850 */}
        <div className="text-[20px] font-bold text-text">Guru</div>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <button
              onClick={() =>
                unduhXlsx(
                  'Data Guru',
                  KOLOM_EKSPOR_GURU.map((k) => k.judul),
                  filtered.map((g) => KOLOM_EKSPOR_GURU.map((k) => k.ambil(g)))
                )
              }
              className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border"
            >
              Ekspor Excel
            </button>
          )}
          {bolehTulis && (
            <button
              onClick={() => {
                setSedangDiubah(null);
                setFormTerbuka(true);
              }}
              className="cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200"
            >
              + Tambah Guru
            </button>
          )}
        </div>
      </div>

      {/* .search-input — Style_Main.html:4290-4298 */}
      <input
        type="text"
        placeholder="Cari nama atau kategori..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="mb-6 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
      />

      {pesanAksi && <p className="mb-4 text-[13px] text-sage">{pesanAksi}</p>}
      {errorAksi && <p className="mb-4 text-[13px] text-red">{errorAksi}</p>}

      {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
      {!loading && error && <p className="text-[13px] text-red">{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="text-[13px] text-text-dim">No data available</p>
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          {/* .data-table-wrapper + .data-table — Style_Main.html:4250-4288 */}
          <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="border-b border-border bg-panel-2">
                <tr>
                  {['Nama', 'Kategori', 'Lama Mengajar', 'Kelompok'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3.5 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  {bolehTulis && (
                    <th className="px-4 py-3.5 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase">
                      Aksi
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((g) => (
                  <tr key={g.id} className="hover:bg-panel-2">
                    <td className="border-b border-border px-4 py-3.5 text-text">{g.nama}</td>
                    <td className="border-b border-border px-4 py-3.5 text-text">
                      {g.kategori ?? '-'}
                    </td>
                    <td className="border-b border-border px-4 py-3.5 text-text">
                      {g.lama_mengajar ?? '-'}
                    </td>
                    <td className="border-b border-border px-4 py-3.5 text-text">
                      {g.kelompok_id ?? '-'}
                    </td>
                    {bolehTulis && (
                      <td className="border-b border-border px-4 py-3.5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSedangDiubah(g);
                              setFormTerbuka(true);
                            }}
                            className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] font-semibold text-text transition-all duration-200 hover:bg-border"
                          >
                            Ubah
                          </button>
                          <button
                            onClick={() => hapus(g)}
                            className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] font-semibold text-red transition-all duration-200 hover:bg-border"
                          >
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

          <div className="mt-4 flex items-center justify-between text-[13px] text-text-dim">
            <span>
              Halaman {page} / {totalPages} &middot; {filtered.length} guru
            </span>
            {/* .btn + .btn-secondary — Style_Main.html:4410-4438 */}
            <div className="flex gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {formTerbuka && (
        <GuruForm
          guru={sedangDiubah}
          onBatal={() => setFormTerbuka(false)}
          onSelesai={async () => {
            setFormTerbuka(false);
            setPesanAksi(sedangDiubah ? 'Perubahan tersimpan.' : 'Guru baru tersimpan.');
            await load();
          }}
        />
      )}
    </div>
  );
}
