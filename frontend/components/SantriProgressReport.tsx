'use client';

/* Laporan Perkembangan Santri (admin desktop) — ditulis ulang total (20
   Agt, diminta owner): "cek app lama, minimal samakan, maksimal lebih
   premium, jangan norak/AI-slop". Versi SEBELUMNYA (git history) cuma
   pemilih 1 santri + tabel absensi mentah, tidak menyerupai fitur app
   lama sama sekali.

   Bentuk & rumus disalin dari tab desktop app lama (Markup_Screens.html
   ~3332-3369, Script_Main.html:6600-6797 window.loadLaporanPerkembangan-
   SantriHtml_/lpsBuildBodyHtml_/LPS_STATUS_WARNA_HEX_):
   - Toolbar: pilih Guru -> Kelas (kalau guru pegang >1 kelas) -> Bulan ->
     Tahun -> "Buat Laporan".
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
   bebas spt app lama. Data guru/kelas SUDAH scoped RLS (pola sama dgn
   GuruList.tsx/GuruForm.tsx -- select tanpa filter scope manual). */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Guru = { id: number; nama: string };
type Kelas = { id: number; nama: string; jam_mulai: string | null; jam_selesai: string | null; ruangan: string | null };
type Santri = { id: number; nama: string; kelas_id: number | null };
type Absensi = { santri_id: number; tanggal: string; status: string };

type SantriBaris = {
  nama: string;
  hariAktif: number;
  hadir: number;
  izin: number;
  sakit: number;
  alpa: number;
  persen: number | null;
  status: string;
};

type Laporan = {
  guruNama: string;
  periode: string;
  kelasLabel: string;
  jadwalLabel: string;
  ruanganLabel: string;
  totalSantri: number;
  totalHariAktif: number;
  hadirPercent: number;
  totalIzin: number;
  totalAlpa: number;
  totalSakit: number;
  baris: SantriBaris[];
};

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

function klasifikasi(hadir: number, izin: number, alpa: number, total: number) {
  if (total === 0) return 'Belum Ada Data';
  const persen = Math.round((hadir / total) * 100);
  if (persen >= 80) return 'Hadir';
  if (izin > 0) return 'Izin';
  if (alpa > 0) return 'Alpa';
  return 'Sakit';
}

