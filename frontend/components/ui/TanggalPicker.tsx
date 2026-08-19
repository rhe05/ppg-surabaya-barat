'use client';

/* Kalender custom — menyalin persis .ppg-datepicker app lama
   (Style_Main.html:3098-3210, Script_Main.html:5140-5230): kartu melayang,
   dropdown Bulan/Tahun + panah navigasi, grid hari MIN-SAB, tanggal hari
   ini digaris tebal warna brass, tanggal terpilih lingkaran penuh brass.

   Dipakai lewat ikon kalender di header (iaHeaderCalendarClick_ ->
   toggleDatePicker('iaTanggal', 'iaCalendarBtn') di app lama) — BUKAN
   <input type="date"> bawaan browser, supaya tampilannya sama persis di
   semua perangkat.

   Posisi: `position: fixed` dgn koordinat dari getBoundingClientRect()
   pemicunya (dihitung pemanggil, dikirim lewat prop `posisi`) — PERSIS
   teknik app lama. WAJIB fixed + dirender di LUAR kotak header manapun:
   header punya overflow-hidden (utk sudut bawah membulat), dan overflow-
   hidden tetap memotong keturunan `position: absolute`/`fixed` sekalipun
   — baru kelihatan setelah dicoba (terpotong separuh, dilaporkan owner).
   Simplifikasi dari app lama: selalu buka ke BAWAH pemicunya (tidak ada
   logika flip ke atas kalau ruang kurang) — cukup utk ikon yang selalu
   dekat atas layar. */

import { useState } from 'react';

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
const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function keTanggalString(tahun: number, bulan: number, hari: number) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${tahun}-${dua(bulan + 1)}-${dua(hari)}`;
}

export type PosisiPicker = { top: number; right: number };

export default function TanggalPicker({
  terbuka,
  posisi,
  nilai,
  onPilih,
  onTutup,
}: {
  terbuka: boolean;
  /* Dihitung pemanggil dari getBoundingClientRect() tombol pemicu (lihat
     GuruAbsensiView) — top & right dlm px, sudah relatif viewport (cocok
     langsung dgn position:fixed). */
  posisi: PosisiPicker | null;
  nilai: string;
  onPilih: (v: string) => void;
  onTutup: () => void;
}) {
  const dasar = nilai ? new Date(nilai + 'T00:00:00') : new Date();
  const [tahun, setTahun] = useState(dasar.getFullYear());
  const [bulan, setBulan] = useState(dasar.getMonth());

  if (!terbuka || !posisi) return null;

  const todayStr = (() => {
    const now = new Date();
    return keTanggalString(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  const hariPertama = new Date(tahun, bulan, 1).getDay();
  const jumlahHari = new Date(tahun, bulan + 1, 0).getDate();
  const jumlahHariBulanLalu = new Date(tahun, bulan, 0).getDate();

  const tahunSekarang = new Date().getFullYear();
  const opsiTahun: number[] = [];
  for (let y = tahunSekarang + 1; y >= tahunSekarang - 90; y--) opsiTahun.push(y);

  function geser(delta: number) {
    let b = bulan + delta;
    let t = tahun;
    if (b < 0) {
      b = 11;
      t -= 1;
    } else if (b > 11) {
      b = 0;
      t += 1;
    }
    setBulan(b);
    setTahun(t);
  }

  const selMuted = 'text-center rounded-lg py-1.5 text-[12.5px] text-text-faint opacity-40';
  const selHari = (tglStr: string) => {
    let kelas =
      'cursor-pointer rounded-lg py-1.5 text-center text-[12.5px] text-text transition-colors duration-150 hover:bg-panel-2';
    if (tglStr === todayStr) kelas += ' font-bold text-brass';
    if (tglStr === nilai)
      kelas =
        'cursor-pointer rounded-lg py-1.5 text-center text-[12.5px] font-bold bg-brass text-white';
    return kelas;
  };

  return (
    <>
      {/* Lapisan transparan penuh layar — klik di luar kartu menutup kalender. */}
      <div className="fixed inset-0 z-[1090]" onClick={onTutup} />
      <div
        className="fixed z-[1100] w-[296px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
        style={{ top: posisi.top, right: posisi.right }}
      >
        <div className="mb-3 flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={() => geser(-1)}
            aria-label="Bulan sebelumnya"
            className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-panel-2 text-[13px] text-text-dim transition-colors duration-150 hover:border-brass hover:bg-brass hover:text-white"
          >
            ‹
          </button>
          <div className="flex flex-1 gap-1.5">
            <select
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
              className="min-w-0 flex-[1.3] rounded-md border border-border bg-panel px-1 py-1 text-[12px] text-text"
            >
              {NAMA_BULAN.map((nm, idx) => (
                <option key={nm} value={idx}>
                  {nm}
                </option>
              ))}
            </select>
            <select
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
              className="min-w-0 flex-1 rounded-md border border-border bg-panel px-1 py-1 text-[12px] text-text"
            >
              {opsiTahun.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => geser(1)}
            aria-label="Bulan berikutnya"
            className="flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-panel-2 text-[13px] text-text-dim transition-colors duration-150 hover:border-brass hover:bg-brass hover:text-white"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {HARI_PENDEK.map((h) => (
            <div
              key={h}
              className="pt-1 pb-2 text-center text-[10.5px] font-bold tracking-[0.02em] text-text-faint uppercase"
            >
              {h}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: hariPertama }, (_, i) => (
            <div key={`m${i}`} className={selMuted}>
              {jumlahHariBulanLalu - hariPertama + i + 1}
            </div>
          ))}
          {Array.from({ length: jumlahHari }, (_, i) => {
            const hari = i + 1;
            const tglStr = keTanggalString(tahun, bulan, hari);
            return (
              <button
                key={tglStr}
                type="button"
                onClick={() => {
                  onPilih(tglStr);
                  onTutup();
                }}
                className={selHari(tglStr)}
              >
                {hari}
              </button>
            );
          })}
          {Array.from({ length: (7 - ((hariPertama + jumlahHari) % 7)) % 7 }, (_, i) => (
            <div key={`t${i}`} className={selMuted}>
              {i + 1}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
