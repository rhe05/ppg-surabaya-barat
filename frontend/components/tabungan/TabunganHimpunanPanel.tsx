'use client';

/* Panel "Himpunan Tabungan" — hanya tampil di akun guru yang ditunjuk
   admin_kelompok sebagai PENGHIMPUN. Menampilkan total seluruh setoran
   yang masuk + rincian siapa saja yang menyetor, sampai ke tingkat
   (nama anak · jenis · nominal) supaya cocok dengan catatan tiap guru.

   Sejak 2026-08-29 uang bisa datang lewat DUA jalur, dan totalnya harus
   mencakup keduanya:
     cara 1  guru kelas -> Setor -> penghimpun   (`setoran` + `rincian`)
     cara 2  generus -> penghimpun langsung      (`terimaLangsung`)
   Cara 2 sengaja tidak punya baris `tabungan_setoran` -- tidak ada
   perpindahan tangan yang perlu dicatat -- jadi kalau tidak ikut
   dijumlahkan di sini, uang itu tidak muncul di total mana pun. */

import { useMemo, useState } from 'react';
import { ChevronDown, Landmark, HandCoins } from 'lucide-react';
import { formatRupiah, type Setoran, type Transaksi } from '@/lib/tabungan';

function fmtTgl(iso: string) {
  const [y, m, d] = iso.split('-');
  const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(d)} ${b[Number(m) - 1] ?? m} ${y}`;
}

export default function TabunganHimpunanPanel({
  setoran,
  rincian,
  terimaLangsung,
  guruNama,
  santriNama,
  jenisNama,
}: {
  setoran: Setoran[];
  rincian: Transaksi[]; // transaksi 'terima' yg punya setoran_id
  terimaLangsung: Transaksi[]; // cara 2: generus -> penghimpun langsung
  guruNama: Map<number, string>;
  santriNama: Map<number, string>;
  jenisNama: Map<number, string>;
}) {
  const [bukaGuru, setBukaGuru] = useState<number | null>(null);
  const [bukaLangsung, setBukaLangsung] = useState(false);

  const totalSetoran = useMemo(() => setoran.reduce((a, s) => a + s.jumlah, 0), [setoran]);
  const totalLangsung = useMemo(
    () => terimaLangsung.reduce((a, t) => a + t.jumlah, 0),
    [terimaLangsung],
  );
  const langsungUrut = useMemo(
    () => [...terimaLangsung].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [terimaLangsung],
  );
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
    <div className="kartu-premium mb-5 overflow-hidden">
      {/* Kepala panel sengaja TIDAK mengulang angka besarnya lagi: panel
          saldo gelap di atas halaman sudah menyebut total yang sama persis
          beserta rinciannya. Dua angka raksasa identik bersebelahan justru
          membuat pembacanya ragu apakah keduanya benda yang sama. */}
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(13,148,136,0.12)] text-teal">
          <Landmark size={15} />
        </span>
        <div className="label-mikro">Rincian himpunan</div>
      </div>

      {/* Cara 2 lebih dulu: ini uang yang ADA DI TANGAN penghimpun sendiri
          dan paling sering perlu dicocokkan, bukan riwayat orang lain. */}
      {langsungUrut.length > 0 && (
        <div className="border-b border-border">
          <button
            type="button"
            onClick={() => setBukaLangsung(!bukaLangsung)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[rgba(5,150,105,0.12)] text-sage">
              <HandCoins size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-text">
                Diterima langsung oleh Anda
              </div>
              <div className="text-[11px] text-text-dim">
                {langsungUrut.length} penerimaan · tanpa lewat guru kelas
              </div>
            </div>
            <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-text">
              {formatRupiah(totalLangsung)}
            </span>
            <ChevronDown
              size={15}
              className={`shrink-0 text-text-faint transition-transform ${bukaLangsung ? 'rotate-180' : ''}`}
            />
          </button>

          {bukaLangsung && (
            <div className="px-4 pb-3">
              <div className="rounded-[var(--radius)] bg-panel-2 p-3">
                {langsungUrut.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 border-t border-border py-1.5 text-[12px] first:border-t-0"
                  >
                    <span className="min-w-0 truncate font-semibold text-text">
                      {santriNama.get(t.santri_id) ?? `Santri #${t.santri_id}`}
                      <span className="text-text-dim">
                        {' '}
                        · {jenisNama.get(t.jenis_id) ?? '-'} · {fmtTgl(t.tanggal)}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums text-text">
                      {formatRupiah(t.jumlah)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {perGuru.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-text-dim">Belum ada guru yang menyetor.</p>
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
                    <div className="truncate text-[13px] font-bold text-text">
                      {guruNama.get(g.guruId) ?? `Guru #${g.guruId}`}
                    </div>
                    <div className="text-[11px] text-text-dim">{g.setoran.length} setoran</div>
                  </div>
                  <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-text">
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
                                  className="flex items-center justify-between gap-2 border-t border-border py-1.5 text-[12px] first:border-t-0"
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
