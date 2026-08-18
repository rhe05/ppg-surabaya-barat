'use client';

/* Halaman Munaqosah — padanan Modul_MaintainMunaqosah.gs (661 baris, 9
   fungsi). Penilaian santri per periode, lengkap dengan statistik,
   Santri Teladan (nilai >= 90), dan lembar cetak.

   Fondasi DB dibuat di migrasi 20260818180000. Yang perlu diingat soal
   skema ini: tabel `munaqosah` TIDAK punya kolom kelompok_id — scope-nya
   ditelusuri lewat `santri.kelompok_id`, baik di policy maupun di query
   halaman ini.

   Empat hal yang berbeda dari app lama:

   1. Larangan dua penilaian untuk santri+periode yang sama dulu hanya
      dijaga kode; kini indeks unik parsial di Postgres. Error 23505
      diterjemahkan jadi kalimat yang bisa dibaca orang.
   2. Kolom `wilayah` diisi otomatis dari nama desa lewat join saat
      menyimpan, sama seperti serverCreateMunaqosah:184-188.
   3. Hapus bersifat HALUS (deleted_at) — tabel ini memang punya kolomnya
      dan tidak ada policy DELETE sama sekali.
   4. Lembar soal app lama membangun HTML lalu dicetak. Di sini dipakai
      jendela cetak peramban atas tabel yang sudah tampil, jadi tidak ada
      HTML kedua yang harus dirawat terpisah dan hasilnya selalu sama
      dengan yang dilihat di layar. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];
/* Ambang Santri Teladan — minScore bawaan serverGetSantriTeladan:287. */
const AMBANG_TELADAN = 90;

type Kelompok = { id: number; nama: string };
type Periode = { id: number; semester: string; status: string };
type Santri = { id: number; nama: string; nis: string | null; jenjang_saat_ini: string | null };
type Tersemat = { nama: string } | { nama: string }[] | null;
type Munaqosah = {
  id: number;
  santri_id: number;
  periode_id: number;
  tanggal: string | null;
  kelas: string | null;
  wilayah: string | null;
  nilai: number | null;
  status: string;
  catatan: string | null;
  santri: Tersemat;
};

