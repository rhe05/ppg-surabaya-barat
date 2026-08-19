'use client';

/* Riwayat Kehadiran (guru mobile) — matrix santri × tanggal 1 bulan,
   read-only. Dibuka dari popup "Kehadiran" > Riwayat Kehadiran
   (components/dashboard/KehadiranChooser.tsx).

   Logika disalin dari serverGetRiwayatKehadiranGuru (Modul_InputAbsen.gs:
   1592-1652), bukan dikarang:
   - Kolom tanggal HANYA hari kerja (Senin-Jumat) dalam bulan itu — Sabtu/
     Minggu tidak pernah punya kolom, bukan cuma kosong.
   - Hari Aktif = jumlah tanggal berbeda yang punya absensi APAPUN
     statusnya, sama seperti definisi di dashboard (GuruDashboard.tsx).
   - Warna badge sengaja BUKAN 4 warna berbeda seperti kotak statistik
     dashboard: matrix ini memakai palet 3-warna app lama
     (IA_RIWAYAT_STATUS_WARNA_) — izin & sakit SAMA-SAMA kuning, cuma hadir
     (hijau tua) dan alpa (merah) yang beda sendiri. Ini quirk app lama yang
     sengaja dipertahankan, bukan salah ketik.

   Yang disederhanakan dari app lama (dicatat, bukan disembunyikan):
   filter Bulan/Tahun & pilih kelas di sini berupa <select> biasa yang
   langsung terlihat, bukan panel tersembunyi di balik tombol "Bulan -
   Tahun". Popup pilih-kelas kartu besar (dipakai saat guru pegang >1
   kelas) juga disederhanakan jadi <select> yang sama. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

type Status = 'hadir' | 'izin' | 'sakit' | 'alpa';

type Kelas = { id: number; nama: string };
type Santri = { id: number; nama: string; nama_panggilan: string | null };

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
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

// IA_RIWAYAT_STATUS_HURUF_ / IA_RIWAYAT_STATUS_WARNA_ / IA_RIWAYAT_STATUS_LABEL_
const BADGE: Record<Status, { huruf: string; warna: string; label: string }> = {
  hadir: { huruf: 'H', warna: '#15803d', label: 'Hadir' },
  izin: { huruf: 'I', warna: '#a16207', label: 'Izin' },
  sakit: { huruf: 'S', warna: '#a16207', label: 'Sakit' },
  alpa: { huruf: 'A', warna: '#dc2626', label: 'Alpa' },
};

function tanggalKerjaBulan(tahun: number, bulan: number): string[] {
  const jumlahHari = new Date(tahun, bulan, 0).getDate();
  const dua = (n: number) => String(n).padStart(2, '0');
  const hasil: string[] = [];
  for (let d = 1; d <= jumlahHari; d++) {
    const dow = new Date(tahun, bulan - 1, d).getDay();
    if (dow !== 0 && dow !== 6) hasil.push(`${tahun}-${dua(bulan)}-${dua(d)}`);
  }
  return hasil;
}

const KELAS_SELECT =
  'rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[13px] font-semibold ' +
  'text-text focus:border-brass focus:outline-none';

function RiwayatKehadiranContent() {
  const { profile } = useAuth();
  const router = useRouter();
  const guruId = profile?.guru_id ?? null;

  const sekarang = new Date();
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | null>(null);
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());

  const [baris, setBaris] = useState<{ santri: Santri; statusByDate: Record<string, Status> }[]>(
    []
  );
  const [hariAktif, setHariAktif] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dibatalkan = false;
    async function muatKelas() {
      if (guruId == null) {
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('kelas')
        .select('id, nama')
        .eq('guru_id', guruId)
        .is('deleted_at', null)
        .order('nama');
      if (dibatalkan) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setKelasList(data ?? []);
      if ((data ?? []).length > 0) setKelasId((sebelum) => sebelum ?? data![0].id);
      else setLoading(false);
    }
    muatKelas();
    return () => {
      dibatalkan = true;
    };
  }, [guruId]);

  const muatMatrix = useCallback(async () => {
    if (kelasId == null) return;
    setLoading(true);
    setError(null);
    try {
      const { data: dataSantri, error: errSantri } = await supabase
        .from('santri')
        .select('id, nama, nama_panggilan')
        .eq('kelas_id', kelasId)
        .is('deleted_at', null);
      if (errSantri) throw new Error(errSantri.message);

      const santriList = (dataSantri ?? []).slice().sort((a, b) => {
        const na = (a.nama_panggilan || a.nama).trim();
        const nb = (b.nama_panggilan || b.nama).trim();
        return na.localeCompare(nb, 'id');
      });
      const santriIds = santriList.map((s) => s.id);

      const dua = (n: number) => String(n).padStart(2, '0');
      const awal = `${tahun}-${dua(bulan)}-01`;
      const akhirTanggal = new Date(tahun, bulan, 0).getDate();
      const akhir = `${tahun}-${dua(bulan)}-${dua(akhirTanggal)}`;

      const statusMap: Record<number, Record<string, Status>> = {};
      const tanggalDiisi = new Set<string>();

      if (santriIds.length > 0) {
        const UKURAN_HALAMAN = 1000;
        for (let dari = 0; ; dari += UKURAN_HALAMAN) {
          const { data, error: errAbsensi } = await supabase
            .from('absensi')
            .select('id, santri_id, tanggal, status')
            .in('santri_id', santriIds)
            .gte('tanggal', awal)
            .lte('tanggal', akhir)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(dari, dari + UKURAN_HALAMAN - 1);
          if (errAbsensi) throw new Error(errAbsensi.message);

          const batch = data ?? [];
          batch.forEach((b) => {
            if (!statusMap[b.santri_id]) statusMap[b.santri_id] = {};
            statusMap[b.santri_id][b.tanggal] = b.status as Status;
            tanggalDiisi.add(b.tanggal);
          });
          if (batch.length < UKURAN_HALAMAN) break;
        }
      }

      setBaris(
        santriList.map((s) => ({ santri: s, statusByDate: statusMap[s.id] ?? {} }))
      );
      setHariAktif(tanggalDiisi.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat riwayat');
    } finally {
      setLoading(false);
    }
  }, [kelasId, bulan, tahun]);

  useEffect(() => {
    muatMatrix();
  }, [muatMatrix]);

  const tanggalList = tanggalKerjaBulan(tahun, bulan);
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];

  if (guruId == null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6">
        <p className="text-[13.5px] text-text-dim">
          Fitur ini khusus untuk akun guru yang tertaut ke data guru.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <div className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-border bg-panel px-[18px] py-3.5 shadow-[var(--shadow-subtle)]">
        <button
          type="button"
          aria-label="Kembali"
          onClick={() => router.push('/dashboard')}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="m-0 flex-1 text-[15px] font-bold text-text">Riwayat Kehadiran</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          {/* .ia-riwayat-hariaktif — warna teal, beda dari tombol filter */}
          <span className="text-[13.5px] font-bold text-teal">Hari Aktif - {hariAktif} Hari</span>

          <div className="flex flex-wrap gap-2">
            {kelasList.length > 1 && (
              <select
                value={kelasId ?? ''}
                onChange={(e) => setKelasId(Number(e.target.value))}
                className={KELAS_SELECT}
              >
                {kelasList.map((k) => (
                  <option key={k.id} value={k.id}>
                    Kelas {k.nama}
                  </option>
                ))}
              </select>
            )}
            <select
              value={bulan}
              onChange={(e) => setBulan(Number(e.target.value))}
              className={KELAS_SELECT}
            >
              {NAMA_BULAN.map((nm, idx) => (
                <option key={nm} value={idx + 1}>
                  {nm}
                </option>
              ))}
            </select>
            <select
              value={tahun}
              onChange={(e) => setTahun(Number(e.target.value))}
              className={KELAS_SELECT}
            >
              {tahunPilihan.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
            {error}
          </p>
        )}

        {loading ? (
          <p className="py-8 text-center text-[13px] text-text-faint">Memuat...</p>
        ) : kelasList.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-faint">
            Anda belum mengampu kelas apa pun.
          </p>
        ) : baris.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-faint">
            Belum ada santri di kelas ini.
          </p>
        ) : (
          /* .kg-matrix-scroll + .kg-matrix-table.ia-riwayat-table
             (Style_Main.html:3635-3745, 6695+) — kolom nama sticky kiri,
             sel status = badge bulat warna, garis tipis antar kolom. */
          <div className="max-h-[70vh] overflow-auto rounded-[var(--radius)] border border-border">
            <table className="border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-[4] min-w-[84px] whitespace-nowrap border-r border-[rgba(148,163,184,0.35)] border-b border-border bg-panel-2 px-2.5 py-2 text-center text-[11px] font-bold text-text-faint">
                    Nama Santri
                  </th>
                  {tanggalList.map((tgl) => {
                    const d = new Date(tgl + 'T00:00:00');
                    return (
                      <th
                        key={tgl}
                        className="sticky top-0 z-[3] min-w-[44px] whitespace-nowrap border-r border-[rgba(148,163,184,0.35)] border-b border-border bg-panel-2 px-2.5 py-2 text-center text-[11px] font-bold text-text-faint"
                      >
                        {d.getDate()}
                        <span className="mt-0.5 block text-[9px] font-semibold text-text-faint">
                          {HARI_PENDEK[d.getDay()]}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {baris.map((r, idx) => (
                  <tr
                    key={r.santri.id}
                    className={idx % 2 === 1 ? 'bg-panel-2/40' : undefined}
                  >
                    <td className="sticky left-0 z-[1] min-w-[84px] whitespace-nowrap border-r border-[rgba(148,163,184,0.35)] bg-panel px-2.5 py-2 text-left text-[13px] font-semibold text-text">
                      {(r.santri.nama_panggilan || r.santri.nama).trim()}
                    </td>
                    {tanggalList.map((tgl) => {
                      const status = r.statusByDate[tgl];
                      return (
                        <td
                          key={tgl}
                          className="whitespace-nowrap border-r border-[rgba(148,163,184,0.35)] px-2.5 py-2 text-center"
                        >
                          {status ? (
                            <span
                              title={BADGE[status].label}
                              className="inline-flex h-[22px] w-6 items-center justify-center rounded-[6px] text-[11px] font-extrabold text-white"
                              style={{ background: BADGE[status].warna }}
                            >
                              {BADGE[status].huruf}
                            </span>
                          ) : (
                            <span className="text-text-faint">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default function RiwayatKehadiranPage() {
  return (
    <RequireAuth>
      <RiwayatKehadiranContent />
    </RequireAuth>
  );
}
