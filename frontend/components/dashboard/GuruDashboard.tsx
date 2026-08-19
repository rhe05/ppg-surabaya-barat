'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import MenuGuru from '@/components/dashboard/MenuGuru';
import KehadiranChooser from '@/components/dashboard/KehadiranChooser';
import JurnalChooser from '@/components/dashboard/JurnalChooser';

type Tersemat = { nama: string } | { nama: string }[] | null;

type Kelas = {
  id: number;
  nama: string;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  santri_count: number;
  kategori_kbm: Tersemat;
};

// Style_Main.html:695-700 (IA_GURU_KATEGORI_SINGKATAN_)
const SINGKATAN_KATEGORI: Record<string, string> = {
  'Muballigh Tugasan': 'MT',
  'Muballigh Setempat': 'MS',
  'Guru Mutu': 'GM',
  'Guru Bantu': 'GB',
};

const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

type Statistik = { hariAktif: number; hadir: number; izin: number; sakit: number; alpa: number };

const SELECT_BULAN_TAHUN =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text';

const STATUS: {
  kunci: keyof Omit<Statistik, 'hariAktif'>;
  label: string;
  warna: string;
  pill: string;
}[] = [
  { kunci: 'hadir', label: 'HADIR', warna: '#059669', pill: 'rgba(5, 150, 105, 0.12)' },
  { kunci: 'izin', label: 'IZIN', warna: '#4F46E5', pill: 'rgba(79, 70, 229, 0.12)' },
  // SAKIT #B45309, BUKAN --brass #D97706 — nilai ketiga yang khusus dipakai
  // .ia-dash-stat (design-tokens-dashboard-guru.md Bagian 6.2).
  { kunci: 'sakit', label: 'SAKIT', warna: '#B45309', pill: 'rgba(180, 83, 9, 0.12)' },
  { kunci: 'alpa', label: 'ALPA', warna: '#DC2626', pill: 'rgba(220, 38, 38, 0.12)' },
];

function batasBulan(tahun: number, bulan: number) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return {
    awal: `${tahun}-${dua(bulan)}-01`,
    akhir: `${tahun}-${dua(bulan)}-${dua(new Date(tahun, bulan, 0).getDate())}`,
  };
}

function namaDari(nilai: Tersemat) {
  if (!nilai) return null;
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? null;
}

function jam(nilai: string | null) {
  if (!nilai) return null;
  return nilai.slice(0, 5);
}

// Style_Main.html renderer: jamMulai–jamSelesai · Durasi N Menit
function durasiMenit(mulai: string | null, selesai: string | null) {
  const a = jam(mulai);
  const b = jam(selesai);
  if (!a || !b) return null;
  const [ha, ma] = a.split(':').map(Number);
  const [hb, mb] = b.split(':').map(Number);
  if ([ha, ma, hb, mb].some((n) => Number.isNaN(n))) return null;
  const selisih = hb * 60 + mb - (ha * 60 + ma);
  return selisih > 0 ? selisih : null;
}

