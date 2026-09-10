'use client';

/* Bottom sheet "Unduh Data …" — generik. Dipakai untuk Data Generus
   (guru mobile /santri-saya & admin kelp mobile) dan Data Jamaah
   (Penerobos Kelp). Pengguna memilih format (Excel / PDF) + kolom apa
   saja yang ikut, lalu berkas dibuat 100% di peramban. Baris selalu
   diberi nomor urut ("No").

   Mode "banyak kelas" (`daftarKelas` diisi, khusus admin kelp generus):
   tambah pemilih kelas — boleh > 1, datanya digabung jadi satu berkas,
   diurutkan kelas → nama (lewat `ambilKelas`).

   HEMAT SUPABASE: komponen ini TIDAK query apa pun. Data sudah ada di
   memori halaman pemanggil dan dioper lewat prop `data`.

   Pustaka PDF (jspdf ±350 KB) di-import dinamis di lib/unduhPdf.ts. */

import { useEffect, useMemo, useState } from 'react';
import { X, FileSpreadsheet, FileText, Check } from 'lucide-react';
import { unduhXlsx } from '@/lib/xlsx';
import { unduhPdf } from '@/lib/unduhPdf';

export type KolomEkspor<T> = {
  judul: string;
  grup: string;
  /* Ikut tercentang saat sheet pertama kali dibuka (belum ada pilihan). */
  baku: boolean;
  ambil: (row: T) => unknown;
};

type Format = 'excel' | 'pdf';

function nilaiTeks(v: unknown): string {
  return v == null ? '' : String(v);
}

