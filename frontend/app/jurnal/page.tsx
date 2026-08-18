'use client';

/* Halaman Jurnal KBM — padanan Modul_Jurnal.gs (287 baris, 8 fungsi).
   Satu entri = satu KELAS pada satu TANGGAL: materi yang disampaikan +
   catatan. Dipakai guru untuk kelasnya sendiri, dan admin untuk kelas mana
   pun dalam scope-nya.

   TIGA HAL YANG BERBEDA DARI APP LAMA — sengaja, karena skema Supabase
   memang lebih ketat dan sudah terlanjur begitu sejak migrasi 17 Agt:

   1. `kelas_id` (FK ke tabel `kelas`), bukan teks bebas seperti Firestore.
      Konsekuensinya jurnal hanya bisa dibuat untuk kelas yang benar-benar
      terdaftar — di app lama nama kelas diketik bebas dan salah ketik
      diam-diam membuat "kelas" baru.
   2. Tidak ada docId `slug(kelas)__tanggal`. Keunikan dijaga indeks
      `uq_jurnal_kbm_kelas_tanggal (kelas_id, tanggal) WHERE deleted_at IS
      NULL`.
   3. Hapus bersifat HALUS (isi `deleted_at`), bukan hilang permanen.
      jurnal_kbm memang TIDAK punya policy DELETE sama sekali — siapa pun,
      termasuk admin_ppg, tidak bisa menghapus barisnya lewat PostgREST.

   ⚠️ Indeks uniknya PARSIAL, jadi `.upsert({ onConflict })` akan gagal
   42P10 — PostgREST menolak partial unique index sebagai target konflik.
   Karena itu simpan dilakukan dua langkah: cari baris hidup dulu, lalu
   UPDATE kalau ada / INSERT kalau belum. */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type Kelas = { id: number; nama: string; kelompok_id: number; guru_id: number | null };
type Kelompok = { id: number; nama: string };
type Jurnal = {
  id: number;
  kelas_id: number;
  tanggal: string;
  materi: string;
  catatan: string | null;
  guru_id: number | null;
};

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

