'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import RingkasanKelas from '@/components/absensi/RingkasanKelas';
import GuruAbsensiView, { KelasDetail } from '@/components/absensi/GuruAbsensiView';
import StatusModal from '@/components/absensi/StatusModal';
import { muatOverrideKelompok, buatCekNonaktif, type OverrideKelompok } from '@/lib/kalenderKelompok';
import { muatKelasGuru, muatQuoteHarian } from '@/lib/dataGuru';

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
  /* Deep-link dari PengingatAbsenBanner.tsx (Dashboard guru) --
     /absensi?kelasId=5&tanggal=2026-08-19 langsung membuka kelas+tanggal
     yang belum diisi, tanpa guru harus menavigasi KelasGate+kalender
     manual dulu ("satu tap menuju penyelesaian", bukan cuma pemberitahuan
     pasif). Kalau query string kosong (navigasi biasa lewat menu),
     nilainya sama persis dgn sebelumnya. */
  const searchParams = useSearchParams();

  const [tanggal, setTanggal] = useState(() => searchParams.get('tanggal') || tanggalHariIni());
  const [kelompokId, setKelompokId] = useState<number | null>(null);
  const [opsiKelompok, setOpsiKelompok] = useState<Kelompok[]>([]);
  const [opsiKelas, setOpsiKelas] = useState<
    { id: number; nama: string; jam_mulai: string; ruangan: string }[]
  >([]);
  /* '' = semua kelas. */
  const [kelasId, setKelasId] = useState<string>(() => searchParams.get('kelasId') || '');

  /* Pengecualian kalender per kelompok (kalender_kelompok, 2026-08-24) --
     kelp yang tetap masuk di tanggal merah ('aktif') atau libur mendadak
     di hari kerja biasa ('libur'), diatur admin lewat /pengaturan. Dimuat
     di sini (satu2nya pemilik kelompokId di halaman ini) lalu digabung
     dgn kalender libur nasional (buatCekNonaktif) jadi SATU fungsi yang
     dipakai baik utk mengunci kalender (GuruAbsensiView) MAUPUN penjaga
     saat Simpan (handleSimpanGuru) -- keduanya WAJIB konsisten, kalau
     tidak guru bisa memilih tanggal di kalender tapi ditolak saat Simpan
     (atau sebaliknya). */
  const [overrideKelompok, setOverrideKelompok] = useState<Map<string, OverrideKelompok>>(new Map());
  useEffect(() => {
    if (!kelompokId) return;
    let batal = false;
    muatOverrideKelompok(kelompokId).then((peta) => {
      if (!batal) setOverrideKelompok(peta);
    });
    return () => {
      batal = true;
    };
  }, [kelompokId]);
  const cekNonaktif = useMemo(() => buatCekNonaktif(overrideKelompok), [overrideKelompok]);

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
     saat guru klik Simpan -- lihat muatQuoteHarian(). */
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
        setError(queryError.message);
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
      /* Daftar ini MILIK TAMPILAN ADMIN (dropdown penyaring + kartu
         RingkasanKelas). Guru memakai kelasDetail di bawah, jadi buat
         guru query ini murni pemborosan — dilewati sejak audit kehadiran
         2026-09-02. */
      if (adalahGuru) {
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
  }, [kelompokId, adalahGuru]);

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
      /* Kelas MILIK SENDIRI lewat singgahan bersama (lib/dataGuru.ts) --
         daftar itu tidak pernah bergantung tanggal, tapi dulu ikut
         ditembak ulang tiap kali guru menggeser tanggal, dan ditembak
         lagi dari nol di layar Riwayat Kehadiran (audit kehadiran,
         temuan 03 & 05). Yang benar-benar bergantung tanggal cuma kelas
         PINJAM di bawahnya. */
      const kolom = 'id, nama, ruangan, jam_mulai, jam_selesai, santri_count, kategori_kbm(nama)';
      const [sendiriMentah, hasilPinjam] = await Promise.all([
        muatKelasGuru(profile.guru_id),
        supabase
          .from('akses_kelas_request')
          .select(`kelas:kelas_id(${kolom})`)
          .eq('requester_guru_id', profile.guru_id)
          .eq('tanggal', tanggal)
          .eq('status', 'approved'),
      ]);
      if (cancelled) return;

      /* Singgahan mengurutkan menurut nama; layar ini butuh urut jam
         mulai (jadwal harian guru), jadi diurutkan lagi di sini. */
      const sendiri = [...sendiriMentah].sort((a, b) =>
        (a.jam_mulai ?? '').localeCompare(b.jam_mulai ?? '')
      ) as unknown as KelasDetail[];
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

  /* Kutipan TIDAK lagi diambil saat layar dibuka (audit kehadiran,
     temuan 04): isinya cuma dipakai di popup setelah absen tersimpan,
     jadi guru yang membuka layar lalu keluar dulu membayar permintaan
     itu percuma. Sekarang diambil saat menyimpan, lewat singgahan
     bersama -- praktis nol biaya untuk simpan berikutnya. */

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

      const santriRes = await qSantri;
      if (santriRes.error) throw new Error(santriRes.error.message);
      const daftarSantri: Santri[] = santriRes.data ?? [];

      /* Absensi dipersempit ke santri yang BENAR-BENAR ditampilkan
         (audit kehadiran, temuan 06). Sebelumnya seluruh baris absensi
         satu kelompok pada tanggal itu ditarik lalu sebagian besar
         dibuang: utk Petemon ±69 baris demi ±15 yang dipakai, dan
         angkanya tumbuh seiring jumlah santri per kelompok. Saat
         penyaring kelas kosong ("Semua kelas") hasilnya sama saja
         seperti dulu, karena daftar santrinya memang sekelompok penuh.
         Dua query dijalankan BERURUTAN sekarang, bukan paralel: yang
         kedua butuh id dari yang pertama. Tukarnya adil -- satu
         perjalanan pulang-pergi ekstra, ditukar muatan yang jauh lebih
         kecil dan pekerjaan RLS yang jauh lebih sedikit di server. */
      const idSantri = daftarSantri.map((s) => s.id);
      const absensiRes = idSantri.length
        ? await supabase
            .from('absensi')
            .select('id, santri_id, status, updated_at')
            .eq('kelompok_id', kelompokId)
            .eq('tanggal', tanggal)
            .in('santri_id', idSantri)
            .is('deleted_at', null)
        : { data: [] as AbsensiRow[], error: null };

      if (absensiRes.error) throw new Error(absensiRes.error.message);

      const daftarAbsensi: AbsensiRow[] = absensiRes.data ?? [];

      const petaTersimpan: Record<number, AbsensiRow> = {};
      for (const a of daftarAbsensi) petaTersimpan[a.santri_id] = a;

      const awal: Record<number, Status> = {};
      for (const s of daftarSantri) awal[s.id] = petaTersimpan[s.id]?.status ?? 'hadir';

      setSantri(daftarSantri);
      setTersimpan(petaTersimpan);
      setPilihan(awal);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data santri.');
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

    /* Penjaga OFFLINE (2026-08-28). Tanpa ini, menekan Simpan tanpa sinyal
       -- kondisi yang wajar terjadi di TPQ -- cuma memunculkan pesan mentah
       "Failed to fetch" setelah menunggu, dan guru tidak tahu apakah
       datanya masuk atau tidak. Dicek DI SINI (sebelum RPC dipanggil)
       supaya isian di layar TIDAK hilang: guru tinggal menunggu sinyal
       lalu menekan Simpan lagi, semua pilihan status masih utuh.

       Ini SENGAJA belum antrean-simpan-otomatis: menulis absensi punya
       penjaga versi (absensi_sesi) utk mencegah lost-update antar guru,
       dan mengirim ulang diam-diam dari antrean bisa menimpa perubahan
       orang lain. Menahan di depan itu jujur dan aman. */
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatusModal({
        tone: 'warning',
        judul: 'Tidak Ada Koneksi',
        pesan:
          'HP Anda sedang tidak terhubung ke internet, jadi absensi belum bisa disimpan. Pilihan kehadiran yang sudah Anda isi TIDAK hilang — tunggu sinyal kembali, lalu tekan Simpan Kehadiran lagi.',
      });
      return;
    }

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

    /* Kalender (TanggalPicker) sudah mengunci Sabtu/Minggu/tanggal merah
       saat guru MEMILIH lewat ikon kalender -- tapi `tanggal` bisa juga
       berupa nilai default "hari ini" yang belum pernah disentuh
       pickernya sama sekali (dilaporkan owner: Neiza klik Simpan di hari
       Minggu, tombolnya masih jalan). Pemeriksaan di sini adalah lapisan
       kedua yang tidak bergantung pada picker sempat dibuka atau tidak. */
    const libur = cekNonaktif(tanggal, new Date(tanggal + 'T00:00:00'));
    if (libur) {
      setStatusModal({
        tone: 'warning',
        judul: 'Tidak Bisa Disimpan',
        pesan: `Tidak ada KBM pada ${libur.alasan.toLowerCase().startsWith('hari') ? libur.alasan : `tanggal merah (${libur.alasan})`}, absen tidak bisa disimpan.`,
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
      /* Kutipan diambil DI SINI, bukan saat layar dibuka (audit kehadiran
         temuan 04). Lewat singgahan bersama, jadi simpan kedua dst tidak
         menembak jaringan lagi. Gagal ambil = pakai kutipan cadangan;
         kutipan tidak boleh menahan kabar gembira "absen tersimpan". */
      const daftarKutipan = await muatQuoteHarian().catch(() => [] as string[]);
      const kutipan =
        daftarKutipan.length > 0
          ? daftarKutipan[Math.floor(Math.random() * daftarKutipan.length)]
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
      <main className="min-h-screen bg-bg p-6">
        <p className="text-[13px] text-text-dim">Memuat profil...</p>
      </main>
    );
  }

  if (!berwenang) {
    return (
      <main className="min-h-screen bg-bg p-6">
        <div className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
          <h1 className="mb-2 text-[17px] font-bold text-text">Input Absensi</h1>
          <p className="text-[13px] text-red">
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
          tanggalNonaktif={cekNonaktif}
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
    <main className="min-h-screen bg-bg p-6">
      <h1 className="mb-6 text-[22px] font-extrabold text-text">Input Absensi</h1>

      <div className="mb-6 rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-[13px] text-text">
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
            <label className="text-[13px] text-text">
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
            <label className="text-[13px] text-text">
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
            <p className="text-[13px] text-text-dim">
              <span className="font-medium">Kelompok:</span> {kelompokId ?? '-'}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-card border border-border bg-panel p-4 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-[17px] font-bold text-text">Daftar Santri</h2>
          <button
            onClick={handleSimpan}
            disabled={saving || loading || santri.length === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {saving ? 'Menyimpan...' : 'Simpan Absensi'}
          </button>
        </div>

        {sukses && <p className="mb-3 text-[13px] text-sage">{sukses}</p>}
        {saveError && <p className="mb-3 text-[13px] text-red">{saveError}</p>}

        {loading && <p className="text-[13px] text-text-dim">Memuat data...</p>}
        {!loading && error && <p className="text-[13px] text-red">{error}</p>}
        {!loading && !error && santri.length === 0 && (
          <p className="text-[13px] text-text-dim">Belum ada santri di kelas ini.</p>
        )}

        {!loading && !error && santri.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-text-dim">
                  <th className="py-2 pr-4">Nama</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {santri.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-panel-2">
                    <td className="py-2 pr-4">
                      {s.nama}
                      {tersimpan[s.id] && (
                        <span className="ml-2 text-[11px] text-text-faint">tersimpan</span>
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
                                : 'border-border bg-panel text-text hover:bg-panel-2'
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

/* useSearchParams (dipakai AbsensiContent utk deep-link) mewajibkan
   pemanggilnya dibungkus Suspense saat build produksi -- lihat
   node_modules/next/dist/docs/.../use-search-params.md ("Missing
   Suspense boundary with useSearchParams" kalau tidak). Fallback-nya
   sengaja logo berdenyut yang sama dgn app/absensi/loading.tsx, bukan
   loading.tsx route-level -- Suspense di sini lain lapisan (bailout
   client-render subtree searchParams), keduanya bisa aktif bersamaan. */
function FallbackMemuat() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg">
      <Image src="/logo-ruang-ngaji.png" alt="Ruang Ngaji" width={40} height={36} className="animate-pulse" />
      <div className="h-1.5 w-24 animate-pulse rounded-full bg-panel-2" />
    </main>
  );
}

export default function AbsensiPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<FallbackMemuat />}>
        <AbsensiContent />
      </Suspense>
    </RequireAuth>
  );
}
