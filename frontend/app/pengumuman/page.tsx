'use client';

/* Halaman Pengumuman — padanan Modul_MaintainPengumuman.gs (149 baris,
   4 fungsi). Daftar pengumuman per kelompok, terbaru dulu, dengan kategori
   baku dari KATEGORI_PENGUMUMAN_ app lama.

   Fondasi DB-nya baru dibuat di migrasi 20260818140000: tabel `pengumuman`
   dan `kategori_pengumuman` sebelumnya punya RLS aktif TANPA policy sama
   sekali — tertutup senyap, SELECT selalu 0 baris — dan tabel kategorinya
   kosong karena di app lama nilainya cuma konstanta di kode.

   Dua hal yang berbeda dari tabel lain di app ini:
   - Kategori BOLEH kosong. App lama menerima entri tanpa kategori (mis.
     dari generator pengumuman KBM yang mencakup beberapa jenjang) dan
     memasukkannya ke bucket "Lainnya", bukan menolaknya.
   - Hapus bersifat PERMANEN dan boleh dilakukan admin kelompok sendiri.
     Tabelnya tidak punya `deleted_at`, dan pengumuman memang catatan
     berumur pendek yang dicabut sendiri oleh pembuatnya. */

import PesanGalat from '@/components/ui/PesanGalat';
import { useCallback, useEffect, useRef, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import AdminHeader from '@/components/dashboard/AdminHeader';
import PengumumanKbmComposer from '@/components/pengumuman/PengumumanKbmComposer';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import { useKonfirmasi } from '@/components/ui/useKonfirmasi';
import { useToast } from '@/components/ui/useToast';
import EmptyState from '@/components/ui/EmptyState';
import { CalendarDays, Megaphone, Pencil, Trash2 } from 'lucide-react';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';

const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];
const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type Kategori = { id: number; nama: string; urutan: number };
type Kelompok = { id: number; nama: string };
type Tersemat = { nama: string } | { nama: string }[] | null;
type Pengumuman = {
  id: number;
  kelompok_id: number;
  kategori_pengumuman_id: number | null;
  judul: string;
  isi: string;
  tanggal: string;
  kategori_pengumuman: Tersemat;
};

function namaKategori(nilai: Tersemat) {
  if (!nilai) return 'Lainnya';
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? 'Lainnya';
}

