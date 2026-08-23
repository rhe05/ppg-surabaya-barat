'use client';

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import RingkasanKelas from '@/components/absensi/RingkasanKelas';
import GuruAbsensiView, { KelasDetail } from '@/components/absensi/GuruAbsensiView';
import StatusModal from '@/components/absensi/StatusModal';

const QUOTE_CADANGAN = 'Pejuang Tidak Mundur Karena diCaci Tidak Maju Karena diPuji';

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
  /* Penanda versi baris. Dikirim balik saat menyimpan supaya Postgres bisa
     menolak penyimpanan kalau baris ini sudah diubah sesi lain sejak layar
     dimuat — lihat simpan_absensi_kelas (migrasi 20260818200000). */
  updated_at: string;
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
  /* `user` tidak lagi dipakai: pencatat diisi auth.uid() di dalam
     simpan_absensi_kelas, bukan dikirim dari klien. */
  const { profile } = useAuth();

  const [tanggal, setTanggal] = useState(tanggalHariIni);
  const [kelompokId, setKelompokId] = useState<number | null>(null);
  const [opsiKelompok, setOpsiKelompok] = useState<Kelompok[]>([]);
  const [opsiKelas, setOpsiKelas] = useState<
    { id: number; nama: string; jam_mulai: string; ruangan: string }[]
  >([]);
  /* '' = semua kelas. */
  const [kelasId, setKelasId] = useState<string>('');

  const [santri, setSantri] = useState<Santri[]>([]);
  const [tersimpan, setTersimpan] = useState<Record<number, AbsensiRow>>({});
  const [pilihan, setPilihan] = useState<Record<number, Status>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);

  /* Khusus tampilan guru mobile (GuruAbsensiView): metadata kelas yang
     TIDAK dibutuhkan tampilan admin (ruangan, jam, kategori) — dimuat
     terpisah dari opsiKelas (dropdown admin) supaya query admin tidak ikut
     berubah. */
  const [kelasDetail, setKelasDetail] = useState<KelasDetail[]>([]);

  /* Popup status Simpan Kehadiran (khusus guru) — sukses (dgn kutipan acak)
     atau peringatan yang MENAHAN penyimpanan (tanggal masa depan, sesi
     belum mulai, sedang mengajukan izin). Kutipan diprefetch sekali saat
     layar dibuka, persis app lama (iaLoadQuoteHariIni_/iaPickRandomQuote_)
     — supaya popup sukses tampil instan tanpa round-trip tambahan tepat
     saat guru klik Simpan. */
  const [quotePool, setQuotePool] = useState<string[]>([]);
  const [statusModal, setStatusModal] = useState<{
    tone: 'success' | 'warning';
    judul: string;
    pesan?: string;
    kutipan?: string;
  } | null>(null);

  const berwenang =
    !!profile && !!profile.role && profile.is_active && ROLE_BERWENANG.includes(profile.role);
  const adalahGuru = profile?.role === 'guru';

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

  /* Daftar kelas untuk penyaring. App lama memang memasukkan absensi
     PER KELAS (guru hanya melihat kelasnya sendiri); halaman ini semula
     menampilkan seluruh santri satu kelompok sekaligus — 69 orang dalam
     satu layar untuk Petemon. Penyaring ini mendekatkannya ke alur lama
     tanpa memaksa: "Semua kelas" tetap tersedia, karena penempatan santri
     ke kelas belum tentu sudah selesai di setiap kelompok. */
  useEffect(() => {
    let cancelled = false;
    async function loadKelas() {
      if (!kelompokId) {
        setOpsiKelas([]);
        return;
      }
      /* jam_mulai/ruangan ditambahkan (2026-08-23) supaya bisa dioper ke
         RingkasanKelas sbg prop `kelasAwal` -- sebelumnya RingkasanKelas
         mengambil ulang persis query `kelas` yang SAMA ini sendiri
         (round-trip Supabase yang genuinely duplikat, kelas tidak
         bergantung tanggal/rentang spt santri/absensi). */
      const { data } = await supabase
        .from('kelas')
        .select('id, nama, jam_mulai, ruangan')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama');
      if (!cancelled) setOpsiKelas(data ?? []);
    }
    loadKelas();
    return () => {
      cancelled = true;
    };
  }, [kelompokId]);

  /* Kelas milik guru (statis) + kelas "pinjam" (akses_kelas_request berstatus
     approved UNTUK TANGGAL yang sedang dibuka — Modul_InputAbsen.gs:369-379).
     Karena itu bergantung pada `tanggal`: kelas pinjam bisa muncul/hilang
     kalau tanggalnya diganti, sedangkan kelas milik sendiri tidak pernah
     berubah. Dimuat paralel lalu digabung, kelas MILIK SENDIRI menang kalau
     kebetulan id-nya sama (mustahil dlm praktik, tapi jaga-jaga). */
  useEffect(() => {
    let cancelled = false;
    async function loadKelasDetail() {
      if (!adalahGuru || profile?.guru_id == null) {
        setKelasDetail([]);
        return;
      }
      const kolom = 'id, nama, ruangan, jam_mulai, jam_selesai, santri_count, kategori_kbm(nama)';
      const [hasilSendiri, hasilPinjam] = await Promise.all([
        supabase
          .from('kelas')
          .select(kolom)
          .eq('guru_id', profile.guru_id)
          .is('deleted_at', null)
          .order('jam_mulai'),
        supabase
          .from('akses_kelas_request')
          .select(`kelas:kelas_id(${kolom})`)
          .eq('requester_guru_id', profile.guru_id)
          .eq('tanggal', tanggal)
          .eq('status', 'approved'),
      ]);
      if (cancelled) return;

      const sendiri = (hasilSendiri.data ?? []) as unknown as KelasDetail[];
      const idSendiri = new Set(sendiri.map((k) => k.id));
      const pinjamMentah = (hasilPinjam.data ?? []) as unknown as { kelas: KelasDetail | null }[];
      const pinjam: KelasDetail[] = [];
      const idPinjamTerpakai = new Set<number>();
      pinjamMentah.forEach((r) => {
        const k = r.kelas;
        if (!k || idSendiri.has(k.id) || idPinjamTerpakai.has(k.id)) return;
        idPinjamTerpakai.add(k.id);
        pinjam.push({ ...k, pinjam: true });
      });

      const daftar = [...sendiri, ...pinjam];
      setKelasDetail(daftar);
      /* Satu kelas (milik sendiri ATAU pinjam) -> langsung masuk, tidak
         perlu popup pilih kelas. Lebih dari satu -> dibiarkan kosong,
         GuruAbsensiView yang membuka KelasGate. */
      if (daftar.length === 1) setKelasId(String(daftar[0].id));
    }
    loadKelasDetail();
    return () => {
      cancelled = true;
    };
  }, [adalahGuru, profile?.guru_id, tanggal]);

  useEffect(() => {
    let cancelled = false;
    async function loadQuote() {
      if (!adalahGuru) return;
      const { data } = await supabase.from('quote_harian').select('teks');
      if (cancelled) return;
      const teks = (data ?? []).map((r) => r.teks).filter(Boolean);
      setQuotePool(teks.length ? teks : [QUOTE_CADANGAN]);
    }
    loadQuote();
    return () => {
      cancelled = true;
    };
  }, [adalahGuru]);

  const load = useCallback(async () => {
    if (!kelompokId) return;
    setLoading(true);
    setError(null);
    try {
      let qSantri = supabase
        .from('santri')
        .select('id, nama, kelompok_id')
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('nama');
      if (kelasId) qSantri = qSantri.eq('kelas_id', Number(kelasId));

      const [santriRes, absensiRes] = await Promise.all([
        qSantri,
        supabase
          .from('absensi')
          .select('id, santri_id, status, updated_at')
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
  }, [kelompokId, tanggal, kelasId]);

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

  /* Return-nya HANYA dipakai jalur guru (handleSimpanGuru di bawah) untuk
     tahu kapan boleh menampilkan popup sukses + kutipan. Jalur admin
     (tombol "Simpan Absensi" di JSX bawah) tetap memanggil ini langsung dan
     mengabaikan return-nya — perilakunya sama sekali tidak berubah. */
  async function handleSimpan(): Promise<{ ok: boolean; jumlah: number }> {
    if (!kelompokId || santri.length === 0) return { ok: false, jumlah: 0 };
    setSaving(true);
    setSaveError(null);
    setSukses(null);
    try {
      /* Seluruh kelas disimpan lewat SATU panggilan RPC yang berjalan dalam
         satu transaksi. Sebelumnya penyimpanan dilakukan dua langkah
         (INSERT baris baru lalu UPSERT baris lama), yang punya dua cacat:
         kalau langkah kedua gagal, langkah pertama sudah terlanjur masuk
         separuh; dan UPSERT menimpa perubahan sesi lain tanpa peringatan.

         `updated_at` yang dikirim adalah nilai yang TERLIHAT saat memuat.
         Baris tanpa nilai itu berarti belum ada sama sekali. Postgres
         menolak seluruh penyimpanan kalau ada satu saja yang sudah
         bergeser. */
      const baris = santri.map((s) => ({
        santri_id: s.id,
        status: pilihan[s.id] ?? 'hadir',
        updated_at: tersimpan[s.id]?.updated_at ?? null,
      }));

      const { data, error: rpcError } = await supabase.rpc('simpan_absensi_kelas', {
        p: { kelompok_id: kelompokId, tanggal, baris },
      });

      if (rpcError) {
        /* 40001 = penanda tabrakan yang dipasang fungsi itu. Pilihan yang
           sedang diketik pengguna dipertahankan setelah menyegarkan supaya
           pekerjaannya tidak hilang. */
        if (rpcError.code === '40001' || /sesi lain/i.test(rpcError.message)) {
          const pilihanPengguna = { ...pilihan };
          await load();
          setPilihan((prev) => ({ ...prev, ...pilihanPengguna }));
          setSaveError(
            'Data tanggal ini baru saja diubah dari sesi lain. Tidak ada yang tersimpan — tampilan sudah disegarkan, periksa lalu simpan ulang.',
          );
          return { ok: false, jumlah: 0 };
        }
        throw new Error(rpcError.message);
      }

      const hasil = (data ?? {}) as { baru?: number; diperbarui?: number };
      const jumlah = (hasil.baru ?? 0) + (hasil.diperbarui ?? 0);
      setSukses(
        `Tersimpan: ${hasil.baru ?? 0} baru, ${hasil.diperbarui ?? 0} diperbarui, tanggal ${tanggal}.`,
      );
      await load();
      return { ok: true, jumlah };
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Gagal menyimpan absensi');
      return { ok: false, jumlah: 0 };
    } finally {
      setSaving(false);
    }
  }

  /* Pembungkus khusus guru — menegakkan aturan yang SAMA dgn app lama
     (iaCekWaktuAbsen_ + iaValidateWaktuAbsen_, Script_Main.html:2980-3002 &
     Modul_InputAbsen.gs:296-315), lalu menampilkan popup sukses+kutipan
     ala iaShowStatusModal_ menggantikan banner hijau biasa.

     ⚠️ Pemeriksaan di bawah ini SATU LAPIS SAJA (klien) — app lama
     eksplisit menyebut pemeriksaan klien "cuma optimasi UX" dan server
     (Modul_InputAbsen.gs) sebagai "sumber kebenaran". Migrasi ini BELUM
     menambahkan penegakan yang sama di RPC simpan_absensi_kelas, jadi
     lapisan sumber-kebenaran itu belum ada di app baru — dicatat di sini
     supaya tidak dikira sudah setara. */
  async function handleSimpanGuru() {
    if (!kelasId || santri.length === 0) return;

    const kelasAktif = kelasDetail.find((k) => k.id === Number(kelasId));
    const hariIni = tanggalHariIni();

    /* Terkunci: kelas+tanggal ini SUDAH pernah tersimpan lengkap (semua
       santri sudah punya baris absensi). Diminta owner secara eksplisit
       (19 Agt sore) -- guru tidak boleh menimpa data yang sudah tersimpan
       lewat tombol Simpan di sini. SENGAJA HANYA di klien, bukan di RPC:
       database TETAP mengizinkan koreksi (dipakai Kelola Absensi & jalur
       admin) -- yang dikunci di sini murni tombolnya.
       Pesan mengarahkan ke Riwayat Kehadiran (BUKAN lagi "hubungi Admin
       Kelompok") sejak Riwayat Kehadiran punya fitur edit-per-sel sendiri
       (diminta owner 19 Agt malam) -- guru sekarang bisa koreksi sendiri
       tanpa lewat admin. */
    const sudahTersimpanSemua = santri.length > 0 && santri.every((s) => !!tersimpan[s.id]);
    if (sudahTersimpanSemua) {
      setStatusModal({
        tone: 'success',
        judul: 'Absen Sudah Tersimpan',
        pesan: `Absen kelas "${kelasAktif?.nama ?? ''}" untuk tanggal ini sudah tersimpan sebelumnya. Jika ingin perbaiki kehadiran silahkan masuk melalui Riwayat Kehadiran.`,
      });
      return;
    }

    if (tanggal > hariIni) {
      setStatusModal({
        tone: 'warning',
        judul: 'Belum Bisa Disimpan',
        pesan:
          'Tidak bisa menyimpan absen untuk tanggal yang akan datang. Pilih tanggal hari ini atau tanggal yang sudah berlalu.',
      });
      return;
    }

    if (tanggal === hariIni && kelasAktif?.jam_mulai) {
      const sekarang = new Date();
      const jamSekarang =
        String(sekarang.getHours()).padStart(2, '0') +
        ':' +
        String(sekarang.getMinutes()).padStart(2, '0');
      const jamMulai = kelasAktif.jam_mulai.slice(0, 5);
      if (jamSekarang < jamMulai) {
        setStatusModal({
          tone: 'warning',
          judul: 'Sesi Belum Dimulai',
          pesan: `Sesi ngaji kelas ini baru mulai jam ${jamMulai}. Absen belum bisa disimpan sebelum sesi berlangsung.`,
        });
        return;
      }
    }

    if (profile?.guru_id != null) {
      const { data: izinAktif } = await supabase
        .from('guru_izin')
        .select('id')
        .eq('guru_id', profile.guru_id)
        .lte('tanggal_mulai', tanggal)
        .gte('tanggal_selesai', tanggal)
        .limit(1);
      if (izinAktif && izinAktif.length > 0) {
        setStatusModal({
          tone: 'warning',
          judul: 'Sedang Mengajukan Izin',
          pesan:
            'Anda sedang mengajukan Izin/Cuti pada tanggal ini, tidak bisa input absen. Hubungi Admin Kelompok kalau ini keliru.',
        });
        return;
      }
    }

    const hasil = await handleSimpan();
    if (hasil.ok) {
      const kutipan =
        quotePool.length > 0
          ? quotePool[Math.floor(Math.random() * quotePool.length)]
          : QUOTE_CADANGAN;
      setStatusModal({
        tone: 'success',
        judul: 'Alhamdulillah, Absen Berhasil Disimpan',
        pesan: `Absensi kelas "${kelasAktif?.nama ?? ''}" (${hasil.jumlah} santri) berhasil disimpan.`,
        kutipan,
      });
      /* Tampilan tanggal SELALU balik ke hari ini setelah berhasil simpan
         (tanggal apa pun -- hari ini ATAU tanggal lampau yang disusulkan),
         biar guru tidak "nyangkut" di tanggal lampau tanpa sadar. */
      setTanggal(hariIni);
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

  if (adalahGuru) {
    const sudahTersimpanSemua = santri.length > 0 && santri.every((s) => !!tersimpan[s.id]);
    return (
      <>
        <GuruAbsensiView
          namaGuru={profile.display_name ?? 'Guru'}
          tanggal={tanggal}
          onTanggalChange={(v) => {
            setTanggal(v);
            setSukses(null);
            setSaveError(null);
          }}
          kelasDetail={kelasDetail}
          kelasId={kelasId ? Number(kelasId) : null}
          onPilihKelas={(id) => {
            setKelasId(String(id));
            setSukses(null);
            setSaveError(null);
          }}
          santri={santri}
          pilihan={pilihan}
          onUbahStatus={(santriId, status) =>
            setPilihan((prev) => ({ ...prev, [santriId]: status }))
          }
          loading={loading}
          saving={saving}
          sudahTersimpanSemua={sudahTersimpanSemua}
          /* Sukses (dgn kutipan) ditampilkan lewat StatusModal, bukan banner
             hijau — supaya tidak dobel dgn popup. Konflik versi (40001)
             TETAP lewat banner ini: itu bukan penolakan seperti 3 aturan di
             atas, guru harus melihat tampilan tersegarkan sebelum mencoba
             lagi, bukan sekadar menutup popup. */
          error={error || saveError}
          pesan={null}
          onSimpan={handleSimpanGuru}
        />
        <StatusModal
          terbuka={statusModal !== null}
          tone={statusModal?.tone ?? 'success'}
          judul={statusModal?.judul ?? ''}
          pesan={statusModal?.pesan}
          kutipan={statusModal?.kutipan}
          onTombol={() => setStatusModal(null)}
        />
      </>
    );
  }

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

          {opsiKelas.length > 0 && (
            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">Kelas</span>
              <select
                value={kelasId}
                onChange={(e) => {
                  setKelasId(e.target.value);
                  setSukses(null);
                  setSaveError(null);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Semua kelas</option>
                {opsiKelas.map((k) => (
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
                              onChange={() => setPilihan((prev) => ({ ...prev, [s.id]: opsi }))}
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
      {kelompokId && (
        <RingkasanKelas kelompokId={kelompokId} tanggal={tanggal} kelasAwal={opsiKelas} />
      )}
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
