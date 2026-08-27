'use client';

/* "Data Guru" — mobile admin_kelompok (2026-08-26), item baru di menu
   hamburger admin (MenuAdmin.tsx). Gaya kartu meniru DataGenerusContent
   (app/santri-saya/page.tsx) punya guru: judul + tombol bulat "+" di
   kanan, kotak cari, daftar kartu — satu tap kartu = buka form Ubah.

   Beda sengaja dari Data Generus:
   - Guru TIDAK lewat alur ajukan_permintaan_generus — admin_kelompok
     sudah punya hak tulis langsung ke tabel `guru` (policy
     guru_insert_admin/guru_update_admin, migrasi 20260818090000).
   - Reuse penuh GuruForm + KOLOM_GURU/GuruRow dari components/guru/
     GuruForm.tsx (form modal yang sama dipakai GuruList desktop) —
     tidak menduplikasi field/validasi.

   Tombol bulat "+" DIGANTI ikon menu 3-pilihan (2026-08-26, putaran
   kedua, diminta owner) -- Tambah Guru / Hapus Guru / Riwayat Guru.
   "Hapus Guru" BUKAN hapus mentah: dicatat sbg riwayat (Purna/Pindah,
   tabel riwayat_guru, migrasi 20260826160000_riwayat_guru_purna_
   pindah.sql) lalu guru itu di-soft-delete SEJAK TANGGAL PERISTIWA,
   satu transaksi lewat RPC nonaktifkan_guru() -- pola SAMA PERSIS dgn
   nonaktifkan_santri() punya guru (migrasi 20260821130000). "Riwayat
   Guru" -> /riwayat-guru, daftar riwayat_guru kelompok ini. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, MoreVertical, UserPlus, UserX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import AdminHeader from '@/components/dashboard/AdminHeader';
import GuruForm, { KOLOM_GURU, hitungDurasi, type GuruRow } from '@/components/guru/GuruForm';

/* Kategori disimpan netral-gender di DB ("Muballigh ..."); tampilannya
   mengikuti jenis kelamin: perempuan -> "Muballighot ..." (diminta owner
   2026-08-27). Hanya MT & MS yang berbentuk gender; Guru Bantu/Mutu dst
   tidak berubah. Warna badge tetap dilihat dari nilai DB mentah. */
function labelKategori(kategori: string, jenisKelamin: string | null): string {
  if (jenisKelamin !== 'P') return kategori;
  if (kategori === 'Muballigh Tugasan') return 'Muballighot Tugasan';
  if (kategori === 'Muballigh Setempat') return 'Muballighot Setempat';
  return kategori;
}

const KATEGORI_WARNA: Record<string, string> = {
  'Muballigh Tugasan': 'text-indigo bg-[rgba(79,70,229,0.12)]',
  'Muballigh Setempat': 'text-sage bg-[rgba(5,150,105,0.12)]',
  'Guru Bantu': 'text-text-dim bg-panel-2',
  'Ketua Muda-i': 'text-brass bg-[rgba(217,119,6,0.12)]',
};

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

function hariIni() {
  const now = new Date();
  const lokal = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return lokal.toISOString().slice(0, 10);
}

/* Popup 3 pilihan di bawah ikon menu, pola SAMA PERSIS TambahMenu di
   app/santri-saya/page.tsx (overlay transparan + panel absolute nempel
   tombol pemicu, wrapper `relative`). */
