'use client';

/* Sheet "Setor ke Penghimpun" — guru menyerahkan uang tabungan yang
   sudah terkumpul ke guru/pengurus yang diamanahi admin_kelompok.

   Setoran = SEIKAT penerimaan tertentu. Guru mencentang penerimaan mana
   yang ia serahkan (nama anak + jenis + nominal), total dihitung
   otomatis, lalu tiap penerimaan ditandai masuk setoran ini -> keluar
   dari "kas di tangan" & jadi rincian yang dilihat penghimpun. Tidak ada
   selisih antara catatan guru & penghimpun. */

import { useMemo, useRef, useState } from 'react';
import { X, Trash2, ArrowUpRight, ChevronDown, Calendar } from 'lucide-react';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import {
  catatSetoran,
  hapusSetoran,
  formatRupiah,
  type Setoran,
  type Transaksi,
} from '@/lib/tabungan';

function hariIni() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function fmtTgl(iso: string) {
  const [y, m, d] = iso.split('-');
  const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(d)} ${b[Number(m) - 1] ?? m} ${y}`;
}

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';

export default function TabunganSetorSheet({
  kelompokId,
  guruId,
  penghimpunNama,
  terimaSaya,
  setoranSaya,
  jenisNama,
  santriNama,
  olehId,
  onSelesai,
  onTutup,
}: {
  kelompokId: number;
  guruId: number;
  penghimpunNama: string | null;
  terimaSaya: Transaksi[]; // SEMUA terima yg dicatat guru ini (sudah/belum disetor)
  setoranSaya: Setoran[];
  jenisNama: Map<number, string>;
  santriNama: Map<number, string>;
  olehId: string | null;
  onSelesai: () => void;
  onTutup: () => void;
}) {
  const { sukses } = useToast();
  const [tanggal, setTanggal] = useState(hariIni());
  const [keterangan, setKeterangan] = useState('');
  const [pilih, setPilih] = useState<Set<number>>(new Set());
  const [terpakai, setTerpakai] = useState(false); // sudah pernah utak-atik centang?
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bukaId, setBukaId] = useState<number | null>(null);
  const [prosesId, setProsesId] = useState<number | null>(null);
  const [tglBuka, setTglBuka] = useState(false);
  const [posTgl, setPosTgl] = useState<PosisiPicker | null>(null);
  const tglRef = useRef<HTMLButtonElement>(null);

  function bukaTgl() {
    const r = tglRef.current?.getBoundingClientRect();
    if (r) setPosTgl({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setTglBuka(true);
  }

  const belumSetor = useMemo(
    () =>
      [...terimaSaya]
        .filter((t) => t.setoran_id == null)
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
    [terimaSaya],
  );

  /* Default: semua tercentang sampai guru menyentuh centang. */
  const dipilih = terpakai ? pilih : new Set(belumSetor.map((t) => t.id));
  const total = belumSetor.filter((t) => dipilih.has(t.id)).reduce((a, t) => a + t.jumlah, 0);

  function toggle(id: number) {
    const next = new Set(dipilih);
    next.has(id) ? next.delete(id) : next.add(id);
    setPilih(next);
    setTerpakai(true);
  }

  const urutSetoran = useMemo(
    () => [...setoranSaya].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [setoranSaya],
  );
  const rincianSetoran = (id: number) => terimaSaya.filter((t) => t.setoran_id === id);

  async function simpan() {
    setError(null);
    const ids = belumSetor.filter((t) => dipilih.has(t.id)).map((t) => t.id);
    if (ids.length === 0) return setError('Pilih minimal satu penerimaan untuk disetor.');
    setSibuk(true);
    try {
      await catatSetoran(
        kelompokId,
        { guru_id: guruId, tanggal, keterangan: keterangan.trim() || null },
        ids,
        total,
        olehId,
      );
      sukses(`Setoran ${formatRupiah(total)} ke penghimpun dicatat.`);
      setKeterangan('');
      setPilih(new Set());
      setTerpakai(false);
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapus(id: number) {
    setProsesId(id);
    try {
      await hapusSetoran(id);
      sukses('Setoran dibatalkan — penerimaan kembali ke kas Anda.');
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setProsesId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <TanggalPicker
        terbuka={tglBuka}
        posisi={posTgl}
        nilai={tanggal}
        onPilih={setTanggal}
        onTutup={() => setTglBuka(false)}
      />
      <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[17px] font-extrabold text-text">Setor ke Penghimpun</h2>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 rounded-card bg-panel-2 p-4">
            <div className="text-[11.5px] font-semibold text-text-dim">Akan disetor</div>
            <div className="mt-0.5 text-[24px] leading-none font-extrabold tabular-nums text-text">
              {formatRupiah(total)}
            </div>
            <div className="mt-2 text-[11.5px] text-text-dim">
              Penghimpun:&nbsp;
              <span className="font-bold text-text">{penghimpunNama ?? 'belum ditetapkan admin'}</span>
            </div>
          </div>

          {/* Pilih penerimaan */}
          <div className="mb-1 text-[12px] font-bold tracking-[0.02em] text-text-dim uppercase">
            Rincian penerimaan ({belumSetor.length})
          </div>
          {belumSetor.length === 0 ? (
            <p className="py-3 text-[12.5px] text-text-dim">
              Tidak ada penerimaan yang belum disetor.
            </p>
          ) : (
            <div className="mb-4 flex flex-col rounded-card border border-border">
              {belumSetor.map((t) => {
                const on = dipilih.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t.id)}
                    className="flex items-center gap-3 border-b border-border px-3.5 py-2.5 text-left last:border-b-0 active:bg-bg"
                  >
                    <span
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-white ${
                        on ? 'border-brass bg-brass' : 'border-border bg-panel'
                      }`}
                    >
                      {on && (
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.5">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-bold text-text">
                        {santriNama.get(t.santri_id) ?? `Santri #${t.santri_id}`}
                      </div>
                      <div className="text-[11px] text-text-dim">
                        {jenisNama.get(t.jenis_id) ?? '-'} · {fmtTgl(t.tanggal)}
                      </div>
                    </div>
                    <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-text">
                      {formatRupiah(t.jumlah)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {belumSetor.length > 0 && (
            <div className="mb-4 flex flex-col gap-2.5">
              <button
                type="button"
                ref={tglRef}
                onClick={bukaTgl}
                className={`${INPUT} flex items-center justify-between text-left`}
              >
                {fmtTgl(tanggal)}
                <Calendar size={14} className="shrink-0 text-text-faint" />
              </button>
              <input
                className={INPUT}
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Keterangan (opsional)"
              />
              {error && <p className="text-[12px] text-red">{error}</p>}
              <button
                type="button"
                disabled={sibuk}
                onClick={simpan}
                className="w-full cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {sibuk ? 'Menyimpan...' : 'Catat Setoran'}
              </button>
            </div>
          )}
          {belumSetor.length === 0 && error && <p className="mb-4 text-[12px] text-red">{error}</p>}

          {/* Riwayat setoran */}
          <div className="mb-1 text-[12px] font-bold tracking-[0.02em] text-text-dim uppercase">
            Riwayat Setoran ({urutSetoran.length})
          </div>
          {urutSetoran.length === 0 ? (
            <p className="py-3 text-[12.5px] text-text-dim">Belum ada setoran.</p>
          ) : (
            <div className="flex flex-col">
              {urutSetoran.map((s) => {
                const rinci = rincianSetoran(s.id);
                const buka = bukaId === s.id;
                return (
                  <div key={s.id} className="border-b border-border py-1 last:border-b-0">
                    <div className="flex items-center gap-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => setBukaId(buka ? null : s.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(217,119,6,0.12)] text-brass">
                          <ArrowUpRight size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-bold tabular-nums text-text">
                            {formatRupiah(s.jumlah)}
                            <span className="ml-1.5 text-[11px] font-semibold text-text-dim">
                              {rinci.length} anak
                            </span>
                          </div>
                          <div className="text-[11px] text-text-dim">
                            {fmtTgl(s.tanggal)}
                            {s.keterangan ? ` · ${s.keterangan}` : ''}
                          </div>
                        </div>
                        <ChevronDown
                          size={15}
                          className={`shrink-0 text-text-faint transition-transform ${buka ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <button
                        type="button"
                        disabled={prosesId === s.id}
                        onClick={() => hapus(s.id)}
                        aria-label="Batalkan setoran"
                        className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-faint active:opacity-60 disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {buka && (
                      <div className="mb-1.5 ml-9 flex flex-col rounded-[var(--radius)] bg-panel-2 px-3 py-1">
                        {rinci.map((t) => (
                          <div
                            key={t.id}
                            className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-[11.5px] last:border-b-0"
                          >
                            <span className="min-w-0 truncate font-semibold text-text">
                              {santriNama.get(t.santri_id) ?? `Santri #${t.santri_id}`}
                              <span className="text-text-dim"> · {jenisNama.get(t.jenis_id) ?? '-'}</span>
                            </span>
                            <span className="shrink-0 tabular-nums font-bold text-text">
                              {formatRupiah(t.jumlah)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
