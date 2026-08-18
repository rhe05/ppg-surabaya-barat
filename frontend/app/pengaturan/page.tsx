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

/* MVP app lama baru memakai kategori 'cabe-rawit'; strukturnya sudah
   kategori-scoped sehingga menambah kategori lain nanti tidak perlu
   mengubah skema. */
const KATEGORI_SLUG = 'cabe-rawit';
const FONT = ['helvetica', 'times', 'courier'];
const ALIGN = ['left', 'center', 'right'];
const JUDUL_BARIS = ['Nama TPQ/TPA', 'Nomor Izin Operasional', 'Alamat'];

type Kelompok = { id: number; nama: string };
type Quote = { id: number; teks: string };
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
        Kutipan harian dan kop surat untuk laporan PDF.
      </p>

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

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