function KartuMetrik({ label, nilai, warna, catatan }: { label: string; nilai: string; warna: string; catatan: string }) {
  return (
    <div className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
      <div className="text-[11px] font-bold tracking-[0.4px] text-text uppercase">{label}</div>
      <div className="mt-1.5 text-[26px] leading-none font-extrabold" style={{ color: warna }}>
        {nilai}
      </div>
      <div className="mt-1.5 text-[8px] leading-tight text-text">{catatan}</div>
    </div>
  );
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

  const [laporan, setLaporan] = useState<Laporan | null>(null);
  const [membuat, setMembuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      .then(({ data }) => setKelasList((data ?? []) as Kelas[]));
  }, [guruId]);

  const buatLaporan = useCallback(async () => {
    if (guruId === '') {
      setError('Pilih guru terlebih dahulu.');
      return;
    }
    setError(null);
    setMembuat(true);
    setLaporan(null);
    try {
      const kelasDipakai = kelasId === '' ? kelasList : kelasList.filter((k) => k.id === kelasId);
      const kelasIds = kelasDipakai.map((k) => k.id);
      if (kelasIds.length === 0) throw new Error('Guru ini belum punya kelas.');

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

      const tanggalAktif = new Set(absensi.map((a) => a.tanggal));

      const baris: SantriBaris[] = santri.map((s) => {
        const milik = absensi.filter((a) => a.santri_id === s.id);
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

        {kelasList.length > 1 && (
          <div>
            <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Kelas</label>
            <select
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value === '' ? '' : Number(e.target.value))}
              className={`${SELECT_FILTER} min-w-[160px]`}
            >
              <option value="">Semua Kelas</option>
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
          disabled={membuat}
          onClick={buatLaporan}
          className="cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {membuat ? 'Membuat...' : 'Buat Laporan'}
        </button>

        <button
          type="button"
          disabled={!laporan}
          onClick={unduhPdf}
          className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
        >
          Unduh PDF
        </button>
      </div>

      {laporan && (
        <p className="mb-4 text-[11.5px] text-text-faint print:hidden">
          Membuka dialog cetak browser — pilih tujuan &ldquo;Simpan sebagai PDF&rdquo;.
        </p>
      )}

      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

      {!laporan && !error && (
        <div className="rounded-card border border-border bg-panel py-16 text-center text-[13px] text-text-faint shadow-[var(--shadow-card)]">
          Pilih guru &amp; periode, lalu klik &ldquo;Buat Laporan&rdquo;.
        </div>
      )}

      {laporan && (
        <div id="laporan-cetak" className="rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]">
          <div className="mb-6 text-center">
            <div className="text-[19px] font-extrabold text-text">Laporan Perkembangan Santri</div>
            <div className="mt-1 text-[13px] text-text">{laporan.periode}</div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] text-text sm:grid-cols-2">
            <div>
              <span className="inline-block min-w-[92px] font-bold">Guru</span>: Kak {laporan.guruNama}
            </div>
            <div>
              <span className="inline-block min-w-[92px] font-bold">Jadwal KBM</span>: {laporan.jadwalLabel}
            </div>
            <div>
              <span className="inline-block min-w-[92px] font-bold">Kelas</span>: {laporan.kelasLabel}
            </div>
            <div>
              <span className="inline-block min-w-[92px] font-bold">Ruangan</span>: {laporan.ruanganLabel}
            </div>
          </div>

          <div className="cetak-jaga-utuh mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <KartuMetrik
              label="Hari Aktif"
              nilai={String(laporan.totalHariAktif)}
              warna="var(--indigo)"
              catatan="hari efektif bulan ini"
            />
            <KartuMetrik
              label="Kehadiran"
              nilai={`${laporan.hadirPercent}%`}
              warna="var(--sage)"
              catatan={`rata2 dari ${laporan.totalSantri} santri`}
            />
            <KartuMetrik
              label="Izin"
              nilai={String(laporan.totalIzin)}
              warna="var(--brass)"
              catatan={`${laporan.totalSantri ? Math.round((laporan.totalIzin / laporan.totalSantri) * 100) : 0}% santri`}
            />
            <KartuMetrik
              label="Alpa"
              nilai={String(laporan.totalAlpa)}
              warna="var(--red)"
              catatan={`${laporan.totalSantri ? Math.round((laporan.totalAlpa / laporan.totalSantri) * 100) : 0}% santri`}
            />
            <KartuMetrik
              label="Sakit"
              nilai={String(laporan.totalSakit)}
              warna="var(--teal)"
              catatan={`${laporan.totalSantri ? Math.round((laporan.totalSakit / laporan.totalSantri) * 100) : 0}% santri`}
            />
          </div>

          <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="border-b border-border bg-panel-2">
                <tr>
                  {['Nama', 'Hari Aktif', 'Kehadiran', 'Izin', 'Alpa', 'Sakit'].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-[11px] font-bold tracking-[0.3px] text-text uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {laporan.baris.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-text-faint">
                      Belum ada santri di kelas guru ini.
                    </td>
                  </tr>
                ) : (
                  laporan.baris.map((b) => (
                    <tr key={b.nama} className="hover:bg-panel-2">
                      <td className="border-b border-border px-4 py-2.5 text-text">{b.nama}</td>
                      <td className="border-b border-border px-4 py-2.5 text-text">{b.hariAktif}</td>
                      <td className="border-b border-border px-4 py-2.5 text-text">
                        {b.persen !== null ? `${b.persen}%` : '—'}
                      </td>
                      <td className="border-b border-border px-4 py-2.5 text-text">{b.izin}</td>
                      <td className="border-b border-border px-4 py-2.5 text-text">{b.alpa}</td>
                      <td className="border-b border-border px-4 py-2.5 text-text">{b.sakit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
