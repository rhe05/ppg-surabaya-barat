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
import { Banknote, Search, Settings2, Plus, X, Wallet, ArrowUpRight, Clock, Check, Ban, UserCog } from 'lucide-react';
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
  formatRupiah,
  type TabunganJenis,
  type Transaksi,
  type Setoran,
  type Penghimpun,
} from '@/lib/tabungan';

type Santri = { id: number; nama: string };
type Guru = { id: number; nama: string };

const bulanIniPrefix = () => new Date().toISOString().slice(0, 7);
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
  const [santriHimpun, setSantriHimpun] = useState<Santri[]>([]);
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

      /* Guru yang ditunjuk sbg penghimpun: muat rincian semua setoran +
         nama santri se-kelompok (rincian menyentuh santri guru lain). */
      const akuPenghimpun = !isAdmin && pHimp?.guru_id != null && pHimp.guru_id === guruId;
      if (akuPenghimpun && sRes.length > 0) {
        const [rinci, { data: dSH }] = await Promise.all([
          muatRincianSetoran(sRes.map((s) => s.id)).catch(() => [] as Transaksi[]),
          supabase.from('santri').select('id, nama').eq('kelompok_id', kelompokId).is('deleted_at', null),
        ]);
        setRincianHimpun(rinci);
        setSantriHimpun((dSH ?? []) as Santri[]);
      } else {
        setRincianHimpun([]);
        setSantriHimpun([]);
      }

      if (isAdmin) {
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
  const namaSantri = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of santri) m.set(s.id, s.nama);
    for (const s of santriHimpun) m.set(s.id, s.nama);
    return m;
  }, [santri, santriHimpun]);
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
    () => (guruId != null ? kasDiTanganGuru(tx, profile?.id ?? null) : 0),
    [tx, profile?.id, guruId],
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

  const body = (
    <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-24">
      <h1 className="mb-1 text-[20px] font-extrabold text-text">Tabungan</h1>
      <p className="mb-5 text-[13px] text-text-dim">
        {isAdmin
          ? 'Total tabungan generus, penghimpun, persetujuan penarikan, dan rincian per anak.'
          : 'Terima setoran generus, setor ke penghimpun, ajukan penarikan.'}
      </p>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {/* Guru: kas di tangan + setor */}
      {!loading && !isAdmin && jenis.length > 0 && (
        <button
          type="button"
          onClick={() => setSetorBuka(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(217,119,6,0.12)] text-brass">
            <Wallet size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-semibold text-text-dim">Kas di tangan Anda</div>
            <div className="text-[19px] leading-tight font-extrabold tabular-nums text-text">
              {formatRupiah(kasGuru)}
            </div>
            <div className="text-[11px] text-text-dim">
              Penghimpun: <span className="font-bold text-text">{penghimpunNama ?? 'belum ditetapkan'}</span>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-brass px-3 py-1.5 text-[11.5px] font-bold text-white">
            <ArrowUpRight size={13} /> Setor
          </span>
        </button>
      )}

      {/* Penghimpun: total himpunan + rincian per guru */}
      {!loading && isPenghimpun && (
        <TabunganHimpunanPanel
          setoran={setoran}
          rincian={rincianHimpun}
          guruNama={namaGuru}
          santriNama={namaSantri}
          jenisNama={namaJenis}
        />
      )}

      {/* Guru: penarikan yang masih menunggu */}
      {!loading && !isAdmin && pendingTarik.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-card border border-[rgba(217,119,6,0.3)] bg-[rgba(217,119,6,0.06)] px-3.5 py-2.5 text-[12px] font-semibold text-brass">
          <Clock size={14} className="shrink-0" />
          {pendingTarik.length} penarikan menunggu persetujuan admin kelompok.
        </div>
      )}

      {/* Admin: penghimpun */}
      {!loading && isAdmin && (
        <button
          type="button"
          onClick={() => setAturPenghimpun(true)}
          className="mb-4 flex w-full items-center gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(79,70,229,0.1)] text-indigo">
            <UserCog size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11.5px] font-semibold text-text-dim">Penghimpun tabungan</div>
            <div className="text-[15px] font-extrabold text-text">
              {penghimpunNama ?? 'Tiap guru pegang sendiri'}
            </div>
            {penghimpun?.catatan && (
              <div className="text-[11px] text-text-dim">{penghimpun.catatan}</div>
            )}
          </div>
          <Settings2 size={16} className="shrink-0 text-text-dim" />
        </button>
      )}

      {/* Admin: antrean persetujuan penarikan */}
      {!loading && isAdmin && pendingTarik.length > 0 && (
        <div className="mb-5 rounded-card border border-[rgba(217,119,6,0.3)] bg-panel shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-3 text-[12.5px] font-extrabold text-brass">
            <Clock size={14} /> Penarikan Menunggu Persetujuan ({pendingTarik.length})
          </div>
          <div className="flex flex-col">
            {pendingTarik.map((t) => {
              const j = jenis.find((x) => x.id === t.jenis_id);
              return (
                <div key={t.id} className="border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-bold text-text">
                        {namaSantri.get(t.santri_id) ?? `Santri #${t.santri_id}`}
                      </div>
                      <div className="text-[11px] text-text-dim">
                        {j?.nama ?? '-'} · {fmtTgl(t.tanggal)}
                        {t.keterangan ? ` · ${t.keterangan}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-[14px] font-extrabold tabular-nums text-brass">
                      − {formatRupiah(t.jumlah)}
                    </div>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      disabled={prosesId === t.id}
                      onClick={() => putusAdmin(t.id, true)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius)] border border-sage bg-[rgba(5,150,105,0.08)] py-2 text-[12px] font-bold text-sage disabled:opacity-50"
                    >
                      <Check size={14} /> Setujui
                    </button>
                    <button
                      type="button"
                      disabled={prosesId === t.id}
                      onClick={() => putusAdmin(t.id, false)}
                      className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius)] border border-red bg-[rgba(220,38,38,0.06)] py-2 text-[12px] font-bold text-red disabled:opacity-50"
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

      {/* Ringkasan per jenis */}
      {!loading && jenis.length > 0 && (
        <div className="mb-5 flex flex-col gap-3">
          {jenis.map((j) => {
            const t = totalPerJenis.get(j.id) ?? { total: 0, bulanIni: 0 };
            const persen =
              j.target_bulanan && j.target_bulanan > 0
                ? Math.min(100, Math.round((t.bulanIni / j.target_bulanan) * 100))
                : null;
            return (
              <div
                key={j.id}
                className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold text-text-dim">{j.nama}</div>
                    <div className="mt-0.5 text-[22px] leading-none font-extrabold tabular-nums text-text">
                      {formatRupiah(t.total)}
                    </div>
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setJenisEdit(j)}
                      aria-label={`Atur ${j.nama}`}
                      className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-dim active:opacity-60"
                    >
                      <Settings2 size={16} />
                    </button>
                  )}
                </div>
                {persen !== null && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] font-semibold text-text-dim">
                      <span>Bulan ini {formatRupiah(t.bulanIni)}</span>
                      <span>Target {formatRupiah(j.target_bulanan!)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
                      <div className="h-full rounded-full bg-sage" style={{ width: `${persen}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setJenisEdit('baru')}
              className="flex items-center justify-center gap-2 rounded-card border border-dashed border-border bg-panel py-3 text-[12.5px] font-bold text-text-dim active:scale-[0.99]"
            >
              <Plus size={15} /> Tambah Jenis Tabungan
            </button>
          )}
        </div>
      )}

      {/* Admin: rekap setoran guru */}
      {!loading && isAdmin && setoran.length > 0 && (
        <div className="mb-5 rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
          <div className="border-b border-border px-4 py-3 text-[12.5px] font-extrabold text-text">
            Setoran Guru ke Penghimpun
          </div>
          <div className="flex flex-col">
            {setoran.slice(0, 8).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-text">
                    {namaGuru.get(s.guru_id) ?? `Guru #${s.guru_id}`}
                  </div>
                  <div className="text-[11px] text-text-dim">
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

      {/* Daftar santri */}
      <div className="relative mb-4">
        <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-text-faint" />
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama generus..."
          className="w-full rounded-[var(--radius)] border border-border bg-panel py-2.5 pr-3.5 pl-9 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
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
        <p className="text-[13px] text-text-dim">
          {cari.trim() ? `Tidak ada yang cocok dengan "${cari.trim()}".` : 'Belum ada generus.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
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
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-bold text-text">{s.nama}</span>
                    {adaPending && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[rgba(217,119,6,0.12)] px-1.5 py-px text-[9px] font-bold text-brass">
                        <Clock size={8} /> TARIK
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-dim">
                    {jenis
                      .map(
                        (j) =>
                          `${j.nama.replace(/^Tabungan\s+/i, '')}: ${formatRupiah(saldo.get(`${s.id}:${j.id}`) ?? 0)}`,
                      )
                      .join(' · ')}
                  </div>
                </div>
                <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-sage">
                  {formatRupiah(total)}
                </span>
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
