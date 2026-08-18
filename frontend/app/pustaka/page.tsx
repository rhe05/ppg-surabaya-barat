'use client';

/* Halaman Pusat Unduhan — padanan Modul_MaintainPustakUnduhan.gs (231
   baris, 6 fungsi). Berkas diunggah ke bucket Supabase Storage `pustaka`,
   katalognya (judul/kategori/deskripsi/penghitung unduhan) di tabel
   public.files.

   Keputusan pemilik 18 Agt 2026 yang membentuk halaman ini:
   - bucket `pustaka`, batas 10 MB per berkas
   - yang boleh mengunggah: admin DAN guru (app lama menyebut guru
     "view-only"; ini perubahan yang diminta pemilik, bukan kelalaian)
   - berkas bersifat PUBLIK: tautannya bisa dibuka siapa saja tanpa login
     dan tidak kedaluwarsa

   ⚠️ Karena publik, halaman ini menampilkan peringatan tetap: jangan
   mengunggah dokumen berisi data pribadi santri. Sekali tautannya tersebar,
   tidak ada cara menariknya kembali selain menghapus berkasnya.

   Menyunting & menghapus katalog dibatasi pengunggahnya sendiri atau
   admin_ppg — sama seperti konseling. Tombolnya disembunyikan untuk yang
   lain, karena operasi yang ditahan RLS tidak memunculkan error, hanya
   menghasilkan 0 baris. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const BUCKET = 'pustaka';
const BATAS_BYTE = 10 * 1024 * 1024;
/* Kategori baku app lama (kepala Modul_MaintainPustakUnduhan.gs). */
const KATEGORI = ['Modul', 'Soal', 'Dokumen', 'Pedoman', 'Lainnya'];
const PERAN_UNGGAH = ['admin_ppg', 'admin_desa', 'admin_kelompok', 'guru'];

type Berkas = {
  id: number;
  kategori: string | null;
  nama_file: string;
  deskripsi: string | null;
  url_file: string;
  ukuran_bytes: number | null;
  dibuat_oleh: string | null;
  created_at: string;
  download_count: number;
};

