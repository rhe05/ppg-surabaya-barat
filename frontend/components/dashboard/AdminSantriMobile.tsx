'use client';

/* "Data Generus" — mobile admin_kelompok. Tombol kanan-atas = menu 5 aksi
   (2026-08-28, diminta owner: samakan dgn Data Generus guru):
     Tambah Generus · Pindah Kelas · Pindah Domisili · Naik Kelas · Non Aktif

   Beda dari layar guru (app/santri-saya): admin sudah py hak tulis
   langsung -> keempat aksi massal memanggil RPC LANGSUNG
   (pindah_kelas_santri / naikkan_jenjang_santri / nonaktifkan_santri,
   sudah admin-callable per migrasi 20260821180000), BUKAN
   ajukan_permintaan_generus (itu antrean khusus pengajuan guru). Admin
   jg lihat SELURUH santri kelompok lintas kelas + kelas tujuan Pindah
   Kelas = kelas mana pun dlm kelompok. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  House,
  TrendingUp,
  UserPlus,
  UserRoundX,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import SantriForm, { SantriRow, KOLOM_SANTRI } from '@/components/santri/SantriForm';
import { useToast } from '@/components/ui/useToast';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import EmptyState from '@/components/ui/EmptyState';

type AksiMassal = 'pindah' | 'naik' | 'pindah_domisili' | 'non_aktif';
type KelasRingkas = { id: number; nama: string };

const JENJANG_URUT = ['PAUD/TK', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja'];
function jenjangBerikutnya(j: string | null): string | null {
  if (!j) return null;
  const i = JENJANG_URUT.indexOf(j);
  return i >= 0 && i < JENJANG_URUT.length - 1 ? JENJANG_URUT[i + 1] : null;
}

const MASSAL: Record<
  AksiMassal,
  { label: string; ajakan: string; border: string; bg: string; bgLembut: string }
> = {
  pindah: {
    label: 'Pindah',
    ajakan: 'Ketuk generus yang mau dipindah kelasnya, boleh lebih dari satu.',
    border: 'border-indigo',
    bg: 'border-indigo bg-indigo',
    bgLembut: 'bg-[rgba(79,70,229,0.05)]',
  },
  naik: {
    label: 'Naik Kelas',
    ajakan: 'Ketuk generus yang mau dinaikkan jenjangnya, boleh lebih dari satu.',
    border: 'border-sage',
    bg: 'border-sage bg-sage',
    bgLembut: 'bg-[rgba(5,150,105,0.05)]',
  },
  pindah_domisili: {
    label: 'Pindah Domisili',
    ajakan: 'Ketuk generus yang mau ditandai Pindah Domisili, boleh lebih dari satu.',
    border: 'border-brass',
    bg: 'border-brass bg-brass',
    bgLembut: 'bg-[rgba(217,119,6,0.05)]',
  },
  non_aktif: {
    label: 'Non Aktif',
    ajakan: 'Ketuk generus yang mau ditandai Non Aktif, boleh lebih dari satu.',
    border: 'border-red',
    bg: 'border-red bg-red',
    bgLembut: 'bg-[rgba(220,38,38,0.05)]',
  },
};

function hariIni() {
  const now = new Date();
  const lokal = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return lokal.toISOString().slice(0, 10);
}

const OVERLAY = 'fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4';
const SHEET =
  'w-full max-w-[430px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card';

export default function AdminSantriMobile() {
  const { profile } = useAuth();
  const { sukses } = useToast();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [santri, setSantri] = useState<SantriRow[]>([]);
  const [kelasList, setKelasList] = useState<KelasRingkas[]>([]);
  const [loading, setLoading] = useState(true);
  const [belumPernahMuat, setBelumPernahMuat] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [santriDiubah, setSantriDiubah] = useState<SantriRow | null>(null);

  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [modeMassal, setModeMassal] = useState<AksiMassal | null>(null);
  const [terpilih, setTerpilih] = useState<Set<number>>(new Set());
  const [modalKonfirmasi, setModalKonfirmasi] = useState(false);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: dS, error: eS }, { data: dK }] = await Promise.all([
      supabase.from('santri').select(KOLOM_SANTRI).is('deleted_at', null).order('nama'),
      supabase.from('kelas').select('id, nama').is('deleted_at', null).order('nama'),
    ]);
    if (eS) setError(eS.message);
    else setSantri((dS ?? []) as unknown as SantriRow[]);
    setKelasList((dK ?? []) as unknown as KelasRingkas[]);
    setLoading(false);
    setBelumPernahMuat(false);
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  const santriTersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    if (!term) return santri;
    return santri.filter(
      (s) =>
        s.nama.toLowerCase().includes(term) ||
        (s.nis ?? '').toLowerCase().includes(term) ||
        (s.kelas_ngaji ?? '').toLowerCase().includes(term),
    );
  }, [santri, cari]);

  const santriTerpilih = useMemo(() => santri.filter((s) => terpilih.has(s.id)), [santri, terpilih]);

  function bukaTambah() {
    setSantriDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(s: SantriRow) {
    setSantriDiubah(s);
    setFormTerbuka(true);
  }
  function selesaiForm() {
    const baru = santriDiubah === null;
    setFormTerbuka(false);
    setSantriDiubah(null);
    muat();
    sukses(baru ? 'Generus baru tersimpan.' : 'Perubahan tersimpan.');
  }

  function mulaiMode(a: AksiMassal) {
    setModeMassal(a);
    setTerpilih(new Set());
  }
  function batalMode() {
    setModeMassal(null);
    setTerpilih(new Set());
    setModalKonfirmasi(false);
  }
  function toggleTerpilih(id: number) {
    setTerpilih((s) => {
      const b = new Set(s);
      if (b.has(id)) b.delete(id);
      else b.add(id);
      return b;
    });
  }

  async function jalankanAksi(payload: Record<string, unknown>) {
    const ids = [...terpilih];
    if (modeMassal === 'pindah') {
      const { error: err } = await supabase.rpc('pindah_kelas_santri', {
        p: { santri_ids: ids, kelas_tujuan_id: payload.kelas_tujuan_id },
      });
      if (err) throw new Error(err.message);
      sukses(`${ids.length} generus dipindah kelasnya.`);
    } else if (modeMassal === 'naik') {
      const { error: err } = await supabase.rpc('naikkan_jenjang_santri', {
        p: { santri_ids: ids, kelompok_id: kelompokId },
      });
      if (err) throw new Error(err.message);
      sukses(`${ids.length} generus dinaikkan jenjangnya.`);
    } else {
      const { error: err } = await supabase.rpc('nonaktifkan_santri', {
        p: {
          santri_ids: ids,
          kelompok_id: kelompokId,
          jenis_siklus: modeMassal === 'pindah_domisili' ? 'Pindah' : 'Tidak Aktif',
          tanggal: payload.tanggal,
          keterangan: payload.keterangan,
        },
      });
      if (err) throw new Error(err.message);
      sukses(
        `${ids.length} generus ditandai ${modeMassal === 'pindah_domisili' ? 'Pindah Domisili' : 'Non Aktif'}.`,
      );
    }
    batalMode();
    await muat();
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Data Generus" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="text-[17px] font-extrabold text-text">Data Generus ({santri.length})</div>
          <div className="relative shrink-0">
            {modeMassal ? (
              <button
                type="button"
                onClick={batalMode}
                className="cursor-pointer rounded-full border border-border bg-panel-2 px-4 py-2 text-[13px] font-bold text-text active:scale-[0.96]"
              >
                Batal
              </button>
            ) : (
              <button
                type="button"
                aria-label="Aksi Generus"
                onClick={() => setMenuTerbuka((v) => !v)}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-brass text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] active:scale-[0.92]"
              >
                <UserPlus size={19} strokeWidth={2} />
              </button>
            )}

            {menuTerbuka && (
              <>
                <div className="fixed inset-0 z-[90]" onClick={() => setMenuTerbuka(false)} />
                <div className="absolute top-full right-0 z-[91] mt-2 flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-lg)] border border-border bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)]">
                  {(
                    [
                      { ikon: UserPlus, warna: 'text-brass', label: 'Tambah Generus', act: bukaTambah },
                      { ikon: ArrowLeftRight, warna: 'text-indigo', label: 'Pindah Kelas', act: () => mulaiMode('pindah') },
                      { ikon: House, warna: 'text-brass', label: 'Pindah Domisili', act: () => mulaiMode('pindah_domisili') },
                      { ikon: TrendingUp, warna: 'text-sage', label: 'Naik Kelas', act: () => mulaiMode('naik') },
                      { ikon: UserRoundX, warna: 'text-red', label: 'Non Aktif', act: () => mulaiMode('non_aktif') },
                    ] as const
                  ).map((m) => {
                    const Ikon = m.ikon;
                    return (
                      <button
                        key={m.label}
                        type="button"
                        onClick={() => {
                          setMenuTerbuka(false);
                          m.act();
                        }}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-3 py-[11px] text-left text-[14px] font-semibold text-text active:bg-bg"
                      >
                        <Ikon size={18} strokeWidth={2} className={`shrink-0 ${m.warna}`} />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {modeMassal && (
          <p className="mb-3 text-[12.5px] text-text-dim">{MASSAL[modeMassal].ajakan}</p>
        )}

        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama, NIS, atau kelas..."
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        {belumPernahMuat && loading ? (
          <SkeletonKartuList />
        ) : santriTersaring.length === 0 ? (
          cari.trim() ? (
            <p className="text-[13px] text-text-dim">Tidak ada yang cocok dengan &quot;{cari.trim()}&quot;.</p>
          ) : (
            <EmptyState
              ikon={<UserPlus size={22} />}
              judul="Belum ada generus"
              deskripsi="Tambahkan data generus kelompok Anda untuk mulai mencatat kehadiran."
              aksi={{ label: 'Tambah Generus', onClick: bukaTambah }}
            />
          )
        ) : (
          <div className="flex flex-col gap-2.5">
            {santriTersaring.map((s) => {
              const dicentang = terpilih.has(s.id);
              const w = modeMassal ? MASSAL[modeMassal] : null;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (modeMassal ? toggleTerpilih(s.id) : bukaUbah(s))}
                  className={`flex items-center justify-between gap-3 rounded-card border-[1.5px] p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99] ${
                    w && dicentang ? `${w.border} ${w.bgLembut}` : 'border-border bg-panel'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {modeMassal && (
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          dicentang ? `${w!.bg} text-white` : 'border-border text-transparent'
                        }`}
                      >
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-bold text-text">{s.nama}</div>
                      <div className="mt-0.5 text-[11.5px] text-text-dim">
                        NIS {s.nis ?? '-'} ·{' '}
                        {s.gender === 'L' ? 'Laki-laki' : s.gender === 'P' ? 'Perempuan' : '-'}
                        {s.kelas_ngaji ? ` · ${s.kelas_ngaji}` : ''}
                      </div>
                    </div>
                  </div>
                  {s.jenjang_saat_ini && (
                    <span className="shrink-0 rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[10.5px] font-bold text-sage">
                      {s.jenjang_saat_ini}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bilah aksi bawah — di atas bottom nav. */}
      {modeMassal && (
        <div
          className="fixed inset-x-0 z-[80] flex justify-center px-6"
          style={{ bottom: 'calc(66px + env(safe-area-inset-bottom))' }}
        >
          <div className="flex w-full max-w-[430px] items-center justify-between gap-3 rounded-full border border-border bg-panel px-5 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.18)]">
            <span className="text-[13px] font-semibold text-text">{terpilih.size} dipilih</span>
            <button
              type="button"
              disabled={terpilih.size === 0}
              onClick={() => setModalKonfirmasi(true)}
              className={`cursor-pointer rounded-full border px-5 py-2 text-[13px] font-bold text-white active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 ${MASSAL[modeMassal].bg}`}
            >
              {MASSAL[modeMassal].label}
            </button>
          </div>
        </div>
      )}

      {formTerbuka && (
        <SantriForm santri={santriDiubah} onSelesai={selesaiForm} onBatal={() => setFormTerbuka(false)} />
      )}

      {modalKonfirmasi && modeMassal === 'pindah' && (
        <PindahKelasModal
          jumlah={terpilih.size}
          opsiKelas={kelasList}
          onKonfirmasi={(kelasTujuanId) => jalankanAksi({ kelas_tujuan_id: kelasTujuanId })}
          onBatal={() => setModalKonfirmasi(false)}
        />
      )}
      {modalKonfirmasi && modeMassal === 'naik' && (
        <NaikKelasModal
          daftar={santriTerpilih}
          onKonfirmasi={() => jalankanAksi({})}
          onBatal={() => setModalKonfirmasi(false)}
        />
      )}
      {modalKonfirmasi && (modeMassal === 'pindah_domisili' || modeMassal === 'non_aktif') && (
        <NonaktifModal
          jenis={modeMassal === 'pindah_domisili' ? 'Pindah' : 'Tidak Aktif'}
          judul={modeMassal === 'pindah_domisili' ? 'Pindah Domisili' : 'Non Aktif'}
          jumlah={terpilih.size}
          onKonfirmasi={(tanggal, keterangan) => jalankanAksi({ tanggal, keterangan })}
          onBatal={() => setModalKonfirmasi(false)}
        />
      )}
    </main>
  );
}

