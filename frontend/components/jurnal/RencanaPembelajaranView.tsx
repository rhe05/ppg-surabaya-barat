'use client';

/* Rencana Pembelajaran (guru mobile) — diminta owner (20 Agt), "buatkan
   isi aplikasinya kurang lebih seperti [screenshot]". Layar 1 dari 3
   (Rencana/Pelaksanaan/Riwayat Pembelajaran), semuanya baca/tulis tabel
   baru `jurnal_materi` (migrasi 20260820120000) -- lihat komentar lengkap
   di migrasi itu ttg kenapa tabel baru, bukan perluasan jurnal_kbm/
   kurikulum_probul_minggu yang sudah ada.

   Guru menyusun daftar MATERI (bukan cuma satu blok teks bebas spt
   jurnal_kbm lama) per minggu dalam sebulan; Pelaksanaan nanti menandai
   materi minggu berjalan sbg disampaikan/belum + catatan; Riwayat
   menampilkan progres. Pembagian minggu: rentangMinggu (lib/
   mingguBulan.ts) -- rentang tanggal tetap 1-7/8-14/dst, BUKAN dari hari
   KBM sungguhan di jadwal_kbm (disederhanakan sengaja, level perencanaan
   bulanan kasar).

   PUTARAN KEDUA: form "Tambah Materi" diperkaya jadi bottom-sheet penuh
   (screenshot owner) -- Topik/Tanggal Rencana/Pertemuan ke-/Tujuan
   Pembelajaran/Catatan/Referensi/Pengingat, semua opsional kecuali
   Materi+Tanggal Rencana+Minggu. Kolom baru di migrasi 20260820130000.
   `pengingat_aktif` CUMA preferensi tersimpan -- app ini belum punya
   sistem notifikasi/pengingat sungguhan.

   PUTARAN KETIGA (diminta owner, "standar produk SaaS profesional"):
   - Hero hijau (nama/peran/kelompok) DIHAPUS KHUSUS di layar ini
     (tampilkanHero={false}) -- top bar putih (hamburger+brand+bell)
     TETAP ADA. Layar turunan/detail spt ini tidak perlu mengulang info
     yang sudah dilihat guru di Dashboard (lihat JurnalHeaderChrome.tsx
     utk alasan lengkap). Pelaksanaan & Riwayat TETAP pakai hero -- ini
     KHUSUS Rencana Pembelajaran, sesuai permintaan.
   - Ikon SVG tulis-tangan -> lucide-react sungguhan.
   - <select> native -> SelectKustom (dropdown sendiri, bukan OS --
     tampilan native beda-beda di iOS/Android).
   - <input type=date> native -> TanggalPicker.tsx (kalender custom yang
     SUDAH ADA di app ini, dipakai jg oleh GuruAbsensiView -- bukan
     komponen baru).
   - "Memuat..." -> Skeleton (components/ui/Skeleton.tsx).
   - Pesan sukses/gagal -> toast (components/ui/useToast.tsx +
     ToastStack.tsx), bukan teks inline lagi.
   - "Tambah Materi" jadi OPTIMISTIC: baris baru langsung muncul di daftar
     begitu Simpan ditekan (id sementara negatif), modal langsung
     tertutup -- tidak menunggu round-trip Supabase. Kalau INSERT gagal,
     baris sementara itu ditarik lagi + toast error. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen, Tag, Calendar, Hash, Target, FileText, Link2, Bell,
  X, Plus, Check, CalendarDays, ClipboardList,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import Skeleton from '@/components/ui/Skeleton';
import SelectKustom from '@/components/ui/SelectKustom';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import ToastStack from '@/components/ui/ToastStack';
import { rentangMinggu, labelRentangMinggu, mingguKeDariTanggal } from '@/lib/mingguBulan';

type Kelas = { id: number; nama: string };
type Materi = { id: number; minggu_ke: number; judul: string; status: string };

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const INPUT_STYLE =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text placeholder:text-text-faint focus:border-brass focus:outline-none';

let idSementara = -1;

function FieldTambah({ label, wajib, children }: { label: string; wajib?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">
        {label} {wajib && <span className="text-red">*</span>}
        {!wajib && <span className="font-normal text-text-faint"> (Opsional)</span>}
      </label>
      {children}
    </div>
  );
}

function InputIkon({
  value,
  onChange,
  placeholder,
  ikon,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ikon: React.ReactNode;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_STYLE} pr-9`}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-faint">{ikon}</span>
    </div>
  );
}

export default function RencanaPembelajaranView() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const { toasts, push, dismiss } = useToast();

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];
  const [pemilihBulanTerbuka, setPemilihBulanTerbuka] = useState(false);
  const [posisiPemilihBulan, setPosisiPemilihBulan] = useState<PosisiPicker | null>(null);
  const ikonKalenderRef = useRef<HTMLButtonElement>(null);

  const [materiList, setMateriList] = useState<Materi[]>([]);
  const [loading, setLoading] = useState(false);

  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  const [judulBaru, setJudulBaru] = useState('');
  const [topikBaru, setTopikBaru] = useState('');
  const [tanggalRencanaBaru, setTanggalRencanaBaru] = useState('');
  const [tanggalPickerTerbuka, setTanggalPickerTerbuka] = useState(false);
  const [posisiTanggalPicker, setPosisiTanggalPicker] = useState<PosisiPicker | null>(null);
  const tanggalBtnRef = useRef<HTMLButtonElement>(null);
  const [mingguBaru, setMingguBaru] = useState('1');
  const [pertemuanKeBaru, setPertemuanKeBaru] = useState('');
  const [tujuanBaru, setTujuanBaru] = useState('');
  const [catatanBaru, setCatatanBaru] = useState('');
  const [referensiBaru, setReferensiBaru] = useState('');
  const [pengingatBaru, setPengingatBaru] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);

  function bukaFormTambah() {
    setJudulBaru('');
    setTopikBaru('');
    setTanggalRencanaBaru(new Date().toISOString().slice(0, 10));
    setMingguBaru(String(mingguKeDariTanggal(new Date())));
    setPertemuanKeBaru('');
    setTujuanBaru('');
    setCatatanBaru('');
    setReferensiBaru('');
    setPengingatBaru(false);
    setTambahTerbuka(true);
  }

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

  const muatMateri = useCallback(async () => {
    if (kelasId === '') {
      setMateriList([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('jurnal_materi')
        .select('id, minggu_ke, judul, status')
        .eq('kelas_id', kelasId)
        .eq('tahun', tahun)
        .eq('bulan', bulan)
        .is('deleted_at', null)
        .order('minggu_ke', { ascending: true })
        .order('id', { ascending: true });
      if (err) throw new Error(err.message);
      setMateriList((data ?? []) as Materi[]);
    } catch (e) {
      push(e instanceof Error ? e.message : 'Gagal memuat rencana.', 'error');
    } finally {
      setLoading(false);
    }
  }, [kelasId, tahun, bulan, push]);

  useEffect(() => {
    muatMateri();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelasId, tahun, bulan]);

  async function simpanMateriBaru() {
    if (kelasId === '' || judulBaru.trim().length === 0 || tanggalRencanaBaru === '') return;
    const judul = judulBaru.trim();
    const mingguKe = Number(mingguBaru);

    // Optimistic: baris sementara langsung tampil, modal langsung tertutup.
    const sementara: Materi = { id: idSementara--, minggu_ke: mingguKe, judul, status: 'belum' };
    setMateriList((prev) => [...prev, sementara]);
    setTambahTerbuka(false);
    setMenyimpan(true);

    try {
      const { error: err } = await supabase.from('jurnal_materi').insert({
        kelas_id: kelasId,
        tahun,
        bulan,
        minggu_ke: mingguKe,
        judul,
        topik: topikBaru.trim() === '' ? null : topikBaru.trim(),
        tanggal_rencana: tanggalRencanaBaru,
        pertemuan_ke: pertemuanKeBaru.trim() === '' ? null : pertemuanKeBaru.trim(),
        tujuan_pembelajaran: tujuanBaru.trim() === '' ? null : tujuanBaru.trim(),
        catatan: catatanBaru.trim() === '' ? null : catatanBaru.trim(),
        referensi: referensiBaru.trim() === '' ? null : referensiBaru.trim(),
        pengingat_aktif: pengingatBaru,
      });
      if (err) throw new Error(err.message);
      push('Materi rencana tersimpan.', 'sukses');
      await muatMateri();
    } catch (e) {
      // Gagal -> tarik lagi baris sementara.
      setMateriList((prev) => prev.filter((m) => m.id !== sementara.id));
      push(e instanceof Error ? e.message : 'Gagal menyimpan materi.', 'error');
    } finally {
      setMenyimpan(false);
    }
  }

  const mingguDipakai = [1, 2, 3, 4, 5]
    .map((mk) => ({
      mingguKe: mk,
      rentang: rentangMinggu(tahun, bulan, mk),
      materi: materiList.filter((m) => m.minggu_ke === mk),
    }))
    .filter((m) => m.rentang && m.materi.length > 0);

  const totalPertemuan = mingguDipakai.length;

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
    /* h-screen + overflow-hidden -- diminta owner (20 Agt): saat pindah
       kelas, seluruh app (judul, chip, header) ikut geser/scroll krn
       sebelumnya cuma min-h-screen (tanpa overflow-hidden) -- tinggi
       <main> jadi ikut membesar/mengecil sesuai jumlah materi kelas yg
       dipilih, dan DOKUMEN itu sendiri yang scroll, bukan cuma konten
       di dalamnya. Pola SAMA PERSIS GuruAbsensiView.tsx: header dibekukan
       (shrink-0, di luar area scroll), yang scroll HANYA
       <div className="flex-1 overflow-y-auto"> di bawah -- jadi ganti
       kelas apa pun jumlah materinya, judul/chip/tombol tidak bergerak
       sedikit pun. */
    <main className="relative flex h-screen flex-col overflow-hidden bg-bg">
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <JurnalHeaderChrome tampilkanHero={false} />

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-[110px]">
        {/* Judul + ikon kalender sejajar — konsep sama dgn hero Dashboard
            (nama di kiri, ikon+caption Bulan/Tahun di kanan), diminta
            owner: pil lebar penuh yang dulu di sini DIHAPUS, gantinya
            ikon kecil di kanan atas (di bawah lonceng di top bar),
            sejajar dgn judul "Rencana Pembelajaran". Posisi popup dihitung
            dari getBoundingClientRect() ikon, teknik SAMA PERSIS
            GuruDashboard.tsx. */}
        <div className="mb-4 flex items-start justify-between gap-3">
          {/* Judul + chip digabung satu kolom kiri (bukan baris terpisah)
              -- diminta owner didekatkan lagi: sebelumnya chip nempel di
              bawah SELURUH baris (ikut tinggi kolom ikon+badge kanan yg
              lebih tinggi dari judul), bukan di bawah judul saja, jadi
              kelihatan jauh walau margin sudah dikecilkan. Sekarang chip
              ikut tinggi judul di kolom kiri sendiri, lepas dari tinggi
              kolom ikon kalender di kanan. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="pt-1.5 text-[17px] font-extrabold text-text">Rencana Pembelajaran</div>
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
              aria-label="Pilih Bulan dan Tahun"
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
              <div className="flex gap-2">
                <SelectKustom value={String(bulan)} onChange={(v) => setBulan(Number(v))} opsi={opsiBulan} />
                <SelectKustom value={String(tahun)} onChange={(v) => setTahun(Number(v))} opsi={opsiTahun} />
              </div>
            </div>
          </>
        )}

        {/* Ringkasan Rencana */}
        <div className="mb-5 rounded-card border border-border bg-[#EEF2FF] p-4">
          <div className="mb-3 text-[13px] font-bold text-text">Ringkasan Rencana</div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo">
                <ClipboardList size={18} />
              </span>
              <div>
                <div className="text-[20px] leading-none font-extrabold text-text">{materiList.length}</div>
                <div className="text-[11px] text-text-dim">Materi</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo">
                <CalendarDays size={18} />
              </span>
              <div>
                <div className="text-[20px] leading-none font-extrabold text-text">{totalPertemuan}</div>
                <div className="text-[11px] text-text-dim">Pertemuan</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3 text-[15px] font-bold text-text">Rencana Mingguan</div>

        {loading && (
          <div className="mb-5 flex flex-col gap-3">
            <Skeleton className="h-[92px] w-full" />
            <Skeleton className="h-[92px] w-full" />
          </div>
        )}

        {!loading && kelasId === '' && (
          <p className="text-[13px] text-text-dim">Pilih kelas dulu utk melihat rencana.</p>
        )}
        {!loading && kelasId !== '' && mingguDipakai.length === 0 && (
          <p className="mb-4 text-[13px] text-text-dim">
            Belum ada materi direncanakan bulan ini. Tambahkan lewat tombol di bawah.
          </p>
        )}

        {!loading && (
          <div className="mb-5 flex flex-col gap-3">
            {mingguDipakai.map(({ mingguKe, materi }) => (
              <div key={mingguKe} className="rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[14px] font-bold text-text">Minggu {mingguKe}</div>
                    <div className="text-[11.5px] text-text-dim">
                      {labelRentangMinggu(tahun, bulan, mingguKe, NAMA_BULAN)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-bold text-indigo">
                    {materi.length} Materi
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {materi.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-[13px] text-text">
                      <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-text-faint" />
                      {m.judul}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tambahTerbuka && (
          <div
            className="fixed inset-0 z-[600] flex items-end justify-center bg-[rgba(15,23,42,0.55)] backdrop-blur-[3px] sm:items-center sm:p-6"
            onClick={() => setTambahTerbuka(false)}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-[24px] bg-panel text-left shadow-[0_24px_48px_rgba(0,0,0,0.28)] sm:rounded-[24px]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 justify-center pt-2.5 sm:hidden">
                <span className="h-1 w-9 rounded-full bg-border" />
              </div>

              <div className="flex shrink-0 items-center justify-between px-6 pt-4 pb-3">
                <div className="text-[16px] font-bold text-text">Tambah Materi Rencana</div>
                <button
                  type="button"
                  onClick={() => setTambahTerbuka(false)}
                  aria-label="Tutup"
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
                >
                  <X size={15} strokeWidth={2.4} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-4">
                <FieldTambah label="Materi Pembelajaran" wajib>
                  <InputIkon
                    value={judulBaru}
                    onChange={setJudulBaru}
                    placeholder="Pilih atau tulis materi pembelajaran"
                    ikon={<BookOpen size={16} />}
                  />
                </FieldTambah>

                <FieldTambah label="Topik">
                  <InputIkon
                    value={topikBaru}
                    onChange={setTopikBaru}
                    placeholder="Contoh: Akidah, Fiqih, Akhlak, Al-Qur'an"
                    ikon={<Tag size={16} />}
                  />
                </FieldTambah>

                <FieldTambah label="Tanggal Rencana" wajib>
                  <button
                    ref={tanggalBtnRef}
                    type="button"
                    onClick={() => {
                      const rect = tanggalBtnRef.current?.getBoundingClientRect();
                      if (rect) {
                        setPosisiTanggalPicker({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                      }
                      setTanggalPickerTerbuka((v) => !v);
                    }}
                    className={`${INPUT_STYLE} flex items-center justify-between`}
                  >
                    <span className={tanggalRencanaBaru ? 'text-text' : 'text-text-faint'}>
                      {tanggalRencanaBaru
                        ? new Date(tanggalRencanaBaru + 'T00:00:00').toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : 'Pilih tanggal'}
                    </span>
                    <Calendar size={16} className="text-text-faint" />
                  </button>
                  <TanggalPicker
                    terbuka={tanggalPickerTerbuka}
                    posisi={posisiTanggalPicker}
                    nilai={tanggalRencanaBaru}
                    onPilih={setTanggalRencanaBaru}
                    onTutup={() => setTanggalPickerTerbuka(false)}
                  />
                </FieldTambah>

                <FieldTambah label="Masukkan ke" wajib>
                  <SelectKustom value={mingguBaru} onChange={setMingguBaru} opsi={opsiMinggu} ikon={<Calendar size={16} />} />
                </FieldTambah>

                <FieldTambah label="Pertemuan ke-">
                  <InputIkon
                    value={pertemuanKeBaru}
                    onChange={setPertemuanKeBaru}
                    placeholder="Contoh: Pertemuan ke-1"
                    ikon={<Hash size={16} />}
                  />
                </FieldTambah>

                <FieldTambah label="Tujuan Pembelajaran">
                  <InputIkon
                    value={tujuanBaru}
                    onChange={setTujuanBaru}
                    placeholder="Apa yang ingin dicapai dari materi ini?"
                    ikon={<Target size={16} />}
                  />
                </FieldTambah>

                <FieldTambah label="Catatan">
                  <div className="relative">
                    <textarea
                      value={catatanBaru}
                      onChange={(e) => setCatatanBaru(e.target.value.slice(0, 200))}
                      placeholder="Catatan tambahan untuk materi ini..."
                      rows={3}
                      maxLength={200}
                      className={`${INPUT_STYLE} resize-none pr-8`}
                    />
                    <span className="pointer-events-none absolute top-2.5 right-3 text-text-faint">
                      <FileText size={16} />
                    </span>
                  </div>
                  <div className="mt-1 text-right text-[10.5px] text-text-faint">{catatanBaru.length}/200</div>
                </FieldTambah>

                <FieldTambah label="Referensi / Sumber">
                  <InputIkon
                    value={referensiBaru}
                    onChange={setReferensiBaru}
                    placeholder="Buku, ayat, hadits, atau sumber lain"
                    ikon={<Link2 size={16} />}
                  />
                </FieldTambah>

                <div className="mb-1 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-text-dim">
                      <Bell size={16} />
                    </span>
                    <div>
                      <div className="text-[12.5px] font-semibold text-text">Pengingat</div>
                      <div className="text-[10.5px] text-text-dim">Ingatkan saya sebelum tanggal rencana</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={pengingatBaru}
                    onClick={() => setPengingatBaru((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-none transition-colors duration-150 ${
                      pengingatBaru ? 'bg-indigo' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150 ${
                        pengingatBaru ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex shrink-0 gap-2.5 border-t border-border px-6 py-4">
                <button
                  type="button"
                  onClick={() => setTambahTerbuka(false)}
                  className="flex-1 cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel-2 py-3 text-[14px] font-semibold text-text"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={judulBaru.trim().length === 0 || tanggalRencanaBaru === '' || menyimpan}
                  onClick={simpanMateriBaru}
                  className="flex flex-[1.4] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
                >
                  <Check size={16} strokeWidth={2.6} />
                  Simpan Materi
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tombol Tambah Materi — diminta owner (20 Agt): SELALU di bawah,
          fixed (tidak ikut scroll), tidak bergerak/hilang saat pindah
          kelas atau saat kelas belum dipilih. Pola SAMA PERSIS bottom-bar
          Simpan Kehadiran di GuruAbsensiView.tsx (fixed viewport-wide +
          gradient fade + wadah max-w-[430px] mx-auto supaya tombol tidak
          ikut melebar di desktop, safe-area utk notch HP). Kalau kelas
          belum dipilih, tombol tetap tampil tapi klik-nya cuma munculkan
          toast pengingat -- TIDAK membuka form (kelasId dibutuhkan utk
          simpan materi). */}
      <div
        className="fixed right-0 bottom-0 left-0 px-[18px] pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]"
        style={{ background: 'linear-gradient(180deg, rgba(248,250,252,0) 0%, var(--bg) 30%)' }}
      >
        <div className="mx-auto max-w-[430px]">
          <button
            type="button"
            onClick={() => {
              if (kelasId === '') {
                push('Pilih kelas dulu sebelum menambahkan materi.', 'info');
                return;
              }
              bukaFormTambah();
            }}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-[13px] text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(79,70,229,0.3)] transition-transform duration-150 active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
          >
            <Plus size={18} strokeWidth={2.4} />
            Tambah Materi
          </button>
        </div>
      </div>
    </main>
  );
}
