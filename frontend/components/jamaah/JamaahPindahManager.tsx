'use client';

/* "Jamaah Pindah" (Penerobos Kelp) — arsip jamaah yang pindah keluar
   kelompok + form catat kepindahan. Jamaah ditandai status_domisili =
   'Pindah' (migrasi 20260910200000): keluar dari Data Jamaah aktif,
   masuk daftar di sini. Bisa dikembalikan ke daftar aktif. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut, X, Undo2, MapPin, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import SkeletonKartuList from '@/components/ui/SkeletonKartuList';
import EmptyState from '@/components/ui/EmptyState';
import PesanGalat from '@/components/ui/PesanGalat';
import FieldTanggal from '@/components/ui/FieldTanggal';
import { FieldSaran } from '@/components/ui/FieldSaran';
import { saranUnikDenganRec } from '@/lib/saran';
import { KOLOM_JAMAAH_PINDAH, type JamaahRow } from '@/lib/jamaah';
import { PESAN_PENGUNJUNG_HANYA_LIHAT } from '@/lib/pengunjung';

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-navy focus:outline-none';
const LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

/* 'YYYY-MM-DD' -> "21 Agu 2026". */
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function tglTampil(v: string | null | undefined): string {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  return `${String(d).padStart(2, '0')} ${BULAN[m - 1] ?? ''} ${y}`;
}

