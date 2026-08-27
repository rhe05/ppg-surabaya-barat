'use client';

/* Riwayat Kehadiran (guru mobile) — matrix santri × tanggal 1 bulan.
   Dibuka dari popup "Kehadiran" > Riwayat Kehadiran
   (components/dashboard/KehadiranChooser.tsx).

   PUTARAN KETIGA (diminta owner, membalik keputusan awal "read-only"):
   tiap sel bisa diklik utk mengoreksi — huruf badge (H/I/S/A) ATAU sel
   kosong "—" sama-sama membuka popup "Edit Kehadiran" (nama santri +
   tanggal + 4 tombol status + Simpan). Penulisannya LANGSUNG ke tabel
   `absensi` lewat Supabase client (BUKAN lewat RPC simpan_absensi_kelas —
   itu ditujukan utk kelas+HARI INI, sedangkan di sini satu sel = satu
   santri+tanggal APA PUN, sering di bulan lampau). Polanya SAMA persis
   dgn alat koreksi admin (app/kelola-absensi/page.tsx ubahStatus/hapus):
   - Baris SUDAH ada -> UPDATE dgn penjaga versi optimistik
     (.eq('updated_at', nilai_terakhir_dilihat)) — 0 baris cocok berarti
     diubah sesi lain, matrix dimuat ulang tanpa menimpa diam-diam.
   - Baris BELUM ada -> INSERT baru (santri_id, kelompok_id, tanggal,
     status, dicatat_oleh), meniru INSERT di simpan_absensi_kelas.
   RLS (absensi_insert_guru_admin/absensi_update_guru_admin) sudah
   mengizinkan guru menulis di kelompoknya sendiri — TIDAK perlu policy
   baru.

   Aturan "3 penahan" yang berlaku di Input Kehadiran (tanggal masa depan/
   sesi belum mulai/sedang izin, lihat handleSimpanGuru di app/absensi/
   page.tsx & RPC simpan_absensi_kelas) SENGAJA TIDAK diterapkan di sini —
   Riwayat memang tempatnya mengoreksi tanggal lampau, dan alat koreksi
   admin yang sudah ada (Kelola Absensi) pun tidak menerapkannya.

   19 Agt, dua putaran sebelumnya: pertama ditulis ulang mengikuti screenshot owner
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
import { LIBUR_NASIONAL_2026 } from '@/lib/liburNasional';
import { muatOverrideKelompok, type OverrideKelompok } from '@/lib/kalenderKelompok';

type Status = 'hadir' | 'izin' | 'sakit' | 'alpa';
// Sel absensi yang SUDAH ada di DB — dibawa demi penjaga versi optimistik
// (.eq('updated_at', ...)) saat diedit lewat popup Edit Kehadiran.
type SelAbsensi = { id: number; status: Status; updatedAt: string };

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

// Style_Main.html:695-700 (IA_GURU_KATEGORI_SINGKATAN_) — sama dgn
// GuruDashboard.tsx, dipakai supaya baris "Guru Generus - MS" di hero
// identik dgn Dashboard (diminta owner: samakan header dgn Dashboard).
const SINGKATAN_KATEGORI: Record<string, string> = {
  'Muballigh Tugasan': 'MT',
  'Muballigh Setempat': 'MS',
  'Guru Mutu': 'GM',
  'Guru Bantu': 'GB',
};

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
  const { profile, user, namaKelompok, kategoriGuru } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const singkatan = kategoriGuru ? (SINGKATAN_KATEGORI[kategoriGuru] ?? kategoriGuru) : null;
  const barisRole = singkatan ? `Guru Generus - ${singkatan}` : null;

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

  const [baris, setBaris] = useState<{ santri: Santri; selByDate: Record<string, SelAbsensi> }[]>(
    [],
  );

  /* Override kalender per kelompok (kalender_kelompok, 2026-08-24) --
     dulu kolom merah di sini CUMA libur nasional (LIBUR_NASIONAL_2026).
     Diminta owner: hari yang admin_kelompok tandai libur MENDADAK
     (mis. lewat "Tandai Libur" di Dashboard admin_kelp) juga harus
     kelihatan merah di sini, bukan cuma warna beda -- guru bisa langsung
     tahu KENAPA sel di bawahnya kosong tanpa perlu buka kalender lain.
     'aktif' (kelp tetap masuk di tanggal merah nasional) SENGAJA tidak
     mengubah warna kolom nasional itu -- persis prinsip lib/kalenderKelompok.ts
     ("kalender tanggal merah biarkan saja tetap merah"), cuma menambah
     kolom BARU yang merah kalau jenisnya 'libur'. */
  const [overrideKelompok, setOverrideKelompok] = useState<Map<string, OverrideKelompok>>(new Map());
  useEffect(() => {
    if (!profile?.scope_kelompok_id) return;
    let batal = false;
    muatOverrideKelompok(profile.scope_kelompok_id).then((peta) => {
      if (!batal) setOverrideKelompok(peta);
    });
    return () => {
      batal = true;
    };
  }, [profile?.scope_kelompok_id]);
  /* Tanggal (YYYY-MM-DD) yang punya absensi APAPUN statusnya. "Hari Aktif"
     diturunkan dari sini SETELAH mengecualikan tanggal yang admin_kelompok
     tandai libur (overrideKelompok) -- diminta owner 2026-08-27: hari yang
     diliburkan admin (kolomnya sudah merah di atas) tidak dihitung sbg
     hari aktif walau barisnya terlanjur diisi. */
  const [tanggalDiisi, setTanggalDiisi] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Popup Edit Kehadiran — dibuka dgn mengklik badge huruf ATAU sel kosong
     "—". `sel` null = belum ada baris absensi utk santri+tanggal ini
     (INSERT); non-null = sudah ada (UPDATE dgn penjaga versi). */
  const [editTarget, setEditTarget] = useState<{
    santriId: number;
    namaSantri: string;
    tanggal: string;
    sel: SelAbsensi | null;
  } | null>(null);
  const [menyimpanEdit, setMenyimpanEdit] = useState(false);
  const [errorEdit, setErrorEdit] = useState<string | null>(null);

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
      const dua = (n: number) => String(n).padStart(2, '0');
      const awal = `${tahun}-${dua(bulan)}-01`;
      const akhirTanggal = new Date(tahun, bulan, 0).getDate();
      const akhir = `${tahun}-${dua(bulan)}-${dua(akhirTanggal)}`;

      /* Santri yang pindah/nonaktif SETELAH bulan ini dimulai tetap ikut
         tampil -- deleted_at dipakai sbg "sejak kapan tidak aktif", bukan
         cuma penanda hapus (lihat migrasi 20260821130000). Bulan yang
         sudah lewat sebelum dia pindah harus tetap menunjukkan riwayatnya. */
      const { data: dataSantri, error: errSantri } = await supabase
        .from('santri')
        .select('id, nama, nama_panggilan')
        .eq('kelas_id', kelasId)
        .or(`deleted_at.is.null,deleted_at.gt.${awal}`);
      if (errSantri) throw new Error(errSantri.message);

      const santriList = (dataSantri ?? []).slice().sort((a, b) => {
        const na = (a.nama_panggilan || a.nama).trim();
        const nb = (b.nama_panggilan || b.nama).trim();
        return na.localeCompare(nb, 'id');
      });
      const santriIds = santriList.map((s) => s.id);

      const selMap: Record<number, Record<string, SelAbsensi>> = {};
      const tanggalTerisi = new Set<string>();

      if (santriIds.length > 0) {
        const UKURAN_HALAMAN = 1000;
        for (let dari = 0; ; dari += UKURAN_HALAMAN) {
          const { data, error: errAbsensi } = await supabase
            .from('absensi')
            .select('id, santri_id, tanggal, status, updated_at')
            .in('santri_id', santriIds)
            .gte('tanggal', awal)
            .lte('tanggal', akhir)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(dari, dari + UKURAN_HALAMAN - 1);
          if (errAbsensi) throw new Error(errAbsensi.message);

          const batch = data ?? [];
          batch.forEach((b) => {
            if (!selMap[b.santri_id]) selMap[b.santri_id] = {};
            selMap[b.santri_id][b.tanggal] = {
              id: b.id,
              status: b.status as Status,
              updatedAt: b.updated_at,
            };
            tanggalTerisi.add(b.tanggal);
          });
          if (batch.length < UKURAN_HALAMAN) break;
        }
      }

      setBaris(santriList.map((s) => ({ santri: s, selByDate: selMap[s.id] ?? {} })));
      setTanggalDiisi([...tanggalTerisi]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat riwayat');
    } finally {
      setLoading(false);
    }
  }, [kelasId, bulan, tahun]);

  useEffect(() => {
    muatMatrix();
  }, [muatMatrix]);

  /* Simpan hasil klik status di popup Edit Kehadiran. UPDATE kalau sel
     sudah ada baris (penjaga versi optimistik: 0 baris cocok = orang lain
     sudah mengubahnya duluan -> muat ulang matrix, JANGAN menimpa diam2).
     INSERT kalau belum ada baris sama sekali, meniru cabang INSERT di RPC
     simpan_absensi_kelas (santri_id, kelompok_id, tanggal, status,
     dicatat_oleh). kelompok_id diambil dari profile guru sendiri karena
     guru cuma tertaut ke 1 kelompok. */
  async function simpanEdit(statusBaru: Status) {
    if (!editTarget || user == null || profile?.scope_kelompok_id == null) return;
    setMenyimpanEdit(true);
    setErrorEdit(null);
    try {
      if (editTarget.sel) {
        const { data, error: errUpdate } = await supabase
          .from('absensi')
          .update({ status: statusBaru })
          .eq('id', editTarget.sel.id)
          .eq('updated_at', editTarget.sel.updatedAt)
          .select('id');
        if (errUpdate) throw new Error(errUpdate.message);
        if (!data || data.length === 0) {
          setErrorEdit('Data ini sudah diubah oleh sesi lain. Memuat ulang riwayat...');
          await muatMatrix();
          return;
        }
      } else {
        const { error: errInsert } = await supabase.from('absensi').insert({
          santri_id: editTarget.santriId,
          kelompok_id: profile.scope_kelompok_id,
          tanggal: editTarget.tanggal,
          status: statusBaru,
          dicatat_oleh: user.id,
        });
        if (errInsert) throw new Error(errInsert.message);
      }
      setEditTarget(null);
      await muatMatrix();
    } catch (e) {
      setErrorEdit(e instanceof Error ? e.message : 'Gagal menyimpan perubahan');
    } finally {
      setMenyimpanEdit(false);
    }
  }

  const hariAktif = tanggalDiisi.filter(
    (t) => overrideKelompok.get(t)?.jenis !== 'libur',
  ).length;

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

      {/* .ia-header — Style_Main.html:4859-4865. Disamakan PERSIS dgn
          GuruDashboard.tsx (diminta owner): topbar bell dibungkus div,
          hero pakai gradient sage->brand-green + greeting 3-baris
          (nama, peran, kelompok) + padding/ukuran ikon yang sama —
          cuma kalender pemicunya tetap punya Minggu (Riwayat) sedangkan
          Dashboard tidak. */}
      <div className="shrink-0 overflow-hidden rounded-b-3xl bg-panel shadow-[0_6px_20px_rgba(5,150,105,0.22)]">
        {/* .ia-topbar — :4867-4901 */}
        <div className="flex items-center gap-2.5 bg-panel px-[18px] pt-3.5 pb-3">
          {/* .ia-hamburger-btn — :4945-4958 */}
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

          {/* .ia-app-brand — :4875-4895 */}
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

          {/* .ia-icon-btn — :5046-5064 */}
          <div className="flex shrink-0 gap-2">
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
        </div>

        {/* .ia-header-hero — :4903-4910 */}
        <div className="flex items-start justify-between gap-2.5 bg-[linear-gradient(135deg,#059669_0%,#6B9975_100%)] px-[18px] pt-4 pb-5">
          {/* .ia-greeting — :5026-5044 */}
          <div className="min-w-0 flex-1">
            <div className="text-[20px] leading-[1.2] font-bold text-white">
              {profile?.display_name ?? '-'}
            </div>
            {barisRole && (
              <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
                {barisRole}
              </div>
            )}
            {namaKelompok && (
              <div className="mt-[3px] text-[12.5px] font-semibold tracking-[0.01em] text-white/[0.88]">
                {namaKelompok}
              </div>
            )}
          </div>

          {/* .ia-header-hero-right — :4912-4918 */}
          <div className="flex shrink-0 flex-col items-end gap-[7px]">
            {/* .ia-icon-btn-hero — :5066-5073 */}
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
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-white/20 text-white transition-all duration-150 active:bg-white/[0.32]"
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
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white">
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
                  <th className="sticky top-0 left-0 z-[4] min-w-[84px] whitespace-nowrap border-r border-b border-[rgba(148,163,184,0.35)] border-border bg-panel-2 px-2.5 py-2 text-center text-[11px] font-bold text-text">
                    Nama Santri
                  </th>
                  {tanggalList.map((tgl) => {
                    const d = new Date(tgl + 'T00:00:00');
                    /* Tanggal merah nasional (LIBUR_NASIONAL_2026) yang
                       jatuh di hari kerja tetap muncul sbg kolom (matrix
                       ini cuma menyaring Sabtu/Minggu, bukan hari libur) --
                       diminta owner: tandai kolomnya warna merah supaya
                       kelihatan kenapa sel di bawahnya kosong/tidak wajib
                       diisi, bukan cuma tebakan. */
                    const namaLibur = LIBUR_NASIONAL_2026[tgl];
                    /* Libur MENDADAK per kelompok (bukan nasional) --
                       ov.jenis === 'libur' di tanggal yang bukan tanggal
                       merah nasional. 'aktif' TIDAK diproses di sini
                       (bukan tujuannya kolom ini). */
                    const ov = overrideKelompok.get(tgl);
                    const liburKelompok = ov?.jenis === 'libur' ? (ov.catatan || 'Libur') : null;
                    const tandaiMerah = !!namaLibur || !!liburKelompok;
                    return (
                      <th
                        key={tgl}
                        title={namaLibur || liburKelompok || undefined}
                        className={`sticky top-0 z-[3] min-w-[44px] whitespace-nowrap border-r border-b border-[rgba(148,163,184,0.35)] border-border px-2.5 py-2 text-center text-[11px] font-bold ${
                          tandaiMerah ? 'bg-[#FEF2F2] text-red' : 'bg-panel-2 text-text'
                        }`}
                      >
                        {d.getDate()}
                        <span
                          className={`mt-0.5 block text-[9px] font-semibold ${tandaiMerah ? 'text-red' : 'text-text'}`}
                        >
                          {liburKelompok ? 'Libur' : HARI_PENDEK[d.getDay()]}
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
                      const sel = r.selByDate[tgl];
                      return (
                        <td
                          key={tgl}
                          className="whitespace-nowrap border-r border-[rgba(148,163,184,0.35)] px-2.5 py-2 text-center"
                        >
                          {/* Setiap sel (huruf badge ATAU "—" kosong) bisa
                              diklik utk membuka popup Edit Kehadiran —
                              diminta owner: "klik huruf H" utk mengoreksi. */}
                          <button
                            type="button"
                            onClick={() =>
                              setEditTarget({
                                santriId: r.santri.id,
                                namaSantri: (r.santri.nama_panggilan || r.santri.nama).trim(),
                                tanggal: tgl,
                                sel: sel ?? null,
                              })
                            }
                            title={sel ? BADGE[sel.status].label : 'Belum diisi — klik utk mengisi'}
                            className="inline-flex h-[22px] w-6 cursor-pointer items-center justify-center rounded-[6px] border-none text-[11px] font-extrabold transition-transform duration-100 active:scale-90"
                            style={
                              sel
                                ? { background: BADGE[sel.status].warna, color: '#fff' }
                                : { background: 'transparent', color: 'var(--text-faint)' }
                            }
                          >
                            {sel ? BADGE[sel.status].huruf : '—'}
                          </button>
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

      {/* Popup Edit Kehadiran — 4 tombol status warna sama dgn
          GuruAbsensiView (WARNA_TOGGLE_AKTIF) supaya konsisten di seluruh
          app, + tombol silang sama polanya dgn StatusModal.tsx. */}
      {editTarget && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-[rgba(15,23,42,0.55)] p-6 backdrop-blur-[3px]">
          <div className="relative w-full max-w-[320px] rounded-[24px] bg-panel px-6 pt-7 pb-6 shadow-[0_24px_48px_rgba(0,0,0,0.28)]">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              aria-label="Tutup"
              className="absolute top-3.5 right-3.5 flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim transition-transform duration-150 active:scale-90"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="mb-1 text-[15px] font-extrabold text-text">Edit Kehadiran</div>
            <div className="mb-5 text-[13px] text-text-dim">
              {editTarget.namaSantri} ·{' '}
              {new Date(editTarget.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {(Object.keys(BADGE) as Status[]).map((st) => {
                const aktif = editTarget.sel?.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={menyimpanEdit}
                    onClick={() => simpanEdit(st)}
                    className="cursor-pointer rounded-[var(--radius)] border-2 py-3 text-[13px] font-bold transition-all duration-150 active:scale-[0.96] disabled:cursor-wait disabled:opacity-60"
                    style={
                      aktif
                        ? {
                            background: BADGE[st].warna,
                            borderColor: BADGE[st].warna,
                            color: '#fff',
                          }
                        : {
                            background: 'var(--panel-2)',
                            borderColor: 'var(--border)',
                            color: 'var(--text)',
                          }
                    }
                  >
                    {BADGE[st].label}
                  </button>
                );
              })}
            </div>

            {errorEdit && <p className="mt-4 text-[12.5px] text-red">{errorEdit}</p>}
          </div>
        </div>
      )}
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
