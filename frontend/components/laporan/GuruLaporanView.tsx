'use client';

/* Laporan Perkembangan Santri (guru mobile) — diminta owner (20 Agt):
   samakan tampilan /reports utk guru dengan screenshot app lama (kartu
   putih besar: ikon dokumen, judul, subjudul, pilih Kelas/Bulan/Tahun,
   catatan H-1, tombol Unduh PDF). Header hero pola sama dgn
   GuruDashboard.tsx/riwayat/page.tsx, tapi cuma nama (tanpa baris
   peran/kelompok) — persis screenshot owner.

   Aturan H-1 & rumus klasifikasi status per-santri disalin dari app lama:
   - Eligible: iaLaporanCekEligible_ (Script_Main.html:2273-2280) — guru
     baru boleh unduh laporan 1 bulan mulai H-1 sebelum akhir bulan itu.
   - Klasifikasi: serverGetLaporanPerkembanganSantri (Modul_Laporan.gs
     ~230-245) — persenHadir>=80 → 'Hadir', lalu ada izin → 'Izin', lalu
     ada alpa → 'Alpa', sisanya 'Sakit'; tanpa data sama sekali → 'Belum
     Ada Data'.

   BEDA dari app lama (disengaja, bukan terlewat): app lama menyaring
   kelas guru lewat jadwal_kbm.guru_id (teks bebas) lalu mencocokkan
   santri.kelas_ngaji ke situ. App baru sudah punya `kelas.guru_id` +
   `santri.kelas_id` langsung (FK, disinkronkan trigger sinkron_santri_
   kelas, migrasi 20260819110000) — jalan pintasnya sama persis, sumbernya
   yang lebih pendek. Tidak ada padanan PDF letterhead/kop-surat app lama
   (sistem preview modal + pdfmake terpisah) -- TAPI pola INTINYA (preview
   HTML dulu, baru window.print()) justru SAMA PERSIS spt app lama, lihat
   catatan "Unduh PDF" di bawah.

   PUTARAN KEDUA (20 Agt, diminta owner): "Unduh PDF" DIGANTI TOTAL dari
   jsPDF/autoTable (dokumen dibangun manual, terpisah dari yang tampil di
   layar -- sebelumnya di sini malah TIDAK ADA tampilan layar sama sekali,
   klik tombol langsung generate jsPDF diam-diam) ke: tampilkan dulu
   PREVIEW laporan di layar (kartu metrik + tabel, id="laporan-cetak"),
   BARU window.print() (CSS di app/globals.css, teknik SAMA PERSIS app
   lama -- lihat komentar di sana). Hasilnya PDF = render browser asli
   dari markup yang SAMA PERSIS tampil di layar, klien murni (tanpa
   panggilan Supabase tambahan saat cetak, datanya sudah di state),
   tanpa backend baru, tanpa render server, instan, gratis.

   PUTARAN KETIGA (20 Agt, diminta owner): laporan WAJIB per kelas --
   opsi "Semua Kelas" DIHAPUS. Pegang 1 kelas -> otomatis terpilih (bukan
   pilihan, cuma satu kemungkinan); pegang >1 kelas -> wajib pilih manual
   sebelum tombol "Unduh PDF" aktif (sama persis
   components/SantriProgressReport.tsx, padanan admin desktop).

   PUTARAN KEEMPAT (20 Agt, diminta owner): "tampilan laporan di mobile
   app dengan print preview desktop tidak sama, samakan" -- blok cetak
   (id="laporan-cetak") DIPINDAH ke components/laporan/
   LaporanPerkembanganCetak.tsx, dipakai bareng dgn
   SantriProgressReport.tsx (admin desktop). Versi guru di sini SEBELUMNYA
   diam-diam kehilangan kartu Sakit & baris info Jadwal KBM/Ruangan yang
   ada di versi admin -- satu komponen bersama = tidak bisa ngedrift
   lagi. Kolom jam_mulai/jam_selesai/ruangan ditambahkan ke query `kelas`
   supaya info itu tersedia jg di sini (sebelumnya cuma id+nama). */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import MenuGuru from '@/components/dashboard/MenuGuru';
