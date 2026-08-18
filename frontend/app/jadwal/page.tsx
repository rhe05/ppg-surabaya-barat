'use client';

/* Halaman Jadwal KBM — padanan Modul_MaintainJadwalKBM.gs (348 baris, 6
   fungsi server). Dua bagian, sama seperti app lama:

   1. Sesi KBM (tabel `jadwal_kbm`) — satu baris = satu sesi: kategori
      jenjang + kelas + guru + jam + ruangan + status. Ini jadwal UMUM,
      TIDAK terikat tanggal; kolom `hari`/`tanggal` sengaja dibiarkan
      kosong seperti di app lama (penetapan tanggal ada di fitur lain).
   2. Hari aktif per kategori (tabel `jadwal_kategori_hari`) — hari apa
      saja kategori itu masuk, disimpan sebagai teks dipisah koma.

   ⚠️ Tabel `kategori_kbm` MENCAMPUR dua namespace: 11 mata pelajaran KBM
   ("Bacaan Al-Qur'an", "Tajwid", ...) yang dipakai kurikulum_prota, dan 4
   kategori JENJANG ("Cabe Rawit", "Pra Remaja SMP", "Remaja SMA",
   "Muda-Mudi") yang dipakai jadwal_kategori_hari. Keduanya tidak boleh
   saling muncul di dropdown yang salah. KATEGORI_JENJANG di bawah adalah
   daftar kanoniknya (KATEGORI_JADWAL_ di Modul_MaintainJadwalKBM.gs:26). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { KATEGORI_JENJANG, HARI_URUTAN } from '@/lib/kategori';

const STATUS_JADWAL = ['Aktif', 'Tidak Aktif'];
const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

type Jadwal = {
  id: number;
  kelompok_id: number;
  kategori: string | null;
  kelas: string | null;
  guru_id: number | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  keterangan: string | null;
  santri_count: number;
  status: string | null;
};

type Guru = { id: number; nama: string };
type Kelompok = { id: number; nama: string };
type KategoriHari = {
  id: number;
  kelompok_id: number;
  kategori_kbm_id: number;
  hari_aktif: string | null;
};
type KategoriKbm = { id: number; nama: string };

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

/* Postgres mengembalikan `time` sebagai 'HH:MM:SS'; input type=time butuh
   'HH:MM'. Kebalikannya aman karena Postgres menerima 'HH:MM'. */
const keJam = (v: string | null) => (v ? v.slice(0, 5) : '');

const KOSONG = {
  kategori: '',
  kelas: '',
  guru_id: '',
  jam_mulai: '',
  jam_selesai: '',
  ruangan: '',
  keterangan: '',
  santri_count: '0',
  status: 'Aktif',
};

