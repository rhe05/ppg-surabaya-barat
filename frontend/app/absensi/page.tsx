'use client';

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const STATUS_OPTIONS = ['hadir', 'izin', 'sakit', 'alpa'] as const;
type Status = (typeof STATUS_OPTIONS)[number];

const ROLE_BERWENANG = ['guru', 'admin_kelompok', 'admin_desa', 'admin_ppg'];

type Santri = {
  id: number;
  nama: string;
  kelompok_id: number | null;
};

type AbsensiRow = {
  id: number;
  santri_id: number;
  status: Status;
};

type Kelompok = {
  id: number;
  nama: string;
};

function tanggalHariIni() {
  const now = new Date();
  const lokal = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return lokal.toISOString().slice(0, 10);
}

function AbsensiContent() {
  const { user, profile } = useAuth();

  const [tanggal, setTanggal] = useState(tanggalHariIni);
  const [kelompokId, setKelompokId] = useState<number | null>(null);
  const [opsiKelompok, setOpsiKelompok] = useState<Kelompok[]>([]);

  const [santri, setSantri] = useState<Santri[]>([]);
  const [tersimpan, setTersimpan] = useState<Record<number, AbsensiRow>>({});
  const [pilihan, setPilihan] = useState<Record<number, Status>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);

  const berwenang =
    !!profile && !!profile.role && profile.is_active && ROLE_BERWENANG.includes(profile.role);

  useEffect(() => {
    let cancelled = false;

    async function loadKelompok() {
      if (!profile) return;
      if (profile.scope_kelompok_id) {
        setKelompokId(profile.scope_kelompok_id);
        return;
      }
      const { data, error: queryError } = await supabase
        .from('kelompok')
        .select('id, nama')
        .order('nama');
      if (cancelled) return;
      if (queryError) {
        setError('Error loading data');
        setLoading(false);
        return;
      }
      const rows: Kelompok[] = data ?? [];
      setOpsiKelompok(rows);
      setKelompokId((prev) => prev ?? rows[0]?.id ?? null);
      if (rows.length === 0) setLoading(false);
    }

    loadKelompok();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const load = useCallback(async () => {
    if (!kelompokId) return;
    setLoading(true);
    setError(null);
    try {
      const [santriRes, absensiRes] = await Promise.all([
        supabase
          .from('santri')
          .select('id, nama, kelompok_id')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null)
          .order('nama'),
        supabase
          .from('absensi')
          .select('id, santri_id, status')
          .eq('kelompok_id', kelompokId)
          .eq('tanggal', tanggal)
          .is('deleted_at', null),
      ]);

      if (santriRes.error) throw new Error(santriRes.error.message);
      if (absensiRes.error) throw new Error(absensiRes.error.message);

      const daftarSantri: Santri[] = santriRes.data ?? [];
      const daftarAbsensi: AbsensiRow[] = absensiRes.data ?? [];

      const petaTersimpan: Record<number, AbsensiRow> = {};
      for (const a of daftarAbsensi) petaTersimpan[a.santri_id] = a;

      const awal: Record<number, Status> = {};
      for (const s of daftarSantri) awal[s.id] = petaTersimpan[s.id]?.status ?? 'hadir';

      setSantri(daftarSantri);
      setTersimpan(petaTersimpan);
      setPilihan(awal);
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tanggal]);

  useEffect(() => {
    let cancelled = false;

    async function jalankan() {
      if (cancelled) return;
      await load();
    }

    jalankan();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleSimpan() {
    if (!kelompokId || santri.length === 0) return;
    setSaving(true);
    setSaveError(null);
    setSukses(null);
    try {
      const stempel = new Date().toISOString();
      const dasar = santri.map((s) => ({
        santri_id: s.id,
        kelompok_id: kelompokId,
        tanggal,
        status: pilihan[s.id] ?? 'hadir',
        dicatat_oleh: user?.id ?? null,
        updated_at: stempel,
      }));

      const barisBaru = dasar.filter((b) => !tersimpan[b.santri_id]);
      const barisLama = dasar
        .filter((b) => tersimpan[b.santri_id])
        .map((b) => ({ ...b, id: tersimpan[b.santri_id].id }));

      if (barisBaru.length > 0) {
        const { error: insertError } = await supabase.from('absensi').insert(barisBaru);
        if (insertError) {
          if (insertError.code === '23505') {
            const pilihanPengguna = { ...pilihan };
            await load();
            setPilihan((prev) => ({ ...prev, ...pilihanPengguna }));
            setSaveError(
              'Data tanggal ini baru saja diubah dari sesi lain. Tampilan sudah disegarkan — periksa lalu simpan ulang.'
            );
            return;
          }
          throw new Error(insertError.message);
        }
      }

      if (barisLama.length > 0) {
        const { error: upsertError } = await supabase.from('absensi').upsert(barisLama);
        if (upsertError) throw new Error(upsertError.message);
      }

      setSukses(
        `Tersimpan: ${barisBaru.length} baru, ${barisLama.length} diperbarui, tanggal ${tanggal}.`
      );
      await load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Gagal menyimpan absensi');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <p className="text-sm text-gray-500">Memuat profil...</p>
      </main>
    );
  }

  if (!berwenang) {
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        <div className="rounded-lg bg-white p-4 shadow">
          <h1 className="mb-2 text-lg font-semibold text-gray-800">Input Absensi</h1>
          <p className="text-sm text-red-600">
            Anda tidak berwenang mencatat absensi. Role saat ini: {profile.role ?? '-'}.
          </p>
        </div>
      </main>
    );
  }

  const perluPilihKelompok = !profile.scope_kelompok_id;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Input Absensi</h1>

      <div className="mb-6 rounded-lg bg-white p-4 shadow">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">Tanggal</span>
            <input
              type="date"
              value={tanggal}
              onChange={(e) => {
                setTanggal(e.target.value);
                setSukses(null);
                setSaveError(null);
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </label>

          {perluPilihKelompok && (
            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">Kelompok</span>
              <select
                value={kelompokId ?? ''}
                onChange={(e) => {
                  setKelompokId(e.target.value ? Number(e.target.value) : null);
                  setSukses(null);
                  setSaveError(null);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {opsiKelompok.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!perluPilihKelompok && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Kelompok:</span> {kelompokId ?? '-'}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-white p-4 shadow">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-gray-800">Daftar Santri</h2>
          <button
            onClick={handleSimpan}
            disabled={saving || loading || santri.length === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? 'Menyimpan...' : 'Simpan Absensi'}
          </button>
        </div>

        {sukses && <p className="mb-3 text-sm text-green-700">{sukses}</p>}
        {saveError && <p className="mb-3 text-sm text-red-600">{saveError}</p>}

        {loading && <p className="text-sm text-gray-500">Memuat data...</p>}
        {!loading && error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && !error && santri.length === 0 && (
          <p className="text-sm text-gray-500">No data available</p>
        )}

        {!loading && !error && santri.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-4">Nama</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {santri.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-4">
                      {s.nama}
                      {tersimpan[s.id] && (
                        <span className="ml-2 text-xs text-gray-400">tersimpan</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {STATUS_OPTIONS.map((opsi) => (
                          <label
                            key={opsi}
                            className={`cursor-pointer rounded border px-2 py-1 text-xs ${
                              pilihan[s.id] === opsi
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`status-${s.id}`}
                              value={opsi}
                              checked={pilihan[s.id] === opsi}
                              onChange={() =>
                                setPilihan((prev) => ({ ...prev, [s.id]: opsi }))
                              }
                              className="sr-only"
                            />
                            {opsi}
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AbsensiPage() {
  return (
    <RequireAuth>
      <AbsensiContent />
    </RequireAuth>
  );
}
