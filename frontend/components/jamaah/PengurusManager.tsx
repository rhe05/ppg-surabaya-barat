'use client';

/* Data Pengurus (Penerobos Kelp) — susunan kepengurusan majlis taklim.
   Pengurus TINGKAT KELOMPOK (sub_kelp_id NULL) + pengurus PER SUB KELP.
   Orangnya dipilih dari Data Jamaah; jabatan diketik bebas.
   Satu SELECT jamaah + satu SELECT sub_kelp + satu SELECT jamaah_pengurus
   saat layar dibuka; kelompok & saring 100% di memori. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Users, Pencil, Check, X, Phone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import EmptyState from '@/components/ui/EmptyState';
import PesanGalat from '@/components/ui/PesanGalat';
import FieldTanggal from '@/components/ui/FieldTanggal';
import { KOLOM_PENGURUS, type JamaahPengurus, type SubKelp } from '@/lib/jamaah';

type JamaahRingkas = { id: number; nama: string; sub_kelp_id: number | null; no_wa: string | null };

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[13px] text-text focus:border-navy focus:outline-none';
const LABEL = 'mb-1 block text-[11.5px] font-semibold text-text-dim';

export default function PengurusManager() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [subKelp, setSubKelp] = useState<SubKelp[]>([]);
  const [jamaah, setJamaah] = useState<JamaahRingkas[]>([]);
  const [list, setList] = useState<JamaahPengurus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [simpan, setSimpan] = useState(false);

  /* form tambah */
  const [subBaru, setSubBaru] = useState<'' | number>('');
  const [jamaahBaru, setJamaahBaru] = useState<'' | number>('');
  const [jabatanBaru, setJabatanBaru] = useState('');
  const [mulaiBaru, setMulaiBaru] = useState('');
  const [ketBaru, setKetBaru] = useState('');

  /* edit baris */
  const [editId, setEditId] = useState<number | null>(null);
  const [editSub, setEditSub] = useState<'' | number>('');
  const [editJabatan, setEditJabatan] = useState('');
  const [editMulai, setEditMulai] = useState('');
  const [editKet, setEditKet] = useState('');

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [rSub, rJam, rPeng] = await Promise.all([
      supabase
        .from('sub_kelp')
        .select('id, kelompok_id, nama, keterangan')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama'),
      supabase
        .from('jamaah')
        .select('id, nama, sub_kelp_id, no_wa')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama'),
      supabase
        .from('jamaah_pengurus')
        .select(KOLOM_PENGURUS)
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('urutan')
        .order('id'),
    ]);
    if (rPeng.error) setError(rPeng.error.message);
    else setList((rPeng.data ?? []) as unknown as JamaahPengurus[]);
    setSubKelp((rSub.data ?? []) as unknown as SubKelp[]);
    setJamaah((rJam.data ?? []) as unknown as JamaahRingkas[]);
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

  /* Grup tampilan: "Pengurus Kelompok" lalu satu blok per Sub Kelp
     yang punya pengurus. */
  const grup = useMemo(() => {
    const kelompokGrup = list.filter((p) => p.sub_kelp_id == null);
    const perSub = subKelp
      .map((s) => ({ sub: s, isi: list.filter((p) => p.sub_kelp_id === s.id) }))
      .filter((g) => g.isi.length > 0);
    return { kelompokGrup, perSub };
  }, [list, subKelp]);

  async function tambah() {
    if (!kelompokId || jamaahBaru === '' || !jabatanBaru.trim()) return;
    setSimpan(true);
    setError(null);
    const { error: err } = await supabase.from('jamaah_pengurus').insert({
      kelompok_id: kelompokId,
      sub_kelp_id: subBaru === '' ? null : subBaru,
      jamaah_id: jamaahBaru,
      jabatan: jabatanBaru.trim(),
      mulai_menjabat: mulaiBaru || null,
      keterangan: ketBaru.trim() || null,
      dicatat_oleh: profile?.id ?? null,
    });
    setSimpan(false);
    if (err) {
      setError(err.message);
      return;
    }
    setJamaahBaru('');
    setJabatanBaru('');
    setMulaiBaru('');
    setKetBaru('');
    muat();
  }

  function mulaiEdit(p: JamaahPengurus) {
    setEditId(p.id);
    setEditSub(p.sub_kelp_id ?? '');
    setEditJabatan(p.jabatan);
    setEditMulai(p.mulai_menjabat ?? '');
    setEditKet(p.keterangan ?? '');
  }

  async function simpanEdit() {
    if (editId == null || !editJabatan.trim()) return;
    setSimpan(true);
    setError(null);
    const { error: err } = await supabase
      .from('jamaah_pengurus')
      .update({
        sub_kelp_id: editSub === '' ? null : editSub,
        jabatan: editJabatan.trim(),
        mulai_menjabat: editMulai || null,
        keterangan: editKet.trim() || null,
      })
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
      .from('jamaah_pengurus')
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

  function Baris({ p }: { p: JamaahPengurus }) {
    if (editId === p.id) {
      return (
        <div className="rounded-card border-[1.5px] border-navy bg-panel p-3.5">
          <div className="mb-2 text-[13px] font-bold text-text">{p.jamaah?.nama ?? 'Jamaah'}</div>
          <label className={LABEL}>Jabatan</label>
          <input
            className={INPUT}
            value={editJabatan}
            onChange={(e) => setEditJabatan(e.target.value)}
            placeholder="mis. Ketua"
          />
          <label className={`${LABEL} mt-2`}>Tingkat</label>
          <select
            className={INPUT}
            value={editSub === '' ? '' : String(editSub)}
            onChange={(e) => setEditSub(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">Tingkat Kelompok</option>
            {subKelp.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
          <label className={`${LABEL} mt-2`}>Mulai menjabat (opsional)</label>
          <FieldTanggal nilai={editMulai} onPilih={setEditMulai} className={INPUT} />
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
              disabled={simpan || !editJabatan.trim()}
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
              onClick={() => nonaktif(p.id)}
              disabled={simpan}
              className="ml-auto text-[12px] font-bold text-red disabled:opacity-50"
            >
              Hapus
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold text-text">{p.jamaah?.nama ?? 'Jamaah'}</span>
            <span className="shrink-0 rounded-full bg-navy-lembut px-2 py-0.5 text-[10.5px] font-bold text-navy">
              {p.jabatan}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-text-dim">
            {p.jamaah?.no_wa && (
              <span className="flex items-center gap-1">
                <Phone size={11} />
                {p.jamaah.no_wa}
              </span>
            )}
            {p.keterangan && <span className="truncate">· {p.keterangan}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={() => mulaiEdit(p)}
          aria-label="Ubah"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="px-[18px] pt-4 pb-10">
      <div className="mb-1 text-[17px] font-extrabold text-text">Data Pengurus</div>
      <p className="mb-4 text-[12px] text-text-dim">
        Susunan Kepengurusan Kelompok — tingkat kelompok maupun per Sub Kelp.
      </p>

      {/* form tambah */}
      <div className="mb-4 rounded-card border border-border bg-panel-2 p-3.5">
        <label className={LABEL}>Tingkat</label>
        <select
          className={INPUT}
          value={subBaru === '' ? '' : String(subBaru)}
          onChange={(e) => setSubBaru(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">Tingkat Kelompok</option>
          {subKelp.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nama}
            </option>
          ))}
        </select>

        <label className={`${LABEL} mt-2`}>Nama (dari Data Jamaah)</label>
        <select
          className={INPUT}
          value={jamaahBaru === '' ? '' : String(jamaahBaru)}
          onChange={(e) => setJamaahBaru(e.target.value === '' ? '' : Number(e.target.value))}
        >
          <option value="">— pilih jamaah —</option>
          {jamaah.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nama}
              {j.sub_kelp_id != null && namaSub.has(j.sub_kelp_id) ? ` (${namaSub.get(j.sub_kelp_id)})` : ''}
            </option>
          ))}
        </select>

        <label className={`${LABEL} mt-2`}>Jabatan</label>
        <input
          className={INPUT}
          value={jabatanBaru}
          onChange={(e) => setJabatanBaru(e.target.value)}
          placeholder="mis. Ketua / Sekretaris / Bendahara / Seksi Konsumsi"
        />

        <label className={`${LABEL} mt-2`}>Mulai menjabat (opsional)</label>
        <FieldTanggal nilai={mulaiBaru} onPilih={setMulaiBaru} className={INPUT} />

        <input
          className={`${INPUT} mt-2`}
          value={ketBaru}
          onChange={(e) => setKetBaru(e.target.value)}
          placeholder="Keterangan (opsional)"
        />

        <button
          type="button"
          onClick={tambah}
          disabled={simpan || jamaahBaru === '' || !jabatanBaru.trim()}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border-none bg-navy px-4 py-2.5 text-[13px] font-extrabold text-white active:scale-[0.98] disabled:opacity-50"
        >
          <Plus size={15} strokeWidth={2.5} />
          Tambah Pengurus
        </button>
        {jamaah.length === 0 && (
          <p className="mt-2 text-[11.5px] text-text-dim">
            Belum ada data jamaah. Tambahkan jamaah dulu di menu Jamaah.
          </p>
        )}
      </div>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <SkeletonKartuList />
      ) : list.length === 0 ? (
        <EmptyState
          ikon={<Users size={22} />}
          judul="Belum ada pengurus"
          deskripsi="Tambahkan susunan pengurus pengajian kelompok Anda."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {grup.kelompokGrup.length > 0 && (
            <div>
              <div className="mb-2 text-[12px] font-extrabold tracking-wide text-navy uppercase">
                Pengurus Kelompok
              </div>
              <div className="flex flex-col gap-2.5">
                {grup.kelompokGrup.map((p) => (
                  <Baris key={p.id} p={p} />
                ))}
              </div>
            </div>
          )}
          {grup.perSub.map((g) => (
            <div key={g.sub.id}>
              <div className="mb-2 text-[12px] font-extrabold tracking-wide text-navy uppercase">
                {g.sub.nama}
              </div>
              <div className="flex flex-col gap-2.5">
                {g.isi.map((p) => (
                  <Baris key={p.id} p={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
