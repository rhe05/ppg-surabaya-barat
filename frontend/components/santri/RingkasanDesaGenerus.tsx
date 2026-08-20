'use client';

/* "Ringkasan Data Generus Desa" — perbandingan antar desa, diminta owner
   (20 Agt, putaran kedelapan) sbg tambahan di bawah kartu ringkasan
   /santri. HANYA dipasang utk admin_ppg (lihat gerbangnya di
   SantriList.tsx) -- satu-satunya peran yang punya alasan membandingkan
   desa; RLS santri tetap jadi penjaga sesungguhnya kalau komponen ini
   suatu saat dipasang di tempat lain.

   Bentuknya "kolom", bukan tabel lebar (diminta owner: "buatkan dalam
   bentuk kolom") -- 9 metrik (total, L, P, siap nikah, 5 jenjang) per desa
   terlalu banyak utk satu baris tabel yang masih enak dibaca; satu kartu
   per desa, metrik ditumpuk vertikal, jauh lebih padat & rapi drpd tabel
   9-kolom yang harus discroll horizontal. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { JENJANG_URUT, WARNA_JENJANG } from '@/lib/jenjang';

type Desa = { id: number; nama: string };
type Kelompok = { id: number; desa_id: number };
type Santri = { kelompok_id: number | null; gender: string | null; jenjang_saat_ini: string | null; status_nikah: string | null };

// Warna aksen per desa, siklus dari token app lama -- kategorikal, bukan
// makna semantik (desa tidak punya "status baik/buruk").
const WARNA_DESA = ['var(--brass)', 'var(--sage)', 'var(--volt)', 'var(--indigo)', 'var(--teal)'];

function Baris({ label, nilai, warna }: { label: string; nilai: number; warna?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-[11.5px] text-text-dim">{label}</span>
      <span className="text-[13px] font-semibold" style={{ color: warna }}>
        {nilai}
      </span>
    </div>
  );
}

export default function RingkasanDesaGenerus() {
  const [desa, setDesa] = useState<Desa[]>([]);
  const [kelompok, setKelompok] = useState<Kelompok[]>([]);
  const [santri, setSantri] = useState<Santri[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: dDesa }, { data: dKel }, { data: dSantri }] = await Promise.all([
        supabase.from('desa').select('id, nama').order('id'),
        supabase.from('kelompok').select('id, desa_id'),
        supabase
          .from('santri')
          .select('kelompok_id, gender, jenjang_saat_ini, status_nikah')
          .is('deleted_at', null),
      ]);
      setDesa((dDesa ?? []) as unknown as Desa[]);
      setKelompok((dKel ?? []) as unknown as Kelompok[]);
      setSantri((dSantri ?? []) as unknown as Santri[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  if (loading || desa.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 text-[15px] font-bold text-text">Ringkasan Data Generus Desa</div>

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(190px, 1fr))` }}
      >
        {desa.map((d, i) => {
          const kelompokIds = new Set(kelompok.filter((k) => k.desa_id === d.id).map((k) => k.id));
          const anggota = santri.filter((s) => s.kelompok_id !== null && kelompokIds.has(s.kelompok_id));
          const total = anggota.length;
          const lk = anggota.filter((s) => (s.gender ?? '').toUpperCase() === 'L').length;
          const pr = anggota.filter((s) => (s.gender ?? '').toUpperCase() === 'P').length;
          const siapNikah = anggota.filter((s) => s.status_nikah === 'Siap Nikah').length;
          const warnaDesa = WARNA_DESA[i % WARNA_DESA.length];

          return (
            <div
              key={d.id}
              className="overflow-hidden rounded-card border border-border bg-panel shadow-[var(--shadow-card)] transition-shadow duration-200 hover:shadow-[0_4px_18px_rgba(15,23,42,0.1)]"
            >
              <div className="h-[3px] w-full" style={{ background: warnaDesa }} />
              <div className="p-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: warnaDesa }}
                  />
                  <span className="truncate text-[13px] font-bold text-text">{d.nama}</span>
                </div>

                <div className="mb-3 flex items-baseline gap-1.5">
                  <span className="text-[26px] leading-none font-bold text-text">{total}</span>
                  <span className="text-[11px] text-text-faint">generus</span>
                </div>

                <div className="border-t border-border pt-1.5">
                  <Baris label="Laki-laki" nilai={lk} warna="var(--sage)" />
                  <Baris label="Perempuan" nilai={pr} warna="var(--volt)" />
                  <Baris label="Siap Nikah" nilai={siapNikah} warna="var(--teal)" />
                </div>

                <div className="mt-1.5 border-t border-border pt-1.5">
                  {JENJANG_URUT.map((j) => (
                    <Baris
                      key={j}
                      label={j}
                      nilai={anggota.filter((s) => s.jenjang_saat_ini === j).length}
                      warna={WARNA_JENJANG[j]}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
