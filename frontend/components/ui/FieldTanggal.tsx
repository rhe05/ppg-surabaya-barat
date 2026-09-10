'use client';

/* Pembungkus TanggalPicker — tombol pemicu + kalender custom dalam satu
   komponen, mengurus posisinya sendiri (getBoundingClientRect ->
   PosisiPicker). Pakai ini utk SEMUA field tanggal baru supaya tak ada
   lagi <input type="date"> bawaan browser (tampilannya beda tiap
   perangkat) dan tak perlu menyalin boilerplate ref/posisi.
   Dipakai: SantriForm, JamaahForm, AcaraForm, PengurusManager. */

import { useRef, useState } from 'react';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';

const NAMA_BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/* 'YYYY-MM-DD' -> "21 Agu 2026" (kosong -> ''). */
function formatTampil(v: string): string {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  return `${String(d).padStart(2, '0')} ${NAMA_BULAN_SINGKAT[m - 1] ?? ''} ${y}`;
}

export default function FieldTanggal({
  nilai,
  onPilih,
  className = '',
  placeholder = 'Pilih tanggal',
}: {
  nilai: string;
  onPilih: (v: string) => void;
  /* Kelas tombol (biasanya konstanta INPUT form-nya). */
  className?: string;
  placeholder?: string;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [posisi, setPosisi] = useState<PosisiPicker | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  function buka() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPosisi({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setTerbuka(true);
  }

  return (
    <>
      <button
        type="button"
        ref={ref}
        onClick={buka}
        className={`${className} text-left ${nilai ? '' : 'text-text-faint'}`}
      >
        {nilai ? formatTampil(nilai) : placeholder}
      </button>
      <TanggalPicker
        terbuka={terbuka}
        posisi={posisi}
        nilai={nilai}
        onPilih={onPilih}
        onTutup={() => setTerbuka(false)}
      />
    </>
  );
}