export default function JamaahPindahManager() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [rows, setRows] = useState<JamaahRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [catatTerbuka, setCatatTerbuka] = useState(false);
  const [pulihkan, setPulihkan] = useState<JamaahRow | null>(null);
  const [proses, setProses] = useState(false);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('jamaah')
      .select(KOLOM_JAMAAH_PINDAH)
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama');
    if (err) setError(err.message);
    else setRows((data ?? []) as unknown as JamaahRow[]);
    setLoading(false);
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const aktif = useMemo(
    () => rows.filter((j) => j.status_domisili !== 'Pindah'),
    [rows],
  );
  const pindah = useMemo(
    () =>
      rows
        .filter((j) => j.status_domisili === 'Pindah')
        .sort((a, b) => (b.tanggal_pindah ?? '').localeCompare(a.tanggal_pindah ?? '')),
    [rows],
  );

  async function kembalikan() {
    if (!pulihkan) return;
    if (profile?.role === 'pengunjung') {
      setError(PESAN_PENGUNJUNG_HANYA_LIHAT);
      setPulihkan(null);
      return;
    }
    setProses(true);
    const { error: err } = await supabase
      .from('jamaah')
      .update({ status_domisili: null, tanggal_pindah: null, pindah_ke: null })
      .eq('id', pulihkan.id);
    setProses(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPulihkan(null);
    muat();
  }

  return (
    <div className="px-[18px] pt-4 pb-10">
      <div className="mb-1 text-[17px] font-extrabold text-text">Jamaah Pindah</div>
      <p className="mb-4 text-[12px] text-text-dim">
        Jamaah yang pindah keluar kelompok. Mereka keluar dari Data Jamaah aktif
        dan tidak dihitung di ringkasan.
      </p>

      <button
        type="button"
        onClick={() => setCatatTerbuka(true)}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] border-none bg-navy px-4 py-2.5 text-[13px] font-extrabold text-white active:scale-[0.98]"
      >
        <LogOut size={15} strokeWidth={2.2} />
        Catat Kepindahan
      </button>

      {error && <PesanGalat pesan={error} onCobaLagi={muat} sedangMemuat={loading} className="mb-4" />}

      {loading ? (
        <SkeletonKartuList />
      ) : pindah.length === 0 ? (
        <EmptyState
          ikon={<LogOut size={22} />}
          judul="Belum ada jamaah pindah"
          deskripsi="Catat jamaah yang pindah keluar kelompok agar Data Jamaah aktif tetap rapi."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {pindah.map((j) => (
            <button
              key={j.id}
              type="button"
              onClick={() => setPulihkan(j)}
              className="flex items-start justify-between gap-3 rounded-card border-[1.5px] border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-bold text-text">{j.nama}</div>
                <div className="mt-1 flex flex-col gap-0.5 text-[11.5px] text-text-dim">
                  {j.pindah_ke && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={11} strokeWidth={2} className="shrink-0" />
                      <span className="truncate">{j.pindah_ke}</span>
                    </span>
                  )}
                  {j.tanggal_pindah && (
                    <span className="flex items-center gap-1.5">
                      <CalendarClock size={11} strokeWidth={2} className="shrink-0" />
                      {tglTampil(j.tanggal_pindah)}
                    </span>
                  )}
                  {!j.pindah_ke && !j.tanggal_pindah && <span>Tanpa detail kepindahan</span>}
                </div>
              </div>
              <span className="mt-0.5 shrink-0 rounded-full bg-navy-lembut px-2.5 py-1 text-[10.5px] font-bold text-navy">
                Pindah
              </span>
            </button>
          ))}
        </div>
      )}

      {catatTerbuka && (
        <CatatPindahForm
          aktif={aktif}
          onSelesai={() => {
            setCatatTerbuka(false);
            muat();
          }}
          onBatal={() => setCatatTerbuka(false)}
        />
      )}

      {pulihkan && (
        <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-[420px] rounded-t-[24px] border border-border bg-panel p-5 sm:rounded-card">
            <div className="text-[15px] font-extrabold text-text">Kembalikan ke Data Jamaah?</div>
            <p className="mt-1.5 text-[12.5px] text-text-dim">
              <span className="font-semibold text-text">{pulihkan.nama}</span> akan kembali muncul di
              Data Jamaah aktif. Status domisili & detail kepindahan dikosongkan.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => setPulihkan(null)}
                className="flex-1 rounded-[var(--radius-button)] border border-border bg-panel px-4 py-2.5 text-[13px] font-bold text-text-dim active:scale-[0.98]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={kembalikan}
                disabled={proses}
                className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-button)] border-none bg-navy px-4 py-2.5 text-[13px] font-extrabold text-white active:scale-[0.98] disabled:opacity-50"
              >
                <Undo2 size={15} strokeWidth={2.2} />
                {proses ? 'Memproses…' : 'Kembalikan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CatatPindahForm({
  aktif,
  onSelesai,
  onBatal,
}: {
  aktif: JamaahRow[];
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const { profile } = useAuth();
  const [teksNama, setTeksNama] = useState('');
  const [terpilih, setTerpilih] = useState<JamaahRow | null>(null);
  const [tanggal, setTanggal] = useState('');
  const [tujuan, setTujuan] = useState('');
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saranNama = useMemo(() => saranUnikDenganRec(aktif, (j) => j.nama), [aktif]);

  async function simpan() {
    if (!terpilih) {
      setError('Pilih jamaah dari daftar dulu.');
      return;
    }
    if (profile?.role === 'pengunjung') {
      setError(PESAN_PENGUNJUNG_HANYA_LIHAT);
      return;
    }
    setMenyimpan(true);
    setError(null);
    const { error: err } = await supabase
      .from('jamaah')
      .update({
        status_domisili: 'Pindah',
        tanggal_pindah: tanggal || null,
        pindah_ke: tujuan.trim() || null,
      })
      .eq('id', terpilih.id);
    setMenyimpan(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSelesai();
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[17px] font-extrabold text-text">Catat Kepindahan</h2>
          <button
            type="button"
            onClick={onBatal}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <FieldSaran
            inputClass={INPUT}
            labelClass={LABEL}
            label="Jamaah"
            wajib
            value={teksNama}
            onChange={(v) => {
              setTeksNama(v);
              setTerpilih(null);
            }}
            onPilih={(item) => {
              if (item.rec) {
                setTerpilih(item.rec);
                setTeksNama(item.rec.nama);
              }
            }}
            saran={saranNama}
            placeholder="Ketik nama jamaah yang pindah"
          />
          {terpilih && (
            <p className="-mt-2 text-[11.5px] text-navy">
              Dipilih: <span className="font-semibold">{terpilih.nama}</span>
            </p>
          )}

          <div>
            <label className={LABEL}>Tanggal Pindah</label>
            <FieldTanggal nilai={tanggal} onPilih={setTanggal} className={INPUT} />
          </div>

          <div>
            <label className={LABEL}>Pindah Ke</label>
            <input
              className={INPUT}
              value={tujuan}
              onChange={(e) => setTujuan(e.target.value)}
              placeholder="mis. Sidoarjo — ikut keluarga"
            />
          </div>

          <p className="rounded-card border border-navy-lembut-2 bg-navy-lembut p-3 text-[11.5px] text-navy-tua">
            Jamaah ini akan keluar dari Data Jamaah aktif dan pindah ke daftar
            “Jamaah Pindah”. Bisa dikembalikan kapan saja.
          </p>
        </div>

        <div className="border-t border-border px-5 py-4">
          {error && <p className="mb-2 text-[12.5px] font-semibold text-red">{error}</p>}
          <button
            type="button"
            onClick={simpan}
            disabled={menyimpan || !terpilih}
            className="w-full rounded-[var(--radius-button)] border-none bg-navy px-5 py-3.5 text-[14px] font-extrabold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {menyimpan ? 'Menyimpan…' : 'Catat Pindah'}
          </button>
        </div>
      </div>
    </div>
  );
}