function tanggalPanjang(iso: string) {
  const [t, b, h] = [iso.slice(0, 4), Number(iso.slice(5, 7)), iso.slice(8, 10)];
  return `${h} ${NAMA_BULAN[b - 1] ?? b} ${t}`;
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

/* 'YYYY-MM-DD' -> "28 Agu 2026", utk tombol pemicu TanggalPicker. */
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtTglSingkat(v: string) {
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  return `${d} ${BULAN_SINGKAT[m - 1] ?? m} ${y}`;
}

function FormPengumuman({
  awal,
  kategoriList,
  onBatal,
  onSimpan,
}: {
  awal: Pengumuman | null;
  kategoriList: Kategori[];
  onBatal: () => void;
  onSimpan: (isi: Record<string, unknown>) => Promise<void>;
}) {
  const [judul, setJudul] = useState(awal?.judul ?? '');
  const [isi, setIsi] = useState(awal?.isi ?? '');
  const [tanggal, setTanggal] = useState(awal?.tanggal ?? hariIni());
  const [kategoriId, setKategoriId] = useState(
    awal?.kategori_pengumuman_id != null ? String(awal.kategori_pengumuman_id) : ''
  );
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Kalender kustom, samakan dgn layar guru lain (2026-08-28). */
  const [tglBuka, setTglBuka] = useState(false);
  const [posTgl, setPosTgl] = useState<PosisiPicker | null>(null);
  const refTgl = useRef<HTMLButtonElement>(null);
  function bukaTgl() {
    const r = refTgl.current?.getBoundingClientRect();
    if (r) setPosTgl({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setTglBuka(true);
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!judul.trim()) return setError('Judul wajib diisi.');
    if (!isi.trim()) return setError('Isi pengumuman wajib diisi.');
    if (!tanggal) return setError('Tanggal wajib diisi.');

    setMenyimpan(true);
    try {
      await onSimpan({
        judul: judul.trim(),
        isi: isi.trim(),
        tanggal,
        /* Kosong disimpan NULL, bukan ditolak — lihat catatan di kepala berkas. */
        kategori_pengumuman_id: kategoriId ? Number(kategoriId) : null,
      });
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      {/* Dirender di dalam modal, sama persis pola SantriForm.tsx yang
          sudah jalan di produksi -- TanggalPicker `position: fixed` tidak
          terpotong oleh overflow-y-auto pembungkusnya (yang memotong cuma
          ancestor yang jadi containing block, mis. punya transform). */}
      <TanggalPicker
        terbuka={tglBuka}
        posisi={posTgl}
        nilai={tanggal}
        onPilih={setTanggal}
        onTutup={() => setTglBuka(false)}
      />
      <form
        onSubmit={simpan}
        className="my-8 w-full max-w-2xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]"
      >
        <h2 className="mb-6 text-[20px] font-bold text-text">
          {awal ? 'Ubah Pengumuman' : 'Buat Pengumuman'}
        </h2>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Tanggal *</label>
            <button
              type="button"
              ref={refTgl}
              onClick={bukaTgl}
              className={`${KELAS_INPUT} flex items-center justify-between text-left`}
            >
              {fmtTglSingkat(tanggal)}
              <CalendarDays size={14} className="shrink-0 text-text-faint" />
            </button>
          </div>
          <div>
            <label className={KELAS_LABEL}>Kategori</label>
            <select
              className={KELAS_INPUT}
              value={kategoriId}
              onChange={(e) => setKategoriId(e.target.value)}
            >
              <option value="">-- Tanpa kategori --</option>
              {kategoriList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <label className={KELAS_LABEL}>Judul *</label>
          <input
            className={KELAS_INPUT}
            value={judul}
            onChange={(e) => setJudul(e.target.value)}
            placeholder="Misal: Libur KBM pekan depan"
          />
        </div>
        <div className="mb-4">
          <label className={KELAS_LABEL}>Isi *</label>
          <textarea
            rows={6}
            className={KELAS_INPUT}
            value={isi}
            onChange={(e) => setIsi(e.target.value)}
            placeholder="Tulis isi pengumuman di sini"
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

function PengumumanContent() {
  const { profile, namaKelompok } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');
  /* Yang membedakan peran di layar ini tinggal CAKUPAN, bukan rupa: admin
     kelompok terkunci ke kelompoknya sendiri, admin desa/PPG harus memilih
     dulu kelompok mana yang diumumkan. Lihat catatan panjang di atas
     return(). */
  const terkunciSatuKelompok = profile?.scope_kelompok_id != null;

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [kategoriList, setKategoriList] = useState<Kategori[]>([]);
  const [daftar, setDaftar] = useState<Pengumuman[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const { konfirmasi, dialog } = useKonfirmasi();
  const { sukses } = useToast();
  /* Pesan sukses tampil sebagai toast melayang, bukan teks hijau kecil di
     tengah halaman yang mudah terlewat (2026-08-28). Dijembatani dari state
     `pesan` yang sudah ada supaya SELURUH pemanggil setPesan() ikut, tanpa
     perlu menyentuh satu per satu. */
  useEffect(() => {
    if (!pesan) return;
    sukses(pesan);
    setPesan(null);
  }, [pesan, sukses]);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Pengumuman | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: dKel }, { data: dKat }] = await Promise.all([
        supabase.from('kelompok').select('id, nama').order('nama'),
        supabase.from('kategori_pengumuman').select('id, nama, urutan').order('urutan'),
      ]);
      setKelompokList(dKel ?? []);
      setKategoriList((dKat ?? []) as unknown as Kategori[]);
    }
    load();
  }, []);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setDaftar([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('pengumuman')
        .select('id, kelompok_id, kategori_pengumuman_id, judul, isi, tanggal, kategori_pengumuman(nama)')
        .eq('kelompok_id', kelompokId)
        .order('tanggal', { ascending: false });
      if (err) throw new Error(err.message);
      setDaftar((data ?? []) as unknown as Pengumuman[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pengumuman.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function simpan(isi: Record<string, unknown>) {
    if (!kelompokId) return;
    const { error: err } = sedangDiubah
      ? await supabase.from('pengumuman').update(isi).eq('id', sedangDiubah.id)
      : await supabase.from('pengumuman').insert({
          ...isi,
          kelompok_id: kelompokId,
          dibuat_oleh: profile?.id ?? null,
        });
    if (err) throw new Error(err.message);
    setFormTerbuka(false);
    setPesan(sedangDiubah ? 'Pengumuman diperbarui.' : 'Pengumuman dibuat.');
    await muat();
  }

  async function hapus(p: Pengumuman) {
    const setuju = await konfirmasi({
      judul: `Hapus pengumuman "${p.judul}"?`,
      pesan: 'Tindakan ini tidak bisa dibatalkan.',
      bahaya: true,
    });
    if (!setuju) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('pengumuman').delete().eq('id', p.id);
      if (err) throw new Error(err.message);
      setPesan('Pengumuman dihapus.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  /* SATU tampilan utk SEMUA peran admin (2026-08-29, laporan owner: "ketika
     saya masuk tampilan nya berubah kembali ke tampilan lama").

     Duduk perkaranya: tata letak komposer-dulu ini dulu dikunci ke
     `role === 'admin_kelompok'` saja, padahal akun yang dipakai owner
     sehari-hari adalah admin_ppg -- jadi begitu ia masuk lewat akun itu,
     yang muncul memang layar CRUD lebar yang lama, persis seperti sebelum
     dirapikan. Dua desain untuk satu halaman cuma menunggu waktu utk
     terbaca sebagai kerusakan; yang boleh berbeda antar-peran itu HAK-nya,
     bukan rupanya.

     Yang benar-benar berbeda tinggal CAKUPAN, dan itu ditentukan oleh
     `scope_kelompok_id` -- bukan oleh nama peran: yang terkunci ke satu
     kelompok tidak diberi pemilih (dulu pun selalu `disabled`, murni derau
     di layar HP), yang cakupannya lintas-kelompok memilih dulu baru
     komposernya muncul.

     Riwayat pengumuman TETAP di bawah komposer: ubah/hapus itu kemampuan
     khas admin, tidak ikut hilang hanya karena tampilannya diseragamkan. */
  const namaKelompokTerpilih =
    kelompokList.find((k) => k.id === kelompokId)?.nama ?? namaKelompok ?? '';

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Pengumuman" />
      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
      {dialog}
      <h1 className="mb-1 text-[17px] font-bold text-text">Pengumuman Jadwal KBM</h1>
      <p className="mb-5 text-[12.5px] text-text-dim">
        Susun pengumuman jadwal KBM, lalu salin ke grup WA wali murid.
      </p>

      {!terkunciSatuKelompok && (
        <div className="mb-5">
          <label className={KELAS_LABEL}>Kelompok</label>
          <select
            className={KELAS_INPUT}
            value={kelompokId ?? ''}
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
      )}

      {kelompokId && (
        <div className="mb-8">
          <PengumumanKbmComposer
            kelompokId={kelompokId}
            namaKelompok={namaKelompokTerpilih}
            onTersimpan={muat}
          />
        </div>
      )}

      {/* Tombol "+ Buat" DIHAPUS (diminta owner 2026-08-28). Bagian ini
          kini murni RIWAYAT: pengumuman dibuat lewat komposer Jadwal KBM
          di atasnya. Mengubah/menghapus entri lama tetap bisa lewat ikon
          pensil & tempat sampah di tiap kartu. */}
      <h2 className="mb-3 text-[15px] font-extrabold text-text">Riwayat Pengumuman</h2>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}
      {loading && <SkeletonKartuList jumlah={3} />}
      {!loading && !kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}
      {!loading && kelompokId && daftar.length === 0 && (
        <EmptyState ikon={<Megaphone size={22} />} judul="Belum ada pengumuman" deskripsi="Pengumuman untuk kelompok ini belum ada." />
      )}

      {!loading &&
        daftar.map((p) => (
          <div
            key={p.id}
            className="mb-4 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-bold text-text">{p.judul}</span>
                  <span className="rounded-[var(--radius)] border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-text-dim">
                    {namaKategori(p.kategori_pengumuman)}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-text-dim">{tanggalPanjang(p.tanggal)}</div>
                <div className="mt-3 whitespace-pre-line text-[13px] text-text">{p.isi}</div>
              </div>
              {/* Ikon telanjang, TANPA bungkus lingkaran/kotak (diminta
                  owner 2026-08-28) -- teks "Ubah"/"Hapus" diganti pensil &
                  tempat sampah. aria-label tetap ada supaya maknanya tidak
                  hilang bagi pembaca layar. */}
              {bolehTulis && (
                <div className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    aria-label="Ubah pengumuman"
                    onClick={() => {
                      setSedangDiubah(p);
                      setFormTerbuka(true);
                    }}
                    className="cursor-pointer border-none bg-transparent p-0 text-text-dim active:opacity-60"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Hapus pengumuman"
                    onClick={() => hapus(p)}
                    className="cursor-pointer border-none bg-transparent p-0 text-red active:opacity-60"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

      {formTerbuka && (
        <FormPengumuman
          awal={sedangDiubah}
          kategoriList={kategoriList}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpan}
        />
      )}

      </div>
    </main>
  );
}

/* Layar guru: bukan daftar CRUD admin, langsung komposer -- "dewan guru"
   yang berbagi pengumuman jadwal KBM ke grup WA wali murid, jadi tujuan
   utamanya SELALU "buat dari jadwal hari ini", bukan menelusuri arsip.
   Migrasi 20260823110000 membuka INSERT `pengumuman` utk peran guru
   (scoped ke kelompoknya sendiri) supaya Simpan di sini benar-benar bisa
   dipakai, bukan cuma salin manual. */
function PengumumanGuruView() {
  const { profile, namaKelompok } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  /* Akar WAJIB <main>, bukan <div> (diperbaiki 2026-08-28, laporan owner
     "tombol pengumuman kanan bawah tertutup bottom bar"): ruang bawah utk
     bottom tab bar guru dipasang lewat aturan global
     `body:has([data-guru-nav]) main` di globals.css -- pembungkus <div>
     tidak pernah kena aturan itu, jadi tombol Salin/Simpan di dasar
     halaman tertimbun navnya. */
  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <JurnalHeaderChrome tampilkanHero={false} />
      <div className="flex-1 p-4">
        <h1 className="mb-1 text-[17px] font-bold text-text">Pengumuman Jadwal KBM</h1>
        <p className="mb-5 text-[12.5px] text-text-dim">
          Susun pengumuman jadwal KBM hari ini, lalu salin ke grup WA wali murid.
        </p>
        {kelompokId ? (
          <PengumumanKbmComposer kelompokId={kelompokId} namaKelompok={namaKelompok ?? ''} />
        ) : (
          <p className="text-[13px] text-text-dim">Kelompok belum diketahui.</p>
        )}
      </div>
    </main>
  );
}

export default function PengumumanPage() {
  return (
    <RequireAuth>
      <PengumumanRouter />
    </RequireAuth>
  );
}

function PengumumanRouter() {
  const { profile } = useAuth();
  /* Selagi peran belum diketahui JANGAN jatuh ke cabang admin di bawah --
     tata letaknya beda total dari layar guru, dan sekejap saja terlukis
     sudah terbaca sebagai "kedipan tampilan lama". RequireAuth memang
     sudah menahan render sampai profil termuat, tapi penjagaan ini
     menutup celah sisanya (mis. saat profileError terisi) dengan biaya
     satu baris. */
  if (!profile?.role) return null;
  if (profile.role === 'guru') return <PengumumanGuruView />;
  return <PengumumanContent />;
}
