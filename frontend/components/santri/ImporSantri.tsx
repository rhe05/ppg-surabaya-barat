'use client';

/* Impor massal santri dari CSV — padanan serverBulkImportSantri
   (Modul_MaintainSantri.gs:294-400).

   Penulisannya lewat RPC impor_santri (migrasi 20260818250000), bukan
   perulangan .insert() di sini: menambah santri harus melewati
   `tambah_santri` yang membuat NIS secara atomik, dan memanggilnya 200 kali
   dari peramban berarti 200 perjalanan bolak-balik yang bisa putus di
   tengah.

   Gagal sebagian adalah perilaku yang DIINGINKAN: baris rusak dilaporkan
   dengan nomor barisnya, baris lain tetap masuk. Untuk daftar hasil ketikan
   tangan, memaksa "semua atau tidak sama sekali" berarti satu salah ketik
   membatalkan pekerjaan setengah jam.

   Pembaca CSV di sini sengaja sederhana tapi menangani hal yang benar-benar
   muncul di data nyata: nilai berkutip ganda, koma di dalam kutip, dan
   kutip ganda berlipat sebagai escape. Yang TIDAK didukung: baris baru di
   dalam sel — dan itu ditolak dengan pesan jelas, bukan diam-diam salah
   baca. */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

/* Kolom minimum yang dituntut tambah_santri. Sisa kolom form 25-field boleh
   ikut, tapi tidak diwajibkan. */
const KOLOM_WAJIB = ['nama', 'gender', 'tanggal_lahir', 'jenjang_saat_ini'];
const CONTOH =
  'nama,gender,tanggal_lahir,jenjang_saat_ini,tempat_lahir,nama_ayah,nomor_wa\n' +
  'Ahmad Fauzi,L,2015-04-11,Cabe Rawit,Surabaya,Bapak Fauzi,0812-3456-7890';

type Gagal = { baris: number; nama: string; alasan: string };

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

export default function ImporSantri({
  kelompokId,
  onSelesai,
  onTutup,
}: {
  kelompokId: number;
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
    try {
      /* Sel kosong dikirim null, bukan '' — kolom seperti tanggal akan
         menolak string kosong, dan NULL memang arti "tidak diisi". */
      const muatan = baris.map((b) => {
        const isi: Record<string, unknown> = { kelompok_id: kelompokId };
        for (const [k, v] of Object.entries(b)) isi[k] = v === '' ? null : v;
        return isi;
      });

      const { data, error: err } = await supabase.rpc('impor_santri', {
        p: { baris: muatan },
      });
      if (err) throw new Error(err.message);
      setHasil(data as unknown as { berhasil: number; gagal: Gagal[] });
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengimpor.');
    } finally {
      setSibuk(false);
    }
  }

  function unduhContoh() {
    const blob = new Blob([CONTOH], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contoh_impor_santri.csv';
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
            <h2 className="text-[18px] font-bold text-text">Impor Santri dari CSV</h2>
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
            Kolom lain dari form santri boleh ikut (tempat_lahir, alamat, nama_ayah, nomor_wa,
            dan seterusnya). NIS dibuat otomatis, jadi tidak perlu ada di berkas.
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
              <strong>{namaBerkas}</strong> — {baris.length} baris siap diimpor. Pratinjau 5
              pertama:
            </p>
            <div className="mb-4 max-h-[200px] overflow-auto rounded-[var(--radius)] border border-border">
              <table className="w-full border-collapse text-left text-[11px]">
                <thead className="bg-panel-2">
                  <tr>
                    {KOLOM_WAJIB.map((k) => (
                      <th key={k} className="px-2 py-1.5 font-semibold text-text-dim">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {baris.slice(0, 5).map((b, i) => (
                    <tr key={i}>
                      {KOLOM_WAJIB.map((k) => (
                        <td key={k} className="border-t border-border px-2 py-1.5 text-text">
                          {b[k] || <span className="text-red">kosong</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={impor} disabled={sibuk} className={KELAS_TOMBOL_UTAMA}>
              {sibuk ? 'Mengimpor...' : `Impor ${baris.length} santri`}
            </button>
          </>
        )}

        {hasil && (
          <div>
            <p className="mb-3 text-[13px] text-sage">
              <strong>{hasil.berhasil}</strong> santri berhasil diimpor.
            </p>
            {hasil.gagal.length > 0 && (
              <>
                <p className="mb-2 text-[13px] text-red">
                  {hasil.gagal.length} baris gagal dan TIDAK masuk. Perbaiki lalu impor ulang
                  baris itu saja:
                </p>
                <div className="max-h-[220px] overflow-auto rounded-[var(--radius)] border border-border">
                  {hasil.gagal.map((g) => (
                    <div key={g.baris} className="border-b border-border px-3 py-2 text-[12px] last:border-b-0">
                      <span className="font-semibold text-text">
                        Baris {g.baris} — {g.nama}
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
