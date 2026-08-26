'use client';

/* "Riwayat Guru" — mobile admin_kelompok (2026-08-26), dibuka dari menu
   ikon di Data Guru (components/dashboard/GuruKelpMobile.tsx). Daftar
   guru yang ditandai Purna/Pindah lewat RPC nonaktifkan_guru (migrasi
   20260826160000_riwayat_guru_purna_pindah.sql) -- append-only ledger
   `riwayat_guru`, RLS scoped sama persis pola guru_select_scoped
   (admin_ppg semua, admin_desa kelompok2 di desanya, admin_kelompok
   kelompoknya sendiri), jadi query di sini TIDAK perlu filter
   kelompok_id manual utk keamanan, tapi tetap ditambahkan (konsisten
   dgn pola query lain di app ini + query lebih ringan). */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';

type RiwayatGuru = {
  id: number;
  nama: string;
  jenis: 'Purna' | 'Pindah';
  tanggal: string;
  keterangan: string | null;
};

const JENIS_WARNA: Record<string, string> = {
  Purna: 'text-indigo bg-[rgba(79,70,229,0.12)]',
  Pindah: 'text-brass bg-[rgba(217,119,6,0.12)]',
};

function formatTanggal(v: string) {
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  const NAMA_BULAN = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  return `${d} ${NAMA_BULAN[m - 1] ?? ''} ${y}`;
}

function RiwayatGuruContent() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [daftar, setDaftar] = useState<RiwayatGuru[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('riwayat_guru')
      .select('id, nama, jenis, tanggal, keterangan')
      .order('tanggal', { ascending: false });
    if (kelompokId) query = query.eq('kelompok_id', kelompokId);
    const { data, error: err } = await query;
    if (err) setError(err.message);
    else setDaftar((data ?? []) as unknown as RiwayatGuru[]);
    setLoading(false);
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const daftarTersaring = cari.trim()
    ? daftar.filter((r) => r.nama.toLowerCase().includes(cari.trim().toLowerCase()))
    : daftar;

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Riwayat Guru" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        <div className="mb-4 text-[17px] font-extrabold text-text">Riwayat Guru ({daftar.length})</div>

        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama guru..."
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

        {!loading && daftarTersaring.length === 0 && (
          <p className="text-[13px] text-text-dim">
            {cari.trim() ? 'Tidak ada yang cocok.' : 'Belum ada riwayat Purna/Pindah.'}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {daftarTersaring.map((r) => (
            <div key={r.id} className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[14px] font-bold text-text">{r.nama}</span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap ${
                    JENIS_WARNA[r.jenis] ?? 'text-text-dim bg-panel-2'
                  }`}
                >
                  {r.jenis}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-text-faint">
                Sejak {formatTanggal(r.tanggal)}
                {r.keterangan ? ` · ${r.keterangan}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function RiwayatGuruPage() {
  return (
    <RequireAuth>
      <RiwayatGuruContent />
    </RequireAuth>
  );
}
