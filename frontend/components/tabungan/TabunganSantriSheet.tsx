'use client';

/* Sheet detail tabungan satu santri — dipakai layar guru & admin
   (/tabungan). Atas: saldo per jenis. Tengah: form Terima / Tarik.
   Bawah: riwayat transaksi (status penarikan + hapus / setujui).

   - TERIMA : guru terima tunai dari generus, efektif seketika.
   - TARIK  : diajukan sbg 'pending', WAJIB disetujui admin_kelompok.
     Di layar admin, baris pending bisa langsung disetujui/ditolak. */

import { useMemo, useRef, useState } from 'react';
import { X, ArrowDownCircle, ArrowUpCircle, Trash2, Check, Clock, Ban, Calendar } from 'lucide-react';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import {
  catatTransaksi,
  hapusTransaksi,
  putuskanTarik,
  formatRupiah,
  txMempengaruhiSaldo,
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
  olehGuruId = null,
  guruNama,
  isAdmin = false,
  onSelesai,
  onTutup,
}: {
  santri: { id: number; nama: string };
  kelompokId: number;
  jenisList: TabunganJenis[];
  transaksi: Transaksi[]; // milik santri ini saja
  olehId: string | null;
  olehGuruId?: number | null;
  guruNama: Map<number, string>;
  isAdmin?: boolean;
  onSelesai: () => void; // panggil muat ulang di parent
  onTutup: () => void;
}) {
  const { sukses } = useToast();
  const [jenisId, setJenisId] = useState<number>(jenisList[0]?.id ?? 0);
  const [arah, setArah] = useState<'terima' | 'tarik'>('terima');
  const [jumlah, setJumlah] = useState('');
  const [tanggal, setTanggal] = useState(hariIni());
  const [keterangan, setKeterangan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prosesId, setProsesId] = useState<number | null>(null);
  const [tglBuka, setTglBuka] = useState(false);
  const [posTgl, setPosTgl] = useState<PosisiPicker | null>(null);
  const tglRef = useRef<HTMLButtonElement>(null);

  function bukaTgl() {
    const r = tglRef.current?.getBoundingClientRect();
    if (r) setPosTgl({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setTglBuka(true);
  }

  const saldoPerJenis = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of transaksi) {
      if (!txMempengaruhiSaldo(t)) continue;
      m.set(t.jenis_id, (m.get(t.jenis_id) ?? 0) + (t.arah === 'terima' ? t.jumlah : -t.jumlah));
    }
    return m;
  }, [transaksi]);

  const nJumlah = Number(jumlah.replace(/\D/g, '')) || 0;
  const saldoJenisIni = saldoPerJenis.get(jenisId) ?? 0;

  async function simpan() {
    setError(null);
    if (!jenisId) return setError('Pilih jenis tabungan.');
    if (nJumlah <= 0) return setError('Nominal harus lebih dari 0.');
    if (arah === 'tarik' && nJumlah > saldoJenisIni)
      return setError(`Penarikan melebihi saldo (${formatRupiah(saldoJenisIni)}).`);
    setSibuk(true);
    try {
      await catatTransaksi(
        kelompokId,
        {
          jenis_id: jenisId,
          santri_id: santri.id,
          arah,
          jumlah: nJumlah,
          tanggal,
          keterangan: keterangan.trim() || null,
        },
        olehId,
        olehGuruId,
      );
      sukses(
        arah === 'terima'
          ? 'Penerimaan tabungan dicatat.'
          : isAdmin
            ? 'Penarikan dicatat.'
            : 'Permintaan penarikan dikirim — menunggu persetujuan admin.',
      );
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
      await hapusTransaksi(id);
      sukses('Transaksi dihapus.');
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setProsesId(null);
    }
  }

  async function putus(id: number, setuju: boolean) {
    setProsesId(id);
    try {
      await putuskanTarik(id, setuju, olehId);
      sukses(setuju ? 'Penarikan disetujui.' : 'Penarikan ditolak.');
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memproses.');
    } finally {
      setProsesId(null);
    }
  }

  const txUrut = [...transaksi].sort((a, b) => b.created_at.localeCompare(a.created_at));

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
                onClick={() => setArah('terima')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border-[1.5px] py-2 text-[12.5px] font-bold ${
                  arah === 'terima'
                    ? 'border-sage bg-[rgba(5,150,105,0.08)] text-sage'
                    : 'border-border text-text-dim'
                }`}
              >
                <ArrowDownCircle size={15} /> Terima
              </button>
              <button
                type="button"
                onClick={() => setArah('tarik')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] border-[1.5px] py-2 text-[12.5px] font-bold ${
                  arah === 'tarik'
                    ? 'border-brass bg-[rgba(217,119,6,0.08)] text-brass'
                    : 'border-border text-text-dim'
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
            </div>

            {arah === 'tarik' && !isAdmin && (
              <p className="mt-2 flex items-start gap-1.5 rounded-[var(--radius)] bg-[rgba(217,119,6,0.08)] px-2.5 py-2 text-[11px] font-semibold text-brass">
                <Clock size={13} className="mt-px shrink-0" />
                Penarikan tabungan wajib menunggu persetujuan admin kelompok sebelum dana keluar.
              </p>
            )}

            {error && <p className="mt-2 text-[12px] text-red">{error}</p>}

            <button
              type="button"
              disabled={sibuk}
              onClick={simpan}
              className="mt-3 w-full cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {sibuk
                ? 'Menyimpan...'
                : arah === 'terima'
                  ? 'Catat Penerimaan'
                  : isAdmin
                    ? 'Catat Penarikan'
                    : 'Ajukan Penarikan'}
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
                const pending = t.arah === 'tarik' && t.status === 'pending';
                const ditolak = t.arah === 'tarik' && t.status === 'ditolak';
                const bolehHapus = !(t.arah === 'tarik' && t.status === 'disetujui');
                return (
                  <div key={t.id} className="border-b border-border py-2.5 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                          t.arah === 'terima'
                            ? 'bg-[rgba(5,150,105,0.12)] text-sage'
                            : 'bg-[rgba(217,119,6,0.12)] text-brass'
                        }`}
                      >
                        {t.arah === 'terima' ? <ArrowDownCircle size={15} /> : <ArrowUpCircle size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[13px] font-bold tabular-nums ${ditolak ? 'text-text-faint line-through' : 'text-text'}`}
                          >
                            {t.arah === 'tarik' ? '− ' : ''}
                            {formatRupiah(t.jumlah)}
                          </span>
                          {pending && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[rgba(217,119,6,0.12)] px-1.5 py-px text-[9.5px] font-bold text-brass">
                              <Clock size={9} /> MENUNGGU
                            </span>
                          )}
                          {ditolak && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-[rgba(220,38,38,0.12)] px-1.5 py-px text-[9.5px] font-bold text-red">
                              <Ban size={9} /> DITOLAK
                            </span>
                          )}
                        </div>
                        {/* Nama pencatat ikut ditampilkan sejak ada DUA
                            jalur uang masuk (guru kelas atau langsung ke
                            penghimpun) -- tanpa itu guru kelas melihat
                            penerimaan yang bukan catatannya lalu mencatat
                            ulang, dan saldo anaknya jadi dobel. */}
                        <div className="text-[11px] text-text-dim">
                          {j?.nama ?? '-'} · {fmtTgl(t.tanggal)}
                          {t.dicatat_guru_id != null && guruNama.get(t.dicatat_guru_id)
                            ? ` · ${guruNama.get(t.dicatat_guru_id)}`
                            : ''}
                          {t.keterangan ? ` · ${t.keterangan}` : ''}
                        </div>
                      </div>
                      {bolehHapus && (
                        <button
                          type="button"
                          disabled={prosesId === t.id}
                          onClick={() => hapus(t.id)}
                          aria-label="Hapus transaksi"
                          className="shrink-0 cursor-pointer border-none bg-transparent p-1 text-text-faint active:opacity-60 disabled:opacity-40"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {isAdmin && pending && (
                      <div className="mt-2 flex gap-2 pl-10">
                        <button
                          type="button"
                          disabled={prosesId === t.id}
                          onClick={() => putus(t.id, true)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius)] border border-sage bg-[rgba(5,150,105,0.08)] py-1.5 text-[11.5px] font-bold text-sage disabled:opacity-50"
                        >
                          <Check size={13} /> Setujui
                        </button>
                        <button
                          type="button"
                          disabled={prosesId === t.id}
                          onClick={() => putus(t.id, false)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-[var(--radius)] border border-red bg-[rgba(220,38,38,0.06)] py-1.5 text-[11.5px] font-bold text-red disabled:opacity-50"
                        >
                          <Ban size={13} /> Tolak
                        </button>
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