function PindahKelasModal({
  jumlah,
  opsiKelas,
  onKonfirmasi,
  onBatal,
}: {
  jumlah: number;
  opsiKelas: KelasRingkas[];
  onKonfirmasi: (kelasTujuanId: number) => Promise<void>;
  onBatal: () => void;
}) {
  const [tujuan, setTujuan] = useState<number | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={OVERLAY}>
      <div className={SHEET}>
        <h2 className="mb-1 text-[17px] font-bold text-text">Pindah Kelas</h2>
        <p className="mb-4 text-[12.5px] text-text-dim">
          {jumlah} generus terpilih akan dipindah ke kelas yang Anda pilih.
        </p>
        <div className="mb-4 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
          {opsiKelas.map((k) => (
            <label
              key={k.id}
              className={`flex cursor-pointer items-center gap-2.5 rounded-card border-[1.5px] p-3 ${
                tujuan === k.id ? 'border-indigo bg-[rgba(79,70,229,0.06)]' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="kelas_tujuan"
                className="shrink-0"
                checked={tujuan === k.id}
                onChange={() => setTujuan(k.id)}
              />
              <span className="text-[13.5px] font-bold text-text">{k.nama}</span>
            </label>
          ))}
        </div>
        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={sibuk || tujuan === null}
            onClick={async () => {
              if (tujuan === null) return;
              setSibuk(true);
              setError(null);
              try {
                await onKonfirmasi(tujuan);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Gagal memindah kelas.');
                setSibuk(false);
              }
            }}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-indigo bg-indigo px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {sibuk ? 'Memindah...' : 'Pindah'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NaikKelasModal({
  daftar,
  onKonfirmasi,
  onBatal,
}: {
  daftar: SantriRow[];
  onKonfirmasi: () => Promise<void>;
  onBatal: () => void;
}) {
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mentok = daftar.filter((s) => jenjangBerikutnya(s.jenjang_saat_ini) === null).length;
  return (
    <div className={OVERLAY}>
      <div className={SHEET}>
        <h2 className="mb-1 text-[17px] font-bold text-text">Naik Kelas</h2>
        <p className="mb-4 text-[12.5px] text-text-dim">Jenjang tiap generus terpilih naik satu tingkat.</p>
        <div className="mb-4 flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
          {daftar.map((s) => {
            const b = jenjangBerikutnya(s.jenjang_saat_ini);
            return (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-card border border-border p-3"
              >
                <span className="min-w-0 truncate text-[13px] font-semibold text-text">{s.nama}</span>
                {b ? (
                  <span className="shrink-0 text-[11.5px] font-bold text-sage">
                    {s.jenjang_saat_ini} → {b}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11px] text-text-faint">sudah tertinggi</span>
                )}
              </div>
            );
          })}
        </div>
        {mentok > 0 && (
          <p className="mb-3 text-[11.5px] text-text-faint">
            {mentok} generus sudah di jenjang tertinggi, tidak ikut dinaikkan.
          </p>
        )}
        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={async () => {
              setSibuk(true);
              setError(null);
              try {
                await onKonfirmasi();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Gagal menaikkan jenjang.');
                setSibuk(false);
              }
            }}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-sage bg-sage px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {sibuk ? 'Memproses...' : 'Naik Kelas'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NonaktifModal({
  jenis,
  judul,
  jumlah,
  onKonfirmasi,
  onBatal,
}: {
  jenis: 'Pindah' | 'Tidak Aktif';
  judul: string;
  jumlah: number;
  onKonfirmasi: (tanggal: string, keterangan: string) => Promise<void>;
  onBatal: () => void;
}) {
  const [tanggal, setTanggal] = useState(hariIni);
  const [keterangan, setKeterangan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={OVERLAY}>
      <div className={SHEET}>
        <h2 className="mb-1 text-[17px] font-bold text-text">{judul}</h2>
        <p className="mb-4 text-[12.5px] text-text-dim">
          {jumlah} generus terpilih ditandai {jenis === 'Pindah' ? 'Pindah Domisili' : 'Non Aktif'} sejak
          tanggal di bawah. Riwayat kehadiran sebelumnya tetap tersimpan utuh.
        </p>
        <label className="mb-1.5 block text-[12px] font-semibold text-text">Sejak Tanggal</label>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />
        <label className="mb-1.5 block text-[12px] font-semibold text-text">Keterangan (opsional)</label>
        <input
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder={jenis === 'Pindah' ? 'Misal: pindah ke Kelp Petemon Timur' : ''}
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />
        {error && <p className="mb-3 text-[13px] text-red">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={async () => {
              setSibuk(true);
              setError(null);
              try {
                await onKonfirmasi(tanggal, keterangan);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
                setSibuk(false);
              }
            }}
            className={`flex-1 cursor-pointer rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40 ${
              jenis === 'Pindah' ? 'border-brass bg-brass' : 'border-red bg-red'
            }`}
          >
            {sibuk ? 'Menyimpan...' : judul}
          </button>
        </div>
      </div>
    </div>
  );
}
