'use client';

/* Halaman "Permintaan Generus" — Admin Kelp (+ admin_desa/admin_ppg di
   atasnya) menyetujui/menolak 5 aksi Data Generus yang diajukan guru
   (migrasi 20260821180000: tambah/pindah kelas/naik kelas/pindah
   domisili/non aktif). Sebelum migrasi ini kelima aksi itu langsung
   berlaku begitu guru menekan tombol -- sekarang wajib lewat sini dulu.

   RLS permintaan_generus_select_scoped sudah membatasi baris yang
   terlihat (admin_kelompok -> kelompoknya, admin_desa -> desanya,
   admin_ppg -> semua), jadi query di sini tidak perlu filter kelompok
   manual -- sama pola dgn SantriList.tsx. */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import AdminHeader from '@/components/dashboard/AdminHeader';
import { supabase } from '@/lib/supabase';

type Tersemat = { nama: string } | { nama: string }[] | null;
type Permintaan = {
  id: number;
  jenis: string;
  ringkasan: string;
  status: 'pending' | 'approved' | 'rejected';
  diajukan_pada: string;
  guru: Tersemat;
  kelompok: Tersemat;
};

const LABEL_JENIS: Record<string, string> = {
  tambah: 'Tambah Generus',
  pindah_kelas: 'Pindah Kelas',
  naik_kelas: 'Naik Kelas',
  pindah_domisili: 'Pindah Domisili',
  non_aktif: 'Non Aktif',
};

function namaDari(v: Tersemat) {
  if (!v) return '-';
  const baris = Array.isArray(v) ? v[0] : v;
  return baris?.nama ?? '-';
}

function formatTanggal(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TolakModal({
  permintaan,
  onKonfirmasi,
  onBatal,
}: {
  permintaan: Permintaan;
  onKonfirmasi: (catatan: string) => Promise<void>;
  onBatal: () => void;
}) {
  const [catatan, setCatatan] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function konfirmasi() {
    setMenyimpan(true);
    setError(null);
    try {
      await onKonfirmasi(catatan);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menolak.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-1 text-[16px] font-bold text-text">Tolak Permintaan</h2>
        <p className="mb-4 text-[13px] text-text-dim">{permintaan.ringkasan}</p>
        <label className="mb-1.5 block text-[12px] font-semibold text-text">
          Alasan (opsional, terlihat oleh guru)
        </label>
        <textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={3}
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />
        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={menyimpan}
            onClick={konfirmasi}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-red bg-red px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {menyimpan ? 'Menolak...' : 'Tolak'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermintaanGenerusContent() {
  const [daftar, setDaftar] = useState<Permintaan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<number | null>(null);
  const [ditolak, setDitolak] = useState<Permintaan | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('permintaan_generus')
      .select('id, jenis, ringkasan, status, diajukan_pada, guru:guru_id(nama), kelompok:kelompok_id(nama)')
      .eq('status', 'pending')
      .order('diajukan_pada', { ascending: true });
    if (err) setError(err.message);
    else setDaftar((data ?? []) as unknown as Permintaan[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  async function setujui(p: Permintaan) {
    setSibuk(p.id);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('putuskan_permintaan_generus', {
        p: { permintaan_id: p.id, keputusan: 'approved' },
      });
      if (err) throw new Error(err.message);
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyetujui.');
    } finally {
      setSibuk(null);
    }
  }

  async function tolak(catatan: string) {
    if (!ditolak) return;
    const { error: err } = await supabase.rpc('putuskan_permintaan_generus', {
      p: { permintaan_id: ditolak.id, keputusan: 'rejected', catatan },
    });
    if (err) throw new Error(err.message);
    setDitolak(null);
    await muat();
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Permintaan Generus" />

      {ditolak && (
        <TolakModal permintaan={ditolak} onKonfirmasi={tolak} onBatal={() => setDitolak(null)} />
      )}

      <div className="mx-auto w-full max-w-[900px] px-5 pt-5 pb-10">
        <p className="mb-5 text-[13px] text-text-dim">
          Permintaan guru yang menunggu keputusan Anda -- Tambah Generus, Pindah Kelas, Naik
          Kelas, Pindah Domisili, dan Non Aktif tidak berlaku sampai disetujui di sini.
        </p>

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
        {!loading && daftar.length === 0 && (
          <p className="text-[13px] text-text-dim">Tidak ada permintaan yang menunggu.</p>
        )}

        <div className="flex flex-col gap-3">
          {daftar.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-3 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[rgba(217,119,6,0.12)] px-2.5 py-1 text-[10.5px] font-bold text-brass">
                    {LABEL_JENIS[p.jenis] ?? p.jenis}
                  </span>
                  <span className="text-[11.5px] text-text-faint">
                    {namaDari(p.guru)} · {namaDari(p.kelompok)} · {formatTanggal(p.diajukan_pada)}
                  </span>
                </div>
                <p className="text-[13.5px] text-text">{p.ringkasan}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setDitolak(p)}
                  disabled={sibuk === p.id}
                  className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2 text-[13px] font-semibold text-text disabled:opacity-40"
                >
                  Tolak
                </button>
                <button
                  type="button"
                  onClick={() => setujui(p)}
                  disabled={sibuk === p.id}
                  className="cursor-pointer rounded-[var(--radius)] border border-sage bg-sage px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
                >
                  {sibuk === p.id ? 'Memproses...' : 'Setujui'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function PermintaanGenerusPage() {
  return (
    <RequireAuth>
      <PermintaanGenerusContent />
    </RequireAuth>
  );
}
