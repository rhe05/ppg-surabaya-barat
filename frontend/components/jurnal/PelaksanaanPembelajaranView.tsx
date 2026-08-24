'use client';

/* Pelaksanaan Pembelajaran (guru mobile) — layar 2 dari 3, lihat catatan
   lengkap di RencanaPembelajaranView.tsx & migrasi
   20260820120000_jurnal_materi_rencana.sql.

   Selalu "hari ini": minggu_ke dihitung dari tanggal hari ini
   (mingguKeDariTanggal), materi yang tampil = seluruh baris jurnal_materi
   milik kelas pada minggu berjalan (baik yang sudah maupun belum
   disampaikan) -- guru mencentang satu-satu, isi catatan opsional, lalu
   "Simpan Pelaksanaan" sekali jalan (batch: UPDATE baris yang berubah +
   INSERT materi tambahan yang ditambahkan di sesi ini). Toggle checkbox
   TIDAK langsung menulis ke DB -- sengaja menunggu tombol Simpan, supaya
   guru bisa mencentang berkali-kali/ralat dulu sebelum benar-benar
   tersimpan (pola sama dgn app/absensi/page.tsx: toggle status di form,
   satu tombol Simpan di akhir).

   PUTARAN KEDUA (diminta owner, "standar produk SaaS profesional"): ikon
   lucide-react, <select> Kelas -> SelectKustom, "Memuat..." -> Skeleton,
   pesan/error inline -> toast. Hero TETAP ADA di layar ini (beda dari
   RencanaPembelajaranView.tsx yang hero-nya dihapus khusus) -- diminta
   owner cuma utk Rencana Pembelajaran. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, Plus, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import Skeleton from '@/components/ui/Skeleton';
import SelectKustom from '@/components/ui/SelectKustom';
import { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import ToastStack from '@/components/ui/ToastStack';
import { mingguKeDariTanggal, rentangMinggu, labelRentangMinggu } from '@/lib/mingguBulan';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type Kelas = { id: number; nama: string };
type Baris = {
  id: number | null; // null = materi tambahan baru, belum tersimpan
  judul: string;
  status: 'belum' | 'disampaikan';
  catatan: string;
  statusAsli: 'belum' | 'disampaikan';
  catatanAsli: string;
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function PelaksanaanPembelajaranView() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const { toasts, push, dismiss } = useToast();

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const tanggalLabel = sekarang.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  /* Bulan/Tahun/Minggu skrg BISA DIPILIH (diminta owner 2026-08-23,
     ikon kalender + info Bulan/Tahun sama spt RencanaPembelajaranView.tsx)
     -- sebelumnya SELALU "hari ini" (ketiganya diturunkan langsung dari
     `sekarang`, bukan state). Default awal tetap bulan/tahun/minggu
     berjalan (persis perilaku lama), guru cuma sekarang BISA geser ke
     minggu/bulan lain utk menyusulkan pelaksanaan yg lupa ditandai. */
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const [mingguKe, setMingguKe] = useState(mingguKeDariTanggal(sekarang));
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];
  const [pemilihBulanTerbuka, setPemilihBulanTerbuka] = useState(false);
  const [posisiPemilihBulan, setPosisiPemilihBulan] = useState<PosisiPicker | null>(null);
  const ikonKalenderRef = useRef<HTMLButtonElement>(null);

  /* Minggu yg sedang dipilih tidak selalu ada di bulan baru (mis. pindah
     dari bulan berminggu-5 ke bulan berminggu-4) -- turunkan ke minggu
     terakhir yg valid drpd diam-diam query minggu yg tidak ada. */
  useEffect(() => {
    if (!rentangMinggu(tahun, bulan, mingguKe)) {
      let mkValid = 1;
      for (let mk = 1; mk <= 5; mk++) if (rentangMinggu(tahun, bulan, mk)) mkValid = mk;
      setMingguKe(mkValid);
    }
  }, [tahun, bulan, mingguKe]);

  /* Dipakai utk membedakan label "Hari Ini"/"Minggu Ini" (default, spt
     semula) vs "Minggu {N}" polos (guru sedang menengok minggu/bulan
     lain, bukan yg berjalan sekarang). */
  const apakahMingguIni =
    tahun === sekarang.getFullYear() &&
    bulan === sekarang.getMonth() + 1 &&
    mingguKe === mingguKeDariTanggal(sekarang);

  const [baris, setBaris] = useState<Baris[]>([]);
  const [terbukaId, setTerbukaId] = useState<number | null>(null); // baris yg catatannya sedang diperluas
  const [loading, setLoading] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  const [tambahanTerbuka, setTambahanTerbuka] = useState(false);
  const [judulTambahan, setJudulTambahan] = useState('');

  useEffect(() => {
    if (guruId == null) return;
    supabase
      .from('kelas')
      .select('id, nama')
      .eq('guru_id', guruId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => {
        const list = (data ?? []) as Kelas[];
        setKelasList(list);
        setKelasId(list.length === 1 ? list[0].id : '');
      });
  }, [guruId]);

  const muat = useCallback(async () => {
    if (kelasId === '') {
      setBaris([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('jurnal_materi')
        .select('id, judul, status, catatan')
        .eq('kelas_id', kelasId)
        .eq('tahun', tahun)
        .eq('bulan', bulan)
        .eq('minggu_ke', mingguKe)
        .is('deleted_at', null)
        .order('id', { ascending: true });
      if (err) throw new Error(err.message);
      setBaris(
        (data ?? []).map((m) => ({
          id: m.id,
          judul: m.judul,
          status: m.status as 'belum' | 'disampaikan',
          catatan: m.catatan ?? '',
          statusAsli: m.status as 'belum' | 'disampaikan',
          catatanAsli: m.catatan ?? '',
        })),
      );
    } catch (e) {
      push(e instanceof Error ? e.message : 'Gagal memuat materi.', 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, tahun, bulan, mingguKe]);

  useEffect(() => {
    muat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, tahun, bulan, mingguKe]);

  function toggleStatus(idx: number) {
    setBaris((prev) =>
      prev.map((b, i) =>
        i === idx ? { ...b, status: b.status === 'disampaikan' ? 'belum' : 'disampaikan' } : b,
      ),
    );
    setTerbukaId((prev) => (baris[idx].id === prev ? prev : baris[idx].id));
  }

  function ubahCatatan(idx: number, catatan: string) {
    setBaris((prev) => prev.map((b, i) => (i === idx ? { ...b, catatan } : b)));
  }

  function tambahMateriTambahan() {
    if (judulTambahan.trim().length === 0) return;
    setBaris((prev) => [
      ...prev,
      {
        id: null,
        judul: judulTambahan.trim(),
        status: 'disampaikan',
        catatan: '',
        statusAsli: 'belum',
        catatanAsli: '',
      },
    ]);
    setJudulTambahan('');
    setTambahanTerbuka(false);
  }

  async function simpanPelaksanaan() {
    if (kelasId === '') return;
    setMenyimpan(true);
    try {
      const hariIni = todayStr();
      for (const b of baris) {
        const berubah = b.status !== b.statusAsli || b.catatan !== b.catatanAsli;
        if (b.id === null) {
          const { error: err } = await supabase.from('jurnal_materi').insert({
            kelas_id: kelasId,
            tahun,
            bulan,
            minggu_ke: mingguKe,
            judul: b.judul,
            status: b.status,
            tanggal_disampaikan: b.status === 'disampaikan' ? hariIni : null,
            catatan: b.catatan.trim() === '' ? null : b.catatan.trim(),
          });
          if (err) throw new Error(err.message);
        } else if (berubah) {
          const { error: err } = await supabase
            .from('jurnal_materi')
            .update({
              status: b.status,
              tanggal_disampaikan: b.status === 'disampaikan' ? hariIni : null,
              catatan: b.catatan.trim() === '' ? null : b.catatan.trim(),
            })
            .eq('id', b.id);
          if (err) throw new Error(err.message);
        }
      }
      push('Pelaksanaan tersimpan.', 'sukses');
      await muat();
    } catch (e) {
      push(e instanceof Error ? e.message : 'Gagal menyimpan pelaksanaan.', 'error');
    } finally {
      setMenyimpan(false);
    }
  }

  const direncanakan = baris.length;
  const disampaikan = baris.filter((b) => b.status === 'disampaikan').length;
  const persen = direncanakan > 0 ? Math.round((disampaikan / direncanakan) * 100) : 0;

  const opsiBulan = NAMA_BULAN.map((nm, idx) => ({ value: String(idx + 1), label: nm }));
  const opsiTahun = tahunPilihan.map((y) => ({ value: String(y), label: String(y) }));
  const opsiMinggu = [1, 2, 3, 4, 5]
    .filter((mk) => rentangMinggu(tahun, bulan, mk))
    .map((mk) => ({
      value: String(mk),
      label: `Minggu ${mk}`,
      sublabel: labelRentangMinggu(tahun, bulan, mk, NAMA_BULAN),
    }));

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      {/* Hero hijau (nama/peran/kelompok) DIHAPUS (diminta owner 2026-08-23,
          susulan dari keputusan yg sama di RencanaPembelajaranView.tsx) --
          murni pengulangan info yang sudah dilihat guru di Dashboard, tidak
          ada nilai tambah utk layar sub-alur spt ini. Top bar putih
          (hamburger+brand+bell) TETAP ADA -- itu satu-satunya jalan guru
          kembali ke menu, tidak boleh hilang (lihat JurnalHeaderChrome.tsx). */}
      <JurnalHeaderChrome tampilkanHero={false} />

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-10">
        {/* Judul + chip kelas kiri, ikon kalender + info Bulan/Tahun kanan --
            konsep & markup SAMA PERSIS RencanaPembelajaranView.tsx (diminta
            owner 2026-08-23). Popup-nya (di bawah) py SATU dropdown lebih
            banyak drpd punya Rencana: Minggu, krn Pelaksanaan kerja per-
            minggu (bukan menampilkan semua minggu bulan itu sekaligus spt
            Rencana) -- perlu tahu PERSIS minggu mana yg mau ditengok. */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="pt-1.5 text-[17px] font-extrabold text-text">Pelaksanaan Pembelajaran</div>
            {kelasList.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {kelasList.map((k) => {
                  const aktif = k.id === kelasId;
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => setKelasId(k.id)}
                      className={`flex shrink-0 items-center rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 text-[13.5px] font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.96] ${
                        aktif ? 'border-indigo text-indigo' : 'border-border bg-panel text-text'
                      }`}
                      style={aktif ? { background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)' } : undefined}
                    >
                      {k.nama}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              ref={ikonKalenderRef}
              type="button"
              aria-label="Pilih Bulan, Tahun, dan Minggu"
              onClick={() => {
                const rect = ikonKalenderRef.current?.getBoundingClientRect();
                if (rect) {
                  setPosisiPemilihBulan({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                }
                setPemilihBulanTerbuka((v) => !v);
              }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-[#EEF2FF] text-indigo transition-all duration-150 active:scale-[0.92]"
            >
              <Calendar size={19} />
            </button>
            <span className="rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-indigo">
              {NAMA_BULAN[bulan - 1]} {tahun}
            </span>
          </div>
        </div>

        {pemilihBulanTerbuka && posisiPemilihBulan && (
          <>
            <div className="fixed inset-0 z-[1090]" onClick={() => setPemilihBulanTerbuka(false)} />
            <div
              className="fixed z-[1100] w-[240px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
              style={{ top: posisiPemilihBulan.top, right: posisiPemilihBulan.right }}
            >
              <div className="mb-2 flex gap-2">
                <SelectKustom value={String(bulan)} onChange={(v) => setBulan(Number(v))} opsi={opsiBulan} />
                <SelectKustom value={String(tahun)} onChange={(v) => setTahun(Number(v))} opsi={opsiTahun} />
              </div>
              <SelectKustom value={String(mingguKe)} onChange={(v) => setMingguKe(Number(v))} opsi={opsiMinggu} />
            </div>
          </>
        )}

        {/* Pil tanggal, tema hijau muda — persis screenshot owner. Isinya
            ikut minggu yg dipilih (bukan selalu "hari ini" lagi): kalau
            minggu yg sedang dilihat memang minggu berjalan sekarang,
            tetap tampil tanggal hari ini spt semula; kalau bukan, tampil
            rentang tanggal minggu itu + label "Minggu N". */}
        <div className="mb-4 flex items-center gap-3 rounded-card border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sage">
            <Calendar size={18} />
          </span>
          <div>
            <div className="text-[13.5px] font-bold text-sage">
              {apakahMingguIni ? tanggalLabel : labelRentangMinggu(tahun, bulan, mingguKe, NAMA_BULAN)}
            </div>
            <div className="text-[11px] text-text-dim">{apakahMingguIni ? 'Hari ini' : `Minggu ${mingguKe}`}</div>
          </div>
        </div>

        {kelasId === '' ? (
          <p className="text-[13px] text-text-dim">Pilih kelas dulu utk melihat pelaksanaan minggu ini.</p>
        ) : (
          <>
            {/* Pertemuan Hari Ini/Minggu N */}
            <div className="mb-5 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[13px] font-bold text-text">
                  {apakahMingguIni ? 'Pertemuan Hari Ini' : `Pertemuan Minggu ${mingguKe}`}
                </div>
                <div className="text-[11.5px] text-text-dim">
                  {disampaikan} dari {direncanakan} selesai
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-6">
                  <div>
                    <div className="text-[24px] leading-none font-extrabold text-text">{direncanakan}</div>
                    <div className="text-[11px] text-text-dim">Direncanakan</div>
                  </div>
                  <div>
                    <div className="text-[24px] leading-none font-extrabold text-sage">{disampaikan}</div>
                    <div className="text-[11px] text-text-dim">Disampaikan</div>
                  </div>
                </div>
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 36 36" width="64" height="64">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="4" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="var(--sage)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={`${(persen / 100) * 97.4} 97.4`}
                      transform="rotate(-90 18 18)"
                    />
                  </svg>
                  <span className="absolute text-[13px] font-extrabold text-text">{persen}%</span>
                </div>
              </div>
            </div>

            <div className="mb-3 text-[15px] font-bold text-text">
              {apakahMingguIni ? 'Materi Hari Ini' : `Materi Minggu ${mingguKe}`}
            </div>

            {/* Skeleton HANYA di pemuatan pertama (belum ada baris sama
                sekali) -- diminta owner 2026-08-24: pindah chip kelas
                sebelumnya langsung mengganti daftar dgn Skeleton (tinggi
                tetap 3x52px) lalu berganti lagi ke daftar baru sesaat
                kemudian, dua kali lompat tinggi yg terasa sbg "loncat ke
                bawah" pada tombol2 di bawahnya. Kalau kelas sebelumnya
                SUDAH py baris (baris belum dikosongkan sampai data baru
                tiba -- lihat muat()), daftar lama tetap ditampilkan
                (diredupkan lewat opacity, bukan diganti Skeleton) sampai
                data baru siap lalu crossfade -- satu kali transisi halus,
                bukan dua kali lompat. */}
            {loading && baris.length === 0 && (
              <div className="mb-4 flex flex-col gap-2.5">
                <Skeleton className="h-[52px] w-full" />
                <Skeleton className="h-[52px] w-full" />
                <Skeleton className="h-[52px] w-full" />
              </div>
            )}
            {!loading && baris.length === 0 && (
              <p className="mb-4 text-[13px] text-text-dim">
                Belum ada materi direncanakan minggu ini. Tambahkan lewat &ldquo;Tambah Materi Tambahan&rdquo;
                di bawah.
              </p>
            )}

            {baris.length > 0 && (
              <div
                className={`mb-4 flex flex-col gap-2.5 transition-opacity duration-200 ${
                  loading ? 'pointer-events-none opacity-40' : 'opacity-100'
                }`}
              >
                {baris.map((b, idx) => {
                  const dicentang = b.status === 'disampaikan';
                  const diperluas = terbukaId === b.id || (b.id === null && dicentang);
                  return (
                    <div
                      key={b.id ?? `baru-${idx}`}
                      className={`rounded-card border p-3.5 transition-colors duration-150 ${
                        dicentang ? 'border-[#A7F3D0] bg-[#ECFDF5]' : 'border-border bg-panel'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleStatus(idx)}
                        className="flex w-full cursor-pointer items-center gap-3 border-none bg-transparent p-0 text-left"
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                            dicentang ? 'border-sage bg-sage' : 'border-border bg-panel'
                          }`}
                        >
                          {dicentang && <Check size={14} strokeWidth={3} color="#fff" />}
                        </span>
                        <span className="min-w-0 flex-1 text-[14px] font-bold text-text">{b.judul}</span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${
                            dicentang ? 'bg-sage text-white' : 'bg-panel-2 text-brass'
                          }`}
                        >
                          {dicentang ? 'Disampaikan' : 'Belum disampaikan'}
                        </span>
                      </button>

                      {diperluas && (
                        <div className="mt-2.5 pl-9">
                          <label className="mb-1 block text-[11px] font-semibold text-text-dim">Catatan</label>
                          <textarea
                            value={b.catatan}
                            onChange={(e) => ubahCatatan(idx, e.target.value)}
                            placeholder="Catatan pelaksanaan (opsional)"
                            rows={2}
                            className="w-full resize-none rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[12.5px] text-text"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!tambahanTerbuka ? (
              <button
                type="button"
                onClick={() => setTambahanTerbuka(true)}
                className="mb-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] border-[1.5px] border-dashed border-sage bg-transparent py-3 text-[13px] font-semibold text-sage"
              >
                <Plus size={16} strokeWidth={2.4} />
                Tambah Materi Tambahan
              </button>
            ) : (
              <div className="mb-4 rounded-card border border-border bg-panel p-3.5">
                <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">
                  Materi yang tidak ada di rencana
                </label>
                <input
                  type="text"
                  value={judulTambahan}
                  onChange={(e) => setJudulTambahan(e.target.value)}
                  placeholder="Judul materi"
                  className="mb-2 w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[13px] text-text"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={tambahMateriTambahan}
                    disabled={judulTambahan.trim().length === 0}
                    className="flex-1 cursor-pointer rounded-[var(--radius)] border-none bg-sage py-2 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Tambahkan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTambahanTerbuka(false);
                      setJudulTambahan('');
                    }}
                    className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2 text-[12.5px] font-semibold text-text"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={menyimpan || baris.length === 0}
              onClick={simpanPelaksanaan}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-[15px] text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(5,150,105,0.3)] transition-transform duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, var(--sage), var(--brand-green))' }}
            >
              <Check size={18} strokeWidth={2} />
              {menyimpan ? 'Menyimpan...' : 'Simpan Pelaksanaan'}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
