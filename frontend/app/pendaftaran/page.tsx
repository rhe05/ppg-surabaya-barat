'use client';

/* Halaman peninjauan pendaftaran akun — pasangan admin dari /onboarding.
   Fondasi DB-nya migrasi 20260819090000 (tabel pendaftaran_akun + RPC
   setujui_pendaftaran/tolak_pendaftaran).

   Yang TIDAK dikerjakan halaman ini: memutuskan siapa boleh menyetujui apa.
   Itu diperiksa di dalam RPC-nya (admin_ppg semua; admin_desa guru/admin
   kelp sedesanya; admin_kelp guru sekelompoknya), dan daftar yang terbaca
   pun sudah disaring policy pendaftaran_read_scoped. UI di sini hanya
   menyembunyikan tombol yang pasti ditolak — kalau ada selisih antara
   keduanya, DB yang menang dan pesannya ditampilkan apa adanya. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const PERAN_ADMIN = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

const LABEL_PERAN: Record<string, string> = {
  guru: 'Guru',
  admin_kelompok: 'Admin Kelp',
  admin_desa: 'Admin Desa',
  admin_ppg: 'Admin Aplikasi',
};

type Status = 'menunggu' | 'disetujui' | 'ditolak';

type Pendaftaran = {
  id: string;
  nama_lengkap: string;
  peran_diminta: string;
  kelompok_id: number | null;
  desa_id: number | null;
  ppg_id: number | null;
  status: Status;
  alasan_tolak: string | null;
  ditinjau_pada: string | null;
  created_at: string;
};

type Guru = { id: number; nama: string };

const KELAS_TOMBOL_UTAMA =
  'cursor-pointer rounded-[var(--radius)] border border-brand-green bg-brand-green px-4 py-2.5 ' +
  'text-[13px] font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2 text-[12.5px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border disabled:opacity-50';
const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';

function tanggalIndo(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function PendaftaranContent() {
  const { profile } = useAuth();
  const router = useRouter();
  const adalahAdmin = PERAN_ADMIN.includes(profile?.role ?? '');

  const [tab, setTab] = useState<'menunggu' | 'riwayat'>('menunggu');
  const [daftar, setDaftar] = useState<Pendaftaran[]>([]);
  const [namaKelompok, setNamaKelompok] = useState<Record<number, string>>({});
  const [namaDesa, setNamaDesa] = useState<Record<number, string>>({});
  const [guruPerKelompok, setGuruPerKelompok] = useState<Record<number, Guru[]>>({});

  const [tautGuru, setTautGuru] = useState<Record<string, string>>({});
  const [menolakId, setMenolakId] = useState<string | null>(null);
  const [alasan, setAlasan] = useState('');

  const [loading, setLoading] = useState(true);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [hasilDaftar, hasilKelompok, hasilDesa] = await Promise.all([
        supabase
          .from('pendaftaran_akun')
          .select(
            'id, nama_lengkap, peran_diminta, kelompok_id, desa_id, ppg_id, status, alasan_tolak, ditinjau_pada, created_at',
          )
          .order('created_at', { ascending: false }),
        supabase.from('kelompok').select('id, nama'),
        supabase.from('desa').select('id, nama'),
      ]);

      if (hasilDaftar.error) throw new Error(hasilDaftar.error.message);
      setDaftar((hasilDaftar.data ?? []) as Pendaftaran[]);
      setNamaKelompok(
        Object.fromEntries(
          ((hasilKelompok.data ?? []) as { id: number; nama: string }[]).map((k) => [k.id, k.nama]),
        ),
      );
      setNamaDesa(
        Object.fromEntries(
          ((hasilDesa.data ?? []) as { id: number; nama: string }[]).map((d) => [d.id, d.nama]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat pendaftaran');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adalahAdmin) muat();
    else setLoading(false);
  }, [adalahAdmin, muat]);

  /* Daftar guru dimuat per kelompok, hanya untuk permintaan peran 'guru' yang
     benar-benar tampil — bukan sekaligus untuk semua kelompok. Penautan ini
     opsional tapi berarti: profiles.guru_id yang kosong membuat layar guru
     (Guru Saya, jurnal, izin) tidak menemukan data guru orang itu. */
  useEffect(() => {
    const perlu = Array.from(
      new Set(
        daftar
          .filter((p) => p.status === 'menunggu' && p.peran_diminta === 'guru' && p.kelompok_id)
          .map((p) => p.kelompok_id as number),
      ),
    ).filter((id) => !(id in guruPerKelompok));

    if (perlu.length === 0) return;

    (async () => {
      const hasil = await Promise.all(
        perlu.map((id) =>
          supabase
            .from('guru')
            .select('id, nama')
            .eq('kelompok_id', id)
            .is('deleted_at', null)
            .order('nama'),
        ),
      );
      setGuruPerKelompok((sebelum) => {
        const baru = { ...sebelum };
        perlu.forEach((id, i) => {
          baru[id] = (hasil[i].data ?? []) as Guru[];
        });
        return baru;
      });
    })();
  }, [daftar, guruPerKelompok]);

  function lingkupDari(p: Pendaftaran) {
    if (p.kelompok_id) return namaKelompok[p.kelompok_id] ?? `Kelompok ${p.kelompok_id}`;
    if (p.desa_id) return `Desa ${namaDesa[p.desa_id] ?? p.desa_id}`;
    if (p.ppg_id) return 'Seluruh PPG';
    return '-';
  }

  async function setujui(p: Pendaftaran) {
    setSibuk(p.id);
    setError(null);
    setPesan(null);
    try {
      const idGuru = tautGuru[p.id];
      const { error: err } = await supabase.rpc('setujui_pendaftaran', {
        p_id: p.id,
        p_guru_id: idGuru ? Number(idGuru) : null,
      });
      if (err) throw new Error(err.message);
      setPesan(
        `${p.nama_lengkap} disetujui sebagai ${LABEL_PERAN[p.peran_diminta]} — ${lingkupDari(p)}`,
      );
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyetujui');
    } finally {
      setSibuk(null);
    }
  }

  async function tolak(p: Pendaftaran) {
    setSibuk(p.id);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.rpc('tolak_pendaftaran', {
        p_id: p.id,
        p_alasan: alasan.trim() || null,
      });
      if (err) throw new Error(err.message);
      setPesan(`Pendaftaran ${p.nama_lengkap} ditolak`);
      setMenolakId(null);
      setAlasan('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menolak');
    } finally {
      setSibuk(null);
    }
  }

  if (!adalahAdmin) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <h1 className="mb-2 text-[24px] font-bold text-text">Pendaftaran Akun</h1>
        <p className="text-[13.5px] text-text-dim">
          Halaman ini hanya untuk admin kelompok, admin desa, dan admin aplikasi.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className={KELAS_TOMBOL_SEKUNDER + ' mt-5'}
        >
          Kembali ke Dashboard
        </button>
      </div>
    );
  }

  const menunggu = daftar.filter((p) => p.status === 'menunggu');
  const riwayat = daftar.filter((p) => p.status !== 'menunggu');
  const tampil = tab === 'menunggu' ? menunggu : riwayat;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Pendaftaran Akun</h1>
      <p className="mb-6 text-[13.5px] text-text-dim">
        Permintaan peran dari akun baru. Menyetujui berarti memberi orang itu akses data sesuai
        peran dan lingkup di bawah — pastikan Anda mengenalinya.
      </p>

      <div className="mb-5 flex gap-1 rounded-[var(--radius-button)] bg-panel-2 p-1">
        {(['menunggu', 'riwayat'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 cursor-pointer rounded-[var(--radius-button)] border-none p-2.5 text-[13px] font-semibold transition-colors duration-150 ${
              tab === t
                ? 'bg-panel text-brass shadow-[var(--shadow-subtle)]'
                : 'bg-transparent text-text-faint'
            }`}
          >
            {t === 'menunggu' ? `Menunggu (${menunggu.length})` : `Riwayat (${riwayat.length})`}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
          {error}
        </p>
      )}
      {pesan && (
        <p className="mb-4 rounded-[var(--radius)] bg-[#ECFDF5] px-3.5 py-3 text-[13px] text-[#047857]">
          {pesan}
        </p>
      )}

      {loading ? (
        <p className="text-[13.5px] text-text-dim">Memuat...</p>
      ) : tampil.length === 0 ? (
        <div className="rounded-card border border-border bg-panel p-8 text-center shadow-[var(--shadow-card)]">
          <p className="text-[13.5px] text-text-dim">
            {tab === 'menunggu'
              ? 'Tidak ada pendaftaran yang menunggu persetujuan.'
              : 'Belum ada pendaftaran yang pernah ditinjau.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {tampil.map((p) => {
            const daftarGuru = p.kelompok_id ? (guruPerKelompok[p.kelompok_id] ?? []) : [];
            return (
              <div
                key={p.id}
                className="rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-text">{p.nama_lengkap}</p>
                    <p className="mt-1 text-[13px] text-text-dim">
                      {LABEL_PERAN[p.peran_diminta] ?? p.peran_diminta} · {lingkupDari(p)}
                    </p>
                    <p className="mt-1 text-[12px] text-text-faint">
                      Diajukan {tanggalIndo(p.created_at)}
                      {p.ditinjau_pada ? ` · ditinjau ${tanggalIndo(p.ditinjau_pada)}` : ''}
                    </p>
                  </div>
                  {p.status !== 'menunggu' && (
                    <span
                      className={`rounded-[var(--radius-button)] px-3 py-1 text-[12px] font-semibold ${
                        p.status === 'disetujui'
                          ? 'bg-[#ECFDF5] text-[#047857]'
                          : 'bg-[#FEF2F2] text-red'
                      }`}
                    >
                      {p.status === 'disetujui' ? 'Disetujui' : 'Ditolak'}
                    </span>
                  )}
                </div>

                {p.status === 'ditolak' && p.alasan_tolak && (
                  <p className="mt-3 text-[12.5px] text-text-dim">Alasan: {p.alasan_tolak}</p>
                )}

                {p.status === 'menunggu' && (
                  <>
                    {p.peran_diminta === 'guru' && daftarGuru.length > 0 && (
                      <div className="mt-4">
                        <label
                          className="mb-1.5 block text-[12px] font-semibold text-text-dim"
                          htmlFor={`guru-${p.id}`}
                        >
                          Tautkan ke data guru (opsional)
                        </label>
                        <select
                          id={`guru-${p.id}`}
                          value={tautGuru[p.id] ?? ''}
                          onChange={(e) => setTautGuru((s) => ({ ...s, [p.id]: e.target.value }))}
                          className={KELAS_INPUT}
                        >
                          <option value="">— tidak ditautkan —</option>
                          {daftarGuru.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.nama}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1.5 text-[12px] text-text-faint">
                          Tanpa tautan ini, layar khusus guru (Guru Saya, jurnal, izin) tidak
                          menemukan data guru yang bersangkutan.
                        </p>
                      </div>
                    )}

                    {menolakId === p.id ? (
                      <div className="mt-4">
                        <label
                          className="mb-1.5 block text-[12px] font-semibold text-text-dim"
                          htmlFor={`alasan-${p.id}`}
                        >
                          Alasan penolakan (opsional, dibaca pendaftar)
                        </label>
                        <input
                          id={`alasan-${p.id}`}
                          type="text"
                          value={alasan}
                          onChange={(e) => setAlasan(e.target.value)}
                          placeholder="mis. nama tidak dikenali di kelompok ini"
                          className={KELAS_INPUT}
                        />
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => tolak(p)}
                            disabled={sibuk === p.id}
                            className={KELAS_TOMBOL_SEKUNDER + ' text-red'}
                          >
                            {sibuk === p.id ? 'Memproses...' : 'Konfirmasi tolak'}
                          </button>
                          <button
                            onClick={() => {
                              setMenolakId(null);
                              setAlasan('');
                            }}
                            disabled={sibuk === p.id}
                            className={KELAS_TOMBOL_SEKUNDER}
                          >
                            Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => setujui(p)}
                          disabled={sibuk === p.id}
                          className={KELAS_TOMBOL_UTAMA}
                        >
                          {sibuk === p.id ? 'Memproses...' : 'Setujui'}
                        </button>
                        <button
                          onClick={() => {
                            setMenolakId(p.id);
                            setAlasan('');
                          }}
                          disabled={sibuk === p.id}
                          className={KELAS_TOMBOL_SEKUNDER + ' text-red'}
                        >
                          Tolak
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => router.push('/dashboard')} className={KELAS_TOMBOL_SEKUNDER + ' mt-6'}>
        Kembali ke Dashboard
      </button>
    </div>
  );
}

export default function PendaftaranPage() {
  return (
    <RequireAuth>
      <PendaftaranContent />
    </RequireAuth>
  );
}
