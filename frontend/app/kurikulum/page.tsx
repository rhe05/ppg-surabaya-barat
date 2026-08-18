'use client';

/* Halaman Kurikulum — padanan Modul_MaintainKurikulum.gs (814 baris, 19
   fungsi server) di app lama. Mempertahankan model tiga lapis yang sama:

     Prota  (Program Tahunan)  — 1 baris per kategori KBM per kelas
       └─ Promes (Program Semester) — semester 1 & 2
            └─ Probul (Program Bulanan) — per bulan, + jilid & target mingguan

   Gerbang kelas dipertahankan persis seperti app lama (redesign 2 Agt 2026):
   pengguna memilih kelas dulu, baru materi tampil. Daftar kelasnya adalah
   KURIKULUM_KELAS_LIST_ (Modul_MaintainKurikulum.gs:143) — kode kanonik
   'PAUD-TK' dan '1'-'9', BUKAN nama ruang kelas di tabel `kelas` ("1A",
   "2 & 3A"). Dua namespace itu memang berbeda dan tidak punya kolom
   penghubung; app lama memperingatkan hal yang sama.

   Cakupan: baca, ubah (target/deskripsi/jilid/mingguan), tambah materi,
   hapus materi, dan atur urutan tampil.

   Dua hal yang sengaja berbeda dari app lama:
   - Urutan diatur dengan tombol naik/turun, bukan drag & drop. Hasil
     akhirnya sama (kolom `urutan` ditulis ulang), dan tombol bisa dipakai
     di layar sentuh tanpa pustaka tambahan.
   - Hapus Prota cukup satu perintah DELETE: FK kurikulum_promes.prota_id
     dan kurikulum_probul.promes_id sudah ON DELETE CASCADE di Postgres,
     jadi turunannya ikut terhapus sendiri. App lama harus membersihkan
     probul lalu promes satu per satu karena Sheets tidak punya FK. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { KATEGORI_JENJANG } from '@/lib/kategori';
import PencapaianSantri from '@/components/kurikulum/PencapaianSantri';
import TargetBulanan from '@/components/kurikulum/TargetBulanan';

const KELAS_LIST = ['PAUD-TK', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];
const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type Tersemat = { nama: string } | { nama: string }[] | null;

type Prota = {
  id: number;
  kelompok_id: number;
  tahun: number;
  kategori_kbm_id: number;
  kelas: string | null;
  urutan: number;
  target: string | null;
  deskripsi: string | null;
  kategori_kbm: Tersemat;
};

type Promes = {
  id: number;
  prota_id: number;
  semester: number;
  target: string | null;
  deskripsi: string | null;
};

type Probul = {
  id: number;
  promes_id: number;
  bulan: number;
  jilid: string | null;
  target: string | null;
  deskripsi: string | null;
  minggu1: string | null;
  minggu2: string | null;
  minggu3: string | null;
  minggu4: string | null;
};

type Kelompok = { id: number; nama: string };
type KategoriKbm = { id: number; nama: string; urutan: number };

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

/* ── Modal ubah ──────────────────────────────────────────────────────── */

type Isian = { label: string; field: string; nilai: string; baris?: boolean };

function ModalUbah({
  judul,
  isian,
  onBatal,
  onSimpan,
}: {
  judul: string;
  isian: Isian[];
  onBatal: () => void;
  onSimpan: (patch: Record<string, string | null>) => Promise<void>;
}) {
  const [nilai, setNilai] = useState<Record<string, string>>(
    Object.fromEntries(isian.map((i) => [i.field, i.nilai]))
  );
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setMenyimpan(true);
    setError(null);
    try {
      /* String kosong disimpan NULL — konsisten dgn form santri & guru. */
      const patch = Object.fromEntries(
        Object.entries(nilai).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])
      );
      await onSimpan(patch);
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
        <h2 className="mb-6 text-[20px] font-bold text-text">{judul}</h2>
        {isian.map((i) => (
          <div key={i.field} className="mb-4">
            <label className={KELAS_LABEL}>{i.label}</label>
            {i.baris ? (
              <textarea
                rows={4}
                className={KELAS_INPUT}
                value={nilai[i.field]}
                onChange={(e) => setNilai((s) => ({ ...s, [i.field]: e.target.value }))}
              />
            ) : (
              <input
                className={KELAS_INPUT}
                value={nilai[i.field]}
                onChange={(e) => setNilai((s) => ({ ...s, [i.field]: e.target.value }))}
              />
            )}
          </div>
        ))}
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

