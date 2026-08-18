'use client';

/* Isi target bulanan sekaligus — padanan serverSetProbulBulan dan
   upsertProbulFromTargetLines_ (Modul_MaintainKurikulum.gs:260, 707).

   Aturan pemetaannya diambil apa adanya dari app lama: BARIS KE-N dari
   target semester menjadi target BULAN KE-N. Jadi mengetik enam baris
   sekaligus mengisi enam bulan, alih-alih membuka enam borang.

   Dua perilaku app lama yang dipertahankan karena keduanya disengaja:
   - Bulan yang sudah ada targetnya DIPERBARUI, bukan digandakan.
   - Bulan yang TIDAK punya baris (misal hanya diketik 4 baris padahal 6
     bulan sudah terisi) DIBIARKAN apa adanya, bukan dikosongkan. Mengetik
     lebih sedikit berarti "yang ini saja yang saya ubah", bukan "hapus
     sisanya". */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

type Probul = { id: number; bulan: number; target: string | null };

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_TOMBOL_UTAMA =
  'cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] ' +
  'font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

export default function TargetBulanan({
  promesId,
  kelompokId,
  kategoriKbmId,
  tahun,
  semester,
  probulAda,
  onSelesai,
  onTutup,
}: {
  promesId: number;
  kelompokId: number;
  kategoriKbmId: number;
  tahun: number;
  semester: number;
  probulAda: Probul[];
  onSelesai: () => void;
  onTutup: () => void;
}) {
  /* Semester 1 = bulan 1-6, semester 2 = bulan 7-12. Nomor bulan di app
     lama memang absolut, bukan urutan dalam semester. */
  const bulanAwal = semester === 1 ? 1 : 7;
  const bulanSemester = Array.from({ length: 6 }, (_, i) => bulanAwal + i);

  const [teks, setTeks] = useState(
    bulanSemester
      .map((b) => probulAda.find((p) => p.bulan === b)?.target ?? '')
      .join('\n')
      .replace(/\n+$/, '')
  );
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const barisTeks = teks.split('\n');

  async function simpan() {
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      let dibuat = 0;
      let diperbarui = 0;

      for (let i = 0; i < barisTeks.length && i < 6; i++) {
        const target = barisTeks[i].trim();
        /* Baris kosong = bulan itu tidak disentuh sama sekali. */
        if (!target) continue;

        const bulan = bulanAwal + i;
        const ada = probulAda.find((p) => p.bulan === bulan);

        if (ada) {
          const { error: err } = await supabase
            .from('kurikulum_probul')
            .update({ target })
            .eq('id', ada.id);
          if (err) throw new Error(err.message);
          diperbarui += 1;
        } else {
          const { error: err } = await supabase.from('kurikulum_probul').insert({
            promes_id: promesId,
            kelompok_id: kelompokId,
            kategori_kbm_id: kategoriKbmId,
            tahun,
            bulan,
            target,
          });
          if (err) throw new Error(err.message);
          dibuat += 1;
        }
      }

      setPesan(`${dibuat} bulan dibuat, ${diperbarui} diperbarui.`);
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan target bulanan.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-text">Target Bulanan Semester {semester}</h2>
            <p className="text-[12px] text-text-dim">
              Satu baris untuk satu bulan, urut dari {NAMA_BULAN[bulanAwal - 1]}.
            </p>
          </div>
          <button onClick={onTutup} className={KELAS_TOMBOL_SEKUNDER}>
            Tutup
          </button>
        </div>

        <textarea
          rows={8}
          className={KELAS_INPUT + ' mb-2 font-mono'}
          value={teks}
          onChange={(e) => setTeks(e.target.value)}
          placeholder={'Hal. 1 - 9\nHal. 10 - 18\nHal. 19 - 27'}
        />

        <div className="mb-4 rounded-[var(--radius)] border border-border bg-panel-2 p-3">
          <div className="mb-2 text-[11px] font-semibold text-text-dim">Hasil pemetaan</div>
          {bulanSemester.map((b, i) => {
            const isi = (barisTeks[i] ?? '').trim();
            const ada = probulAda.find((p) => p.bulan === b);
            return (
              <div key={b} className="flex items-center gap-2 text-[12px]">
                <span className="w-24 text-text-dim">{NAMA_BULAN[b - 1]}</span>
                <span className={isi ? 'text-text' : 'text-text-faint'}>
                  {isi || (ada ? `(dibiarkan: ${ada.target ?? 'kosong'})` : '(tidak diisi)')}
                </span>
              </div>
            );
          })}
        </div>

        <p className="mb-4 text-[11px] text-text-faint">
          Baris kosong berarti bulan itu tidak disentuh — target lamanya tetap, tidak dihapus.
        </p>

        {pesan && <p className="mb-3 text-[13px] text-sage">{pesan}</p>}
        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}

        <button onClick={simpan} disabled={sibuk} className={KELAS_TOMBOL_UTAMA}>
          {sibuk ? 'Menyimpan...' : 'Simpan Target Bulanan'}
        </button>
      </div>
    </div>
  );
}
