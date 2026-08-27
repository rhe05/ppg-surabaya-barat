'use client';

/* Halaman Statistik — padanan Modul_Statistics.gs (7 fungsi: tren
   kehadiran, kehadiran & peringkat per kelompok, demografi, 10 teratas,
   10 terbawah, metrik pertumbuhan).

   Seluruh angkanya dihitung di Postgres lewat RPC statistik_kehadiran
   (migrasi 20260818240000), bukan di peramban: statistik membaca seluruh
   riwayat absensi, dan menariknya ke sisi klien berarti mengunduh ribuan
   baris untuk dibuang hampir semuanya. Sekali panggil, satu jsonb.

   PILIHAN BENTUK — tidak semua angka jadi grafik:
   - Tren harian → garis. Satu deret, jadi tanpa legenda; judulnya sudah
     menyebut apa yang digambar.
   - Perbandingan antar kelompok → batang horizontal, satu warna. Warna di
     sini menyandikan besaran, bukan identitas, jadi memberi tiap kelompok
     warna sendiri justru menyesatkan.
   - Peringkat santri (10 teratas/terbawah) → TABEL. Isinya nama + dua
     angka; batang tidak menambah apa pun selain memakan ruang.
   - Demografi → tabel dengan pecahan L/P, bukan diagram lingkaran.

   Santri dengan kurang dari 3 catatan absensi sengaja tidak masuk
   peringkat — dengan 1 catatan, seorang santri bisa muncul sebagai "100%"
   atau "0%" dan itu menyesatkan. Aturan itu ada di sisi SQL. */

import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import RequireAuth from '@/components/RequireAuth';
import AdminHeader from '@/components/dashboard/AdminHeader';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useIsMobile } from '@/lib/useIsMobile';
import StatistikKelpMobile from '@/components/dashboard/StatistikKelpMobile';

type TitikTren = { tanggal: string; total: number; hadir: number; persen: number | null };
type BarisKelompok = { kelompok: string; total: number; hadir: number; persen: number | null };
type BarisSantri = { nama: string; total: number; hadir: number; persen: number };
type BarisDemografi = { jenjang: string; jumlah: number; lk: number; pr: number };
type Ringkas = {
  total_catatan: number;
  total_hadir: number;
  persen: number | null;
  jumlah_hari: number;
};
type Hasil = {
  sejak: string;
  hari: number;
  tren: TitikTren[];
  per_kelompok: BarisKelompok[];
  teratas: BarisSantri[];
  terbawah: BarisSantri[];
  demografi: BarisDemografi[];
  ringkas: Ringkas;
};

type Kelompok = { id: number; nama: string };

const RENTANG = [
  { nilai: 30, label: '30 hari' },
  { nilai: 60, label: '60 hari' },
  { nilai: 90, label: '90 hari' },
  { nilai: 180, label: '6 bulan' },
];

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

/* Gaya tooltip diambil dari components/AbsensiChart.tsx supaya seluruh
   grafik di app ini terlihat satu keluarga. */
const GAYA_TOOLTIP = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-card)',
  fontSize: 13,
  color: 'var(--text)',
};

function Kartu({ label, nilai, catatan }: { label: string; nilai: string; catatan?: string }) {
  return (
    <div className="rounded-card border border-border bg-panel px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="text-[22px] font-bold text-text">{nilai}</div>
      <div className="text-[12px] font-semibold text-text-dim">{label}</div>
      {catatan && <div className="mt-0.5 text-[11px] text-text-faint">{catatan}</div>}
    </div>
  );
}

