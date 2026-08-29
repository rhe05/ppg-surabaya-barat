'use client';

/* Fitur "Tabungan" (2026-08-28) — tabungan generus per-SANTRI.
   Alur uang: TERIMA (guru <- generus) -> SETOR (guru -> penghimpun) ->
   TARIK (generus, wajib disetujui admin_kelompok).

   - guru: catat penerimaan & ajukan penarikan santri yang dia ajar,
     lihat kas di tangannya, setor ke penghimpun.
   - admin_kelompok: atur jenis + target + penghimpun, setujui/tolak
     penarikan, lihat total & rincian per-santri, rekap setoran.

   Data: lib/tabungan.ts (migrasi 20260828100000 + 20260828140000). */

import PesanGalat from '@/components/ui/PesanGalat';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Search, Settings2, Plus, X, Wallet, ArrowUpRight, Clock, Check, Ban, UserCog, ChevronRight, Landmark } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import AdminHeader from '@/components/dashboard/AdminHeader';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import EmptyState from '@/components/ui/EmptyState';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import { useToast } from '@/components/ui/useToast';
import TabunganSantriSheet from '@/components/tabungan/TabunganSantriSheet';
import TabunganSetorSheet from '@/components/tabungan/TabunganSetorSheet';
import TabunganHimpunanPanel from '@/components/tabungan/TabunganHimpunanPanel';
import {
  muatJenis,
  muatTransaksiKelompok,
  muatTransaksiSantri,
  muatSetoranKelompok,
  muatRincianSetoran,
  muatPenghimpun,
  simpanJenis,
  simpanPenghimpun,
  putuskanTarik,
  hitungSaldo,
  kasDiTanganGuru,
  terimaLangsungPenghimpun,
  formatRupiah,
  type TabunganJenis,
  type Transaksi,
  type Setoran,
  type Penghimpun,
} from '@/lib/tabungan';

type Santri = { id: number; nama: string };
type Guru = { id: number; nama: string };

const bulanIniPrefix = () => new Date().toISOString().slice(0, 7);
/* Inisial utk avatar baris generus -- dua huruf pertama dari dua kata
   pertama, cukup utk membedakan tanpa memuat foto apa pun. */
