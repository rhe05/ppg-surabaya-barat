'use client';

/* Pencapaian santri terhadap satu target bulanan (probul) — padanan
   serverGetPencapaianSantri / serverUpdatePencapaianSantri
   (Modul_MaintainKurikulum.gs:761-814).

   Dibuka dari baris Probul di halaman Kurikulum. Guru boleh menandai
   pencapaian (itu pekerjaan hariannya), sementara menyusun rencana
   kurikulumnya tetap wewenang admin — pemisahan itu ditegakkan policy,
   bukan hanya oleh layar ini.

   Daftar santri diambil dari KELAS yang dipilih, bukan seluruh kelompok:
   satu target bulanan berlaku untuk satu kelas kurikulum, dan menampilkan
   199 santri untuk satu target akan mustahil dipakai. Kalau santri belum
   ditempatkan ke kelas mana pun, daftarnya kosong dan halaman mengatakannya
   apa adanya — bukan diam-diam menampilkan semua orang. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const STATUS: { nilai: string; label: string; warna: string }[] = [
  { nilai: 'pending', label: 'Belum', warna: 'text-text-dim' },
  { nilai: 'in_progress', label: 'Proses', warna: 'text-brass' },
  { nilai: 'completed', label: 'Tuntas', warna: 'text-sage' },
];

type Santri = { id: number; nama: string; nis: string | null };
type Pencapaian = { id: number; santri_id: number; status: string; catatan_guru: string | null };
type Kelas = { id: number; nama: string };

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

export default function PencapaianSantri({
  probulId,
  kelompokId,
  judul,
  onTutup,
}: {
  probulId: number;
  kelompokId: number;
  judul: string;
  onTutup: () => void;
}) {
  const { profile } = useAuth();

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState('');
  const [santri, setSantri] = useState<Santri[]>([]);
  const [pencapaian, setPencapaian] = useState<Record<number, Pencapaian>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('kelas')
        .select('id, nama')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama');
      const daftar = (data ?? []) as unknown as Kelas[];
      setKelasList(daftar);
      setKelasId((s) => s || String(daftar[0]?.id ?? ''));
    }
    load();
  }, [kelompokId]);

  const muat = useCallback(async () => {
    if (!kelasId) {
      setSantri([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data: dSantri, error: e1 }, { data: dCapai, error: e2 }] = await Promise.all([
        supabase
          .from('santri')
          .select('id, nama, nis')
          .eq('kelompok_id', kelompokId)
          .eq('kelas_id', Number(kelasId))
          .is('deleted_at', null)
          .order('nama'),
        supabase
          .from('kurikulum_pencapaian_santri')
          .select('id, santri_id, status, catatan_guru')
          .eq('probul_id', probulId),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      setSantri((dSantri ?? []) as unknown as Santri[]);
      const peta: Record<number, Pencapaian> = {};
      for (const c of (dCapai ?? []) as unknown as Pencapaian[]) peta[c.santri_id] = c;
      setPencapaian(peta);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pencapaian.');
    } finally {
      setLoading(false);
    }
  }, [kelasId, kelompokId, probulId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function ubahStatus(s: Santri, status: string) {
    setError(null);
    setPesan(null);
    try {
      const ada = pencapaian[s.id];
      /* Dua langkah, bukan .upsert: indeks uniknya (santri_id, probul_id)
         memang penuh, tapi pola dua langkah dipakai konsisten di app ini
         supaya penanganan error-nya seragam. */
      const { error: err } = ada
        ? await supabase
            .from('kurikulum_pencapaian_santri')
            .update({ status, updated_by: profile?.id ?? null })
            .eq('id', ada.id)
        : await supabase.from('kurikulum_pencapaian_santri').insert({
            kelompok_id: kelompokId,
            santri_id: s.id,
            probul_id: probulId,
            status,
            updated_by: profile?.id ?? null,
          });
      if (err) throw new Error(err.message);
      setPesan(`${s.nama}: ${STATUS.find((x) => x.nilai === status)?.label}`);
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan pencapaian.');
    }
  }

  const ringkas = STATUS.map((st) => ({
    ...st,
    jumlah: santri.filter((s) => (pencapaian[s.id]?.status ?? 'pending') === st.nilai).length,
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-text">Pencapaian Santri</h2>
            <p className="text-[12px] text-text-dim">{judul}</p>
          </div>
          <button onClick={onTutup} className={KELAS_TOMBOL_SEKUNDER}>
            Tutup
          </button>
        </div>

        <div className="mb-4">
          <label className={KELAS_LABEL}>Kelas</label>
          <select className={KELAS_INPUT} value={kelasId} onChange={(e) => setKelasId(e.target.value)}>
            <option value="">-- Pilih Kelas --</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>

        {santri.length > 0 && (
          <div className="mb-4 flex gap-3">
            {ringkas.map((r) => (
              <div key={r.nilai} className="rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2">
                <div className={'text-[16px] font-bold ' + r.warna}>{r.jumlah}</div>
                <div className="text-[11px] text-text-dim">{r.label}</div>
              </div>
            ))}
          </div>
        )}

        {pesan && <p className="mb-3 text-[12px] text-sage">{pesan}</p>}
        {error && <p className="mb-3 text-[12px] text-red">{error}</p>}
        {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}

        {!loading && kelasList.length === 0 && (
          <p className="text-[13px] text-text-dim">
            Kelompok ini belum punya kelas. Buat kelas dulu di halaman Kelas.
          </p>
        )}
        {!loading && kelasId && santri.length === 0 && kelasList.length > 0 && (
          <p className="text-[13px] text-text-dim">
            Belum ada santri yang ditempatkan di kelas ini. Tempatkan dulu lewat halaman Kelas.
          </p>
        )}

        {!loading &&
          santri.map((s) => {
            const status = pencapaian[s.id]?.status ?? 'pending';
            return (
              <div
                key={s.id}
                className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2"
              >
                <span className="text-[13px] text-text">
                  {s.nama}
                  {s.nis && <span className="ml-2 text-[11px] text-text-faint">{s.nis}</span>}
                </span>
                <div className="flex gap-1">
                  {STATUS.map((st) => (
                    <button
                      key={st.nilai}
                      onClick={() => ubahStatus(s, st.nilai)}
                      className={
                        'cursor-pointer rounded-[var(--radius)] border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200 ' +
                        (status === st.nilai
                          ? 'border-brass bg-brass text-white'
                          : 'border-border bg-panel-2 ' + st.warna)
                      }
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
