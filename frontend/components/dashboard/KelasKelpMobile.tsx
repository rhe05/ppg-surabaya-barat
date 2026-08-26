'use client';

/* "Data Kelas" — mobile admin_kelompok (2026-08-26), dibuka dari hub
   Data Master (app/data-master/page.tsx). Fungsi utamanya persis
   "Daftar Kelas" desktop (app/kelas/page.tsx): tambah/ubah kelas TERMASUK
   menetapkan Guru Pengampu-nya (dropdown "Guru Pengampu" di
   components/kelas/KelasForm.tsx, form yang SAMA dipakai desktop, bukan
   diduplikasi).

   Sengaja TIDAK menyertakan "Penempatan Santri" massal (grid centang
   santri desktop) -- owner minta "Data Kelas" fungsinya khusus taruh
   guru ke kelas, bukan tempatkan santri; itu tetap lewat /kelas desktop
   kalau dibutuhkan. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import KelasForm, { KOLOM_KELAS, type Guru, type KategoriKbm, type KelasRow } from '@/components/kelas/KelasForm';

export default function KelasKelpMobile() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [kategoriList, setKategoriList] = useState<KategoriKbm[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [kelasList, setKelasList] = useState<KelasRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [kelasDiubah, setKelasDiubah] = useState<KelasRow | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const muat = useCallback(async () => {
    if (!kelompokId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: dKat }, { data: dGuru, error: eGuru }, { data: dKelas, error: eKelas }] =
        await Promise.all([
          supabase.from('kategori_kbm').select('id, nama'),
          supabase.from('guru').select('id, nama').eq('kelompok_id', kelompokId).is('deleted_at', null).order('nama'),
          supabase
            .from('kelas')
            .select(KOLOM_KELAS)
            .eq('kelompok_id', kelompokId)
            .is('deleted_at', null)
            .order('nama'),
        ]);
      if (eGuru) throw new Error(eGuru.message);
      if (eKelas) throw new Error(eKelas.message);
      setKategoriList((dKat ?? []) as unknown as KategoriKbm[]);
      setGuruList((dGuru ?? []) as unknown as Guru[]);
      setKelasList((dKelas ?? []) as unknown as KelasRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data kelas.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaGuru = useMemo(() => {
    const peta = new Map(guruList.map((g) => [g.id, g.nama]));
    return (id: number | null) => (id != null ? (peta.get(id) ?? '-') : null);
  }, [guruList]);

  const namaKategori = useMemo(() => {
    const peta = new Map(kategoriList.map((k) => [k.id, k.nama]));
    return (id: number) => peta.get(id) ?? '-';
  }, [kategoriList]);

  const kelasTersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    if (!term) return kelasList;
    return kelasList.filter(
      (k) => k.nama.toLowerCase().includes(term) || (namaGuru(k.guru_id) ?? '').toLowerCase().includes(term),
    );
  }, [kelasList, cari, namaGuru]);

  function bukaTambah() {
    setKelasDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(k: KelasRow) {
    setKelasDiubah(k);
    setFormTerbuka(true);
  }
  async function simpanKelas(isi: Record<string, unknown>) {
    if (!kelompokId) return;
    const { error: err } = kelasDiubah
      ? await supabase.from('kelas').update(isi).eq('id', kelasDiubah.id)
      : await supabase.from('kelas').insert({
          ...isi,
          kelompok_id: kelompokId,
          santri_count: 0,
          created_by: profile?.id ?? null,
        });
    if (err) throw new Error(err.message);
    const baru = kelasDiubah === null;
    setFormTerbuka(false);
    setKelasDiubah(null);
    await muat();
    setPesan(baru ? 'Kelas baru tersimpan.' : 'Perubahan tersimpan.');
    setTimeout(() => setPesan(null), 4000);
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Data Kelas" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        {pesan && (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-indigo bg-[#EEF2FF] px-4 py-3 text-[13px] font-semibold text-indigo">
            {pesan}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[17px] font-extrabold text-text">Data Kelas ({kelasList.length})</div>
          <button
            type="button"
            aria-label="Tambah Kelas"
            onClick={bukaTambah}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-brass text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] active:scale-[0.92]"
          >
            <CalendarPlus size={19} strokeWidth={2} />
          </button>
        </div>

        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama kelas atau guru..."
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

        {!loading && kelasTersaring.length === 0 && (
          <p className="text-[13px] text-text-dim">
            {cari.trim() ? 'Tidak ada yang cocok.' : 'Kelompok ini belum punya kelas.'}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {kelasTersaring.map((k) => {
            const guru = namaGuru(k.guru_id);
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => bukaUbah(k)}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-text">{k.nama}</div>
                  <div className="mt-0.5 text-[11.5px] text-text-faint">
                    {namaKategori(k.kategori_kbm_id)} · {k.ruangan} · {k.jam_mulai?.slice(0, 5)}–
                    {k.jam_selesai?.slice(0, 5)}
                  </div>
                  <div className="mt-1 text-[11.5px] font-semibold">
                    {guru ? (
                      <span className="text-sage">{guru}</span>
                    ) : (
                      <span className="text-brass">Belum ada guru pengampu</span>
                    )}
                  </div>
                </div>
                {k.status !== 'aktif' && (
                  <span className="shrink-0 rounded-full bg-panel-2 px-2.5 py-1 text-[10.5px] font-bold text-text-dim">
                    Tidak Aktif
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {formTerbuka && (
        <KelasForm
          awal={kelasDiubah}
          kategoriList={kategoriList}
          guruList={guruList}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpanKelas}
        />
      )}
    </main>
  );
}
