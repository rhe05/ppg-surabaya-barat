'use client';

/* Isi fitur "Registrasi Guru" -- diekstrak (2026-08-24) dari
   app/pengaturan/page.tsx supaya dipakai BERSAMA oleh dua tempat tanpa
   duplikasi/berisiko drift:
   1. Kartu "Registrasi Guru" di /pengaturan (desktop admin, semua peran
      admin_ppg/desa/kelompok, berbagi kelompokId dgn kartu lain di
      halaman itu).
   2. Halaman mobile /registrasi-guru (admin_kelompok, diminta owner:
      tap "Registrasi" di menu mobile admin kelp SEHARUSNYA langsung ke
      sini, bukan lagi ke /pendaftaran -- guru sekelompoknya didaftarkan
      lewat klaim cepat yang sudah ada, bukan antrean persetujuan lama).

   Konsep & mekanisme klaim TIDAK berubah dari sebelumnya: form ini cuma
   cara ringkas mengisi tabel `guru` yang sudah ada (guru_insert_admin
   RLS), guru-nya klaim akun sendiri lewat cari_guru_untuk_klaim/
   klaim_akun_guru yang SUDAH ADA. Status klaim (Menunggu/Sudah
   Bergabung) lewat RPC status_klaim_guru (SECURITY DEFINER, migrasi
   20260824120000) krn profiles_self_read RLS tidak mengizinkan admin
   membaca profil guru lain langsung.

   Komponen ini SELF-CONTAINED (state error/pesan/sibuk miliknya
   sendiri, TIDAK berbagi dgn state lain di halaman pemanggil) --
   sengaja begini supaya bisa ditempel di halaman mana pun tanpa
   pemanggil perlu menyediakan state tambahan. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type GuruRegistrasi = {
  id: number;
  nama: string;
  kategori: string | null;
  sudahKlaim: boolean;
  klaimPada: string | null;
};

/* "Guru" atau "Ketua Muda-i" (2026-08-26, diminta owner) -- pilihan
   ringan di registrasi cepat, BUKAN dropdown kategori penuh (Muballigh
   Tugasan/Setempat/Guru Bantu, lihat components/guru/GuruForm.tsx):
   registrasi di sini cuma perlu tahu "biasa" vs "koordinator Remaja
   Pra Nikah" -- kategori spesifik lainnya diisi belakangan lewat Data
   Guru kalau admin memang perlu itu. Pilih "Guru" = kategori NULL
   (default lama, tidak berubah), pilih "Ketua Muda-i" = kategori diisi
   persis KATEGORI di GuruForm.tsx supaya konsisten dgn dropdown "Ketua
   Muda-i" di components/kelas/KelasForm.tsx (kelas Remaja Pra Nikah). */
const KATEGORI_KETUA_MUDAI = 'Ketua Muda-i';

/* "Senin, 24 Agustus 2026 · 14:32" -- kapan orangnya benar2 mengklaim
   akun, bukan kapan didaftarkan. */
