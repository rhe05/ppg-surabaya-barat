'use client';

/* "Siklus Generus" — mobile admin_kelompok (2026-08-27), dibuka dari hub
   Data Master (app/data-master/page.tsx), DI BAWAH "Data Generus".

   Gaya kartu + header + form full-screen sama persis dgn AdminSantriMobile
   .tsx / SantriForm.tsx supaya terasa satu aplikasi. Fungsinya = versi
   mobile dari app/siklus-generus/page.tsx (tabel desktop): catat
   perpindahan fase generus (Kerja/Kuliah/Pindah/Mondok/Tugas/Tidak Aktif),
   terikat ke santri yang sudah ada.

   RLS: siklus_generus_tulis_admin (migrasi 20260818170000) = FOR ALL
   scoped, admin_kelompok boleh insert/update/delete kelompoknya sendiri.
   `nama` dibekukan dari santri saat pencatatan (kalau santri kelak
   dihapus/ganti nama, catatan tetap menyebut nama saat peristiwa). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Repeat2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import { useToast } from '@/components/ui/useToast';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import EmptyState from '@/components/ui/EmptyState';

/* Harus cocok persis dgn enum siklus_generus_jenis. */
const JENIS = ['Kerja', 'Kuliah', 'Pindah', 'Mondok', 'Tugas', 'Tidak Aktif'] as const;
type Jenis = (typeof JENIS)[number];

/* Warna badge per jenis — token app (rgba inline, pola sama kartu lain). */
const WARNA_JENIS: Record<Jenis, { bg: string; teks: string }> = {
  Kerja: { bg: 'rgba(79,70,229,0.12)', teks: 'var(--indigo)' },
  Kuliah: { bg: 'rgba(5,150,105,0.12)', teks: 'var(--sage)' },
  Pindah: { bg: 'rgba(217,119,6,0.12)', teks: 'var(--brass)' },
  Mondok: { bg: 'rgba(13,148,136,0.14)', teks: 'var(--teal)' },
  Tugas: { bg: 'rgba(2,132,199,0.12)', teks: '#0284C7' },
  'Tidak Aktif': { bg: 'rgba(220,38,38,0.12)', teks: 'var(--red)' },
};

type Santri = { id: number; nama: string };
type Siklus = {
  id: number;
  santri_id: number;
  nama: string;
  jenis_siklus: string;
  tanggal: string;
  lokasi: string | null;
  instansi: string | null;
  keterangan: string | null;
};

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text ' +
  'focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

const hariIni = () => new Date().toISOString().slice(0, 10);

function formatTanggal(iso: string): string {
  const [t, b, h] = iso.split('-');
  const bln = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];
  return `${Number(h)} ${bln[Number(b) - 1] ?? b} ${t}`;
}