function MenuAksiGuru({
  terbuka,
  onTutup,
  onTambah,
  onHapus,
  onRiwayat,
}: {
  terbuka: boolean;
  onTutup: () => void;
  onTambah: () => void;
  onHapus: () => void;
  onRiwayat: () => void;
}) {
  if (!terbuka) return null;
  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onTutup} />
      <div className="absolute top-full right-0 z-[91] mt-2 flex w-[200px] flex-col gap-0.5 rounded-[var(--radius-lg)] border border-border bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
        <button
          type="button"
          onClick={() => {
            onTutup();
            onTambah();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
        >
          <UserPlus size={18} strokeWidth={2} className="shrink-0 text-brass" />
          <span>Tambah Guru</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onTutup();
            onHapus();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
        >
          <UserX size={18} strokeWidth={2} className="shrink-0 text-red" />
          <span>Hapus Guru</span>
        </button>
        <button
          type="button"
          onClick={() => {
            onTutup();
            onRiwayat();
          }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
        >
          <History size={18} strokeWidth={2} className="shrink-0 text-indigo" />
          <span>Riwayat Guru</span>
        </button>
      </div>
    </>
  );
}

/* Modal "Hapus Guru" -- pilih guru dari daftar aktif, jenis Purna/
   Pindah, tanggal peristiwa (default hari ini), keterangan opsional.
   Submit -> RPC nonaktifkan_guru (catat riwayat_guru + soft-delete
   guru, satu transaksi). */
function HapusGuruModal({
  daftarGuru,
  onSelesai,
  onBatal,
}: {
  daftarGuru: GuruRow[];
  onSelesai: (namaGuru: string, jenis: 'Purna' | 'Pindah') => void;
  onBatal: () => void;
}) {
  const [guruId, setGuruId] = useState('');
  const [jenis, setJenis] = useState<'Purna' | 'Pindah'>('Purna');
  const [tanggal, setTanggal] = useState(hariIni);
  const [keterangan, setKeterangan] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan() {
    if (!guruId) return setError('Pilih guru yang akan ditandai.');
    setError(null);
    setMenyimpan(true);
    try {
      const { error: err } = await supabase.rpc('nonaktifkan_guru', {
        p: {
          guru_id: Number(guruId),
          jenis,
          tanggal,
          keterangan: keterangan.trim() || null,
        },
      });
      if (err) throw new Error(err.message);
      const nama = daftarGuru.find((g) => String(g.id) === guruId)?.nama ?? '-';
      onSelesai(nama, jenis);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-[430px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <h2 className="mb-1 text-[17px] font-bold text-text">Hapus Guru</h2>
        <p className="mb-4 text-[12.5px] text-text-dim">
          Dicatat sbg riwayat (bisa dilihat di "Riwayat Guru"), bukan dihapus permanen.
        </p>

        <label className={KELAS_LABEL}>Guru</label>
        <select
          className={KELAS_INPUT + ' mb-4'}
          value={guruId}
          onChange={(e) => setGuruId(e.target.value)}
        >
          <option value="">-- Pilih Guru --</option>
          {daftarGuru.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nama}
            </option>
          ))}
        </select>

        <label className={KELAS_LABEL}>Jenis</label>
        <div className="mb-4 flex gap-2">
          {(['Purna', 'Pindah'] as const).map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => setJenis(j)}
              className={`flex-1 cursor-pointer rounded-[var(--radius)] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all duration-150 active:scale-[0.97] ${
                jenis === j ? 'border-brass bg-[rgba(217,119,6,0.08)] text-brass' : 'border-border bg-panel text-text'
              }`}
            >
              {j}
            </button>
          ))}
        </div>

        <label className={KELAS_LABEL}>Sejak Tanggal</label>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className={KELAS_INPUT + ' mb-4'}
        />

        <label className={KELAS_LABEL}>Keterangan (opsional)</label>
        <input
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder={jenis === 'Pindah' ? 'Misal: pindah ke TPQ Al-Ikhlas' : ''}
          className={KELAS_INPUT + ' mb-4'}
        />

        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={menyimpan || !guruId}
            onClick={simpan}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-red bg-red px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {menyimpan ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GuruKelpMobile() {
  const router = useRouter();
  const [guru, setGuru] = useState<GuruRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [guruDiubah, setGuruDiubah] = useState<GuruRow | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [hapusTerbuka, setHapusTerbuka] = useState(false);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('guru')
      .select(KOLOM_GURU)
      .is('deleted_at', null)
      .order('nama');
    if (err) setError(err.message);
    else setGuru((data ?? []) as unknown as GuruRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const guruTersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    if (!term) return guru;
    return guru.filter(
      (g) =>
        g.nama.toLowerCase().includes(term) ||
        (g.kategori ?? '').toLowerCase().includes(term) ||
        (g.kategori
          ? labelKategori(g.kategori, g.jenis_kelamin).toLowerCase().includes(term)
          : false),
    );
  }, [guru, cari]);

  function bukaTambah() {
    setGuruDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(g: GuruRow) {
    setGuruDiubah(g);
    setFormTerbuka(true);
  }
  function selesaiForm(baru: boolean) {
    setFormTerbuka(false);
    setGuruDiubah(null);
    muat();
    setPesan(baru ? 'Guru baru tersimpan.' : 'Perubahan tersimpan.');
    setTimeout(() => setPesan(null), 4000);
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Data Guru" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        {pesan && (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-indigo bg-[#EEF2FF] px-4 py-3 text-[13px] font-semibold text-indigo">
            {pesan}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[17px] font-extrabold text-text">Data Guru ({guru.length})</div>
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="Menu Aksi Guru"
              onClick={() => setMenuTerbuka((v) => !v)}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-brass text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] active:scale-[0.92]"
            >
              <MoreVertical size={19} strokeWidth={2} />
            </button>
            <MenuAksiGuru
              terbuka={menuTerbuka}
              onTutup={() => setMenuTerbuka(false)}
              onTambah={bukaTambah}
              onHapus={() => setHapusTerbuka(true)}
              onRiwayat={() => router.push('/riwayat-guru')}
            />
          </div>
        </div>

        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama atau kategori..."
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

        {!loading && guruTersaring.length === 0 && (
          <p className="text-[13px] text-text-dim">
            {cari.trim() ? 'Tidak ada yang cocok.' : 'Belum ada guru terdaftar.'}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {guruTersaring.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => bukaUbah(g)}
              className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
            >
              {(() => {
                /* Lama mengajar dihitung LANGSUNG dari mulai_mengajar tiap
                   render (kolom lama_mengajar cuma cache teks saat simpan --
                   guru lama sering NULL / basi). Fallback ke kolom kalau
                   mulai_mengajar kosong. */
                const durasi = g.mulai_mengajar
                  ? hitungDurasi(g.mulai_mengajar)
                  : g.lama_mengajar;
                return (
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-bold text-text">{g.nama}</div>
                    <div className="mt-0.5 text-[11.5px] text-text">
                      {g.jenis_kelamin === 'L'
                        ? 'Laki-laki'
                        : g.jenis_kelamin === 'P'
                          ? 'Perempuan'
                          : '-'}
                      {g.nomor_wa ? ` · ${g.nomor_wa}` : ''}
                    </div>
                    {durasi && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center rounded-md bg-[rgba(13,148,136,0.1)] px-1.5 py-0.5 text-[10.5px] font-bold text-teal">
                          {durasi}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
              {g.kategori && (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap ${
                    KATEGORI_WARNA[g.kategori] ?? 'text-text-dim bg-panel-2'
                  }`}
                >
                  {labelKategori(g.kategori, g.jenis_kelamin)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {formTerbuka && (
        <GuruForm
          guru={guruDiubah}
          onBatal={() => setFormTerbuka(false)}
          onSelesai={() => selesaiForm(guruDiubah === null)}
        />
      )}

      {hapusTerbuka && (
        <HapusGuruModal
          daftarGuru={guru}
          onBatal={() => setHapusTerbuka(false)}
          onSelesai={(nama, jenis) => {
            setHapusTerbuka(false);
            muat();
            setPesan(`${nama} ditandai ${jenis}.`);
            setTimeout(() => setPesan(null), 4000);
          }}
        />
      )}
    </main>
  );
}
