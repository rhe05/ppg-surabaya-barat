'use client';

/* Fitur "Shodaqoh" (2026-09-11) -- di bawah Infaq Pengajian di menu
   Keuangan. Kolam uang TERPISAH dari Tabungan (penghimpun sendiri).
   Jenis BEBAS diatur admin_kelompok (mis. "Shodaqoh Generus Sakit",
   "Shodaqoh Tali Asih Guru", dst), TIAP JENIS punya mode sendiri:
     'per_santri' -- siapa nyumbang berapa (pola sama Tabungan TERIMA,
                     dibatasi ke santri kelas guru sendiri kecuali guru
                     itu penghimpun -- lihat migrasi 20260911190000).
     'global'     -- total terkumpul per kelas per tanggal, tanpa
                     atribusi ke anak (pola sama Infaq Pengajian).
   Tidak ada "tarik" -- shodaqoh searah masuk, hanya CATAT lalu SETOR
   ke penghimpun. Data: lib/shodaqoh.ts. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HandHeart, Plus, X, Settings2, ArrowUpRight, Wallet, Landmark, UserCog, Clock,
} from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import AdminHeader from '@/components/dashboard/AdminHeader';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import PesanGalat from '@/components/ui/PesanGalat';
import EmptyState from '@/components/ui/EmptyState';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import FieldTanggal from '@/components/ui/FieldTanggal';
import { FieldSaran } from '@/components/ui/FieldSaran';
import { saranUnikDenganRec } from '@/lib/saran';
import { useToast } from '@/components/ui/useToast';
import { muatKelasGuru } from '@/lib/dataGuru';
import { formatRupiah } from '@/lib/tabungan';
import {
  muatJenis,
  simpanJenis,
  hapusJenis,
  muatTransaksiKelompok,
  catatTransaksi,
  hapusTransaksi,
  muatPenghimpun,
  simpanPenghimpun,
  muatSetoranKelompok,
  catatSetoran,
  muatRincianSetoran,
  kasDiTanganGuru,
  belumSetor,
  catatanLangsungPenghimpun,
  type ShodaqohJenis,
  type ShodaqohTransaksi,
  type ShodaqohSetoran,
  type ShodaqohPenghimpun,
  type ModeShodaqoh,
} from '@/lib/shodaqoh';

type Santri = { id: number; nama: string; kelas_id: number | null };
type Kelas = { id: number; nama: string };
type Guru = { id: number; nama: string };

function fmtTgl(iso: string) {
  const [y, m, d] = iso.split('-');
  const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(d)} ${b[Number(m) - 1] ?? m} ${y}`;
}

function ShodaqohContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin_kelompok';
  const kelompokId = profile?.scope_kelompok_id ?? null;
  const guruId = profile?.guru_id ?? null;
  const { sukses, error: toastError } = useToast();

  const [jenis, setJenis] = useState<ShodaqohJenis[]>([]);
  const [santriSemua, setSantriSemua] = useState<Santri[]>([]);
  const [kelasSaya, setKelasSaya] = useState<{ id: number; nama: string }[]>([]);
  const [guru, setGuru] = useState<Guru[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [tx, setTx] = useState<ShodaqohTransaksi[]>([]);
  const [setoran, setSetoran] = useState<ShodaqohSetoran[]>([]);
  const [rincianHimpun, setRincianHimpun] = useState<ShodaqohTransaksi[]>([]);
  const [penghimpun, setPenghimpun] = useState<ShodaqohPenghimpun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  const [jenisEdit, setJenisEdit] = useState<ShodaqohJenis | 'baru' | null>(null);
  const [aturPenghimpun, setAturPenghimpun] = useState(false);
  const [setorTerbuka, setSetorTerbuka] = useState(false);
  const [hapusId, setHapusId] = useState<number | null>(null);
  const [menghapus, setMenghapus] = useState(false);

  useEffect(() => {
    if (guruId == null) return;
    muatKelasGuru(guruId).then((l) => setKelasSaya(l.map((k) => ({ id: k.id, nama: k.nama }))));
  }, [guruId]);

  const isPenghimpun = !isAdmin && penghimpun?.guru_id != null && penghimpun.guru_id === guruId;

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [j, gRes, kRes, sRes, pHimp, sAll, txAll] = await Promise.all([
        muatJenis(kelompokId),
        supabase.from('guru').select('id, nama').eq('kelompok_id', kelompokId).is('deleted_at', null).order('nama'),
        supabase.from('kelas').select('id, nama').eq('kelompok_id', kelompokId).is('deleted_at', null).order('nama'),
        muatSetoranKelompok(kelompokId).catch(() => [] as ShodaqohSetoran[]),
        muatPenghimpun(kelompokId).catch(() => null),
        supabase.from('santri').select('id, nama, kelas_id').eq('kelompok_id', kelompokId).is('deleted_at', null).order('nama'),
        muatTransaksiKelompok(kelompokId),
      ]);
      setJenis(j);
      setGuru((gRes.data ?? []) as Guru[]);
      setKelasList((kRes.data ?? []) as Kelas[]);
      setSetoran(sRes);
      setPenghimpun(pHimp);
      setSantriSemua((sAll.data ?? []) as Santri[]);
      setTx(txAll);

      const akuPenghimpun = !isAdmin && pHimp?.guru_id != null && pHimp.guru_id === guruId;
      if (akuPenghimpun && sRes.length > 0) {
        setRincianHimpun(await muatRincianSetoran(sRes.map((s) => s.id)).catch(() => [] as ShodaqohTransaksi[]));
      } else {
        setRincianHimpun([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data shodaqoh.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, isAdmin, guruId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaGuru = useMemo(() => new Map(guru.map((g) => [g.id, g.nama])), [guru]);
  const namaSantri = useMemo(() => new Map(santriSemua.map((s) => [s.id, s.nama])), [santriSemua]);
  const namaKelas = useMemo(() => new Map(kelasList.map((k) => [k.id, k.nama])), [kelasList]);
  const namaJenis = useMemo(() => new Map(jenis.map((j) => [j.id, j])), [jenis]);

  const penghimpunNama = useMemo(() => {
    if (!penghimpun || penghimpun.guru_id == null) return null;
    return namaGuru.get(penghimpun.guru_id) ?? null;
  }, [penghimpun, namaGuru]);

  /* Santri yang boleh dipilih di form (per_santri): admin/penghimpun ->
     semua santri kelompok. Guru biasa -> HANYA santri kelasnya sendiri
     (cermin batas RLS shodaqoh_transaksi_insert -- kalau dilanggar di
     sini, Simpan akan ditolak database, bukan langsung sukses). */
  const kelasSayaIds = useMemo(() => new Set(kelasSaya.map((k) => k.id)), [kelasSaya]);
  const santriPicker = useMemo(
    () => (isAdmin || isPenghimpun ? santriSemua : santriSemua.filter((s) => s.kelas_id != null && kelasSayaIds.has(s.kelas_id))),
    [isAdmin, isPenghimpun, santriSemua, kelasSayaIds],
  );
  /* Kelas yang boleh dipilih utk entri GLOBAL: guru biasa -> kelasnya
     sendiri; admin/penghimpun -> semua kelas kelompok. */
  const kelasPicker = useMemo(
    () => (isAdmin || isPenghimpun ? kelasList : kelasSaya),
    [isAdmin, isPenghimpun, kelasList, kelasSaya],
  );

  const totalSemua = useMemo(() => tx.reduce((a, t) => a + t.jumlah, 0), [tx]);
  const totalPerJenis = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of tx) m.set(t.jenis_id, (m.get(t.jenis_id) ?? 0) + t.jumlah);
    return m;
  }, [tx]);
  const totalSetoranMasuk = useMemo(() => setoran.reduce((a, s) => a + s.jumlah, 0), [setoran]);
  const totalLangsung = useMemo(
    () => catatanLangsungPenghimpun(tx, profile?.id ?? null).reduce((a, t) => a + t.jumlah, 0),
    [tx, profile?.id],
  );
  const kasGuru = useMemo(
    () => (guruId != null ? kasDiTanganGuru(tx, profile?.id ?? null, isPenghimpun) : 0),
    [tx, profile?.id, guruId, isPenghimpun],
  );
  const belumSetorSaya = useMemo(
    () => (guruId != null ? belumSetor(tx, profile?.id ?? null, isPenghimpun) : []),
    [tx, profile?.id, guruId, isPenghimpun],
  );

  function targetLabel(t: ShodaqohTransaksi): string {
    if (t.santri_id != null) return namaSantri.get(t.santri_id) ?? `Santri #${t.santri_id}`;
    if (t.kelas_id != null) return namaKelas.get(t.kelas_id) ?? `Kelas #${t.kelas_id}`;
    return 'Se-kelompok';
  }

  async function hapus(id: number) {
    setMenghapus(true);
    try {
      await hapusTransaksi(id);
      setHapusId(null);
      sukses('Catatan shodaqoh dihapus.');
      await muat();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setMenghapus(false);
    }
  }

  async function setorSemuaKas() {
    if (!kelompokId || guruId == null || belumSetorSaya.length === 0) return;
    try {
      await catatSetoran(
        kelompokId,
        { guru_id: guruId, tanggal: new Date().toISOString().slice(0, 10), keterangan: null },
        belumSetorSaya.map((t) => t.id),
        belumSetorSaya.reduce((a, t) => a + t.jumlah, 0),
        profile?.id ?? null,
      );
      setSetorTerbuka(false);
      sukses('Shodaqoh disetorkan ke penghimpun.');
      await muat();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Gagal menyetor.');
    }
  }

  const body = (
    <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-24">
      <h1 className="mb-4 text-[17px] font-extrabold tracking-[-0.01em] text-text">Shodaqoh</h1>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <div className="mb-5 h-[132px] animate-pulse rounded-card bg-panel-2" />
      ) : (
        <div className="kartu-saldo mb-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold tracking-[0.06em] text-white/60 uppercase">
                {isAdmin ? 'Total shodaqoh kelompok' : isPenghimpun ? 'Himpunan di tangan Anda' : 'Kas di tangan Anda'}
              </div>
              <div className="angka-metrik mt-1.5 text-[26px] text-white">
                {formatRupiah(isAdmin ? totalSemua : isPenghimpun ? totalSetoranMasuk + totalLangsung : kasGuru)}
              </div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              {isAdmin ? <HandHeart size={19} /> : isPenghimpun ? <Landmark size={19} /> : <Wallet size={19} />}
            </span>
          </div>

          {!isAdmin && !isPenghimpun && (
            <div className="mt-4 flex items-stretch gap-3 border-t border-white/15 pt-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-white/55">Disetorkan ke</div>
                <div className="truncate text-[13px] font-bold text-white">{penghimpunNama ?? 'Belum ditetapkan'}</div>
              </div>
              {belumSetorSaya.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSetorTerbuka(true)}
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 self-center rounded-pill border-none bg-white px-4 py-2 text-[13px] font-extrabold text-text active:scale-95"
                >
                  <ArrowUpRight size={14} /> Setor
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && isPenghimpun && setoran.length + rincianHimpun.length + totalLangsung > 0 && (
        <div className="kartu-premium mb-5 overflow-hidden">
          <div className="label-mikro border-b border-border px-4 py-3">Setoran guru masuk</div>
          <div className="flex flex-col">
            {setoran.slice(0, 8).map((s) => (
              <div key={s.id} className="baris-daftar flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-text">{namaGuru.get(s.guru_id) ?? `Guru #${s.guru_id}`}</div>
                  <div className="text-[12px] text-text-dim">{fmtTgl(s.tanggal)}{s.keterangan ? ` · ${s.keterangan}` : ''}</div>
                </div>
                <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-text">{formatRupiah(s.jumlah)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && isAdmin && (
        <>
          <div className="label-mikro mb-2">Per jenis</div>
          <div className="mb-5 grid grid-cols-2 gap-3">
            {jenis.map((j) => (
              <div key={j.id} className="kartu-premium flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 truncate text-[12px] font-bold text-text-dim">{j.nama}</div>
                  <button
                    type="button"
                    onClick={() => setJenisEdit(j)}
                    aria-label={`Atur ${j.nama}`}
                    className="-mt-1 -mr-1 shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-faint active:opacity-60"
                  >
                    <Settings2 size={15} />
                  </button>
                </div>
                <div className="angka-metrik mt-1 text-[16px] text-text">{formatRupiah(totalPerJenis.get(j.id) ?? 0)}</div>
                <span
                  className={`mt-2 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    j.mode === 'per_santri' ? 'bg-indigo-lembut text-indigo' : 'bg-sage-lembut text-sage'
                  }`}
                >
                  {j.mode === 'per_santri' ? 'Per Anak' : 'Global'}
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setJenisEdit('baru')}
              className="flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border bg-panel text-[12px] font-bold text-text-dim active:scale-[0.98]"
            >
              <Plus size={17} /> Tambah Jenis
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAturPenghimpun(true)}
            className="kartu-premium mb-5 flex w-full cursor-pointer items-center gap-3 p-4 text-left active:scale-[0.99]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(79,70,229,0.1)] text-indigo">
              <UserCog size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="label-mikro">Penghimpun Shodaqoh</div>
              <div className="mt-0.5 truncate text-[15px] font-extrabold text-text">
                {penghimpunNama ?? 'Tiap guru pegang sendiri'}
              </div>
              {penghimpun?.catatan && <div className="truncate text-[12px] text-text-dim">{penghimpun.catatan}</div>}
            </div>
            <Settings2 size={16} className="shrink-0 text-text-faint" />
          </button>

          {setoran.length > 0 && (
            <div className="kartu-premium mb-5 overflow-hidden">
              <div className="label-mikro border-b border-border px-4 py-3">Setoran guru ke penghimpun</div>
              <div className="flex flex-col">
                {setoran.slice(0, 8).map((s) => (
                  <div key={s.id} className="baris-daftar flex items-center justify-between gap-2 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-text">{namaGuru.get(s.guru_id) ?? `Guru #${s.guru_id}`}</div>
                      <div className="text-[12px] text-text-dim">{fmtTgl(s.tanggal)}{s.keterangan ? ` · ${s.keterangan}` : ''}</div>
                    </div>
                    <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-text">{formatRupiah(s.jumlah)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!isAdmin && jenis.length > 0 && (
        <button
          type="button"
          onClick={() => setTambahTerbuka(true)}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border-none bg-brass px-4 py-2.5 text-[13px] font-extrabold text-white active:scale-[0.98]"
        >
          <Plus size={15} strokeWidth={2.5} />
          Catat Shodaqoh
        </button>
      )}

      <div className="label-mikro mb-3">Riwayat{tx.length > 0 ? ` (${tx.length})` : ''}</div>

      {loading ? (
        <SkeletonKartuList />
      ) : jenis.length === 0 ? (
        <EmptyState
          ikon={<HandHeart size={22} />}
          judul="Belum ada jenis shodaqoh"
          deskripsi={
            isAdmin
              ? 'Tambahkan jenis (mis. Shodaqoh Generus Sakit, Tali Asih Guru) untuk mulai mencatat.'
              : 'Admin kelompok belum menyiapkan jenis shodaqoh.'
          }
          aksi={isAdmin ? { label: 'Tambah Jenis', onClick: () => setJenisEdit('baru') } : undefined}
        />
      ) : tx.length === 0 ? (
        <p className="rounded-card border border-border bg-panel-2 px-4 py-4 text-[13px] text-text-dim">
          Belum ada catatan shodaqoh.
        </p>
      ) : (
        <div className="kartu-premium overflow-hidden">
          {tx
            .slice()
            .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id - a.id)
            .slice(0, 60)
            .map((t) => {
              const j = namaJenis.get(t.jenis_id);
              const bolehHapus = !isAdmin && t.dicatat_oleh === profile?.id && t.setoran_id == null;
              return (
                <div key={t.id} className="baris-daftar flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold text-text">{j?.nama ?? `Jenis #${t.jenis_id}`}</div>
                    <div className="truncate text-[12px] text-text-dim">
                      {targetLabel(t)} · {fmtTgl(t.tanggal)}
                      {t.keterangan ? ` · ${t.keterangan}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[13px] font-extrabold tabular-nums text-sage">{formatRupiah(t.jumlah)}</span>
                    {bolehHapus &&
                      (hapusId === t.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={menghapus}
                            onClick={() => hapus(t.id)}
                            className="rounded-full bg-red px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setHapusId(null)}
                            className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-text-dim"
                          >
                            Batal
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label="Hapus catatan ini"
                          onClick={() => setHapusId(t.id)}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-text-faint hover:bg-red-lembut hover:text-red"
                        >
                          <X size={13} />
                        </button>
                      ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );

  return (
    <main className="relative flex min-h-screen flex-col bg-bg">
      {isAdmin ? <AdminHeader judul="Shodaqoh" /> : <JurnalHeaderChrome tampilkanHero={false} />}
      {body}

      {tambahTerbuka && kelompokId && (
        <CatatShodaqohSheet
          kelompokId={kelompokId}
          jenisList={jenis}
          santriPicker={santriPicker}
          kelasPicker={kelasPicker}
          olehId={profile?.id ?? null}
          olehGuruId={guruId}
          onSelesai={() => {
            setTambahTerbuka(false);
            muat();
          }}
          onTutup={() => setTambahTerbuka(false)}
        />
      )}

      {setorTerbuka && (
        <div className="fixed inset-0 z-[610] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-[420px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[17px] font-extrabold text-text">Setor ke Penghimpun</h2>
              <button
                type="button"
                onClick={() => setSetorTerbuka(false)}
                aria-label="Tutup"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-4 text-[12.5px] text-text-dim">
              Seluruh kas shodaqoh di tangan Anda ({belumSetorSaya.length} catatan) akan diserahkan ke{' '}
              <span className="font-semibold text-text">{penghimpunNama ?? 'penghimpun'}</span>.
            </p>
            <div className="kartu-premium mb-4 p-4 text-center">
              <div className="angka-metrik text-[20px] text-text">
                {formatRupiah(belumSetorSaya.reduce((a, t) => a + t.jumlah, 0))}
              </div>
            </div>
            <button
              type="button"
              onClick={setorSemuaKas}
              className="w-full cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white active:scale-[0.98]"
            >
              Setor Sekarang
            </button>
          </div>
        </div>
      )}

      {aturPenghimpun && kelompokId && (
        <PenghimpunModal
          kelompokId={kelompokId}
          guruList={guru}
          awal={penghimpun}
          olehId={profile?.id ?? null}
          onSelesai={() => {
            setAturPenghimpun(false);
            sukses('Penghimpun Shodaqoh disimpan.');
            muat();
          }}
          onBatal={() => setAturPenghimpun(false)}
        />
      )}

      {jenisEdit && kelompokId && (
        <JenisModal
          kelompokId={kelompokId}
          awal={jenisEdit === 'baru' ? null : jenisEdit}
          olehId={profile?.id ?? null}
          onSelesai={() => {
            setJenisEdit(null);
            sukses('Jenis shodaqoh disimpan.');
            muat();
          }}
          onBatal={() => setJenisEdit(null)}
        />
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */

function CatatShodaqohSheet({
  kelompokId,
  jenisList,
  santriPicker,
  kelasPicker,
  olehId,
  olehGuruId,
  onSelesai,
  onTutup,
}: {
  kelompokId: number;
  jenisList: ShodaqohJenis[];
  santriPicker: Santri[];
  kelasPicker: { id: number; nama: string }[];
  olehId: string | null;
  olehGuruId: number | null;
  onSelesai: () => void;
  onTutup: () => void;
}) {
  const [jenisId, setJenisId] = useState<number | ''>(jenisList[0]?.id ?? '');
  const jenisAktif = jenisList.find((j) => j.id === jenisId) ?? null;
  const [teksSantri, setTeksSantri] = useState('');
  const [santriTerpilih, setSantriTerpilih] = useState<Santri | null>(null);
  const [kelasId, setKelasId] = useState<string>('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [jumlah, setJumlah] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saranSantri = useMemo(() => saranUnikDenganRec(santriPicker, (s) => s.nama), [santriPicker]);

  async function simpan() {
    const nilai = Number(jumlah.replace(/\D/g, ''));
    if (jenisId === '' || !tanggal || !nilai || nilai <= 0) {
      setError('Jenis, tanggal, dan jumlah (lebih dari 0) wajib diisi.');
      return;
    }
    if (jenisAktif?.mode === 'per_santri' && !santriTerpilih) {
      setError('Pilih santri penerima dari daftar dulu.');
      return;
    }
    setMenyimpan(true);
    setError(null);
    try {
      await catatTransaksi(
        kelompokId,
        {
          jenis_id: jenisId,
          santri_id: jenisAktif?.mode === 'per_santri' ? (santriTerpilih?.id ?? null) : null,
          kelas_id: jenisAktif?.mode === 'global' && kelasId ? Number(kelasId) : null,
          jumlah: nilai,
          tanggal,
          keterangan: keterangan.trim() || null,
        },
        olehId,
        olehGuruId,
      );
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[610] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[17px] font-extrabold text-text">Catat Shodaqoh</h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Jenis</label>
            <select
              value={jenisId}
              onChange={(e) => {
                setJenisId(Number(e.target.value));
                setSantriTerpilih(null);
                setTeksSantri('');
                setKelasId('');
              }}
              className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
            >
              {jenisList.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.nama} ({j.mode === 'per_santri' ? 'Per Anak' : 'Global'})
                </option>
              ))}
            </select>
          </div>

          {jenisAktif?.mode === 'per_santri' ? (
            <div>
              <FieldSaran
                inputClass="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
                labelClass="mb-1.5 block text-[12px] font-semibold text-text-dim"
                label="Santri"
                wajib
                value={teksSantri}
                onChange={(v) => {
                  setTeksSantri(v);
                  setSantriTerpilih(null);
                }}
                onPilih={(item) => {
                  if (item.rec) {
                    setSantriTerpilih(item.rec);
                    setTeksSantri(item.rec.nama);
                  }
                }}
                saran={saranSantri}
                placeholder="Ketik nama santri"
              />
              {santriTerpilih && (
                <p className="mt-1 text-[11.5px] text-brass">
                  Dipilih: <span className="font-semibold">{santriTerpilih.nama}</span>
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">
                Kelas (opsional -- kosongkan jika se-kelompok)
              </label>
              <select
                value={kelasId}
                onChange={(e) => setKelasId(e.target.value)}
                className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
              >
                <option value="">Se-kelompok (gabungan)</option>
                {kelasPicker.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Tanggal</label>
            <FieldTanggal
              nilai={tanggal}
              onPilih={setTanggal}
              className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Jumlah</label>
            <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-3.5 focus-within:border-brass">
              <span className="text-[13px] font-bold text-text-dim">Rp</span>
              <input
                inputMode="numeric"
                value={jumlah ? Number(jumlah.replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                onChange={(e) => setJumlah(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full border-none bg-transparent py-2.5 text-[15px] font-extrabold tabular-nums text-text outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Keterangan (opsional)</label>
            <input
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="mis. kondisi/keperluan"
              className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-border px-5 py-4">
          {error && <p className="mb-2 text-[12.5px] font-semibold text-red">{error}</p>}
          <button
            type="button"
            onClick={simpan}
            disabled={menyimpan}
            className="w-full rounded-[var(--radius-button)] border-none bg-brass px-5 py-3.5 text-[14px] font-extrabold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {menyimpan ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PenghimpunModal({
  kelompokId,
  guruList,
  awal,
  olehId,
  onSelesai,
  onBatal,
}: {
  kelompokId: number;
  guruList: Guru[];
  awal: ShodaqohPenghimpun | null;
  olehId: string | null;
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const [guruId, setGuruId] = useState<string>(awal?.guru_id != null ? String(awal.guru_id) : '');
  const [catatan, setCatatan] = useState(awal?.catatan ?? '');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan() {
    setError(null);
    setSibuk(true);
    try {
      await simpanPenghimpun(kelompokId, guruId ? Number(guruId) : null, catatan, olehId);
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[610] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-[420px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-text">Penghimpun Shodaqoh</h2>
          <button
            type="button"
            onClick={onBatal}
            aria-label="Tutup"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-[12px] text-text-dim">
          Guru/pengurus yang diamanahi menghimpun uang Shodaqoh -- TERPISAH dari penghimpun Tabungan, boleh
          orang yang berbeda. Pilih &quot;Tiap guru pegang sendiri&quot; jika tidak dihimpun jadi satu.
        </p>

        <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Penghimpun</label>
        <select
          value={guruId}
          onChange={(e) => setGuruId(e.target.value)}
          className="mb-3 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
        >
          <option value="">Tiap guru pegang sendiri</option>
          {guruList.map((g) => (
            <option key={g.id} value={g.id}>
              {g.nama}
            </option>
          ))}
        </select>

        <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Catatan (opsional)</label>
        <input
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="Misal: setor tiap ada kejadian"
          className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
        />

        {error && <p className="mt-3 text-[12px] text-red">{error}</p>}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={simpan}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {sibuk ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function JenisModal({
  kelompokId,
  awal,
  olehId,
  onSelesai,
  onBatal,
}: {
  kelompokId: number;
  awal: ShodaqohJenis | null;
  olehId: string | null;
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const [nama, setNama] = useState(awal?.nama ?? '');
  const [mode, setMode] = useState<ModeShodaqoh>(awal?.mode ?? 'global');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan() {
    setError(null);
    if (!nama.trim()) return setError('Nama jenis wajib diisi.');
    setSibuk(true);
    try {
      await simpanJenis(kelompokId, awal?.id ?? null, { nama: nama.trim(), mode }, olehId);
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
      setSibuk(false);
    }
  }

  async function nonaktifkan() {
    if (!awal) return;
    setSibuk(true);
    try {
      await hapusJenis(awal.id);
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menonaktifkan.');
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[610] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-[420px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-text">{awal ? 'Atur Jenis Shodaqoh' : 'Tambah Jenis Shodaqoh'}</h2>
          <button
            type="button"
            onClick={onBatal}
            aria-label="Tutup"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Nama</label>
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Misal: Shodaqoh Generus Sakit"
          className="mb-3 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
        />

        <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Cara pencatatan</label>
        <div className="mb-3 flex gap-2">
          {(
            [
              ['global', 'Global', 'Total terkumpul, tanpa atribusi ke anak'],
              ['per_santri', 'Per Anak', 'Tercatat siapa nyumbang berapa'],
            ] as const
          ).map(([m, label, ket]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-[var(--radius)] border-[1.5px] p-3 text-left transition-all duration-150 ${
                mode === m ? 'border-brass bg-brass-lembut' : 'border-border bg-panel'
              }`}
            >
              <div className={`text-[13px] font-bold ${mode === m ? 'text-brass' : 'text-text'}`}>{label}</div>
              <div className="mt-0.5 text-[10.5px] leading-snug text-text-dim">{ket}</div>
            </button>
          ))}
        </div>

        {error && <p className="mt-1 mb-2 text-[12px] text-red">{error}</p>}

        <div className="mt-2 flex gap-2.5">
          {awal && (
            <button
              type="button"
              disabled={sibuk}
              onClick={nonaktifkan}
              className="flex-1 cursor-pointer rounded-[var(--radius)] border border-red bg-[rgba(220,38,38,0.06)] px-4 py-2.5 text-[13px] font-bold text-red active:scale-[0.98] disabled:opacity-50"
            >
              Nonaktifkan
            </button>
          )}
          <button
            type="button"
            disabled={sibuk}
            onClick={simpan}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {sibuk ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShodaqohPage() {
  return (
    <RequireAuth>
      <ShodaqohContent />
    </RequireAuth>
  );
}
