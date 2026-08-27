'use client';

/* "Peringkat" — fitur tersendiri, mobile admin_kelp (2026-08-27, diminta
   owner). Peringkat kehadiran berbasis POIN, 10 teratas, terpisah utk
   Generus & Guru, pilih Bulan+Tahun lewat pemilih premium.

   Nilai poin per status DIATUR TIAP KELOMPOK (tabel peringkat_konfig_poin,
   migrasi 20260827100000) lewat tombol gerigi -> modal "Pengaturan Poin".
   Kalau tabel/baris belum ada, pakai default 3/1/1/0 (fitur tetap jalan,
   cuma tombol Simpan yang gagal sampai migrasi dijalankan). Rumus di
   lib/peringkatKehadiran.ts. */

import { useCallback, useEffect, useState } from 'react';
import { Award, Settings2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import PilihBulanTahun from '@/components/ui/PilihBulanTahun';
import {
  muatPeringkatGenerus,
  muatPeringkatGuru,
  muatKonfigPoin,
  simpanKonfigPoin,
  KONFIG_POIN_DEFAULT,
  type BarisPeringkat,
  type KonfigPoin,
} from '@/lib/peringkatKehadiran';

type Tab = 'generus' | 'guru';

const MEDALI = ['#D97706', '#94A3B8', '#B45309']; // emas / perak / perunggu

export default function PeringkatKelpMobile() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [tab, setTab] = useState<Tab>('generus');

  const [konfig, setKonfig] = useState<KonfigPoin>(KONFIG_POIN_DEFAULT);
  const [baris, setBaris] = useState<BarisPeringkat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pengaturanTerbuka, setPengaturanTerbuka] = useState(false);

  useEffect(() => {
    if (!kelompokId) return;
    let batal = false;
    muatKonfigPoin(kelompokId).then((k) => {
      if (!batal) setKonfig(k);
    });
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const hasil =
        tab === 'generus'
          ? await muatPeringkatGenerus(kelompokId, tahun, bulan, konfig)
          : await muatPeringkatGuru(kelompokId, tahun, bulan, konfig);
      setBaris(hasil);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat peringkat.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tahun, bulan, tab, konfig]);

  useEffect(() => {
    muat();
  }, [muat]);

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Peringkat" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[17px] font-extrabold text-text">Peringkat Kehadiran</div>
            <div className="mt-0.5 text-[11.5px] text-text-dim">10 poin tertinggi &middot; hari kerja</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PilihBulanTahun
              bulan={bulan}
              tahun={tahun}
              onChange={(b, t) => {
                setBulan(b);
                setTahun(t);
              }}
            />
            <button
              type="button"
              aria-label="Pengaturan Poin"
              onClick={() => setPengaturanTerbuka(true)}
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-panel-2 text-text-dim active:scale-[0.92]"
            >
              <Settings2 size={15} />
            </button>
          </div>
        </div>

        <div className="mb-4 flex rounded-full border border-border bg-panel-2 p-1">
          {(['generus', 'guru'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 cursor-pointer rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                tab === t ? 'bg-panel text-text shadow-[0_1px_3px_rgba(0,0,0,0.08)]' : 'text-text-dim'
              }`}
            >
              {t === 'generus' ? 'Generus' : 'Guru'}
            </button>
          ))}
        </div>

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="mb-4 text-[13px] text-text-dim">Menghitung...</p>}

        {!loading && !error && baris.length === 0 && (
          <div className="rounded-card border border-border bg-panel p-6 text-center shadow-[var(--shadow-card)]">
            <Award size={24} className="mx-auto mb-2 text-text-faint" />
            <p className="text-[13px] text-text-dim">
              Belum ada data kehadiran {tab === 'generus' ? 'generus' : 'guru'} pada bulan ini.
            </p>
          </div>
        )}

        {!loading && baris.length > 0 && (
          <ol className="flex flex-col gap-2">
            {baris.map((b, i) => (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-card border border-border bg-panel p-3.5 shadow-[var(--shadow-card)]"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums"
                  style={
                    i < 3
                      ? { background: `${MEDALI[i]}1F`, color: MEDALI[i] }
                      : { background: 'var(--panel-2)', color: 'var(--text-dim)' }
                  }
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold text-text">{b.nama}</div>
                  <div className="mt-0.5 text-[11px] text-text-dim">
                    Hadir {b.hadir}
                    {b.izin > 0 ? ` · Izin ${b.izin}` : ''}
                    {b.sakit > 0 ? ` · Sakit ${b.sakit}` : ''}
                    {b.alpa > 0 ? ` · Alpa ${b.alpa}` : ''}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[16px] leading-none font-extrabold tabular-nums text-teal">
                    {b.poin}
                  </div>
                  <div className="text-[10.5px] font-bold tracking-[0.04em] text-text-dim uppercase">
                    Poin
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-5 rounded-[var(--radius)] bg-panel-2 px-3.5 py-3 text-[11px] leading-relaxed text-text-dim">
          <span className="font-bold text-text">Poin saat ini:</span> Hadir {konfig.hadir} &middot; Izin{' '}
          {konfig.izin} &middot; Sakit {konfig.sakit} &middot; Alpa {konfig.alpa}.{' '}
          {tab === 'guru' && (
            <>
              Untuk guru, <span className="font-semibold">Hadir</span> = jumlah hari mengisi absensi
              kelasnya; <span className="font-semibold">Izin/Sakit</span> = hari tercatat di Guru Izin.
            </>
          )}
        </div>
      </div>

      {pengaturanTerbuka && kelompokId && (
        <PengaturanPoin
          kelompokId={kelompokId}
          awal={konfig}
          olehId={profile?.id ?? null}
          onSelesai={(k) => {
            setKonfig(k);
            setPengaturanTerbuka(false);
          }}
          onBatal={() => setPengaturanTerbuka(false)}
        />
      )}
    </main>
  );
}

const BARIS_POIN: { kunci: keyof KonfigPoin; label: string; ket: string }[] = [
  { kunci: 'hadir', label: 'Hadir', ket: 'generus/guru masuk' },
  { kunci: 'izin', label: 'Izin', ket: 'keperluan keluarga / lainnya' },
  { kunci: 'sakit', label: 'Sakit', ket: 'izin karena sakit' },
  { kunci: 'alpa', label: 'Alpa', ket: 'tanpa keterangan' },
];

function PengaturanPoin({
  kelompokId,
  awal,
  olehId,
  onSelesai,
  onBatal,
}: {
  kelompokId: number;
  awal: KonfigPoin;
  olehId: string | null;
  onSelesai: (k: KonfigPoin) => void;
  onBatal: () => void;
}) {
  const [nilai, setNilai] = useState<KonfigPoin>({ ...awal });
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function ubah(kunci: keyof KonfigPoin, v: string) {
    const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    setNilai((s) => ({ ...s, [kunci]: n }));
  }

  async function simpan() {
    setSibuk(true);
    setError(null);
    try {
      await simpanKonfigPoin(kelompokId, nilai, olehId);
      onSelesai(nilai);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Gagal menyimpan: ${e.message}. Pastikan migrasi peringkat_konfig_poin sudah dijalankan.`
          : 'Gagal menyimpan.',
      );
      setSibuk(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-[430px] rounded-t-[26px] border border-border bg-panel p-5 shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-text">Pengaturan Poin</h2>
          <button
            type="button"
            onClick={onBatal}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-[12px] text-text-dim">
          Nilai poin per status untuk kelompok Anda. Peringkat langsung dihitung ulang.
        </p>

        <div className="flex flex-col gap-2.5">
          {BARIS_POIN.map((b) => (
            <div
              key={b.kunci}
              className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-text">{b.label}</div>
                <div className="text-[11px] text-text-faint">{b.ket}</div>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={nilai[b.kunci]}
                onChange={(e) => ubah(b.kunci, e.target.value)}
                className="w-16 shrink-0 rounded-[var(--radius)] border border-border bg-panel px-2 py-2 text-center text-[15px] font-extrabold text-text tabular-nums focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
              />
            </div>
          ))}
        </div>

        {error && <p className="mt-3 text-[12px] text-red">{error}</p>}

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => setNilai({ ...KONFIG_POIN_DEFAULT })}
            className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[12.5px] font-semibold text-text active:scale-[0.98]"
          >
            Default
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={simpan}
            className="flex-1 cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {sibuk ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
