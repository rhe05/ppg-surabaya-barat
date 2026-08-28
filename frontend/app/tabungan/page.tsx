'use client';

/* Fitur "Tabungan" (2026-08-28) — tabungan generus per-SANTRI.
   - guru: lihat & catat setoran/penarikan santri yang dia ajar.
   - admin_kelompok: atur jenis + target bulanan, lihat total keseluruhan
     & per-santri se-kelompok.
   Data: lib/tabungan.ts (tabel tabungan_jenis + tabungan_transaksi,
   migrasi 20260828100000). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Search, Settings2, Plus, X } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import AdminHeader from '@/components/dashboard/AdminHeader';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import EmptyState from '@/components/ui/EmptyState';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import { useToast } from '@/components/ui/useToast';
import TabunganSantriSheet from '@/components/tabungan/TabunganSantriSheet';
import {
  muatJenis,
  muatTransaksiKelompok,
  muatTransaksiSantri,
  simpanJenis,
  formatRupiah,
  type TabunganJenis,
  type Transaksi,
} from '@/lib/tabungan';

type Santri = { id: number; nama: string };

const bulanIniPrefix = () => new Date().toISOString().slice(0, 7);

function saldoMap(tx: Transaksi[]) {
  const m = new Map<string, number>();
  for (const t of tx) {
    const k = `${t.santri_id}:${t.jenis_id}`;
    m.set(k, (m.get(k) ?? 0) + (t.arah === 'masuk' ? t.jumlah : -t.jumlah));
  }
  return m;
}

function TabunganContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin_kelompok';
  const kelompokId = profile?.scope_kelompok_id ?? null;
  const guruId = profile?.guru_id ?? null;
  const { sukses } = useToast();

  const [jenis, setJenis] = useState<TabunganJenis[]>([]);
  const [santri, setSantri] = useState<Santri[]>([]);
  const [tx, setTx] = useState<Transaksi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');
  const [sheetSantri, setSheetSantri] = useState<Santri | null>(null);
  const [jenisEdit, setJenisEdit] = useState<TabunganJenis | 'baru' | null>(null);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const j = await muatJenis(kelompokId);
      setJenis(j);

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
        /* Guru: santri di kelas yang dia ampu. */
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

  const saldo = useMemo(() => saldoMap(tx), [tx]);

  const totalPerJenis = useMemo(() => {
    const m = new Map<number, { total: number; bulanIni: number }>();
    const pfx = bulanIniPrefix();
    for (const j of jenis) m.set(j.id, { total: 0, bulanIni: 0 });
    for (const t of tx) {
      const e = m.get(t.jenis_id);
      if (!e) continue;
      e.total += t.arah === 'masuk' ? t.jumlah : -t.jumlah;
      if (t.arah === 'masuk' && t.tanggal.startsWith(pfx)) e.bulanIni += t.jumlah;
    }
    return m;
  }, [jenis, tx]);

  const santriTersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    return term ? santri.filter((s) => s.nama.toLowerCase().includes(term)) : santri;
  }, [santri, cari]);

  const txSantri = (id: number) => tx.filter((t) => t.santri_id === id);

  const body = (
    <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-24">
      <h1 className="mb-1 text-[20px] font-extrabold text-text">Tabungan</h1>
      <p className="mb-5 text-[13px] text-text-dim">
        {isAdmin
          ? 'Total tabungan generus se-kelompok, target bulanan, dan rincian per anak.'
          : 'Catat setoran & penarikan tabungan generus yang Anda ajar.'}
      </p>

      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

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
                      <div
                        className="h-full rounded-full bg-sage"
                        style={{ width: `${persen}%` }}
                      />
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
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSheetSantri(s)}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-text">{s.nama}</div>
                  <div className="mt-0.5 text-[11px] text-text-dim">
                    {jenis
                      .map((j) => `${j.nama.replace(/^Tabungan\s+/i, '')}: ${formatRupiah(saldo.get(`${s.id}:${j.id}`) ?? 0)}`)
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
          onSelesai={muat}
          onTutup={() => setSheetSantri(null)}
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
