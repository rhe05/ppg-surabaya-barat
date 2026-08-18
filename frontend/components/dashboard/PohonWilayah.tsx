'use client';

/* Pohon Desa › Kelompok + Santri Teladan — padanan serverGetSidebarTree dan
   serverGetDashboardSantriTeladan (Modul_Dashboard.gs:229, 285).

   BENTUKNYA BERBEDA DARI APP LAMA, dan itu disengaja. Di sana pohon ini
   adalah SIDEBAR navigasi: klik desa, klik kelompok, seluruh layar
   berpindah konteks. App baru tidak punya sidebar semacam itu — tiap
   halaman punya pemilih kelompoknya sendiri, dan konteks tidak disimpan
   lintas halaman. Meniru sidebar itu berarti menambah keadaan global yang
   harus dijaga konsisten di 23 halaman demi satu jalan pintas navigasi.

   Jadi di sini pohonnya jadi RINGKASAN: berapa kelompok per desa, berapa
   santri dan guru di masing-masing. Itu pertanyaan yang sebenarnya dijawab
   admin PPG saat membuka sidebar lama — "di mana orangnya" — tanpa
   memindahkan konteks ke mana pun.

   Hanya ditampilkan untuk peran yang memang melihat lebih dari satu
   kelompok. Bagi admin kelompok, pohon berisi satu simpul tidak berguna. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type Desa = { id: number; nama: string };
type Kelompok = { id: number; nama: string; desa_id: number };
type Hitung = { kelompok_id: number };
type Teladan = {
  nilai: number | null;
  santri: { nama: string } | { nama: string }[] | null;
};

const AMBANG_TELADAN = 90;

function nama(v: Teladan['santri']) {
  if (!v) return '-';
  const b = Array.isArray(v) ? v[0] : v;
  return b?.nama ?? '-';
}

export default function PohonWilayah() {
  const { profile } = useAuth();
  const lintasKelompok = profile?.role === 'admin_ppg' || profile?.role === 'admin_desa';

  const [desa, setDesa] = useState<Desa[]>([]);
  const [kelompok, setKelompok] = useState<Kelompok[]>([]);
  const [santri, setSantri] = useState<Hitung[]>([]);
  const [guru, setGuru] = useState<Hitung[]>([]);
  const [teladan, setTeladan] = useState<Teladan[]>([]);
  const [periode, setPeriode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: dDesa }, { data: dKel }, { data: dSantri }, { data: dGuru }, { data: dPeriode }] =
        await Promise.all([
          supabase.from('desa').select('id, nama').order('nama'),
          supabase.from('kelompok').select('id, nama, desa_id').order('nama'),
          supabase.from('santri').select('kelompok_id').is('deleted_at', null),
          supabase.from('guru').select('kelompok_id').is('deleted_at', null),
          supabase
            .from('periode_munaqosah')
            .select('id, semester')
            .order('id', { ascending: false })
            .limit(1),
        ]);
      setDesa((dDesa ?? []) as unknown as Desa[]);
      setKelompok((dKel ?? []) as unknown as Kelompok[]);
      setSantri((dSantri ?? []) as unknown as Hitung[]);
      setGuru((dGuru ?? []) as unknown as Hitung[]);

      const p = (dPeriode ?? [])[0] as { id: number; semester: string } | undefined;
      if (p) {
        setPeriode(p.semester);
        const { data: dTeladan } = await supabase
          .from('munaqosah')
          .select('nilai, santri!inner(nama)')
          .eq('periode_id', p.id)
          .gte('nilai', AMBANG_TELADAN)
          .is('deleted_at', null)
          .order('nilai', { ascending: false })
          .limit(5);
        setTeladan((dTeladan ?? []) as unknown as Teladan[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  if (loading) return null;

  const hitungSantri = (id: number) => santri.filter((s) => s.kelompok_id === id).length;
  const hitungGuru = (id: number) => guru.filter((g) => g.kelompok_id === id).length;

  return (
    <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2">
      {lintasKelompok && desa.length > 0 && (
        <div className="rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
          <div className="mb-1 text-[15px] font-bold text-text">Sebaran Wilayah</div>
          <p className="mb-4 text-[11px] text-text-faint">
            {kelompok.length} kelompok di {desa.length} desa.
          </p>
          {desa.map((d) => {
            const anak = kelompok.filter((k) => k.desa_id === d.id);
            if (anak.length === 0) return null;
            return (
              <div key={d.id} className="mb-3">
                <div className="text-[13px] font-semibold text-text">{d.nama}</div>
                {anak.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between border-b border-border py-1 pl-3 text-[12px] last:border-b-0"
                  >
                    <span className="text-text">{k.nama}</span>
                    <span className="text-text-dim">
                      {hitungSantri(k.id)} santri · {hitungGuru(k.id)} guru
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-1 text-[15px] font-bold text-text">Santri Teladan</div>
        <p className="mb-4 text-[11px] text-text-faint">
          {periode ? `Periode ${periode} · nilai ${AMBANG_TELADAN} ke atas.` : 'Belum ada periode munaqosah.'}
        </p>
        {teladan.length === 0 ? (
          <p className="text-[12px] text-text-dim">
            {periode
              ? 'Belum ada santri yang mencapai nilai teladan pada periode ini.'
              : 'Buka periode munaqosah dulu untuk mulai menilai.'}
          </p>
        ) : (
          teladan.map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-border py-1.5 text-[12px] last:border-b-0"
            >
              <span className="text-text">
                <span className="mr-2 text-text-dim">{i + 1}</span>
                {nama(t.santri)}
              </span>
              <span className="font-bold text-sage">{t.nilai}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