/* ── Halaman ─────────────────────────────────────────────────────────── */

function KurikulumContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [tahun, setTahun] = useState<number>(new Date().getFullYear());
  const [kelas, setKelas] = useState<string | null>(null);

  const [prota, setProta] = useState<Prota[]>([]);
  const [promes, setPromes] = useState<Promes[]>([]);
  const [probul, setProbul] = useState<Probul[]>([]);
  const [terbuka, setTerbuka] = useState<Set<number>>(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [ubah, setUbah] = useState<
    { judul: string; tabel: string; id: number; isian: Isian[] } | null
  >(null);
  const [kategoriList, setKategoriList] = useState<KategoriKbm[]>([]);
  const [tambahKategori, setTambahKategori] = useState<string>('');
  const [sibuk, setSibuk] = useState(false);
  /* Probul yang sedang dibuka panel pencapaian santrinya. */
  const [pencapaianUntuk, setPencapaianUntuk] = useState<{ id: number; judul: string } | null>(null);
  /* Promes yang sedang dibuka panel target bulanannya. */
  const [targetUntuk, setTargetUntuk] = useState<{ promes: Promes; prota: Prota } | null>(null);

  /* Hanya admin_ppg yang punya policy DELETE pada kurikulum_*
     (kurikulum_prota_delete_ppg_only). Tabel ini tidak punya deleted_at,
     jadi tidak ada jalur hapus halus seperti santri/guru. */
  const bolehHapus = profile?.role === 'admin_ppg';

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
      if (!kelompokId && data && data.length === 1) setKelompokId(data[0].id);
    }
    load();
  }, [kelompokId]);

  /* ⚠️ Tabel `kategori_kbm` MENCAMPUR dua namespace: 11 mata pelajaran KBM
     (yang dipakai kurikulum_prota) dan 4 kategori JENJANG "Cabe Rawit",
     "Pra Remaja SMP", "Remaja SMA", "Muda-Mudi" (yang dipakai
     jadwal_kategori_hari). Keempatnya tidak pernah dipakai satu baris prota
     pun dan tidak boleh bisa dipilih sebagai materi kurikulum. */
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('kategori_kbm')
        .select('id, nama, urutan')
        .order('urutan');
      setKategoriList((data ?? []).filter((k) => !KATEGORI_JENJANG.includes(k.nama)));
    }
    load();
  }, []);

  const muat = useCallback(async () => {
    if (!kelompokId || !kelas) return;
    setLoading(true);
    setError(null);
    try {
      const { data: dProta, error: e1 } = await supabase
        .from('kurikulum_prota')
        .select('id, kelompok_id, tahun, kategori_kbm_id, kelas, urutan, target, deskripsi, kategori_kbm(nama)')
        .eq('kelompok_id', kelompokId)
        .eq('tahun', tahun)
        .eq('kelas', kelas)
        .order('urutan');
      if (e1) throw new Error(e1.message);
      const barisProta = (dProta ?? []) as unknown as Prota[];
      setProta(barisProta);

      if (barisProta.length === 0) {
        setPromes([]);
        setProbul([]);
        return;
      }

      const { data: dPromes, error: e2 } = await supabase
        .from('kurikulum_promes')
        .select('id, prota_id, semester, target, deskripsi')
        .in('prota_id', barisProta.map((p) => p.id))
        .order('semester');
      if (e2) throw new Error(e2.message);
      const barisPromes = (dPromes ?? []) as unknown as Promes[];
      setPromes(barisPromes);

      if (barisPromes.length === 0) {
        setProbul([]);
        return;
      }

      const { data: dProbul, error: e3 } = await supabase
        .from('kurikulum_probul')
        .select('id, promes_id, bulan, jilid, target, deskripsi, minggu1, minggu2, minggu3, minggu4')
        .in('promes_id', barisPromes.map((p) => p.id))
        .order('bulan');
      if (e3) throw new Error(e3.message);
      setProbul((dProbul ?? []) as unknown as Probul[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat kurikulum.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, kelas]);

  useEffect(() => {
    muat();
  }, [muat]);

  const promesPerProta = useMemo(() => {
    const peta = new Map<number, Promes[]>();
    for (const p of promes) {
      const daftar = peta.get(p.prota_id) ?? [];
      daftar.push(p);
      peta.set(p.prota_id, daftar);
    }
    return peta;
  }, [promes]);

  const probulPerPromes = useMemo(() => {
    const peta = new Map<number, Probul[]>();
    for (const b of probul) {
      const daftar = peta.get(b.promes_id) ?? [];
      daftar.push(b);
      peta.set(b.promes_id, daftar);
    }
    return peta;
  }, [probul]);

  async function simpanUbah(patch: Record<string, string | null>) {
    if (!ubah) return;
    const { error: err } = await supabase.from(ubah.tabel).update(patch).eq('id', ubah.id);
    if (err) throw new Error(err.message);
    setUbah(null);
    setPesan('Perubahan tersimpan.');
    await muat();
  }

  /* Tambah materi = 1 baris Prota + SEPASANG Promes kosong (semester 1 & 2).
     Pasangan itu wajib, bukan opsional — app lama membuatnya bareng
     (serverAddProta, Modul_MaintainKurikulum.gs:229-231) dan seluruh UI
     mengandaikan tiap Prota selalu punya dua semester. */
  async function tambahMateri() {
    if (!kelompokId || !kelas || !tambahKategori) return;
    const kategoriId = Number(tambahKategori);

    const sudahAda = prota.some((p) => {
      const nama = namaDari(p.kategori_kbm);
      return nama === kategoriList.find((k) => k.id === kategoriId)?.nama;
    });
    if (sudahAda) {
      setError('Materi itu sudah ada untuk kelas ini.');
      return;
    }

    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const urutanBaru = prota.length ? Math.max(...prota.map((p) => p.urutan ?? 0)) + 1 : 1;
      const { data: baris, error: e1 } = await supabase
        .from('kurikulum_prota')
        .insert({
          kelompok_id: kelompokId,
          tahun: tahun,
          kelas: kelas,
          kategori_kbm_id: kategoriId,
          urutan: urutanBaru,
        })
        .select('id')
        .single();
      if (e1) throw new Error(e1.message);

      const { error: e2 } = await supabase.from('kurikulum_promes').insert([
        { prota_id: baris.id, kelompok_id: kelompokId, semester: 1 },
        { prota_id: baris.id, kelompok_id: kelompokId, semester: 2 },
      ]);
      if (e2) throw new Error(e2.message);

      setTambahKategori('');
      setPesan('Materi baru ditambahkan.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah materi.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapusMateri(p: Prota) {
    const nama = namaDari(p.kategori_kbm);
    if (
      !window.confirm(
        `Hapus materi "${nama}" beserta semua program semester dan bulanannya? Tindakan ini tidak bisa dibatalkan.`
      )
    )
      return;

    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('kurikulum_prota').delete().eq('id', p.id);
      if (err) throw new Error(err.message);
      setPesan(`Materi "${nama}" dihapus.`);
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus materi.');
    } finally {
      setSibuk(false);
    }
  }

  /* Tukar posisi dengan tetangga, lalu tulis ulang kedua nilai `urutan`.
     Tidak menulis ulang 1..N seluruh kartu seperti serverReorderProta —
     cukup dua baris yang berubah, hasil tampilnya sama. */
  async function geser(indeks: number, arah: -1 | 1) {
    const tetangga = indeks + arah;
    if (tetangga < 0 || tetangga >= prota.length) return;
    const a = prota[indeks];
    const b = prota[tetangga];

    setSibuk(true);
    setError(null);
    try {
      const { error: e1 } = await supabase
        .from('kurikulum_prota')
        .update({ urutan: b.urutan })
        .eq('id', a.id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase
        .from('kurikulum_prota')
        .update({ urutan: a.urutan })
        .eq('id', b.id);
      if (e2) throw new Error(e2.message);
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah urutan.');
    } finally {
      setSibuk(false);
    }
  }

  /* ── Gerbang kelas ── */
  if (!kelas) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="mb-2 text-[24px] font-bold text-text">Kurikulum</h1>
        <p className="mb-6 text-[13px] text-text-dim">
          Pilih kelas dulu untuk melihat Program Tahunan, Semester, dan Bulanan.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
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
          <div>
            <label className={KELAS_LABEL}>Tahun</label>
            <input
              type="number"
              className={KELAS_INPUT}
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {KELAS_LIST.map((k) => (
            <button
              key={k}
              disabled={!kelompokId}
              onClick={() => setKelas(k)}
              className="cursor-pointer rounded-card border border-border bg-panel px-4 py-6 text-[15px] font-bold text-text shadow-[var(--shadow-card)] transition-all duration-200 hover:border-brass disabled:opacity-40"
            >
              {k === 'PAUD-TK' ? 'PAUD/TK' : 'Kelas ' + k}
            </button>
          ))}
        </div>
        {!kelompokId && (
          <p className="mt-4 text-[13px] text-text-dim">Pilih kelompok dulu.</p>
        )}
      </div>
    );
  }

  /* ── Isi kurikulum ── */
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-bold text-text">
            Kurikulum {kelas === 'PAUD-TK' ? 'PAUD/TK' : 'Kelas ' + kelas}
          </h1>
          <p className="text-[13px] text-text-dim">
            {kelompokList.find((k) => k.id === kelompokId)?.nama ?? '-'} &middot; Tahun {tahun}
          </p>
        </div>
        <button onClick={() => setKelas(null)} className={KELAS_TOMBOL_SEKUNDER + ' px-4 py-2.5 text-[13px]'}>
          Ganti Kelas
        </button>
      </div>

      {bolehTulis && (
        <div className="mb-6 flex flex-wrap items-end gap-3 rounded-card border border-border bg-panel-2 p-4">
          <div className="min-w-[240px] flex-1">
            <label className={KELAS_LABEL}>Tambah materi ke kelas ini</label>
            <select
              className={KELAS_INPUT}
              value={tambahKategori}
              onChange={(e) => setTambahKategori(e.target.value)}
            >
              <option value="">-- Pilih Materi/Kategori KBM --</option>
              {kategoriList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={tambahMateri}
            disabled={!tambahKategori || sibuk}
            className={KELAS_TOMBOL_UTAMA}
          >
            + Tambah Materi
          </button>
        </div>
      )}

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
      {!loading && !error && prota.length === 0 && (
        <p className="text-[13px] text-text-dim">
          Belum ada materi untuk kelas ini di tahun {tahun}.
        </p>
      )}

      {!loading &&
        prota.map((p, indeks) => {
          const dibuka = terbuka.has(p.id);
          const daftarPromes = promesPerProta.get(p.id) ?? [];
          return (
            <div
              key={p.id}
              className="mb-4 rounded-card border border-border bg-panel shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-4 p-4">
                <button
                  onClick={() =>
                    setTerbuka((s) => {
                      const baru = new Set(s);
                      if (baru.has(p.id)) baru.delete(p.id);
                      else baru.add(p.id);
                      return baru;
                    })
                  }
                  className="flex-1 cursor-pointer text-left"
                >
                  <div className="text-[15px] font-bold text-text">{namaDari(p.kategori_kbm)}</div>
                  <div className="mt-1 text-[13px] text-text">{p.target || '—'}</div>
                  {p.deskripsi && (
                    <div className="mt-1 whitespace-pre-line text-[12px] text-text-dim">
                      {p.deskripsi}
                    </div>
                  )}
                  <div className="mt-2 text-[12px] text-text-dim">
                    {dibuka ? '▾ Sembunyikan' : '▸ Lihat semester & bulanan'} ({daftarPromes.length} semester)
                  </div>
                </button>
                {bolehTulis && (
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => geser(indeks, -1)}
                        disabled={indeks === 0 || sibuk}
                        title="Naikkan urutan"
                        className={KELAS_TOMBOL_SEKUNDER + ' disabled:opacity-30'}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => geser(indeks, 1)}
                        disabled={indeks === prota.length - 1 || sibuk}
                        title="Turunkan urutan"
                        className={KELAS_TOMBOL_SEKUNDER + ' disabled:opacity-30'}
                      >
                        ↓
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          setUbah({
                            judul: 'Ubah Prota — ' + namaDari(p.kategori_kbm),
                            tabel: 'kurikulum_prota',
                            id: p.id,
                            isian: [
                              { label: 'Target', field: 'target', nilai: p.target ?? '' },
                              { label: 'Deskripsi', field: 'deskripsi', nilai: p.deskripsi ?? '', baris: true },
                            ],
                          })
                        }
                        className={KELAS_TOMBOL_SEKUNDER}
                      >
                        Ubah
                      </button>
                      {bolehHapus && (
                        <button
                          onClick={() => hapusMateri(p)}
                          disabled={sibuk}
                          className={KELAS_TOMBOL_SEKUNDER + ' text-red'}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {dibuka && (
                <div className="border-t border-border bg-panel-2 p-4">
                  {daftarPromes.length === 0 && (
                    <p className="text-[13px] text-text-dim">Belum ada program semester.</p>
                  )}
                  {daftarPromes.map((s) => {
                    const daftarProbul = probulPerPromes.get(s.id) ?? [];
                    return (
                      <div key={s.id} className="mb-4 rounded-[var(--radius)] border border-border bg-panel p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-[13px] font-bold text-text">Semester {s.semester}</div>
                            <div className="mt-1 text-[13px] text-text">{s.target || '—'}</div>
                            {s.deskripsi && (
                              <div className="mt-1 whitespace-pre-line text-[12px] text-text-dim">
                                {s.deskripsi}
                              </div>
                            )}
                          </div>
                          {bolehTulis && (
                            <div className="flex shrink-0 gap-2">
                            <button
                              onClick={() => setTargetUntuk({ promes: s, prota: p })}
                              className={KELAS_TOMBOL_SEKUNDER}
                            >
                              Target Bulanan
                            </button>
                            <button
                              onClick={() =>
                                setUbah({
                                  judul: 'Ubah Promes — Semester ' + s.semester,
                                  tabel: 'kurikulum_promes',
                                  id: s.id,
                                  isian: [
                                    { label: 'Target', field: 'target', nilai: s.target ?? '' },
                                    { label: 'Deskripsi', field: 'deskripsi', nilai: s.deskripsi ?? '', baris: true },
                                  ],
                                })
                              }
                              className={KELAS_TOMBOL_SEKUNDER}
                            >
                              Ubah
                            </button>
                            </div>
                          )}
                        </div>

                        {daftarProbul.length > 0 && (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full border-collapse text-left text-[12px]">
                              <thead className="border-b border-border">
                                <tr>
                                  {['Bulan', 'Jilid', 'Target', 'Mg 1', 'Mg 2', 'Mg 3', 'Mg 4'].map((h) => (
                                    <th key={h} className="px-2 py-2 font-semibold text-text-dim uppercase">
                                      {h}
                                    </th>
                                  ))}
                                  {bolehTulis && <th className="px-2 py-2"></th>}
                                </tr>
                              </thead>
                              <tbody>
                                {daftarProbul.map((b) => (
                                  <tr key={b.id} className="hover:bg-panel-2">
                                    <td className="border-b border-border px-2 py-2 text-text">
                                      {NAMA_BULAN[b.bulan - 1] ?? b.bulan}
                                    </td>
                                    <td className="border-b border-border px-2 py-2 text-text">{b.jilid || '—'}</td>
                                    <td className="border-b border-border px-2 py-2 text-text">{b.target || '—'}</td>
                                    <td className="border-b border-border px-2 py-2 text-text">{b.minggu1 || '—'}</td>
                                    <td className="border-b border-border px-2 py-2 text-text">{b.minggu2 || '—'}</td>
                                    <td className="border-b border-border px-2 py-2 text-text">{b.minggu3 || '—'}</td>
                                    <td className="border-b border-border px-2 py-2 text-text">{b.minggu4 || '—'}</td>
                                    {bolehTulis && (
                                      <td className="border-b border-border px-2 py-2">
                                        <button
                                          onClick={() =>
                                            setPencapaianUntuk({
                                              id: b.id,
                                              judul:
                                                (NAMA_BULAN[b.bulan - 1] ?? b.bulan) +
                                                ' — ' +
                                                (b.target ?? 'tanpa target'),
                                            })
                                          }
                                          className={KELAS_TOMBOL_SEKUNDER}
                                        >
                                          Pencapaian
                                        </button>
                                        <button
                                          onClick={() =>
                                            setUbah({
                                              judul:
                                                'Ubah Probul — ' + (NAMA_BULAN[b.bulan - 1] ?? b.bulan),
                                              tabel: 'kurikulum_probul',
                                              id: b.id,
                                              isian: [
                                                { label: 'Jilid', field: 'jilid', nilai: b.jilid ?? '' },
                                                { label: 'Target', field: 'target', nilai: b.target ?? '' },
                                                { label: 'Deskripsi', field: 'deskripsi', nilai: b.deskripsi ?? '', baris: true },
                                                { label: 'Minggu 1', field: 'minggu1', nilai: b.minggu1 ?? '' },
                                                { label: 'Minggu 2', field: 'minggu2', nilai: b.minggu2 ?? '' },
                                                { label: 'Minggu 3', field: 'minggu3', nilai: b.minggu3 ?? '' },
                                                { label: 'Minggu 4', field: 'minggu4', nilai: b.minggu4 ?? '' },
                                              ],
                                            })
                                          }
                                          className={KELAS_TOMBOL_SEKUNDER}
                                        >
                                          Ubah
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      {targetUntuk && kelompokId && (
        <TargetBulanan
          promesId={targetUntuk.promes.id}
          kelompokId={kelompokId}
          kategoriKbmId={targetUntuk.prota.kategori_kbm_id}
          tahun={tahun}
          semester={targetUntuk.promes.semester}
          probulAda={probulPerPromes.get(targetUntuk.promes.id) ?? []}
          onSelesai={muat}
          onTutup={() => setTargetUntuk(null)}
        />
      )}

      {pencapaianUntuk && kelompokId && (
        <PencapaianSantri
          probulId={pencapaianUntuk.id}
          kelompokId={kelompokId}
          judul={pencapaianUntuk.judul}
          onTutup={() => setPencapaianUntuk(null)}
        />
      )}

      {ubah && (
        <ModalUbah
          judul={ubah.judul}
          isian={ubah.isian}
          onBatal={() => setUbah(null)}
          onSimpan={simpanUbah}
        />
      )}
    </div>
  );
}

export default function KurikulumPage() {
  return (
    <RequireAuth>
      <KurikulumContent />
    </RequireAuth>
  );
}