export default function UnduhDataSheet<T extends { nama: string }>({
  terbuka,
  onTutup,
  data,
  kolom,
  grupUrut,
  entitas,
  entitasJamak,
  lsNamespace,
  namaKelas,
  namaKelompok,
  daftarKelas,
  ambilKelas,
}: {
  terbuka: boolean;
  onTutup: () => void;
  data: T[];
  /* Spesifikasi kolom — satu sumber kebenaran per entitas. */
  kolom: KolomEkspor<T>[];
  /* Urutan tampilan grup sakelar kolom. */
  grupUrut: string[];
  /* Nama entitas utk judul sheet / judul PDF / nama berkas, mis. "Data Generus". */
  entitas: string;
  /* Kata jamak utk hitungan ("· 12 generus"), mis. "generus" / "jamaah". */
  entitasJamak: string;
  /* Namespace localStorage (pilihan kolom & format), mis. "unduhDataGenerus". */
  lsNamespace: string;
  /* Label saringan yang sedang aktif (kelas ngaji / "Semua" / sub kelp).
     Diabaikan kalau `daftarKelas` ada. */
  namaKelas?: string;
  /* Nama kelompok (boleh ber-awalan "Kelp") — kop PDF & nama berkas. */
  namaKelompok?: string | null;
  /* MODE BANYAK KELAS (admin kelp generus): pemilih kelas; `data` = seluruh
     baris, disaring di sini via `ambilKelas`. */
  daftarKelas?: { id: number; nama: string }[];
  /* Ambil "kelas" satu baris utk saring & urutkan mode banyak-kelas. */
  ambilKelas?: (row: T) => string;
}) {
  const LS_KOLOM = `${lsNamespace}.kolom.v1`;
  const LS_FORMAT = `${lsNamespace}.format.v1`;

  const kolomBaku = () => new Set(kolom.filter((k) => k.baku).map((k) => k.judul));

  function bacaPilihanKolom(): Set<string> {
    if (typeof window === 'undefined') return kolomBaku();
    try {
      const mentah = window.localStorage.getItem(LS_KOLOM);
      if (mentah) {
        const arr = JSON.parse(mentah) as string[];
        const sah = new Set(kolom.map((k) => k.judul));
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

  const modeBanyakKelas = Array.isArray(daftarKelas) && daftarKelas.length > 0;
  const kelasDari = ambilKelas ?? ((r: T) => nilaiTeks((r as { kelas_ngaji?: unknown }).kelas_ngaji));

  const kelompokBersih = (namaKelompok ?? '')
    .replace(/^(?:[\s ]*kelp\b[.\s ]*)+/i, '')
    .trim();

  const [format, setFormat] = useState<Format>(bacaFormat);
  const [dipilih, setDipilih] = useState<Set<string>>(bacaPilihanKolom);
  const [kelasDipilih, setKelasDipilih] = useState<Set<string>>(
    () => new Set((daftarKelas ?? []).map((k) => k.nama)),
  );
  const [sedangBuat, setSedangBuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const kunciKelas = (daftarKelas ?? []).map((k) => k.nama).join('|');
  useEffect(() => {
    if (modeBanyakKelas && kelasDipilih.size === 0) {
      setKelasDipilih(new Set((daftarKelas ?? []).map((k) => k.nama)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunciKelas, modeBanyakKelas]);

  const kolomTerpilih = useMemo(
    () => kolom.filter((k) => dipilih.has(k.judul)),
    [kolom, dipilih],
  );

  const dataEfektif = useMemo(() => {
    if (!modeBanyakKelas) return data;
    const rows = data.filter((s) => kelasDipilih.has(kelasDari(s)));
    return [...rows].sort(
      (a, b) =>
        kelasDari(a).localeCompare(kelasDari(b), 'id') || a.nama.localeCompare(b.nama, 'id'),
    );
  }, [modeBanyakKelas, data, kelasDipilih]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelSaring = useMemo(() => {
    if (!modeBanyakKelas) return namaKelas ?? '';
    const total = daftarKelas!.length;
    const n = kelasDipilih.size;
    if (n === 0) return 'Belum ada kelas dipilih';
    if (n === total) return 'Semua Kelas';
    if (n === 1) return [...kelasDipilih][0];
    return `${n} Kelas`;
  }, [modeBanyakKelas, namaKelas, daftarKelas, kelasDipilih]);

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
    for (const k of kolom) {
      if (k.grup !== grup) continue;
      if (semua) next.add(k.judul);
      else next.delete(k.judul);
    }
    simpanKolom(next);
  }

  function toggleKelas(nama: string) {
    setKelasDipilih((prev) => {
      const next = new Set(prev);
      if (next.has(nama)) next.delete(nama);
      else next.add(nama);
      return next;
    });
  }

  function toggleSemuaKelas(semua: boolean) {
    setKelasDipilih(semua ? new Set((daftarKelas ?? []).map((k) => k.nama)) : new Set());
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
    if (kolomTerpilih.length === 0 || dataEfektif.length === 0) return;
    setSedangBuat(true);
    setGalat(null);
    try {
      const headers = ['No', ...kolomTerpilih.map((k) => k.judul)];
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const tgl = `${dd}-${mm}-${now.getFullYear()}`;
      const namaBerkas = [
        entitas,
        kelompokBersih ? `Kelp ${kelompokBersih}` : null,
        labelSaring || null,
        tgl,
      ]
        .filter(Boolean)
        .join(' - ');

      if (format === 'excel') {
        const rows = dataEfektif.map((s, i) => [
          String(i + 1),
          ...kolomTerpilih.map((k) => k.ambil(s)),
        ]);
        unduhXlsx(entitas, headers, rows, namaBerkas);
      } else {
        const rows = dataEfektif.map((s, i) => [
          String(i + 1),
          ...kolomTerpilih.map((k) => nilaiTeks(k.ambil(s))),
        ]);
        await unduhPdf({
          namaBerkas,
          judul: entitas,
          subjudul: `${labelSaring ? labelSaring + ' · ' : ''}${dataEfektif.length} ${entitasJamak}`,
          kelompok: kelompokBersih || undefined,
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

  const bisaUnduh = kolomTerpilih.length > 0 && dataEfektif.length > 0 && !sedangBuat;

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={sedangBuat ? undefined : onTutup} aria-hidden />
      <div className="relative flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[17px] font-extrabold text-text">Unduh {entitas}</h2>
            <p className="mt-0.5 text-[12px] text-text-dim">
              {labelSaring ? labelSaring + ' · ' : ''}
              {dataEfektif.length} {entitasJamak}
            </p>
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
          {modeBanyakKelas && (
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-bold tracking-wide text-text-dim uppercase">Kelas</p>
                <button
                  type="button"
                  onClick={() => toggleSemuaKelas(kelasDipilih.size !== daftarKelas!.length)}
                  className="cursor-pointer rounded-full border border-border bg-panel px-2.5 py-1 text-[11px] font-bold text-text-dim active:scale-95"
                >
                  {kelasDipilih.size === daftarKelas!.length ? 'Kosongkan' : 'Pilih semua'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {daftarKelas!.map((k) => {
                  const on = kelasDipilih.has(k.nama);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKelas(k.nama)}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5 text-[12.5px] font-semibold transition-all active:scale-95 ${
                        on ? 'border-sage bg-[rgba(5,150,105,0.08)] text-sage' : 'border-border bg-panel text-text-dim'
                      }`}
                    >
                      {on && <Check size={13} strokeWidth={3} />}
                      {k.nama}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

          <div className="mt-5 mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold tracking-wide text-text-dim uppercase">Kolom Data</p>
            <span className="text-[12px] font-semibold text-text-faint">
              {kolomTerpilih.length} kolom
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {grupUrut.map((grup) => {
              const kolomGrup = kolom.filter((k) => k.grup === grup);
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
                            on ? 'border-indigo bg-[#EEF2FF] text-indigo' : 'border-border bg-panel text-text-dim'
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
              : `Unduh ${format === 'excel' ? 'Excel' : 'PDF'} · ${dataEfektif.length} ${entitasJamak}`}
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
