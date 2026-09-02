'use client';

/* Halaman Monitoring — padanan serverGetMonitoringGenerus
   (Modul_Monitoring.gs:45-145).

   Yang diolah: rata-rata kehadiran generus per JENJANG dan per KELAS NGAJI
   dalam satu bulan. Bedanya dengan layar Kehadiran biasa, di sini angkanya
   dihitung bertingkat:

     % per santri   = hadir / seluruh catatan absensi santri itu di bulan tsb
     % per kelas    = rata-rata dari % santri di kelas itu
     % per jenjang  = rata-rata dari % KELAS, BUKAN rata-rata semua santri

   Tingkat terakhir itu disengaja di app lama dan dipertahankan di sini:
   kalau dihitung gabungan, kelas kecil akan tenggelam oleh kelas besar dan
   masalah di kelas kecil tidak pernah kelihatan.

   Ambang kategori (90/80/70) diambil apa adanya dari kategoriKehadiran_
   (Modul_Monitoring.gs:32-37). */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import MatriksKehadiran from '@/components/monitoring/MatriksKehadiran';
import PencapaianMateriView from '@/components/monitoring/PencapaianMateriView';

/* Nilai jenjang harus cocok persis dgn enum santri_jenjang di Postgres.
   MONITORING_JENJANG_LIST_ app lama memakai 4 dari 5 nilai enum — 'PAUD/TK'
   (dulu 'AUD', diganti 20 Agt) sengaja tidak ikut, sama seperti di sana. */
const JENJANG = [
  { kunci: 'Cabe Rawit', label: 'Cabe Rawit' },
  { kunci: 'Pra Remaja', label: 'Pra Remaja' },
  { kunci: 'Remaja SMA', label: 'Remaja SMA' },
  { kunci: 'Remaja', label: 'Remaja Pra Nikah' },
];

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type Santri = {
  id: number;
  nama: string;
  jenjang_saat_ini: string | null;
  kelas_ngaji: string | null;
};

type Absensi = { santri_id: number; status: string };
type Kelompok = { id: number; nama: string };

type RingkasKelas = {
  kelas: string;
  jumlahSantri: number;
  adaData: boolean;
  avgPct: number;
};

type RingkasJenjang = {
  kunci: string;
  label: string;
  avgPct: number;
  adaData: boolean;
  jumlahKelas: number;
  jumlahSantri: number;
  kelasList: RingkasKelas[];
  luarDaftar: boolean;
};

/* Ambang tetap, disepakati pemilik app lama — jangan diubah tanpa mereka. */
function kategori(pct: number): { label: string; kelasWarna: string } {
  if (pct >= 90) return { label: 'Sangat Baik', kelasWarna: 'text-sage' };
  if (pct >= 80) return { label: 'Baik', kelasWarna: 'text-sage' };
  if (pct >= 70) return { label: 'Perlu Perhatian', kelasWarna: 'text-brass' };
  return { label: 'Prioritas Pembinaan', kelasWarna: 'text-red' };
}

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

/* PostgREST diam-diam memotong hasil di 1000 baris — absensi sudah melewati
   angka itu, jadi setiap pembacaannya WAJIB berhalaman. Pola sama dengan
   components/AbsensiChart.tsx. */
