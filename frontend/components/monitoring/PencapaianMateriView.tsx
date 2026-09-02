'use client';

/* Monitoring > Pencapaian Materi -- sisi PER SANTRI dari fitur
   Pengulangan (disepakati owner 2026-09-02). Sisi per-kelas ada di kartu
   "Pengulangan Materi Klasikal" pada Riwayat Pembelajaran
   (KartuPengulanganKelas.tsx) -- pemisahan ini disengaja: angka per
   kelas dipakai guru sambil bekerja (layar kerja hariannya), angka per
   santri dipakai utk MEMUTUSKAN siapa perlu diperhatikan (guru & admin
   kelompok, bukan admin_ppg saja) -- dua pekerjaan berbeda, dua tempat
   berbeda, sama spt Riwayat vs Monitoring Kehadiran yang sudah ada.

   Dipasang di halaman /monitoring yang SAMA dgn Monitoring Kehadiran
   (bukan route terpisah) supaya jadi SATU menu Monitoring ber-tab, bukan
   dua entri navigasi yang mirip -- lihat app/monitoring/page.tsx.

   Dua alur pemilihan kelas, tergantung peran:
   - guru: chip, persis pola Pelaksanaan/Riwayat Pembelajaran (kelas
     miliknya sendiri lewat singgahan bersama muatKelasGuru).
   - admin_kelompok/admin_desa/admin_ppg: dropdown Kelompok -> Kelas,
     pola yg SAMA PERSIS dgn Monitoring Kehadiran di file yang sama,
     supaya kedua tab terasa satu produk.

   Tidak ada ambang tercapai/belum -- murni informasi (diminta owner).
   Pembilang (jumlah_efektif) SELALU ditampilkan bersama penyebut
   (jumlah_kelas): "5/10", bukan cuma "5" -- tanpa penyebut, santri rajin
   di kelas yang jarang mengulang akan terlihat buruk tanpa konteks. */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import Skeleton from '@/components/ui/Skeleton';
import PenyaringPeriode from '@/components/jurnal/PenyaringPeriode';
import { muatKelasGuru, muatPengulanganSantri, type PengulanganSantri, type KelasJurnal } from '@/lib/dataGuru';
import { rentangPeriode, type KunciPeriode } from '@/lib/periodeAkademik';

type KelasRingkas = { id: number; nama: string };
type Kelompok = { id: number; nama: string };

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