function JurnalContent() {
  const { profile } = useAuth();
  const adalahGuru = profile?.role === 'guru';

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | null>(null);
  const [tanggal, setTanggal] = useState(hariIni());

  const [materi, setMateri] = useState('');
  const [catatan, setCatatan] = useState('');
  const [entriAda, setEntriAda] = useState<Jurnal | null>(null);
  const [riwayat, setRiwayat] = useState<Jurnal[]>([]);

  const [loading, setLoading] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
  }, []);

  /* Daftar kelas yang boleh diisi. Untuk guru dibatasi ke kelas yang dia
     ampu — bukan demi kenyamanan saja: policy insert/update jurnal_kbm
     memang hanya mengizinkan `kelas.guru_id = profile.guru_id`, jadi kelas
     lain akan ditolak Postgres kalau tetap dicoba. */
  useEffect(() => {
    async function load() {
      if (!kelompokId) {
        setKelasList([]);
        return;
      }
      let q = supabase
        .from('kelas')
        .select('id, nama, kelompok_id, guru_id')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama');
      if (adalahGuru && profile?.guru_id != null) q = q.eq('guru_id', profile.guru_id);
      const { data } = await q;
      const daftar = (data ?? []) as unknown as Kelas[];
      setKelasList(daftar);
      setKelasId((s) => (s && daftar.some((k) => k.id === s) ? s : (daftar[0]?.id ?? null)));
    }
    load();
  }, [kelompokId, adalahGuru, profile?.guru_id]);

  const muat = useCallback(async () => {
    if (!kelasId) {
      setEntriAda(null);
      setMateri('');
      setCatatan('');
      setRiwayat([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: dEntri, error: e1 } = await supabase
        .from('jurnal_kbm')
        .select('id, kelas_id, tanggal, materi, catatan, guru_id')
        .eq('kelas_id', kelasId)
        .eq('tanggal', tanggal)
        .is('deleted_at', null)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      const entri = (dEntri ?? null) as unknown as Jurnal | null;
      setEntriAda(entri);
      setMateri(entri?.materi ?? '');
      setCatatan(entri?.catatan ?? '');

      /* Riwayat 30 entri terakhir kelas itu — padanan serverGetJurnalRiwayat. */
      const { data: dRiwayat, error: e2 } = await supabase
        .from('jurnal_kbm')
        .select('id, kelas_id, tanggal, materi, catatan, guru_id')
        .eq('kelas_id', kelasId)
        .is('deleted_at', null)
        .order('tanggal', { ascending: false })
        .limit(30);
      if (e2) throw new Error(e2.message);
      setRiwayat((dRiwayat ?? []) as unknown as Jurnal[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat jurnal.');
    } finally {
      setLoading(false);
    }
  }, [kelasId, tanggal]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function simpan() {
    if (!kelasId) return;
    if (!materi.trim()) {
      setError('Materi wajib diisi.');
      return;
    }
    setMenyimpan(true);
    setError(null);
    setPesan(null);
    try {
      const isi = {
        materi: materi.trim(),
        catatan: catatan.trim() || null,
        /* guru_id diambil dari kelas, bukan dari pengguna yang menyimpan —
           admin yang mengisikan jurnal tetap mencatat guru pengampunya. */
        guru_id: kelasList.find((k) => k.id === kelasId)?.guru_id ?? null,
        dicatat_oleh: profile?.display_name ?? null,
      };

      /* Dua langkah, bukan .upsert — lihat catatan 42P10 di kepala berkas.
         kelompok_id sengaja tidak dikirim: trigger
         trg_jurnal_kbm_sync_kelompok_id mengisinya dari kelas_id. */
      const { error: err } = entriAda
        ? await supabase.from('jurnal_kbm').update(isi).eq('id', entriAda.id)
        : await supabase.from('jurnal_kbm').insert({ ...isi, kelas_id: kelasId, tanggal });
      if (err) throw new Error(err.message);

      setPesan(entriAda ? 'Jurnal diperbarui.' : 'Jurnal tersimpan.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan jurnal.');
    } finally {
      setMenyimpan(false);
    }
  }

  async function hapus(j: Jurnal) {
    if (!window.confirm(`Hapus jurnal tanggal ${j.tanggal}?`)) return;
    setError(null);
    setPesan(null);
    try {
      /* Hapus HALUS — jurnal_kbm tidak punya policy DELETE sama sekali,
         jadi DELETE beneran akan menghapus 0 baris tanpa error. */
      const { error: err } = await supabase
        .from('jurnal_kbm')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', j.id);
      if (err) throw new Error(err.message);
      setPesan('Jurnal dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Jurnal KBM</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Catatan materi dan hal penting tiap sesi, satu entri per kelas per tanggal.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={KELAS_LABEL}>Kelompok</label>
          <select
            className={KELAS_INPUT}
            value={kelompokId ?? ''}
            disabled={adalahGuru || profile?.role === 'admin_kelompok'}
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
          <label className={KELAS_LABEL}>Kelas</label>
          <select
            className={KELAS_INPUT}
            value={kelasId ?? ''}
            onChange={(e) => setKelasId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Pilih Kelas --</option>
            {kelasList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
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
      </div>

      {!kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}
      {kelompokId && kelasList.length === 0 && (
        <p className="text-[13px] text-text-dim">
          {adalahGuru
            ? 'Belum ada kelas yang tercatat diampu oleh Anda.'
            : 'Kelompok ini belum punya kelas terdaftar. Jurnal hanya bisa diisi untuk kelas yang ada.'}
        </p>
      )}

      {kelasId && (
        <>
          <div className="mb-8 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-[15px] font-bold text-text">
                {entriAda ? 'Ubah Jurnal' : 'Isi Jurnal'} &middot;{' '}
                {kelasList.find((k) => k.id === kelasId)?.nama}
              </div>
              {entriAda && (
                <span className="rounded-[var(--radius)] border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-text-dim">
                  sudah ada entri
                </span>
              )}
            </div>

            <div className="mb-4">
              <label className={KELAS_LABEL}>Materi *</label>
              <textarea
                rows={3}
                className={KELAS_INPUT}
                value={materi}
                onChange={(e) => setMateri(e.target.value)}
                placeholder="Materi yang disampaikan hari ini"
              />
            </div>
            <div className="mb-4">
              <label className={KELAS_LABEL}>Catatan</label>
              <textarea
                rows={3}
                className={KELAS_INPUT}
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Hal penting lain: kendala, capaian santri, dsb."
              />
            </div>

            {pesan && <p className="mb-3 text-[13px] text-sage">{pesan}</p>}
            {error && <p className="mb-3 text-[13px] text-red">{error}</p>}

            <button onClick={simpan} disabled={menyimpan || loading} className={KELAS_TOMBOL_UTAMA}>
              {menyimpan ? 'Menyimpan...' : entriAda ? 'Perbarui Jurnal' : 'Simpan Jurnal'}
            </button>
          </div>

          <div className="mb-3 text-[15px] font-bold text-text">Riwayat Kelas Ini</div>
          {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
          {!loading && riwayat.length === 0 && (
            <p className="text-[13px] text-text-dim">Belum ada jurnal untuk kelas ini.</p>
          )}
          {!loading && riwayat.length > 0 && (
            <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="border-b border-border bg-panel-2">
                  <tr>
                    {['Tanggal', 'Materi', 'Catatan'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {riwayat.map((j) => {
                    const [t, b] = [j.tanggal.slice(8, 10), Number(j.tanggal.slice(5, 7))];
                    return (
                      <tr key={j.id} className="hover:bg-panel-2">
                        <td className="border-b border-border px-3 py-3 whitespace-nowrap text-text">
                          {t} {NAMA_BULAN[b - 1]?.slice(0, 3)} {j.tanggal.slice(0, 4)}
                        </td>
                        <td className="border-b border-border px-3 py-3 whitespace-pre-line text-text">
                          {j.materi}
                        </td>
                        <td className="border-b border-border px-3 py-3 whitespace-pre-line text-text-dim">
                          {j.catatan || '—'}
                        </td>
                        <td className="border-b border-border px-3 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => setTanggal(j.tanggal)} className={KELAS_TOMBOL_SEKUNDER}>
                              Buka
                            </button>
                            <button
                              onClick={() => hapus(j)}
                              className={KELAS_TOMBOL_SEKUNDER + ' text-red'}
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function JurnalPage() {
  return (
    <RequireAuth>
      <JurnalContent />
    </RequireAuth>
  );
}
