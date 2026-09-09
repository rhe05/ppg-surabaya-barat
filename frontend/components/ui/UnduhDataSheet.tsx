'use client';

/* Bottom sheet "Unduh Data Generus" — dipakai dari menu titik-tiga di
   /santri-saya (guru mobile). Guru memilih format (Excel / PDF) + kolom
   apa saja yang ikut, lalu berkas dibuat 100% di peramban.

   HEMAT SUPABASE: komponen ini TIDAK query apa pun. Data generus sudah ada
   di memori halaman pemanggil (state `santri`, hasil satu SELECT saat kelas
   dibuka) dan dioper lewat prop `data`. Membuka/menutup sheet & mencentang
   kolom = nol permintaan jaringan.

   Pustaka PDF (jspdf ±350 KB) di-import dinamis di dalam lib/unduhPdf.ts,
   jadi tidak membebani bundel awal — baru diunduh saat tombol PDF ditekan. */

import { useMemo, useState } from 'react';
import { X, FileSpreadsheet, FileText, Check } from 'lucide-react';
import type { SantriRow } from '@/components/santri/SantriForm';
import { KOLOM_EKSPOR_SANTRI, GRUP_URUT } from '@/lib/kolomEksporSantri';
import { unduhXlsx } from '@/lib/xlsx';
import { unduhPdf } from '@/lib/unduhPdf';

type Format = 'excel' | 'pdf';

const LS_KOLOM = 'unduhDataGenerus.kolom.v1';
const LS_FORMAT = 'unduhDataGenerus.format.v1';

function kolomBaku(): Set<string> {
  return new Set(KOLOM_EKSPOR_SANTRI.filter((k) => k.baku).map((k) => k.judul));
}

function bacaPilihanKolom(): Set<string> {
  if (typeof window === 'undefined') return kolomBaku();
  try {
    const mentah = window.localStorage.getItem(LS_KOLOM);
    if (mentah) {
      const arr = JSON.parse(mentah) as string[];
      const sah = new Set(KOLOM_EKSPOR_SANTRI.map((k) => k.judul));
      const hasil = new Set(arr.filter((j) => sah.has(j)));
      if (hasil.size > 0) return hasil;
    }
  } catch {
    /* localStorage bisa dilempar (mode privat) — pakai baku. */
  }
  return kolomBaku();
}

function bacaFormat(): Format {
  if (typeof window === 'undefined') return 'excel';
  try {
    return window.localStorage.getItem(LS_FORMAT) === 'pdf' ? 'pdf' : 'excel';
  } catch {
    return 'excel';
  }
}

