'use client';

/* Kartu "Tilawati" / "Al-Qur'an" di Riwayat Pembelajaran (guru mobile) --
   DIPISAH dari RiwayatPembelajaranView.tsx (2026-09-13, diminta owner),
   pola SAMA PERSIS KartuTilawatiAlquran.tsx (Pelaksanaan): kelas GABUNGAN
   (Gabung Kelas "tanpa batas waktu") bisa lintas-grade (mis. kelas 3 +
   Pra Remaja SMP) -- santri kelas <=3 masuk kartu Tilawati, kelas 4+
   masuk kartu Al-Qur'an, keduanya bisa tampil sekaligus. Dulu SATU kartu
   dgn `pakaiAlquran` polos dari grade tertinggi gabungan.

   Baca-saja + hapus (bukan simpan-otomatis spt Pelaksanaan) -- salinan
   PERSIS isi & mekanik kartu lama, cuma sumber datanya sekarang
   `anggotaIds` (subset kelas_id fisik utk grade INI), bukan seluruh
   gabungan. */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Skeleton from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/useToast';
import { muatTilawatiRingkas, labelBukuJilid, type TilawatiRingkas } from '@/lib/tilawati';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
function formatTanggalHari(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')} ${NAMA_BULAN[d.getMonth()]}`;
}

export default function KartuRiwayatTilawati({
  judul,
  pakaiAlquran,
  anggotaIds,
  awal,
  akhir,
  bulanLabel,
  tahun,
  adalahPengunjung,
  peragaNode,
}: {
  judul: string;
  pakaiAlquran: boolean;
  anggotaIds: number[];
  awal: string;
  akhir: string;
  bulanLabel: string;
  tahun: number;
  adalahPengunjung: boolean;
  /* Peraga Tilawati -- HANYA relevan kartu Tilawati (bukan Al-Qur'an),
     dirender di sini lewat prop krn sumbernya (jurnal_materi) &
     renderernya (barisRiwayat) milik komponen induk. */
  peragaNode?: ReactNode;
}) {
  const { push } = useToast();
  const [terbuka, setTerbuka] = useState(true);
  const [ringkas, setRingkas] = useState<TilawatiRingkas[]>([]);
  const [loading, setLoading] = useState(false);
  const [hapusId, setHapusId] = useState<number | null>(null);
  const [menghapus, setMenghapus] = useState(false);

  const anggotaKey = anggotaIds.join(',');

  const muat = useCallback(async () => {
    if (anggotaIds.length === 0) {
      setRingkas([]);
      return;
    }
    setLoading(true);
    try {
      setRingkas(await muatTilawatiRingkas(anggotaIds, awal, akhir));
    } catch (e) {
      push(e instanceof Error ? e.message : `Gagal memuat ${judul}.`, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anggotaKey, awal, akhir]);
  useEffect(() => {
    muat();
  }, [muat]);

  async function hapusCatatan(id: number) {
    if (adalahPengunjung) {
      push('Mode Pengunjung: menghapus permanen catatan ini belum tersedia.', 'info');
      setHapusId(null);
      return;
    }
    setMenghapus(true);
    try {
      const { data, error } = await supabase.from('tilawati_pelaksanaan').delete().eq('id', id).select('id');
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error('Baris tidak terhapus -- kemungkinan bukan kelas Anda, atau sudah dihapus dari perangkat lain.');
      }
      setHapusId(null);
      push('Catatan Buku Jilid dihapus.', 'sukses');
      await muat();
    } catch (e) {
      push(e instanceof Error ? e.message : 'Gagal menghapus catatan.', 'error');
    } finally {
      setMenghapus(false);
    }
  }

  return (
    <div className="kartu-premium mb-4 overflow-hidden">
      <button
        type="button"
        onClick={() => setTerbuka((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 border-none bg-transparent p-4 text-left"
      >
        <span className="text-[15px] font-bold text-text">{judul}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-indigo-lembut px-2.5 py-1 text-[11px] font-bold text-indigo">
            {ringkas.length} Santri
          </span>
          <ChevronDown size={16} className={`text-text-faint transition-transform duration-150 ${terbuka ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {terbuka && (
        <div className="border-t border-border">
          {!pakaiAlquran && peragaNode}
          {!pakaiAlquran && (
            <div className="label-mikro border-y border-border bg-panel-2 px-4 py-2">Buku Jilid</div>
          )}
          {loading ? (
            <div className="p-3">
              <Skeleton className="h-[44px] w-full" />
            </div>
          ) : ringkas.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-text-dim">
              Belum ada catatan Buku Jilid pada {bulanLabel} {tahun}.
            </p>
          ) : (
            ringkas.map((s) => (
              <div key={s.santriId} className="border-b border-border pb-2 last:border-b-0">
                <div className="px-4 pt-2.5 pb-1 text-[13px] font-bold text-text">{s.nama}</div>
                {s.hari.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-2 px-4 py-1 text-[12px]">
                    <span className="min-w-0 truncate text-text-dim">
                      {formatTanggalHari(h.tanggal)}
                      {h.jilid ? ` · ${labelBukuJilid(h.jilid)}` : ''}
                      {h.halaman ? ` hal ${h.halaman}` : ''}
                      {h.surat ? ` · ${h.surat}` : ''}
                      {h.ayat ? ` ayat ${h.ayat}` : ''}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {h.status && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            h.status === 'naik' ? 'bg-sage-lembut text-sage' : 'bg-brass-lembut text-brass'
                          }`}
                        >
                          {h.status === 'naik' ? 'Naik' : 'Tetap'}
                        </span>
                      )}
                      {hapusId === h.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={menghapus}
                            onClick={() => hapusCatatan(h.id)}
                            className="rounded-full bg-red px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-50"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setHapusId(null)}
                            className="rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-text-dim"
                          >
                            Batal
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label="Hapus catatan ini"
                          onClick={() => setHapusId(h.id)}
                          className="flex h-5 w-5 items-center justify-center rounded-full text-text-faint hover:bg-red-lembut hover:text-red"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
