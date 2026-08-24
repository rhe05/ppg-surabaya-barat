'use client';

/* Halaman Pengaturan — menggabungkan dua modul kecil app lama yang
   sama-sama bersifat konfigurasi sekali-atur, bukan data harian:

   1. Quote Harian (Modul_QuoteHarian.gs, 90 baris, 4 fungsi) — kumpulan
      kutipan yang ditampilkan bergantian di dashboard. PPG-wide: satu
      daftar dipakai semua kelompok, dan HANYA admin_ppg yang boleh
      mengubahnya (ketiga fungsi tulisnya dibuka requireAdminPpg_).
   2. Kop Surat (Modul_KopSurat.gs, 103 baris, 2 fungsi) — kepala surat
      untuk PDF Laporan Perkembangan Santri: tiga baris teks dengan
      tipografi masing-masing, plus garis.

   Digabung karena keduanya cuma butuh satu panel kecil; memberi masing-
   masing satu halaman penuh justru membuat navigasi ramai tanpa guna.

   Beda dari app lama pada Kop Surat: di Firestore satu dokumen menyimpan
   semua baris sebagai field datar (b1_teks, b1_font, ...) karena
   firestoreEncodeFields_ tidak mendukung nested. Di Postgres barisnya
   menjadi tabel sendiri `kop_surat_baris`, satu baris per baris kop. */

