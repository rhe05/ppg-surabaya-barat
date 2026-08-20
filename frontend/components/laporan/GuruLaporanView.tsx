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
   (sistem preview modal + pdfmake terpisah, di luar cakupan tugas ini) —
   PDF di sini dibuat langsung via jsPDF/autoTable, pola yang sama dgn
   components/SantriProgressReport.tsx. */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import MenuGuru from '@/components/dashboard/MenuGuru';
import KehadiranChooser from '@/components/dashboard/KehadiranChooser';
import JurnalChooser from '@/components/dashboard/JurnalChooser';

type Kelas = { id: number; nama: string };
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

  useEffect(() => {
    if (guruId == null) return;
    supabase
      .from('kelas')
      .select('id, nama')
      .eq('guru_id', guruId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => setKelasList((data ?? []) as Kelas[]));
  }, [guruId]);

  const { eligible, lastDay } = cekEligible(bulan, tahun);
  const kelasLabel = kelasId === '' ? 'Jenengan' : (kelasList.find((k) => k.id === kelasId)?.nama ?? 'Jenengan');

  const buatLaporan = useCallback(async () => {
    const kelasIds = kelasId === '' ? kelasList.map((k) => k.id) : [kelasId];
    if (kelasIds.length === 0) throw new Error('Belum ada kelas yang terdaftar atas nama Anda.');

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

  async function unduhPdf() {
    if (!eligible) return;
    setErrorMuat(null);
    setMembuat(true);
    try {
      const { santri, absensi } = await buatLaporan();

      const baris = santri.map((s) => {
        const milik = absensi.filter((a) => a.santri_id === s.id);
        const hadir = milik.filter((a) => a.status === 'hadir').length;
        const izin = milik.filter((a) => a.status === 'izin').length;
        const sakit = milik.filter((a) => a.status === 'sakit').length;
        const alpa = milik.filter((a) => a.status === 'alpa').length;
        const total = milik.length;
        const persen = total > 0 ? Math.round((hadir / total) * 100) : null;
        return {
          nama: s.nama,
          hariAktif: total,
          hadir,
          izin,
          sakit,
          alpa,
          persen,
          status: klasifikasi(hadir, izin, alpa, total),
        };
      });

      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(16);
      doc.text('Laporan Perkembangan Santri', pageWidth / 2, 18, { align: 'center' });
      doc.setFontSize(10);
      doc.text(`Periode: ${NAMA_BULAN[bulan - 1]} ${tahun}`, pageWidth / 2, 25, { align: 'center' });

      doc.setFontSize(11);
      doc.text(`Guru: ${profile?.display_name ?? '-'}`, 14, 36);
      doc.text(`Kelas: ${kelasLabel}`, 14, 43);
      doc.text(`Total Santri: ${santri.length}`, 14, 50);

      autoTable(doc, {
        startY: 58,
        head: [['Nama', 'Hari Aktif', 'Hadir', 'Izin', 'Sakit', 'Alpa', '%', 'Status']],
        body: baris.map((b) => [
          b.nama,
          b.hariAktif,
          b.hadir,
          b.izin,
          b.sakit,
          b.alpa,
          b.persen === null ? '-' : `${b.persen}%`,
          b.status,
        ]),
        styles: { fontSize: 9 },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(
          `Halaman ${i} / ${pageCount} — dicetak ${new Date().toLocaleString('id-ID')}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' },
        );
      }

      doc.save(
        `Laporan_Perkembangan_${kelasLabel.replace(/\s+/g, '_')}_${NAMA_BULAN[bulan - 1]}_${tahun}.pdf`,
      );
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
        {/* Pil tanggal hari ini. SEBELUMNYA pakai -mt-9 supaya "menggantung"
            tumpang tindih batas hero/putih (meniru posisi di screenshot
            owner) -- DIBATALKAN (dilaporkan owner: terlihat spt ada kartu
            terselip di bawahnya). Penyebabnya box-shadow header hijau TIDAK
            ikut terpotong oleh overflow-hidden/rounded-b-3xl milik header
            sendiri (box-shadow elemen tidak pernah diclip oleh overflow
            miliknya sendiri) -- jadi bayangannya menimpa pil begitu ditarik
            naik ke bawah lengkungan header, terlihat spt lapisan kartu
            kedua. Sekarang jarak normal, tidak tumpang tindih apa pun. */}
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
              <option value="">Semua Kelas</option>
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
            disabled={!eligible || membuat}
            onClick={unduhPdf}
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
        </div>
      </div>
    </main>
  );
}