export default function GuruDashboard() {
  const { profile, namaKelompok, kategoriGuru } = useAuth();
  const [kelas, setKelas] = useState<Kelas[]>([]);
  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [chooserTerbuka, setChooserTerbuka] = useState(false);
  const [jurnalChooserTerbuka, setJurnalChooserTerbuka] = useState(false);
  const [statistik, setStatistik] = useState<Record<number, Statistik> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sekarangAwal = new Date();
  /* Bulan/tahun yang sedang ditampilkan — dipilih lewat ikon kalender di
     hero (diminta owner: samakan dgn Riwayat Kehadiran, TAPI tanpa Minggu
     — cuma Bulan & Tahun). Statistik 5 kotak & label caption di bawah
     ikon sama-sama mengikuti nilai ini, bukan lagi selalu bulan berjalan. */
  const [bulan, setBulan] = useState(sekarangAwal.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarangAwal.getFullYear());
  const [kalenderTerbuka, setKalenderTerbuka] = useState(false);
  const [posisiKalender, setPosisiKalender] = useState<{ top: number; right: number } | null>(null);
  const ikonKalenderRef = useRef<HTMLButtonElement>(null);

  const guruId = profile?.guru_id ?? null;

  /* Statistik 5 kotak, mengikuti definisi app lama:
     - HARI AKTIF = jumlah TANGGAL BERBEDA yang sudah diisi guru untuk kelas
       itu (Modul_InputAbsen.gs:1151), bukan jumlah baris absensi.
     - Persentase dihitung dari hadir+izin+sakit+alpa (Script_Main.html:2594),
       BUKAN dari jumlah santri di kelas.
     - Lingkupnya SATU BULAN, ditentukan filter Bulan/Tahun di hero — bukan
       lagi selalu bulan berjalan seperti sebelumnya.

     Dua langkah (santri dulu, lalu absensi) sengaja dipilih ketimbang satu
     query dengan embedded filter: absensi TIDAK punya kelas_id, jalurnya
     lewat santri.kelas_id, dan bentuk dua langkah ini yang paling sedikit
     bergantung pada tafsir PostgREST atas filter tersemat.

     Paginasi wajib: PostgREST diam-diam memotong di 1000 baris. */
  const muatStatistik = useCallback(
    async (kelasIds: number[], bulanDipilih: number, tahunDipilih: number) => {
      if (kelasIds.length === 0) {
        setStatistik({});
        return;
      }

      const { data: dataSantri, error: errSantri } = await supabase
        .from('santri')
        .select('id, kelas_id')
        .in('kelas_id', kelasIds)
        .is('deleted_at', null);
      if (errSantri) throw new Error(errSantri.message);

      const kelasDariSantri = new Map<number, number>();
      (dataSantri ?? []).forEach((s) => {
        if (s.kelas_id != null) kelasDariSantri.set(s.id, s.kelas_id);
      });

      const kosong = (): Statistik => ({ hariAktif: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 });
      const hasil: Record<number, Statistik> = {};
      const tanggalPerKelas: Record<number, Set<string>> = {};
      kelasIds.forEach((id) => {
        hasil[id] = kosong();
        tanggalPerKelas[id] = new Set();
      });

      if (kelasDariSantri.size > 0) {
        const { awal, akhir } = batasBulan(tahunDipilih, bulanDipilih);
        const UKURAN_HALAMAN = 1000;
        const santriIds = [...kelasDariSantri.keys()];

        for (let dari = 0; ; dari += UKURAN_HALAMAN) {
          const { data, error: errAbsensi } = await supabase
            .from('absensi')
            .select('id, santri_id, tanggal, status')
            .in('santri_id', santriIds)
            .gte('tanggal', awal)
            .lte('tanggal', akhir)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(dari, dari + UKURAN_HALAMAN - 1);
          if (errAbsensi) throw new Error(errAbsensi.message);

          const batch = data ?? [];
          batch.forEach((baris) => {
            const kelasId = kelasDariSantri.get(baris.santri_id);
            if (kelasId == null || !hasil[kelasId]) return;
            tanggalPerKelas[kelasId].add(baris.tanggal);
            const kunci = baris.status as keyof Omit<Statistik, 'hariAktif'>;
            if (kunci in hasil[kelasId]) hasil[kelasId][kunci] += 1;
          });
          if (batch.length < UKURAN_HALAMAN) break;
        }
      }

      kelasIds.forEach((id) => {
        hasil[id].hariAktif = tanggalPerKelas[id].size;
      });
      setStatistik(hasil);
    },
    [],
  );

  const load = useCallback(async () => {
    if (guruId == null) {
      setKelas([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from('kelas')
        .select('id, nama, jam_mulai, jam_selesai, ruangan, santri_count, kategori_kbm(nama)')
        .eq('guru_id', guruId)
        .is('deleted_at', null)
        .order('jam_mulai');
      if (queryError) throw new Error(queryError.message);
      const daftarKelas = data ?? [];
      setKelas(daftarKelas);
      await muatStatistik(
        daftarKelas.map((k) => k.id),
        bulan,
        tahun,
      );
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  }, [guruId, muatStatistik, bulan, tahun]);

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) load();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const tahunPilihan = [sekarangAwal.getFullYear() - 1, sekarangAwal.getFullYear()];

  const singkatan = kategoriGuru ? (SINGKATAN_KATEGORI[kategoriGuru] ?? kategoriGuru) : null;
  const barisRole = singkatan ? `Guru Generus - ${singkatan}` : null;

  return (
    <main className="relative flex min-h-screen flex-col bg-bg">
      {/* Menu hamburger — dirender di LUAR .ia-header karena header punya
          overflow-hidden (untuk sudut membulat di bawahnya); dropdown yang
          absolute di dalamnya akan terpotong kalau ditaruh di sana. */}
      <MenuGuru
        terbuka={menuTerbuka}
        onTutup={() => setMenuTerbuka(false)}
        onKehadiran={() => setChooserTerbuka(true)}
        onJurnal={() => setJurnalChooserTerbuka(true)}
      />
      <KehadiranChooser terbuka={chooserTerbuka} onTutup={() => setChooserTerbuka(false)} />
      <JurnalChooser
        terbuka={jurnalChooserTerbuka}
        onTutup={() => setJurnalChooserTerbuka(false)}
      />

      {/* .ia-header — Style_Main.html:4859-4865 */}
      <div className="shrink-0 overflow-hidden rounded-b-3xl bg-panel shadow-[0_6px_20px_rgba(5,150,105,0.22)]">
        {/* .ia-topbar — :4867-4901 */}
        <div className="flex items-center gap-2.5 bg-panel px-[18px] pt-3.5 pb-3">
          {/* .ia-hamburger-btn — :4945-4958 */}
          <button
            type="button"
            aria-label="Menu Utama"
            onClick={() => setMenuTerbuka((v) => !v)}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
          >
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>

          {/* .ia-app-brand — :4875-4895 */}
          <div className="flex min-w-0 flex-1 items-center justify-start gap-[7px]">
            <Image
              src="/logo-ruang-ngaji.png"
              alt="Ruang Ngaji"
              width={20}
              height={18}
              className="block shrink-0"
            />
            <span className="text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          </div>

          {/* .ia-icon-btn — :5046-5064 */}
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Permintaan Masuk"
              className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </div>
        </div>

        {/* .ia-header-hero — :4903-4910 */}
        <div className="flex items-start justify-between gap-2.5 bg-[linear-gradient(135deg,#059669_0%,#6B9975_100%)] px-[18px] pt-4 pb-5">
          {/* .ia-greeting — :5026-5044 */}
          <div className="min-w-0 flex-1">
            <div className="text-[20px] leading-[1.2] font-bold text-white">
              {profile?.display_name ?? '-'}
            </div>
            {barisRole && (
              <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
                {barisRole}
              </div>
            )}
            {namaKelompok && (
              <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
                {namaKelompok}
              </div>
            )}
          </div>

          {/* .ia-header-hero-right — :4912-4918 */}
          <div className="flex shrink-0 flex-col items-end gap-[7px]">
            {/* .ia-icon-btn-hero — :5066-5073. Diminta owner: samakan dgn
                Riwayat Kehadiran — ikon ini SATU-SATUNYA pemicu memilih
                Bulan/Tahun (tanpa Minggu, beda dari Riwayat), dan caption
                di bawahnya menampilkan bulan+tahun yang sedang dipilih,
                bukan lagi tanggal hari ini. Toolbar "Agustus - 2026" yang
                dulu ada di bawah header DIHAPUS — digantikan caption ini. */}
            <button
              ref={ikonKalenderRef}
              type="button"
              aria-label="Pilih Bulan dan Tahun"
              onClick={() => {
                const rect = ikonKalenderRef.current?.getBoundingClientRect();
                if (rect) {
                  setPosisiKalender({
                    top: rect.bottom + 6,
                    right: window.innerWidth - rect.right,
                  });
                }
                setKalenderTerbuka((v) => !v);
              }}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-white/20 text-white transition-all duration-150 active:bg-white/[0.32]"
            >
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </button>

            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white">
              {NAMA_BULAN[bulan - 1]} {tahun}
            </span>
          </div>
        </div>
      </div>

      {/* Kartu Bulan/Tahun — dirender DI LUAR .ia-header (overflow-hidden
          tetap memotong keturunan fixed/absolute; sudah terbukti pahit di
          TanggalPicker & Riwayat Kehadiran, teknik yang sama dipakai lagi
          di sini). Terapkan instan tiap kali sebuah pilihan diketuk. */}
      {kalenderTerbuka && posisiKalender && (
        <>
          <div className="fixed inset-0 z-[1090]" onClick={() => setKalenderTerbuka(false)} />
          <div
            className="fixed z-[1100] w-[240px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
            style={{ top: posisiKalender.top, right: posisiKalender.right }}
          >
            <div className="flex gap-2">
              <select
                value={bulan}
                onChange={(e) => setBulan(Number(e.target.value))}
                className={SELECT_BULAN_TAHUN}
              >
                {NAMA_BULAN.map((nm, idx) => (
                  <option key={nm} value={idx + 1}>
                    {nm}
                  </option>
                ))}
              </select>
              <select
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className={SELECT_BULAN_TAHUN}
              >
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

      {/* .ia-dashboard-view — :5212-5216 */}
      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-[100px]">
        {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
        {!loading && error && <p className="text-[13px] text-red">{error}</p>}

        {!loading && !error && guruId == null && (
          <div className="rounded-card border border-border bg-panel p-4 text-[12.5px] text-text-dim shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            Akun ini belum terhubung ke data guru, sehingga daftar kelas belum bisa ditampilkan.
          </div>
        )}

        {!loading && !error && guruId != null && kelas.length === 0 && (
          <div className="rounded-card border border-border bg-panel p-4 text-[12.5px] text-text-dim shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            Belum ada kelas yang terdaftar atas nama Anda.
          </div>
        )}

        {!loading &&
          !error &&
          kelas.map((k) => {
            const kategori = namaDari(k.kategori_kbm);
            const menit = durasiMenit(k.jam_mulai, k.jam_selesai);
            /* null = statistiknya belum selesai dimuat -> kotaknya tetap "—".
               Nol yang sudah dihitung ditampilkan sebagai 0, karena itu memang
               berarti guru belum mengisi absen bulan ini. */
            const angka = statistik ? (statistik[k.id] ?? null) : null;
            const totalStatus = angka ? angka.hadir + angka.izin + angka.sakit + angka.alpa : 0;
            const info: string[] = [];
            if (k.ruangan) info.push(k.ruangan);
            info.push(`${k.santri_count} Santri`);
            if (jam(k.jam_mulai) && jam(k.jam_selesai)) {
              info.push(
                `${jam(k.jam_mulai)}–${jam(k.jam_selesai)}${
                  menit != null ? ` · Durasi ${menit} Menit` : ''
                }`,
              );
            }

            return (
              /* .ia-dash-card — :5337-5343 */
              <div
                key={k.id}
                className="mb-2.5 rounded-card border border-border bg-panel p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
              >
                {/* .ia-dash-card-head + -kelas + -jenjang — :5345-5362 */}
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[15px] font-bold text-text">
                    {k.nama}
                    {kategori === 'Cabe Rawit' && (
                      <span className="text-[12px] font-semibold text-sage"> · Cabe Rawit</span>
                    )}
                  </span>
                </div>

                {/* .ia-dash-card-info — :5387-5392 */}
                <div className="mb-1 text-[12.5px] font-semibold text-text">{info.join(' · ')}</div>
                {/* Lima kotak statistik — .ia-dash-stat-row (:5407-5471).
                    Hari Aktif sengaja beda sendiri (kartu gradient teal, tanpa
                    pill persentase): itu info STRUKTURAL (berapa sesi kelas
                    sudah diisi), bukan status kehadiran. */}
                <div className="mt-3 grid grid-cols-5 gap-2">
                  <div
                    className="flex flex-col items-center gap-[3px] rounded-[10px] px-1 pt-2.5 pb-[9px] shadow-[0_4px_14px_rgba(13,148,136,0.26),inset_0_1px_0_rgba(255,255,255,0.14)]"
                    style={{
                      background: 'linear-gradient(155deg, #0F766E 0%, #0D9488 60%, #14B8A6 100%)',
                    }}
                  >
                    <span className="text-[18px] leading-none font-extrabold text-white tabular-nums">
                      {angka ? angka.hariAktif : '—'}
                    </span>
                    <span className="mt-px text-[10.5px] font-bold tracking-[0.02em] text-white/85 uppercase">
                      Hari
                    </span>
                    <span className="text-[10.5px] font-bold tracking-[0.02em] text-white/85 uppercase">
                      Aktif
                    </span>
                  </div>

                  {STATUS.map((st) => {
                    const nilai = angka ? angka[st.kunci] : null;
                    const persen =
                      angka && totalStatus > 0
                        ? Math.round((angka[st.kunci] / totalStatus) * 100)
                        : null;
                    return (
                      <div
                        key={st.kunci}
                        className="flex flex-col items-center gap-[3px] rounded-[10px] bg-panel-2 px-1 pt-2.5 pb-[9px]"
                      >
                        <span
                          className="text-[18px] leading-none font-extrabold tabular-nums"
                          style={{ color: nilai === null ? undefined : st.warna }}
                        >
                          {nilai === null ? '—' : nilai}
                        </span>
                        {persen !== null && (
                          <span
                            className="rounded-full px-[7px] py-0.5 text-[10px] leading-none font-bold tabular-nums"
                            style={{ background: st.pill, color: st.warna }}
                          >
                            {persen}%
                          </span>
                        )}
                        <span className="mt-px text-center text-[10.5px] font-bold tracking-[0.02em] text-text-dim uppercase">
                          {st.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>
    </main>
  );
}
