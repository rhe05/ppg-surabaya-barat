'use client';

/* Input Kehadiran satu Acara. Muat acara + jamaah (disaring sub_kelp acara
   kalau ada) + kehadiran yang sudah ada. Simpan = upsert baris bertanda +
   hapus baris yang tanda-nya dilepas. Satu lintasan, tanpa await di loop. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import PesanGalat from '@/components/ui/PesanGalat';
import { useToast } from '@/components/ui/useToast';
import AcaraForm from '@/components/jamaah/AcaraForm';
import {
  KOLOM_ACARA,
  STATUS_HADIR,
  type JamaahAcara,
  type JamaahRow,
  type SubKelp,
  type StatusHadir,
} from '@/lib/jamaah';
import { PESAN_PENGUNJUNG_HANYA_LIHAT } from '@/lib/pengunjung';

type JamaahRingkas = Pick<JamaahRow, 'id' | 'nama' | 'gender' | 'sub_kelp_id'>;

function tglIndo(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function InputKehadiran({ acaraId }: { acaraId: number }) {
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [acara, setAcara] = useState<JamaahAcara | null>(null);
  const [subKelp, setSubKelp] = useState<SubKelp[]>([]);
  const [jamaah, setJamaah] = useState<JamaahRingkas[]>([]);
  const [pilihan, setPilihan] = useState<Record<number, StatusHadir>>({});
  const [awal, setAwal] = useState<Record<number, StatusHadir>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);
  const [editAcara, setEditAcara] = useState(false);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const rA = await supabase.from('jamaah_acara').select(KOLOM_ACARA).eq('id', acaraId).maybeSingle();
    if (rA.error || !rA.data) {
      setError(rA.error?.message ?? 'Acara tidak ditemukan.');
      setLoading(false);
      return;
    }
    const ac = rA.data as unknown as JamaahAcara;
    setAcara(ac);

    let qJ = supabase
      .from('jamaah')
      .select('id, nama, gender, sub_kelp_id')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama');
    if (ac.sub_kelp_id != null) qJ = qJ.eq('sub_kelp_id', ac.sub_kelp_id);

    const [rJ, rK, rS] = await Promise.all([
      qJ,
      supabase.from('jamaah_kehadiran').select('jamaah_id, status').eq('acara_id', acaraId),
      supabase
        .from('sub_kelp')
        .select('id, kelompok_id, nama, keterangan')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama'),
    ]);
    if (rJ.error) {
      setError(rJ.error.message);
      setLoading(false);
      return;
    }
    setJamaah((rJ.data ?? []) as unknown as JamaahRingkas[]);
    setSubKelp((rS.data ?? []) as unknown as SubKelp[]);
    const map: Record<number, StatusHadir> = {};
    for (const r of rK.data ?? []) map[r.jamaah_id] = r.status as StatusHadir;
    setPilihan(map);
    setAwal(map);
    setLoading(false);
  }, [kelompokId, acaraId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const ringkas = useMemo(() => {
    const c = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    for (const j of jamaah) {
      const s = pilihan[j.id];
      if (s) c[s] += 1;
    }
    return c;
  }, [jamaah, pilihan]);

  const adaPerubahan = useMemo(() => {
    const ids = new Set([...Object.keys(pilihan), ...Object.keys(awal)]);
    for (const id of ids) if (pilihan[Number(id)] !== awal[Number(id)]) return true;
    return false;
  }, [pilihan, awal]);

  function set(jamaahId: number, status: StatusHadir) {
    setPilihan((p) => {
      const next = { ...p };
      if (next[jamaahId] === status) delete next[jamaahId];
      else next[jamaahId] = status;
      return next;
    });
  }

  function semuaHadir() {
    const next: Record<number, StatusHadir> = { ...pilihan };
    for (const j of jamaah) if (!next[j.id]) next[j.id] = 'hadir';
    setPilihan(next);
  }

  async function simpan() {
    if (!adaPerubahan) return;
    if (profile?.role === 'pengunjung') {
      setError(PESAN_PENGUNJUNG_HANYA_LIHAT);
      return;
    }
    setMenyimpan(true);
    setError(null);

    const upsert: { acara_id: number; jamaah_id: number; status: StatusHadir; dicatat_oleh: string | null }[] =
      [];
    const hapus: number[] = [];
    for (const j of jamaah) {
      const s = pilihan[j.id];
      if (s && s !== awal[j.id]) {
        upsert.push({ acara_id: acaraId, jamaah_id: j.id, status: s, dicatat_oleh: profile?.id ?? null });
      } else if (!s && awal[j.id]) {
        hapus.push(j.id);
      }
    }

    try {
      if (upsert.length > 0) {
        const { error: e } = await supabase
          .from('jamaah_kehadiran')
          .upsert(upsert, { onConflict: 'acara_id,jamaah_id' });
        if (e) throw new Error(e.message);
      }
      if (hapus.length > 0) {
        const { error: e } = await supabase
          .from('jamaah_kehadiran')
          .delete()
          .eq('acara_id', acaraId)
          .in('jamaah_id', hapus);
        if (e) throw new Error(e.message);
      }
      setAwal({ ...pilihan });
      toast.sukses('Kehadiran tersimpan.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="px-[18px] pt-4 pb-[120px]">
      <button
        type="button"
        onClick={() => router.push('/jamaah/kehadiran')}
        className="mb-3 flex items-center gap-1.5 text-[12.5px] font-bold text-text-dim"
      >
        <ArrowLeft size={15} /> Semua Acara
      </button>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <SkeletonKartuList />
      ) : acara ? (
        <>
          <div className="mb-4 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[15px] font-extrabold text-text">{acara.judul}</div>
                <div className="mt-0.5 text-[11.5px] text-text-dim">
                  {tglIndo(acara.tanggal)}
                  {acara.tempat ? ` · ${acara.tempat}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditAcara(true)}
                aria-label="Ubah acara"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
              >
                <Pencil size={14} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {STATUS_HADIR.map((st) => (
                <div key={st.kunci} className="flex flex-col items-center rounded-[10px] bg-panel-2 px-1 py-2">
                  <span className="text-[16px] leading-none font-extrabold tabular-nums" style={{ color: st.warna }}>
                    {ringkas[st.kunci]}
                  </span>
                  <span className="mt-1 text-[9.5px] font-bold tracking-[0.02em] text-text-dim">{st.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12px] font-bold text-text-dim">
              {jamaah.length} jamaah
              {acara.sub_kelp_id != null
                ? ` · ${subKelp.find((s) => s.id === acara.sub_kelp_id)?.nama ?? 'Sub Kelp'}`
                : ''}
            </span>
            <button
              type="button"
              onClick={semuaHadir}
              className="rounded-full border border-navy px-3 py-1 text-[11.5px] font-bold text-navy active:scale-95"
            >
              Semua Hadir
            </button>
          </div>

          {jamaah.length === 0 ? (
            <p className="text-[13px] text-text-dim">
              Belum ada jamaah{acara.sub_kelp_id != null ? ' di Sub Kelp ini' : ''}.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {jamaah.map((j) => {
                const s = pilihan[j.id];
                return (
                  <div key={j.id} className="rounded-card border border-border bg-panel p-3 shadow-[var(--shadow-subtle)]">
                    <div className="mb-2 truncate text-[13.5px] font-bold text-text">
                      {j.nama}
                      {j.gender && (
                        <span className="ml-1.5 text-[11px] font-semibold text-text-faint">
                          {j.gender === 'L' ? 'L' : 'P'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {STATUS_HADIR.map((st) => {
                        const on = s === st.kunci;
                        return (
                          <button
                            key={st.kunci}
                            type="button"
                            onClick={() => set(j.id, st.kunci)}
                            className="flex items-center justify-center gap-1 rounded-[8px] border-[1.5px] py-1.5 text-[11.5px] font-bold active:scale-95"
                            style={
                              on
                                ? { borderColor: st.warna, background: st.pill, color: st.warna }
                                : { borderColor: 'var(--border)', color: 'var(--text-faint)' }
                            }
                          >
                            {on && <Check size={11} strokeWidth={3} />}
                            {st.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : null}

      {!loading && acara && jamaah.length > 0 && (
        <div className="bilah-aksi-bawah px-[18px] py-3">
          <div className="mx-auto max-w-[430px]">
            <button
              type="button"
              onClick={simpan}
              disabled={!adaPerubahan || menyimpan}
              className="w-full rounded-[var(--radius-button)] border-none bg-navy px-5 py-3 text-[14px] font-extrabold text-white active:scale-[0.98] disabled:opacity-40"
            >
              {menyimpan ? 'Menyimpan…' : adaPerubahan ? 'Simpan Kehadiran' : 'Tersimpan'}
            </button>
          </div>
        </div>
      )}

      {editAcara && acara && (
        <AcaraForm
          acara={acara}
          subKelpList={subKelp}
          onSelesai={() => {
            setEditAcara(false);
            muat();
          }}
          onBatal={() => setEditAcara(false)}
        />
      )}
    </div>
  );
}
