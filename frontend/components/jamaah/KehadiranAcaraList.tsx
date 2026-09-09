'use client';

/* Daftar Acara pengajian jamaah + buat acara baru. Tap acara -> layar
   Input Kehadiran (/jamaah/kehadiran/[acaraId]). */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, CalendarCheck, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import EmptyState from '@/components/ui/EmptyState';
import PesanGalat from '@/components/ui/PesanGalat';
import AcaraForm from '@/components/jamaah/AcaraForm';
import { KOLOM_ACARA, type JamaahAcara, type SubKelp } from '@/lib/jamaah';

function tglIndo(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function KehadiranAcaraList() {
  const router = useRouter();
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [acara, setAcara] = useState<JamaahAcara[]>([]);
  const [subKelp, setSubKelp] = useState<SubKelp[]>([]);
  const [hitung, setHitung] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formTerbuka, setFormTerbuka] = useState(false);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [rA, rS] = await Promise.all([
      supabase
        .from('jamaah_acara')
        .select(KOLOM_ACARA)
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('tanggal', { ascending: false })
        .limit(60),
      supabase
        .from('sub_kelp')
        .select('id, kelompok_id, nama, keterangan')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama'),
    ]);
    if (rA.error) {
      setError(rA.error.message);
      setLoading(false);
      return;
    }
    const list = (rA.data ?? []) as unknown as JamaahAcara[];
    setAcara(list);
    setSubKelp((rS.data ?? []) as unknown as SubKelp[]);

    /* Jumlah hadir per acara — satu query untuk semua acara sekaligus. */
    if (list.length > 0) {
      const { data: kh } = await supabase
        .from('jamaah_kehadiran')
        .select('acara_id, status')
        .in(
          'acara_id',
          list.map((a) => a.id),
        )
        .eq('status', 'hadir');
      const h: Record<number, number> = {};
      for (const r of kh ?? []) h[r.acara_id] = (h[r.acara_id] ?? 0) + 1;
      setHitung(h);
    } else {
      setHitung({});
    }
    setLoading(false);
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaSub = new Map(subKelp.map((s) => [s.id, s.nama]));

  return (
    <div className="px-[18px] pt-4 pb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[17px] font-extrabold text-text">Kehadiran</div>
        <button
          type="button"
          onClick={() => setFormTerbuka(true)}
          className="flex items-center gap-1.5 rounded-full border-none bg-navy px-3.5 py-2 text-[12.5px] font-bold text-white shadow-[0_4px_12px_rgba(29,78,216,0.28)] active:scale-[0.96]"
        >
          <CalendarPlus size={15} strokeWidth={2.5} />
          Buat Acara
        </button>
      </div>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <SkeletonKartuList />
      ) : acara.length === 0 ? (
        <EmptyState
          ikon={<CalendarCheck size={22} />}
          judul="Belum ada acara"
          deskripsi="Buat acara/pengajian dulu, lalu catat kehadiran jamaahnya."
          aksi={{ label: 'Buat Acara', onClick: () => setFormTerbuka(true) }}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {acara.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => router.push(`/jamaah/kehadiran/${a.id}`)}
              className="flex items-center gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-text">{a.judul}</div>
                <div className="mt-0.5 text-[11.5px] text-text-dim">
                  {tglIndo(a.tanggal)}
                  {a.sub_kelp_id != null && namaSub.has(a.sub_kelp_id)
                    ? ` · ${namaSub.get(a.sub_kelp_id)}`
                    : ' · Gabungan'}
                </div>
                <div className="mt-1 inline-flex rounded-full bg-navy-lembut px-2 py-0.5 text-[10.5px] font-bold text-navy">
                  {hitung[a.id] ?? 0} hadir
                </div>
              </div>
              <ChevronRight size={16} className="shrink-0 text-text-faint" />
            </button>
          ))}
        </div>
      )}

      {formTerbuka && (
        <AcaraForm
          acara={null}
          subKelpList={subKelp}
          onSelesai={(id) => {
            setFormTerbuka(false);
            router.push(`/jamaah/kehadiran/${id}`);
          }}
          onBatal={() => setFormTerbuka(false)}
        />
      )}
    </div>
  );
}
