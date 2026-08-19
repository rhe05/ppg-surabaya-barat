'use client';

/* Riwayat Kehadiran (guru mobile) — matrix santri × tanggal 1 bulan,
   read-only. Dibuka dari popup "Kehadiran" > Riwayat Kehadiran
   (components/dashboard/KehadiranChooser.tsx).

   19 Agt, dua putaran: pertama ditulis ulang mengikuti screenshot owner
   (popup Pilih Kelas kartu besar, header topbar+hero, tombol pil filter
   Bulan-Tahun terpisah). Putaran KEDUA (diminta owner lagi): pil filter
   terpisah itu DIHAPUS — kelas+bulan+tahun yang tadinya digabung jadi satu
   tulisan panjang di bawah header dianggap ramai. Sebagai gantinya, ikon
   kalender di hero (yang tadinya cuma dekorasi tanggal hari ini, tidak
   berfungsi) dijadikan SATU-SATUNYA pemicu memilih Bulan/Tahun/Minggu —
   kartu kecil menempel tepat di bawah ikon, bukan modal layar penuh.
   Caption di bawah ikon berubah dari "tanggal hari ini" jadi ringkasan
   yang sedang aktif, mis. "Agustus 2026" atau "Minggu 2 · Agustus 2026".

   Sumber (bagian yang masih dipertahankan dari app lama):
   - Popup Pilih Kelas: iaRiwayatOpenGate_/iaRenderRiwayatGateCards_
     (Script_Main.html:1988-2038), markup #iaRiwayatKelasGateOverlay
     (Markup_Screens.html:637-660) — SENGAJA TANPA badge jumlah santri,
     beda dari popup Pilih Kelas Input Absen.
   - Matrix: serverGetRiwayatKehadiranGuru (Modul_InputAbsen.gs:1592-1652).
     - Kolom tanggal HANYA hari kerja (Senin-Jumat) dalam bulan itu.
     - Hari Aktif = jumlah tanggal berbeda yang punya absensi APAPUN
       statusnya.
     - Palet badge 3-warna app lama dipertahankan apa adanya (quirk asli,
       dicek 2x di sumber): izin & sakit SAMA-SAMA kuning, cuma hadir
       (hijau tua) dan alpa (merah) beda sendiri — beda dari 4-warna kotak
       statistik dashboard/Input Absen.
     - Paginasi 1000 baris pada query absensi.
   - Pembagian Minggu: iaRiwayatBucketMinggu_ (Script_Main.html:2163-2173)
     — dihitung dari hari Senin, bukan pembagian tanggal 1-7/8-14.

   Kartu Bulan/Tahun/Minggu di bawah ikon kalender BUKAN kembalian
   .ppg-datepicker app lama (itu utk memilih 1 TANGGAL, dipakai Input
   Absen — lihat components/ui/TanggalPicker.tsx) — di sini granularitasnya
   bulan, jadi kartunya baru, tapi teknik penempatannya SAMA: posisi dihitung
   dari getBoundingClientRect() ikon pemicunya lalu dirender DI LUAR
   .ia-header (overflow-hidden tetap memotong keturunan fixed/absolute —
   sudah pernah dibuktikan pahit di TanggalPicker, jangan diulang). */

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import KelasGate, { KelasGateItem } from '@/components/absensi/KelasGate';
import MenuGuru from '@/components/dashboard/MenuGuru';
import KehadiranChooser from '@/components/dashboard/KehadiranChooser';
import JurnalChooser from '@/components/dashboard/JurnalChooser';

type Status = 'hadir' | 'izin' | 'sakit' | 'alpa';

type Kelas = {
  id: number;
  nama: string;
  ruangan: string | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  kategori_kbm: { nama: string } | { nama: string }[] | null;
};
type Santri = { id: number; nama: string; nama_panggilan: string | null };

const HARI_PENDEK = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

