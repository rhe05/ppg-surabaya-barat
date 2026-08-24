'use client';

/* Lonceng "Permintaan Masuk" utk GURU (top bar JurnalHeaderChrome.tsx +
   GuruDashboard.tsx) -- menampilkan status 5 aksi Data Generus yang sudah
   diajukan (migrasi 20260821180000: tambah/pindah kelas/naik kelas/
   pindah domisili/non aktif, SEMUA wajib lewat persetujuan Admin Kelp),
   DITAMBAH (2026-08-24) bagian "Perlu Tindakan" -- absen yang belum
   diisi, algoritma sama dgn PengingatAbsenBanner.tsx (lib/pengingatAbsen.ts).

   Digabung ke lonceng yang SAMA (bukan bikin ikon lonceng kedua) --
   pola SaaS standar (Gmail/Slack/GitHub: satu lonceng utk segala jenis
   notifikasi, dibedakan lewat bagian/label di dalam dropdown, bukan
   ikon terpisah-pisah). Alasan utamanya: lonceng ini tampil di HAMPIR
   semua halaman guru sedangkan PengingatAbsenBanner cuma di Dashboard --
   guru yang langsung ke Kurikulum/Jurnal tanpa lewat Dashboard tidak
   akan pernah lihat pengingatnya kalau cuma lewat banner.

   Badge angka = JUMLAH digabung dari dua sumber yang beda sifat (pola
   umum juga di Gmail -- semua kategori dijumlah jadi satu angka, lalu
   dipisah section di dalam dropdown):
   - Perlu Tindakan (absen belum diisi) -- "tugas belum selesai", SELALU
     dihitung selama masih ada yang kosong.
   - Permintaan Data Generus yang SUDAH DIPUTUSKAN (approved/rejected)
     TAPI belum ditandai dibaca guru -- "kotak masuk belum dibaca", BUKAN
     jumlah pending (owner minta bagian ini utk "info sudah terkonfirmasi").
   Dropdown Permintaan tetap menampilkan SEMUA (termasuk yang masih
   pending) supaya guru bisa memantau progres.

   Ditandai dibaca OTOMATIS begitu dropdown dibuka (bukan per-item,
   khusus bagian Permintaan) -- cukup utk kebutuhan saat ini, konsisten
   dgn pola "buka = sudah lihat" yang umum di notifikasi semacam ini.
   Perlu Tindakan TIDAK py status "dibaca" -- hilang sendiri begitu
   absennya benar2 terisi (persis PengingatAbsenBanner, tanpa tombol
   tutup), bukan begitu dropdown dibuka.

   Dropdown digambar lewat createPortal ke document.body dgn
   position:fixed (dihitung dari getBoundingClientRect() tombol lonceng),
   BUKAN absolute relatif ke tombolnya (2026-08-24, dilaporkan owner
   "kepotong masuk ke header") -- lonceng ini dirender DI DALAM header
   yang py overflow-hidden (rounded-b-3xl, lihat GuruDashboard.tsx/
   JurnalHeaderChrome.tsx), dan begitu isi dropdown lebih tinggi dari
   sisa ruang header (skrg py bagian "Perlu Tindakan" tambahan), absolute
   ke-clip tak kelihatan. Pola & alasannya SAMA PERSIS KebabMenu.tsx --
   position:fixed lolos dari overflow-hidden leluhur manapun (containing
   block-nya viewport, bukan box header tsb). */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Bell, CalendarClock, Megaphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { hitungAbsenBelumDiisi, type AbsenHilang } from '@/lib/pengingatAbsen';
import { mainkanBunyiNotifikasi } from '@/lib/bunyiNotifikasi';