export function formatWaktuBergabung(iso: string) {
  const d = new Date(iso);
  const tanggal = d.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${tanggal} · ${jam}`;
}

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';
const KELAS_TOMBOL_UTAMA =
  'cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] ' +
  'font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] ' +
  'font-semibold text-text transition-all duration-200 hover:bg-border';

export default function RegistrasiGuru({ kelompokId }: { kelompokId: number | null }) {
  const [daftarGuruReg, setDaftarGuruReg] = useState<GuruRegistrasi[]>([]);
  const [namaGuruBaru, setNamaGuruBaru] = useState('');
  const [jenisBaru, setJenisBaru] = useState<'guru' | 'ketua_mudai'>('guru');
  const [tampilkanGuruBergabung, setTampilkanGuruBergabung] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const muatGuruRegistrasi = useCallback(async () => {
    if (!kelompokId) {
      setDaftarGuruReg([]);
      return;
    }
    const { data, error: err } = await supabase
      .from('guru')
      .select('id, nama, kategori')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama');
    if (err) {
      setError(err.message);
      return;
    }
    const guruList = data ?? [];
    if (guruList.length === 0) {
      setDaftarGuruReg([]);
      return;
    }
    const { data: statusData, error: errStatus } = await supabase.rpc('status_klaim_guru', {
      p_guru_ids: guruList.map((g) => g.id),
    });
    if (errStatus) {
      setError(errStatus.message);
      return;
    }
    const petaStatus = new Map(
      ((statusData ?? []) as { guru_id: number; sudah_klaim: boolean; klaim_pada: string | null }[]).map(
        (s) => [s.guru_id, s],
      ),
    );
    setDaftarGuruReg(
      guruList.map((g) => ({
        id: g.id,
        nama: g.nama,
        kategori: g.kategori,
        sudahKlaim: petaStatus.get(g.id)?.sudah_klaim ?? false,
        klaimPada: petaStatus.get(g.id)?.klaim_pada ?? null,
      })),
    );
  }, [kelompokId]);

  useEffect(() => {
    muatGuruRegistrasi();
  }, [muatGuruRegistrasi]);

  async function daftarkanGuru() {
    if (!kelompokId || !namaGuruBaru.trim()) return;
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('guru').insert({
        kelompok_id: kelompokId,
        nama: namaGuruBaru.trim(),
        kategori: jenisBaru === 'ketua_mudai' ? KATEGORI_KETUA_MUDAI : null,
      });
      if (err) throw new Error(err.message);
      setNamaGuruBaru('');
      setJenisBaru('guru');
      setPesan('Guru terdaftar.');
      await muatGuruRegistrasi();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mendaftarkan guru.');
    } finally {
      setSibuk(false);
    }
  }

  async function batalkanGuruReg(g: GuruRegistrasi) {
    if (!window.confirm(`Batalkan pendaftaran "${g.nama}"?`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase
        .from('guru')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', g.id);
      if (err) throw new Error(err.message);
      setPesan('Pendaftaran dibatalkan.');
      await muatGuruRegistrasi();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membatalkan.');
    }
  }

  if (!kelompokId) {
    return <p className="text-[13px] text-text-dim">Kelompok belum diketahui.</p>;
  }

  const menunggu = daftarGuruReg.filter((g) => !g.sudahKlaim);
  const sudahBergabung = daftarGuruReg.filter((g) => g.sudahKlaim);

  return (
    <>
      {pesan && <p className="mb-3 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-3 text-[13px] text-red">{error}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius)] border border-border bg-panel-2 p-3.5">
        <div className="min-w-[200px] flex-1">
          <label className={KELAS_LABEL}>Nama Lengkap</label>
          <input
            className={KELAS_INPUT}
            value={namaGuruBaru}
            onChange={(e) => setNamaGuruBaru(e.target.value)}
            placeholder="Nama sesuai KTP/yang biasa dipakai"
          />
        </div>
        <div className="w-full">
          <label className={KELAS_LABEL}>Daftarkan Sebagai</label>
          <div className="flex gap-2">
            {(
              [
                { nilai: 'guru', label: 'Guru' },
                { nilai: 'ketua_mudai', label: 'Ketua Muda-i' },
              ] as const
            ).map((opsi) => (
              <button
                key={opsi.nilai}
                type="button"
                onClick={() => setJenisBaru(opsi.nilai)}
                className={`flex-1 cursor-pointer rounded-[var(--radius)] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all duration-150 active:scale-[0.97] ${
                  jenisBaru === opsi.nilai ? 'border-indigo bg-[#EEF2FF] text-indigo' : 'border-border bg-panel text-text'
                }`}
              >
                {opsi.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={daftarkanGuru} disabled={sibuk || !namaGuruBaru.trim()} className={KELAS_TOMBOL_UTAMA}>
          Daftar
        </button>
      </div>

      {menunggu.length === 0 && sudahBergabung.length === 0 && (
        <p className="text-[13px] text-text-dim">Belum ada guru yang didaftarkan.</p>
      )}

      {menunggu.map((g) => (
        <div
          key={g.id}
          className="mb-2 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2"
        >
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-semibold text-text">{g.nama}</span>
            {g.kategori === KATEGORI_KETUA_MUDAI && (
              <span className="rounded-full bg-[rgba(79,70,229,0.12)] px-2 py-0.5 text-[11px] font-bold text-indigo">
                Ketua Muda-i
              </span>
            )}
            <span className="rounded-full bg-[rgba(217,119,6,0.12)] px-2 py-0.5 text-[11px] font-bold text-brass">
              Menunggu
            </span>
          </div>
          <button onClick={() => batalkanGuruReg(g)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
            Batalkan
          </button>
        </div>
      ))}

      {sudahBergabung.length > 0 && (
        <div className={menunggu.length > 0 ? 'mt-3' : undefined}>
          <button
            type="button"
            onClick={() => setTampilkanGuruBergabung((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius)] border-none bg-transparent px-1 py-1.5 text-left text-[12.5px] font-semibold text-text-dim"
          >
            <span>Sudah Bergabung ({sudahBergabung.length})</span>
            <span className="text-[11px]">{tampilkanGuruBergabung ? 'Sembunyikan ▲' : 'Tampilkan ▼'}</span>
          </button>
          {tampilkanGuruBergabung && (
            <div className="mt-1.5">
              {sudahBergabung.map((g) => (
                <div key={g.id} className="mb-2 rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[13px] font-semibold text-text">{g.nama}</span>
                    <span className="rounded-full bg-[rgba(79,70,229,0.12)] px-2 py-0.5 text-[11px] font-bold text-indigo">
                      {g.kategori === KATEGORI_KETUA_MUDAI ? 'Ketua Muda-i' : 'Guru'}
                    </span>
                    <span className="rounded-full bg-[rgba(5,150,105,0.12)] px-2 py-0.5 text-[11px] font-bold text-sage">
                      Sudah Bergabung
                    </span>
                  </div>
                  {g.klaimPada && (
                    <div className="mt-1 text-[11px] text-text-faint">Bergabung {formatWaktuBergabung(g.klaimPada)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