import { useCallback, useEffect, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import type { JenisOverride } from '@/lib/kalenderKelompok';

/* MVP app lama baru memakai kategori 'cabe-rawit'; strukturnya sudah
   kategori-scoped sehingga menambah kategori lain nanti tidak perlu
   mengubah skema. */
const KATEGORI_SLUG = 'cabe-rawit';
const FONT = ['helvetica', 'times', 'courier'];
const ALIGN = ['left', 'center', 'right'];
const JUDUL_BARIS = ['Nama TPQ/TPA', 'Nomor Izin Operasional', 'Alamat'];

type Kelompok = { id: number; nama: string };
type Quote = { id: number; teks: string };
type EntriKalender = {
  id: number;
  tanggal: string;
  jenis: JenisOverride;
  catatan: string | null;
};
type Tersemat = { nama: string } | { nama: string }[] | null;
type Undangan = {
  id: number;
  nama_lengkap: string;
  kelompok_id: number;
  profile_id: string | null;
  claimed_at: string | null;
  kelompok: Tersemat;
};
type BarisKop = {
  baris_ke: number;
  teks: string;
  font: string;
  is_bold: boolean;
  ukuran: number;
  warna: string;
  align: string;
};

const BARIS_KOSONG = (n: number): BarisKop => ({
  baris_ke: n,
  teks: '',
  font: 'helvetica',
  is_bold: n === 1,
  ukuran: n === 1 ? 14 : 10,
  warna: '#000000',
  align: 'center',
});

/* "Senin, 24 Agustus 2026 · 14:32" -- dipakai kolom "Sudah Bergabung"
   (kapan orangnya benar2 mengklaim akun, bukan kapan diundang). */
function formatWaktuBergabung(iso: string) {
  const d = new Date(iso);
  const tanggal = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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

function PengaturanContent() {
  const { profile } = useAuth();
  const adalahPpg = profile?.role === 'admin_ppg';
  const bolehAturKop = ['admin_ppg', 'admin_desa', 'admin_kelompok'].includes(profile?.role ?? '');
  /* Undang Admin Kelp -- SENGAJA cuma dua peran (bukan tiga spt bolehAturKop
     di atas), diminta owner eksplisit: "yang bisa daftarkan ada dua: admin
     aplikasi dan admin desa". admin_kelompok TIDAK boleh mengundang
     admin_kelompok lain -- sama persis batas wewenang setujui_pendaftaran()
     utk peran admin_kelompok (migrasi 20260819090000), RLS
     admin_kelp_undangan_tulis_ppg_desa (20260824110000) menegakkan hal yg
     sama di server, ini cuma cermin di UI. */
  const bolehUndangAdminKelp = ['admin_ppg', 'admin_desa'].includes(profile?.role ?? '');

  /* ── Quote ── */
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [quoteBaru, setQuoteBaru] = useState('');

  /* ── Kop surat ── */
  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [kopId, setKopId] = useState<number | null>(null);
  const [pakaiGaris, setPakaiGaris] = useState(true);
  const [garisAtas, setGarisAtas] = useState(true);
  const [baris, setBaris] = useState<BarisKop[]>([1, 2, 3].map(BARIS_KOSONG));

  /* ── Kalender Kelompok (2026-08-24) -- pengecualian kalender per
     kelompok, dikonsumsi kalender Input Kehadiran & Materi Klasikal
     (lib/kalenderKelompok.ts). Berbagi `kelompokId` yang sama dgn Kop
     Surat di atas -- kedua fitur sama2 diatur per kelompok, tidak perlu
     pemilih kelompok kedua. */
  const [daftarKalender, setDaftarKalender] = useState<EntriKalender[]>([]);
  const [tanggalBaru, setTanggalBaru] = useState('');
  const [jenisBaru, setJenisBaru] = useState<JenisOverride>('aktif');
  const [catatanBaru, setCatatanBaru] = useState('');

  /* ── Undang Admin Kelp (2026-08-24) -- PPG-wide (bukan per-kelompok),
     jadi TIDAK berbagi kelompokId dgn dua fitur di atas: satu admin_ppg
     bisa mengundang ke kelompok mana pun sekaligus, tidak masuk akal
     dibatasi ke satu kelompok yang sedang dipilih di form Kop Surat. */
  const [daftarUndangan, setDaftarUndangan] = useState<Undangan[]>([]);
  const [namaUndanganBaru, setNamaUndanganBaru] = useState('');
  const [kelompokUndanganBaru, setKelompokUndanganBaru] = useState<number | ''>('');
  /* Daftar "Sudah Bergabung" auto-hide (collapsed) -- diminta owner:
     datanya akan terus bertambah seiring makin banyak admin kelp
     terdaftar, jadi TIDAK ditampilkan penuh spt "Menunggu" (yg memang
     perlu selalu kelihatan krn actionable). */
  const [tampilkanSudahBergabung, setTampilkanSudahBergabung] = useState(false);

  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const muatQuote = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('quote_harian')
      .select('id, teks')
      .order('id', { ascending: false });
    if (err) setError(err.message);
    else setQuotes((data ?? []) as unknown as Quote[]);
  }, []);

  useEffect(() => {
    muatQuote();
  }, [muatQuote]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      setKelompokList(data ?? []);
    }
    load();
  }, []);

  const muatKop = useCallback(async () => {
    if (!kelompokId) return;
    setError(null);
    const { data, error: err } = await supabase
      .from('kop_surat')
      .select('id, pakai_garis, garis_atas, kop_surat_baris(baris_ke, teks, font, is_bold, ukuran, warna, align)')
      .eq('kelompok_id', kelompokId)
      .eq('kategori_slug', KATEGORI_SLUG)
      .maybeSingle();
    if (err) {
      setError(err.message);
      return;
    }
    if (!data) {
      /* Belum pernah diatur — form tampil kosong, bukan error. */
      setKopId(null);
      setPakaiGaris(true);
      setGarisAtas(true);
      setBaris([1, 2, 3].map(BARIS_KOSONG));
      return;
    }
    const d = data as unknown as {
      id: number;
      pakai_garis: boolean;
      garis_atas: boolean;
      kop_surat_baris: BarisKop[];
    };
    setKopId(d.id);
    setPakaiGaris(d.pakai_garis);
    setGarisAtas(d.garis_atas);
    setBaris(
      [1, 2, 3].map((n) => d.kop_surat_baris?.find((b) => b.baris_ke === n) ?? BARIS_KOSONG(n))
    );
  }, [kelompokId]);

  useEffect(() => {
    muatKop();
  }, [muatKop]);

  const muatKalender = useCallback(async () => {
    if (!kelompokId) {
      setDaftarKalender([]);
      return;
    }
    const { data, error: err } = await supabase
      .from('kalender_kelompok')
      .select('id, tanggal, jenis, catatan')
      .eq('kelompok_id', kelompokId)
      .order('tanggal', { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setDaftarKalender((data ?? []) as EntriKalender[]);
  }, [kelompokId]);

  useEffect(() => {
    muatKalender();
  }, [muatKalender]);

  async function tambahKalender() {
    if (!kelompokId || !tanggalBaru) return;
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('kalender_kelompok').insert({
        kelompok_id: kelompokId,
        tanggal: tanggalBaru,
        jenis: jenisBaru,
        catatan: catatanBaru.trim() || null,
        dibuat_oleh: profile?.id ?? null,
      });
      if (err) throw new Error(err.message);
      setTanggalBaru('');
      setCatatanBaru('');
      setPesan('Kalender kelompok diperbarui.');
      await muatKalender();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah tanggal.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapusKalender(entri: EntriKalender) {
    if (!window.confirm(`Hapus pengecualian tanggal ${entri.tanggal}?`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('kalender_kelompok').delete().eq('id', entri.id);
      if (err) throw new Error(err.message);
      setPesan('Tanggal dihapus.');
      await muatKalender();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  const muatUndangan = useCallback(async () => {
    if (!bolehUndangAdminKelp) return;
    const { data, error: err } = await supabase
      .from('admin_kelp_undangan')
      .select('id, nama_lengkap, kelompok_id, profile_id, claimed_at, kelompok:kelompok_id(nama)')
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setDaftarUndangan((data ?? []) as unknown as Undangan[]);
  }, [bolehUndangAdminKelp]);

  useEffect(() => {
    muatUndangan();
  }, [muatUndangan]);

  async function undangAdminKelp() {
    if (!namaUndanganBaru.trim() || !kelompokUndanganBaru) return;
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('admin_kelp_undangan').insert({
        nama_lengkap: namaUndanganBaru.trim(),
        kelompok_id: kelompokUndanganBaru,
        dibuat_oleh: profile?.id ?? null,
      });
      if (err) throw new Error(err.message);
      setNamaUndanganBaru('');
      setKelompokUndanganBaru('');
      setPesan('Undangan dibuat. Sampaikan nama kelompok & nama lengkap ini ke orangnya.');
      await muatUndangan();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membuat undangan.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapusUndangan(u: Undangan) {
    if (!window.confirm(`Batalkan undangan "${u.nama_lengkap}"?`)) return;
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('admin_kelp_undangan').delete().eq('id', u.id);
      if (err) throw new Error(err.message);
      setPesan('Undangan dibatalkan.');
      await muatUndangan();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal membatalkan.');
    }
  }

  async function tambahQuote() {
    if (!quoteBaru.trim()) return;
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase
        .from('quote_harian')
        .insert({ teks: quoteBaru.trim(), dibuat_oleh: profile?.id ?? null });
      if (err) throw new Error(err.message);
      setQuoteBaru('');
      setPesan('Kutipan ditambahkan.');
      await muatQuote();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah kutipan.');
    } finally {
      setSibuk(false);
    }
  }

  async function hapusQuote(q: Quote) {
    if (!window.confirm('Hapus kutipan ini?')) return;
    const { error: err } = await supabase.from('quote_harian').delete().eq('id', q.id);
    if (err) setError(err.message);
    else {
      setPesan('Kutipan dihapus.');
      await muatQuote();
    }
  }

  function ubahBaris(n: number, patch: Partial<BarisKop>) {
    setBaris((s) => s.map((b) => (b.baris_ke === n ? { ...b, ...patch } : b)));
  }

  async function simpanKop() {
    if (!kelompokId) return;
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      let id = kopId;
      if (id) {
        const { error: e1 } = await supabase
          .from('kop_surat')
          .update({ pakai_garis: pakaiGaris, garis_atas: garisAtas, diubah_oleh: profile?.id ?? null })
          .eq('id', id);
        if (e1) throw new Error(e1.message);
      } else {
        const { data, error: e1 } = await supabase
          .from('kop_surat')
          .insert({
            kelompok_id: kelompokId,
            kategori_slug: KATEGORI_SLUG,
            pakai_garis: pakaiGaris,
            garis_atas: garisAtas,
            diubah_oleh: profile?.id ?? null,
          })
          .select('id')
          .single();
        if (e1) throw new Error(e1.message);
        id = data.id;
        setKopId(id);
      }

      /* Baris ditulis ulang seluruhnya: hapus lalu sisipkan tiga baris.
         Lebih sederhana dan selalu konsisten dibanding upsert per baris,
         dan jumlahnya memang tetap tiga. */
      const { error: e2 } = await supabase.from('kop_surat_baris').delete().eq('kop_surat_id', id);
      if (e2) throw new Error(e2.message);
      const { error: e3 } = await supabase
        .from('kop_surat_baris')
        .insert(baris.map((b) => ({ ...b, kop_surat_id: id })));
      if (e3) throw new Error(e3.message);

      setPesan('Kop surat tersimpan.');
      await muatKop();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan kop surat.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Pengaturan</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Kutipan harian, kop surat untuk laporan PDF, kalender kelompok, dan undangan admin kelp.
      </p>

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

      {/* ── Undang Admin Kelp ── */}
      {bolehUndangAdminKelp && (
        <div className="mb-8 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 text-[15px] font-bold text-text">Registrasi</div>

          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius)] border border-border bg-panel-2 p-3.5">
            <div className="min-w-[200px] flex-1">
              <label className={KELAS_LABEL}>Nama Lengkap</label>
              <input
                className={KELAS_INPUT}
                value={namaUndanganBaru}
                onChange={(e) => setNamaUndanganBaru(e.target.value)}
                placeholder="Nama sesuai KTP/yang biasa dipakai"
              />
            </div>
            <div className="min-w-[200px] flex-1">
              <label className={KELAS_LABEL}>Kelompok</label>
              <select
                className={KELAS_INPUT}
                value={kelompokUndanganBaru}
                onChange={(e) => setKelompokUndanganBaru(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">-- Pilih Kelompok --</option>
                {kelompokList.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={undangAdminKelp}
              disabled={sibuk || !namaUndanganBaru.trim() || !kelompokUndanganBaru}
              className={KELAS_TOMBOL_UTAMA}
            >
              Daftar
            </button>
          </div>

          {(() => {
            const menunggu = daftarUndangan.filter((u) => !u.profile_id);
            const sudahBergabung = daftarUndangan.filter((u) => u.profile_id);
            return (
              <>
                {menunggu.length === 0 && sudahBergabung.length === 0 && (
                  <p className="text-[13px] text-text-dim">Belum ada yang didaftarkan.</p>
                )}

                {menunggu.map((u) => {
                  const namaKelompok = Array.isArray(u.kelompok) ? u.kelompok[0]?.nama : u.kelompok?.nama;
                  return (
                    <div
                      key={u.id}
                      className="mb-2 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] font-semibold text-text">{u.nama_lengkap}</span>
                        <span className="text-[12px] text-text-dim">{namaKelompok ?? '-'}</span>
                        <span className="rounded-full bg-[rgba(217,119,6,0.12)] px-2 py-0.5 text-[11px] font-bold text-brass">
                          Menunggu
                        </span>
                      </div>
                      <button onClick={() => hapusUndangan(u)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                        Batalkan
                      </button>
                    </div>
                  );
                })}

                {/* Auto-hide (diminta owner): daftar yang sudah bergabung akan
                    terus bertambah, jadi disembunyikan lipat secara default --
                    "Menunggu" di atas TETAP selalu tampil krn actionable. */}
                {sudahBergabung.length > 0 && (
                  <div className={menunggu.length > 0 ? 'mt-3' : undefined}>
                    <button
                      type="button"
                      onClick={() => setTampilkanSudahBergabung((v) => !v)}
                      className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius)] border-none bg-transparent px-1 py-1.5 text-left text-[12.5px] font-semibold text-text-dim"
                    >
                      <span>Sudah Bergabung ({sudahBergabung.length})</span>
                      <span className="text-[11px]">{tampilkanSudahBergabung ? 'Sembunyikan ▲' : 'Tampilkan ▼'}</span>
                    </button>
                    {tampilkanSudahBergabung && (
                      <div className="mt-1.5">
                        {sudahBergabung.map((u) => {
                          const namaKelompok = Array.isArray(u.kelompok) ? u.kelompok[0]?.nama : u.kelompok?.nama;
                          return (
                            <div
                              key={u.id}
                              className="mb-2 rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center gap-3">
                                <span className="text-[13px] font-semibold text-text">{u.nama_lengkap}</span>
                                <span className="text-[12px] text-text-dim">{namaKelompok ?? '-'}</span>
                                <span className="rounded-full bg-[rgba(79,70,229,0.12)] px-2 py-0.5 text-[11px] font-bold text-indigo">
                                  Admin Kelp
                                </span>
                                <span className="rounded-full bg-[rgba(5,150,105,0.12)] px-2 py-0.5 text-[11px] font-bold text-sage">
                                  Sudah Bergabung
                                </span>
                              </div>
                              {u.claimed_at && (
                                <div className="mt-1 text-[11px] text-text-faint">
                                  Bergabung {formatWaktuBergabung(u.claimed_at)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Kop Surat ── */}
      <div className="mb-8 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4 text-[15px] font-bold text-text">Kop Surat Laporan</div>

        <div className="mb-4 max-w-sm">
          <label className={KELAS_LABEL}>Kelompok</label>
          <select
            className={KELAS_INPUT}
            value={kelompokId ?? ''}
            disabled={profile?.role === 'admin_kelompok' || profile?.role === 'guru'}
            onChange={(e) => setKelompokId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">-- Pilih Kelompok --</option>
            {kelompokList.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nama}
              </option>
            ))}
          </select>
        </div>

        {!kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}

        {kelompokId && (
          <>
            {baris.map((b) => (
              <div key={b.baris_ke} className="mb-4 rounded-[var(--radius)] border border-border p-3">
                <div className="mb-2 text-[12px] font-bold text-text-dim">
                  Baris {b.baris_ke} — {JUDUL_BARIS[b.baris_ke - 1]}
                </div>
                <input
                  className={KELAS_INPUT + ' mb-3'}
                  value={b.teks}
                  disabled={!bolehAturKop}
                  onChange={(e) => ubahBaris(b.baris_ke, { teks: e.target.value })}
                  placeholder={JUDUL_BARIS[b.baris_ke - 1]}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className={KELAS_LABEL}>Font</label>
                    <select
                      className={KELAS_INPUT}
                      value={b.font}
                      disabled={!bolehAturKop}
                      onChange={(e) => ubahBaris(b.baris_ke, { font: e.target.value })}
                    >
                      {FONT.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={KELAS_LABEL}>Ukuran</label>
                    <input
                      type="number"
                      min={6}
                      max={40}
                      className={KELAS_INPUT}
                      value={b.ukuran}
                      disabled={!bolehAturKop}
                      onChange={(e) => ubahBaris(b.baris_ke, { ukuran: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className={KELAS_LABEL}>Tata letak</label>
                    <select
                      className={KELAS_INPUT}
                      value={b.align}
                      disabled={!bolehAturKop}
                      onChange={(e) => ubahBaris(b.baris_ke, { align: e.target.value })}
                    >
                      {ALIGN.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={KELAS_LABEL}>Warna</label>
                    <input
                      type="color"
                      className={KELAS_INPUT + ' h-[42px] p-1'}
                      value={b.warna}
                      disabled={!bolehAturKop}
                      onChange={(e) => ubahBaris(b.baris_ke, { warna: e.target.value })}
                    />
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-[12px] text-text">
                  <input
                    type="checkbox"
                    checked={b.is_bold}
                    disabled={!bolehAturKop}
                    onChange={(e) => ubahBaris(b.baris_ke, { is_bold: e.target.checked })}
                  />
                  Tebal
                </label>
              </div>
            ))}

            <div className="mb-4 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input
                  type="checkbox"
                  checked={pakaiGaris}
                  disabled={!bolehAturKop}
                  onChange={(e) => setPakaiGaris(e.target.checked)}
                />
                Pakai garis
              </label>
              <label className="flex items-center gap-2 text-[13px] text-text">
                <input
                  type="checkbox"
                  checked={garisAtas}
                  disabled={!bolehAturKop || !pakaiGaris}
                  onChange={(e) => setGarisAtas(e.target.checked)}
                />
                Garis di atas
              </label>
            </div>

            {bolehAturKop && (
              <button onClick={simpanKop} disabled={sibuk} className={KELAS_TOMBOL_UTAMA}>
                {sibuk ? 'Menyimpan...' : 'Simpan Kop Surat'}
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Kalender Kelompok ── */}
      <div className="mb-8 rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-1 text-[15px] font-bold text-text">Kalender Kelompok</div>
        <p className="mb-4 text-[12px] text-text-dim">
          Tandai tanggal yang berbeda dari kalender libur nasional -- kelompok tetap masuk di
          tanggal merah, atau libur mendadak di hari kerja biasa. Berlaku untuk kalender Input
          Kehadiran &amp; Materi Klasikal. Kalender libur nasional sendiri tidak berubah.
        </p>

        {!kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok di atas dulu.</p>}

        {kelompokId && (
          <>
            {bolehAturKop && (
              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[var(--radius)] border border-border bg-panel-2 p-3.5">
                <div>
                  <label className={KELAS_LABEL}>Tanggal</label>
                  <input
                    type="date"
                    className={KELAS_INPUT}
                    value={tanggalBaru}
                    onChange={(e) => setTanggalBaru(e.target.value)}
                  />
                </div>
                <div>
                  <label className={KELAS_LABEL}>Jenis</label>
                  <select
                    className={KELAS_INPUT}
                    value={jenisBaru}
                    onChange={(e) => setJenisBaru(e.target.value as JenisOverride)}
                  >
                    <option value="aktif">Tetap Aktif (meski tanggal merah)</option>
                    <option value="libur">Libur Mendadak (meski hari kerja)</option>
                  </select>
                </div>
                <div className="min-w-[200px] flex-1">
                  <label className={KELAS_LABEL}>Catatan (opsional)</label>
                  <input
                    className={KELAS_INPUT}
                    value={catatanBaru}
                    onChange={(e) => setCatatanBaru(e.target.value)}
                    placeholder="Misal: Maulid Nabi tetap KBM"
                  />
                </div>
                <button
                  onClick={tambahKalender}
                  disabled={sibuk || !tanggalBaru}
                  className={KELAS_TOMBOL_UTAMA}
                >
                  Tambah
                </button>
              </div>
            )}

            {daftarKalender.length === 0 && (
              <p className="text-[13px] text-text-dim">Belum ada pengecualian kalender.</p>
            )}
            {daftarKalender.map((entri) => (
              <div
                key={entri.id}
                className="mb-2 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-semibold text-text">{entri.tanggal}</span>
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-[11px] font-bold ' +
                      (entri.jenis === 'aktif'
                        ? 'bg-[rgba(5,150,105,0.12)] text-sage'
                        : 'bg-[rgba(220,38,38,0.12)] text-red')
                    }
                  >
                    {entri.jenis === 'aktif' ? 'Tetap Aktif' : 'Libur Mendadak'}
                  </span>
                  {entri.catatan && <span className="text-[12px] text-text-dim">{entri.catatan}</span>}
                </div>
                {bolehAturKop && (
                  <button onClick={() => hapusKalender(entri)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                    Hapus
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Quote Harian ── */}
      <div className="rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
        <div className="mb-1 text-[15px] font-bold text-text">Kutipan Harian</div>
        <p className="mb-4 text-[12px] text-text-dim">
          Satu daftar untuk seluruh PPG. Hanya admin PPG yang bisa mengubahnya.
        </p>

        {adalahPpg && (
          <div className="mb-4 flex flex-wrap gap-3">
            <input
              className={KELAS_INPUT + ' min-w-[240px] flex-1'}
              value={quoteBaru}
              onChange={(e) => setQuoteBaru(e.target.value)}
              placeholder="Tulis kutipan baru"
            />
            <button onClick={tambahQuote} disabled={sibuk || !quoteBaru.trim()} className={KELAS_TOMBOL_UTAMA}>
              Tambah
            </button>
          </div>
        )}

        {quotes.length === 0 && (
          <p className="text-[13px] text-text-dim">Belum ada kutipan tersimpan.</p>
        )}
        {quotes.map((q) => (
          <div
            key={q.id}
            className="mb-2 flex items-start justify-between gap-3 rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-2"
          >
            <span className="text-[13px] text-text">{q.teks}</span>
            {adalahPpg && (
              <button onClick={() => hapusQuote(q)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                Hapus
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PengaturanPage() {
  return (
    <RequireAuth>
      <PengaturanContent />
    </RequireAuth>
  );
}
