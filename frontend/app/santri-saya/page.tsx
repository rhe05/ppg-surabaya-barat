'use client';

/* Halaman "Data Generus" — mobile guru, diletakkan di bawah Dashboard pada
   menu hamburger (MenuGuru.tsx). Guru melihat & mengelola data santri HANYA
   untuk kelas yang dia ampu sendiri; kalau mengampu >1 kelas, dia memilih
   dulu lewat KelasGate (pola yang sama dipakai /absensi).

   Tambah lewat RPC tambah_santri (kelas_ngaji dikunci ke kelas yang sedang
   dibuka), ubah lewat UPDATE langsung -- keduanya ditahan RLS/scope guru
   (migrasi 20260821120000), jadi penguncian di layar ini kenyamanan, bukan
   satu-satunya pengaman. Admin sudah punya jalur sendiri di /santri
   (desktop, tabel penuh lintas kelas) -- halaman ini tidak menggantikannya. */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import KelasGate, { KelasGateItem } from '@/components/absensi/KelasGate';
import SantriForm, { SantriRow, KOLOM_SANTRI } from '@/components/santri/SantriForm';

type Kelas = { id: number; nama: string; santri_count: number };

const JENJANG_SINGKAT: Record<string, string> = {
  'PAUD/TK': 'PAUD/TK',
  'Cabe Rawit': 'Cabe Rawit',
  'Pra Remaja': 'Pra Remaja',
  'Remaja SMA': 'Remaja SMA',
  Remaja: 'Remaja',
};

function IkonKelas() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
    </svg>
  );
}

function DataGenerusContent() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | null>(null);
  const [gateTerbuka, setGateTerbuka] = useState(false);

  const [santri, setSantri] = useState<SantriRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [santriDiubah, setSantriDiubah] = useState<SantriRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function muatKelas() {
      if (!guruId) {
        setKelasList([]);
        return;
      }
      const { data } = await supabase
        .from('kelas')
        .select('id, nama, santri_count')
        .eq('guru_id', guruId)
        .is('deleted_at', null)
        .order('nama');
      if (cancelled) return;
      const daftar = data ?? [];
      setKelasList(daftar);
      if (daftar.length === 1) setKelasId(daftar[0].id);
      else if (daftar.length > 1) setGateTerbuka(true);
    }
    muatKelas();
    return () => {
      cancelled = true;
    };
  }, [guruId]);

  const muatSantri = useCallback(async () => {
    if (!kelasId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('santri')
      .select(KOLOM_SANTRI)
      .eq('kelas_id', kelasId)
      .is('deleted_at', null)
      .order('nama');
    if (err) setError(err.message);
    else setSantri((data ?? []) as unknown as SantriRow[]);
    setLoading(false);
  }, [kelasId]);

  useEffect(() => {
    muatSantri();
  }, [muatSantri]);

  const kelasAktif = kelasList.find((k) => k.id === kelasId) ?? null;
  const gateDaftar: KelasGateItem[] = kelasList.map((k) => ({
    id: k.id,
    nama: k.nama,
    jumlah: k.santri_count,
  }));

  const santriTersaring = cari.trim()
    ? santri.filter(
        (s) =>
          s.nama.toLowerCase().includes(cari.trim().toLowerCase()) ||
          (s.nis ?? '').toLowerCase().includes(cari.trim().toLowerCase()),
      )
    : santri;

  function bukaTambah() {
    setSantriDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(s: SantriRow) {
    setSantriDiubah(s);
    setFormTerbuka(true);
  }
  function selesaiForm() {
    setFormTerbuka(false);
    setSantriDiubah(null);
    muatSantri();
  }

  if (!guruId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-[24px] font-bold text-text">Data Generus</h1>
        <p className="text-[13px] text-text-dim">
          Halaman ini untuk akun yang tertaut ke data guru. Akun Anda belum punya tautan itu
          (<code>profiles.guru_id</code> masih kosong), jadi Data Generus belum bisa dipakai.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 pb-28">
      <KelasGate
        terbuka={gateTerbuka}
        ikon={<IkonKelas />}
        judul="Pilih Kelas"
        subjudul="Jenengan mengajar lebih dari satu kelas. Pilih salah satu untuk melihat Data Generus-nya."
        daftar={gateDaftar}
        onPilih={(item) => {
          setKelasId(item.id);
          setGateTerbuka(false);
        }}
        onBatal={() => setGateTerbuka(false)}
      />

      {formTerbuka && kelasAktif && (
        <SantriForm
          santri={santriDiubah}
          kelasNgajiTerkunci={kelasAktif.nama}
          onSelesai={selesaiForm}
          onBatal={() => setFormTerbuka(false)}
        />
      )}

      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold text-text">Data Generus</h1>
          <p className="text-[13px] text-text-dim">
            {kelasAktif ? `Kelas ${kelasAktif.nama}` : 'Belum ada kelas dipilih'}
          </p>
        </div>
        {kelasList.length > 1 && (
          <button
            type="button"
            onClick={() => setGateTerbuka(true)}
            className="shrink-0 cursor-pointer rounded-full border border-border bg-panel-2 px-3 py-1.5 text-[12px] font-semibold text-text active:scale-[0.97]"
          >
            Ganti Kelas
          </button>
        )}
      </div>

      {kelasList.length === 0 && (
        <p className="mt-4 text-[13px] text-text-dim">
          Anda belum mengampu kelas mana pun, jadi belum ada Data Generus yang bisa ditampilkan.
        </p>
      )}

      {kelasAktif && (
        <>
          <div className="my-4">
            <input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama atau NIS..."
              className="w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
            />
          </div>

          {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
          {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

          {!loading && santriTersaring.length === 0 && (
            <p className="text-[13px] text-text-dim">
              {cari.trim() ? 'Tidak ada yang cocok.' : 'Kelas ini belum punya santri.'}
            </p>
          )}

          <div className="flex flex-col gap-2.5">
            {santriTersaring.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => bukaUbah(s)}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-text">{s.nama}</div>
                  <div className="mt-0.5 text-[11.5px] text-text-faint">
                    NIS {s.nis ?? '-'} · {s.gender === 'L' ? 'Laki-laki' : s.gender === 'P' ? 'Perempuan' : '-'}
                  </div>
                </div>
                {s.jenjang_saat_ini && (
                  <span className="shrink-0 rounded-full bg-[rgba(5,150,105,0.12)] px-2.5 py-1 text-[10.5px] font-bold text-sage">
                    {JENJANG_SINGKAT[s.jenjang_saat_ini] ?? s.jenjang_saat_ini}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* fixed ke viewport SUNGGUHAN (bungkus RequireAuth mobile sengaja
              bukan containing block, lihat komentarnya) -- makanya
              pemusatan ke lebar 430px dilakukan lewat wrapper DI DALAM
              elemen fixed ini, bukan left-1/2 langsung. */}
          <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-6">
            <div className="w-full max-w-[430px] px-0 flex justify-center">
              <button
                type="button"
                onClick={bukaTambah}
                className="cursor-pointer rounded-full border border-brass bg-brass px-6 py-3.5 text-[13px] font-bold text-white shadow-[0_10px_28px_rgba(217,119,6,0.35)] active:scale-[0.97]"
              >
                + Tambah Generus
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function DataGenerusPage() {
  return (
    <RequireAuth>
      <DataGenerusContent />
    </RequireAuth>
  );
}
