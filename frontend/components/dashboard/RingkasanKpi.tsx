'use client';

/* Ringkasan KPI dashboard — padanan serverGetAdminKelpKpiSummary dan
   serverGetGuruDashboardSummary (Modul_InputAbsen.gs:1076, 1251).

   ⚠️ SATU PENYIMPANGAN BESAR DARI APP LAMA, DISENGAJA.
   KPI app lama memecah generus per KATEGORI KELAS (Cabe Rawit / Pra Remaja
   SMP / Remaja SMA), dengan cara mencocokkan `santri.kelas_ngaji` ke nama
   kelas lalu mengambil kategorinya. Di produksi Supabase jembatan itu
   nyaris kosong:

     santri.kelas_id  : 0 terisi dari 199
     santri.kelas_ngaji: 50 terisi dari 199

   Kalau ditiru mentah-mentah, empat dari lima kartu KPI akan menampilkan
   angka nol atau 25% dari kenyataan — dan angka nol itu akan terbaca
   sebagai fakta, bukan sebagai data yang belum lengkap. Karena itu
   pemecahannya memakai `jenjang_saat_ini`, kolom yang terisi untuk semua
   santri dan sudah dipakai halaman Monitoring.

   Selisihnya perlu diketahui: jenjang mengikuti usia/tingkat santri,
   sedangkan kategori kelas mengikuti kelas yang diikutinya. Untuk sebagian
   besar santri keduanya sejalan, tapi tidak dijamin sama. Begitu penetapan
   kelas (kelas_id) mulai diisi, KPI ini layak ditinjau ulang. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type Santri = { id: number; gender: string | null; jenjang_saat_ini: string | null };
type Absensi = { santri_id: number; status: string };

const JENJANG_TAMPIL = ['AUD', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja'];
const STATUS_TAMPIL: { kunci: string; label: string; warna: string }[] = [
  { kunci: 'hadir', label: 'Hadir', warna: 'text-sage' },
  { kunci: 'izin', label: 'Izin', warna: 'text-brass' },
  { kunci: 'sakit', label: 'Sakit', warna: 'text-brass' },
  { kunci: 'alpa', label: 'Alpa', warna: 'text-red' },
  { kunci: 'belum', label: 'Belum diinput', warna: 'text-text-dim' },
];

function Kartu({ label, nilai, catatan, warna }: { label: string; nilai: string; catatan?: string; warna?: string }) {
  return (
    <div className="rounded-card border border-border bg-panel px-4 py-3 shadow-[var(--shadow-card)]">
      <div className={'text-[22px] font-bold ' + (warna ?? 'text-text')}>{nilai}</div>
      <div className="text-[12px] font-semibold text-text-dim">{label}</div>
      {catatan && <div className="mt-0.5 text-[11px] text-text-faint">{catatan}</div>}
    </div>
  );
}

export default function RingkasanKpi() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [santri, setSantri] = useState<Santri[]>([]);
  const [absensi, setAbsensi] = useState<Absensi[]>([]);
  const [jumlahKelas, setJumlahKelas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tanggal = new Date().toISOString().slice(0, 10);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /* Tanpa scope kelompok (admin_ppg/desa), angkanya mencakup seluruh
         yang boleh dilihat pengguna — RLS yang menentukan batasnya. */
      let qSantri = supabase
        .from('santri')
        .select('id, gender, jenjang_saat_ini')
        .is('deleted_at', null);
      let qKelas = supabase.from('kelas').select('id', { count: 'exact', head: true }).is('deleted_at', null);
      if (kelompokId) {
        qSantri = qSantri.eq('kelompok_id', kelompokId);
        qKelas = qKelas.eq('kelompok_id', kelompokId);
      }

      const [{ data: dSantri, error: e1 }, { count }] = await Promise.all([qSantri, qKelas]);
      if (e1) throw new Error(e1.message);
      const daftar = (dSantri ?? []) as unknown as Santri[];
      setSantri(daftar);
      setJumlahKelas(count ?? 0);

      if (daftar.length > 0) {
        let qAbsen = supabase
          .from('absensi')
          .select('santri_id, status')
          .eq('tanggal', tanggal)
          .is('deleted_at', null);
        if (kelompokId) qAbsen = qAbsen.eq('kelompok_id', kelompokId);
        const { data: dAbsen, error: e2 } = await qAbsen;
        if (e2) throw new Error(e2.message);
        setAbsensi((dAbsen ?? []) as unknown as Absensi[]);
      } else {
        setAbsensi([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat ringkasan.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tanggal]);

  useEffect(() => {
    muat();
  }, [muat]);

  if (loading) return <p className="text-[13px] text-text-dim">Memuat ringkasan...</p>;
  if (error) return <p className="text-[13px] text-red">{error}</p>;
  if (santri.length === 0)
    return <p className="text-[13px] text-text-dim">Belum ada data santri untuk diringkas.</p>;

  const lk = santri.filter((s) => (s.gender ?? '').toUpperCase() === 'L').length;
  const pr = santri.filter((s) => (s.gender ?? '').toUpperCase() === 'P').length;

  const perJenjang = JENJANG_TAMPIL.map((j) => ({
    jenjang: j,
    jumlah: santri.filter((s) => s.jenjang_saat_ini === j).length,
  })).filter((x) => x.jumlah > 0);

  const statusPerSantri = new Map(absensi.map((a) => [a.santri_id, a.status]));
  const hitungStatus = (kunci: string) =>
    kunci === 'belum'
      ? santri.filter((s) => !statusPerSantri.has(s.id)).length
      : santri.filter((s) => statusPerSantri.get(s.id) === kunci).length;

  const sudahDiinput = absensi.length;
  const persenInput = santri.length ? Math.round((sudahDiinput / santri.length) * 100) : 0;

  return (
    <div>
      <div className="mb-3 text-[15px] font-bold text-text">Ringkasan</div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kartu label="Total Generus" nilai={String(santri.length)} catatan={`${lk} laki-laki · ${pr} perempuan`} />
        <Kartu label="Kelas" nilai={String(jumlahKelas)} />
        {perJenjang.slice(0, 2).map((j) => (
          <Kartu key={j.jenjang} label={j.jenjang} nilai={String(j.jumlah)} />
        ))}
      </div>

      {perJenjang.length > 2 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {perJenjang.slice(2).map((j) => (
            <Kartu key={j.jenjang} label={j.jenjang} nilai={String(j.jumlah)} />
          ))}
        </div>
      )}

      <div className="mb-2 text-[13px] font-semibold text-text-dim">
        Kehadiran hari ini ({tanggal}) — {persenInput}% sudah diinput
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_TAMPIL.map((s) => (
          <Kartu key={s.kunci} label={s.label} nilai={String(hitungStatus(s.kunci))} warna={s.warna} />
        ))}
      </div>
    </div>
  );
}
