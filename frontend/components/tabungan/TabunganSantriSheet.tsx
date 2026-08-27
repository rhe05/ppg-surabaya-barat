'use client';

/* Sheet detail tabungan satu santri — dipakai layar guru & admin
   (/tabungan). Atas: saldo per jenis. Tengah: form catat setoran/
   penarikan. Bawah: riwayat transaksi (bisa dihapus). */

import { useMemo, useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/useToast';
import {
  catatTransaksi,
  hapusTransaksi,
  formatRupiah,
  type TabunganJenis,
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

export default function TabunganSantriSheet({
  santri,
  kelompokId,
  jenisList,
  transaksi,
  olehId,
  onSelesai,
  onTutup,
}: {
  santri: { id: number; nama: string };
  kelompokId: number;
  jenisList: TabunganJenis[];
  transaksi: Transaksi[]; // milik santri ini saja
  olehId: string | null;
  onSelesai: () => void; // panggil muat ulang di parent
  onTutup: () => void;
}) {
  const { sukses } = useToast();
  const [jenisId, setJenisId] = useState<number>(jenisList[0]?.id ?? 0);
  const [arah, setArah] = useState<'masuk' | 'keluar'>('masuk');
  const [jumlah, setJumlah] = useState('');
  const [tanggal, setTanggal] = useState(hariIni());
  const [keterangan, setKeterangan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saldoPerJenis = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of transaksi)
      m.set(t.jenis_id, (m.get(t.jenis_id) ?? 0) + (t.arah === 'masuk' ? t.jumlah : -t.jumlah));
    return m;
  }, [transaksi]);

  const nJumlah = Number(jumlah.replace(/\D/g, '')) || 0;
  const saldoJenisIni = saldoPerJenis.get(jenisId) ?? 0;

  async function simpan() {
    setError(null);
    if (!jenisId) return setError('Pilih jenis tabungan.');
    if (nJumlah <= 0) return setError('Nominal harus lebih dari 0.');
    setSibuk(true);
    try {
      await catatTransaksi(
        kelompokId,
        { jenis_id: jenisId, santri_id: santri.id, arah, jumlah: nJumlah, tanggal, keterangan: keterangan.trim() || null },
        olehId,
      );
      sukses(arah === 'masuk' ? 'Setoran dicatat.' : 'Penarikan dicatat.');
      setJumlah('');
      setKeterangan('');
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapus(id: number) {
    try {
      await hapusTransaksi(id);
      sukses('Transaksi dihapus.');
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  const txUrut = [...transaksi].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="min-w-0 truncate text-[17px] font-extrabold text-text">{santri.nama}</h2>
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
          {/* Saldo per jenis */}
          <div className="mb-4 flex flex-col gap-2">
            {jenisList.map((j) => (
              <div
                key={j.id}
                className="flex items-center justify-between rounded-[var(--radius)] bg-panel-2 px-3.5 py-2.5"
              >
                <span className="text-[12.5px] font-semibold text-text-dim">{j.nama}</span>
                <span className="text-[15px] font-extrabold tabular-nums text-text">
                  {formatRupiah(saldoPerJenis.get(j.id) ?? 0)}
                </span>
              </div>
            ))}
          </div>

          {/* Form catat */}
          <div className="mb-4 rounded-card border border-border p-3.5">
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => setArah('masuk')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border-[1.5px] py-2 text-[12.5px] font-bold ${
                  arah === 'masuk' ? 'border-sage bg-[rgba(5,150,105,0.08)] text-sage' : 'border-border text-text-dim'
                }`}
              >
                <ArrowDownCircle size={15} /> Setor
              </button>
              <button
                type="button"
                onClick={() => setArah('keluar')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border-[1.5px] py-2 text-[12.5px] font-bold ${
                  arah === 'keluar' ? 'border-brass bg-[rgba(217,119,6,0.08)] text-brass' : 'border-border text-text-dim'
                }`}
              >
                <ArrowUpCircle size={15} /> Tarik
              </button>
            </div>

            <div className="flex flex-col gap-2.5">
              {jenisList.length > 1 && (
                <select className={INPUT} value={jenisId} onChange={(e) => setJenisId(Number(e.target.value))}>
                  {jenisList.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-3.5 focus-within:border-brass focus-within:shadow-[0_0_0_3px_rgba(217,119,6,0.1)]">
                <span className="text-[13px] font-bold text-text-dim">Rp</span>
                <input
                  inputMode="numeric"
                  value={jumlah ? Number(jumlah.replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                  onChange={(e) => setJumlah(e.target.value.replace(/\D/g, ''))}
                  placeholder="0"
                  className="w-full border-none bg-transparent py-2.5 text-[15px] font-extrabold tabular-nums text-text outline-none"
                />
              </div>
              {arah === 'keluar' && nJumlah > saldoJenisIni && (
                <p className="text-[11px] text-brass">
                  Penarikan melebihi saldo ({formatRupiah(saldoJenisIni)}) — saldo akan minus.
                </p>
              )}
              <input
                type="date"
                className={INPUT}
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
              />
              <input
                className={INPUT}
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Keterangan (opsional)"
              />
            </div>

            {error && <p className="mt-2 text-[12px] text-red">{error}</p>}

            <button
              type="button"
              disabled={sibuk}
              onClick={simpan}
              className="mt-3 w-full cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {sibuk ? 'Menyimpan...' : arah === 'masuk' ? 'Catat Setoran' : 'Catat Penarikan'}
            </button>
          </div>

          {/* Riwayat */}
          <div className="mb-1 text-[12px] font-bold tracking-[0.02em] text-text-dim uppercase">
            Riwayat ({txUrut.length})
          </div>
          {txUrut.length === 0 ? (
            <p className="py-3 text-[12.5px] text-text-dim">Belum ada transaksi.</p>
          ) : (
            <div className="flex flex-col">
              {txUrut.map((t) => {
                const j = jenisList.find((x) => x.id === t.jenis_id);
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        t.arah === 'masuk' ? 'bg-[rgba(5,150,105,0.12)] text-sage' : 'bg-[rgba(217,119,6,0.12)] text-brass'
                      }`}
                    >
                      {t.arah === 'masuk' ? <ArrowDownCircle size={15} /> : <ArrowUpCircle size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-text tabular-nums">
                        {t.arah === 'keluar' ? '− ' : ''}
                        {formatRupiah(t.jumlah)}
                      </div>
                      <div className="text-[11px] text-text-dim">
                        {j?.nama ?? '-'} · {fmtTgl(t.tanggal)}
                        {t.keterangan ? ` · ${t.keterangan}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => hapus(t.id)}
                      aria-label="Hapus transaksi"
                      className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-faint active:opacity-60"
                    >
                      <Trash2 size={15} />
                    </button>
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
