'use client';

/* Halaman Bimbingan Konseling — padanan Modul_MaintainKonseling.gs
   (463 baris, 8 fungsi). Pencatatan masalah santri, tindakan, dan status
   penyelesaiannya.

   Fondasi DB-nya dibuat di migrasi 20260818150000 (tabelnya sebelumnya RLS
   aktif tanpa policy = tertutup senyap). Aturan aksesnya sengaja TIDAK
   diseragamkan dengan tabel lain, karena isi konseling bersifat sensitif
   dan app lama memang lebih ketat:

   - Guru BOLEH mencatat & membaca konseling di kelompoknya.
   - MENYUNTING hanya oleh pencatat aslinya atau admin_ppg. Admin kelompok
     bisa membaca catatan orang lain tapi tidak bisa mengubahnya.
   - Hapus bersifat HALUS (deleted_at) dan ikut aturan sunting di atas —
     tidak ada policy DELETE sama sekali.

   Satu catatan per santri per tanggal ditegakkan indeks unik parsial
   `uq_konseling_santri_tanggal ... WHERE deleted_at IS NULL`. Karena
   parsial, `.upsert onConflict` tidak bisa dipakai (42P10) — form ini
   memang selalu INSERT baru dan mengandalkan Postgres untuk menolak
   duplikat, lalu menerjemahkan 23505 jadi pesan yang bisa dibaca orang. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import StatistikKonseling from '@/components/konseling/StatistikKonseling';

/* Harus cocok persis dgn enum konseling_kategori & konseling_status. */
const KATEGORI = ['akademik', 'perilaku', 'emosional', 'sosial', 'kesehatan', 'lainnya'];
const STATUS = ['aktif', 'pending', 'selesai'];

const WARNA_STATUS: Record<string, string> = {
  aktif: 'text-brass',
  pending: 'text-text-dim',
  selesai: 'text-sage',
};

type Kelompok = { id: number; nama: string };
type Santri = { id: number; nama: string; nis: string | null };
type Tersemat = { nama: string } | { nama: string }[] | null;
type Konseling = {
  id: number;
  santri_id: number;
  kelompok_id: number;
  tanggal: string;
  kategori: string;
  masalah: string;
  status: string;
  aksi: string | null;
  catatan_tindak_lanjut: string | null;
  pencatat_id: string | null;
  santri: Tersemat;
};

function namaSantri(nilai: Tersemat) {
  if (!nilai) return '-';
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? '-';
}

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';
const KELAS_TOMBOL_UTAMA =
  'cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] ' +
  'font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

const hariIni = () => new Date().toISOString().slice(0, 10);