/* Bagian "Pengumuman" (2026-08-24, diminta owner) -- awalnya khusus utk
   pengumuman "Libur KBM" yang dibuat OTOMATIS begitu admin_kelompok
   menandai libur (AdminKelpDashboard.tsx, "Tandai Libur"), tapi
   ditampilkan utk SEMUA pengumuman kelompok (baik dibuat manual lewat
   /pengumuman maupun otomatis) -- guru cuma py satu lonceng, tidak
   masuk akal kalau lonceng itu cuma "tahu" sebagian pengumuman.
   Belum-dibaca dilacak client-side (localStorage id pengumuman terbesar
   yang sudah pernah dilihat) BUKAN kolom DB baru -- pengumuman adalah
   broadcast ke SATU kelompok (bukan baris per-guru spt permintaan_generus
   yang punya guru_dibaca), jadi "siapa yang sudah baca yang mana" wajar
   dilacak per-perangkat, bukan disimpan server. */
const KUNCI_PENGUMUMAN_DIBACA = 'ruangngaji_pengumuman_dibaca_id';

type Pengumuman = { id: number; judul: string; isi: string; tanggal: string };

/* Lonceng ini REMOUNT tiap pindah halaman (Dashboard/Kurikulum/Jurnal
   dst masing2 punya RequireAuth+tree sendiri) -- tanpa penanda lintas-
   navigasi, bunyi akan berdenting ULANG tiap kali guru pindah layar
   selama backlog yang SAMA belum selesai, terasa mengganggu. sessionStorage
   (bukan localStorage) menyimpan angka TERBESAR yang sudah pernah
   dibunyikan dalam sesi tab ini -- bunyi cuma main lagi kalau totalnya
   naik MELEBIHI itu (ada yang benar2 baru), bukan tiap render/navigasi. */
const KUNCI_SESI_BUNYI = 'ruangngaji_bunyi_pengingat_terakhir';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function labelTanggalPendek(tglStr: string) {
  const d = new Date(tglStr + 'T00:00:00');
  return `${d.getDate()} ${NAMA_BULAN[d.getMonth()]}`;
}

type Permintaan = {
  id: number;
  jenis: string;
  ringkasan: string;
  status: 'pending' | 'approved' | 'rejected';
  catatan_admin: string | null;
  diajukan_pada: string;
  diputuskan_pada: string | null;
  guru_dibaca: boolean;
};

const LABEL_STATUS: Record<string, { label: string; kelas: string }> = {
  pending: { label: 'Menunggu', kelas: 'text-brass bg-[rgba(217,119,6,0.12)]' },
  approved: { label: 'Disetujui', kelas: 'text-sage bg-[rgba(5,150,105,0.12)]' },
  rejected: { label: 'Ditolak', kelas: 'text-red bg-[rgba(220,38,38,0.12)]' },
};

