'use client';

/* Sheet "Setor ke Penghimpun" — guru menyerahkan uang tabungan yang
   sudah terkumpul di tangannya ke guru/pengurus yang diamanahi
   admin_kelompok. Memindahkan kas, TIDAK mengubah saldo santri.

   Kalau admin belum menetapkan penghimpun (guru_id NULL) berarti tiap
   guru memegang tabungannya sendiri — setoran tetap bisa dicatat
   sebagai arsip, tapi diberi catatan. */

import { useMemo, useState } from 'react';
import { X, Trash2, ArrowUpRight } from 'lucide-react';
import { useToast } from '@/components/ui/useToast';
import { catatSetoran, hapusSetoran, formatRupiah, type Setoran } from '@/lib/tabungan';

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
  kasDiTangan,
  setoranSaya,
  olehId,
  onSelesai,
  onTutup,
}: {
  kelompokId: number;
  guruId: number;
  penghimpunNama: string | null; // null = penghimpun belum ditetapkan
  kasDiTangan: number;
  setoranSaya: Setoran[];
  olehId: string | null;
  onSelesai: () => void;
  onTutup: () => void;
}) {
  const { sukses } = useToast();
  const [jumlah, setJumlah] = useState('');
  const [tanggal, setTanggal] = useState(hariIni());
  const [keterangan, setKeterangan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prosesId, setProsesId] = useState<number | null>(null);

  const nJumlah = Number(jumlah.replace(/\D/g, '')) || 0;
  const urut = useMemo(
    () => [...setoranSaya].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [setoranSaya],
  );

  async function simpan() {
    setError(null);
    if (nJumlah <= 0) return setError('Nominal harus lebih dari 0.');
    setSibuk(true);
    try {
      await catatSetoran(
        kelompokId,
        { guru_id: guruId, jumlah: nJumlah, tanggal, keterangan: keterangan.trim() || null },
        olehId,
      );
      sukses('Setoran ke penghimpun dicatat.');
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
    setProsesId(id);
    try {
      await hapusSetoran(id);
      sukses('Setoran dihapus.');
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setProsesId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
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
            <div className="text-[11.5px] font-semibold text-text-dim">Kas di tangan Anda</div>
            <div className="mt-0.5 text-[24px] leading-none font-extrabold tabular-nums text-text">
              {formatRupiah(kasDiTangan)}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11.5px] text-text-dim">
              <ArrowUpRight size={13} className="text-brass" />
              Penghimpun:&nbsp;
              <span className="font-bold text-text">
                {penghimpunNama ?? 'belum ditetapkan admin'}
              </span>
            </div>
          </div>

          <div className="mb-4 rounded-card border border-border p-3.5">
            <div className="flex flex-col gap-2.5">
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
              {nJumlah > 0 && nJumlah > kasDiTangan && (
                <p className="text-[11px] text-brass">
                  Melebihi kas di tangan Anda ({formatRupiah(kasDiTangan)}).
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
              {sibuk ? 'Menyimpan...' : 'Catat Setoran'}
            </button>
          </div>

          <div className="mb-1 text-[12px] font-bold tracking-[0.02em] text-text-dim uppercase">
            Riwayat Setoran ({urut.length})
          </div>
          {urut.length === 0 ? (
            <p className="py-3 text-[12.5px] text-text-dim">Belum ada setoran.</p>
          ) : (
            <div className="flex flex-col">
              {urut.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(217,119,6,0.12)] text-brass">
                    <ArrowUpRight size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-bold tabular-nums text-text">
                      {formatRupiah(s.jumlah)}
                    </div>
                    <div className="text-[11px] text-text-dim">
                      {fmtTgl(s.tanggal)}
                      {s.keterangan ? ` · ${s.keterangan}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={prosesId === s.id}
                    onClick={() => hapus(s.id)}
                    aria-label="Hapus setoran"
                    className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-faint active:opacity-60 disabled:opacity-40"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