function inisialNama(n: string) {
  const kata = n.trim().split(' ').filter(Boolean).slice(0, 2);
  return kata.map((w) => w[0]).join('').toUpperCase() || '?';
}
function fmtTgl(iso: string) {
  const [y, m, d] = iso.split('-');
  const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(d)} ${b[Number(m) - 1] ?? m} ${y}`;
}

function TabunganContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin_kelompok';
  const kelompokId = profile?.scope_kelompok_id ?? null;
  const guruId = profile?.guru_id ?? null;
  const { sukses } = useToast();

  const [jenis, setJenis] = useState<TabunganJenis[]>([]);
  const [santri, setSantri] = useState<Santri[]>([]);
  const [guru, setGuru] = useState<Guru[]>([]);
  const [tx, setTx] = useState<Transaksi[]>([]);
  const [setoran, setSetoran] = useState<Setoran[]>([]);
  const [rincianHimpun, setRincianHimpun] = useState<Transaksi[]>([]);
  const [penghimpun, setPenghimpun] = useState<Penghimpun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');
  const [sheetSantri, setSheetSantri] = useState<Santri | null>(null);
  const [jenisEdit, setJenisEdit] = useState<TabunganJenis | 'baru' | null>(null);
  const [setorBuka, setSetorBuka] = useState(false);
  const [aturPenghimpun, setAturPenghimpun] = useState(false);
  const [prosesId, setProsesId] = useState<number | null>(null);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [j, gRes, sRes, pHimp] = await Promise.all([
        muatJenis(kelompokId),
        supabase.from('guru').select('id, nama').eq('kelompok_id', kelompokId).is('deleted_at', null).order('nama'),
        muatSetoranKelompok(kelompokId).catch(() => [] as Setoran[]),
        muatPenghimpun(kelompokId).catch(() => null),
      ]);
      setJenis(j);
      setGuru((gRes.data ?? []) as Guru[]);
      setSetoran(sRes);
      setPenghimpun(pHimp);

      const akuPenghimpun = !isAdmin && pHimp?.guru_id != null && pHimp.guru_id === guruId;

      /* Guru yang ditunjuk sbg penghimpun: rincian semua setoran yang
         masuk, sampai ke tingkat per-anak. */
      if (akuPenghimpun && sRes.length > 0) {
        setRincianHimpun(await muatRincianSetoran(sRes.map((s) => s.id)).catch(() => [] as Transaksi[]));
      } else {
        setRincianHimpun([]);
      }

      /* Penghimpun memuat data se-KELOMPOK, sama seperti admin -- bukan
         cuma kelas yang dia ampu (2026-08-29, migrasi 20260829100000).
         Sejak ada jalur "generus setor LANGSUNG ke penghimpun", ia harus
         bisa mencari & mencatat untuk anak mana pun; daftar yang cuma
         berisi kelasnya sendiri membuat jalur itu mustahil dipakai. */
      if (isAdmin || akuPenghimpun) {
        const [{ data: dS }, txAll] = await Promise.all([
          supabase
            .from('santri')
            .select('id, nama')
            .eq('kelompok_id', kelompokId)
            .is('deleted_at', null)
            .order('nama'),
          muatTransaksiKelompok(kelompokId),
        ]);
        setSantri((dS ?? []) as Santri[]);
        setTx(txAll);
      } else {
        const { data: dK } = await supabase
          .from('kelas')
          .select('id')
          .eq('guru_id', guruId)
          .is('deleted_at', null);
        const kelasIds = (dK ?? []).map((k) => k.id);
        if (kelasIds.length === 0) {
          setSantri([]);
          setTx([]);
        } else {
          const { data: dS } = await supabase
            .from('santri')
            .select('id, nama')
            .in('kelas_id', kelasIds)
            .is('deleted_at', null)
            .order('nama');
          const list = (dS ?? []) as Santri[];
          setSantri(list);
          setTx(await muatTransaksiSantri(list.map((s) => s.id)));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data tabungan.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, isAdmin, guruId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const saldo = useMemo(() => hitungSaldo(tx), [tx]);
  const namaGuru = useMemo(() => new Map(guru.map((g) => [g.id, g.nama])), [guru]);
  const namaSantri = useMemo(() => new Map(santri.map((s) => [s.id, s.nama])), [santri]);
  const namaJenis = useMemo(() => new Map(jenis.map((j) => [j.id, j.nama])), [jenis]);

  const isPenghimpun = !isAdmin && penghimpun?.guru_id != null && penghimpun.guru_id === guruId;

  const penghimpunNama = useMemo(() => {
    if (!penghimpun || penghimpun.guru_id == null) return null;
    return namaGuru.get(penghimpun.guru_id) ?? null;
  }, [penghimpun, namaGuru]);

  const terimaSaya = useMemo(
    () => tx.filter((t) => t.arah === 'terima' && t.dicatat_oleh === (profile?.id ?? null)),
    [tx, profile?.id],
  );

  const totalPerJenis = useMemo(() => {
    const m = new Map<number, { total: number; bulanIni: number }>();
    const pfx = bulanIniPrefix();
    for (const j of jenis) m.set(j.id, { total: 0, bulanIni: 0 });
    for (const t of tx) {
      const e = m.get(t.jenis_id);
      if (!e) continue;
      if (t.arah === 'terima') {
        e.total += t.jumlah;
        if (t.tanggal.startsWith(pfx)) e.bulanIni += t.jumlah;
      } else if (t.status === 'disetujui') {
        e.total -= t.jumlah;
      }
    }
    return m;
  }, [jenis, tx]);

  const pendingTarik = useMemo(
    () => tx.filter((t) => t.arah === 'tarik' && t.status === 'pending'),
    [tx],
  );

  const kasGuru = useMemo(
    () => (guruId != null ? kasDiTanganGuru(tx, profile?.id ?? null, isPenghimpun) : 0),
    [tx, profile?.id, guruId, isPenghimpun],
  );
  /* Uang cara-2: diserahkan generus LANGSUNG ke penghimpun, jadi tidak
     pernah lewat tabungan_setoran. Harus ikut dijumlahkan di panelnya,
     kalau tidak uang ini tidak muncul di total mana pun. */
  const terimaLangsung = useMemo(
    () => (isPenghimpun ? terimaLangsungPenghimpun(tx, profile?.id ?? null) : []),
    [isPenghimpun, tx, profile?.id],
  );
  const setoranSaya = useMemo(
    () => (guruId != null ? setoran.filter((s) => s.guru_id === guruId) : []),
    [setoran, guruId],
  );

  const santriTersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    return term ? santri.filter((s) => s.nama.toLowerCase().includes(term)) : santri;
  }, [santri, cari]);

  const txSantri = (id: number) => tx.filter((t) => t.santri_id === id);

  async function putusAdmin(id: number, setuju: boolean) {
    setProsesId(id);
    try {
      await putuskanTarik(id, setuju, profile?.id ?? null);
      sukses(setuju ? 'Penarikan disetujui.' : 'Penarikan ditolak.');
      muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memproses.');
    } finally {
      setProsesId(null);
    }
  }

  /* Angka utama layar ini berbeda per peran -- disatukan di SATU panel
     saldo gelap (idiom aplikasi keuangan) supaya mata langsung mendarat
     di angka yang paling menentukan, bukan tersebar di tiga kartu putih
     yang bobot visualnya sama semua. */
  const totalSemua = useMemo(
    () => [...totalPerJenis.values()].reduce((a, v) => a + v.total, 0),
    [totalPerJenis],
  );
  const totalSetoranMasuk = useMemo(() => setoran.reduce((a, s) => a + s.jumlah, 0), [setoran]);
  const totalLangsung = useMemo(
    () => terimaLangsung.reduce((a, t) => a + t.jumlah, 0),
    [terimaLangsung],
  );

  const body = (
    <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-24">
      <h1 className="mb-4 text-[17px] font-extrabold tracking-[-0.01em] text-text">Tabungan</h1>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <div className="mb-5 h-[132px] animate-pulse rounded-card bg-panel-2" />
      ) : (
        <div className="kartu-saldo mb-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold tracking-[0.06em] text-white/60 uppercase">
                {isAdmin
                  ? 'Total tabungan generus'
                  : isPenghimpun
                    ? 'Himpunan di tangan Anda'
                    : 'Kas di tangan Anda'}
              </div>
              <div className="angka-metrik mt-1.5 text-[30px] text-white">
                {formatRupiah(
                  isAdmin ? totalSemua : isPenghimpun ? totalSetoranMasuk + totalLangsung : kasGuru,
                )}
              </div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              {isAdmin ? <Banknote size={19} /> : isPenghimpun ? <Landmark size={19} /> : <Wallet size={19} />}
            </span>
          </div>

          <div className="mt-4 flex items-stretch gap-3 border-t border-white/15 pt-3">
            {isAdmin ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/55">Generus</div>
                  <div className="truncate text-[13px] font-bold tabular-nums text-white">
                    {santri.length}
                  </div>
                </div>
                <div className="w-px bg-white/15" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/55">Jenis</div>
                  <div className="truncate text-[13px] font-bold tabular-nums text-white">
                    {jenis.length}
                  </div>
                </div>
                <div className="w-px bg-white/15" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/55">Menunggu</div>
                  <div
                    className={`truncate text-[13px] font-bold tabular-nums ${pendingTarik.length > 0 ? 'text-volt' : 'text-white'}`}
                  >
                    {pendingTarik.length}
                  </div>
                </div>
              </>
            ) : isPenghimpun ? (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/55">Setoran guru</div>
                  <div className="truncate text-[13px] font-bold tabular-nums text-white">
                    {formatRupiah(totalSetoranMasuk)}
                  </div>
                </div>
                <div className="w-px bg-white/15" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/55">Terima langsung</div>
                  <div className="truncate text-[13px] font-bold tabular-nums text-white">
                    {formatRupiah(totalLangsung)}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-white/55">Disetorkan ke</div>
                  <div className="truncate text-[13px] font-bold text-white">
                    {penghimpunNama ?? 'Belum ditetapkan'}
                  </div>
                </div>
                {jenis.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSetorBuka(true)}
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 self-center rounded-pill border-none bg-white px-4 py-2 text-[13px] font-extrabold text-text active:scale-95"
                  >
                    <ArrowUpRight size={14} /> Setor
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {!loading && isPenghimpun && (
        <TabunganHimpunanPanel
          setoran={setoran}
          rincian={rincianHimpun}
          terimaLangsung={terimaLangsung}
          guruNama={namaGuru}
          santriNama={namaSantri}
          jenisNama={namaJenis}
        />
      )}

      {!loading && !isAdmin && pendingTarik.length > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-card border border-[rgba(217,119,6,0.3)] bg-[rgba(217,119,6,0.06)] px-4 py-3 text-[13px] font-semibold text-brass">
          <Clock size={15} className="shrink-0" />
          {pendingTarik.length} penarikan menunggu persetujuan admin kelompok.
        </div>
      )}

      {!loading && jenis.length > 0 && (
        <>
          <div className="label-mikro mb-2">Per jenis tabungan</div>
          <div className="tanpa-scrollbar -mx-[18px] mb-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-1">
            {jenis.map((j) => {
              const t = totalPerJenis.get(j.id) ?? { total: 0, bulanIni: 0 };
              const persen =
                j.target_bulanan && j.target_bulanan > 0
                  ? Math.min(100, Math.round((t.bulanIni / j.target_bulanan) * 100))
                  : null;
              return (
                <div
                  key={j.id}
                  className="kartu-premium flex shrink-0 basis-[62%] snap-start flex-col p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 truncate text-[12px] font-bold text-text-dim">
                      {j.nama}
                    </div>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setJenisEdit(j)}
                        aria-label={`Atur ${j.nama}`}
                        className="-mt-1 -mr-1 shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-faint active:opacity-60"
                      >
                        <Settings2 size={15} />
                      </button>
                    )}
                  </div>
                  <div className="angka-metrik mt-1 text-[17px] text-text">
                    {formatRupiah(t.total)}
                  </div>
                  {persen !== null ? (
                    <div className="mt-auto pt-3">
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px]">
                        <span className="font-bold tabular-nums text-sage">{persen}%</span>
                        <span className="truncate text-text-faint">
                          bulan ini {formatRupiah(t.bulanIni)}
                        </span>
                      </div>
                      <div className="h-[5px] overflow-hidden rounded-pill bg-panel-2">
                        <div
                          className="h-full rounded-pill bg-sage transition-[width] duration-500"
                          style={{ width: `${persen}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto pt-3 text-[11px] text-text-faint">
                      Bulan ini {formatRupiah(t.bulanIni)}
                    </div>
                  )}
                </div>
              );
            })}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setJenisEdit('baru')}
                className="flex shrink-0 basis-[38%] snap-start cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border border-dashed border-border bg-panel text-[12px] font-bold text-text-dim active:scale-[0.98]"
              >
                <Plus size={17} /> Tambah
              </button>
            )}
          </div>
        </>
      )}

      {!loading && isAdmin && (
        <button
          type="button"
          onClick={() => setAturPenghimpun(true)}
          className="kartu-premium mb-5 flex w-full cursor-pointer items-center gap-3 p-4 text-left active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(79,70,229,0.1)] text-indigo">
            <UserCog size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="label-mikro">Penghimpun tabungan</div>
            <div className="mt-0.5 truncate text-[15px] font-extrabold text-text">
              {penghimpunNama ?? 'Tiap guru pegang sendiri'}
            </div>
            {penghimpun?.catatan && (
              <div className="truncate text-[12px] text-text-dim">{penghimpun.catatan}</div>
            )}
          </div>
          <Settings2 size={16} className="shrink-0 text-text-faint" />
        </button>
      )}

      {!loading && isAdmin && pendingTarik.length > 0 && (
        <div className="kartu-premium mb-5 overflow-hidden border-[rgba(217,119,6,0.3)]">
          <div className="flex items-center gap-1.5 border-b border-border bg-[rgba(217,119,6,0.06)] px-4 py-3 text-[11px] font-bold tracking-[0.06em] text-brass uppercase">
            <Clock size={14} /> Menunggu persetujuan ({pendingTarik.length})
          </div>
          <div className="flex flex-col">
            {pendingTarik.map((t) => {
              const j = jenis.find((x) => x.id === t.jenis_id);
              return (
                <div key={t.id} className="baris-daftar px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-bold text-text">
                        {namaSantri.get(t.santri_id) ?? `Santri #${t.santri_id}`}
                      </div>
                      <div className="text-[12px] text-text-dim">
                        {j?.nama ?? '-'} · {fmtTgl(t.tanggal)}
                        {t.keterangan ? ` · ${t.keterangan}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-[15px] font-extrabold tabular-nums text-brass">
                      − {formatRupiah(t.jumlah)}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={prosesId === t.id}
                      onClick={() => putusAdmin(t.id, true)}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius)] border border-sage bg-[rgba(5,150,105,0.08)] py-2 text-[13px] font-bold text-sage active:scale-[0.98] disabled:opacity-50"
                    >
                      <Check size={14} /> Setujui
                    </button>
                    <button
                      type="button"
                      disabled={prosesId === t.id}
                      onClick={() => putusAdmin(t.id, false)}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius)] border border-red bg-[rgba(220,38,38,0.06)] py-2 text-[13px] font-bold text-red active:scale-[0.98] disabled:opacity-50"
                    >
                      <Ban size={14} /> Tolak
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && isAdmin && setoran.length > 0 && (
        <div className="kartu-premium mb-5 overflow-hidden">
          <div className="label-mikro border-b border-border px-4 py-3">
            Setoran guru ke penghimpun
          </div>
          <div className="flex flex-col">
            {setoran.slice(0, 8).map((s) => (
              <div key={s.id} className="baris-daftar flex items-center justify-between gap-2 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-text">
                    {namaGuru.get(s.guru_id) ?? `Guru #${s.guru_id}`}
                  </div>
                  <div className="text-[12px] text-text-dim">
                    {fmtTgl(s.tanggal)}
                    {s.keterangan ? ` · ${s.keterangan}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-text">
                  {formatRupiah(s.jumlah)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="label-mikro mb-3">
        Generus{santriTersaring.length > 0 ? ` (${santriTersaring.length})` : ''}
      </div>

      <div className="relative mb-3">
        <Search size={15} className="absolute top-1/2 left-4 -translate-y-1/2 text-text-faint" />
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama generus..."
          className="w-full rounded-pill border border-border bg-panel py-2.5 pr-4 pl-10 text-[13px] text-text shadow-[var(--shadow-subtle)] focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />
      </div>

      {loading ? (
        <SkeletonKartuList />
      ) : jenis.length === 0 ? (
        <EmptyState
          ikon={<Banknote size={22} />}
          judul="Belum ada jenis tabungan"
          deskripsi={
            isAdmin
              ? 'Tambahkan jenis tabungan (mis. Rekreasi, Qurban) untuk mulai mencatat.'
              : 'Admin kelompok belum menyiapkan jenis tabungan.'
          }
          aksi={isAdmin ? { label: 'Tambah Jenis', onClick: () => setJenisEdit('baru') } : undefined}
        />
      ) : santriTersaring.length === 0 ? (
        <p className="rounded-card border border-border bg-panel-2 px-4 py-4 text-[13px] text-text-dim">
          {cari.trim() ? `Tidak ada yang cocok dengan "${cari.trim()}".` : 'Belum ada generus.'}
        </p>
      ) : (
        /* Satu kartu berisi baris-baris terbagi garis, BUKAN puluhan kartu
           melayang sendiri-sendiri -- daftar panjang jadi jauh lebih tenang
           dan terbaca sbg satu daftar, bukan tumpukan kotak. */
        <div className="kartu-premium overflow-hidden">
          {santriTersaring.map((s) => {
            const total = jenis.reduce((a, j) => a + (saldo.get(`${s.id}:${j.id}`) ?? 0), 0);
            const adaPending = tx.some(
              (t) => t.santri_id === s.id && t.arah === 'tarik' && t.status === 'pending',
            );
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSheetSantri(s)}
                className="baris-daftar flex w-full cursor-pointer items-center gap-3 border-none bg-transparent px-4 py-3 text-left active:bg-panel-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[12px] font-extrabold text-text-dim">
                  {inisialNama(s.nama)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-bold text-text">{s.nama}</span>
                    {adaPending && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-[rgba(217,119,6,0.12)] px-1.5 py-px text-[11px] font-bold text-brass">
                        <Clock size={9} /> TARIK
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-text-dim">
                    {jenis
                      .map(
                        (j) =>
                          `${j.nama.replace(/^Tabungan\s+/i, '')} ${formatRupiah(saldo.get(`${s.id}:${j.id}`) ?? 0)}`,
                      )
                      .join(' · ')}
                  </div>
                </div>
                <span
                  className={`shrink-0 text-[15px] font-extrabold tabular-nums ${total > 0 ? 'text-sage' : 'text-text-faint'}`}
                >
                  {formatRupiah(total)}
                </span>
                <ChevronRight size={15} className="-ml-1 shrink-0 text-text-faint" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <main className="relative flex min-h-screen flex-col bg-bg">
      {isAdmin ? <AdminHeader judul="Tabungan" /> : <JurnalHeaderChrome tampilkanHero={false} />}
      {body}

      {sheetSantri && kelompokId && (
        <TabunganSantriSheet
          santri={sheetSantri}
          kelompokId={kelompokId}
          jenisList={jenis}
          transaksi={txSantri(sheetSantri.id)}
          olehId={profile?.id ?? null}
          olehGuruId={guruId}
          guruNama={namaGuru}
          isAdmin={isAdmin}
          onSelesai={muat}
          onTutup={() => setSheetSantri(null)}
        />
      )}

      {setorBuka && kelompokId && guruId != null && (
        <TabunganSetorSheet
          kelompokId={kelompokId}
          guruId={guruId}
          penghimpunNama={penghimpunNama}
          terimaSaya={terimaSaya}
          setoranSaya={setoranSaya}
          jenisNama={namaJenis}
          santriNama={namaSantri}
          olehId={profile?.id ?? null}
          onSelesai={muat}
          onTutup={() => setSetorBuka(false)}
        />
      )}

      {aturPenghimpun && kelompokId && (
        <PenghimpunModal
          kelompokId={kelompokId}
          guruList={guru}
          awal={penghimpun}
          olehId={profile?.id ?? null}
          onSelesai={() => {
            setAturPenghimpun(false);
            sukses('Penghimpun tabungan disimpan.');
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
            sukses('Jenis tabungan disimpan.');
            muat();
          }}
          onBatal={() => setJenisEdit(null)}
        />
      )}
    </main>
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
  awal: Penghimpun | null;
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
          <h2 className="text-[17px] font-extrabold text-text">Penghimpun Tabungan</h2>
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
          Guru/pengurus yang diamanahi menghimpun uang tabungan dari guru-guru lain. Pilih
          &quot;Tiap guru pegang sendiri&quot; jika di kelompok Anda tidak dihimpun jadi satu.
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
          placeholder="Misal: setor tiap akhir bulan"
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
  awal: TabunganJenis | null;
  olehId: string | null;
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const [nama, setNama] = useState(awal?.nama ?? '');
  const [target, setTarget] = useState(awal?.target_bulanan != null ? String(awal.target_bulanan) : '');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function simpan() {
    setError(null);
    if (!nama.trim()) return setError('Nama tabungan wajib diisi.');
    setSibuk(true);
    try {
      const t = target.replace(/\D/g, '');
      await simpanJenis(
        kelompokId,
        awal?.id ?? null,
        { nama: nama.trim(), target_bulanan: t ? Number(t) : null },
        olehId,
      );
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
          <h2 className="text-[17px] font-extrabold text-text">
            {awal ? 'Atur Jenis Tabungan' : 'Tambah Jenis Tabungan'}
          </h2>
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
          placeholder="Misal: Tabungan Rekreasi"
          className="mb-3 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">
          Target per Bulan (opsional)
        </label>
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-3.5 focus-within:border-brass">
          <span className="text-[13px] font-bold text-text-dim">Rp</span>
          <input
            inputMode="numeric"
            value={target ? Number(target.replace(/\D/g, '')).toLocaleString('id-ID') : ''}
            onChange={(e) => setTarget(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full border-none bg-transparent py-2.5 text-[15px] font-extrabold tabular-nums text-text outline-none"
          />
        </div>

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

export default function TabunganPage() {
  return (
    <RequireAuth>
      <TabunganContent />
    </RequireAuth>
  );
}