export default function PencapaianMateriView() {
  const { profile } = useAuth();
  const adalahGuru = profile?.role === 'guru';

  /* ── Pemilihan kelas: guru vs admin ── */
  const [kelasGuru, setKelasGuru] = useState<KelasJurnal[]>([]);
  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [kelasAdmin, setKelasAdmin] = useState<KelasRingkas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  useEffect(() => {
    if (!adalahGuru || profile?.guru_id == null) return;
    muatKelasGuru(profile.guru_id).then((list) => {
      setKelasGuru(list);
      if (list.length === 1) setKelasId(list[0].id);
    });
  }, [adalahGuru, profile?.guru_id]);

  useEffect(() => {
    if (adalahGuru) return;
    supabase
      .from('kelompok')
      .select('id, nama')
      .order('nama')
      .then(({ data }) => setKelompokList(data ?? []));
  }, [adalahGuru]);

  useEffect(() => {
    if (adalahGuru || !kelompokId) {
      setKelasAdmin([]);
      return;
    }
    supabase
      .from('kelas')
      .select('id, nama')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => setKelasAdmin(data ?? []));
  }, [adalahGuru, kelompokId]);

  /* ── Periode: acuan "sekarang" dihitung sekali, sama spt kartu kelas
     di Riwayat Pembelajaran -- keduanya sengaja SELALU periode
     BERJALAN, bukan bisa ditengok ke bulan lampau (perluasan terpisah
     kalau nanti dibutuhkan). */
  const [kunciPeriode, setKunciPeriode] = useState<KunciPeriode>('bulan');
  const [acuan] = useState(() => {
    const d = new Date();
    return { tahun: d.getFullYear(), bulan: d.getMonth() + 1 };
  });
  const periode = useMemo(
    () => rentangPeriode(kunciPeriode, acuan.tahun, acuan.bulan),
    [kunciPeriode, acuan]
  );

  /* ── Data ── */
  const [baris, setBaris] = useState<PengulanganSantri[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kelasId === '') {
      setBaris([]);
      return;
    }
    let batal = false;
    setLoading(true);
    setError(null);
    muatPengulanganSantri(kelasId, periode.awal, periode.akhir)
      .then((d) => {
        if (!batal) setBaris(d);
      })
      .catch((e) => {
        if (!batal) setError(e instanceof Error ? e.message : 'Gagal memuat data.');
      })
      .finally(() => {
        if (!batal) setLoading(false);
      });
    return () => {
      batal = true;
    };
  }, [kelasId, periode.awal, periode.akhir]);

  /* RPC sudah mengurutkan per (nama_santri, nama_surat) -- dikelompokkan
     ulang di sini murni utk tampilan (satu kartu per santri). */
  const perSantri = useMemo(() => {
    const peta = new Map<number, { nama: string; baris: PengulanganSantri[] }>();
    for (const b of baris) {
      const s = peta.get(b.santri_id) ?? { nama: b.nama_santri, baris: [] };
      s.baris.push(b);
      peta.set(b.santri_id, s);
    }
    return [...peta.entries()].map(([id, v]) => ({ santriId: id, ...v }));
  }, [baris]);

  return (
    <div>
      <p className="mb-4 text-[13px] text-text-dim">
        Berapa kali tiap santri HADIR saat surat itu diulang klasikal, dari total pengulangan
        kelasnya. Murni informasi -- tidak ada nilai lulus/tidak lulus.
      </p>

      {!adalahGuru && (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>Kelompok</label>
            <select
              className={INPUT}
              value={kelompokId ?? ''}
              disabled={profile?.role === 'admin_kelompok'}
              onChange={(e) => {
                setKelompokId(e.target.value ? Number(e.target.value) : null);
                setKelasId('');
              }}
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
            <label className={LABEL}>Kelas</label>
            <select
              className={INPUT}
              value={kelasId}
              disabled={!kelompokId}
              onChange={(e) => setKelasId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">-- Pilih Kelas --</option>
              {kelasAdmin.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {adalahGuru && kelasGuru.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {kelasGuru.map((k) => {
            const aktif = k.id === kelasId;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKelasId(k.id)}
                className={`flex shrink-0 items-center rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 text-[13px] font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.96] ${
                  aktif ? 'border-indigo text-indigo' : 'border-border bg-panel text-text'
                }`}
                style={
                  aktif
                    ? {
                        background:
                          'linear-gradient(135deg, var(--indigo-lembut) 0%, var(--indigo-lembut-2) 100%)',
                      }
                    : undefined
                }
              >
                {k.nama}
              </button>
            );
          })}
        </div>
      )}

      {kelasId !== '' && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="label-mikro">{periode.label}</div>
          <PenyaringPeriode kunci={kunciPeriode} onUbah={setKunciPeriode} />
        </div>
      )}

      {kelasId === '' && (
        <p className="text-[13px] text-text-dim">
          {adalahGuru ? 'Memuat kelas...' : 'Pilih kelompok lalu kelas dulu.'}
        </p>
      )}

      {loading && (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-[68px] w-full" />
          <Skeleton className="h-[68px] w-full" />
        </div>
      )}
      {error && <p className="text-[13px] text-red">{error}</p>}
      {!loading && !error && kelasId !== '' && perSantri.length === 0 && (
        <p className="text-[13px] text-text-dim">
          Belum ada materi Klasikal yang disampaikan pada periode ini.
        </p>
      )}

      {!loading &&
        perSantri.map((s) => (
          <div key={s.santriId} className="kartu-premium mb-3 overflow-hidden">
            <div className="border-b border-border px-3.5 py-2.5">
              <span className="text-[15px] font-bold text-text">{s.nama}</span>
            </div>
            {s.baris.map((b) => (
              <div
                key={b.nama_surat}
                className="flex items-center justify-between border-b border-border px-3.5 py-2.5 last:border-b-0"
              >
                <span className="text-[13px] text-text">{b.nama_surat}</span>
                <span className="angka-metrik text-[13px] text-text-dim">
                  {b.jumlah_efektif}/{b.jumlah_kelas}
                </span>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
