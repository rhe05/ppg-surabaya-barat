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
   di kelas yang jarang mengulang akan terlihat buruk tanpa konteks.

   PUTARAN KETIGA (2026-09-02 sore, diminta owner): paragraf penjelasan
   di kepala layar dihapus (sudah jelas dari label "Pencapaian Materi" +
   header layar), dan pemilih periode (dulu 3 pil Bulan/Semester/Tahun
   Ajaran selalu terlihat) diganti ikon kalender + panel melayang, pola
   SAMA PERSIS Riwayat Pembelajaran -- satu bahasa filter di seluruh app.

   PUTARAN KEEMPAT (2026-09-02 malam, diminta owner): utk guru, ikon
   kalender + label periode dipindah SEJAJAR dgn judul "Monitoring"
   (bukan lagi baris sendiri di bawah chip kelas) -- prop `judul`
   dioper dari page.tsx KHUSUS guru, satu baris judul+chip di kiri &
   ikon+label di kanan, pola SAMA PERSIS Riwayat Pembelajaran. Admin
   TIDAK ikut berubah (judulnya tetap di page.tsx, ikon kalendernya
   tetap baris sendiri di bawah dropdown Kelompok/Kelas).

   PUTARAN KELIMA (2026-09-02 malam, diminta owner): sisi PER SANTRI
   SEMENTARA disembunyikan dari guru ("cukup tampilkan monitoring per
   kelas utk per santri sementara ini jangan di tampilkan di guru") --
   fetch-nya (`muatPengulanganSantri`, RPC 4-table join) ikut dilewati
   utk guru, bukan cuma UI-nya. Admin TETAP melihat kedua sisi seperti
   sebelumnya. "Sementara" -- jangan hapus kodenya, tinggal balikkan
   syarat `!adalahGuru` kalau owner minta ditampilkan lagi.

   PUTARAN KEENAM (2026-09-02 malam, diminta owner): pemilih periode
   Bulan/Semester/Tahun Ajaran DISEDERHANAKAN jadi Bulan+Tahun saja
   ("filter kalender cukup tampilkan bulan sama tahun saja, samakan dgn
   fitur yang lain, tidak usah semester dan tidak usah tahun ajaran") --
   panelnya sekarang dua SelectKustom (Bulan, Tahun), pola SAMA PERSIS
   RiwayatPembelajaranView, bukan lagi 3 pil KunciPeriode. `PenyaringPeriode.tsx`
   & `rentangSemester`/`rentangTahunAjaran`/`rentangPeriode`/`KunciPeriode`
   di lib/periodeAkademik.ts jadi tidak terpakai lagi di mana pun --
   DIHAPUS (bukan cuma disembunyikan; tidak ada sisa pemanggil lain,
   sudah dicek grep sebelum menghapus). `rentangBulan` TETAP dipakai. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import Skeleton from '@/components/ui/Skeleton';
import SelectKustom from '@/components/ui/SelectKustom';
import {
  muatKelasGuru,
  muatPengulanganKelas,
  muatPengulanganKelasDoa,
  muatPengulanganSantri,
  muatProtaKelompok,
  muatMateriBulan,
  namaKategori,
  type MateriJurnal,
  type PengulanganKelas,
  type PengulanganKelasDoa,
  type PengulanganSantri,
  type KelasJurnal,
  type ProtaBaris,
} from '@/lib/dataGuru';
import { rentangBulan } from '@/lib/periodeAkademik';
import { muatTilawatiRingkas, type TilawatiRingkas } from '@/lib/tilawati';
import {
  targetAsmaulHusnaDari,
  ringkasPengulanganDoa,
  kelasKurikulumSampai,
} from '@/lib/materiHafalanDoa';

type KelasRingkas = { id: number; nama: string };
type Kelompok = { id: number; nama: string };

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

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

export default function PencapaianMateriView({ judul }: { judul?: string } = {}) {
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

  /* ── Periode: Bulan+Tahun yang bisa diganti, pola SAMA PERSIS Riwayat
     Pembelajaran -- bawaannya bulan berjalan, tapi guru/admin bebas
     menengok bulan lain (bukan lagi terkunci ke "sekarang" spt saat
     masih ada opsi Semester/Tahun Ajaran). SATU pemilih utk KEDUA sisi
     (per kelas & per santri) -- satu layar wajib satu sumber kebenaran,
     kalau tidak keduanya bisa menampilkan bulan yang berbeda tanpa
     guru sadar. */
  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];
  const opsiBulan = NAMA_BULAN.map((nm, idx) => ({ value: String(idx + 1), label: nm }));
  const opsiTahun = tahunPilihan.map((y) => ({ value: String(y), label: String(y) }));
  const periode = useMemo(() => rentangBulan(tahun, bulan), [tahun, bulan]);

  /* Ikon kalender + panel melayang, pola SAMA PERSIS Riwayat Pembelajaran
     (RiwayatPembelajaranView.tsx) -- diminta owner 2026-09-02 sore, spy
     tidak ada dua bahasa filter berbeda dlm satu app (dulu di sini tiga
     pil Bulan/Semester/Tahun Ajaran selalu terlihat penuh satu baris). */
  const ikonKalenderRef = useRef<HTMLButtonElement>(null);
  const [pemilihPeriodeTerbuka, setPemilihPeriodeTerbuka] = useState(false);
  const [posisiPemilihPeriode, setPosisiPemilihPeriode] = useState<{
    top: number;
    right: number;
  } | null>(null);

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

  /* ── Data per KELAS -- Hafalan Do'a (diminta owner 2026-09-03,
     ditampilkan DI BAWAH Hafalan Surat). Pola & rentang periode SAMA
     PERSIS sisi surat di atas. ── */
  const [barisKelasDoa, setBarisKelasDoa] = useState<PengulanganKelasDoa[]>([]);
  const [loadingKelasDoa, setLoadingKelasDoa] = useState(false);
  const [errorKelasDoa, setErrorKelasDoa] = useState<string | null>(null);

  useEffect(() => {
    if (kelasId === '') {
      setBarisKelasDoa([]);
      return;
    }
    let batal = false;
    setLoadingKelasDoa(true);
    setErrorKelasDoa(null);
    muatPengulanganKelasDoa(kelasId, periode.awal, periode.akhir)
      .then((d) => {
        if (!batal) setBarisKelasDoa(d);
      })
      .catch((e) => {
        if (!batal) setErrorKelasDoa(e instanceof Error ? e.message : 'Gagal memuat data.');
      })
      .finally(() => {
        if (!batal) setLoadingKelasDoa(false);
      });
    return () => {
      batal = true;
    };
  }, [kelasId, periode.awal, periode.akhir]);

  /* ── Tilawati "Naik" per santri (2026-09-03, diminta owner) --
     laporan otomatis dari kartu "Tilawati" di Pelaksanaan. Tampil utk
     guru & admin (beda dari sisi Per Santri Hafalan Surat yang masih
     admin-only). ── */
  const [tilawatiRingkas, setTilawatiRingkas] = useState<TilawatiRingkas[]>([]);
  const [loadingTilawati, setLoadingTilawati] = useState(false);
  const [errorTilawati, setErrorTilawati] = useState<string | null>(null);
  useEffect(() => {
    if (kelasId === '') {
      setTilawatiRingkas([]);
      return;
    }
    let batal = false;
    setLoadingTilawati(true);
    setErrorTilawati(null);
    muatTilawatiRingkas(kelasId, periode.awal, periode.akhir)
      .then((d) => {
        if (!batal) setTilawatiRingkas(d);
      })
      .catch((e) => {
        if (!batal) setErrorTilawati(e instanceof Error ? e.message : 'Gagal memuat data.');
      })
      .finally(() => {
        if (!batal) setLoadingTilawati(false);
      });
    return () => {
      batal = true;
    };
  }, [kelasId, periode.awal, periode.akhir]);

  /* ── Peraga Tilawati (2026-09-03, diminta owner) -- materi ngaji
     ber-judul "Baca Huruf Al-Qur'an"/"Peraga Tilawati" yg disampaikan
     pada periode, dihitung pengulangannya spt Hafalan Surat. Sumber:
     jurnal_materi bulan ini (rentangBulan = 1 bulan penuh). ── */
  const [peragaMateri, setPeragaMateri] = useState<MateriJurnal[]>([]);
  const [loadingPeraga, setLoadingPeraga] = useState(false);
  useEffect(() => {
    if (kelasId === '') {
      setPeragaMateri([]);
      return;
    }
    let batal = false;
    setLoadingPeraga(true);
    muatMateriBulan(kelasId, tahun, bulan)
      .then((d) => {
        if (batal) return;
        setPeragaMateri(
          d.filter(
            (m) =>
              m.jenis !== 'klasikal' &&
              (/peraga tilawati/i.test(m.judul) || /^baca huruf al-?qur/i.test(m.judul.trim())),
          ),
        );
      })
      .finally(() => {
        if (!batal) setLoadingPeraga(false);
      });
    return () => {
      batal = true;
    };
  }, [kelasId, tahun, bulan]);

  /* Dikelompokkan per JILID, angkanya = berapa kali jilid itu KHATAM
     (diminta owner 2026-09-03: "5x adalah pengulangan khatamnya", bukan
     jumlah pertemuan). Satu khatam = ada pertemuan peraga jilid itu yg
     halamannya menyentuh halaman terakhir (44). Jilid yg sudah ada
     pertemuan tapi belum khatam tetap ditampilkan ("sedang berjalan"). */
  const PERAGA_HAL_AKHIR = 44;
  const peragaTampil = useMemo(() => {
    const peta = new Map<
      string,
      { jilid: string; khatam: number; terakhir: string; urut: number }
    >();
    for (const m of peragaMateri) {
      if (m.status !== 'disampaikan') continue;
      const mj = m.judul.match(/Jilid\s+(\d+)/i);
      const jilid = mj ? mj[1] : /paud/i.test(m.judul) ? 'Paud' : '—';
      let maxHal = 0;
      for (const h of m.judul.matchAll(/hal\s+(\d+)(?:\s*[–-]\s*(\d+))?/gi)) {
        maxHal = Math.max(maxHal, Number(h[1]), h[2] ? Number(h[2]) : 0);
      }
      const tgl = m.tanggal_disampaikan ?? '';
      const cur =
        peta.get(jilid) ??
        {
          jilid,
          khatam: 0,
          terakhir: '',
          urut: mj ? Number(mj[1]) : jilid === 'Paud' ? 0 : 99,
        };
      if (maxHal >= PERAGA_HAL_AKHIR) cur.khatam += 1;
      if (tgl > cur.terakhir) cur.terakhir = tgl;
      peta.set(jilid, cur);
    }
    return [...peta.values()].sort((a, b) => a.urut - b.urut);
  }, [peragaMateri]);

  /* ── Target Asmaul Husna dari Kurikulum (Prota) kelas ini ──
     Diminta owner 2026-09-03: Asmaul Husna DIGABUNG jadi satu baris di
     Monitoring, dan satu klasikal cuma dihitung 1× kalau rentang yang
     disampaikan MENCAPAI target penuh kelas itu (mis. target 1-99,
     guru menyampaikan 1-99 -> 1×; guru cuma 1-20 -> tidak dihitung). */
  const [protaDoa, setProtaDoa] = useState<ProtaBaris[]>([]);
  useEffect(() => {
    if (!kelompokId) {
      setProtaDoa([]);
      return;
    }
    let batal = false;
    muatProtaKelompok(kelompokId, tahun)
      .then((rows) => {
        if (batal) return;
        setProtaDoa(
          rows.filter((r) => {
            const nm = (namaKategori(r.kategori_kbm) ?? '').toLowerCase();
            return nm.includes('hafalan do') && nm.includes('harian');
          }),
        );
      })
      .catch(() => {
        if (!batal) setProtaDoa([]);
      });
    return () => {
      batal = true;
    };
  }, [kelompokId, tahun]);

  const namaKelasAktif = useMemo(() => {
    if (kelasId === '') return '';
    const dariGuru = kelasGuru.find((k) => k.id === kelasId)?.nama;
    const dariAdmin = kelasAdmin.find((k) => k.id === kelasId)?.nama;
    return dariGuru ?? dariAdmin ?? '';
  }, [kelasId, kelasGuru, kelasAdmin]);

  /* Rentang target Asmaul Husna utk kelas terpilih: ambil baris Prota
     Hafalan Do'a milik kode kelas Kurikulum TERTINGGI yang relevan utk
     ruang ini yang PUNYA baris Asmaul Husna, gabung 2 semesternya. */
  const targetAsmaulHusna = useMemo<{ dari: number; sampai: number } | null>(() => {
    if (namaKelasAktif === '' || protaDoa.length === 0) return null;
    const urut = kelasKurikulumSampai(namaKelasAktif);
    const relevan = protaDoa
      .filter((b) => urut.includes(b.kelas ?? ''))
      .sort((a, b) => urut.indexOf(b.kelas ?? '') - urut.indexOf(a.kelas ?? '')); // tertinggi dulu
    for (const b of relevan) {
      const t = targetAsmaulHusnaDari(b.target, b.target2);
      if (t) return t;
    }
    return null;
  }, [namaKelasAktif, protaDoa]);

  /* Baris Hafalan Do'a yang ditampilkan: item non-Asmaul-Husna apa
     adanya; SEMUA baris Asmaul Husna diringkas jadi SATU -- jumlahnya =
     banyaknya klasikal yang rentangnya menutupi target penuh. */
  const barisKelasDoaTampil = useMemo<PengulanganKelasDoa[]>(
    () =>
      ringkasPengulanganDoa(barisKelasDoa, targetAsmaulHusna).map((b) => ({
        nama_doa: b.nama_doa,
        jumlah: b.jumlah,
        terakhir: b.terakhir,
      })),
    [barisKelasDoa, targetAsmaulHusna],
  );

  /* ── Data per SANTRI ── */
  const [barisSantri, setBarisSantri] = useState<PengulanganSantri[]>([]);
  const [loadingSantri, setLoadingSantri] = useState(false);
  const [errorSantri, setErrorSantri] = useState<string | null>(null);

  useEffect(() => {
    /* SEMENTARA disembunyikan dari guru (diminta owner 2026-09-02
       malam: "cukup tampilkan monitoring per kelas utk per santri
       sementara ini jangan di tampilkan di guru") -- fetch-nya ikut
       dilewati, bukan cuma UI-nya, supaya guru tidak diam-diam
       menanggung 4-table join RPC (jurnal_pengulangan_santri) utk data
       yang tidak pernah ia lihat. Admin TIDAK ikut disembunyikan. */
    if (adalahGuru || kelasId === '') {
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
  }, [adalahGuru, kelasId, periode.awal, periode.akhir]);

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

      {/* Guru: judul + chip kelas SEJAJAR dgn ikon kalender + label
          periode, satu baris -- pola SAMA PERSIS Riwayat Pembelajaran
          (diminta owner 2026-09-02 malam: "letakan ikon kalender dan
          info waktu ... sejajar dengan judul"). `judul` cuma dioper dari
          page.tsx utk guru; admin tetap pola lama (dropdown Kelompok/
          Kelas di atas, tanpa judul di sini -- judulnya di page.tsx). */}
      {adalahGuru && judul && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="pt-1.5 text-[17px] font-extrabold text-text">{judul}</div>
            {kelasGuru.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
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
          </div>
          {kelasId !== '' && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <button
                ref={ikonKalenderRef}
                type="button"
                aria-label="Pilih Periode"
                onClick={() => {
                  const rect = ikonKalenderRef.current?.getBoundingClientRect();
                  if (rect) {
                    setPosisiPemilihPeriode({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
                  }
                  setPemilihPeriodeTerbuka((v) => !v);
                }}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-indigo-lembut text-indigo transition-all duration-150 active:scale-[0.92]"
              >
                <Calendar size={19} />
              </button>
              <span className="rounded-full bg-indigo-lembut px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-indigo">
                {periode.label}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Admin: pola lama dipertahankan apa adanya (di luar cakupan
          permintaan owner kali ini) -- ikon kalender sendiri di bawah
          dropdown Kelompok/Kelas, tanpa judul (judulnya ada di
          page.tsx, terpisah dari tab). */}
      {!adalahGuru && kelasId !== '' && (
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="label-mikro">{periode.label}</div>
          <button
            ref={ikonKalenderRef}
            type="button"
            aria-label="Pilih Periode"
            onClick={() => {
              const rect = ikonKalenderRef.current?.getBoundingClientRect();
              if (rect) {
                setPosisiPemilihPeriode({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
              }
              setPemilihPeriodeTerbuka((v) => !v);
            }}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-indigo-lembut text-indigo transition-all duration-150 active:scale-[0.92]"
          >
            <Calendar size={19} />
          </button>
        </div>
      )}

      {pemilihPeriodeTerbuka && posisiPemilihPeriode && (
        <>
          <div className="fixed inset-0 z-[1090]" onClick={() => setPemilihPeriodeTerbuka(false)} />
          <div
            className="fixed z-[1100] w-[240px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
            style={{ top: posisiPemilihPeriode.top, right: posisiPemilihPeriode.right }}
          >
            <div className="flex gap-2">
              <SelectKustom value={String(bulan)} onChange={(v) => setBulan(Number(v))} opsi={opsiBulan} />
              <SelectKustom value={String(tahun)} onChange={(v) => setTahun(Number(v))} opsi={opsiTahun} />
            </div>
          </div>
        </>
      )}

      {kelasId === '' && (
        <p className="text-[13px] text-text-dim">
          {adalahGuru ? 'Memuat kelas...' : 'Pilih kelompok lalu kelas dulu.'}
        </p>
      )}

      {kelasId !== '' && (
        <>
          {/* ── Sisi PER KELAS -- label "Klasikal - Hafalan Surat"
              (diminta owner 2026-09-02 malam), bukan lagi "Per Kelas":
              fase 1 fitur ini memang KHUSUS Klasikal Hafalan Surat
              (Hafalan Do'a belum ikut, lihat catatan kepala berkas). */}
          <div className="label-mikro mb-2">Klasikal - Hafalan Surat</div>
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
                      {b.terakhir && (
                        <span className="text-[11px] whitespace-nowrap text-text-faint">
                          terakhir {tanggalPendek(b.terakhir)}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Sisi PER KELAS -- Hafalan Do'a (diminta owner 2026-09-03,
              DI BAWAH Hafalan Surat). Kartu & format baris sama persis,
              cuma "×" hijau -> tetap sage, label "Klasikal - Hafalan
              Do'a". ── */}
          <div className="label-mikro mb-2">Klasikal - Hafalan Do&rsquo;a</div>
          {loadingKelasDoa && <Skeleton className="mb-5 h-[52px] w-full" />}
          {errorKelasDoa && <p className="mb-5 text-[13px] text-red">{errorKelasDoa}</p>}
          {!loadingKelasDoa && !errorKelasDoa && (
            <div className="kartu-premium mb-5 overflow-hidden">
              {barisKelasDoaTampil.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-text-dim">
                  Belum ada Hafalan Do&rsquo;a Klasikal yang disampaikan pada periode ini.
                </p>
              ) : (
                barisKelasDoaTampil.map((b) => (
                  <div
                    key={b.nama_doa}
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-[13px] font-semibold text-text">
                      {b.nama_doa}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <span className="angka-metrik text-[15px] text-sage">{b.jumlah}×</span>
                      {b.terakhir && (
                        <span className="text-[11px] whitespace-nowrap text-text-faint">
                          terakhir {tanggalPendek(b.terakhir)}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Tilawati -- dua bagian spt Riwayat Pembelajaran
              (2026-09-03, diminta owner): "Peraga Tilawati" (pengulangan
              materi) + "Buku Jilid" (Naik/Tetap per santri). Keduanya
              tampil utk guru & admin. ── */}
          <div className="label-mikro mb-2">Tilawati</div>

          <div className="mb-1.5 text-[12px] font-semibold text-text-dim">Peraga Tilawati</div>
          {loadingPeraga && <Skeleton className="mb-5 h-[52px] w-full" />}
          {!loadingPeraga && (
            <div className="kartu-premium mb-5 overflow-hidden">
              {peragaTampil.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-text-dim">
                  Belum ada Peraga Tilawati yang disampaikan pada periode ini.
                </p>
              ) : (
                peragaTampil.map((b) => (
                  <div
                    key={b.jilid}
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0 truncate text-[13px] font-semibold text-text">
                      Peraga Tilawati {b.jilid === 'Paud' ? 'Paud' : `Jilid ${b.jilid}`}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      {b.khatam > 0 ? (
                        <span className="angka-metrik text-[15px] text-sage">{b.khatam}×</span>
                      ) : (
                        <span className="text-[11px] whitespace-nowrap text-text-faint">
                          sedang berjalan
                        </span>
                      )}
                      {b.terakhir && (
                        <span className="text-[11px] whitespace-nowrap text-text-faint">
                          terakhir {tanggalPendek(b.terakhir)}
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="mb-1.5 text-[12px] font-semibold text-text-dim">Buku Jilid</div>
          {loadingTilawati && <Skeleton className="mb-5 h-[52px] w-full" />}
          {errorTilawati && <p className="mb-5 text-[13px] text-red">{errorTilawati}</p>}
          {!loadingTilawati && !errorTilawati && (
            <div className="kartu-premium mb-5 overflow-hidden">
              {tilawatiRingkas.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-text-dim">
                  Belum ada catatan Tilawati pada periode ini.
                </p>
              ) : (
                tilawatiRingkas.map((s) => (
                  <div
                    key={s.santriId}
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-text">{s.nama}</span>
                      <span className="block text-[11px] text-text-faint">
                        terakhir {tanggalPendek(s.terakhir)}
                        {s.terakhirJilid ? ` · Jilid ${s.terakhirJilid}` : ''}
                        {s.terakhirHalaman ? ` hal ${s.terakhirHalaman}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {s.naik > 0 && (
                        <span className="rounded-full bg-sage-lembut px-2.5 py-1 text-[11px] font-bold text-sage">
                          {s.naik}× Naik
                        </span>
                      )}
                      {s.tetap > 0 && (
                        <span className="rounded-full bg-brass-lembut px-2.5 py-1 text-[11px] font-bold text-brass">
                          {s.tetap}× Tetap
                        </span>
                      )}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Sisi PER SANTRI -- SEMENTARA admin-only (2026-09-02
              malam, diminta owner), lihat catatan di useEffect
              barisSantri di atas utk alasannya. ── */}
          {!adalahGuru && (
            <>
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
        </>
      )}
    </div>
  );
}
