'use client';

/* Panel "Himpunan Tabungan" — hanya tampil di akun guru yang ditunjuk
   admin_kelompok sebagai PENGHIMPUN. Menampilkan total seluruh setoran
   yang masuk + rincian siapa saja yang menyetor, sampai ke tingkat
   (nama anak · jenis · nominal) supaya cocok dengan catatan tiap guru. */

import { useMemo, useState } from 'react';
import { ChevronDown, Landmark } from 'lucide-react';
import { formatRupiah, type Setoran, type Transaksi } from '@/lib/tabungan';

function fmtTgl(iso: string) {
  const [y, m, d] = iso.split('-');
  const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(d)} ${b[Number(m) - 1] ?? m} ${y}`;
}

export default function TabunganHimpunanPanel({
  setoran,
  rincian,
  guruNama,
  santriNama,
  jenisNama,
}: {
  setoran: Setoran[];
  rincian: Transaksi[]; // transaksi 'terima' yg punya setoran_id
  guruNama: Map<number, string>;
  santriNama: Map<number, string>;
  jenisNama: Map<number, string>;
}) {
  const [bukaGuru, setBukaGuru] = useState<number | null>(null);

  const total = useMemo(() => setoran.reduce((a, s) => a + s.jumlah, 0), [setoran]);
  const rincianPerSetoran = useMemo(() => {
    const m = new Map<number, Transaksi[]>();
    for (const t of rincian) {
      if (t.setoran_id == null) continue;
      const arr = m.get(t.setoran_id) ?? [];
      arr.push(t);
      m.set(t.setoran_id, arr);
    }
    return m;
  }, [rincian]);

  const perGuru = useMemo(() => {
    const m = new Map<number, { total: number; setoran: Setoran[] }>();
    for (const s of setoran) {
      const e = m.get(s.guru_id) ?? { total: 0, setoran: [] };
      e.total += s.jumlah;
      e.setoran.push(s);
      m.set(s.guru_id, e);
    }
    return [...m.entries()]
      .map(([guruId, v]) => ({
        guruId,
        total: v.total,
        setoran: v.setoran.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [setoran]);

  return (
    <div className="mb-5 rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 border-b border-border p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(13,148,136,0.12)] text-teal">
          <Landmark size={19} />
        </span>
        <div>
          <div className="text-[11.5px] font-semibold text-text-dim">
            Total himpunan tabungan (Anda penghimpun)
          </div>
          <div className="text-[22px] leading-none font-extrabold tabular-nums text-text">
            {formatRupiah(total)}
          </div>
        </div>
      </div>

      {perGuru.length === 0 ? (
        <p className="px-4 py-4 text-[12.5px] text-text-dim">Belum ada guru yang menyetor.</p>
      ) : (
        <div className="flex flex-col">
          {perGuru.map((g) => {
            const buka = bukaGuru === g.guruId;
            return (
              <div key={g.guruId} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => setBukaGuru(buka ? null : g.guruId)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-bold text-text">
                      {guruNama.get(g.guruId) ?? `Guru #${g.guruId}`}
                    </div>
                    <div className="text-[11px] text-text-dim">{g.setoran.length} setoran</div>
                  </div>
                  <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-text">
                    {formatRupiah(g.total)}
                  </span>
                  <ChevronDown
                    size={15}
                    className={`shrink-0 text-text-faint transition-transform ${buka ? 'rotate-180' : ''}`}
                  />
                </button>

                {buka && (
                  <div className="flex flex-col gap-2 px-4 pb-3">
                    {g.setoran.map((s) => {
                      const rinci = rincianPerSetoran.get(s.id) ?? [];
                      return (
                        <div key={s.id} className="rounded-[var(--radius)] bg-panel-2 p-3">
                          <div className="mb-1 flex items-center justify-between text-[12px]">
                            <span className="font-bold text-text">{fmtTgl(s.tanggal)}</span>
                            <span className="font-extrabold tabular-nums text-text">
                              {formatRupiah(s.jumlah)}
                            </span>
                          </div>
                          {s.keterangan && (
                            <div className="mb-1 text-[11px] text-text-dim">{s.keterangan}</div>
                          )}
                          <div className="flex flex-col">
                            {rinci.length === 0 ? (
                              <span className="py-1 text-[11px] text-text-faint">
                                Tanpa rincian per anak.
                              </span>
                            ) : (
                              rinci.map((t) => (
                                <div
                                  key={t.id}
                                  className="flex items-center justify-between gap-2 border-t border-border py-1.5 text-[11.5px] first:border-t-0"
                                >
                                  <span className="min-w-0 truncate font-semibold text-text">
                                    {santriNama.get(t.santri_id) ?? `Santri #${t.santri_id}`}
                                    <span className="text-text-dim">
                                      {' '}
                                      · {jenisNama.get(t.jenis_id) ?? '-'}
                                    </span>
                                  </span>
                                  <span className="shrink-0 font-bold tabular-nums text-text">
                                    {formatRupiah(t.jumlah)}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