function TabelSantri({ judul, baris }: { judul: string; baris: BarisSantri[] }) {
  return (
    <div className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 text-[14px] font-bold text-text">{judul}</div>
      {baris.length === 0 ? (
        <p className="text-[12px] text-text-dim">Belum cukup data.</p>
      ) : (
        <table className="w-full border-collapse text-left text-[12px]">
          <thead className="border-b border-border">
            <tr>
              {['#', 'Nama', 'Hadir', 'Kehadiran'].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold text-text-dim uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => (
              <tr key={b.nama + i} className="hover:bg-panel-2">
                <td className="border-b border-border px-2 py-2 text-text-dim">{i + 1}</td>
                <td className="border-b border-border px-2 py-2 text-text">{b.nama}</td>
                <td className="border-b border-border px-2 py-2 text-text-dim">
                  {b.hadir}/{b.total}
                </td>
                <td className="border-b border-border px-2 py-2 font-semibold text-text">
                  {b.persen}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* Cabang mobile admin_kelompok (2026-08-27) -- di HP layar Statistik =
   Peringkat Kehadiran berbasis poin (StatistikKelpMobile.tsx), bukan
   halaman grafik desktop di bawah. Wrapper tipis: cuma useAuth+useIsMobile
   sebelum bercabang (StatistikDesktop py banyak hook sendiri). */
function StatistikContent() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  if (profile?.role === 'admin_kelompok' && isMobile) return <StatistikKelpMobile />;
  return <StatistikDesktop />;
}

function StatistikDesktop() {
  const { profile } = useAuth();

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [hari, setHari] = useState(30);
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
  }, []);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('statistik_kehadiran', {
        p: { kelompok_id: kelompokId, hari },
      });
      if (err) throw new Error(err.message);
      setHasil(data as unknown as Hasil);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat statistik.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, hari]);

  useEffect(() => {
    muat();
  }, [muat]);

  const adaData = !!hasil && hasil.ringkas.total_catatan > 0;
  /* Pemilih Kelompok cuma berguna utk admin_ppg/admin_desa (bisa lihat
     kelompok lain) -- utk admin_kelompok/guru selectnya SUDAH disabled
     dari dulu (scope terkunci ke kelompok sendiri), jadi menampilkannya
     cuma keramaian tanpa fungsi (diminta owner 2026-08-26: hilangkan). */
  const bolehPilihKelompok = profile?.role === 'admin_ppg' || profile?.role === 'admin_desa';

  return (
    <main className="min-h-screen bg-bg">
      {/* Top bar (2026-08-26, diminta owner) -- halaman ini dulu TIDAK
          py header sama sekali, jadi admin_kelompok di HP terjebak tanpa
          jalan pindah halaman selain tombol back browser, sama gejala
          yg sudah ditambal di /guru & /santri. */}
      <AdminHeader judul="Statistik" />

      <div className="mx-auto max-w-5xl p-6">
        <div className={`mb-6 grid grid-cols-1 gap-4 ${bolehPilihKelompok ? 'sm:grid-cols-2' : ''}`}>
          {bolehPilihKelompok && (
            <div>
              <label className={KELAS_LABEL}>Kelompok</label>
              <select
                className={KELAS_INPUT}
                value={kelompokId ?? ''}
                onChange={(e) => setKelompokId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Semua kelompok (sesuai hak akses)</option>
                {kelompokList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={KELAS_LABEL}>Rentang</label>
            <select className={KELAS_INPUT} value={hari} onChange={(e) => setHari(Number(e.target.value))}>
              {RENTANG.map((r) => (
                <option key={r.nilai} value={r.nilai}>
                  {r.label} terakhir
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && <p className="text-[13px] text-text-dim">Menghitung...</p>}
      {error && <p className="text-[13px] text-red">{error}</p>}
      {!loading && !error && !adaData && (
        <p className="text-[13px] text-text-dim">
          Tidak ada catatan absensi pada rentang ini.
        </p>
      )}

      {!loading && adaData && hasil && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kartu
              label="Kehadiran"
              nilai={`${hasil.ringkas.persen ?? 0}%`}
              catatan={`${hasil.ringkas.total_hadir} dari ${hasil.ringkas.total_catatan}`}
            />
            <Kartu label="Hari ada KBM" nilai={String(hasil.ringkas.jumlah_hari)} />
            <Kartu label="Catatan absensi" nilai={String(hasil.ringkas.total_catatan)} />
            <Kartu label="Sejak" nilai={hasil.sejak} />
          </div>

          {/* ── Tren harian: satu deret, tanpa legenda ── */}
          <div className="mb-6 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
            <div className="mb-1 text-[14px] font-bold text-text">Tren kehadiran harian (%)</div>
            <p className="mb-4 text-[11px] text-text-faint">
              Persentase santri yang hadir dari seluruh catatan pada hari itu.
            </p>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hasil.tren} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="tanggal"
                    tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                    stroke="var(--border)"
                    tickFormatter={(t: string) => t.slice(5)}
                    minTickGap={24}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                    stroke="var(--border)"
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={GAYA_TOOLTIP}
                    formatter={(v, _n, item) => {
                      const d = item?.payload as TitikTren | BarisKelompok | undefined;
                      return [`${v}% (${d?.hadir ?? 0}/${d?.total ?? 0})`, 'Kehadiran'];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="persen"
                    stroke="var(--brass)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Per kelompok: satu warna, besaran bukan identitas ── */}
          {hasil.per_kelompok.length > 1 && (
            <div className="mb-6 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
              <div className="mb-1 text-[14px] font-bold text-text">Kehadiran per kelompok (%)</div>
              <p className="mb-4 text-[11px] text-text-faint">Urut dari yang tertinggi.</p>
              <div className="w-full" style={{ height: Math.max(180, hasil.per_kelompok.length * 44) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={hasil.per_kelompok}
                    layout="vertical"
                    margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: 'var(--text-dim)', fontSize: 11 }}
                      stroke="var(--border)"
                      unit="%"
                    />
                    <YAxis
                      type="category"
                      dataKey="kelompok"
                      width={140}
                      tick={{ fill: 'var(--text-dim)', fontSize: 12 }}
                      stroke="var(--border)"
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--panel-2)' }}
                      contentStyle={GAYA_TOOLTIP}
                      formatter={(v, _n, item) => {
                        const d = item?.payload as BarisKelompok | undefined;
                        return [`${v}% (${d?.hadir ?? 0}/${d?.total ?? 0})`, 'Kehadiran'];
                      }}
                    />
                    <Bar dataKey="persen" fill="var(--brass)" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <TabelSantri judul="10 kehadiran tertinggi" baris={hasil.teratas} />
            <TabelSantri judul="10 kehadiran terendah" baris={hasil.terbawah} />
          </div>
          <p className="mb-6 text-[11px] text-text-faint">
            Santri dengan kurang dari 3 catatan absensi tidak masuk peringkat — dengan satu catatan,
            angkanya akan selalu 100% atau 0% dan itu menyesatkan.
          </p>

          <div className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
            <div className="mb-3 text-[14px] font-bold text-text">Demografi santri</div>
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="border-b border-border">
                <tr>
                  {['Jenjang', 'Jumlah', 'Laki-laki', 'Perempuan'].map((h) => (
                    <th key={h} className="px-2 py-2 font-semibold text-text-dim uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hasil.demografi.map((d) => (
                  <tr key={d.jenjang} className="hover:bg-panel-2">
                    <td className="border-b border-border px-2 py-2 text-text">{d.jenjang}</td>
                    <td className="border-b border-border px-2 py-2 font-semibold text-text">
                      {d.jumlah}
                    </td>
                    <td className="border-b border-border px-2 py-2 text-text-dim">{d.lk}</td>
                    <td className="border-b border-border px-2 py-2 text-text-dim">{d.pr}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
    </main>
  );
}

export default function StatistikPage() {
  return (
    <RequireAuth>
      <StatistikContent />
    </RequireAuth>
  );
}
