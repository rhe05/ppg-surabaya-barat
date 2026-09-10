'use client';

/* Kelola Sub Kelp (pembagian dalam satu kelompok utk pengajian).
   Daftar + tambah + rename + nonaktif (soft-delete via deleted_at). */

import { useCallback, useEffect, useState } from 'react';
import { Plus, Layers, Pencil, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import EmptyState from '@/components/ui/EmptyState';
import PesanGalat from '@/components/ui/PesanGalat';
import type { SubKelp } from '@/lib/jamaah';

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[13px] text-text focus:border-navy focus:outline-none';

export default function SubKelpManager() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [list, setList] = useState<SubKelp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simpan, setSimpan] = useState(false);

  const [namaBaru, setNamaBaru] = useState('');
  const [ketBaru, setKetBaru] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editKet, setEditKet] = useState('');

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('sub_kelp')
      .select('id, kelompok_id, nama, keterangan')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama');
    if (err) setError(err.message);
    else setList((data ?? []) as unknown as SubKelp[]);
    setLoading(false);
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function tambah() {
    if (!kelompokId || !namaBaru.trim()) return;
    setSimpan(true);
    setError(null);
    const { error: err } = await supabase.from('sub_kelp').insert({
      kelompok_id: kelompokId,
      nama: namaBaru.trim(),
      keterangan: ketBaru.trim() || null,
    });
    setSimpan(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNamaBaru('');
    setKetBaru('');
    muat();
  }

  function mulaiEdit(s: SubKelp) {
    setEditId(s.id);
    setEditNama(s.nama);
    setEditKet(s.keterangan ?? '');
  }

  async function simpanEdit() {
    if (editId == null || !editNama.trim()) return;
    setSimpan(true);
    setError(null);
    const { error: err } = await supabase
      .from('sub_kelp')
      .update({ nama: editNama.trim(), keterangan: editKet.trim() || null })
      .eq('id', editId);
    setSimpan(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditId(null);
    muat();
  }

  async function nonaktif(id: number) {
    setSimpan(true);
    setError(null);
    const { error: err } = await supabase
      .from('sub_kelp')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    setSimpan(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEditId(null);
    muat();
  }

  return (
    <div className="px-[18px] pt-4 pb-10">
      <div className="mb-1 text-[17px] font-extrabold text-text">Kelola Sub Kelp</div>
      <p className="mb-4 text-[12px] text-text-dim">
        Pembagian jamaah dalam kelompok Anda (mis. Jamaah Bapak, Jamaah Ibu, Umum).
      </p>

      <div className="mb-4 rounded-card border border-border bg-panel-2 p-3.5">
        <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Nama Sub Kelp baru</label>
        <input
          className={INPUT}
          value={namaBaru}
          onChange={(e) => setNamaBaru(e.target.value)}
          placeholder="mis. Jamaah Bapak"
        />
        <input
          className={`${INPUT} mt-2`}
          value={ketBaru}
          onChange={(e) => setKetBaru(e.target.value)}
          placeholder="Keterangan (opsional)"
        />
        <button
          type="button"
          onClick={tambah}
          disabled={simpan || !namaBaru.trim()}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border-none bg-navy px-4 py-2.5 text-[13px] font-extrabold text-white active:scale-[0.98] disabled:opacity-50"
        >
          <Plus size={15} strokeWidth={2.5} />
          Tambah Sub Kelp
        </button>
      </div>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <SkeletonKartuList />
      ) : list.length === 0 ? (
        <EmptyState
          ikon={<Layers size={22} />}
          judul="Belum ada Sub Kelp"
          deskripsi="Tambahkan minimal satu sub kelp untuk mengelompokkan jamaah."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {list.map((s) =>
            editId === s.id ? (
              <div key={s.id} className="rounded-card border-[1.5px] border-navy bg-panel p-3.5">
                <input className={INPUT} value={editNama} onChange={(e) => setEditNama(e.target.value)} />
                <input
                  className={`${INPUT} mt-2`}
                  value={editKet}
                  onChange={(e) => setEditKet(e.target.value)}
                  placeholder="Keterangan (opsional)"
                />
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={simpanEdit}
                    disabled={simpan || !editNama.trim()}
                    className="flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    <Check size={13} /> Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditId(null)}
                    className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-text-dim"
                  >
                    <X size={13} /> Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => nonaktif(s.id)}
                    disabled={simpan}
                    className="ml-auto text-[12px] font-bold text-red disabled:opacity-50"
                  >
                    Nonaktifkan
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-text">{s.nama}</div>
                  {s.keterangan && (
                    <div className="mt-0.5 truncate text-[11.5px] text-text-dim">{s.keterangan}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => mulaiEdit(s)}
                  aria-label="Ubah"
                  className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
                >
                  <Pencil size={14} />
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