import KehadiranChooser from '@/components/dashboard/KehadiranChooser';
import JurnalChooser from '@/components/dashboard/JurnalChooser';
import LaporanPerkembanganCetak, {
  type LaporanPerkembangan,
} from '@/components/laporan/LaporanPerkembanganCetak';

type Kelas = { id: number; nama: string; jam_mulai: string | null; jam_selesai: string | null; ruangan: string | null };
type Santri = { id: number; nama: string; kelas_id: number | null };
type Absensi = { santri_id: number; tanggal: string; status: string };

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const SELECT_KELAS =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text';

function batasBulan(tahun: number, bulan: number) {
  const dua = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(tahun, bulan, 0).getDate();
  return {
    awal: `${tahun}-${dua(bulan)}-01`,
    akhir: `${tahun}-${dua(bulan)}-${dua(lastDay)}`,
    lastDay,
  };
}

// iaLaporanCekEligible_ (Script_Main.html:2273-2280) — guru baru boleh
// unduh laporan 1 bulan mulai H-1 sebelum akhir bulan itu.
function cekEligible(bulan: number, tahun: number) {
  const { lastDay } = batasBulan(tahun, bulan);
  const dua = (n: number) => String(n).padStart(2, '0');
  const h1 = `${tahun}-${dua(bulan)}-${dua(lastDay - 1)}`;
  const hariIni = new Date().toISOString().slice(0, 10);
  return { eligible: hariIni >= h1, lastDay };
}

function klasifikasi(hadir: number, izin: number, alpa: number, total: number) {
  if (total === 0) return 'Belum Ada Data';
  const persen = Math.round((hadir / total) * 100);
  if (persen >= 80) return 'Hadir';
  if (izin > 0) return 'Izin';
  if (alpa > 0) return 'Alpa';
  return 'Sakit';
}

function jam(v: string | null) {
  return v ? v.slice(0, 5) : null;
}

