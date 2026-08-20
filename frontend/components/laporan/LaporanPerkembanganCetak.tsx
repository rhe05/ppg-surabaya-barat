'use client';

/* Blok laporan siap-cetak "Laporan Perkembangan Santri" -- SATU sumber
   dipakai admin desktop (SantriProgressReport.tsx) & guru mobile
   (GuruLaporanView.tsx), diminta owner (20 Agt): "tampilan di mobile app
   dengan di print preview desktop tidak sama, samakan". Sebelumnya
   masing-masing menulis markup sendiri-sendiri dan diam-diam ngedrift --
   versi guru bahkan kehilangan kartu Sakit & baris Jadwal KBM/Ruangan yang
   ada di versi admin. Dengan satu komponen ini, hasil cetak (id=
   "laporan-cetak", CSS print di app/globals.css) DIJAMIN identik strukturnya
   apa pun jalur pembuatnya -- perbaikan cukup di satu tempat, tidak bisa
   ngedrift lagi. */

export type LaporanBaris = {
  nama: string;
  hariAktif: number;
  izin: number;
  alpa: number;
  sakit: number;
  persen: number | null;
};

export type LaporanPerkembangan = {
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
  baris: LaporanBaris[];
};

function KartuMetrik({ label, nilai, warna, catatan }: { label: string; nilai: string; warna: string; catatan: string }) {
  return (
    <div className="rounded-card border border-border bg-panel p-3.5 shadow-[var(--shadow-card)]">
      <div className="text-[10.5px] font-bold tracking-[0.4px] text-text uppercase">{label}</div>
      <div className="mt-1.5 text-[22px] leading-none font-extrabold" style={{ color: warna }}>
        {nilai}
      </div>
      <div className="mt-1.5 text-[8px] leading-tight text-text">{catatan}</div>
    </div>
  );
}

export default function LaporanPerkembanganCetak({ laporan }: { laporan: LaporanPerkembangan }) {
  const pct = (n: number) => (laporan.totalSantri ? Math.round((n / laporan.totalSantri) * 100) : 0);

  return (
    <div id="laporan-cetak" className="rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="mb-5 text-center sm:mb-6">
        <div className="text-[17px] font-extrabold text-text sm:text-[19px]">Laporan Perkembangan Santri</div>
        <div className="mt-1 text-[12.5px] text-text sm:text-[13px]">{laporan.periode}</div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] text-text sm:mb-6 sm:grid-cols-2">
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

      <div className="cetak-jaga-utuh mb-5 grid grid-cols-2 gap-2.5 sm:mb-6 sm:grid-cols-5 sm:gap-3">
        <KartuMetrik label="Hari Aktif" nilai={String(laporan.totalHariAktif)} warna="var(--indigo)" catatan="hari efektif bulan ini" />
        <KartuMetrik label="Kehadiran" nilai={`${laporan.hadirPercent}%`} warna="var(--sage)" catatan={`rata2 dari ${laporan.totalSantri} santri`} />
        <KartuMetrik label="Izin" nilai={String(laporan.totalIzin)} warna="var(--brass)" catatan={`${pct(laporan.totalIzin)}% santri`} />
        <KartuMetrik label="Alpa" nilai={String(laporan.totalAlpa)} warna="var(--red)" catatan={`${pct(laporan.totalAlpa)}% santri`} />
        <KartuMetrik label="Sakit" nilai={String(laporan.totalSakit)} warna="var(--teal)" catatan={`${pct(laporan.totalSakit)}% santri`} />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full border-collapse text-left text-[12px] sm:text-[13px]">
          <thead className="border-b border-border bg-panel-2">
            <tr>
              {['Nama', 'Hari Aktif', 'Kehadiran', 'Izin', 'Alpa', 'Sakit'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-[10px] font-bold tracking-[0.3px] text-text uppercase sm:px-4 sm:py-3 sm:text-[11px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {laporan.baris.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-faint">
                  Belum ada santri di kelas ini.
                </td>
              </tr>
            ) : (
              laporan.baris.map((b) => (
                <tr key={b.nama}>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.nama}</td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.hariAktif}</td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">
                    {b.persen !== null ? `${b.persen}%` : '—'}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.izin}</td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.alpa}</td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.sakit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