function FormKonseling({
  awal,
  santriList,
  onBatal,
  onSimpan,
}: {
  awal: Konseling | null;
  santriList: Santri[];
  onBatal: () => void;
  onSimpan: (isi: Record<string, unknown>) => Promise<void>;
}) {
  const modeUbah = awal !== null;
  const [santriId, setSantriId] = useState(awal ? String(awal.santri_id) : '');
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? hariIni());
  const [kategori, setKategori] = useState(awal?.kategori ?? '');
  const [masalah, setMasalah] = useState(awal?.masalah ?? '');
  const [status, setStatus] = useState(awal?.status ?? 'aktif');
  const [aksi, setAksi] = useState(awal?.aksi ?? '');
  const [tindakLanjut, setTindakLanjut] = useState(awal?.catatan_tindak_lanjut ?? '');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    /* Syarat wajib persis serverCreateKonseling
       (Modul_MaintainKonseling.gs:146-160), termasuk masalah minimal 5
       karakter — angka itu dari app lama, bukan karangan. */
    if (!modeUbah && !santriId) return setError('Santri wajib dipilih.');
    if (!tanggal) return setError('Tanggal wajib diisi.');
    if (!kategori) return setError('Kategori wajib dipilih.');
    if (masalah.trim().length < 5) return setError('Masalah harus minimal 5 karakter.');
    if (!status) return setError('Status wajib dipilih.');

    setMenyimpan(true);
    try {
      await onSimpan({
        santri_id: Number(santriId),
        tanggal,
        kategori,
        masalah: masalah.trim(),
        status,
        aksi: aksi.trim() || null,
        catatan_tindak_lanjut: tindakLanjut.trim() || null,
      });
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={simpan}
        className="my-8 w-full max-w-2xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]"
      >
        <h2 className="mb-6 text-[20px] font-bold text-text">
          {modeUbah ? 'Ubah Catatan Konseling' : 'Catat Konseling'}
        </h2>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Santri *</label>
            <select
              className={KELAS_INPUT}
              value={santriId}
              /* Santri & tanggal tidak bisa dipindah setelah tercatat —
                 keduanya kunci keunikan baris. */
              disabled={modeUbah}
              onChange={(e) => setSantriId(e.target.value)}
            >
              <option value="">-- Pilih Santri --</option>
              {santriList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                  {s.nis ? ` (${s.nis})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal *</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={tanggal}
              disabled={modeUbah}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kategori *</label>
            <select
              className={KELAS_INPUT}
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
            >
              <option value="">-- Pilih Kategori --</option>
              {KATEGORI.map((k) => (
                <option key={k} value={k}>
                  {k.charAt(0).toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Status *</label>
            <select className={KELAS_INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className={KELAS_LABEL}>Masalah * (minimal 5 karakter)</label>
          <textarea
            rows={3}
            className={KELAS_INPUT}
            value={masalah}
            onChange={(e) => setMasalah(e.target.value)}
            placeholder="Apa yang terjadi"
          />
        </div>
        <div className="mb-4">
          <label className={KELAS_LABEL}>Aksi / Penanganan</label>
          <textarea
            rows={3}
            className={KELAS_INPUT}
            value={aksi}
            onChange={(e) => setAksi(e.target.value)}
            placeholder="Yang sudah dilakukan"
          />
        </div>
        <div className="mb-4">
          <label className={KELAS_LABEL}>Catatan Tindak Lanjut</label>
          <textarea
            rows={2}
            className={KELAS_INPUT}
            value={tindakLanjut}
            onChange={(e) => setTindakLanjut(e.target.value)}
            placeholder="Rencana berikutnya"
          />
        </div>

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onBatal} className={KELAS_TOMBOL_SEKUNDER + ' px-4 py-2.5 text-[13px]'}>
            Batal
          </button>
          <button type="submit" disabled={menyimpan} className={KELAS_TOMBOL_UTAMA}>
            {menyimpan ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}

function KonselingContent() {
  const { profile } = useAuth();

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [santriList, setSantriList] = useState<Santri[]>([]);
  const [daftar, setDaftar] = useState<Konseling[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterKategori, setFilterKategori] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Konseling | null>(null);

  /* Semua peran aktif boleh mencatat, termasuk guru — sama seperti app lama. */
  const bolehCatat = !!profile?.is_active;

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
  }, []);

  useEffect(() => {
    async function load() {
      if (!kelompokId) {
        setSantriList([]);
        return;
      }
      const { data } = await supabase
        .from('santri')
        .select('id, nama, nis')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama');
      setSantriList((data ?? []) as unknown as Santri[]);
    }
    load();
  }, [kelompokId]);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setDaftar([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('konseling')
        .select(
          'id, santri_id, kelompok_id, tanggal, kategori, masalah, status, aksi, catatan_tindak_lanjut, pencatat_id, santri(nama)'
        )
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('tanggal', { ascending: false });
      if (err) throw new Error(err.message);
      setDaftar((data ?? []) as unknown as Konseling[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data konseling.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const tersaring = useMemo(
    () =>
      daftar.filter(
        (k) =>
          (!filterStatus || k.status === filterStatus) &&
          (!filterKategori || k.kategori === filterKategori)
      ),
    [daftar, filterStatus, filterKategori]
  );

  const ringkasan = useMemo(() => {
    const per: Record<string, number> = { aktif: 0, pending: 0, selesai: 0 };
    for (const k of daftar) per[k.status] = (per[k.status] ?? 0) + 1;
    return per;
  }, [daftar]);

  /* Menyunting hanya untuk pencatat asli atau admin_ppg — persis policy
     konseling_update_pencatat_atau_ppg. Tombolnya disembunyikan untuk yang
     lain karena UPDATE yang tertahan RLS TIDAK memunculkan error, hanya 0
     baris berubah, sehingga akan tampak "berhasil" padahal tidak. */
  const bolehSunting = (k: Konseling) =>
    profile?.role === 'admin_ppg' || (!!profile?.id && k.pencatat_id === profile.id);

  async function simpan(isi: Record<string, unknown>) {
    if (!kelompokId) return;
    try {
      const { error: err } = sedangDiubah
        ? await supabase
            .from('konseling')
            .update({
              kategori: isi.kategori,
              masalah: isi.masalah,
              status: isi.status,
              aksi: isi.aksi,
              catatan_tindak_lanjut: isi.catatan_tindak_lanjut,
            })
            .eq('id', sedangDiubah.id)
        : await supabase.from('konseling').insert({
            ...isi,
            kelompok_id: kelompokId,
            pencatat_id: profile?.id ?? null,
          });
      if (err) {
        /* 23505 = indeks unik (santri_id, tanggal). Pesan mentah Postgres
           tidak berarti apa-apa bagi pengguna. */
        if (err.code === '23505') {
          throw new Error('Sudah ada catatan konseling untuk santri ini pada tanggal tersebut.');
        }
        throw new Error(err.message);
      }
      setFormTerbuka(false);
      setPesan(sedangDiubah ? 'Catatan diperbarui.' : 'Catatan konseling tersimpan.');
      await muat();
    } catch (e) {
      throw e instanceof Error ? e : new Error('Gagal menyimpan.');
    }
  }

  async function hapus(k: Konseling) {
    if (!window.confirm(`Hapus catatan konseling ${namaSantri(k.santri)} tanggal ${k.tanggal}?`))
      return;
    setError(null);
    setPesan(null);
    try {
      /* Hapus HALUS — tidak ada policy DELETE untuk tabel ini. */
      const { error: err } = await supabase
        .from('konseling')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', k.id);
      if (err) throw new Error(err.message);
      setPesan('Catatan dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Bimbingan Konseling</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Pencatatan masalah santri dan penanganannya. Catatan hanya bisa disunting oleh pencatatnya
        sendiri atau admin PPG.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div>
          <label className={KELAS_LABEL}>Kelompok</label>
          <select
            className={KELAS_INPUT}
            value={kelompokId ?? ''}
            disabled={profile?.role === 'admin_kelompok' || profile?.role === 'guru'}
            onChange={(e) => setKelompokId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Pilih Kelompok --</option>
            {kelompokList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={KELAS_LABEL}>Status</label>
          <select
            className={KELAS_INPUT}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Semua</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={KELAS_LABEL}>Kategori</label>
          <select
            className={KELAS_INPUT}
            value={filterKategori}
            onChange={(e) => setFilterKategori(e.target.value)}
          >
            <option value="">Semua</option>
            {KATEGORI.map((k) => (
              <option key={k} value={k}>
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          {bolehCatat && kelompokId && (
            <button
              onClick={() => {
                setSedangDiubah(null);
                setFormTerbuka(true);
              }}
              className={KELAS_TOMBOL_UTAMA + ' w-full'}
            >
              + Catat Konseling
            </button>
          )}
        </div>
      </div>

      {kelompokId && daftar.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          {STATUS.map((s) => (
            <div
              key={s}
              className="rounded-card border border-border bg-panel px-4 py-3 shadow-[var(--shadow-card)]"
            >
              <div className={'text-[20px] font-bold ' + WARNA_STATUS[s]}>{ringkasan[s] ?? 0}</div>
              <div className="text-[12px] text-text-dim">{s.charAt(0).toUpperCase() + s.slice(1)}</div>
            </div>
          ))}
        </div>
      )}

      {kelompokId && daftar.length > 0 && <StatistikKonseling daftar={daftar} />}

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!loading && !kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}
      {!loading && kelompokId && tersaring.length === 0 && (
        <p className="text-[13px] text-text-dim">
          {daftar.length === 0
            ? 'Belum ada catatan konseling untuk kelompok ini.'
            : 'Tidak ada catatan yang cocok dengan saringan.'}
        </p>
      )}

      {!loading &&
        tersaring.map((k) => (
          <div
            key={k.id}
            className="mb-4 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-text">{namaSantri(k.santri)}</span>
                  <span className="rounded-[var(--radius)] border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-text-dim">
                    {k.kategori}
                  </span>
                  <span className={'text-[12px] font-bold ' + (WARNA_STATUS[k.status] ?? '')}>
                    {k.status}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-text-dim">{k.tanggal}</div>
                <div className="mt-3 whitespace-pre-line text-[13px] text-text">{k.masalah}</div>
                {k.aksi && (
                  <div className="mt-2 text-[12px] text-text-dim">
                    <span className="font-semibold">Aksi:</span> {k.aksi}
                  </div>
                )}
                {k.catatan_tindak_lanjut && (
                  <div className="mt-1 text-[12px] text-text-dim">
                    <span className="font-semibold">Tindak lanjut:</span> {k.catatan_tindak_lanjut}
                  </div>
                )}
              </div>
              {bolehSunting(k) && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSedangDiubah(k);
                      setFormTerbuka(true);
                    }}
                    className={KELAS_TOMBOL_SEKUNDER}
                  >
                    Ubah
                  </button>
                  <button onClick={() => hapus(k)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                    Hapus
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

      {formTerbuka && (
        <FormKonseling
          awal={sedangDiubah}
          santriList={santriList}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpan}
        />
      )}
    </div>
  );
}

export default function KonselingPage() {
  return (
    <RequireAuth>
      <KonselingContent />
    </RequireAuth>
  );
}