// IA_RIWAYAT_STATUS_HURUF_ / IA_RIWAYAT_STATUS_WARNA_ / IA_RIWAYAT_STATUS_LABEL_
const BADGE: Record<Status, { huruf: string; warna: string; label: string }> = {
  hadir: { huruf: 'H', warna: '#15803d', label: 'Hadir' },
  izin: { huruf: 'I', warna: '#a16207', label: 'Izin' },
  sakit: { huruf: 'S', warna: '#a16207', label: 'Sakit' },
  alpa: { huruf: 'A', warna: '#dc2626', label: 'Alpa' },
};

function namaDariKategori(nilai: Kelas['kategori_kbm']) {
  if (!nilai) return null;
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? null;
}

function jam(nilai: string | null) {
  return nilai ? nilai.slice(0, 5) : null;
}

function tanggalKerjaBulan(tahun: number, bulan: number): string[] {
  const jumlahHari = new Date(tahun, bulan, 0).getDate();
  const dua = (n: number) => String(n).padStart(2, '0');
  const hasil: string[] = [];
  for (let d = 1; d <= jumlahHari; d++) {
    const dow = new Date(tahun, bulan - 1, d).getDay();
    if (dow !== 0 && dow !== 6) hasil.push(`${tahun}-${dua(bulan)}-${dua(d)}`);
  }
  return hasil;
}

/* iaRiwayatBucketMinggu_ — Script_Main.html:2163-2173. Minggu ke-N dihitung
   dari hari Senin: hari-hari sebelum Senin pertama bulan itu (kalau ada)
   ikut masuk Minggu Ke 1, lalu tiap kali ketemu Senin baru mulai Minggu Ke
   berikutnya — BUKAN pembagian tanggal 1-7/8-14. */
function kelompokkanMinggu(tanggalList: string[]): Record<number, string[]> {
  const bucket: Record<number, string[]> = {};
  let minggu = 0;
  tanggalList.forEach((tgl) => {
    const dow = new Date(tgl + 'T00:00:00').getDay();
    if (minggu === 0 || dow === 1) minggu++;
    (bucket[minggu] = bucket[minggu] ?? []).push(tgl);
  });
  return bucket;
}

const SELECT_KELAS =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text';

