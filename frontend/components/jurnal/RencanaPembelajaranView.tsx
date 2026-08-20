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

   PUTARAN KEDUA (20 Agt, diminta owner): form "Tambah Materi" diperkaya
   jadi bottom-sheet penuh (screenshot owner) -- Topik/Tanggal Rencana/
   Pertemuan ke-/Tujuan Pembelajaran/Catatan/Referensi/Pengingat, semua
   opsional kecuali Materi+Tanggal Rencana+Minggu. Kolom baru di migrasi
   20260820130000. `tanggal_rencana` jg dipakai RiwayatPembelajaranView.tsx
   sbg tanggal tampil selama belum disampaikan (menggantikan perkiraan
   awal-minggu sebelumnya). `pengingat_aktif` CUMA preferensi tersimpan --
   app ini belum punya sistem notifikasi/pengingat sungguhan, lihat
   komentar migrasi. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import { rentangMinggu, labelRentangMinggu, mingguKeDariTanggal } from '@/lib/mingguBulan';

type Kelas = { id: number; nama: string };
type Materi = { id: number; minggu_ke: number; judul: string; status: string };

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const SELECT_STYLE =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text';

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
        className={`${SELECT_STYLE} pr-9`}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-faint">{ikon}</span>
    </div>
  );
}

function IkonSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

// Lucide "book-open"
function IkonBook() {
  return (
    <IkonSvg>
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </IkonSvg>
  );
}

// Lucide "tag"
function IkonTag() {
  return (
    <IkonSvg>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    </IkonSvg>
  );
}

// Lucide "calendar"
function IkonKalender() {
  return (
    <IkonSvg>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </IkonSvg>
  );
}

function IkonChevronBawah() {
  return (
    <IkonSvg>
      <path d="m6 9 6 6 6-6" />
    </IkonSvg>
  );
}

// Lucide "hash"
function IkonHash() {
  return (
    <IkonSvg>
      <line x1="4" x2="20" y1="9" y2="9" />
      <line x1="4" x2="20" y1="15" y2="15" />
      <line x1="10" x2="8" y1="3" y2="21" />
      <line x1="16" x2="14" y1="3" y2="21" />
    </IkonSvg>
  );
}

// Lucide "target"
function IkonTarget() {
  return (
    <IkonSvg>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </IkonSvg>
  );
}

// Lucide "file-text" — sama persis ikon "Rencana Pembelajaran" di
// JurnalChooser.tsx.
function IkonCatatan() {
  return (
    <IkonSvg>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </IkonSvg>
  );
}

// Lucide "link"
function IkonLink() {
  return (
    <IkonSvg>
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </IkonSvg>
  );
}

// Lucide "bell"
function IkonBel() {
  return (
    <IkonSvg>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </IkonSvg>
  );
}

