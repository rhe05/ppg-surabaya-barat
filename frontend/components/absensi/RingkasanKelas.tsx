'use client';

/* Ringkasan kehadiran per kelas — padanan serverGetKelasAbsenList,
   serverGetGuruDashboardSummary, serverGetGuruDashboardSummaryRange, dan
   serverGetAdminKelpDashboardSummaryRange (Modul_InputAbsen.gs:351, 1076,
   1122, 1189).

   Keempatnya di app lama adalah fungsi terpisah karena berbeda pemanggil
   (guru vs admin kelompok) dan berbeda cakupan waktu (satu hari vs
   rentang). Di sini cukup SATU komponen: cakupan datanya sudah dibatasi
   RLS — guru hanya melihat kelompoknya, admin melihat scope-nya — dan
   perbedaan satu-hari vs rentang cuma soal dua tanggal.

   PERBEDAAN PENTING antara dua mode, dipertahankan dari app lama:
   - Mode satu hari punya "Belum diinput": tiap santri dihitung sekali,
     jadi yang tidak punya catatan hari itu memang belum diisi.
   - Mode rentang TIDAK punya "Belum diinput": satu santri bisa punya
     banyak catatan dalam rentang, dan "belum" jadi tidak bermakna.
     Angkanya di sana adalah jumlah SELURUH catatan. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Kelas = { id: number; nama: string; jam_mulai: string; ruangan: string };
type Santri = { id: number; kelas_id: number | null };
type Absensi = { santri_id: number; status: string };

const STATUS = [
  { kunci: 'hadir', label: 'Hadir', warna: 'text-sage' },
  { kunci: 'izin', label: 'Izin', warna: 'text-brass' },
  { kunci: 'sakit', label: 'Sakit', warna: 'text-brass' },
  { kunci: 'alpa', label: 'Alpa', warna: 'text-red' },
];

async function ambilAbsensi(kelompokId: number, dari: string, sampai: string): Promise<Absensi[]> {
  const UKURAN = 1000;
  const semua: Absensi[] = [];
  for (let i = 0; ; i += UKURAN) {
    const { data, error } = await supabase
      .from('absensi')
      .select('santri_id, status')
      .eq('kelompok_id', kelompokId)
      .gte('tanggal', dari)
      .lte('tanggal', sampai)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(i, i + UKURAN - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Absensi[];
    semua.push(...batch);
    if (batch.length < UKURAN) break;
  }
  return semua;
}

export default function RingkasanKelas({
  kelompokId,
  tanggal,
  kelasAwal,
}: {
  kelompokId: number;
  tanggal: string;
  /* Daftar kelas kelompok ini, dioper dari layar induk (app/absensi/page.tsx)
     -- BUKAN dimuat ulang di sini (diperbaiki 2026-08-23). Induk sudah
     memuat persis query yang sama (dropdown filter kelasnya) tiap kali
     kelompokId berubah; kelas TIDAK bergantung tanggal/rentang spt
     santri/absensi, jadi aman dipakai apa adanya tanpa fetch kedua. */
  kelasAwal: Kelas[];
}) {
  const [mode, setMode] = useState<'hari' | 'rentang'>('hari');
  const [dari, setDari] = useState(tanggal);
  const [sampai, setSampai] = useState(tanggal);

  const [santri, setSantri] = useState<Santri[]>([]);
  const [absensi, setAbsensi] = useState<Absensi[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Mode hari selalu mengikuti tanggal yang dipilih di layar induk supaya
     dua bagian halaman tidak pernah menunjukkan hari yang berbeda. */
  const rentangAktif = mode === 'hari' ? { dari: tanggal, sampai: tanggal } : { dari, sampai };

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      /* Santri yang pindah/nonaktif SETELAH awal rentang ini tetap ikut --
         deleted_at dipakai sbg "sejak kapan tidak aktif" (migrasi
         20260821130000), jadi ringkasan rentang lampau tetap menunjukkan
         riwayatnya walau sekarang dia sudah tidak aktif. */
      const { data: dSantri, error: e1 } = await supabase
        .from('santri')
        .select('id, kelas_id')
        .eq('kelompok_id', kelompokId)
        .or(`deleted_at.is.null,deleted_at.gt.${rentangAktif.dari}`);
      if (e1) throw new Error(e1.message);
      setSantri((dSantri ?? []) as unknown as Santri[]);
      setAbsensi(await ambilAbsensi(kelompokId, rentangAktif.dari, rentangAktif.sampai));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat ringkasan kelas.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, rentangAktif.dari, rentangAktif.sampai]);

  useEffect(() => {
    muat();
  }, [muat]);

  const hitung = useMemo(() => {
    const perSantri = new Map<number, string[]>();
    for (const a of absensi) {
      perSantri.set(a.santri_id, [...(perSantri.get(a.santri_id) ?? []), a.status]);
    }

    /* Urut jam_mulai (bukan nama) -- kelasAwal dioper dari induk terurut
       nama (dropdown filter kelasnya), jadi diurut ulang di sini spy
       tabel Ringkasan ini tetap urut jam spt sebelumnya. */
    const baris = [...kelasAwal]
      .sort((a, b) => a.jam_mulai.localeCompare(b.jam_mulai))
      .map((k) => {
      const anggota = santri.filter((s) => s.kelas_id === k.id);
      const jumlah: Record<string, number> = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
      let belum = 0;
      for (const s of anggota) {
        const daftar = perSantri.get(s.id) ?? [];
        if (daftar.length === 0) belum += 1;
        for (const st of daftar) if (st in jumlah) jumlah[st] += 1;
      }
      return { kelas: k, total: anggota.length, jumlah, belum };
    });

    const tanpaKelas = santri.filter((s) => s.kelas_id == null).length;
    return { baris, tanpaKelas };
  }, [kelasAwal, santri, absensi]);

  if (kelasAwal.length === 0) return null;

  return (
    <div className="mt-8 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-text">Ringkasan per Kelas</div>
          <p className="text-[11px] text-text-faint">
            {mode === 'hari'
              ? `Tanggal ${tanggal}. "Belum" = santri yang belum punya catatan hari ini.`
              : 'Jumlah seluruh catatan dalam rentang, bukan per santri — jadi tidak ada kolom "Belum".'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as 'hari' | 'rentang')}
            className="rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[12px] text-text"
          >
            <option value="hari">Satu hari</option>
            <option value="rentang">Rentang tanggal</option>
          </select>
          {mode === 'rentang' && (
            <>
              <input
                type="date"
                value={dari}
                onChange={(e) => setDari(e.target.value)}
                className="rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[12px] text-text"
              />
              <input
                type="date"
                value={sampai}
                onChange={(e) => setSampai(e.target.value)}
                className="rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-[12px] text-text"
              />
            </>
          )}
        </div>
      </div>

      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {error && <p className="text-[13px] text-red">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="border-b border-border">
              <tr>
                <th className="px-2 py-2 font-semibold text-text-dim uppercase">Kelas</th>
                <th className="px-2 py-2 font-semibold text-text-dim uppercase">Santri</th>
                {STATUS.map((s) => (
                  <th key={s.kunci} className="px-2 py-2 font-semibold text-text-dim uppercase">
                    {s.label}
                  </th>
                ))}
                {mode === 'hari' && (
                  <th className="px-2 py-2 font-semibold text-text-dim uppercase">Belum</th>
                )}
              </tr>
            </thead>
            <tbody>
              {hitung.baris.map((b) => (
                <tr key={b.kelas.id} className="hover:bg-panel-2">
                  <td className="border-b border-border px-2 py-2 text-text">
                    {b.kelas.nama}
                    <span className="ml-2 text-[10px] text-text-faint">
                      {b.kelas.jam_mulai?.slice(0, 5)} · {b.kelas.ruangan}
                    </span>
                  </td>
                  <td className="border-b border-border px-2 py-2 text-text-dim">{b.total}</td>
                  {STATUS.map((s) => (
                    <td
                      key={s.kunci}
                      className={'border-b border-border px-2 py-2 font-semibold ' + s.warna}
                    >
                      {b.jumlah[s.kunci]}
                    </td>
                  ))}
                  {mode === 'hari' && (
                    <td className="border-b border-border px-2 py-2 font-semibold text-text-dim">
                      {b.belum}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hitung.tanpaKelas > 0 && (
        <p className="mt-3 text-[11px] text-brass">
          {hitung.tanpaKelas} santri belum ditempatkan di kelas mana pun, jadi tidak terhitung di
          tabel ini. Tempatkan lewat halaman Kelas.
        </p>
      )}
    </div>
  );
}
