'use client';

/* Data Jamaah (Penerobos Kelp) — daftar + cari + saring per Sub Kelp +
   tambah/edit lewat JamaahForm. Satu SELECT jamaah + satu SELECT sub_kelp
   saat layar dibuka; saring & cari 100% di memori. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import EmptyState from '@/components/ui/EmptyState';
import PesanGalat from '@/components/ui/PesanGalat';
import JamaahForm from '@/components/jamaah/JamaahForm';
import { KOLOM_JAMAAH, type JamaahRow, type SubKelp } from '@/lib/jamaah';

export default function JamaahList() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [subKelp, setSubKelp] = useState<SubKelp[]>([]);
  const [jamaah, setJamaah] = useState<JamaahRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');
  const [subAktif, setSubAktif] = useState<number | 'semua' | 'tanpa'>('semua');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [jamaahDiubah, setJamaahDiubah] = useState<JamaahRow | null>(null);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [rSub, rJam] = await Promise.all([
      supabase
        .from('sub_kelp')
        .select('id, kelompok_id, nama, keterangan')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama'),
      supabase
        .from('jamaah')
        .select(KOLOM_JAMAAH)
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama'),
    ]);
    if (rJam.error) setError(rJam.error.message);
    else setJamaah((rJam.data ?? []) as unknown as JamaahRow[]);
    setSubKelp((rSub.data ?? []) as unknown as SubKelp[]);
    setLoading(false);
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaSub = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of subKelp) m.set(s.id, s.nama);
    return m;
  }, [subKelp]);

  const tersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    return jamaah.filter((j) => {
      if (subAktif === 'tanpa' && j.sub_kelp_id != null) return false;
      if (typeof subAktif === 'number' && j.sub_kelp_id !== subAktif) return false;
      if (!term) return true;
      return (
        j.nama.toLowerCase().includes(term) ||
        (j.nama_panggilan ?? '').toLowerCase().includes(term) ||
        (j.no_wa ?? '').includes(term) ||
        (j.pekerjaan ?? '').toLowerCase().includes(term)
      );
    });
  }, [jamaah, cari, subAktif]);

  function bukaTambah() {
    setJamaahDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(j: JamaahRow) {
    setJamaahDiubah(j);
    setFormTerbuka(true);
  }
  function selesaiForm() {
    setFormTerbuka(false);
    muat();
  }

  return (
    <div className="px-[18px] pt-4 pb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[17px] font-extrabold text-text">Data Jamaah ({jamaah.length})</div>
        <button
          type="button"
          aria-label="Tambah jamaah"
          onClick={bukaTambah}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-navy text-white shadow-[0_4px_12px_rgba(29,78,216,0.28)] active:scale-[0.92]"
        >
          <UserPlus size={19} strokeWidth={2} />
        </button>
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" />
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama, no. WA, pekerjaan…"
          className="w-full rounded-[var(--radius)] border border-border bg-panel py-2.5 pr-3.5 pl-9 text-[13px] text-text focus:border-navy focus:outline-none"
        />
      </div>

      {subKelp.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {(
            [
              { k: 'semua' as const, label: 'Semua' },
              ...subKelp.map((s) => ({ k: s.id, label: s.nama })),
              { k: 'tanpa' as const, label: 'Tanpa Sub Kelp' },
            ]
          ).map((c) => {
            const on = subAktif === c.k;
            return (
              <button
                key={String(c.k)}
                type="button"
                onClick={() => setSubAktif(c.k)}
                className={`flex shrink-0 items-center rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 text-[13px] font-bold whitespace-nowrap active:scale-[0.96] ${
                  on ? 'border-navy bg-navy-lembut text-navy' : 'border-border bg-panel text-text'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <SkeletonKartuList />
      ) : tersaring.length === 0 ? (
        cari.trim() || subAktif !== 'semua' ? (
          <p className="text-[13px] text-text-dim">Tidak ada jamaah yang cocok.</p>
        ) : (
          <EmptyState
            ikon={<UserPlus size={22} />}
            judul="Belum ada jamaah"
            deskripsi="Tambahkan data jamaah pengajian kelompok Anda."
            aksi={{ label: 'Tambah Jamaah', onClick: bukaTambah }}
          />
        )
      ) : (
        <div className="flex flex-col gap-2.5">
          {tersaring.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => bukaUbah(j)}
              className="flex items-center justify-between gap-3 rounded-card border-[1.5px] border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-text">{j.nama}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-text-dim">
                  {[
                    j.gender === 'L' ? 'Laki-laki' : j.gender === 'P' ? 'Perempuan' : null,
                    j.status_keluarga,
                    j.pekerjaan,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Data belum lengkap'}
                </div>
              </div>
              {j.sub_kelp_id != null && namaSub.has(j.sub_kelp_id) && (
                <span className="shrink-0 rounded-full bg-navy-lembut px-2.5 py-1 text-[10.5px] font-bold text-navy">
                  {namaSub.get(j.sub_kelp_id)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {formTerbuka && (
        <JamaahForm
          jamaah={jamaahDiubah}
          jamaahList={jamaah}
          subKelpList={subKelp}
          onSelesai={selesaiForm}
          onBatal={() => setFormTerbuka(false)}
        />
      )}
    </div>
  );
}