function FormJadwal({
  jadwal,
  guruList,
  onBatal,
  onSimpan,
}: {
  jadwal: Jadwal | null;
  guruList: Guru[];
  onBatal: () => void;
  onSimpan: (isi: Record<string, unknown>) => Promise<void>;
}) {
  const [isian, setIsian] = useState(
    jadwal
      ? {
          kategori: jadwal.kategori ?? '',
          kelas: jadwal.kelas ?? '',
          guru_id: jadwal.guru_id != null ? String(jadwal.guru_id) : '',
          jam_mulai: keJam(jadwal.jam_mulai),
          jam_selesai: keJam(jadwal.jam_selesai),
          ruangan: jadwal.ruangan ?? '',
          keterangan: jadwal.keterangan ?? '',
          santri_count: String(jadwal.santri_count ?? 0),
          status: jadwal.status ?? 'Aktif',
        }
      : KOSONG
  );
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function ubah(field: keyof typeof KOSONG, nilai: string) {
    setIsian((s) => ({ ...s, [field]: nilai }));
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    /* Syarat wajib persis serverCreateJadwalKBM
       (Modul_MaintainJadwalKBM.gs:102-106). */
    if (!isian.kategori) return setError('Kategori wajib dipilih.');
    if (!isian.guru_id) return setError('Guru wajib dipilih.');
    if (!isian.kelas.trim()) return setError('Kelas wajib diisi.');
    if (!isian.jam_mulai) return setError('Jam mulai wajib diisi.');
    if (!isian.jam_selesai) return setError('Jam selesai wajib diisi.');
    if (!isian.ruangan.trim()) return setError('Ruangan wajib diisi.');

    setMenyimpan(true);
    try {
      await onSimpan({
        kategori: isian.kategori,
        kelas: isian.kelas.trim(),
        guru_id: Number(isian.guru_id),
        jam_mulai: isian.jam_mulai,
        jam_selesai: isian.jam_selesai,
        ruangan: isian.ruangan.trim(),
        keterangan: isian.keterangan.trim() || null,
        santri_count: Number(isian.santri_count) || 0,
        status: isian.status,
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
          {jadwal ? 'Ubah Sesi KBM' : 'Tambah Sesi KBM'}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Kategori *</label>
            <select
              className={KELAS_INPUT}
              value={isian.kategori}
              onChange={(e) => ubah('kategori', e.target.value)}
            >
              <option value="">-- Pilih Kategori --</option>
              {KATEGORI_JENJANG.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Kelas *</label>
            <input
              className={KELAS_INPUT}
              value={isian.kelas}
              onChange={(e) => ubah('kelas', e.target.value)}
              placeholder="Misal: 1A, 2 & 3A, PAUD/TK B"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Guru *</label>
            <select
              className={KELAS_INPUT}
              value={isian.guru_id}
              onChange={(e) => ubah('guru_id', e.target.value)}
            >
              <option value="">-- Pilih Guru --</option>
              {guruList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Ruangan *</label>
            <input
              className={KELAS_INPUT}
              value={isian.ruangan}
              onChange={(e) => ubah('ruangan', e.target.value)}
              placeholder="Misal: Masjid Lt 1"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Jam Mulai *</label>
            <input
              type="time"
              className={KELAS_INPUT}
              value={isian.jam_mulai}
              onChange={(e) => ubah('jam_mulai', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Jam Selesai *</label>
            <input
              type="time"
              className={KELAS_INPUT}
              value={isian.jam_selesai}
              onChange={(e) => ubah('jam_selesai', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Jumlah Santri</label>
            <input
              type="number"
              min={0}
              className={KELAS_INPUT}
              value={isian.santri_count}
              onChange={(e) => ubah('santri_count', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Status</label>
            <select
              className={KELAS_INPUT}
              value={isian.status}
              onChange={(e) => ubah('status', e.target.value)}
            >
              {STATUS_JADWAL.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={KELAS_LABEL}>Keterangan</label>
            <input
              className={KELAS_INPUT}
              value={isian.keterangan}
              onChange={(e) => ubah('keterangan', e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-[13px] text-red">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
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

function JadwalContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');
  /* jadwal_kbm_delete_ppg_only — admin lain yang menekan Hapus tidak akan
     dapat error, hanya 0 baris terhapus. Jadi tombolnya disembunyikan. */
  const bolehHapus = profile?.role === 'admin_ppg';

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [jadwal, setJadwal] = useState<Jadwal[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [kategoriHari, setKategoriHari] = useState<KategoriHari[]>([]);
  const [kategoriKbm, setKategoriKbm] = useState<KategoriKbm[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Jadwal | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    async function load() {
      const [{ data: dKel }, { data: dKat }] = await Promise.all([
        supabase.from('kelompok').select('id, nama').order('nama'),
        supabase.from('kategori_kbm').select('id, nama'),
      ]);
      setKelompokList(dKel ?? []);
      setKategoriKbm(dKat ?? []);
    }
    load();
  }, []);

  const muat = useCallback(async () => {
    if (!kelompokId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: dJadwal, error: e1 }, { data: dGuru }, { data: dHari }] = await Promise.all([
        supabase
          .from('jadwal_kbm')
          .select(
            'id, kelompok_id, kategori, kelas, guru_id, jam_mulai, jam_selesai, ruangan, keterangan, santri_count, status'
          )
          .eq('kelompok_id', kelompokId)
          .order('jam_mulai'),
        supabase
          .from('guru')
          .select('id, nama')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null)
          .order('nama'),
        supabase
          .from('jadwal_kategori_hari')
          .select('id, kelompok_id, kategori_kbm_id, hari_aktif')
          .eq('kelompok_id', kelompokId),
      ]);
      if (e1) throw new Error(e1.message);
      setJadwal((dJadwal ?? []) as unknown as Jadwal[]);
      setGuruList(dGuru ?? []);
      setKategoriHari((dHari ?? []) as unknown as KategoriHari[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat jadwal.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaGuru = useMemo(() => {
    const peta = new Map(guruList.map((g) => [g.id, g.nama]));
    return (id: number | null) => (id != null ? (peta.get(id) ?? '-') : '-');
  }, [guruList]);

  /* Kategori jenjang -> id di kategori_kbm. Dicocokkan lewat NAMA karena
     jadwal_kbm menyimpan kategori sebagai teks sedangkan
     jadwal_kategori_hari memakai FK. */
  const idKategori = useMemo(() => {
    const peta = new Map(kategoriKbm.map((k) => [k.nama, k.id]));
    return (nama: string) => peta.get(nama) ?? null;
  }, [kategoriKbm]);

  async function simpanJadwal(isi: Record<string, unknown>) {
    if (!kelompokId) return;
    const { error: err } = sedangDiubah
      ? await supabase.from('jadwal_kbm').update(isi).eq('id', sedangDiubah.id)
      : await supabase.from('jadwal_kbm').insert({ ...isi, kelompok_id: kelompokId });
    if (err) throw new Error(err.message);
    setFormTerbuka(false);
    setPesan(sedangDiubah ? 'Perubahan tersimpan.' : 'Sesi baru tersimpan.');
    await muat();
  }

  async function hapusJadwal(j: Jadwal) {
    if (!window.confirm(`Hapus sesi ${j.kategori} kelas ${j.kelas}? Tindakan ini tidak bisa dibatalkan.`))
      return;
    setSibuk(true);
    try {
      const { error: err } = await supabase.from('jadwal_kbm').delete().eq('id', j.id);
      if (err) throw new Error(err.message);
      setPesan('Sesi dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setSibuk(false);
    }
  }

  async function ubahHari(kategoriNama: string, hari: string, aktif: boolean) {
    if (!kelompokId) return;
    const katId = idKategori(kategoriNama);
    if (katId == null) {
      setError(`Kategori "${kategoriNama}" tidak ada di tabel kategori_kbm.`);
      return;
    }
    const baris = kategoriHari.find((k) => k.kategori_kbm_id === katId);
    const sekarang = (baris?.hari_aktif ?? '').split(',').filter(Boolean);
    const baru = aktif ? [...sekarang, hari] : sekarang.filter((h) => h !== hari);
    /* Selalu disimpan urut Senin-Minggu supaya teksnya stabil, sama seperti
       HARI_URUTAN_JKH_ di app lama. */
    const teks = HARI_URUTAN.filter((h) => baru.includes(h)).join(',');

    setSibuk(true);
    setError(null);
    try {
      const { error: err } = baris
        ? await supabase.from('jadwal_kategori_hari').update({ hari_aktif: teks }).eq('id', baris.id)
        : await supabase
            .from('jadwal_kategori_hari')
            .insert({ kelompok_id: kelompokId, kategori_kbm_id: katId, hari_aktif: teks });
      if (err) throw new Error(err.message);
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan hari aktif.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Jadwal KBM</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Jadwal umum per kategori jenjang — tidak terikat tanggal tertentu.
      </p>

      <div className="mb-6 max-w-sm">
        <label className={KELAS_LABEL}>Kelompok</label>
        <select
          className={KELAS_INPUT}
          value={kelompokId ?? ''}
          disabled={profile?.role === 'admin_kelompok'}
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

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

      {kelompokId && (
        <>
          {/* ── Hari aktif per kategori ── */}
          <div className="mb-8 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
            <div className="mb-4 text-[15px] font-bold text-text">Hari Aktif per Kategori</div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[12px]">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-2 py-2 font-semibold text-text-dim uppercase">Kategori</th>
                    {HARI_URUTAN.map((h) => (
                      <th key={h} className="px-2 py-2 text-center font-semibold text-text-dim uppercase">
                        {h.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KATEGORI_JENJANG.map((kat) => {
                    const katId = idKategori(kat);
                    const baris = kategoriHari.find((k) => k.kategori_kbm_id === katId);
                    const aktif = (baris?.hari_aktif ?? '').split(',').filter(Boolean);
                    return (
                      <tr key={kat}>
                        <td className="border-b border-border px-2 py-2 text-text">{kat}</td>
                        {HARI_URUTAN.map((h) => (
                          <td key={h} className="border-b border-border px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={aktif.includes(h)}
                              disabled={!bolehTulis || sibuk}
                              onChange={(e) => ubahHari(kat, h, e.target.checked)}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Sesi KBM ── */}
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="text-[15px] font-bold text-text">Sesi KBM ({jadwal.length})</div>
            {bolehTulis && (
              <button
                onClick={() => {
                  setSedangDiubah(null);
                  setFormTerbuka(true);
                }}
                className={KELAS_TOMBOL_UTAMA}
              >
                + Tambah Sesi
              </button>
            )}
          </div>

          {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
          {!loading && jadwal.length === 0 && (
            <p className="text-[13px] text-text-dim">Belum ada sesi KBM untuk kelompok ini.</p>
          )}

          {!loading && jadwal.length > 0 && (
            <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="border-b border-border bg-panel-2">
                  <tr>
                    {['Kategori', 'Kelas', 'Jam', 'Ruangan', 'Guru', 'Santri', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase"
                      >
                        {h}
                      </th>
                    ))}
                    {bolehTulis && <th className="px-3 py-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {jadwal.map((j) => (
                    <tr key={j.id} className="hover:bg-panel-2">
                      <td className="border-b border-border px-3 py-3 text-text">{j.kategori ?? '-'}</td>
                      <td className="border-b border-border px-3 py-3 text-text">{j.kelas ?? '-'}</td>
                      <td className="border-b border-border px-3 py-3 text-text">
                        {keJam(j.jam_mulai) || '-'}–{keJam(j.jam_selesai) || '-'}
                      </td>
                      <td className="border-b border-border px-3 py-3 text-text">{j.ruangan ?? '-'}</td>
                      <td className="border-b border-border px-3 py-3 text-text">{namaGuru(j.guru_id)}</td>
                      <td className="border-b border-border px-3 py-3 text-text">{j.santri_count}</td>
                      <td className="border-b border-border px-3 py-3 text-text">{j.status ?? '-'}</td>
                      {bolehTulis && (
                        <td className="border-b border-border px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSedangDiubah(j);
                                setFormTerbuka(true);
                              }}
                              className={KELAS_TOMBOL_SEKUNDER}
                            >
                              Ubah
                            </button>
                            {bolehHapus && (
                              <button
                                onClick={() => hapusJadwal(j)}
                                disabled={sibuk}
                                className={KELAS_TOMBOL_SEKUNDER + ' text-red'}
                              >
                                Hapus
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {formTerbuka && (
        <FormJadwal
          jadwal={sedangDiubah}
          guruList={guruList}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpanJadwal}
        />
      )}
    </div>
  );
}

export default function JadwalPage() {
  return (
    <RequireAuth>
      <JadwalContent />
    </RequireAuth>
  );
}