async function ambilAbsensiBulan(
  santriIds: number[],
  dariTanggal: string,
  sampaiTanggal: string
): Promise<Absensi[]> {
  const UKURAN_HALAMAN = 1000;
  const semua: Absensi[] = [];
  for (let dari = 0; ; dari += UKURAN_HALAMAN) {
    const { data, error } = await supabase
      .from('absensi')
      .select('santri_id, status')
      .in('santri_id', santriIds)
      .gte('tanggal', dariTanggal)
      .lte('tanggal', sampaiTanggal)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(dari, dari + UKURAN_HALAMAN - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Absensi[];
    semua.push(...batch);
    if (batch.length < UKURAN_HALAMAN) break;
  }
  return semua;
}

/* Monitoring bercabang dua sejak 2026-09-02 (diminta owner): Kehadiran
   (yang sudah ada di bawah, TIDAK diubah isinya) dan Pencapaian Materi
   (baru, lihat PencapaianMateriView.tsx). SATU menu ber-tab, bukan dua
   entri navigasi terpisah -- "satu jalan saja per tujuan" (aturan
   proyek ini sendiri, feedback-jangan-duplikasi-navigasi).

   Kehadiran TETAP admin-only spt sebelumnya. Pencapaian Materi dibuka
   utk guru JUGA (terbatas kelasnya sendiri) -- makanya '/monitoring'
   ditambahkan ke HALAMAN_GURU (RequireAuth.tsx), dan di sinilah
   perannya dibedakan: guru langsung mendarat di tab Materi tanpa pilihan
   (tab Kehadiran disembunyikan sepenuhnya, bukan cuma tombolnya --
   seluruh state/efek Kehadiran juga dilewati di bawah supaya tidak ada
   permintaan sia-sia ke Supabase utk data yang tidak pernah ditampilkan). */
type TabMonitoring = 'kehadiran' | 'materi';

function MonitoringContent() {
  const { profile } = useAuth();
  const adalahGuru = profile?.role === 'guru';
  const kini = new Date();

  const [tab, setTab] = useState<TabMonitoring>(adalahGuru ? 'materi' : 'kehadiran');

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [tahun, setTahun] = useState(kini.getFullYear());
  const [bulan, setBulan] = useState(kini.getMonth() + 1);

  const [hasil, setHasil] = useState<RingkasJenjang[]>([]);
  const [totalCatatan, setTotalCatatan] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (adalahGuru) return;
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
  }, [adalahGuru]);

  const hitung = useCallback(async () => {
    if (adalahGuru || !kelompokId) return;
    setLoading(true);
    setError(null);
    try {
      const awal = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
      /* Hari 0 bulan berikutnya = hari terakhir bulan ini, termasuk kabisat. */
      const akhirHari = new Date(tahun, bulan, 0).getDate();
      const akhir = `${tahun}-${String(bulan).padStart(2, '0')}-${String(akhirHari).padStart(2, '0')}`;

      /* Santri yang pindah/nonaktif SETELAH bulan ini dimulai tetap ikut --
         deleted_at dipakai sbg "sejak kapan tidak aktif" (migrasi
         20260821130000), jadi bulan yang sudah lewat tetap menunjukkan
         riwayatnya walau sekarang dia sudah tidak aktif. */
      const { data: dSantri, error: e1 } = await supabase
        .from('santri')
        .select('id, nama, jenjang_saat_ini, kelas_ngaji')
        .eq('kelompok_id', kelompokId)
        .or(`deleted_at.is.null,deleted_at.gt.${awal}`);
      if (e1) throw new Error(e1.message);
      const santri = (dSantri ?? []) as unknown as Santri[];

      if (santri.length === 0) {
        setHasil([]);
        setTotalCatatan(0);
        return;
      }

      const absensi = await ambilAbsensiBulan(
        santri.map((s) => s.id),
        awal,
        akhir
      );
      setTotalCatatan(absensi.length);

      const perSantri = new Map<number, { hadir: number; total: number }>();
      for (const a of absensi) {
        const s = perSantri.get(a.santri_id) ?? { hadir: 0, total: 0 };
        s.total += 1;
        if (a.status === 'hadir') s.hadir += 1;
        perSantri.set(a.santri_id, s);
      }

      /* App lama hanya menghitung 4 jenjang di MONITORING_JENJANG_LIST_ dan
         DIAM-DIAM membuang sisanya. Di produksi 'PAUD/TK' (dulu 'AUD')
         punya belasan santri beserta absensinya — kalau daftarnya ditiru
         mentah-mentah, data itu hilang tanpa jejak di layar. Jenjang di
         luar daftar tetap dihitung, tapi ditandai supaya jelas bukan
         bagian dari laporan baku. */
      const jenjangLain = [
        ...new Set(
          santri
            .map((s) => s.jenjang_saat_ini)
            .filter((j): j is string => !!j && !JENJANG.some((x) => x.kunci === j))
        ),
      ].sort();

      const daftarJenjang = [
        ...JENJANG.map((j) => ({ ...j, luarDaftar: false })),
        ...jenjangLain.map((j) => ({ kunci: j, label: j, luarDaftar: true })),
      ];

      const ringkas = daftarJenjang.map(({ kunci, label, luarDaftar }) => {
        const anggota = santri.filter((s) => s.jenjang_saat_ini === kunci);

        const perKelas = new Map<string, Santri[]>();
        for (const s of anggota) {
          /* kelas_ngaji teks bebas di app lama; kosong -> 'Belum diisi'. */
          const k = (s.kelas_ngaji ?? '').trim() || 'Belum diisi';
          perKelas.set(k, [...(perKelas.get(k) ?? []), s]);
        }

        const kelasList: RingkasKelas[] = [...perKelas.entries()]
          .map(([kelas, daftar]) => {
            const persen = daftar
              .map((s) => perSantri.get(s.id))
              .filter((v): v is { hadir: number; total: number } => !!v && v.total > 0)
              .map((v) => (v.hadir / v.total) * 100);
            return {
              kelas,
              jumlahSantri: daftar.length,
              adaData: persen.length > 0,
              avgPct: persen.length ? persen.reduce((a, b) => a + b, 0) / persen.length : 0,
            };
          })
          .sort((a, b) => a.kelas.localeCompare(b.kelas));

        const kelasBerdata = kelasList.filter((k) => k.adaData);
        return {
          kunci,
          label,
          adaData: kelasBerdata.length > 0,
          /* Rata-rata dari rata-rata KELAS — lihat catatan di kepala berkas. */
          avgPct: kelasBerdata.length
            ? kelasBerdata.reduce((a, k) => a + k.avgPct, 0) / kelasBerdata.length
            : 0,
          jumlahKelas: kelasList.length,
          jumlahSantri: anggota.length,
          kelasList,
          luarDaftar,
        };
      });

      setHasil(ringkas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghitung monitoring.');
    } finally {
      setLoading(false);
    }
  }, [adalahGuru, kelompokId, tahun, bulan]);

  useEffect(() => {
    hitung();
  }, [hitung]);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Monitoring</h1>

      {/* Tab hanya utk admin -- guru langsung "materi" tanpa pilihan
          (tab Kehadiran tidak pernah ada baginya, bukan cuma disembunyikan). */}
      {!adalahGuru && (
        <div className="mb-5 flex gap-2 border-b border-border">
          {(
            [
              ['kehadiran', 'Kehadiran'],
              ['materi', 'Pencapaian Materi'],
            ] as const
          ).map(([kunci, label]) => (
            <button
              key={kunci}
              type="button"
              onClick={() => setTab(kunci)}
              className={`cursor-pointer border-b-2 px-1 pb-2.5 text-[14px] font-bold transition-colors duration-150 ${
                tab === kunci ? 'border-brass text-text' : 'border-transparent text-text-dim'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'materi' && <PencapaianMateriView />}

      {tab === 'kehadiran' && (
        <>
      <p className="mb-6 text-[13px] text-text-dim">
        Rata-rata kehadiran per jenjang dan kelas ngaji. Angka jenjang adalah rata-rata dari
        rata-rata kelas, supaya kelas kecil tidak tenggelam oleh kelas besar.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={KELAS_LABEL}>Kelompok</label>
          <select
            className={KELAS_INPUT}
            value={kelompokId ?? ''}
            disabled={profile?.role === 'admin_kelompok'}
            onChange={(e) => setKelompokId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Pilih Kelompok --</option>
            {kelompokList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={KELAS_LABEL}>Bulan</label>
          <select
            className={KELAS_INPUT}
            value={bulan}
            onChange={(e) => setBulan(Number(e.target.value))}
          >
            {NAMA_BULAN.map((b, i) => (
              <option key={b} value={i + 1}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={KELAS_LABEL}>Tahun</label>
          <input
            type="number"
            className={KELAS_INPUT}
            value={tahun}
            onChange={(e) => setTahun(Number(e.target.value))}
          />
        </div>
      </div>

      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Menghitung...</p>}
      {!loading && !kelompokId && (
        <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>
      )}
      {!loading && kelompokId && totalCatatan === 0 && (
        <p className="text-[13px] text-text-dim">
          Tidak ada catatan absensi pada {NAMA_BULAN[bulan - 1]} {tahun} untuk kelompok ini.
        </p>
      )}

      {!loading &&
        totalCatatan > 0 &&
        hasil.map((j) => {
          const kat = kategori(j.avgPct);
          return (
            <div
              key={j.kunci}
              className="mb-4 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="text-[16px] font-bold text-text">
                  {j.label}
                  {j.luarDaftar && (
                    <span className="ml-2 rounded-[var(--radius)] border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-semibold text-text-dim">
                      di luar laporan baku
                    </span>
                  )}
                </div>
                {j.adaData ? (
                  <div className="text-right">
                    <div className={'text-[24px] font-bold ' + kat.kelasWarna}>
                      {j.avgPct.toFixed(1)}%
                    </div>
                    <div className={'text-[12px] font-semibold ' + kat.kelasWarna}>{kat.label}</div>
                  </div>
                ) : (
                  /* Placeholder '—' BUKAN 0: tidak ada data berbeda dari
                     kehadiran nol, dan menampilkan 0% akan terbaca sebagai
                     "semua tidak hadir". */
                  <div className="text-[24px] font-bold text-text-faint">—</div>
                )}
              </div>
              <div className="mt-1 text-[12px] text-text-dim">
                {j.jumlahSantri} santri &middot; {j.jumlahKelas} kelas ngaji
              </div>

              {j.kelasList.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[12px]">
                    <thead className="border-b border-border">
                      <tr>
                        {['Kelas Ngaji', 'Santri', 'Kehadiran', 'Kategori'].map((h) => (
                          <th key={h} className="px-2 py-2 font-semibold text-text-dim uppercase">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {j.kelasList.map((k) => {
                        const kk = kategori(k.avgPct);
                        return (
                          <tr key={k.kelas} className="hover:bg-panel-2">
                            <td className="border-b border-border px-2 py-2 text-text">{k.kelas}</td>
                            <td className="border-b border-border px-2 py-2 text-text">
                              {k.jumlahSantri}
                            </td>
                            <td className="border-b border-border px-2 py-2 text-text">
                              {k.adaData ? k.avgPct.toFixed(1) + '%' : '—'}
                            </td>
                            <td
                              className={
                                'border-b border-border px-2 py-2 font-semibold ' +
                                (k.adaData ? kk.kelasWarna : 'text-text-faint')
                              }
                            >
                              {k.adaData ? kk.label : 'Belum ada data'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

      {kelompokId && totalCatatan > 0 && (
        <div className="mt-8">
          <MatriksKehadiran kelompokId={kelompokId} tahun={tahun} bulan={bulan} />
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default function MonitoringPage() {
  return (
    <RequireAuth>
      <MonitoringContent />
    </RequireAuth>
  );
}
