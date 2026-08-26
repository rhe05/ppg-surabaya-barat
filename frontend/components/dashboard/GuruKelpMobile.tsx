'use client';

/* "Data Guru" — mobile admin_kelompok (2026-08-26), item baru di menu
   hamburger admin (MenuAdmin.tsx). Gaya kartu meniru DataGenerusContent
   (app/santri-saya/page.tsx) punya guru: judul + tombol bulat "+" di
   kanan, kotak cari, daftar kartu — satu tap kartu = buka form Ubah.

   Beda sengaja dari Data Generus:
   - Guru TIDAK lewat alur ajukan_permintaan_generus — admin_kelompok
     sudah punya hak tulis langsung ke tabel `guru` (policy
     guru_insert_admin/guru_update_admin, migrasi 20260818090000), jadi
     tombol "+" langsung buka GuruForm, tidak ada popup pilihan/mode
     centang massal.
   - Hapus TIDAK ada di sini — GuruList.tsx (desktop, /guru) sudah py
     tombol Hapus per baris; kartu mobile ini cuma menambah jalan
     tambah/ubah yang sebelumnya tidak bisa diakses dari HP sama sekali.
   - Reuse penuh GuruForm + KOLOM_GURU/GuruRow dari components/guru/
     GuruForm.tsx (form modal yang sama dipakai GuruList desktop) —
     tidak menduplikasi field/validasi. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AdminHeader from '@/components/dashboard/AdminHeader';
import GuruForm, { KOLOM_GURU, type GuruRow } from '@/components/guru/GuruForm';

const KATEGORI_WARNA: Record<string, string> = {
  'Muballigh Tugasan': 'text-indigo bg-[rgba(79,70,229,0.12)]',
  'Muballigh Setempat': 'text-sage bg-[rgba(5,150,105,0.12)]',
  'Guru Bantu': 'text-text-dim bg-panel-2',
  'Ketua Muda-i': 'text-brass bg-[rgba(217,119,6,0.12)]',
};

export default function GuruKelpMobile() {
  const [guru, setGuru] = useState<GuruRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [guruDiubah, setGuruDiubah] = useState<GuruRow | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('guru')
      .select(KOLOM_GURU)
      .is('deleted_at', null)
      .order('nama');
    if (err) setError(err.message);
    else setGuru((data ?? []) as unknown as GuruRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const guruTersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    if (!term) return guru;
    return guru.filter(
      (g) => g.nama.toLowerCase().includes(term) || (g.kategori ?? '').toLowerCase().includes(term),
    );
  }, [guru, cari]);

  function bukaTambah() {
    setGuruDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(g: GuruRow) {
    setGuruDiubah(g);
    setFormTerbuka(true);
  }
  function selesaiForm(baru: boolean) {
    setFormTerbuka(false);
    setGuruDiubah(null);
    muat();
    setPesan(baru ? 'Guru baru tersimpan.' : 'Perubahan tersimpan.');
    setTimeout(() => setPesan(null), 4000);
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Data Guru" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        {pesan && (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-indigo bg-[#EEF2FF] px-4 py-3 text-[13px] font-semibold text-indigo">
            {pesan}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[17px] font-extrabold text-text">Data Guru ({guru.length})</div>
          <button
            type="button"
            aria-label="Tambah Guru"
            onClick={bukaTambah}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-brass text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] active:scale-[0.92]"
          >
            <UserPlus size={19} strokeWidth={2} />
          </button>
        </div>

        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama atau kategori..."
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

        {!loading && guruTersaring.length === 0 && (
          <p className="text-[13px] text-text-dim">
            {cari.trim() ? 'Tidak ada yang cocok.' : 'Belum ada guru terdaftar.'}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {guruTersaring.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => bukaUbah(g)}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-text">{g.nama}</div>
                <div className="mt-0.5 text-[11.5px] text-text-faint">
                  {g.jenis_kelamin === 'L' ? 'Laki-laki' : g.jenis_kelamin === 'P' ? 'Perempuan' : '-'}
                  {g.nomor_wa ? ` · ${g.nomor_wa}` : ''}
                  {g.lama_mengajar ? ` · ${g.lama_mengajar}` : ''}
                </div>
              </div>
              {g.kategori && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap ${
                    KATEGORI_WARNA[g.kategori] ?? 'text-text-dim bg-panel-2'
                  }`}
                >
                  {g.kategori}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {formTerbuka && (
        <GuruForm
          guru={guruDiubah}
          onBatal={() => setFormTerbuka(false)}
          onSelesai={() => selesaiForm(guruDiubah === null)}
        />
      )}
    </main>
  );
}
