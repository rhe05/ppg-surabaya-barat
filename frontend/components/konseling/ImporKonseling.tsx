'use client';

/* Impor massal konseling dari CSV — padanan serverBulkImportKonseling
   (Modul_MaintainKonseling.gs:385).

   BERBEDA DARI IMPOR SANTRI, dan alasannya perlu ditulis: impor santri
   memakai RPC di Postgres karena tiap baris harus melewati pembuatan NIS
   yang atomik. Konseling tidak punya kebutuhan itu — barisnya berdiri
   sendiri, jadi penyisipan biasa sudah benar, dan menambah satu fungsi
   basis data lagi hanya menambah yang harus dirawat.

   Santri dicocokkan lewat NIS, bukan nama. Nama kembar itu lumrah di
   daftar santri, dan mengimpor catatan konseling ke orang yang salah jauh
   lebih buruk daripada impornya gagal.

   Gagal sebagian: baris yang bermasalah dilaporkan dengan nomor barisnya,
   sisanya tetap masuk. */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

const KOLOM_WAJIB = ['nis', 'tanggal', 'kategori', 'masalah', 'status'];
const CONTOH =
  'nis,tanggal,kategori,masalah,status,aksi\n' +
  '260001,2026-08-18,perilaku,Sering terlambat masuk kelas,aktif,Sudah dibicarakan dengan orang tua';

type Gagal = { baris: number; nis: string; alasan: string };
type Santri = { id: number; nis: string | null };

function pecahBaris(baris: string): string[] {
  const hasil: string[] = [];
  let saat = '';
  let dalamKutip = false;
  for (let i = 0; i < baris.length; i++) {
    const c = baris[i];
    if (dalamKutip) {
      if (c === '"') {
        if (baris[i + 1] === '"') {
          saat += '"';
          i++;
        } else dalamKutip = false;
      } else saat += c;
    } else if (c === '"') dalamKutip = true;
    else if (c === ',') {
      hasil.push(saat);
      saat = '';
    } else saat += c;
  }
  hasil.push(saat);
  return hasil.map((v) => v.trim());
}

const KELAS_TOMBOL_UTAMA =
  'cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] ' +
  'font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

