'use client';

/* Statistik konseling + riwayat per santri — padanan
   serverGetKonselingStats dan serverGetKonselingBySantri
   (Modul_MaintainKonseling.gs:274-385).

   Dihitung dari baris yang SUDAH dimuat halaman induk, bukan lewat query
   baru: satu kelompok punya puluhan catatan konseling, bukan ribuan, jadi
   menghitungnya di sini tidak menambah beban apa pun. Berbeda dari
   statistik kehadiran yang membaca seluruh riwayat absensi dan karena itu
   harus diagregasi di Postgres.

   Riwayat per santri sengaja TIDAK memuat ulang dari server — datanya sudah
   ada di tangan, tinggal disaring. */

import { useMemo, useState } from 'react';

export type BarisKonseling = {
  id: number;
  santri_id: number;
  tanggal: string;
  kategori: string;
  masalah: string;
  status: string;
  aksi: string | null;
  catatan_tindak_lanjut: string | null;
  santri: { nama: string } | { nama: string }[] | null;
};

function namaSantri(nilai: BarisKonseling['santri']) {
  if (!nilai) return '-';
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? '-';
}

const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

export default function StatistikKonseling({ daftar }: { daftar: BarisKonseling[] }) {
  const [santriDibuka, setSantriDibuka] = useState<number | null>(null);

  const perKategori = useMemo(() => {
    const peta = new Map<string, number>();
    for (const k of daftar) peta.set(k.kategori, (peta.get(k.kategori) ?? 0) + 1);
    return [...peta.entries()].sort((a, b) => b[1] - a[1]);
  }, [daftar]);

  /* Santri dengan lebih dari satu catatan — justru ini yang paling berguna
     dilihat pembina: masalah berulang, bukan kejadian tunggal. */
  const berulang = useMemo(() => {
    const peta = new Map<number, { nama: string; jumlah: number; aktif: number }>();
    for (const k of daftar) {
      const s = peta.get(k.santri_id) ?? { nama: namaSantri(k.santri), jumlah: 0, aktif: 0 };
      s.jumlah += 1;
      if (k.status === 'aktif') s.aktif += 1;
      peta.set(k.santri_id, s);
    }
    return [...peta.entries()]
      .filter(([, v]) => v.jumlah > 1)
      .sort((a, b) => b[1].jumlah - a[1].jumlah)
      .slice(0, 10);
  }, [daftar]);

  const riwayat = useMemo(
    () =>
      santriDibuka == null
        ? []
        : daftar
            .filter((k) => k.santri_id === santriDibuka)
            .sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [daftar, santriDibuka]
  );

  if (daftar.length === 0) return null;

  return (
    <div className="mb-6 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 text-[15px] font-bold text-text">Ringkasan</div>

      <div className="mb-5">
        <div className="mb-2 text-[12px] font-semibold text-text-dim">Per kategori</div>
        <div className="flex flex-wrap gap-2">
          {perKategori.map(([kat, n]) => (
            <span
              key={kat}
              className="rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] text-text"
            >
              {kat} <span className="font-bold">{n}</span>
            </span>
          ))}
        </div>
      </div>

      {berulang.length > 0 && (
        <div>
          <div className="mb-2 text-[12px] font-semibold text-text-dim">
            Santri dengan catatan berulang
          </div>
          <p className="mb-3 text-[11px] text-text-faint">
            Yang muncul lebih dari sekali. Ini yang biasanya perlu perhatian lanjutan, bukan
            kejadian tunggal.
          </p>
          {berulang.map(([id, v]) => (
            <div
              key={id}
              className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2"
            >
              <span className="text-[13px] text-text">
                {v.nama}
                <span className="ml-2 text-[11px] text-text-dim">
                  {v.jumlah} catatan
                  {v.aktif > 0 ? ` · ${v.aktif} masih aktif` : ''}
                </span>
              </span>
              <button
                onClick={() => setSantriDibuka(santriDibuka === id ? null : id)}
                className={KELAS_TOMBOL_SEKUNDER}
              >
                {santriDibuka === id ? 'Tutup riwayat' : 'Lihat riwayat'}
              </button>
            </div>
          ))}
        </div>
      )}

      {santriDibuka != null && riwayat.length > 0 && (
        <div className="mt-4 rounded-[var(--radius)] border border-border bg-panel-2 p-3">
          <div className="mb-2 text-[12px] font-bold text-text">
            Riwayat {namaSantri(riwayat[0].santri)}
          </div>
          {riwayat.map((k) => (
            <div key={k.id} className="mb-2 border-l-2 border-border pl-3">
              <div className="text-[11px] text-text-dim">
                {k.tanggal} · {k.kategori} · {k.status}
              </div>
              <div className="text-[12px] whitespace-pre-line text-text">{k.masalah}</div>
              {k.aksi && <div className="text-[11px] text-text-dim">Aksi: {k.aksi}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
