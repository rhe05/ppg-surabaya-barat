'use client';

/* "Infaq Pengajian" (2026-09-11, diusulkan seorang guru) -- catatan infaq
   terkumpul GLOBAL per kelas per tanggal, BUKAN per santri (beda dari
   Tabungan yang wajib santri_id). Owner memutuskan: fitur berdiri
   sendiri, disatukan dgn Tabungan di balik menu "Keuangan" (/keuangan).

   - guru: catat infaq kelas yang dia ajar (tanggal + jumlah + keterangan),
     lihat riwayat kelasnya sendiri bulan berjalan, koreksi (hapus) salah
     input.
   - admin_kelompok: lihat rekap se-kelompok (total + per kelas + daftar
     lengkap), tanpa bisa mencatat (infaq dicatat guru yang hadir). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { HandCoins, Plus, X } from 'lucide-react';
import RequireAuth from '@/components/RequireAuth';
import AdminHeader from '@/components/dashboard/AdminHeader';
import JurnalHeaderChrome from '@/components/jurnal/JurnalHeaderChrome';
import PesanGalat from '@/components/ui/PesanGalat';
import EmptyState from '@/components/ui/EmptyState';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import PemilihBulanTahun from '@/components/ui/PemilihBulanTahun';
import FieldTanggal from '@/components/ui/FieldTanggal';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/useToast';
import { muatKelasGuru, type KelasJurnal } from '@/lib/dataGuru';
import { supabase } from '@/lib/supabase';
import { formatRupiah } from '@/lib/tabungan';
import {
  muatInfaqKelasBulan,
  muatInfaqKelompokBulan,
  simpanInfaq,
  hapusInfaq,
  type InfaqBaris,
} from '@/lib/infaqPengajian';

function fmtTgl(iso: string) {
  const [y, m, d] = iso.split('-');
  const b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${Number(d)} ${b[Number(m) - 1] ?? m} ${y}`;
}

function InfaqPengajianContent() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin_kelompok';
  const utkGuru = profile?.role === 'guru' || profile?.role === 'pengunjung';
  const kelompokId = profile?.scope_kelompok_id ?? null;
  const guruId = profile?.guru_id ?? null;
  const { sukses, error: toastError } = useToast();

  const skrg = new Date();
  const [bulan, setBulan] = useState(skrg.getMonth() + 1);
  const [tahun, setTahun] = useState(skrg.getFullYear());

  const [kelasList, setKelasList] = useState<KelasJurnal[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');
  const [kelasNamaKelompok, setKelasNamaKelompok] = useState<Map<number, string>>(new Map());

  const [list, setList] = useState<InfaqBaris[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  const [tanggalBaru, setTanggalBaru] = useState(new Date().toISOString().slice(0, 10));
  const [jumlahBaru, setJumlahBaru] = useState('');
  const [keteranganBaru, setKeteranganBaru] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<number | null>(null);
  const [menghapus, setMenghapus] = useState(false);

  useEffect(() => {
    if (!utkGuru || guruId == null) return;
    muatKelasGuru(guruId).then((l) => {
      setKelasList(l);
      setKelasId((prev) => (prev === '' && l.length >= 1 ? l[0].id : prev));
    });
  }, [utkGuru, guruId]);

  const muat = useCallback(async () => {
    setError(null);
    if (isAdmin) {
      if (!kelompokId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const [rows, { data: kelasRes }] = await Promise.all([
          muatInfaqKelompokBulan(kelompokId, tahun, bulan),
          supabase.from('kelas').select('id, nama').eq('kelompok_id', kelompokId).is('deleted_at', null),
        ]);
        setList(rows);
        setKelasNamaKelompok(new Map((kelasRes ?? []).map((k) => [k.id as number, k.nama as string])));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal memuat rekap infaq.');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (kelasId === '') {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setList(await muatInfaqKelasBulan(kelasId, tahun, bulan));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat riwayat infaq.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, kelompokId, kelasId, tahun, bulan]);

  useEffect(() => {
    muat();
  }, [muat]);

  const total = useMemo(() => list.reduce((a, r) => a + r.jumlah, 0), [list]);
  const totalPerKelas = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of list) m.set(r.kelas_id, (m.get(r.kelas_id) ?? 0) + r.jumlah);
    return m;
  }, [list]);

  function bukaTambah() {
    setTanggalBaru(new Date().toISOString().slice(0, 10));
    setJumlahBaru('');
    setKeteranganBaru('');
    setErrorForm(null);
    setTambahTerbuka(true);
  }

  async function simpan() {
    if (kelasId === '' || !kelompokId) return;
    const nilai = Number(jumlahBaru.replace(/\D/g, ''));
    if (!tanggalBaru || !nilai || nilai <= 0) {
      setErrorForm('Tanggal dan jumlah (lebih dari 0) wajib diisi.');
      return;
    }
    setMenyimpan(true);
    setErrorForm(null);
    try {
      await simpanInfaq({
        kelompokId,
        kelasId,
        tanggal: tanggalBaru,
        jumlah: nilai,
        keterangan: keteranganBaru.trim() || null,
        olehId: profile?.id ?? null,
      });
      setTambahTerbuka(false);
      sukses('Infaq pengajian dicatat.');
      await muat();
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  async function hapus(id: number) {
    setMenghapus(true);
    try {
      await hapusInfaq(id);
      setHapusId(null);
      sukses('Catatan infaq dihapus.');
      await muat();
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Gagal menghapus.');
    } finally {
      setMenghapus(false);
    }
  }

  const body = (
    <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-24">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-[17px] font-extrabold tracking-[-0.01em] text-text">Infaq Pengajian</h1>
        <PemilihBulanTahun bulan={bulan} tahun={tahun} onUbah={(b, t) => { setBulan(b); setTahun(t); }} />
      </div>

      {!isAdmin && kelasList.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto">
          {kelasList.map((k) => {
            const aktif = k.id === kelasId;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => setKelasId(k.id)}
                className={`flex shrink-0 items-center rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 text-[13px] font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.96] ${
                  aktif ? 'border-brass text-brass' : 'border-border bg-panel text-text-dim'
                }`}
                style={
                  aktif
                    ? { background: 'linear-gradient(135deg, var(--brass-lembut) 0%, var(--brass-lembut-2) 100%)' }
                    : undefined
                }
              >
                {k.nama}
              </button>
            );
          })}
        </div>
      )}

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <div className="mb-5 h-[100px] animate-pulse rounded-card bg-panel-2" />
      ) : (
        <div className="kartu-saldo mb-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold tracking-[0.06em] text-white/60 uppercase">
                {isAdmin ? 'Total infaq kelompok bulan ini' : 'Total infaq kelas ini bulan ini'}
              </div>
              <div className="angka-metrik mt-1.5 text-[26px] text-white">{formatRupiah(total)}</div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <HandCoins size={19} />
            </span>
          </div>

          {!isAdmin && kelasId !== '' && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/15 pt-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-white/55">
                  {kelasList.length > 1 ? kelasList.find((k) => k.id === kelasId)?.nama : 'Bulan ini'}
                </div>
                <div className="truncate text-[13px] font-bold text-white">
                  {list.length > 0 ? `${list.length} catatan` : 'Belum ada catatan'}
                </div>
              </div>
              <button
                type="button"
                onClick={bukaTambah}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 self-center rounded-pill border-none bg-white px-4 py-2 text-[13px] font-extrabold text-text active:scale-95"
              >
                <Plus size={14} /> Catat
              </button>
            </div>
          )}
        </div>
      )}

      {isAdmin && !loading && totalPerKelas.size > 0 && (
        <>
          <div className="label-mikro mb-2">Per kelas</div>
          <div className="mb-5 grid grid-cols-2 gap-3">
            {[...totalPerKelas.entries()].map(([kId, jml]) => (
              <div key={kId} className="kartu-premium p-4">
                <div className="truncate text-[12px] font-bold text-text-dim">
                  {kelasNamaKelompok.get(kId) ?? `Kelas #${kId}`}
                </div>
                <div className="angka-metrik mt-1 text-[16px] text-text">{formatRupiah(jml)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="label-mikro mb-3">Riwayat{list.length > 0 ? ` (${list.length})` : ''}</div>

      {loading ? (
        <SkeletonKartuList />
      ) : list.length === 0 ? (
        <EmptyState
          ikon={<HandCoins size={22} />}
          judul="Belum ada catatan"
          deskripsi={
            isAdmin
              ? 'Belum ada infaq pengajian tercatat bulan ini.'
              : kelasId === ''
                ? 'Pilih kelas dulu utk mencatat infaq.'
                : 'Catat infaq pengajian kelas ini setelah pengajian selesai.'
          }
        />
      ) : (
        <div className="kartu-premium overflow-hidden">
          {list.map((r) => (
            <div key={r.id} className="baris-daftar flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-lembut text-brass">
                <HandCoins size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-text">
                  {isAdmin ? (kelasNamaKelompok.get(r.kelas_id) ?? `Kelas #${r.kelas_id}`) : fmtTgl(r.tanggal)}
                </div>
                <div className="truncate text-[12px] text-text-dim">
                  {isAdmin ? fmtTgl(r.tanggal) : null}
                  {r.keterangan ? `${isAdmin ? ' · ' : ''}${r.keterangan}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[13px] font-extrabold tabular-nums text-sage">
                  {formatRupiah(r.jumlah)}
                </span>
                {!isAdmin &&
                  (hapusId === r.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={menghapus}
                        onClick={() => hapus(r.id)}
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
                      onClick={() => setHapusId(r.id)}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-text-faint hover:bg-red-lembut hover:text-red"
                    >
                      <X size={13} />
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <main className="relative flex min-h-screen flex-col bg-bg">
      {isAdmin ? <AdminHeader judul="Infaq Pengajian" /> : <JurnalHeaderChrome tampilkanHero={false} />}
      {body}

      {tambahTerbuka && (
        <div className="fixed inset-0 z-[610] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-[420px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[17px] font-extrabold text-text">Catat Infaq Pengajian</h2>
              <button
                type="button"
                onClick={() => setTambahTerbuka(false)}
                aria-label="Tutup"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
              >
                <X size={16} />
              </button>
            </div>

            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">Tanggal</label>
            <FieldTanggal
              nilai={tanggalBaru}
              onPilih={setTanggalBaru}
              className="mb-3 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
            />

            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">
              Jumlah Terkumpul (global, bukan per anak)
            </label>
            <div className="mb-3 flex items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-3.5 focus-within:border-brass">
              <span className="text-[13px] font-bold text-text-dim">Rp</span>
              <input
                inputMode="numeric"
                value={jumlahBaru ? Number(jumlahBaru.replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                onChange={(e) => setJumlahBaru(e.target.value.replace(/\D/g, ''))}
                placeholder="0"
                className="w-full border-none bg-transparent py-2.5 text-[15px] font-extrabold tabular-nums text-text outline-none"
              />
            </div>

            <label className="mb-1.5 block text-[12px] font-semibold text-text-dim">
              Keterangan (opsional)
            </label>
            <input
              value={keteranganBaru}
              onChange={(e) => setKeteranganBaru(e.target.value)}
              placeholder="mis. Pengajian Ahad pagi"
              className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none"
            />

            {errorForm && <p className="mt-3 text-[12px] text-red">{errorForm}</p>}

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setTambahTerbuka(false)}
                className="flex-1 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text active:scale-[0.98]"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={menyimpan}
                onClick={simpan}
                className="flex-1 cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {menyimpan ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function InfaqPengajianPage() {
  return (
    <RequireAuth>
      <InfaqPengajianContent />
    </RequireAuth>
  );
}