export default function ImporKonseling({
  kelompokId,
  santriList,
  pencatatId,
  onSelesai,
  onTutup,
}: {
  kelompokId: number;
  santriList: Santri[];
  pencatatId: string | null;
  onSelesai: () => void;
  onTutup: () => void;
}) {
  const [baris, setBaris] = useState<Record<string, string>[]>([]);
  const [namaBerkas, setNamaBerkas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ berhasil: number; gagal: Gagal[] } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  async function bacaBerkas(f: File) {
    setError(null);
    setHasil(null);
    setNamaBerkas(f.name);
    try {
      const teks = await f.text();
      const barisTeks = teks.split(/\r?\n/).filter((b) => b.trim() !== '');
      if (barisTeks.length < 2) throw new Error('Berkas tidak berisi baris data.');

      const kepala = pecahBaris(barisTeks[0]).map((h) => h.toLowerCase());
      const hilang = KOLOM_WAJIB.filter((k) => !kepala.includes(k));
      if (hilang.length) throw new Error(`Kolom wajib belum ada: ${hilang.join(', ')}`);

      const isi = barisTeks.slice(1).map((b) => {
        const sel = pecahBaris(b);
        return Object.fromEntries(kepala.map((h, i) => [h, sel[i] ?? '']));
      });
      if (isi.length > 200)
        throw new Error(`Berkas berisi ${isi.length} baris. Maksimal 200 per impor.`);
      setBaris(isi);
    } catch (e) {
      setBaris([]);
      setError(e instanceof Error ? e.message : 'Gagal membaca berkas.');
    }
  }

  async function impor() {
    setSibuk(true);
    setError(null);
    const gagal: Gagal[] = [];
    let berhasil = 0;

    /* NIS -> id, dibangun sekali. Perbandingannya tanpa membedakan huruf
       besar-kecil karena NIS kadang diketik ulang dari kertas. */
    const petaNis = new Map(
      santriList.filter((s) => s.nis).map((s) => [String(s.nis).trim().toUpperCase(), s.id])
    );

    for (let i = 0; i < baris.length; i++) {
      const b = baris[i];
      const nis = (b.nis ?? '').trim().toUpperCase();
      const santriId = petaNis.get(nis);

      if (!santriId) {
        gagal.push({ baris: i + 1, nis: b.nis ?? '', alasan: 'NIS tidak ditemukan di kelompok ini' });
        continue;
      }
      if ((b.masalah ?? '').trim().length < 5) {
        gagal.push({ baris: i + 1, nis: b.nis ?? '', alasan: 'Masalah harus minimal 5 karakter' });
        continue;
      }

      const { error: err } = await supabase.from('konseling').insert({
        santri_id: santriId,
        kelompok_id: kelompokId,
        tanggal: b.tanggal,
        kategori: b.kategori,
        masalah: b.masalah.trim(),
        status: b.status,
        aksi: (b.aksi ?? '').trim() || null,
        catatan_tindak_lanjut: (b.catatan_tindak_lanjut ?? '').trim() || null,
        pencatat_id: pencatatId,
      });

      if (err) {
        gagal.push({
          baris: i + 1,
          nis: b.nis ?? '',
          alasan:
            err.code === '23505'
              ? 'Sudah ada catatan untuk santri ini pada tanggal tersebut'
              : err.message,
        });
      } else berhasil += 1;
    }

    setHasil({ berhasil, gagal });
    setSibuk(false);
    onSelesai();
  }

  function unduhContoh() {
    const blob = new Blob([CONTOH], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contoh_impor_konseling.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="my-8 w-full max-w-2xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-text">Impor Konseling dari CSV</h2>
            <p className="text-[12px] text-text-dim">Maksimal 200 baris per berkas.</p>
          </div>
          <button onClick={onTutup} className={KELAS_TOMBOL_SEKUNDER}>
            Tutup
          </button>
        </div>

        <div className="mb-4 rounded-[var(--radius)] border border-border bg-panel-2 p-3 text-[12px] text-text">
          <div className="mb-1 font-semibold">Kolom wajib</div>
          <code className="text-[11px] text-text-dim">{KOLOM_WAJIB.join(', ')}</code>
          <p className="mt-2 text-[11px] text-text-faint">
            Santri dicocokkan lewat <strong>NIS</strong>, bukan nama — nama kembar lumrah, dan
            mencatat konseling ke orang yang salah jauh lebih buruk daripada impor yang gagal.
            Kategori: akademik, perilaku, emosional, sosial, kesehatan, lainnya. Status: aktif,
            pending, selesai.
          </p>
          <button onClick={unduhContoh} className={KELAS_TOMBOL_SEKUNDER + ' mt-3'}>
            Unduh contoh CSV
          </button>
        </div>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) bacaBerkas(f);
          }}
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        {baris.length > 0 && !hasil && (
          <>
            <p className="mb-3 text-[13px] text-text">
              <strong>{namaBerkas}</strong> — {baris.length} baris siap diimpor.
            </p>
            <button onClick={impor} disabled={sibuk} className={KELAS_TOMBOL_UTAMA}>
              {sibuk ? 'Mengimpor...' : `Impor ${baris.length} catatan`}
            </button>
          </>
        )}

        {hasil && (
          <div>
            <p className="mb-3 text-[13px] text-sage">
              <strong>{hasil.berhasil}</strong> catatan berhasil diimpor.
            </p>
            {hasil.gagal.length > 0 && (
              <>
                <p className="mb-2 text-[13px] text-red">
                  {hasil.gagal.length} baris gagal dan TIDAK masuk:
                </p>
                <div className="max-h-[220px] overflow-auto rounded-[var(--radius)] border border-border">
                  {hasil.gagal.map((g) => (
                    <div key={g.baris} className="border-b border-border px-3 py-2 text-[12px] last:border-b-0">
                      <span className="font-semibold text-text">
                        Baris {g.baris} — NIS {g.nis || '(kosong)'}
                      </span>
                      <div className="text-[11px] text-text-dim">{g.alasan}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