export default function GuruLaporanView() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;

  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [chooserTerbuka, setChooserTerbuka] = useState(false);
  const [jurnalChooserTerbuka, setJurnalChooserTerbuka] = useState(false);

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];

  const [membuat, setMembuat] = useState(false);
  const [errorMuat, setErrorMuat] = useState<string | null>(null);
  const [laporan, setLaporan] = useState<LaporanPerkembangan | null>(null);

  useEffect(() => {
    if (guruId == null) return;
    supabase
      .from('kelas')
      .select('id, nama, jam_mulai, jam_selesai, ruangan')
      .eq('guru_id', guruId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => {
        const list = (data ?? []) as Kelas[];
        setKelasList(list);
        // Pegang 1 kelas -> otomatis terpilih (bukan pilihan, cuma satu
        // kemungkinan). Pegang >1 kelas -> WAJIB dipilih manual (diminta
        // owner: laporan wajib per kelas, tidak boleh "Semua Kelas").
        setKelasId(list.length === 1 ? list[0].id : '');
      });
  }, [guruId]);

  const { eligible, lastDay } = cekEligible(bulan, tahun);
  const kelasLabel = kelasId === '' ? 'Jenengan' : (kelasList.find((k) => k.id === kelasId)?.nama ?? 'Jenengan');

  // Laporan sudah siap di layar -> panggil print sekali (rAF supaya
  // browser sempat melukis kartu/tabelnya dulu sebelum dialog cetak
  // muncul -- tanpa ini kadang preview masih kosong saat print dipanggil).
  useEffect(() => {
    if (!laporan) return;
    const id = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(id);
  }, [laporan]);

  const buatLaporan = useCallback(async () => {
    // WAJIB satu kelas (diminta owner) -- tidak ada lagi jalur "gabungan
    // semua kelas".
    if (kelasId === '') {
      throw new Error(
        kelasList.length === 0
          ? 'Belum ada kelas yang terdaftar atas nama Anda.'
          : 'Pilih kelas terlebih dahulu — laporan wajib per kelas.',
      );
    }
    const kelasIds = [kelasId];

    const { data: dSantri, error: eSantri } = await supabase
      .from('santri')
      .select('id, nama, kelas_id')
      .in('kelas_id', kelasIds)
      .is('deleted_at', null)
      .order('nama');
    if (eSantri) throw new Error(eSantri.message);
    const santri = (dSantri ?? []) as Santri[];
    const santriIds = santri.map((s) => s.id);

    const absensi: Absensi[] = [];
    if (santriIds.length > 0) {
      const { awal, akhir } = batasBulan(tahun, bulan);
      const UKURAN_HALAMAN = 1000;
      for (let dari = 0; ; dari += UKURAN_HALAMAN) {
        const { data, error: eAbsensi } = await supabase
          .from('absensi')
          .select('santri_id, tanggal, status')
          .in('santri_id', santriIds)
          .gte('tanggal', awal)
          .lte('tanggal', akhir)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(dari, dari + UKURAN_HALAMAN - 1);
        if (eAbsensi) throw new Error(eAbsensi.message);
        const batch = (data ?? []) as Absensi[];
        absensi.push(...batch);
        if (batch.length < UKURAN_HALAMAN) break;
      }
    }

    return { santri, absensi };
  }, [kelasId, kelasList, bulan, tahun]);

  async function siapkanLaporan() {
    if (!eligible) return;
    setErrorMuat(null);
    setMembuat(true);
    try {
      const { santri, absensi } = await buatLaporan();
      const tanggalAktif = new Set(absensi.map((a) => a.tanggal));

      const baris = santri.map((s) => {
        const milik = absensi.filter((a) => a.santri_id === s.id);
        const hadir = milik.filter((a) => a.status === 'hadir').length;
        const izin = milik.filter((a) => a.status === 'izin').length;
        const sakit = milik.filter((a) => a.status === 'sakit').length;
        const alpa = milik.filter((a) => a.status === 'alpa').length;
        const total = milik.length;
        return {
          nama: s.nama,
          hariAktif: total,
          izin,
          sakit,
          alpa,
          persen: total > 0 ? Math.round((hadir / total) * 100) : null,
          status: klasifikasi(hadir, izin, alpa, total),
        };
      });

      const rataPersen =
        baris.filter((b) => b.persen !== null).length > 0
          ? Math.round(
              baris.reduce((s, b) => s + (b.persen ?? 0), 0) / baris.filter((b) => b.persen !== null).length,
            )
          : 0;

      const kelasDipilih = kelasList.find((k) => k.id === kelasId) ?? null;
      const jadwalLabel =
        kelasDipilih && jam(kelasDipilih.jam_mulai) && jam(kelasDipilih.jam_selesai)
          ? `${jam(kelasDipilih.jam_mulai)}–${jam(kelasDipilih.jam_selesai)}`
          : '—';
      const ruanganLabel = kelasDipilih?.ruangan || '—';

      setLaporan({
        guruNama: profile?.display_name ?? '-',
        periode: `${NAMA_BULAN[bulan - 1]} ${tahun}`,
        kelasLabel,
        jadwalLabel,
        ruanganLabel,
        totalSantri: santri.length,
        totalHariAktif: tanggalAktif.size,
        hadirPercent: rataPersen,
        totalIzin: baris.filter((b) => b.status === 'Izin').length,
        totalAlpa: baris.filter((b) => b.status === 'Alpa').length,
        totalSakit: baris.filter((b) => b.status === 'Sakit').length,
        baris,
      });
    } catch (e) {
      setErrorMuat(e instanceof Error ? e.message : 'Gagal membuat laporan.');
    } finally {
      setMembuat(false);
    }
  }

  const tanggalHariIni = sekarang.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // --- Preview laporan (siap cetak) ---
  if (laporan) {
    return (
      <main className="min-h-screen bg-bg px-[18px] py-4">
        <button
          type="button"
          onClick={() => setLaporan(null)}
          className="mb-4 flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-[13px] font-semibold text-sage print:hidden"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Kembali
        </button>

        <LaporanPerkembanganCetak laporan={laporan} />
      </main>
    );
  }

  // --- Form filter ---
  return (
    <main className="flex min-h-screen flex-col bg-bg">
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

      {/* .ia-header — pola sama dgn GuruDashboard.tsx, tapi hero cuma nama
          (tanpa baris peran/kelompok) persis screenshot owner. */}
      <div className="shrink-0 overflow-hidden rounded-b-3xl bg-panel shadow-[0_6px_20px_rgba(5,150,105,0.22)]">
        <div className="flex items-center gap-2.5 bg-panel px-[18px] pt-3.5 pb-3">
          <button
            type="button"
            aria-label="Menu Utama"
            onClick={() => setMenuTerbuka((v) => !v)}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-start gap-[7px]">
            <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={20} height={18} className="block shrink-0" />
            <span className="text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Permintaan Masuk"
              className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-2.5 bg-[linear-gradient(135deg,#059669_0%,#6B9975_100%)] px-[18px] pt-4 pb-8">
          <div className="min-w-0 flex-1 text-[20px] leading-[1.2] font-bold text-white">
            {profile?.display_name ?? '-'}
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <rect width="18" height="18" x="3" y="4" rx="2" />
              <path d="M3 10h18" />
            </svg>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-10">
        <div className="mb-4 flex justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1.5 text-[11.5px] font-semibold text-text shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
            <span className="h-[7px] w-[7px] rounded-full bg-brass" />
            {tanggalHariIni}
          </span>
        </div>

        {/* Kartu Laporan Perkembangan Santri */}
        <div className="rounded-card border border-border bg-panel p-6 text-center shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'linear-gradient(135deg, var(--sage), var(--brand-green))' }}
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M10 9H8" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
            </svg>
          </div>

          <div className="mb-1 text-[16px] font-bold text-text">Laporan Perkembangan Santri</div>
          <p className="mb-5 text-[13px] text-sage">
            Unduh laporan kehadiran &amp; perkembangan santri kelas {kelasLabel} dalam bentuk PDF.
          </p>

          <div className="mb-4 text-left">
            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Kelas</label>
            <select
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value === '' ? '' : Number(e.target.value))}
              className={SELECT_KELAS}
            >
              <option value="">-- Pilih Kelas --</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 text-left">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Bulan</label>
              <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={SELECT_KELAS}>
                {NAMA_BULAN.map((nm, idx) => (
                  <option key={nm} value={idx + 1}>
                    {nm}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Tahun</label>
              <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={SELECT_KELAS}>
                {tahunPilihan.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!eligible && (
            <div className="mb-4 rounded-[var(--radius)] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-left text-[12.5px] text-[#92400E]">
              ⏳ Laporan {NAMA_BULAN[bulan - 1]} {tahun} baru bisa diunduh mulai tanggal {lastDay - 1}{' '}
              atau {lastDay} {NAMA_BULAN[bulan - 1]} (H-1 sebelum akhir bulan).
            </div>
          )}

          {errorMuat && (
            <p className="mb-4 text-left text-[12.5px] text-red">{errorMuat}</p>
          )}

          <button
            type="button"
            disabled={!eligible || membuat || kelasId === ''}
            onClick={siapkanLaporan}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none py-[15px] text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(5,150,105,0.3)] transition-transform duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--sage), var(--brand-green))' }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            {membuat ? 'Menyiapkan...' : 'Unduh PDF'}
          </button>
          <p className="mt-2.5 text-[11px] text-text-faint">
            Akan menampilkan preview, lalu membuka dialog cetak — pilih &ldquo;Simpan sebagai PDF&rdquo;.
          </p>
        </div>
      </div>
    </main>
  );
}
