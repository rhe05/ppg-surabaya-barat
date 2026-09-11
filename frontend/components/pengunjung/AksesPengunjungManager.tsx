'use client';

/* Kelola link "Pengunjung" (fitur demo aplikasi, 2026-09-11) -- admin_ppg
   SAJA (ditegakkan jg oleh RLS pengunjung_akses). Buat link baru (token
   acak, berlaku 30 hari lewat default kolom di DB) + daftar link lama +
   tombol Cabut. Dipasang sbg card di /pengaturan, cuma dirender kalau
   adalahPpg (lihat pengaturan/page.tsx). */

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Ban, Link2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/useToast';

type Akses = {
  id: number;
  token: string;
  keterangan: string | null;
  dibuat_pada: string;
  berlaku_sampai: string;
  dicabut: boolean;
};

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[13px] text-text focus:border-brass focus:outline-none';

function formatTgl(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusAkses(a: Akses): { label: string; kelas: string } {
  if (a.dicabut) return { label: 'Dicabut', kelas: 'bg-red-lembut text-red' };
  if (new Date(a.berlaku_sampai) <= new Date()) return { label: 'Kadaluwarsa', kelas: 'bg-panel-2 text-text-faint' };
  return { label: 'Aktif', kelas: 'bg-sage-lembut text-sage' };
}

export default function AksesPengunjungManager() {
  const { push } = useToast();
  const { profile } = useAuth();
  const [list, setList] = useState<Akses[]>([]);
  const [loading, setLoading] = useState(true);
  const [keterangan, setKeterangan] = useState('');
  const [membuat, setMembuat] = useState(false);
  const [disalin, setDisalin] = useState<number | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pengunjung_akses')
      .select('id, token, keterangan, dibuat_pada, berlaku_sampai, dicabut')
      .order('dibuat_pada', { ascending: false });
    if (error) push(error.message, 'error');
    else setList((data ?? []) as Akses[]);
    setLoading(false);
  }, [push]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function buatLink() {
    setMembuat(true);
    const token =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    const { error } = await supabase
      .from('pengunjung_akses')
      .insert({ token, keterangan: keterangan.trim() || null, dibuat_oleh: profile?.id ?? null });
    setMembuat(false);
    if (error) {
      push(error.message, 'error');
      return;
    }
    setKeterangan('');
    push('Link Pengunjung dibuat — berlaku 30 hari.', 'sukses');
    await muat();
  }

  async function cabut(id: number) {
    const { error } = await supabase.from('pengunjung_akses').update({ dicabut: true }).eq('id', id);
    if (error) {
      push(error.message, 'error');
      return;
    }
    push('Link dicabut.', 'sukses');
    await muat();
  }

  function salinLink(a: Akses) {
    const url = `${window.location.origin}/pengunjung/${a.token}`;
    navigator.clipboard?.writeText(url);
    setDisalin(a.id);
    setTimeout(() => setDisalin((v) => (v === a.id ? null : v)), 1500);
  }

  return (
    <div>
      <p className="mb-4 text-[12px] text-text-dim">
        Link demo aplikasi (data contoh, read-only) — siapa pun yang membukanya cukup masuk
        dengan Google, tanpa perlu didaftarkan. Berlaku 30 hari sejak dibuat.
      </p>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <input
          className={INPUT + ' min-w-[220px] flex-1'}
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder="Keterangan (opsional) — mis. untuk calon mitra Kelompok X"
        />
        <button
          type="button"
          onClick={buatLink}
          disabled={membuat}
          className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border-none bg-brass px-4 py-2 text-[13px] font-bold text-white active:scale-[0.98] disabled:opacity-50"
        >
          <Link2 size={14} strokeWidth={2.4} />
          {membuat ? 'Membuat…' : 'Buat Link Baru'}
        </button>
      </div>

      {loading ? (
        <p className="text-[13px] text-text-dim">Memuat…</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-text-dim">Belum ada link Pengunjung.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((a) => {
            const st = statusAkses(a);
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-border bg-panel-2 px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${st.kelas}`}>
                      {st.label}
                    </span>
                    <span className="truncate text-[12.5px] font-semibold text-text">
                      {a.keterangan || '(tanpa keterangan)'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-dim">
                    Dibuat {formatTgl(a.dibuat_pada)} · Berlaku sampai {formatTgl(a.berlaku_sampai)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => salinLink(a)}
                    className="flex items-center gap-1 rounded-full border border-border bg-panel px-2.5 py-1 text-[11px] font-bold text-text-dim"
                  >
                    {disalin === a.id ? <Check size={12} className="text-sage" /> : <Copy size={12} />}
                    {disalin === a.id ? 'Disalin' : 'Salin Link'}
                  </button>
                  {!a.dicabut && (
                    <button
                      type="button"
                      onClick={() => cabut(a.id)}
                      className="flex items-center gap-1 rounded-full border border-red-lembut bg-red-lembut px-2.5 py-1 text-[11px] font-bold text-red"
                    >
                      <Ban size={12} />
                      Cabut
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
