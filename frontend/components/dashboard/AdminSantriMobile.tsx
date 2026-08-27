'use client';

/* "Data Generus" — mobile admin_kelompok (2026-08-26), dibuka dari hub
   Data Master (app/data-master/page.tsx). Gaya kartu sama persis dgn
   DataGenerusContent milik guru (app/santri-saya/page.tsx), bedanya:

   - Guru dikunci ke SATU kelas yang dia ampu (KelasGate); admin_kelompok
     melihat SELURUH santri kelompoknya lintas kelas sekaligus, jadi tidak
     ada gerbang pilih kelas -- kelas ditampilkan sbg keterangan per kartu.
   - Tambah/Ubah langsung tersimpan (RPC tambah_santri / UPDATE, sama
     dgn SantriList.tsx desktop) -- BUKAN ajukan_permintaan_generus,
     karena jalur approval itu khusus aksi yang diajukan GURU (migrasi
     20260821180000); admin_kelompok sendiri sudah py hak tulis langsung.
   - Tidak ada aksi massal (Pindah/Naik Kelas/Non Aktif) -- itu tetap
     lewat antrean Persetujuan Generus kalau diajukan guru; admin yang
     mau mengubah satu-satu cukup buka kartu -> form Ubah, field2 itu
     (jenjang, kelas ngaji, dst) semua ada di SantriForm biasa. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AdminHeader from '@/components/dashboard/AdminHeader';
import SantriForm, { SantriRow, KOLOM_SANTRI } from '@/components/santri/SantriForm';

const JENJANG_SINGKAT: Record<string, string> = {
  'PAUD/TK': 'PAUD/TK',
  'Cabe Rawit': 'Cabe Rawit',
  'Pra Remaja': 'Pra Remaja',
  'Remaja SMA': 'Remaja SMA',
  Remaja: 'Remaja',
};

export default function AdminSantriMobile() {
  const [santri, setSantri] = useState<SantriRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [santriDiubah, setSantriDiubah] = useState<SantriRow | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('santri')
      .select(KOLOM_SANTRI)
      .is('deleted_at', null)
      .order('nama');
    if (err) setError(err.message);
    else setSantri((data ?? []) as unknown as SantriRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const santriTersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    if (!term) return santri;
    return santri.filter(
      (s) =>
        s.nama.toLowerCase().includes(term) ||
        (s.nis ?? '').toLowerCase().includes(term) ||
        (s.kelas_ngaji ?? '').toLowerCase().includes(term),
    );
  }, [santri, cari]);

  function bukaTambah() {
    setSantriDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(s: SantriRow) {
    setSantriDiubah(s);
    setFormTerbuka(true);
  }
  function selesaiForm() {
    const baru = santriDiubah === null;
    setFormTerbuka(false);
    setSantriDiubah(null);
    muat();
    setPesan(baru ? 'Generus baru tersimpan.' : 'Perubahan tersimpan.');
    setTimeout(() => setPesan(null), 4000);
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Data Generus" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        {pesan && (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-indigo bg-[#EEF2FF] px-4 py-3 text-[13px] font-semibold text-indigo">
            {pesan}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[17px] font-extrabold text-text">Data Generus ({santri.length})</div>
          <button
            type="button"
            aria-label="Tambah Generus"
            onClick={bukaTambah}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-brass text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] active:scale-[0.92]"
          >
            <UserPlus size={19} strokeWidth={2} />
          </button>
        </div>

        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama, NIS, atau kelas..."
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

        {!loading && santriTersaring.length === 0 && (
          <p className="text-[13px] text-text-dim">
            {cari.trim() ? 'Tidak ada yang cocok.' : 'Belum ada generus terdaftar.'}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {santriTersaring.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => bukaUbah(s)}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-text">{s.nama}</div>
                <div className="mt-0.5 text-[11.5px] text-text-dim">
                  NIS {s.nis ?? '-'} ·{' '}
                  {s.gender === 'L' ? 'Laki-laki' : s.gender === 'P' ? 'Perempuan' : '-'}
                  {s.kelas_ngaji ? ` · ${s.kelas_ngaji}` : ''}
                </div>
              </div>
              {s.jenjang_saat_ini && (
                <span className="shrink-0 rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[10.5px] font-bold text-sage">
                  {JENJANG_SINGKAT[s.jenjang_saat_ini] ?? s.jenjang_saat_ini}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {formTerbuka && (
        <SantriForm santri={santriDiubah} onSelesai={selesaiForm} onBatal={() => setFormTerbuka(false)} />
      )}
    </main>
  );
}
