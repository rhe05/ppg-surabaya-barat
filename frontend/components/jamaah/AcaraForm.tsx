'use client';

/* Form buat/edit Acara (pengajian jamaah). Kehadiran dicatat per acara. */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import FieldTanggal from '@/components/ui/FieldTanggal';
import { KOLOM_ACARA, type JamaahAcara, type SubKelp } from '@/lib/jamaah';
import { PESAN_PENGUNJUNG_HANYA_LIHAT } from '@/lib/pengunjung';

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-navy focus:outline-none';
const LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

function hariIni() {
  return new Date().toISOString().slice(0, 10);
}

export default function AcaraForm({
  acara,
  subKelpList,
  onSelesai,
  onBatal,
}: {
  acara: JamaahAcara | null;
  subKelpList: SubKelp[];
  onSelesai: (acaraId: number) => void;
  onBatal: () => void;
}) {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [judul, setJudul] = useState(acara?.judul ?? '');
  const [tanggal, setTanggal] = useState(acara?.tanggal ?? hariIni());
  const [tempat, setTempat] = useState(acara?.tempat ?? '');
  const [subKelpId, setSubKelpId] = useState(acara?.sub_kelp_id != null ? String(acara.sub_kelp_id) : '');
  const [keterangan, setKeterangan] = useState(acara?.keterangan ?? '');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (acara) {
      setJudul(acara.judul);
      setTanggal(acara.tanggal);
      setTempat(acara.tempat ?? '');
      setSubKelpId(acara.sub_kelp_id != null ? String(acara.sub_kelp_id) : '');
      setKeterangan(acara.keterangan ?? '');
    }
  }, [acara]);

  async function simpan() {
    if (!kelompokId) {
      setError('Akun Anda belum terhubung ke kelompok.');
      return;
    }
    if (!judul.trim() || !tanggal) {
      setError('Judul dan tanggal wajib diisi.');
      return;
    }
    if (profile?.role === 'pengunjung') {
      setError(PESAN_PENGUNJUNG_HANYA_LIHAT);
      return;
    }
    setMenyimpan(true);
    setError(null);
    const payload = {
      kelompok_id: kelompokId,
      sub_kelp_id: subKelpId ? Number(subKelpId) : null,
      judul: judul.trim(),
      tanggal,
      tempat: tempat.trim() || null,
      keterangan: keterangan.trim() || null,
      dibuat_oleh: profile?.id ?? null,
    };
    const q = acara
      ? supabase.from('jamaah_acara').update(payload).eq('id', acara.id).select(KOLOM_ACARA).single()
      : supabase.from('jamaah_acara').insert(payload).select(KOLOM_ACARA).single();
    const { data, error: err } = await q;
    setMenyimpan(false);
    if (err || !data) {
      setError(err?.message ?? 'Gagal menyimpan acara.');
      return;
    }
    onSelesai((data as { id: number }).id);
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[17px] font-extrabold text-text">{acara ? 'Ubah Acara' : 'Buat Acara'}</h2>
          <button
            type="button"
            onClick={onBatal}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className={LABEL}>Judul / Nama Kajian *</label>
            <input
              className={INPUT}
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              placeholder="mis. Pengajian Rutin Ahad Pagi"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tanggal *</label>
              <FieldTanggal nilai={tanggal} onPilih={setTanggal} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Tempat</label>
              <input className={INPUT} value={tempat} onChange={(e) => setTempat(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={LABEL}>Untuk Sub Kelp</label>
            <select className={INPUT} value={subKelpId} onChange={(e) => setSubKelpId(e.target.value)}>
              <option value="">Semua jamaah kelompok (gabungan)</option>
              {subKelpList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Keterangan</label>
            <textarea
              className={`${INPUT} min-h-[64px]`}
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
            />
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          {error && <p className="mb-2 text-[12.5px] font-semibold text-red">{error}</p>}
          <button
            type="button"
            onClick={simpan}
            disabled={menyimpan}
            className="w-full rounded-[var(--radius-button)] border-none bg-navy px-5 py-3.5 text-[14px] font-extrabold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {menyimpan ? 'Menyimpan…' : acara ? 'Simpan Perubahan' : 'Buat & Catat Kehadiran'}
          </button>
        </div>
      </div>
    </div>
  );
}
