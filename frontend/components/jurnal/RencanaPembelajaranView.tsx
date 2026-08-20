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
   bulanan kasar). */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import { rentangMinggu, labelRentangMinggu } from '@/lib/mingguBulan';

type Kelas = { id: number; nama: string };
type Materi = { id: number; minggu_ke: number; judul: string; status: string };

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const SELECT_STYLE =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text';

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
  const [mingguBaru, setMingguBaru] = useState(1);
  const [judulBaru, setJudulBaru] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);

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
    if (kelasId === '' || judulBaru.trim().length === 0) return;
    setMenyimpan(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('jurnal_materi').insert({
        kelas_id: kelasId,
        tahun,
        bulan,
        minggu_ke: mingguBaru,
        judul: judulBaru.trim(),
      });
      if (err) throw new Error(err.message);
      setJudulBaru('');
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
              onClick={() => {
                setMingguBaru(1);
                setJudulBaru('');
                setTambahTerbuka(true);
              }}
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
                className="fixed inset-0 z-[600] flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-6 backdrop-blur-[3px]"
                onClick={() => setTambahTerbuka(false)}
              >
                <div
                  className="w-full max-w-[360px] rounded-[24px] bg-panel px-6 pt-6 pb-5 text-left shadow-[0_24px_48px_rgba(0,0,0,0.28)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-4 text-[16px] font-bold text-text">Tambah Materi</div>

                  <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Minggu</label>
                  <select
                    value={mingguBaru}
                    onChange={(e) => setMingguBaru(Number(e.target.value))}
                    className={`${SELECT_STYLE} mb-3`}
                  >
                    {[1, 2, 3, 4, 5]
                      .filter((mk) => rentangMinggu(tahun, bulan, mk))
                      .map((mk) => (
                        <option key={mk} value={mk}>
                          Minggu {mk} ({labelRentangMinggu(tahun, bulan, mk, NAMA_BULAN)})
                        </option>
                      ))}
                  </select>

                  <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Judul Materi</label>
                  <input
                    type="text"
                    value={judulBaru}
                    onChange={(e) => setJudulBaru(e.target.value)}
                    placeholder="Misal: Akhlak Terpuji"
                    className={`${SELECT_STYLE} mb-4`}
                  />

                  <button
                    type="button"
                    disabled={judulBaru.trim().length === 0 || menyimpan}
                    onClick={simpanMateriBaru}
                    className="w-full cursor-pointer rounded-[var(--radius-button)] border-none py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)' }}
                  >
                    {menyimpan ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