function formatTanggal(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BellPermintaanGuru() {
  const { profile } = useAuth();
  const router = useRouter();
  const guruId = profile?.guru_id ?? null;
  const [daftar, setDaftar] = useState<Permintaan[]>([]);
  const [absenHilang, setAbsenHilang] = useState<AbsenHilang[]>([]);
  const [pengumuman, setPengumuman] = useState<Pengumuman[]>([]);
  const [idPengumumanDibaca, setIdPengumumanDibaca] = useState(0);
  const [terbuka, setTerbuka] = useState(false);
  const [posisi, setPosisi] = useState<{ top: number; right: number } | null>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);

  const muat = useCallback(async () => {
    if (!guruId) return;
    const { data } = await supabase
      .from('permintaan_generus')
      .select('id, jenis, ringkasan, status, catatan_admin, diajukan_pada, diputuskan_pada, guru_dibaca')
      .eq('guru_id', guruId)
      .order('diajukan_pada', { ascending: false })
      .limit(20);
    setDaftar((data ?? []) as Permintaan[]);
  }, [guruId]);

  /* Lonceng ini dirender di halaman APA PUN (Dashboard, Kurikulum,
     Jurnal, dst) yang belum tentu sudah py daftar kelas guru siap pakai
     spt GuruDashboard -- jadi ambil sendiri di sini, bukan lewat prop.
     Query kecil (kelas milik 1 guru), duplikasi dgn fetch GuruDashboard
     KHUSUS di halaman Dashboard bisa terjadi tapi murah & tidak berarti
     dibanding kerumitan mengalirkan prop lintas banyak halaman. */
  const muatAbsenHilang = useCallback(async () => {
    if (!guruId) return;
    const { data } = await supabase
      .from('kelas')
      .select('id, nama, santri_count')
      .eq('guru_id', guruId)
      .is('deleted_at', null);
    const kelasAktif = (data ?? []).filter((k) => k.santri_count > 0);
    try {
      const hasil = await hitungAbsenBelumDiisi(
        kelasAktif.map((k) => ({ id: k.id, nama: k.nama })),
        profile?.scope_kelompok_id,
      );
      setAbsenHilang(hasil);
    } catch {
      // Non-kritis -- gagal diam-diam, jangan mengganggu lonceng.
    }
  }, [guruId, profile?.scope_kelompok_id]);

  const muatPengumuman = useCallback(async () => {
    if (!profile?.scope_kelompok_id) return;
    const { data } = await supabase
      .from('pengumuman')
      .select('id, judul, isi, tanggal')
      .eq('kelompok_id', profile.scope_kelompok_id)
      .order('id', { ascending: false })
      .limit(10);
    setPengumuman((data ?? []) as Pengumuman[]);
  }, [profile?.scope_kelompok_id]);

  useEffect(() => {
    muat();
    muatAbsenHilang();
    muatPengumuman();
    setIdPengumumanDibaca(Number(localStorage.getItem(KUNCI_PENGUMUMAN_DIBACA) ?? '0'));
  }, [muat, muatAbsenHilang, muatPengumuman]);

  const belumDibacaPermintaan = daftar.filter((r) => r.status !== 'pending' && !r.guru_dibaca).length;
  const belumDibacaPengumuman = pengumuman.filter((p) => p.id > idPengumumanDibaca).length;
  const belumDibaca = absenHilang.length + belumDibacaPermintaan + belumDibacaPengumuman;

  useEffect(() => {
    if (belumDibaca === 0) return;
    const terakhir = Number(sessionStorage.getItem(KUNCI_SESI_BUNYI) ?? '0');
    if (belumDibaca > terakhir) {
      mainkanBunyiNotifikasi();
      sessionStorage.setItem(KUNCI_SESI_BUNYI, String(belumDibaca));
    }
  }, [belumDibaca]);

  const perKelasAbsen = new Map<number, { nama: string; tanggal: string[] }>();
  for (const h of absenHilang) {
    const ada = perKelasAbsen.get(h.kelasId);
    if (ada) ada.tanggal.push(h.tanggal);
    else perKelasAbsen.set(h.kelasId, { nama: h.kelasNama, tanggal: [h.tanggal] });
  }
  const absenPalingAwal = absenHilang[0];

  async function toggle() {
    const buka = !terbuka;
    if (buka) {
      const r = tombolRef.current?.getBoundingClientRect();
      if (r) setPosisi({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setTerbuka(buka);
    if (!buka) return;

    if (pengumuman.length > 0) {
      const idTerbesar = Math.max(...pengumuman.map((p) => p.id));
      if (idTerbesar > idPengumumanDibaca) {
        localStorage.setItem(KUNCI_PENGUMUMAN_DIBACA, String(idTerbesar));
        setIdPengumumanDibaca(idTerbesar);
      }
    }

    const idBelumDibaca = daftar.filter((r) => r.status !== 'pending' && !r.guru_dibaca).map((r) => r.id);
    if (idBelumDibaca.length === 0) return;
    await supabase.from('permintaan_generus').update({ guru_dibaca: true }).in('id', idBelumDibaca);
    setDaftar((s) => s.map((r) => (idBelumDibaca.includes(r.id) ? { ...r, guru_dibaca: true } : r)));
  }

  if (!guruId) return null;

  return (
    <div className="relative">
      <button
        ref={tombolRef}
        type="button"
        aria-label="Permintaan Masuk"
        onClick={toggle}
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-sage transition-all duration-150 active:scale-[0.92]"
      >
        <Bell size={20} strokeWidth={2} />
        {belumDibaca > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red px-[3px] text-[9px] font-bold text-white">
            {belumDibaca > 9 ? '9+' : belumDibaca}
          </span>
        )}
      </button>

      {terbuka &&
        posisi &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[590]" onClick={() => setTerbuka(false)} />
            <div
              style={{ top: posisi.top, right: posisi.right }}
              className="fixed z-[591] max-h-[70vh] w-[300px] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-panel p-2 shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
            >
            {absenHilang.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-[12px] font-bold tracking-[0.02em] text-brass uppercase">
                  Perlu Tindakan
                </div>
                <div className="mb-1 rounded-[10px] bg-[#FFFBEB] px-2.5 py-2.5">
                  <div className="mb-1.5 flex items-start gap-2">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7] text-[#B45309]">
                      <CalendarClock size={13} />
                    </span>
                    <div className="min-w-0 flex-1 text-[12px] leading-snug text-[#92400E]">
                      <div className="font-bold">Ada absen yang belum diisi</div>
                      <div className="mt-0.5 flex flex-col gap-0.5 text-[#92400E]/85">
                        {[...perKelasAbsen.values()].map((k, idx) => (
                          <div key={idx}>
                            <span className="font-semibold">{k.nama}</span>
                            {': '}
                            {k.tanggal.map(labelTanggalPendek).join(', ')}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTerbuka(false);
                      router.push(`/absensi?kelasId=${absenPalingAwal.kelasId}&tanggal=${absenPalingAwal.tanggal}`);
                    }}
                    className="ml-8 cursor-pointer rounded-[var(--radius-button)] border-none bg-[#B45309] px-3 py-1.5 text-[11.5px] font-bold text-white transition-transform duration-150 active:scale-[0.96]"
                  >
                    Isi Sekarang
                  </button>
                </div>
              </>
            )}

            {pengumuman.length > 0 && (
              <>
                <div className="px-2 py-1.5 text-[12px] font-bold tracking-[0.02em] text-text-faint uppercase">
                  Pengumuman
                </div>
                {pengumuman.slice(0, 5).map((p) => (
                  <div key={p.id} className="mb-1 rounded-[10px] px-2 py-2.5 hover:bg-bg">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[rgba(5,150,105,0.12)] text-sage">
                        <Megaphone size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12.5px] font-bold text-text">{p.judul}</span>
                          <span className="shrink-0 text-[10.5px] text-text-faint">
                            {labelTanggalPendek(p.tanggal)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-dim">{p.isi}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="px-2 py-1.5 text-[12px] font-bold tracking-[0.02em] text-text-faint uppercase">
              Permintaan Data Generus
            </div>
            {daftar.length === 0 && (
              <p className="px-2 py-3 text-[12.5px] text-text-dim">Belum ada permintaan.</p>
            )}
            {daftar.map((r) => {
              const st = LABEL_STATUS[r.status];
              return (
                <div key={r.id} className="rounded-[10px] px-2 py-2.5 hover:bg-bg">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${st.kelas}`}>
                      {st.label}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-text-faint">
                      {formatTanggal(r.diputuskan_pada ?? r.diajukan_pada)}
                    </span>
                  </div>
                  <p className="text-[12.5px] leading-snug text-text">{r.ringkasan}</p>
                  {r.catatan_admin && (
                    <p className="mt-0.5 text-[11.5px] leading-snug text-text-faint">
                      Catatan Admin: {r.catatan_admin}
                    </p>
                  )}
                </div>
              );
            })}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