function namaDari(nilai: Tersemat) {
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

function FormNilai({
  awal,
  santriList,
  onBatal,
  onSimpan,
}: {
  awal: Munaqosah | null;
  santriList: Santri[];
  onBatal: () => void;
  onSimpan: (isi: Record<string, unknown>) => Promise<void>;
}) {
  const modeUbah = awal !== null;
  const [santriId, setSantriId] = useState(awal ? String(awal.santri_id) : '');
  const [nilai, setNilai] = useState(awal?.nilai != null ? String(awal.nilai) : '');
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? hariIni());
  const [kelas, setKelas] = useState(awal?.kelas ?? '');
  const [catatan, setCatatan] = useState(awal?.catatan ?? '');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!modeUbah && !santriId) return setError('Santri wajib dipilih.');
    const n = Number(nilai);
    /* Batas 0-100 persis serverCreateMunaqosah:159. */
    if (nilai === '' || Number.isNaN(n) || n < 0 || n > 100)
      return setError('Nilai harus angka antara 0 sampai 100.');

    setMenyimpan(true);
    try {
      await onSimpan({
        santri_id: Number(santriId),
        nilai: n,
        tanggal: tanggal || null,
        /* Kosong: ikut jenjang santri, sama seperti app lama. */
        kelas:
          kelas.trim() ||
          santriList.find((s) => s.id === Number(santriId))?.jenjang_saat_ini ||
          null,
        catatan: catatan.trim() || null,
        status: 'dinilai',
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
          {modeUbah ? 'Ubah Penilaian' : 'Catat Penilaian'}
        </h2>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Santri *</label>
            <select
              className={KELAS_INPUT}
              value={santriId}
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
            <label className={KELAS_LABEL}>Nilai * (0–100)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              className={KELAS_INPUT}
              value={nilai}
              onChange={(e) => setNilai(e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={tanggal}
              onChange={(e) => setTanggal(e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kelas</label>
            <input
              className={KELAS_INPUT}
              value={kelas}
              onChange={(e) => setKelas(e.target.value)}
              placeholder="Kosongkan = ikut jenjang santri"
            />
          </div>
          <div className="sm:col-span-2">
            <label className={KELAS_LABEL}>Catatan</label>
            <textarea
              rows={3}
              className={KELAS_INPUT}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>
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

function MunaqosahContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');
  const adalahPpg = profile?.role === 'admin_ppg';

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [periodeList, setPeriodeList] = useState<Periode[]>([]);
  const [periodeId, setPeriodeId] = useState<number | null>(null);
  const [santriList, setSantriList] = useState<Santri[]>([]);
  const [daftar, setDaftar] = useState<Munaqosah[]>([]);
  const [periodeBaru, setPeriodeBaru] = useState('');

  const [loading, setLoading] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Munaqosah | null>(null);

  const muatPeriode = useCallback(async () => {
    const { data } = await supabase
      .from('periode_munaqosah')
      .select('id, semester, status')
      .order('id', { ascending: false });
    const daftarP = (data ?? []) as unknown as Periode[];
    setPeriodeList(daftarP);
    setPeriodeId((s) => (s && daftarP.some((p) => p.id === s) ? s : (daftarP[0]?.id ?? null)));
  }, []);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
    muatPeriode();
  }, [muatPeriode]);

  useEffect(() => {
    async function load() {
      if (!kelompokId) {
        setSantriList([]);
        return;
      }
      const { data } = await supabase
        .from('santri')
        .select('id, nama, nis, jenjang_saat_ini')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama');
      setSantriList((data ?? []) as unknown as Santri[]);
    }
    load();
  }, [kelompokId]);

  const muat = useCallback(async () => {
    if (!periodeId || !kelompokId) {
      setDaftar([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      /* Saring per kelompok lewat relasi santri — munaqosah tidak punya
         kolom kelompok_id sendiri. */
      const { data, error: err } = await supabase
        .from('munaqosah')
        .select(
          'id, santri_id, periode_id, tanggal, kelas, wilayah, nilai, status, catatan, santri!inner(nama, kelompok_id)'
        )
        .eq('periode_id', periodeId)
        .eq('santri.kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nilai', { ascending: false });
      if (err) throw new Error(err.message);
      setDaftar((data ?? []) as unknown as Munaqosah[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat penilaian.');
    } finally {
      setLoading(false);
    }
  }, [periodeId, kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const statistik = useMemo(() => {
    const nilai = daftar.map((m) => Number(m.nilai)).filter((n) => !Number.isNaN(n));
    if (nilai.length === 0) return null;
    return {
      jumlah: nilai.length,
      rata: nilai.reduce((a, b) => a + b, 0) / nilai.length,
      tertinggi: Math.max(...nilai),
      terendah: Math.min(...nilai),
      teladan: nilai.filter((n) => n >= AMBANG_TELADAN).length,
    };
  }, [daftar]);

  async function simpan(isi: Record<string, unknown>) {
    if (!periodeId || !kelompokId) return;
    try {
      let err;
      if (sedangDiubah) {
        ({ error: err } = await supabase
          .from('munaqosah')
          .update({
            nilai: isi.nilai,
            tanggal: isi.tanggal,
            kelas: isi.kelas,
            catatan: isi.catatan,
          })
          .eq('id', sedangDiubah.id));
      } else {
        /* `wilayah` = nama desa induk kelompok, diisi saat menyimpan persis
           seperti serverCreateMunaqosah:184-188. */
        const { data: kel } = await supabase
          .from('kelompok')
          .select('desa(nama)')
          .eq('id', kelompokId)
          .maybeSingle();
        const desa = kel?.desa as unknown as Tersemat;

        ({ error: err } = await supabase.from('munaqosah').insert({
          ...isi,
          periode_id: periodeId,
          wilayah: namaDari(desa) === '-' ? null : namaDari(desa),
          dinilai_oleh: profile?.id ?? null,
          dinilai_pada: new Date().toISOString(),
        }));
      }
      if (err) {
        if (err.code === '23505')
          throw new Error('Penilaian untuk santri ini pada periode tersebut sudah ada.');
        throw new Error(err.message);
      }
      setFormTerbuka(false);
      setPesan(sedangDiubah ? 'Penilaian diperbarui.' : 'Penilaian tersimpan.');
      await muat();
    } catch (e) {
      throw e instanceof Error ? e : new Error('Gagal menyimpan.');
    }
  }

  async function hapus(m: Munaqosah) {
    if (!window.confirm(`Hapus penilaian ${namaDari(m.santri)}?`)) return;
    setError(null);
    setPesan(null);
    try {
      /* Hapus HALUS — tidak ada policy DELETE untuk tabel ini. */
      const { error: err } = await supabase
        .from('munaqosah')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', m.id);
      if (err) throw new Error(err.message);
      setPesan('Penilaian dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  async function bukaPeriode() {
    if (!periodeBaru.trim()) return;
    setSibuk(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('periode_munaqosah')
        .insert({ semester: periodeBaru.trim(), status: 'aktif', diubah_oleh: profile?.id ?? null });
      if (err) throw new Error(err.message);
      setPeriodeBaru('');
      setPesan('Periode dibuka.');
      await muatPeriode();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuka periode.');
    } finally {
      setSibuk(false);
    }
  }

  const periodeAktif = periodeList.find((p) => p.id === periodeId);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-[24px] font-bold text-text">Munaqosah</h1>
          <p className="text-[13px] text-text-dim">
            Penilaian santri per periode. Santri Teladan = nilai {AMBANG_TELADAN} ke atas.
          </p>
        </div>
        {daftar.length > 0 && (
          <button onClick={() => window.print()} className={KELAS_TOMBOL_SEKUNDER + ' px-4 py-2.5 text-[13px]'}>
            Cetak
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3 print:hidden">
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
          <label className={KELAS_LABEL}>Periode</label>
          <select
            className={KELAS_INPUT}
            value={periodeId ?? ''}
            onChange={(e) => setPeriodeId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Pilih Periode --</option>
            {periodeList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.semester} ({p.status})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          {bolehTulis && periodeId && kelompokId && (
            <button
              onClick={() => {
                setSedangDiubah(null);
                setFormTerbuka(true);
              }}
              className={KELAS_TOMBOL_UTAMA + ' w-full'}
            >
              + Catat Penilaian
            </button>
          )}
        </div>
      </div>

      {adalahPpg && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-card border border-border bg-panel-2 p-4 print:hidden">
          <div className="min-w-[220px] flex-1">
            <label className={KELAS_LABEL}>Buka periode baru (khusus admin PPG)</label>
            <input
              className={KELAS_INPUT}
              value={periodeBaru}
              onChange={(e) => setPeriodeBaru(e.target.value)}
              placeholder="Misal: 2026/2027 Semester 1"
            />
          </div>
          <button onClick={bukaPeriode} disabled={sibuk || !periodeBaru.trim()} className={KELAS_TOMBOL_UTAMA}>
            Buka Periode
          </button>
        </div>
      )}

      {pesan && <p className="mb-4 text-[13px] text-sage print:hidden">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red print:hidden">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!loading && periodeList.length === 0 && (
        <p className="text-[13px] text-text-dim">
          Belum ada periode munaqosah. {adalahPpg ? 'Buka periode dulu di atas.' : 'Hubungi admin PPG.'}
        </p>
      )}
      {!loading && periodeList.length > 0 && !kelompokId && (
        <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>
      )}

      {statistik && (
        <div className="mb-6 flex flex-wrap gap-3">
          {[
            { label: 'Dinilai', nilai: String(statistik.jumlah) },
            { label: 'Rata-rata', nilai: statistik.rata.toFixed(1) },
            { label: 'Tertinggi', nilai: String(statistik.tertinggi) },
            { label: 'Terendah', nilai: String(statistik.terendah) },
            { label: 'Santri Teladan', nilai: String(statistik.teladan) },
          ].map((k) => (
            <div
              key={k.label}
              className="rounded-card border border-border bg-panel px-4 py-3 shadow-[var(--shadow-card)]"
            >
              <div className="text-[20px] font-bold text-text">{k.nilai}</div>
              <div className="text-[12px] text-text-dim">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && kelompokId && periodeId && daftar.length === 0 && (
        <p className="text-[13px] text-text-dim">Belum ada penilaian pada periode ini.</p>
      )}

      {daftar.length > 0 && (
        <>
          <div className="mb-2 hidden text-[15px] font-bold text-text print:block">
            Munaqosah {periodeAktif?.semester} — {kelompokList.find((k) => k.id === kelompokId)?.nama}
          </div>
          <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="border-b border-border bg-panel-2">
                <tr>
                  {['#', 'Nama', 'Kelas', 'Nilai', 'Catatan'].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-3 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  {bolehTulis && <th className="px-3 py-3 print:hidden"></th>}
                </tr>
              </thead>
              <tbody>
                {daftar.map((m, i) => (
                  <tr key={m.id} className="hover:bg-panel-2">
                    <td className="border-b border-border px-3 py-3 text-text-dim">{i + 1}</td>
                    <td className="border-b border-border px-3 py-3 text-text">
                      {namaDari(m.santri)}
                      {Number(m.nilai) >= AMBANG_TELADAN && (
                        <span className="ml-2 rounded bg-sage/15 px-2 py-0.5 text-[11px] font-semibold text-sage">
                          Teladan
                        </span>
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-3 text-text">{m.kelas ?? '—'}</td>
                    <td className="border-b border-border px-3 py-3 font-bold text-text">
                      {m.nilai ?? '—'}
                    </td>
                    <td className="border-b border-border px-3 py-3 text-text-dim">
                      {m.catatan ?? '—'}
                    </td>
                    {bolehTulis && (
                      <td className="border-b border-border px-3 py-3 print:hidden">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSedangDiubah(m);
                              setFormTerbuka(true);
                            }}
                            className={KELAS_TOMBOL_SEKUNDER}
                          >
                            Ubah
                          </button>
                          <button onClick={() => hapus(m)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                            Hapus
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {formTerbuka && (
        <FormNilai
          awal={sedangDiubah}
          santriList={santriList}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpan}
        />
      )}
    </div>
  );
}

export default function MunaqosahPage() {
  return (
    <RequireAuth>
      <MunaqosahContent />
    </RequireAuth>
  );
}
