'use client';

/* Halaman Kelas — daftar kelas, pembuatan/penyuntingan, dan PENEMPATAN
   SANTRI ke kelas.

   Kenapa penempatan santri ada di sini, bukan di form santri: kolom
   `santri.kelas_id` kosong untuk SELURUH 199 santri produksi, dan itu
   menghambat banyak hal sekaligus — jurnal hanya bisa diisi untuk kelas
   terdaftar, KPI dan Monitoring terpaksa memakai jalan memutar lewat
   jenjang, dan input absensi belum bisa dipecah per kelas seperti app lama.
   Menempatkan satu per satu lewat form santri (25 field) terlalu lambat
   untuk 199 orang; di sini bisa banyak sekaligus.

   `kelas` adalah entitas BARU yang lahir saat migrasi — app lama tidak
   punya tabelnya (kelas di sana hanya kolom teks bebas di jadwal_kbm).
   Karena itu tidak ada padanan fungsi GAS yang bisa ditiru; bentuk halaman
   ini ditentukan oleh kebutuhan data, bukan oleh app lama. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import RequireAuth from '@/components/RequireAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useIsMobile } from '@/lib/useIsMobile';
import KelasForm, {
  KATEGORI_REMAJA_PRA_NIKAH,
  KOLOM_KELAS,
  type Guru,
  type KategoriKbm,
  type KelasRow,
} from '@/components/kelas/KelasForm';
import KelasKelpMobile from '@/components/dashboard/KelasKelpMobile';

const PERAN_TULIS = ['admin_ppg', 'admin_desa', 'admin_kelompok'];

type Kelompok = { id: number; nama: string };
type Kelas = KelasRow;
type Santri = { id: number; nama: string; nis: string | null; kelas_id: number | null };

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

const keJam = (v: string | null) => (v ? v.slice(0, 5) : '');

function KelasContent() {
  const { profile } = useAuth();
  const bolehTulis = PERAN_TULIS.includes(profile?.role ?? '');

  const [kelompokList, setKelompokList] = useState<Kelompok[]>([]);
  const [kelompokId, setKelompokId] = useState<number | null>(profile?.scope_kelompok_id ?? null);
  const [kategoriList, setKategoriList] = useState<KategoriKbm[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [santri, setSantri] = useState<Santri[]>([]);

  const [loading, setLoading] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [sedangDiubah, setSedangDiubah] = useState<Kelas | null>(null);

  /* Penempatan massal */
  const [terpilih, setTerpilih] = useState<Set<number>>(new Set());
  const [kelasTujuan, setKelasTujuan] = useState('');
  const [saringPenempatan, setSaringPenempatan] = useState<'belum' | 'semua'>('belum');

  useEffect(() => {
    async function load() {
      const [{ data: dKel }, { data: dKat }] = await Promise.all([
        supabase.from('kelompok').select('id, nama').order('nama'),
        supabase.from('kategori_kbm').select('id, nama'),
      ]);
      setKelompokList(dKel ?? []);
      setKategoriList((dKat ?? []) as unknown as KategoriKbm[]);
    }
    load();
  }, []);

  const muat = useCallback(async () => {
    if (!kelompokId) {
      setKelasList([]);
      setSantri([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [{ data: dKelas, error: e1 }, { data: dGuru }, { data: dSantri, error: e2 }] =
        await Promise.all([
          supabase
            .from('kelas')
            .select(KOLOM_KELAS)
            .eq('kelompok_id', kelompokId)
            .is('deleted_at', null)
            .order('nama'),
          supabase
            .from('guru')
            .select('id, nama, kategori')
            .eq('kelompok_id', kelompokId)
            .is('deleted_at', null)
            .order('nama'),
          supabase
            .from('santri')
            .select('id, nama, nis, kelas_id')
            .eq('kelompok_id', kelompokId)
            .is('deleted_at', null)
            .order('nama'),
        ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);
      setKelasList((dKelas ?? []) as unknown as Kelas[]);
      setGuruList((dGuru ?? []) as unknown as Guru[]);
      setSantri((dSantri ?? []) as unknown as Santri[]);
      setTerpilih(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat data kelas.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaGuru = useMemo(() => {
    const peta = new Map(guruList.map((g) => [g.id, g.nama]));
    return (id: number | null) => (id != null ? (peta.get(id) ?? '-') : '—');
  }, [guruList]);

  const namaKategori = useMemo(() => {
    const peta = new Map(kategoriList.map((k) => [k.id, k.nama]));
    return (id: number) => peta.get(id) ?? '-';
  }, [kategoriList]);

  /* Jumlah santri dihitung dari data sungguhan, bukan dari kolom
     `santri_count` — kolom itu peninggalan ETL dan tidak dijaga trigger apa
     pun, jadi bisa berbeda dari kenyataan. */
  const jumlahSantriKelas = useMemo(() => {
    const peta = new Map<number, number>();
    for (const s of santri) {
      if (s.kelas_id != null) peta.set(s.kelas_id, (peta.get(s.kelas_id) ?? 0) + 1);
    }
    return peta;
  }, [santri]);

  const santriTampil = useMemo(
    () => (saringPenempatan === 'belum' ? santri.filter((s) => s.kelas_id == null) : santri),
    [santri, saringPenempatan]
  );

  async function simpanKelas(isi: Record<string, unknown>) {
    if (!kelompokId) return;
    const { error: err } = sedangDiubah
      ? await supabase.from('kelas').update(isi).eq('id', sedangDiubah.id)
      : await supabase.from('kelas').insert({
          ...isi,
          kelompok_id: kelompokId,
          santri_count: 0,
          created_by: profile?.id ?? null,
        });
    if (err) throw new Error(err.message);
    setFormTerbuka(false);
    setPesan(sedangDiubah ? 'Kelas diperbarui.' : 'Kelas ditambahkan.');
    await muat();
  }

  async function hapusKelas(k: Kelas) {
    const jumlah = jumlahSantriKelas.get(k.id) ?? 0;
    if (jumlah > 0) {
      setError(`Kelas "${k.nama}" masih berisi ${jumlah} santri. Pindahkan dulu sebelum menghapus.`);
      return;
    }
    if (!window.confirm(`Hapus kelas "${k.nama}"?`)) return;
    setError(null);
    setPesan(null);
    try {
      /* Hapus HALUS: kelas dirujuk jurnal_kbm dan absensi lewat santri,
         jadi menghilangkannya sungguhan akan memutus riwayat. */
      const { error: err } = await supabase
        .from('kelas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', k.id);
      if (err) throw new Error(err.message);
      setPesan(`Kelas "${k.nama}" dihapus.`);
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus kelas.');
    }
  }

  async function tempatkan() {
    if (terpilih.size === 0) return;
    setSibuk(true);
    setError(null);
    setPesan(null);
    try {
      const tujuan = kelasTujuan ? Number(kelasTujuan) : null;
      const { error: err } = await supabase
        .from('santri')
        .update({ kelas_id: tujuan })
        .in('id', [...terpilih]);
      if (err) throw new Error(err.message);
      setPesan(
        tujuan
          ? `${terpilih.size} santri ditempatkan ke ${kelasList.find((k) => k.id === tujuan)?.nama}.`
          : `${terpilih.size} santri dikeluarkan dari kelasnya.`
      );
      await muat();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menempatkan santri.');
    } finally {
      setSibuk(false);
    }
  }

  const belumDitempatkan = santri.filter((s) => s.kelas_id == null).length;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-2 text-[24px] font-bold text-text">Kelas</h1>
      <p className="mb-6 text-[13px] text-text-dim">
        Daftar kelas pengajian dan penempatan santri ke dalamnya.
      </p>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[240px] flex-1">
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
        {bolehTulis && kelompokId && (
          <button
            onClick={() => {
              setSedangDiubah(null);
              setFormTerbuka(true);
            }}
            className={KELAS_TOMBOL_UTAMA}
          >
            + Tambah Kelas
          </button>
        )}
      </div>

      {pesan && <p className="mb-4 text-[13px] text-sage">{pesan}</p>}
      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
      {loading && <p className="text-[13px] text-text-dim">Memuat...</p>}
      {!kelompokId && <p className="text-[13px] text-text-dim">Pilih kelompok dulu.</p>}

      {kelompokId && !loading && (
        <>
          {kelasList.length === 0 ? (
            <p className="mb-8 text-[13px] text-text-dim">
              Kelompok ini belum punya kelas. Tambahkan dulu supaya santri bisa ditempatkan dan
              jurnal KBM bisa diisi.
            </p>
          ) : (
            <div className="mb-8 overflow-x-auto rounded-card border border-border bg-panel shadow-[var(--shadow-card)]">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="border-b border-border bg-panel-2">
                  <tr>
                    {['Kelas', 'Kategori', 'Jam', 'Ruangan', 'Guru', 'Santri', 'Status'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-[12px] font-semibold tracking-[0.3px] text-text-dim uppercase"
                      >
                        {h}
                      </th>
                    ))}
                    {bolehTulis && <th className="px-3 py-3"></th>}
                  </tr>
                </thead>
                <tbody>
                  {kelasList.map((k) => (
                    <tr key={k.id} className="hover:bg-panel-2">
                      <td className="border-b border-border px-3 py-3 font-semibold text-text">{k.nama}</td>
                      <td className="border-b border-border px-3 py-3 text-text">
                        {namaKategori(k.kategori_kbm_id)}
                      </td>
                      <td className="border-b border-border px-3 py-3 text-text">
                        {keJam(k.jam_mulai)}–{keJam(k.jam_selesai)}
                      </td>
                      <td className="border-b border-border px-3 py-3 text-text">{k.ruangan}</td>
                      <td className="border-b border-border px-3 py-3 text-text">
                        {namaKategori(k.kategori_kbm_id) === KATEGORI_REMAJA_PRA_NIKAH
                          ? `${k.hari_ngaji?.join(', ') ?? '-'} · Ketua: ${namaGuru(k.guru_id) === '—' ? 'belum ditentukan' : namaGuru(k.guru_id)}`
                          : namaGuru(k.guru_id)}
                      </td>
                      <td className="border-b border-border px-3 py-3 text-text">
                        {jumlahSantriKelas.get(k.id) ?? 0}
                      </td>
                      <td className="border-b border-border px-3 py-3 text-text">
                        {k.status === 'aktif' ? 'Aktif' : 'Tidak Aktif'}
                      </td>
                      {bolehTulis && (
                        <td className="border-b border-border px-3 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setSedangDiubah(k);
                                setFormTerbuka(true);
                              }}
                              className={KELAS_TOMBOL_SEKUNDER}
                            >
                              Ubah
                            </button>
                            <button onClick={() => hapusKelas(k)} className={KELAS_TOMBOL_SEKUNDER + ' text-red'}>
                              Hapus
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Penempatan santri ── */}
          {bolehTulis && kelasList.length > 0 && (
            <div className="rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)]">
              <div className="mb-1 text-[15px] font-bold text-text">Penempatan Santri</div>
              <p className="mb-4 text-[12px] text-text-dim">
                {belumDitempatkan} dari {santri.length} santri belum punya kelas. Selama belum
                ditempatkan, jurnal KBM tidak bisa diisi untuk mereka dan absensi belum bisa dipecah
                per kelas.
              </p>

              <div className="mb-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className={KELAS_LABEL}>Tampilkan</label>
                  <select
                    className={KELAS_INPUT}
                    value={saringPenempatan}
                    onChange={(e) => setSaringPenempatan(e.target.value as 'belum' | 'semua')}
                  >
                    <option value="belum">Belum punya kelas</option>
                    <option value="semua">Semua santri</option>
                  </select>
                </div>
                <div className="min-w-[200px]">
                  <label className={KELAS_LABEL}>Tempatkan ke</label>
                  <select
                    className={KELAS_INPUT}
                    value={kelasTujuan}
                    onChange={(e) => setKelasTujuan(e.target.value)}
                  >
                    <option value="">-- Keluarkan dari kelas --</option>
                    {kelasList.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nama}
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={tempatkan} disabled={terpilih.size === 0 || sibuk} className={KELAS_TOMBOL_UTAMA}>
                  Terapkan ke {terpilih.size} santri
                </button>
              </div>

              {santriTampil.length === 0 ? (
                <p className="text-[13px] text-sage">Semua santri sudah punya kelas.</p>
              ) : (
                <>
                  <button
                    onClick={() =>
                      setTerpilih((s) =>
                        s.size === santriTampil.length ? new Set() : new Set(santriTampil.map((x) => x.id))
                      )
                    }
                    className={KELAS_TOMBOL_SEKUNDER + ' mb-3'}
                  >
                    {terpilih.size === santriTampil.length ? 'Batalkan semua' : 'Pilih semua yang tampil'}
                  </button>
                  <div className="max-h-[360px] overflow-y-auto rounded-[var(--radius)] border border-border">
                    {santriTampil.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 text-[13px] text-text last:border-b-0 hover:bg-panel-2"
                      >
                        <input
                          type="checkbox"
                          checked={terpilih.has(s.id)}
                          onChange={(e) =>
                            setTerpilih((prev) => {
                              const baru = new Set(prev);
                              if (e.target.checked) baru.add(s.id);
                              else baru.delete(s.id);
                              return baru;
                            })
                          }
                        />
                        <span className="flex-1">
                          {s.nama}
                          {s.nis ? <span className="ml-2 text-[11px] text-text-faint">{s.nis}</span> : null}
                        </span>
                        <span className="text-[11px] text-text-dim">
                          {s.kelas_id != null
                            ? (kelasList.find((k) => k.id === s.kelas_id)?.nama ?? '-')
                            : 'belum ada kelas'}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {formTerbuka && (
        <KelasForm
          awal={sedangDiubah}
          kategoriList={kategoriList}
          guruList={guruList}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpanKelas}
        />
      )}
    </div>
  );
}

/* Cabang mobile admin_kelompok (2026-08-26, diminta owner: "Data Kelas"
   di hub Data Master) -- pola SAMA PERSIS /guru & /santri: tabel+grid
   penempatan santri desktop tidak cocok di layar sempit, jadi
   admin_kelompok di HP melihat KelasKelpMobile.tsx (kartu, fungsinya
   dipersempit ke tambah/ubah kelas + tetapkan guru pengampu saja --
   TANPA penempatan santri massal, lihat komentar di file itu). */
function KelasPageContent() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();

  if (profile?.role === 'admin_kelompok' && isMobile) {
    return <KelasKelpMobile />;
  }

  return <KelasContent />;
}

export default function KelasPage() {
  return (
    <RequireAuth>
      <KelasPageContent />
    </RequireAuth>
  );
}