function ukuranTampil(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

function PustakaContent() {
  const { profile } = useAuth();
  const bolehUnggah = PERAN_UNGGAH.includes(profile?.role ?? '');

  const [daftar, setDaftar] = useState<Berkas[]>([]);
  const [cari, setCari] = useState('');
  const [filterKategori, setFilterKategori] = useState('');

  const [berkas, setBerkas] = useState<File | null>(null);
  const [kategori, setKategori] = useState('Modul');
  const [deskripsi, setDeskripsi] = useState('');

  const [loading, setLoading] = useState(false);
  const [mengunggah, setMengunggah] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('files')
        .select('id, kategori, nama_file, deskripsi, url_file, ukuran_bytes, dibuat_oleh, created_at, download_count')
        .order('created_at', { ascending: false });
      if (err) throw new Error(err.message);
      setDaftar((data ?? []) as unknown as Berkas[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat daftar berkas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const tersaring = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return daftar.filter(
      (b) =>
        (!filterKategori || b.kategori === filterKategori) &&
        (!kata ||
          b.nama_file.toLowerCase().includes(kata) ||
          (b.deskripsi ?? '').toLowerCase().includes(kata))
    );
  }, [daftar, cari, filterKategori]);


  /* Statistik berkas — padanan serverGetFileStats & serverGetFileCategories
     (Modul_MaintainPustakUnduhan.gs:76, 205). Dihitung dari daftar yang
     sudah dimuat: jumlah berkas di sini puluhan, bukan ribuan. */
  const statistik = useMemo(() => {
    const totalBytes = daftar.reduce((a, b) => a + (b.ukuran_bytes ?? 0), 0);
    const totalUnduh = daftar.reduce((a, b) => a + b.download_count, 0);
    const perKategori = new Map<string, number>();
    for (const b of daftar) perKategori.set(b.kategori ?? 'Lainnya', (perKategori.get(b.kategori ?? 'Lainnya') ?? 0) + 1);
    return { totalBytes, totalUnduh, perKategori: [...perKategori.entries()].sort((a, b) => b[1] - a[1]) };
  }, [daftar]);
  const bolehKelola = (b: Berkas) =>
    profile?.role === 'admin_ppg' || (!!profile?.id && b.dibuat_oleh === profile.id);

  async function unggah() {
    if (!berkas) return;
    setError(null);
    setPesan(null);

    /* Batas diperiksa di sini SEKALIGUS ditegakkan bucket (file_size_limit).
       Yang di sini hanya supaya pesannya jelas sebelum berkas besar
       terlanjur terkirim. */
    if (berkas.size > BATAS_BYTE) {
      setError(`Ukuran berkas ${ukuranTampil(berkas.size)} melebihi batas 10 MB.`);
      return;
    }

    setMengunggah(true);
    try {
      /* Nama objek diberi awalan waktu supaya dua orang yang mengunggah
         berkas bernama sama tidak saling menimpa. Karakter di luar
         huruf/angka diganti '-' karena nama objek ikut jadi bagian URL. */
      const aman = berkas.name.replace(/[^A-Za-z0-9._-]+/g, '-');
      const jalur = `${Date.now()}-${aman}`;

      const { error: eUnggah } = await supabase.storage.from(BUCKET).upload(jalur, berkas, {
        contentType: berkas.type || undefined,
        upsert: false,
      });
      if (eUnggah) throw new Error(eUnggah.message);

      const { data: dUrl } = supabase.storage.from(BUCKET).getPublicUrl(jalur);

      const { error: eCatat } = await supabase.from('files').insert({
        kategori,
        nama_file: berkas.name,
        deskripsi: deskripsi.trim() || null,
        url_file: dUrl.publicUrl,
        ukuran_bytes: berkas.size,
        dibuat_oleh: profile?.id ?? null,
      });
      if (eCatat) {
        /* Katalog gagal padahal berkas sudah naik: bersihkan supaya tidak
           meninggalkan berkas yatim yang tidak terlihat siapa pun. */
        await supabase.storage.from(BUCKET).remove([jalur]);
        throw new Error(eCatat.message);
      }

      setPesan(`"${berkas.name}" berhasil diunggah.`);
      setBerkas(null);
      setDeskripsi('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengunggah.');
    } finally {
      setMengunggah(false);
    }
  }

  async function hapus(b: Berkas) {
    if (!window.confirm(`Hapus "${b.nama_file}"? Berkasnya ikut terhapus permanen.`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('files').delete().eq('id', b.id);
      if (err) throw new Error(err.message);

      /* Jalur objek dipulihkan dari URL publiknya — bagian setelah
         '/pustaka/'. Kalau berkasnya sudah hilang, penghapusan storage
         gagal diam-diam dan itu tidak apa-apa: katalognya sudah bersih. */
      const tanda = `/${BUCKET}/`;
      const posisi = b.url_file.indexOf(tanda);
      if (posisi >= 0) {
        const jalur = decodeURIComponent(b.url_file.slice(posisi + tanda.length));
        await supabase.storage.from(BUCKET).remove([jalur]);
      }

      setPesan('Berkas dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  async function catatUnduhan(b: Berkas) {
    /* Sengaja tidak ditunggu: kalau pencatatan gagal, unduhannya tetap
       harus jalan. */
    supabase.rpc('naikkan_unduhan', { p_file_id: b.id }).then(() => muat());
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Pusat Unduhan</h1>
      <p className="mb-4 text-[13px] text-text-dim">
        Modul, soal, dokumen, dan pedoman yang bisa diunduh bersama.
      </p>

      <div className="mb-6 rounded-card border border-brass/40 bg-brass/10 px-4 py-3 text-[12px] text-text">
        <strong>Berkas di sini bersifat publik.</strong> Tautannya bisa dibuka siapa saja tanpa
        login dan tidak kedaluwarsa. Jangan mengunggah dokumen berisi data pribadi santri.
      </div>

      {bolehUnggah && (
        <div className="mb-6 rounded-card border border-border bg-panel-2 p-4">
          <div className="mb-3 text-[13px] font-bold text-text">Unggah Berkas (maks 10 MB)</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={KELAS_LABEL}>Berkas *</label>
              <input
                type="file"
                className={KELAS_INPUT}
                onChange={(e) => setBerkas(e.target.files?.[0] ?? null)}
              />
              {berkas && (
                <p className="mt-1 text-[11px] text-text-dim">{ukuranTampil(berkas.size)}</p>
              )}
            </div>
            <div>
              <label className={KELAS_LABEL}>Kategori</label>
              <select
                className={KELAS_INPUT}
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
              >
                {KATEGORI.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={KELAS_LABEL}>Deskripsi</label>
              <input
                className={KELAS_INPUT}
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                placeholder="Keterangan singkat isi berkas"
              />
            </div>
          </div>
          <button onClick={unggah} disabled={!berkas || mengunggah} className={KELAS_TOMBOL_UTAMA + ' mt-4'}>
            {mengunggah ? 'Mengunggah...' : 'Unggah'}
          </button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          className={KELAS_INPUT}
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama berkas atau deskripsi..."
        />
        <select
          className={KELAS_INPUT}
          value={filterKategori}
          onChange={(e) => setFilterKategori(e.target.value)}
        >
          <option value="">Semua kategori</option>
          {KATEGORI.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      {daftar.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-3">
          <div className="rounded-card border border-border bg-panel px-4 py-3 shadow-[var(--shadow-card)]">
            <div className="text-[20px] font-bold text-text">{daftar.length}</div>
            <div className="text-[12px] text-text-dim">Berkas</div>
          </div>
          <div className="rounded-card border border-border bg-panel px-4 py-3 shadow-[var(--shadow-card)]">
            <div className="text-[20px] font-bold text-text">{ukuranTampil(statistik.totalBytes)}</div>
            <div className="text-[12px] text-text-dim">Total ukuran</div>
          </div>
          <div className="rounded-card border border-border bg-panel px-4 py-3 shadow-[var(--shadow-card)]">
            <div className="text-[20px] font-bold text-text">{statistik.totalUnduh}</div>
            <div className="text-[12px] text-text-dim">Total unduhan</div>
          </div>
          {statistik.perKategori.map(([k, n]) => (
            <div key={k} className="rounded-card border border-border bg-panel-2 px-4 py-3">
              <div className="text-[16px] font-bold text-text">{n}</div>
              <div className="text-[11px] text-text-dim">{k}</div>
            </div>
          ))}
        </div>
      )}
      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!loading && tersaring.length === 0 && (
        <p className="text-[13px] text-text-dim">
          {daftar.length === 0 ? 'Belum ada berkas.' : 'Tidak ada berkas yang cocok.'}
        </p>
      )}

      {!loading &&
        tersaring.map((b) => (
          <div
            key={b.id}
            className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]"
          >
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-bold text-text">{b.nama_file}</span>
                {b.kategori && (
                  <span className="rounded-[var(--radius)] border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-text-dim">
                    {b.kategori}
                  </span>
                )}
              </div>
              {b.deskripsi && <div className="mt-1 text-[12px] text-text-dim">{b.deskripsi}</div>}
              <div className="mt-1 text-[11px] text-text-faint">
                {ukuranTampil(b.ukuran_bytes)} · {b.download_count}× diunduh ·{' '}
                {b.created_at.slice(0, 10)}
              </div>
            </div>
            <div className="flex gap-2">
              <a
                href={b.url_file}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => catatUnduhan(b)}
                className={KELAS_TOMBOL_SEKUNDER + ' inline-block'}
              >
                Unduh
              </a>
              {bolehKelola(b) && (
                <button onClick={() => hapus(b)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                  Hapus
                </button>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

export default function PustakaPage() {
  return (
    <RequireAuth>
      <PustakaContent />
    </RequireAuth>
  );
}
