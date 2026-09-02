'use client';

/* Laporan Perkembangan Santri (admin desktop) — ditulis ulang total (20
   Agt, diminta owner): "cek app lama, minimal samakan, maksimal lebih
   premium, jangan norak/AI-slop". Versi SEBELUMNYA (git history) cuma
   pemilih 1 santri + tabel absensi mentah, tidak menyerupai fitur app
   lama sama sekali.

   Bentuk & rumus disalin dari tab desktop app lama (Markup_Screens.html
   ~3332-3369, Script_Main.html:6600-6797 window.loadLaporanPerkembangan-
   SantriHtml_/lpsBuildBodyHtml_/LPS_STATUS_WARNA_HEX_):
   - Toolbar: pilih Guru -> Kelas -> Bulan -> Tahun -> "Buat Laporan".
   - Hasil: judul+periode tengah, blok info Guru/Kelas/Jadwal/Ruangan
     2-kolom, 5 kartu metrik (Hari Aktif/Kehadiran/Izin/Alpa/Sakit), tabel
     detail per santri.
   - Klasifikasi & rumus SAMA PERSIS dgn components/laporan/GuruLaporanView.tsx
     (padanan guru mobile utk fitur yang sama) -- >=80% hadir -> 'Hadir',
     lalu izin -> 'Izin', lalu alpa -> 'Alpa', sisanya 'Sakit'.

   BEDA sengaja dari app lama: visual kartu metrik & tabel dibuat ulang
   memakai bahasa desain app baru (rounded-card/border-border/bg-panel,
   pola KartuRingkas yang sudah dipakai di SantriList.tsx/RingkasanKpi.tsx)
   -- BUKAN meniru border-top-3px flat app lama. Warna metrik dipetakan ke
   token app baru yang paling dekat maknanya: Hari Aktif=indigo (app lama
   jg indigo #4F46E5, kebetulan sama persis), Kehadiran=sage, Izin=brass,
   Alpa=red, Sakit=teal (app lama biru #3987e5, tidak ada di palet app
   baru -- teal dipilih krn belum dipakai metrik lain di kartu ini, bukan
   warna baru yang ditebak sembarangan). Sumber data kelas/santri pakai
   kelas.guru_id + santri.kelas_id (FK app baru), bukan jadwal_kbm teks

   PUTARAN KEDUA (20 Agt, diminta owner): "Unduh PDF" DIGANTI TOTAL dari
   jsPDF/autoTable (dokumen dibangun manual, tata letaknya beda dari yang
   tampil di layar) ke window.print() + CSS #laporan-cetak (app/globals.
   css) -- PERSIS teknik app lama (window.print(), lihat komentar "Print-
   to-PDF Laporan Perkembangan Santri" di Style_Main.html). Hasilnya
   render BROWSER ASLI dari markup yang SAMA PERSIS yang sudah tampil di
   layar (bukan dibangun ulang terpisah spt jsPDF) -- 100% sama persis
   tampilan web, klien murni (tanpa panggilan Supabase tambahan sama
   sekali saat unduh, datanya sudah ada di state dari "Buat Laporan"),
   tanpa backend baru, tanpa render server, instan, gratis.

   PUTARAN KETIGA (20 Agt, diminta owner): dua aturan tambahan, sama
   persis dgn GuruLaporanView.tsx --
   1. Laporan WAJIB per kelas -- opsi "Semua Kelas" DIHAPUS. Guru dgn 1
      kelas otomatis terpilih (bukan pilihan, cuma satu kemungkinan);
      guru dgn >1 kelas wajib pilih manual sebelum "Buat Laporan" aktif.
   2. "Unduh PDF" dikunci H-1 (cekEligible, sama rumus dgn
      iaLaporanCekEligible_) -- sebelumnya cuma dipasang di guru mobile,
      sekarang berlaku jg di desktop admin. "Buat Laporan" (preview)
      TETAP boleh kapan saja, cuma tombol cetaknya yang dikunci.
   bebas spt app lama. Data guru/kelas SUDAH scoped RLS (pola sama dgn
   GuruList.tsx/GuruForm.tsx -- select tanpa filter scope manual).

   PUTARAN KEEMPAT (20 Agt, diminta owner): tampilan blok cetak
   (id="laporan-cetak") DIPINDAH ke components/laporan/
   LaporanPerkembanganCetak.tsx, dipakai bareng dgn GuruLaporanView.tsx --
   sebelumnya dua berkas ini menulis markup blok cetak sendiri-sendiri dan
   diam-diam ngedrift (versi guru sempat kehilangan kartu Sakit & baris
   Jadwal KBM/Ruangan). Satu komponen = tidak bisa ngedrift lagi. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  muatOverrideKelompok,
  saringAbsensiHariKerja,
  type OverrideKelompok,
} from '@/lib/kalenderKelompok';
import LaporanPerkembanganCetak, {
  type LaporanPerkembangan,
} from '@/components/laporan/LaporanPerkembanganCetak';
import { muatPengulanganKelas } from '@/lib/dataGuru';

type Guru = { id: number; nama: string };
type Kelas = { id: number; nama: string; jam_mulai: string | null; jam_selesai: string | null; ruangan: string | null };
type Santri = { id: number; nama: string; kelas_id: number | null };
type Absensi = { santri_id: number; tanggal: string; status: string; kelompok_id: number | null };

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const SELECT_FILTER =
  'rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none';

function batasBulan(tahun: number, bulan: number) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return {
    awal: `${tahun}-${dua(bulan)}-01`,
    akhir: `${tahun}-${dua(bulan)}-${dua(new Date(tahun, bulan, 0).getDate())}`,
  };
}

function jam(v: string | null) {
  return v ? v.slice(0, 5) : null;
}

// iaLaporanCekEligible_ (Script_Main.html:2273-2280) — sama persis dgn
// components/laporan/GuruLaporanView.tsx, diminta owner berlaku jg di
// desktop admin (sebelumnya cuma dipasang di guru mobile): laporan 1
// bulan baru boleh diunduh mulai H-1 sebelum akhir bulan itu.
function cekEligible(bulan: number, tahun: number) {
  const lastDay = new Date(tahun, bulan, 0).getDate();
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

export default function SantriProgressReport() {
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [guruId, setGuruId] = useState<number | ''>('');
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear(), sekarang.getFullYear() + 1];

  const [laporan, setLaporan] = useState<LaporanPerkembangan | null>(null);
  const [membuat, setMembuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { eligible, lastDay } = cekEligible(bulan, tahun);

  useEffect(() => {
    supabase
      .from('guru')
      .select('id, nama')
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => setGuruList((data ?? []) as Guru[]));
  }, []);

  useEffect(() => {
    setKelasId('');
    setLaporan(null);
    if (guruId === '') {
      setKelasList([]);
      return;
    }
    supabase
      .from('kelas')
      .select('id, nama, jam_mulai, jam_selesai, ruangan')
      .eq('guru_id', guruId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => {
        const list = (data ?? []) as Kelas[];
        setKelasList(list);
        // Guru pegang 1 kelas -> otomatis terpilih (bukan "pilihan", cuma
        // satu-satunya kemungkinan). Guru pegang >1 kelas -> WAJIB dipilih
        // manual (diminta owner: laporan wajib per kelas, tidak boleh
        // "Semua Kelas" -- lihat komentar di kepala berkas).
        setKelasId(list.length === 1 ? list[0].id : '');
      });
  }, [guruId]);

  const buatLaporan = useCallback(async () => {
    if (guruId === '') {
      setError('Pilih guru terlebih dahulu.');
      return;
    }
    if (kelasId === '') {
      setError(kelasList.length === 0 ? 'Guru ini belum punya kelas.' : 'Pilih kelas terlebih dahulu — laporan wajib per kelas.');
      return;
    }
    setError(null);
    setMembuat(true);
    setLaporan(null);
    try {
      // WAJIB satu kelas (diminta owner) -- tidak ada lagi jalur "gabungan
      // semua kelas guru".
      const kelasDipakai = kelasList.filter((k) => k.id === kelasId);
      const kelasIds = kelasDipakai.map((k) => k.id);
      const { awal, akhir } = batasBulan(tahun, bulan);

      /* Santri yang pindah/nonaktif SETELAH bulan ini dimulai tetap ikut --
         deleted_at dipakai sbg "sejak kapan tidak aktif" (migrasi
         20260821130000), jadi laporan bulan yang sudah lewat tetap
         menunjukkan riwayatnya walau sekarang dia sudah tidak aktif. */
      const { data: dSantri, error: eSantri } = await supabase
        .from('santri')
        .select('id, nama, kelas_id')
        .in('kelas_id', kelasIds)
        .or(`deleted_at.is.null,deleted_at.gt.${awal}`)
        .order('nama');
      if (eSantri) throw new Error(eSantri.message);
      const santri = (dSantri ?? []) as Santri[];
      const santriIds = santri.map((s) => s.id);

      const absensi: Absensi[] = [];
      if (santriIds.length > 0) {
        const UKURAN_HALAMAN = 1000;
        for (let dari = 0; ; dari += UKURAN_HALAMAN) {
          const { data, error: eAbsensi } = await supabase
            .from('absensi')
            .select('santri_id, tanggal, status, kelompok_id')
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

      /* Buang sesi Sabtu/Minggu & tanggal libur kelompok -- "Hari Aktif"
         & persentase kehadiran ikut definisi baru (2026-08-27). */
      const kelompokId = absensi.find((a) => a.kelompok_id != null)?.kelompok_id ?? null;
      const override = kelompokId
        ? await muatOverrideKelompok(kelompokId)
        : new Map<string, OverrideKelompok>();
      const absensiHariKerja = saringAbsensiHariKerja(absensi, override);

      const tanggalAktif = new Set(absensiHariKerja.map((a) => a.tanggal));

      /* Materi Klasikal (2026-09-02, diminta owner, admin desktop) --
         pakai RPC yang sama dgn fitur Monitoring guru (lib/dataGuru.ts),
         periode SAMA PERSIS dgn laporan ini (bulan+tahun yg sudah
         dipilih di atas), kelas SAMA PERSIS jg (`p_kelas_id: kelasId`)
         -- rincian per-surat OTOMATIS cuma milik kelas ini, bukan
         daftar baku kurikulum (diminta owner: "cukup materi sesuai
         kelas tersebut"). kelasId sudah dijamin number di sini (dicek
         di awal fungsi). Kalau RPC-nya gagal, laporan tetap tampil --
         section "Materi Klasikal" cukup dilewati (lihat catatan try/
         catch di bawah), jangan sampai satu fitur tambahan menggagalkan
         seluruh laporan kehadiran yang sudah jadi kebutuhan utama. */
      let materiKlasikal: LaporanPerkembangan['materiKlasikal'];
      try {
        const barisKlasikal = await muatPengulanganKelas(kelasId, awal, akhir);
        materiKlasikal = {
          hafSurat: barisKlasikal.map((b) => ({ namaSurat: b.nama_surat, jumlah: b.jumlah })),
          hafDoaPengulangan: null,
        };
      } catch {
        materiKlasikal = undefined;
      }

      const baris = santri.map((s) => {
        const milik = absensiHariKerja.filter((a) => a.santri_id === s.id);
        const hadir = milik.filter((a) => a.status === 'hadir').length;
        const izin = milik.filter((a) => a.status === 'izin').length;
        const sakit = milik.filter((a) => a.status === 'sakit').length;
        const alpa = milik.filter((a) => a.status === 'alpa').length;
        const total = milik.length;
        return {
          nama: s.nama,
          hariAktif: total,
          hadir,
          izin,
          sakit,
          alpa,
          persen: total > 0 ? Math.round((hadir / total) * 100) : null,
          status: klasifikasi(hadir, izin, alpa, total),
        };
      });

      const totalSantri = santri.length;
      const rataPersen =
        baris.filter((b) => b.persen !== null).length > 0
          ? Math.round(
              baris.reduce((s, b) => s + (b.persen ?? 0), 0) / baris.filter((b) => b.persen !== null).length,
            )
          : 0;

      const kelasLabel = kelasDipakai.length > 0 ? kelasDipakai.map((k) => k.nama).join(', ') : '—';
      const jadwalLabel =
        kelasDipakai.length === 0
          ? '—'
          : kelasDipakai.length === 1
            ? jam(kelasDipakai[0].jam_mulai) && jam(kelasDipakai[0].jam_selesai)
              ? `${jam(kelasDipakai[0].jam_mulai)}–${jam(kelasDipakai[0].jam_selesai)}`
              : '—'
            : kelasDipakai
                .map((k) => `${k.nama}: ${jam(k.jam_mulai) && jam(k.jam_selesai) ? `${jam(k.jam_mulai)}–${jam(k.jam_selesai)}` : '—'}`)
                .join('; ');
      const ruanganLabel =
        kelasDipakai.length === 0
          ? '—'
          : kelasDipakai.length === 1
            ? kelasDipakai[0].ruangan || '—'
            : kelasDipakai.map((k) => `${k.nama}: ${k.ruangan || '—'}`).join('; ');

      setLaporan({
        guruNama: guruList.find((g) => g.id === guruId)?.nama ?? '-',
        periode: `${NAMA_BULAN[bulan - 1]} ${tahun}`,
        kelasLabel,
        jadwalLabel,
        ruanganLabel,
        totalSantri,
        totalHariAktif: tanggalAktif.size,
        hadirPercent: rataPersen,
        totalIzin: baris.filter((b) => b.status === 'Izin').length,
        totalAlpa: baris.filter((b) => b.status === 'Alpa').length,
        totalSakit: baris.filter((b) => b.status === 'Sakit').length,
        baris,
        materiKlasikal,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat laporan.');
    } finally {
      setMembuat(false);
    }
  }, [guruId, kelasId, kelasList, guruList, bulan, tahun]);

  // window.print() + CSS #laporan-cetak (app/globals.css) -- lihat komentar
  // di kepala berkas. Datanya sudah ada di state `laporan` (hasil "Buat
  // Laporan"), jadi unduh PDF TIDAK memanggil Supabase sama sekali.
  function unduhPdf() {
    if (!laporan) return;

    /* Nama berkas PDF diambil peramban dari document.title -- disamakan
       dgn jalur guru (GuruLaporanView.tsx), diminta owner 2026-08-28.
       Karakter terlarang di nama berkas dibuang; nama kelas boleh
       mengandung "/" (mis. "PAUD/TK") yang akan memotong nama berkas. */
    const judulAsli = document.title;
    const aman = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').trim();
    document.title = `Laporan Perkembangan Santri - ${aman(laporan.guruNama)} - ${aman(laporan.kelasLabel)}`;

    const pulihkan = () => {
      document.title = judulAsli;
      window.removeEventListener('afterprint', pulihkan);
    };
    window.addEventListener('afterprint', pulihkan);

    window.print();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Guru</label>
          <select
            value={guruId}
            onChange={(e) => setGuruId(e.target.value === '' ? '' : Number(e.target.value))}
            className={`${SELECT_FILTER} min-w-[200px]`}
          >
            <option value="">-- Pilih Guru --</option>
            {guruList.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nama}
              </option>
            ))}
          </select>
        </div>

        {guruId !== '' && (
          <div>
            <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Kelas</label>
            <select
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value === '' ? '' : Number(e.target.value))}
              className={`${SELECT_FILTER} min-w-[160px]`}
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

        <div>
          <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Bulan</label>
          <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={SELECT_FILTER}>
            {NAMA_BULAN.map((nm, idx) => (
              <option key={nm} value={idx + 1}>
                {nm}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Tahun</label>
          <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={SELECT_FILTER}>
            {tahunPilihan.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={membuat || guruId === '' || kelasId === ''}
          onClick={buatLaporan}
          className="cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {membuat ? 'Membuat...' : 'Buat Laporan'}
        </button>

        <button
          type="button"
          disabled={!laporan || !eligible}
          onClick={unduhPdf}
          className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
        >
          Unduh PDF
        </button>
      </div>

      {/* H-1: iaLaporanCekEligible_ sama persis dgn GuruLaporanView.tsx --
          diminta owner berlaku jg di desktop admin. Cuma tombol "Unduh
          PDF" yg dikunci; "Buat Laporan" (preview) tetap boleh kapan saja
          supaya admin masih bisa memantau progres bulan berjalan. */}
      {!eligible && (
        <div className="mb-4 rounded-[var(--radius)] border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[12.5px] text-[#92400E]">
          ⏳ Laporan {NAMA_BULAN[bulan - 1]} {tahun} baru bisa diunduh mulai tanggal {lastDay - 1} atau{' '}
          {lastDay} {NAMA_BULAN[bulan - 1]} (H-1 sebelum akhir bulan).
        </div>
      )}

      {laporan && eligible && (
        <p className="mb-4 text-[11.5px] text-text-faint print:hidden">
          Membuka dialog cetak browser — pilih tujuan &ldquo;Simpan sebagai PDF&rdquo;.
        </p>
      )}

      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

      {!laporan && !error && (
        <div className="rounded-card border border-border bg-panel py-16 text-center text-[13px] text-text-faint shadow-[var(--shadow-card)]">
          Pilih guru, kelas, &amp; periode, lalu klik &ldquo;Buat Laporan&rdquo;.
        </div>
      )}

      {laporan && <LaporanPerkembanganCetak laporan={laporan} />}
    </div>
  );
}
