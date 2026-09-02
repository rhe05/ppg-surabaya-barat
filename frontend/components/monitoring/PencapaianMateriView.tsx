'use client';

/* Monitoring > Pencapaian Materi -- SATU layar yang memuat KEDUA sisi
   fitur Pengulangan (disepakati owner 2026-09-02, lalu diminta owner
   2026-09-02 sore utk digabung ke sini): per KELAS (berapa kali satu
   surat diulang klasikal) dan per SANTRI (berapa kali santri itu hadir
   saat surat itu diulang, dari total pengulangan kelasnya).

   RIWAYAT AWAL, supaya tidak terulang: putaran pertama menaruh sisi
   per-kelas sbg kartu di Riwayat Pembelajaran dan sisi per-santri di
   sini, dgn alasan "layar kerja vs layar keputusan". Owner MEMBATALKAN
   pemisahan itu: keduanya sekarang di SINI, satu fitur berdiri sendiri,
   dibuka dari menu utama (GuruBottomNav > Lainnya > "Monitoring") --
   BUKAN lewat tautan tersembunyi di layar lain. Riwayat Pembelajaran
   tidak menyinggung fitur ini sama sekali lagi.

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
import {
  muatKelasGuru,
  muatPengulanganKelas,
  muatPengulanganSantri,
  type PengulanganKelas,
  type PengulanganSantri,
  type KelasJurnal,
} from '@/lib/dataGuru';
import { rentangPeriode, type KunciPeriode } from '@/lib/periodeAkademik';

type KelasRingkas = { id: number; nama: string };
type Kelompok = { id: number; nama: string };

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

function tanggalPendek(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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

  /* ── Periode: acuan "sekarang" dihitung sekali -- layar ini SELALU
     periode BERJALAN, bukan bisa ditengok ke bulan lampau (perluasan
     terpisah kalau nanti dibutuhkan). SATU pemilih periode utk KEDUA
     sisi (per kelas & per santri) -- dulu masing-masing punya pemilih
     sendiri di dua layar berbeda, sekarang satu layar wajib satu sumber
     kebenaran, kalau tidak keduanya bisa menampilkan periode yang
     berbeda tanpa guru sadar. */
  const [kunciPeriode, setKunciPeriode] = useState<KunciPeriode>('bulan');
  const [acuan] = useState(() => {
    const d = new Date();
    return { tahun: d.getFullYear(), bulan: d.getMonth() + 1 };
  });
  const periode = useMemo(
    () => rentangPeriode(kunciPeriode, acuan.tahun, acuan.bulan),
    [kunciPeriode, acuan]
  );

  /* ── Data per KELAS ── */
  const [barisKelas, setBarisKelas] = useState<PengulanganKelas[]>([]);
  const [loadingKelas, setLoadingKelas] = useState(false);
  const [errorKelas, setErrorKelas] = useState<string | null>(null);

  useEffect(() => {
    if (kelasId === '') {
      setBarisKelas([]);
      return;
    }
    let batal = false;
    setLoadingKelas(true);
    setErrorKelas(null);
    muatPengulanganKelas(kelasId, periode.awal, periode.akhir)
      .then((d) => {
        if (!batal) setBarisKelas(d);
      })
      .catch((e) => {
        if (!batal) setErrorKelas(e instanceof Error ? e.message : 'Gagal memuat data.');
      })
      .finally(() => {
        if (!batal) setLoadingKelas(false);
      });
    return () => {
      batal = true;
    };
  }, [kelasId, periode.awal, periode.akhir]);

  /* ── Data per SANTRI ── */
  const [barisSantri, setBarisSantri] = useState<PengulanganSantri[]>([]);
  const [loadingSantri, setLoadingSantri] = useState(false);
  const [errorSantri, setErrorSantri] = useState<string | null>(null);

  useEffect(() => {
    if (kelasId === '') {
      setBarisSantri([]);
      return;
    }
    let batal = false;
    setLoadingSantri(true);
    setErrorSantri(null);
    muatPengulanganSantri(kelasId, periode.awal, periode.akhir)
      .then((d) => {
        if (!batal) setBarisSantri(d);
      })
      .catch((e) => {
        if (!batal) setErrorSantri(e instanceof Error ? e.message : 'Gagal memuat data.');
      })
      .finally(() => {
        if (!batal) setLoadingSantri(false);
      });
    return () => {
      batal = true;
    };
  }, [kelasId, periode.awal, periode.akhir]);

  /* RPC sudah mengurutkan per (nama_santri, nama_surat) -- dikelompokkan
     ulang di sini murni utk tampilan (satu kartu per santri). */
  const perSantri = useMemo(() => {
    const peta = new Map<number, { nama: string; baris: PengulanganSantri[] }>();
    for (const b of barisSantri) {
      const s = peta.get(b.santri_id) ?? { nama: b.nama_santri, baris: [] };
      s.baris.push(b);
      peta.set(b.santri_id, s);
    }
    return [...peta.entries()].map(([id, v]) => ({ santriId: id, ...v }));
  }, [barisSantri]);

  return (
    <div>
      <p className="mb-4 text-[13px] text-text-dim">
        Berapa kali satu surat diulang klasikal, dan berapa kali tiap santri HADIR saat itu
        terjadi. Murni informasi -- tidak ada nilai lulus/tidak lulus.
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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5">
          <div className="label-mikro">{periode.label}</div>
          <PenyaringPeriode kunci={kunciPeriode} onUbah={setKunciPeriode} />
        </div>
      )}

      {kelasId === '' && (
        <p className="text-[13px] text-text-dim">
          {adalahGuru ? 'Memuat kelas...' : 'Pilih kelompok lalu kelas dulu.'}
        </p>
      )}

      {kelasId !== '' && (
        <>
          {/* ── Sisi PER KELAS ── */}
          <div className="label-mikro mb-2">Per Kelas</div>
          {loadingKelas && <Skeleton className="mb-5 h-[52px] w-full" />}
          {errorKelas && <p className="mb-5 text-[13px] text-red">{errorKelas}</p>}
          {!loadingKelas && !errorKelas && (
            <div className="kartu-premium mb-5 overflow-hidden">
              {barisKelas.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-text-dim">
                  Belum ada materi Klasikal yang disampaikan pada periode ini.
                </p>
              ) : (
                barisKelas.map((b) => (
                  <div
                    key={b.nama_surat}
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-[13px] font-semibold text-text">
                      {b.nama_surat}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <span className="angka-metrik text-[15px] text-sage">{b.jumlah}×</span>
                      <span className="text-[11px] whitespace-nowrap text-text-faint">
                        terakhir {tanggalPendek(b.terakhir)}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Sisi PER SANTRI ── */}
          <div className="label-mikro mb-2">Per Santri</div>
          {loadingSantri && (
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-[68px] w-full" />
              <Skeleton className="h-[68px] w-full" />
            </div>
          )}
          {errorSantri && <p className="text-[13px] text-red">{errorSantri}</p>}
          {!loadingSantri && !errorSantri && perSantri.length === 0 && (
            <p className="text-[13px] text-text-dim">
              Belum ada materi Klasikal yang disampaikan pada periode ini.
            </p>
          )}
          {!loadingSantri &&
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
        </>
      )}
    </div>
  );
}