export default function RencanaPembelajaranView() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];
  const [pemilihBulanTerbuka, setPemilihBulanTerbuka] = useState(false);

  const [materiList, setMateriList] = useState<Materi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  const [judulBaru, setJudulBaru] = useState('');
  const [topikBaru, setTopikBaru] = useState('');
  const [tanggalRencanaBaru, setTanggalRencanaBaru] = useState('');
  const [mingguBaru, setMingguBaru] = useState(1);
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
    setMingguBaru(mingguKeDariTanggal(new Date()));
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
    setError(null);
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
      setError(e instanceof Error ? e.message : 'Gagal memuat rencana.');
    } finally {
      setLoading(false);
    }
  }, [kelasId, tahun, bulan]);

  useEffect(() => {
    muatMateri();
  }, [muatMateri]);

  async function simpanMateriBaru() {
    if (kelasId === '' || judulBaru.trim().length === 0 || tanggalRencanaBaru === '') return;
    setMenyimpan(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('jurnal_materi').insert({
        kelas_id: kelasId,
        tahun,
        bulan,
        minggu_ke: mingguBaru,
        judul: judulBaru.trim(),
        topik: topikBaru.trim() === '' ? null : topikBaru.trim(),
        tanggal_rencana: tanggalRencanaBaru,
        pertemuan_ke: pertemuanKeBaru.trim() === '' ? null : pertemuanKeBaru.trim(),
        tujuan_pembelajaran: tujuanBaru.trim() === '' ? null : tujuanBaru.trim(),
        catatan: catatanBaru.trim() === '' ? null : catatanBaru.trim(),
        referensi: referensiBaru.trim() === '' ? null : referensiBaru.trim(),
        pengingat_aktif: pengingatBaru,
      });
      if (err) throw new Error(err.message);
      setTambahTerbuka(false);
      await muatMateri();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan materi.');
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

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <JurnalHeaderChrome />

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-10">
        <div className="mb-4 text-[17px] font-extrabold text-text">Rencana Pembelajaran</div>

        {kelasList.length > 1 && (
          <div className="mb-3">
            <select
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value === '' ? '' : Number(e.target.value))}
              className={SELECT_STYLE}
            >
              <option value="">-- Pilih Kelas --</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Pil Bulan/Tahun lebar penuh — persis screenshot owner (bukan
            ikon kecil di hero spt Dashboard/Riwayat/Laporan). */}
        <div className="relative mb-4">
          <button
            type="button"
            onClick={() => setPemilihBulanTerbuka((v) => !v)}
            className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-4 py-3 text-left text-[14px] font-semibold text-text shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M3 10h18" />
            </svg>
            <span className="flex-1">
              {NAMA_BULAN[bulan - 1]} {tahun}
            </span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-faint)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {pemilihBulanTerbuka && (
            <>
              <div className="fixed inset-0 z-[1090]" onClick={() => setPemilihBulanTerbuka(false)} />
              <div className="absolute z-[1100] mt-2 w-full rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]">
                <div className="flex gap-2">
                  <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={SELECT_STYLE}>
                    {NAMA_BULAN.map((nm, idx) => (
                      <option key={nm} value={idx + 1}>
                        {nm}
                      </option>
                    ))}
                  </select>
                  <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={SELECT_STYLE}>
                    {tahunPilihan.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Ringkasan Rencana */}
        <div className="mb-5 rounded-card border border-border bg-[#EEF2FF] p-4">
          <div className="mb-3 text-[13px] font-bold text-text">Ringkasan Rencana</div>
          <div className="flex gap-6">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 7v14" />
                  <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
                </svg>
              </span>
              <div>
                <div className="text-[20px] leading-none font-extrabold text-text">{materiList.length}</div>
                <div className="text-[11px] text-text-dim">Materi</div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-indigo">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v4" />
                  <path d="M16 2v4" />
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <path d="M3 10h18" />
                </svg>
              </span>
              <div>
                <div className="text-[20px] leading-none font-extrabold text-text">{totalPertemuan}</div>
                <div className="text-[11px] text-text-dim">Pertemuan</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3 text-[15px] font-bold text-text">Rencana Mingguan</div>

        {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
        {!loading && error && <p className="text-[13px] text-red">{error}</p>}
        {!loading && !error && kelasId === '' && (
          <p className="text-[13px] text-text-dim">Pilih kelas dulu utk melihat rencana.</p>
        )}
        {!loading && !error && kelasId !== '' && mingguDipakai.length === 0 && (
          <p className="mb-4 text-[13px] text-text-dim">
            Belum ada materi direncanakan bulan ini. Tambahkan lewat tombol di bawah.
          </p>
        )}

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

        {kelasId !== '' && (
          <>
            <button
              type="button"
              onClick={bukaFormTambah}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-[13px] text-[14px] font-bold text-white transition-transform duration-150 active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Tambah Materi
            </button>

            {tambahTerbuka && (
              <div
                className="fixed inset-0 z-[600] flex items-end justify-center bg-[rgba(15,23,42,0.55)] backdrop-blur-[3px] sm:items-center sm:p-6"
                onClick={() => setTambahTerbuka(false)}
              >
                <div
                  className="flex max-h-[90vh] w-full max-w-[420px] flex-col rounded-t-[24px] bg-panel text-left shadow-[0_24px_48px_rgba(0,0,0,0.28)] sm:rounded-[24px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Drag handle — dekorasi, persis screenshot owner. */}
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
                      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto px-6 pb-4">
                    <FieldTambah label="Materi Pembelajaran" wajib>
                      <InputIkon
                        value={judulBaru}
                        onChange={setJudulBaru}
                        placeholder="Pilih atau tulis materi pembelajaran"
                        ikon={<IkonBook />}
                      />
                    </FieldTambah>

                    <FieldTambah label="Topik">
                      <InputIkon
                        value={topikBaru}
                        onChange={setTopikBaru}
                        placeholder="Contoh: Akidah, Fiqih, Akhlak, Al-Qur'an"
                        ikon={<IkonTag />}
                      />
                    </FieldTambah>

                    <FieldTambah label="Tanggal Rencana" wajib>
                      <div className="relative">
                        <input
                          type="date"
                          value={tanggalRencanaBaru}
                          onChange={(e) => setTanggalRencanaBaru(e.target.value)}
                          className={`${SELECT_STYLE} pr-9`}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-faint">
                          <IkonKalender />
                        </span>
                      </div>
                    </FieldTambah>

                    <FieldTambah label="Masukkan ke" wajib>
                      <div className="relative">
                        <select
                          value={mingguBaru}
                          onChange={(e) => setMingguBaru(Number(e.target.value))}
                          className={`${SELECT_STYLE} appearance-none pr-9`}
                        >
                          {[1, 2, 3, 4, 5]
                            .filter((mk) => rentangMinggu(tahun, bulan, mk))
                            .map((mk) => (
                              <option key={mk} value={mk}>
                                Minggu {mk} ({labelRentangMinggu(tahun, bulan, mk, NAMA_BULAN)})
                              </option>
                            ))}
                        </select>
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-faint">
                          <IkonChevronBawah />
                        </span>
                      </div>
                    </FieldTambah>

                    <FieldTambah label="Pertemuan ke-">
                      <InputIkon
                        value={pertemuanKeBaru}
                        onChange={setPertemuanKeBaru}
                        placeholder="Contoh: Pertemuan ke-1"
                        ikon={<IkonHash />}
                      />
                    </FieldTambah>

                    <FieldTambah label="Tujuan Pembelajaran">
                      <InputIkon
                        value={tujuanBaru}
                        onChange={setTujuanBaru}
                        placeholder="Apa yang ingin dicapai dari materi ini?"
                        ikon={<IkonTarget />}
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
                          className={`${SELECT_STYLE} resize-none pr-8`}
                        />
                        <span className="pointer-events-none absolute top-2.5 right-3 text-text-faint">
                          <IkonCatatan />
                        </span>
                      </div>
                      <div className="mt-1 text-right text-[10.5px] text-text-faint">{catatanBaru.length}/200</div>
                    </FieldTambah>

                    <FieldTambah label="Referensi / Sumber">
                      <InputIkon
                        value={referensiBaru}
                        onChange={setReferensiBaru}
                        placeholder="Buku, ayat, hadits, atau sumber lain"
                        ikon={<IkonLink />}
                      />
                    </FieldTambah>

                    {/* Pengingat -- HANYA menyimpan preferensi toggle, app ini
                        belum punya sistem notifikasi/pengingat sungguhan. */}
                    <div className="mb-1 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-text-dim">
                          <IkonBel />
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
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {menyimpan ? 'Menyimpan...' : 'Simpan Materi'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
