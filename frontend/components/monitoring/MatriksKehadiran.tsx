'use client';

/* Matriks kehadiran santri × tanggal — padanan
   serverGetKehadiranGenerusMatrix dan serverGetKehadiranGenerusDetailList
   (Modul_Monitoring.gs:245-340).

   Bentuknya sengaja tetap tabel padat: satu huruf per sel. Untuk 69 santri
   × 22 hari, apa pun selain itu (kartu, grafik) menjadi tidak terbaca.
   Warna dipakai sebagai penegas, TIDAK sendirian — hurufnya tetap ada, jadi
   pembaca yang tidak membedakan warna tetap bisa membacanya.

   Kolom tanggal mengikuti app lama: hanya HARI KERJA (Senin-Jumat). Akhir
   pekan dibuang karena tidak pernah ada KBM, dan memasukkannya membuat
   tabel 40% lebih lebar tanpa satu pun isi.

   Dikelompokkan per kelas kalau santri sudah ditempatkan; kalau belum,
   tampil sebagai satu daftar dan halaman mengatakannya. */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Santri = { id: number; nama: string; kelas_id: number | null };
type Absensi = { santri_id: number; tanggal: string; status: string };
type Kelas = { id: number; nama: string; kategori_kbm: { nama: string } | { nama: string }[] | null };

const HURUF: Record<string, { huruf: string; kelas: string; label: string }> = {
  hadir: { huruf: 'H', kelas: 'text-sage', label: 'Hadir' },
  izin: { huruf: 'I', kelas: 'text-brass', label: 'Izin' },
  sakit: { huruf: 'S', kelas: 'text-brass', label: 'Sakit' },
  alpa: { huruf: 'A', kelas: 'text-red', label: 'Alpa' },
};