function nilaiTeks(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

export default function UnduhDataSheet({
  terbuka,
  onTutup,
  data,
  namaKelas,
  namaKelompok,
}: {
  terbuka: boolean;
  onTutup: () => void;
  data: SantriRow[];
  /* Nama kelas ngaji yang sedang dibuka, mis. "1 & 2" atau "PAUD/TK". */
  namaKelas: string;
  /* Nama kelompok guru (tanpa awalan "Kelp") — utk kop PDF. */
  namaKelompok?: string | null;
}) {
  const [format, setFormat] = useState<Format>(bacaFormat);
  const [dipilih, setDipilih] = useState<Set<string>>(bacaPilihanKolom);
  const [sedangBuat, setSedangBuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  /* Urutan kolom terpilih SELALU mengikuti urutan KOLOM_EKSPOR_SANTRI,
     bukan urutan klik — supaya berkas rapi & konsisten. */
  const kolomTerpilih = useMemo(
    () => KOLOM_EKSPOR_SANTRI.filter((k) => dipilih.has(k.judul)),
    [dipilih],
  );

  if (!terbuka) return null;

  function simpanKolom(next: Set<string>) {
    setDipilih(next);
    try {
      window.localStorage.setItem(LS_KOLOM, JSON.stringify([...next]));
    } catch {
      /* abaikan */
    }
  }

  function toggleKolom(judul: string) {
    const next = new Set(dipilih);
    if (next.has(judul)) next.delete(judul);
    else next.add(judul);
    simpanKolom(next);
  }

  function toggleGrup(grup: string, semua: boolean) {
    const next = new Set(dipilih);
    for (const k of KOLOM_EKSPOR_SANTRI) {
      if (k.grup !== grup) continue;
      if (semua) next.add(k.judul);
      else next.delete(k.judul);
    }
    simpanKolom(next);
  }

  function pilihFormat(f: Format) {
    setFormat(f);
    try {
      window.localStorage.setItem(LS_FORMAT, f);
    } catch {
      /* abaikan */
    }
  }

  async function jalankan() {
    if (kolomTerpilih.length === 0 || data.length === 0) return;
    setSedangBuat(true);
    setGalat(null);
    try {
      const headers = kolomTerpilih.map((k) => k.judul);
      const tgl = new Date().toISOString().slice(0, 10);
      const namaBerkas = `Data Generus - ${namaKelas} - ${tgl}`;

      if (format === 'excel') {
        /* Satu lintasan O(baris × kolom), tanpa await di dalam loop. */
        const rows = data.map((s) => kolomTerpilih.map((k) => k.ambil(s)));
        unduhXlsx('Data Generus', headers, rows, namaBerkas);
      } else {
        const rows = data.map((s) => kolomTerpilih.map((k) => nilaiTeks(k.ambil(s))));
        await unduhPdf({
          namaBerkas,
          judul: 'Data Generus',
          subjudul: `Kelas ${namaKelas} · ${data.length} generus`,
          kelompok: namaKelompok ?? undefined,
          headers,
          rows,
        });
      }
      onTutup();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Gagal membuat berkas.');
    } finally {
      setSedangBuat(false);
    }
  }

  const bisaUnduh = kolomTerpilih.length > 0 && data.length > 0 && !sedangBuat;

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        onClick={sedangBuat ? undefined : onTutup}
        aria-hidden
      />
      <div className="relative flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        {/* Kepala */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[17px] font-extrabold text-text">Unduh Data Generus</h2>
            <p className="mt-0.5 text-[12px] text-text-dim">Kelas {namaKelas}</p>
          </div>
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
          {/* Pilih format */}
          <p className="mb-2 text-[12px] font-bold tracking-wide text-text-dim uppercase">Format</p>
          <div className="grid grid-cols-2 gap-3">
            <KartuFormat
              aktif={format === 'excel'}
              onClick={() => pilihFormat('excel')}
              ikon={<FileSpreadsheet size={20} strokeWidth={2} />}
              judul="Excel"
              catatan="Bisa diedit & diurutkan"
              warna="text-sage"
            />
            <KartuFormat
              aktif={format === 'pdf'}
              onClick={() => pilihFormat('pdf')}
              ikon={<FileText size={20} strokeWidth={2} />}
              judul="PDF"
              catatan="Rapi untuk dicetak"
              warna="text-brass"
            />
          </div>

          {/* Pilih kolom */}
          <div className="mt-5 mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold tracking-wide text-text-dim uppercase">Kolom Data</p>
            <span className="text-[12px] font-semibold text-text-faint">
              {kolomTerpilih.length} kolom
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {GRUP_URUT.map((grup) => {
              const kolomGrup = KOLOM_EKSPOR_SANTRI.filter((k) => k.grup === grup);
              if (kolomGrup.length === 0) return null;
              const jumlahAktif = kolomGrup.filter((k) => dipilih.has(k.judul)).length;
              const semuaAktif = jumlahAktif === kolomGrup.length;
              return (
                <div key={grup} className="rounded-[var(--radius-lg)] border border-border bg-panel-2 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-extrabold text-text">{grup}</span>
                    <button
                      type="button"
                      onClick={() => toggleGrup(grup, !semuaAktif)}
                      className="cursor-pointer rounded-full border border-border bg-panel px-2.5 py-1 text-[11px] font-bold text-text-dim active:scale-95"
                    >
                      {semuaAktif ? 'Kosongkan' : 'Pilih semua'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {kolomGrup.map((k) => {
                      const on = dipilih.has(k.judul);
                      return (
                        <button
                          key={k.judul}
                          type="button"
                          onClick={() => toggleKolom(k.judul)}
                          className={`flex cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-[12.5px] font-semibold transition-all active:scale-95 ${
                            on
                              ? 'border-indigo bg-[#EEF2FF] text-indigo'
                              : 'border-border bg-panel text-text-dim'
                          }`}
                        >
                          {on && <Check size={13} strokeWidth={3} />}
                          {k.judul}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA lengket bawah */}
        <div className="border-t border-border px-5 py-4">
          {galat && <p className="mb-2 text-[12.5px] font-semibold text-red">{galat}</p>}
          <button
            type="button"
            disabled={!bisaUnduh}
            onClick={jalankan}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-button)] border-none bg-text px-5 py-3.5 text-[14px] font-extrabold text-panel active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sedangBuat
              ? 'Menyiapkan berkas…'
              : `Unduh ${format === 'excel' ? 'Excel' : 'PDF'} · ${data.length} generus`}
          </button>
        </div>
      </div>
    </div>
  );
}

function KartuFormat({
  aktif,
  onClick,
  ikon,
  judul,
  catatan,
  warna,
}: {
  aktif: boolean;
  onClick: () => void;
  ikon: React.ReactNode;
  judul: string;
  catatan: string;
  warna: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-start gap-1 rounded-[var(--radius-lg)] border-[1.5px] p-3 text-left transition-all active:scale-[0.98] ${
        aktif ? 'border-indigo bg-[#EEF2FF]' : 'border-border bg-panel-2'
      }`}
    >
      <span className={warna}>{ikon}</span>
      <span className="text-[14px] font-extrabold text-text">{judul}</span>
      <span className="text-[11.5px] text-text-dim">{catatan}</span>
      {aktif && (
        <span className="absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-indigo text-white">
          <Check size={11} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}
