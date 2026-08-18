'use client';

/* Halaman "Guru Saya" — bagian alur mobile guru dari Modul_InputAbsen.gs
   yang belum punya padanan: pengajuan Izin/Cuti dan permintaan akses kelas
   milik guru lain. Input absensinya sendiri sudah ada di /absensi.

   Fondasi DB dibuat di migrasi 20260818190000.

   ⚠️ PEMETAAN NILAI: app lama memakai jenis izin 'harian', sedangkan enum
   Postgres `guru_izin_jenis` bernilai 'izin' | 'cuti'. Jadi "Izin Harian"
   di layar tersimpan sebagai 'izin'. Jangan kirim 'harian' — Postgres akan
   menolaknya.

   Aturan yang dijaga basis data, bukan cuma layar ini:
   - Satu guru tidak bisa punya dua rentang izin yang beririsan (EXCLUDE
     constraint). App lama memeriksanya di kode, sehingga dua pengajuan
     berbarengan bisa lolos berdua.
   - Permintaan akses hanya bisa diputus PEMILIK kelas, bukan pemohon. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

const JENIS_IZIN = [
  { nilai: 'izin', label: 'Izin Harian' },
  { nilai: 'cuti', label: 'Cuti' },
];
const ALASAN = [
  { nilai: 'sakit', label: 'Sakit' },
  { nilai: 'lainnya', label: 'Lainnya' },
];

type Izin = {
  id: number;
  jenis: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  alasan_kategori: string | null;
  alasan_detail: string | null;
};

type Kelas = { id: number; nama: string; guru_id: number | null };
type Tersemat = { nama: string } | { nama: string }[] | null;
type Permintaan = {
  id: number;
  kelas_id: number;
  tanggal: string;
  requester_guru_id: number;
  owner_guru_id: number;
  status: string;
  keterangan: string | null;
  kelas: Tersemat;
};

function namaDari(nilai: Tersemat) {
  if (!nilai) return '-';
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? '-';
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

const hariIni = () => new Date().toISOString().slice(0, 10);

function GuruSayaContent() {
  const { profile } = useAuth();
  const guruId = profile?.guru_id ?? null;
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [izinList, setIzinList] = useState<Izin[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [masuk, setMasuk] = useState<Permintaan[]>([]);
  const [keluar, setKeluar] = useState<Permintaan[]>([]);

  const [jenis, setJenis] = useState('izin');
  const [mulai, setMulai] = useState(hariIni());
  const [selesai, setSelesai] = useState(hariIni());
  const [alasan, setAlasan] = useState('sakit');
  const [detail, setDetail] = useState('');

  const [kelasId, setKelasId] = useState('');
  const [tanggalMinta, setTanggalMinta] = useState(hariIni());
  const [keterangan, setKeterangan] = useState('');

  const [loading, setLoading] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  /* Jumlah izin bulan berjalan — padanan serverGetGuruIzinCountBulanIni
     (Modul_InputAbsen.gs:1515). Di app lama dipakai memunculkan konfirmasi
     mulai izin KEDUA ke atas. Di sini ditampilkan terus terang sebagai
     angka: memberi tahu lebih jujur daripada menghalangi dengan popup,
     dan gurunya tetap bisa mengajukan. */
  const jumlahBulanIni = useMemo(() => {
    const bulanIni = new Date().toISOString().slice(0, 7);
    return izinList.filter((i) => i.tanggal_mulai.startsWith(bulanIni)).length;
  }, [izinList]);

  /* Saran alasan dari pengajuan sebelumnya — padanan
     serverGetGuruIzinAlasanSuggestions (Modul_InputAbsen.gs:1489). Diambil
     dari riwayat guru ini sendiri, bukan seluruh kelompok: alasan izin
     bersifat pribadi dan tidak pantas disodorkan ke orang lain. */
  const saranAlasan = useMemo(
    () =>
      [
        ...new Set(
          izinList
            .filter((i) => i.alasan_kategori === 'lainnya' && (i.alasan_detail ?? '').trim() !== '')
            .map((i) => (i.alasan_detail ?? '').trim())
        ),
      ].slice(0, 5),
    [izinList]
  );

  const muat = useCallback(async () => {
    if (!guruId || !kelompokId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: dIzin }, { data: dKelas }, { data: dReq }] = await Promise.all([
        supabase
          .from('guru_izin')
          .select('id, jenis, tanggal_mulai, tanggal_selesai, alasan_kategori, alasan_detail')
          .eq('guru_id', guruId)
          .order('tanggal_mulai', { ascending: false }),
        supabase
          .from('kelas')
          .select('id, nama, guru_id')
          .eq('kelompok_id', kelompokId)
          .is('deleted_at', null)
          .order('nama'),
        supabase
          .from('akses_kelas_request')
          .select('id, kelas_id, tanggal, requester_guru_id, owner_guru_id, status, keterangan, kelas(nama)')
          .order('created_at', { ascending: false }),
      ]);
      setIzinList((dIzin ?? []) as unknown as Izin[]);
      setKelasList((dKelas ?? []) as unknown as Kelas[]);
      const semua = (dReq ?? []) as unknown as Permintaan[];
      /* RLS sudah membatasi ke permintaan yang menyangkut guru ini; di sini
         tinggal memisahkan mana yang masuk dan mana yang keluar. */
      setMasuk(semua.filter((r) => r.owner_guru_id === guruId));
      setKeluar(semua.filter((r) => r.requester_guru_id === guruId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [guruId, kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  async function ajukanIzin() {
    if (!guruId || !kelompokId) return;
    setError(null);
    setPesan(null);
    /* Syarat sama persis serverSubmitGuruIzin:1546-1560. */
    if (selesai < mulai) return setError('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if (alasan === 'lainnya' && !detail.trim()) return setError('Ketik alasan izin Anda.');

    setSibuk(true);
    try {
      const { error: err } = await supabase.from('guru_izin').insert({
        kelompok_id: kelompokId,
        guru_id: guruId,
        jenis,
        tanggal_mulai: mulai,
        tanggal_selesai: selesai,
        alasan_kategori: alasan,
        /* Alasan "sakit" tidak menyimpan detail, mengikuti app lama. */
        alasan_detail: alasan === 'sakit' ? null : detail.trim(),
      });
      if (err) {
        if (err.code === '23P01')
          throw new Error(
            'Anda sudah mengajukan izin yang mencakup tanggal tersebut. Tidak bisa mengajukan izin dobel.'
          );
        throw new Error(err.message);
      }
      setPesan(jenis === 'cuti' ? 'Cuti berhasil diajukan.' : 'Izin berhasil diajukan.');
      setDetail('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengajukan izin.');
    } finally {
      setSibuk(false);
    }
  }

  async function batalkanIzin(i: Izin) {
    if (!window.confirm(`Batalkan pengajuan ${i.tanggal_mulai} s/d ${i.tanggal_selesai}?`)) return;
    const { error: err } = await supabase.from('guru_izin').delete().eq('id', i.id);
    if (err) setError(err.message);
    else {
      setPesan('Pengajuan dibatalkan.');
      await muat();
    }
  }

  async function mintaAkses() {
    if (!guruId || !kelompokId || !kelasId) {
      setError('Kelas wajib dipilih.');
      return;
    }
    const kelas = kelasList.find((k) => k.id === Number(kelasId));
    if (!kelas?.guru_id) {
      setError('Kelas itu belum punya guru pengampu.');
      return;
    }
    if (kelas.guru_id === guruId) {
      setError('Itu kelas Anda sendiri.');
      return;
    }

    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('akses_kelas_request').insert({
        kelompok_id: kelompokId,
        kelas_id: Number(kelasId),
        tanggal: tanggalMinta,
        requester_user_id: profile?.id ?? null,
        requester_guru_id: guruId,
        owner_guru_id: kelas.guru_id,
        status: 'pending',
        keterangan: keterangan.trim() || null,
      });
      if (err) throw new Error(err.message);
      setPesan('Permintaan terkirim, menunggu persetujuan guru pemilik kelas.');
      setKeterangan('');
      setKelasId('');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengirim permintaan.');
    } finally {
      setSibuk(false);
    }
  }

  async function putuskan(r: Permintaan, keputusan: 'approved' | 'rejected') {
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase
        .from('akses_kelas_request')
        .update({ status: keputusan, diputuskan_pada: new Date().toISOString() })
        .eq('id', r.id);
      if (err) throw new Error(err.message);
      setPesan(keputusan === 'approved' ? 'Permintaan disetujui.' : 'Permintaan ditolak.');
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memutuskan.');
    }
  }

  if (!guruId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-2 text-[24px] font-bold text-text">Guru Saya</h1>
        <p className="text-[13px] text-text-dim">
          Halaman ini untuk akun yang tertaut ke data guru. Akun Anda belum punya tautan itu
          (<code>profiles.guru_id</code> masih kosong), jadi pengajuan izin dan permintaan akses
          kelas belum bisa dipakai.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Guru Saya</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Pengajuan izin/cuti dan permintaan akses kelas guru lain.
      </p>

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

      {/* ── Ajukan izin ── */}
      <div className="mb-6 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-1 text-[15px] font-bold text-text">Ajukan Izin / Cuti</div>
        <p className="mb-4 text-[11px] text-text-faint">
          Bulan ini Anda sudah mengajukan {jumlahBulanIni} kali.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Jenis</label>
            <select className={KELAS_INPUT} value={jenis} onChange={(e) => setJenis(e.target.value)}>
              {JENIS_IZIN.map((j) => (
                <option key={j.nilai} value={j.nilai}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Alasan</label>
            <select className={KELAS_INPUT} value={alasan} onChange={(e) => setAlasan(e.target.value)}>
              {ALASAN.map((a) => (
                <option key={a.nilai} value={a.nilai}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal Mulai</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={mulai}
              onChange={(e) => {
                setMulai(e.target.value);
                if (selesai < e.target.value) setSelesai(e.target.value);
              }}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal Selesai</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={selesai}
              onChange={(e) => setSelesai(e.target.value)}
            />
          </div>
          {alasan === 'lainnya' && (
            <div className="sm:col-span-2">
              <label className={KELAS_LABEL}>Keterangan Alasan *</label>
              <input
                className={KELAS_INPUT}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="Tulis alasan Anda"
                list="saran-alasan"
              />
              <datalist id="saran-alasan">
                {saranAlasan.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          )}
        </div>
        <button onClick={ajukanIzin} disabled={sibuk} className={KELAS_TOMBOL_UTAMA + ' mt-4'}>
          {sibuk ? 'Mengirim...' : 'Ajukan'}
        </button>
      </div>

      {/* ── Riwayat izin ── */}
      <div className="mb-8">
        <div className="mb-3 text-[15px] font-bold text-text">Riwayat Izin Saya ({izinList.length})</div>
        {izinList.length === 0 && (
          <p className="text-[13px] text-text-dim">Belum ada pengajuan izin.</p>
        )}
        {izinList.map((i) => (
          <div
            key={i.id}
            className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-panel px-4 py-3"
          >
            <div>
              <span className="text-[13px] font-semibold text-text">
                {i.jenis === 'cuti' ? 'Cuti' : 'Izin Harian'}
              </span>
              <span className="ml-2 text-[12px] text-text-dim">
                {i.tanggal_mulai}
                {i.tanggal_selesai !== i.tanggal_mulai ? ` s/d ${i.tanggal_selesai}` : ''}
                {i.alasan_kategori ? ` · ${i.alasan_kategori}` : ''}
                {i.alasan_detail ? ` — ${i.alasan_detail}` : ''}
              </span>
            </div>
            <button onClick={() => batalkanIzin(i)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
              Batalkan
            </button>
          </div>
        ))}
      </div>

      {/* ── Minta akses kelas ── */}
      <div className="mb-6 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 text-[15px] font-bold text-text">Minta Akses Kelas Guru Lain</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Kelas</label>
            <select className={KELAS_INPUT} value={kelasId} onChange={(e) => setKelasId(e.target.value)}>
              <option value="">-- Pilih Kelas --</option>
              {kelasList
                .filter((k) => k.guru_id !== guruId)
                .map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={tanggalMinta}
              onChange={(e) => setTanggalMinta(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={KELAS_LABEL}>Keterangan</label>
            <input
              className={KELAS_INPUT}
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Alasan meminta akses"
            />
          </div>
        </div>
        <button onClick={mintaAkses} disabled={sibuk || !kelasId} className={KELAS_TOMBOL_UTAMA + ' mt-4'}>
          Kirim Permintaan
        </button>
      </div>

      {/* ── Permintaan masuk ── */}
      <div className="mb-8">
        <div className="mb-3 text-[15px] font-bold text-text">
          Permintaan Masuk ({masuk.filter((r) => r.status === 'pending').length} menunggu)
        </div>
        {masuk.length === 0 && (
          <p className="text-[13px] text-text-dim">Tidak ada permintaan untuk kelas Anda.</p>
        )}
        {masuk.map((r) => (
          <div
            key={r.id}
            className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-panel px-4 py-3"
          >
            <div>
              <span className="text-[13px] font-semibold text-text">{namaDari(r.kelas)}</span>
              <span className="ml-2 text-[12px] text-text-dim">
                {r.tanggal} · {r.status}
                {r.keterangan ? ` — ${r.keterangan}` : ''}
              </span>
            </div>
            {r.status === 'pending' && (
              <div className="flex gap-2">
                <button onClick={() => putuskan(r, 'approved')} className={KELAS_TOMBOL_SEKUNDER + ' text-sage'}>
                  Setujui
                </button>
                <button onClick={() => putuskan(r, 'rejected')} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                  Tolak
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Permintaan saya ── */}
      <div>
        <div className="mb-3 text-[15px] font-bold text-text">Permintaan Saya ({keluar.length})</div>
        {keluar.length === 0 && (
          <p className="text-[13px] text-text-dim">Anda belum pernah meminta akses kelas.</p>
        )}
        {keluar.map((r) => (
          <div
            key={r.id}
            className="mb-2 rounded-card border border-border bg-panel px-4 py-3 text-[13px] text-text"
          >
            {namaDari(r.kelas)}
            <span className="ml-2 text-[12px] text-text-dim">
              {r.tanggal} · {r.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GuruSayaPage() {
  return (
    <RequireAuth>
      <GuruSayaContent />
    </RequireAuth>
  );
}