export default function SiklusGenerusMobile() {
  const { profile } = useAuth();
  const { sukses } = useToast();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [daftar, setDaftar] = useState<Siklus[]>([]);
  const [santriList, setSantriList] = useState<Santri[]>([]);
  const [loading, setLoading] = useState(true);
  const [belumPernahMuat, setBelumPernahMuat] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Siklus | null>(null);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      setBelumPernahMuat(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data: dSiklus, error: e1 }, { data: dSantri, error: e2 }] = await Promise.all([
        supabase
          .from('siklus_generus')
          .select('id, santri_id, nama, jenis_siklus, tanggal, lokasi, instansi, keterangan')
          .eq('kelompok_id', kelompokId)
          .order('tanggal', { ascending: false }),
        supabase
          .from('santri')
          .select('id, nama')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null)
          .order('nama'),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      setDaftar((dSiklus ?? []) as unknown as Siklus[]);
      setSantriList((dSantri ?? []) as unknown as Santri[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data siklus.');
    } finally {
      setLoading(false);
      setBelumPernahMuat(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const tersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    if (!term) return daftar;
    return daftar.filter(
      (s) =>
        s.nama.toLowerCase().includes(term) ||
        s.jenis_siklus.toLowerCase().includes(term) ||
        (s.lokasi ?? '').toLowerCase().includes(term) ||
        (s.instansi ?? '').toLowerCase().includes(term),
    );
  }, [daftar, cari]);

  function bukaTambah() {
    setSedangDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(s: Siklus) {
    setSedangDiubah(s);
    setFormTerbuka(true);
  }
  function selesai(baru: boolean) {
    setFormTerbuka(false);
    setSedangDiubah(null);
    muat();
    sukses(baru ? 'Catatan siklus tersimpan.' : 'Perubahan tersimpan.');
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Siklus Generus" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="text-[17px] font-extrabold text-text">Siklus Generus ({daftar.length})</div>
          <button
            type="button"
            aria-label="Catat Siklus Baru"
            onClick={bukaTambah}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-brass text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] active:scale-[0.92]"
          >
            <Repeat2 size={19} strokeWidth={2} />
          </button>
        </div>
        <p className="mb-4 text-[12px] text-text-dim">
          Catatan perpindahan generus: kerja, kuliah, pindah, mondok, tugas, atau tidak aktif.
        </p>

        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama, jenis, lokasi, atau instansi..."
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        {belumPernahMuat && loading ? (
          <SkeletonKartuList />
        ) : tersaring.length === 0 ? (
          cari.trim() ? (
            <p className="text-[13px] text-text-dim">Tidak ada yang cocok dengan "{cari.trim()}".</p>
          ) : (
            <EmptyState
              ikon={<Repeat2 size={22} />}
              judul="Belum ada catatan siklus"
              deskripsi="Catat saat generus kerja, kuliah, pindah, mondok, tugas, atau tidak aktif."
              aksi={{ label: 'Catat Siklus Baru', onClick: bukaTambah }}
            />
          )
        ) : (
        <div className="flex flex-col gap-2.5">
          {tersaring.map((s) => {
            const w = WARNA_JENIS[s.jenis_siklus as Jenis] ?? {
              bg: 'var(--panel-2)',
              teks: 'var(--text-dim)',
            };
            const sub = [s.instansi, s.lokasi].filter(Boolean).join(' · ');
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => bukaUbah(s)}
                className="flex items-start justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-text">{s.nama}</div>
                  <div className="mt-0.5 text-[11.5px] text-text-dim">
                    {formatTanggal(s.tanggal)}
                    {sub ? ` · ${sub}` : ''}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold"
                  style={{ background: w.bg, color: w.teks }}
                >
                  {s.jenis_siklus}
                </span>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {formTerbuka && kelompokId && (
        <SiklusForm
          kelompokId={kelompokId}
          santriList={santriList}
          awal={sedangDiubah}
          onSelesai={selesai}
          onBatal={() => setFormTerbuka(false)}
        />
      )}
    </main>
  );
}

function SiklusForm({
  kelompokId,
  santriList,
  awal,
  onSelesai,
  onBatal,
}: {
  kelompokId: number;
  santriList: Santri[];
  awal: Siklus | null;
  onSelesai: (baru: boolean) => void;
  onBatal: () => void;
}) {
  const { profile } = useAuth();
  const modeUbah = awal !== null;

  const [santriId, setSantriId] = useState(awal ? String(awal.santri_id) : '');
  const [jenis, setJenis] = useState<string>(awal?.jenis_siklus ?? '');
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? hariIni());
  const [lokasi, setLokasi] = useState(awal?.lokasi ?? '');
  const [instansi, setInstansi] = useState(awal?.instansi ?? '');
  const [keterangan, setKeterangan] = useState(awal?.keterangan ?? '');

  const [sibuk, setSibuk] = useState(false);
  const [hapusKonfirmasi, setHapusKonfirmasi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    if (!santriId || !jenis || !tanggal) {
      setError('Santri, jenis siklus, dan tanggal wajib diisi.');
      return;
    }
    setSibuk(true);
    setError(null);
    try {
      const isi = {
        jenis_siklus: jenis,
        tanggal,
        lokasi: lokasi.trim() || null,
        instansi: instansi.trim() || null,
        keterangan: keterangan.trim() || null,
      };
      const { error: err } = modeUbah
        ? await supabase.from('siklus_generus').update(isi).eq('id', awal.id)
        : await supabase.from('siklus_generus').insert({
            kelompok_id: kelompokId,
            santri_id: Number(santriId),
            nama: santriList.find((s) => s.id === Number(santriId))?.nama ?? '',
            dicatat_oleh: profile?.id ?? null,
            ...isi,
          });
      if (err) throw new Error(err.message);
      onSelesai(!modeUbah);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapus() {
    if (!awal) return;
    setSibuk(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('siklus_generus').delete().eq('id', awal.id);
      if (err) throw new Error(err.message);
      onSelesai(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus.');
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={simpan}
        className="my-6 w-full max-w-[460px] rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-text">
            {modeUbah ? 'Ubah Catatan Siklus' : 'Catat Siklus Baru'}
          </h2>
          <button
            type="button"
            onClick={onBatal}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <label className={LABEL}>Santri *</label>
            <select
              className={INPUT + (modeUbah ? ' opacity-60' : '')}
              value={santriId}
              disabled={modeUbah}
              onChange={(e) => setSantriId(e.target.value)}
            >
              <option value="">-- Pilih Santri --</option>
              {santriList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL}>Jenis Siklus *</label>
            <select
              className={INPUT}
              value={jenis}
              onChange={(e) => setJenis(e.target.value)}
            >
              <option value="">-- Pilih Jenis --</option>
              {JENIS.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL}>Tanggal *</label>
            <input
              type="date"
              className={INPUT}
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>

          <div>
            <label className={LABEL}>Lokasi</label>
            <input
              className={INPUT}
              value={lokasi}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="Kota / daerah tujuan"
            />
          </div>

          <div>
            <label className={LABEL}>Instansi</label>
            <input
              className={INPUT}
              value={instansi}
              onChange={(e) => setInstansi(e.target.value)}
              placeholder="Kampus / perusahaan / pondok"
            />
          </div>

          <div>
            <label className={LABEL}>Keterangan</label>
            <textarea
              className={INPUT + ' resize-none'}
              rows={2}
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-[12.5px] text-red">{error}</p>}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={sibuk}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {sibuk ? 'Menyimpan...' : modeUbah ? 'Simpan Perubahan' : 'Simpan'}
          </button>
        </div>

        {modeUbah && (
          <div className="mt-3 border-t border-border pt-3">
            {hapusKonfirmasi ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] font-semibold text-red">Hapus catatan ini?</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setHapusKonfirmasi(false)}
                    className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] font-semibold text-text"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={hapus}
                    disabled={sibuk}
                    className="cursor-pointer rounded-[var(--radius)] border border-red bg-red px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setHapusKonfirmasi(true)}
                className="cursor-pointer text-[12.5px] font-semibold text-red"
              >
                Hapus catatan
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