async function ambilAbsensiRentang(
  kelompokId: number,
  dari: string,
  sampai: string
): Promise<Absensi[]> {
  /* PostgREST memotong diam-diam di 1000 baris; satu bulan untuk satu
     kelompok besar sudah melewatinya (69 santri × 22 hari ≈ 1.500). */
  const UKURAN = 1000;
  const semua: Absensi[] = [];
  for (let dari_i = 0; ; dari_i += UKURAN) {
    const { data, error } = await supabase
      .from('absensi')
      .select('santri_id, tanggal, status')
      .eq('kelompok_id', kelompokId)
      .gte('tanggal', dari)
      .lte('tanggal', sampai)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(dari_i, dari_i + UKURAN - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Absensi[];
    semua.push(...batch);
    if (batch.length < UKURAN) break;
  }
  return semua;
}

export default function MatriksKehadiran({
  kelompokId,
  tahun,
  bulan,
}: {
  kelompokId: number;
  tahun: number;
  bulan: number;
}) {
  const [santri, setSantri] = useState<Santri[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [absensi, setAbsensi] = useState<Absensi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tanggalKerja = useMemo(() => {
    const hariTerakhir = new Date(tahun, bulan, 0).getDate();
    const daftar: string[] = [];
    for (let d = 1; d <= hariTerakhir; d++) {
      const hari = new Date(tahun, bulan - 1, d).getDay();
      if (hari !== 0 && hari !== 6) {
        daftar.push(`${tahun}-${String(bulan).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
    return daftar;
  }, [tahun, bulan]);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const awal = `${tahun}-${String(bulan).padStart(2, '0')}-01`;
      const akhirHari = new Date(tahun, bulan, 0).getDate();
      const akhir = `${tahun}-${String(bulan).padStart(2, '0')}-${String(akhirHari).padStart(2, '0')}`;

      /* Santri yang pindah/nonaktif SETELAH bulan ini dimulai tetap ikut --
         deleted_at dipakai sbg "sejak kapan tidak aktif" (migrasi
         20260821130000), jadi matriks bulan yang sudah lewat tetap
         menunjukkan riwayatnya walau sekarang dia sudah tidak aktif. */
      const [{ data: dSantri, error: e1 }, { data: dKelas }] = await Promise.all([
        supabase
          .from('santri')
          .select('id, nama, kelas_id')
          .eq('kelompok_id', kelompokId)
          .or(`deleted_at.is.null,deleted_at.gt.${awal}`)
          .order('nama'),
        supabase
          .from('kelas')
          .select('id, nama, kategori_kbm(nama)')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null)
          .order('nama'),
      ]);
      if (e1) throw new Error(e1.message);
      setSantri((dSantri ?? []) as unknown as Santri[]);
      setKelasList((dKelas ?? []) as unknown as Kelas[]);
      setAbsensi(await ambilAbsensiRentang(kelompokId, awal, akhir));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat matriks kehadiran.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, bulan]);

  useEffect(() => {
    muat();
  }, [muat]);

  const status = useMemo(() => {
    const peta = new Map<string, string>();
    for (const a of absensi) peta.set(`${a.santri_id}|${a.tanggal}`, a.status);
    return peta;
  }, [absensi]);


  /* Kehadiran per KATEGORI kelas — padanan
     serverGetKehadiranGenerusKategori (Modul_Monitoring.gs:146).
     Kategori diambil dari kelas yang diikuti santri, bukan dari jenjangnya:
     itulah pembedaan yang dipakai app lama untuk laporan ini. Kalau santri
     belum ditempatkan di kelas, ia tidak punya kategori dan memang tidak
     dihitung di sini — jumlahnya dilaporkan terpisah supaya tidak terlihat
     seperti data hilang. */
  const perKategori = useMemo(() => {
    const namaKategori = (k: Kelas) => {
      const v = k.kategori_kbm;
      const b = Array.isArray(v) ? v[0] : v;
      return b?.nama ?? 'Tanpa kategori';
    };
    const peta = new Map<string, { hadir: number; total: number; santri: number }>();
    for (const k of kelasList) {
      const kat = namaKategori(k);
      const anggota = santri.filter((s) => s.kelas_id === k.id);
      const isi = peta.get(kat) ?? { hadir: 0, total: 0, santri: 0 };
      isi.santri += anggota.length;
      for (const s of anggota) {
        for (const t of tanggalKerja) {
          const st = status.get(`${s.id}|${t}`);
          if (!st) continue;
          isi.total += 1;
          if (st === 'hadir') isi.hadir += 1;
        }
      }
      peta.set(kat, isi);
    }
    return [...peta.entries()]
      .filter(([, v]) => v.santri > 0)
      .map(([kategori, v]) => ({
        kategori,
        santri: v.santri,
        persen: v.total ? Math.round((v.hadir / v.total) * 100) : null,
      }));
  }, [kelasList, santri, status, tanggalKerja]);
  /* Dikelompokkan per kelas; santri tanpa kelas masuk kelompok terakhir
     supaya tetap terlihat, bukan hilang diam-diam. */
  const kelompokBaris = useMemo(() => {
    const hasil: { judul: string; anggota: Santri[] }[] = [];
    for (const k of kelasList) {
      const anggota = santri.filter((s) => s.kelas_id === k.id);
      if (anggota.length) hasil.push({ judul: k.nama, anggota });
    }
    const tanpaKelas = santri.filter((s) => s.kelas_id == null);
    if (tanpaKelas.length) hasil.push({ judul: 'Belum ditempatkan di kelas', anggota: tanpaKelas });
    return hasil;
  }, [santri, kelasList]);

  if (loading) return <p className="text-[13px] text-text-dim">Memuat matriks...</p>;
  if (error) return <p className="text-[13px] text-red">{error}</p>;
  if (santri.length === 0)
    return <p className="text-[13px] text-text-dim">Belum ada santri di kelompok ini.</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div className="text-[15px] font-bold text-text">Detail Kehadiran</div>
        <div className="flex flex-wrap gap-3 text-[11px] text-text-dim">
          {Object.values(HURUF).map((h) => (
            <span key={h.huruf}>
              <span className={'font-bold ' + h.kelas}>{h.huruf}</span> {h.label}
            </span>
          ))}
          <span>
            <span className="font-bold text-text-faint">·</span> belum diinput
          </span>
        </div>
      </div>
      <p className="mb-4 text-[11px] text-text-faint">
        Hanya hari kerja (Senin–Jumat) yang ditampilkan; akhir pekan tidak pernah ada KBM.
      </p>

      {perKategori.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {perKategori.map((k) => (
            <div key={k.kategori} className="rounded-card border border-border bg-panel-2 px-4 py-2">
              <div className="text-[16px] font-bold text-text">
                {k.persen != null ? k.persen + '%' : '—'}
              </div>
              <div className="text-[11px] text-text-dim">
                {k.kategori} · {k.santri} santri
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
        <table className="border-collapse text-left text-[11px]">
          <thead className="border-b border-border bg-panel-2">
            <tr>
              <th className="sticky left-0 z-10 min-w-[180px] bg-panel-2 px-3 py-2 font-semibold text-text-dim uppercase">
                Nama
              </th>
              {tanggalKerja.map((t) => (
                <th key={t} className="px-1.5 py-2 text-center font-semibold text-text-dim">
                  {t.slice(8)}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-semibold text-text-dim uppercase">%</th>
            </tr>
          </thead>
          <tbody>
            {kelompokBaris.map((grup) => (
              <Fragment key={grup.judul}>
                <tr>
                  <td
                    colSpan={tanggalKerja.length + 2}
                    className="border-b border-border bg-panel-2 px-3 py-1.5 text-[11px] font-bold text-text"
                  >
                    {grup.judul} ({grup.anggota.length})
                  </td>
                </tr>
                {grup.anggota.map((s) => {
                  const isi = tanggalKerja.map((t) => status.get(`${s.id}|${t}`));
                  const adaData = isi.filter(Boolean).length;
                  const hadir = isi.filter((x) => x === 'hadir').length;
                  return (
                    <tr key={s.id} className="hover:bg-panel-2">
                      <td className="sticky left-0 z-10 border-b border-border bg-panel px-3 py-1.5 text-text">
                        {s.nama}
                      </td>
                      {isi.map((st, i) => (
                        <td
                          key={tanggalKerja[i]}
                          className={
                            'border-b border-border px-1.5 py-1.5 text-center font-bold ' +
                            (st ? HURUF[st]?.kelas : 'text-text-faint')
                          }
                          title={`${s.nama} · ${tanggalKerja[i]} · ${st ? (HURUF[st]?.label ?? st) : 'belum diinput'}`}
                        >
                          {st ? (HURUF[st]?.huruf ?? '?') : '·'}
                        </td>
                      ))}
                      <td className="border-b border-border px-2 py-1.5 text-center font-semibold text-text">
                        {adaData ? Math.round((hadir / adaData) * 100) + '%' : '—'}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
