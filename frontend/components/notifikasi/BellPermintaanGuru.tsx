'use client';

/* Lonceng "Permintaan Masuk" utk GURU (top bar JurnalHeaderChrome.tsx +
   GuruDashboard.tsx) -- menampilkan status 5 aksi Data Generus yang sudah
   diajukan (migrasi 20260821180000: tambah/pindah kelas/naik kelas/
   pindah domisili/non aktif, SEMUA wajib lewat persetujuan Admin Kelp).

   Badge angka = jumlah permintaan yang SUDAH DIPUTUSKAN (approved/
   rejected) TAPI belum ditandai dibaca guru (guru_dibaca=false) -- bukan
   jumlah pending, krn owner minta lonceng ini utk "info sudah
   terkonfirmasi", bukan pengingat menunggu. Dropdown tetap menampilkan
   SEMUA (termasuk yang masih pending) supaya guru bisa memantau progres.

   Ditandai dibaca OTOMATIS begitu dropdown dibuka (bukan per-item) --
   cukup utk kebutuhan saat ini, konsisten dgn pola "buka = sudah lihat"
   yang umum di notifikasi semacam ini. */

import { useCallback, useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type Permintaan = {
  id: number;
  jenis: string;
  ringkasan: string;
  status: 'pending' | 'approved' | 'rejected';
  catatan_admin: string | null;
  diajukan_pada: string;
  diputuskan_pada: string | null;
  guru_dibaca: boolean;
};

const LABEL_STATUS: Record<string, { label: string; kelas: string }> = {
  pending: { label: 'Menunggu', kelas: 'text-brass bg-[rgba(217,119,6,0.12)]' },
  approved: { label: 'Disetujui', kelas: 'text-sage bg-[rgba(5,150,105,0.12)]' },
  rejected: { label: 'Ditolak', kelas: 'text-red bg-[rgba(220,38,38,0.12)]' },
};

function formatTanggal(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BellPermintaanGuru() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const [daftar, setDaftar] = useState<Permintaan[]>([]);
  const [terbuka, setTerbuka] = useState(false);

  const muat = useCallback(async () => {
    if (!guruId) return;
    const { data } = await supabase
      .from('permintaan_generus')
      .select('id, jenis, ringkasan, status, catatan_admin, diajukan_pada, diputuskan_pada, guru_dibaca')
      .eq('guru_id', guruId)
      .order('diajukan_pada', { ascending: false })
      .limit(20);
    setDaftar((data ?? []) as Permintaan[]);
  }, [guruId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const belumDibaca = daftar.filter((r) => r.status !== 'pending' && !r.guru_dibaca).length;

  async function toggle() {
    const buka = !terbuka;
    setTerbuka(buka);
    if (!buka) return;

    const idBelumDibaca = daftar.filter((r) => r.status !== 'pending' && !r.guru_dibaca).map((r) => r.id);
    if (idBelumDibaca.length === 0) return;
    await supabase.from('permintaan_generus').update({ guru_dibaca: true }).in('id', idBelumDibaca);
    setDaftar((s) => s.map((r) => (idBelumDibaca.includes(r.id) ? { ...r, guru_dibaca: true } : r)));
  }

  if (!guruId) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Permintaan Masuk"
        onClick={toggle}
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
      >
        <Bell size={20} strokeWidth={2} />
        {belumDibaca > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red px-[3px] text-[9px] font-bold text-white">
            {belumDibaca > 9 ? '9+' : belumDibaca}
          </span>
        )}
      </button>

      {terbuka && (
        <>
          <div className="fixed inset-0 z-[590]" onClick={() => setTerbuka(false)} />
          <div className="absolute top-full right-0 z-[591] mt-2 max-h-[70vh] w-[300px] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
            <div className="px-2 py-1.5 text-[12px] font-bold tracking-[0.02em] text-text-faint uppercase">
              Permintaan Data Generus
            </div>
            {daftar.length === 0 && (
              <p className="px-2 py-3 text-[12.5px] text-text-dim">Belum ada permintaan.</p>
            )}
            {daftar.map((r) => {
              const st = LABEL_STATUS[r.status];
              return (
                <div key={r.id} className="rounded-[10px] px-2 py-2.5 hover:bg-bg">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.kelas}`}>
                      {st.label}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-text-faint">
                      {formatTanggal(r.diputuskan_pada ?? r.diajukan_pada)}
                    </span>
                  </div>
                  <p className="text-[12.5px] leading-snug text-text">{r.ringkasan}</p>
                  {r.catatan_admin && (
                    <p className="mt-0.5 text-[11.5px] leading-snug text-text-faint">
                      Catatan Admin: {r.catatan_admin}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
