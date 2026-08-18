'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import SantriForm, { KOLOM_SANTRI, type SantriRow } from '@/components/santri/SantriForm';
import { unduhXlsx } from '@/lib/xlsx';

/* Kolom ekspor data generus. Baris yang diekspor = hasil saringan yang
   sedang tampil, bukan seluruh tabel. */
const KOLOM_EKSPOR_SANTRI: { judul: string; ambil: (s: SantriRow) => unknown }[] = [
  { judul: 'NIS', ambil: (s) => s.nis },
  { judul: 'Nama', ambil: (s) => s.nama },
  { judul: 'Nama Panggilan', ambil: (s) => s.nama_panggilan },
  { judul: 'Gender', ambil: (s) => s.gender },
  { judul: 'Tempat Lahir', ambil: (s) => s.tempat_lahir },
  { judul: 'Tanggal Lahir', ambil: (s) => s.tanggal_lahir },
  { judul: 'Jenjang', ambil: (s) => s.jenjang_saat_ini },
  { judul: 'Pendidikan', ambil: (s) => s.pendidikan },
  { judul: 'Kelas Sekolah', ambil: (s) => s.kelas_sekolah },
  { judul: 'Kelas Ngaji', ambil: (s) => s.kelas_ngaji },
  { judul: 'Status Nikah', ambil: (s) => s.status_nikah },
  { judul: 'Mulai Ngaji', ambil: (s) => s.mulai_ngaji },
  { judul: 'Alamat', ambil: (s) => s.alamat },
  { judul: 'RT', ambil: (s) => s.rt },
  { judul: 'RW', ambil: (s) => s.rw },
  { judul: 'Kelurahan', ambil: (s) => s.kelurahan },
  { judul: 'Kecamatan', ambil: (s) => s.kecamatan },
  { judul: 'Kabupaten/Kota', ambil: (s) => s.kabupaten_kota },
  { judul: 'Provinsi', ambil: (s) => s.provinsi },
  { judul: 'Kode Pos', ambil: (s) => s.kode_pos },
  { judul: 'Nama Ayah', ambil: (s) => s.nama_ayah },
  { judul: 'Nama Ibu', ambil: (s) => s.nama_ibu },
  { judul: 'Nomor WA', ambil: (s) => s.nomor_wa },
  { judul: 'Nomor WA Ayah', ambil: (s) => s.nomor_wa_ayah },
  { judul: 'Nomor WA Ibu', ambil: (s) => s.nomor_wa_ibu },
  { judul: 'Kelompok', ambil: (s) => s.kelompok_id },
];

const PAGE_SIZE = 10;

/* Peran yang boleh menulis santri. Cocok dgn policy santri_insert_admin /
   santri_update_admin di produksi — guru sengaja TIDAK termasuk. Di app
   lama guru juga tidak pernah bisa: role 'guru' dikunci ke layar mobile
   dan tidak pernah melihat shell admin (Script_Main.html:226-233). */
const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

export default function SantriList() {
  const { profile } = useAuth();
  const [santri, setSantri] = useState<SantriRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<SantriRow | null>(null);
  const [pesanAksi, setPesanAksi] = useState<string | null>(null);
  const [errorAksi, setErrorAksi] = useState<string | null>(null);

  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');
  /* Hanya admin_ppg yang punya policy DELETE (santri_delete_ppg_only).
     Admin lain menghapus secara halus lewat UPDATE deleted_at. */
  const hapusPermanen = profile?.role === 'admin_ppg';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('santri')
        .select(KOLOM_SANTRI)
        .is('deleted_at', null)
        .order('nama');
      if (queryError) throw new Error(queryError.message);
      setSantri((data ?? []) as unknown as SantriRow[]);
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

  async function hapus(s: SantriRow) {
    const konfirmasi = hapusPermanen
      ? `Hapus PERMANEN "${s.nama}" dari database? Tindakan ini tidak bisa dibatalkan.`
      : `Hapus "${s.nama}" dari daftar?`;
    if (!window.confirm(konfirmasi)) return;

    setErrorAksi(null);
    setPesanAksi(null);
    try {
      const { error: err } = hapusPermanen
        ? await supabase.from('santri').delete().eq('id', s.id)
        : await supabase
            .from('santri')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', s.id);
      if (err) throw new Error(err.message);
      setPesanAksi(
        hapusPermanen ? `"${s.nama}" dihapus permanen.` : `"${s.nama}" dihapus dari daftar.`
      );
      await load();
    } catch (e) {
      setErrorAksi(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term
      ? santri.filter(
          (s) => s.nama?.toLowerCase().includes(term) || (s.nis ?? '').toLowerCase().includes(term)
        )
      : santri;
    return [...rows].sort((a, b) => (a.kelompok_id ?? 0) - (b.kelompok_id ?? 0));
  }, [santri, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        {/* .dash-section-title — Style_Main.html:845-850 */}
        <div className="text-[20px] font-bold text-text">Santri</div>
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <button
              onClick={() =>
                unduhXlsx(
                  'Data Generus',
                  KOLOM_EKSPOR_SANTRI.map((k) => k.judul),
                  filtered.map((s) => KOLOM_EKSPOR_SANTRI.map((k) => k.ambil(s)))
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
            + Tambah Santri
          </button>
          )}
        </div>
      </div>

      {/* .search-input — Style_Main.html:4290-4298 */}
      <input
        type="text"
        placeholder="Cari nama atau NIS..."
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
                  {['NIS', 'Nama', 'Jenjang', 'Kelompok'].map((h) => (
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
                {pageRows.map((s) => (
                  <tr key={s.id} className="hover:bg-panel-2">
                    <td className="border-b border-border px-4 py-3.5 text-text">{s.nis ?? '-'}</td>
                    <td className="border-b border-border px-4 py-3.5 text-text">{s.nama}</td>
                    <td className="border-b border-border px-4 py-3.5 text-text">
                      {s.jenjang_saat_ini ?? '-'}
                    </td>
                    <td className="border-b border-border px-4 py-3.5 text-text">
                      {s.kelompok_id ?? '-'}
                    </td>
                    {bolehTulis && (
                      <td className="border-b border-border px-4 py-3.5">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSedangDiubah(s);
                              setFormTerbuka(true);
                            }}
                            className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] font-semibold text-text transition-all duration-200 hover:bg-border"
                          >
                            Ubah
                          </button>
                          <button
                            onClick={() => hapus(s)}
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
              Halaman {page} / {totalPages} &middot; {filtered.length} santri
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
        <SantriForm
          santri={sedangDiubah}
          onBatal={() => setFormTerbuka(false)}
          onSelesai={async () => {
            setFormTerbuka(false);
            setPesanAksi(sedangDiubah ? 'Perubahan tersimpan.' : 'Santri baru tersimpan.');
            await load();
          }}
        />
      )}
    </div>
  );
}