function RiwayatKehadiranContent() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;

  const sekarang = new Date();
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | null>(null);
  const [gateTerbuka, setGateTerbuka] = useState(false);
  const [gateMemuat, setGateMemuat] = useState(true);

  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const [minggu, setMinggu] = useState<'semua' | 1 | 2 | 3 | 4>('semua');
  /* Kartu Bulan/Tahun/Minggu — dipicu ikon kalender di hero, posisinya
     dihitung dari ikon itu (sama teknik dgn TanggalPicker.tsx). */
  const [kalenderTerbuka, setKalenderTerbuka] = useState(false);
  const [posisiKalender, setPosisiKalender] = useState<{ top: number; right: number } | null>(null);
  const ikonKalenderRef = useRef<HTMLButtonElement>(null);

  const [menuTerbuka, setMenuTerbuka] = useState(false);
  const [kehadiranChooserTerbuka, setKehadiranChooserTerbuka] = useState(false);
  const [jurnalChooserTerbuka, setJurnalChooserTerbuka] = useState(false);

  const [baris, setBaris] = useState<{ santri: Santri; statusByDate: Record<string, Status> }[]>(
    [],
  );
  const [hariAktif, setHariAktif] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dibatalkan = false;
    async function muatKelas() {
      if (guruId == null) {
        setGateMemuat(false);
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase
        .from('kelas')
        .select('id, nama, ruangan, jam_mulai, jam_selesai, kategori_kbm(nama)')
        .eq('guru_id', guruId)
        .is('deleted_at', null)
        .order('nama');
      if (dibatalkan) return;
      setGateMemuat(false);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      const daftar = (data ?? []) as unknown as Kelas[];
      setKelasList(daftar);
      if (daftar.length === 1) setKelasId(daftar[0].id);
      else if (daftar.length > 1) setGateTerbuka(true);
      else setLoading(false);
    }
    muatKelas();
    return () => {
      dibatalkan = true;
    };
  }, [guruId]);

  const muatMatrix = useCallback(async () => {
    if (kelasId == null) return;
    setLoading(true);
    setError(null);
    try {
      const { data: dataSantri, error: errSantri } = await supabase
        .from('santri')
        .select('id, nama, nama_panggilan')
        .eq('kelas_id', kelasId)
        .is('deleted_at', null);
      if (errSantri) throw new Error(errSantri.message);

      const santriList = (dataSantri ?? []).slice().sort((a, b) => {
        const na = (a.nama_panggilan || a.nama).trim();
        const nb = (b.nama_panggilan || b.nama).trim();
        return na.localeCompare(nb, 'id');
      });
      const santriIds = santriList.map((s) => s.id);

      const dua = (n: number) => String(n).padStart(2, '0');
      const awal = `${tahun}-${dua(bulan)}-01`;
      const akhirTanggal = new Date(tahun, bulan, 0).getDate();
      const akhir = `${tahun}-${dua(bulan)}-${dua(akhirTanggal)}`;

      const statusMap: Record<number, Record<string, Status>> = {};
      const tanggalDiisi = new Set<string>();

      if (santriIds.length > 0) {
        const UKURAN_HALAMAN = 1000;
        for (let dari = 0; ; dari += UKURAN_HALAMAN) {
          const { data, error: errAbsensi } = await supabase
            .from('absensi')
            .select('id, santri_id, tanggal, status')
            .in('santri_id', santriIds)
            .gte('tanggal', awal)
            .lte('tanggal', akhir)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(dari, dari + UKURAN_HALAMAN - 1);
          if (errAbsensi) throw new Error(errAbsensi.message);

          const batch = data ?? [];
          batch.forEach((b) => {
            if (!statusMap[b.santri_id]) statusMap[b.santri_id] = {};
            statusMap[b.santri_id][b.tanggal] = b.status as Status;
            tanggalDiisi.add(b.tanggal);
          });
          if (batch.length < UKURAN_HALAMAN) break;
        }
      }

      setBaris(santriList.map((s) => ({ santri: s, statusByDate: statusMap[s.id] ?? {} })));
      setHariAktif(tanggalDiisi.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat riwayat');
    } finally {
      setLoading(false);
    }
  }, [kelasId, bulan, tahun]);

  useEffect(() => {
    muatMatrix();
  }, [muatMatrix]);

  const semuaTanggal = tanggalKerjaBulan(tahun, bulan);
  const tanggalList =
    minggu === 'semua' ? semuaTanggal : (kelompokkanMinggu(semuaTanggal)[minggu] ?? []);
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear()];

  const gateDaftar: KelasGateItem[] = kelasList.map((k) => ({
    id: k.id,
    nama: k.nama,
    badge: namaDariKategori(k.kategori_kbm) === 'Cabe Rawit' ? 'Cabe Rawit' : null,
    info: [
      k.ruangan,
      jam(k.jam_mulai) && jam(k.jam_selesai) ? `${jam(k.jam_mulai)}–${jam(k.jam_selesai)}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    // TIDAK ada `jumlah` — popup Pilih Kelas Riwayat sengaja tanpa badge
    // jumlah santri, beda dari popup Pilih Kelas Input Absen.
  }));

  if (guruId == null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6">
        <p className="text-[13.5px] text-text-dim">
          Fitur ini khusus untuk akun guru yang tertaut ke data guru.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <MenuGuru
        terbuka={menuTerbuka}
        onTutup={() => setMenuTerbuka(false)}
        onKehadiran={() => setKehadiranChooserTerbuka(true)}
        onJurnal={() => setJurnalChooserTerbuka(true)}
      />
      <KehadiranChooser
        terbuka={kehadiranChooserTerbuka}
        onTutup={() => setKehadiranChooserTerbuka(false)}
      />
      <JurnalChooser
        terbuka={jurnalChooserTerbuka}
        onTutup={() => setJurnalChooserTerbuka(false)}
      />

      <KelasGate
        terbuka={gateTerbuka}
        memuat={gateMemuat}
        ikon={
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
            <path d="M3 3v5h5" />
            <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
            <path d="M12 7v5l4 2" />
          </svg>
        }
        judul="Pilih Kelas"
        subjudul="Allhamdulillah, Jenengan mengajar lebih dari satu kelas. Pilih salah satu untuk melihat riwayat kehadiran."
        daftar={gateDaftar}
        onPilih={(item) => {
          setKelasId(item.id);
          setGateTerbuka(false);
        }}
        onBatal={() => setGateTerbuka(false)}
      />

      {/* Kartu Bulan/Tahun/Minggu — dipicu ikon kalender di hero, dirender
          DI SINI (di luar .ia-header overflow-hidden) supaya tidak
          terpotong seperti TanggalPicker sebelum diperbaiki. Terapkan
          instan tiap kali sebuah pilihan diketuk — tidak ada tombol
          "Terapkan" terpisah, jadi hasilnya langsung terlihat. */}
      {kalenderTerbuka && posisiKalender && (
        <>
          <div className="fixed inset-0 z-[1090]" onClick={() => setKalenderTerbuka(false)} />
          <div
            className="fixed z-[1100] w-[260px] rounded-[var(--radius-lg)] border border-border bg-panel p-4 shadow-[0_4px_6px_rgba(15,23,42,0.05),0_20px_40px_-12px_rgba(15,23,42,0.25)]"
            style={{ top: posisiKalender.top, right: posisiKalender.right }}
          >
            <div className="mb-3 flex gap-2">
              <select
                value={bulan}
                onChange={(e) => setBulan(Number(e.target.value))}
                className={SELECT_KELAS}
              >
                {NAMA_BULAN.map((nm, idx) => (
                  <option key={nm} value={idx + 1}>
                    {nm}
                  </option>
                ))}
              </select>
              <select
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
                className={SELECT_KELAS}
              >
                {tahunPilihan.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-1.5 text-[11px] font-bold text-text-dim uppercase">Minggu</div>
            <div className="flex flex-wrap gap-1.5">
              {(['semua', 1, 2, 3, 4] as const).map((m) => {
                const aktif = minggu === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMinggu(m)}
                    className="cursor-pointer rounded-[var(--radius-button)] border px-2.5 py-1 text-[11.5px] font-bold transition-all duration-150"
                    style={
                      aktif
                        ? { background: 'var(--brass)', borderColor: 'var(--brass)', color: '#fff' }
                        : {
                            background: 'var(--panel-2)',
                            borderColor: 'var(--border)',
                            color: 'var(--text-dim)',
                          }
                    }
                  >
                    {m === 'semua' ? 'Semua' : `Ke-${m}`}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* .ia-header — Style_Main.html:4859-4865, sama dgn GuruAbsensiView
          tapi TANPA baris kelas aktif di hero (riwayat tidak terikat 1
          kelas+jam tertentu spt Input Absen). */}
      <div className="shrink-0 overflow-hidden rounded-b-3xl bg-panel shadow-[0_6px_20px_rgba(5,150,105,0.22)]">
        <div className="flex items-center gap-2.5 bg-panel px-[18px] pt-3.5 pb-3">
          <button
            type="button"
            aria-label="Menu Utama"
            onClick={() => setMenuTerbuka((v) => !v)}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
          >
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
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <div className="flex min-w-0 flex-1 items-center justify-start gap-[7px]">
            <Image
              src="/logo-ruang-ngaji.png"
              alt="Ruang Ngaji"
              width={20}
              height={18}
              className="block shrink-0"
            />
            <span className="text-[15px] font-extrabold tracking-[0.01em] whitespace-nowrap text-brand-green">
              Ruang Ngaji
            </span>
          </div>
          <button
            type="button"
            aria-label="Permintaan Masuk"
            className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>
        </div>

        <div
          className="flex items-start justify-between gap-3 px-[18px] pt-4 pb-4 text-white"
          style={{ background: 'linear-gradient(135deg, var(--sage) 0%, var(--brand-green) 100%)' }}
        >
          <div className="min-w-0 text-[15px] font-bold">{profile?.display_name ?? 'Guru'}</div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              ref={ikonKalenderRef}
              type="button"
              aria-label="Pilih Bulan, Tahun, Minggu"
              onClick={() => {
                const rect = ikonKalenderRef.current?.getBoundingClientRect();
                if (rect) {
                  setPosisiKalender({
                    top: rect.bottom + 6,
                    right: window.innerWidth - rect.right,
                  });
                }
                setKalenderTerbuka((v) => !v);
              }}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-white/20 text-white active:scale-90"
            >
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </button>
            {/* Caption ringkas: apa yang sedang tampil di matrix, BUKAN
                tanggal hari ini — diminta owner supaya lebih ringkas
                (satu tempat, bukan tersebar di toolbar terpisah). */}
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">
              {NAMA_BULAN[bulan - 1]} {tahun}
              {minggu !== 'semua' ? ` · Mgg ${minggu}` : ''}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-[18px] pt-4 pb-10">
        {/* Kelas+Bulan+Tahun yang tadinya digabung jadi satu tombol pil di
           sini SUDAH DIPINDAH ke ikon kalender di hero (diminta owner:
           dianggap ramai digabung dgn "Hari Aktif" di baris yang sama). */}
        <div className="mb-3">
          <span className="text-[13.5px] font-bold text-teal">Hari Aktif - {hariAktif} Hari</span>
        </div>

        {error && (
          <p className="mb-4 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
            {error}
          </p>
        )}

        {loading ? (
          <p className="py-8 text-center text-[13px] text-text-faint">Memuat...</p>
        ) : kelasList.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-faint">
            Anda belum mengampu kelas apa pun.
          </p>
        ) : kelasId === null ? null : baris.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-faint">
            Belum ada santri di kelas ini.
          </p>
        ) : (
          /* .kg-matrix-scroll + .kg-matrix-table.ia-riwayat-table
             (Style_Main.html:3635-3745, 6695+) — kolom nama sticky kiri,
             sel status = badge bulat warna, garis tipis antar kolom. */
          <div className="max-h-[70vh] overflow-auto rounded-[var(--radius)] border border-border">
            <table className="border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-[4] min-w-[84px] whitespace-nowrap border-r border-b border-[rgba(148,163,184,0.35)] border-border bg-panel-2 px-2.5 py-2 text-center text-[11px] font-bold text-text-faint">
                    Nama Santri
                  </th>
                  {tanggalList.map((tgl) => {
                    const d = new Date(tgl + 'T00:00:00');
                    return (
                      <th
                        key={tgl}
                        className="sticky top-0 z-[3] min-w-[44px] whitespace-nowrap border-r border-b border-[rgba(148,163,184,0.35)] border-border bg-panel-2 px-2.5 py-2 text-center text-[11px] font-bold text-text-faint"
                      >
                        {d.getDate()}
                        <span className="mt-0.5 block text-[9px] font-semibold text-text-faint">
                          {HARI_PENDEK[d.getDay()]}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {baris.map((r, idx) => (
                  <tr key={r.santri.id} className={idx % 2 === 1 ? 'bg-panel-2/40' : undefined}>
                    <td className="sticky left-0 z-[1] min-w-[84px] whitespace-nowrap border-r border-[rgba(148,163,184,0.35)] bg-panel px-2.5 py-2 text-left text-[13px] font-semibold text-text">
                      {(r.santri.nama_panggilan || r.santri.nama).trim()}
                    </td>
                    {tanggalList.map((tgl) => {
                      const status = r.statusByDate[tgl];
                      return (
                        <td
                          key={tgl}
                          className="whitespace-nowrap border-r border-[rgba(148,163,184,0.35)] px-2.5 py-2 text-center"
                        >
                          {status ? (
                            <span
                              title={BADGE[status].label}
                              className="inline-flex h-[22px] w-6 items-center justify-center rounded-[6px] text-[11px] font-extrabold text-white"
                              style={{ background: BADGE[status].warna }}
                            >
                              {BADGE[status].huruf}
                            </span>
                          ) : (
                            <span className="text-text-faint">—</span>
                          )}
                        </td>
                      );
                    })}
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

export default function RiwayatKehadiranPage() {
  return (
    <RequireAuth>
      <RiwayatKehadiranContent />
    </RequireAuth>
  );
}
