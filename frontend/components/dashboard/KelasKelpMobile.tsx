'use client';

/* "Data Kelas" — mobile admin_kelompok (2026-08-26), dibuka dari hub
   Data Master (app/data-master/page.tsx). Fungsi utamanya persis
   "Daftar Kelas" desktop (app/kelas/page.tsx): tambah/ubah kelas TERMASUK
   menetapkan Guru Pengampu-nya (dropdown "Guru Pengampu" di
   components/kelas/KelasForm.tsx, form yang SAMA dipakai desktop, bukan
   diduplikasi), DITAMBAH "Penempatan Santri" massal (2026-08-26, putaran
   kedua: owner minta ditambahkan lagi, semula sengaja dilewatkan) --
   kartu collapsible di bawah daftar kelas, pola centang+terapkan SAMA
   PERSIS logikanya dgn app/kelas/page.tsx (query & RPC identik, cuma
   kartu vertikal bukan grid checkbox desktop). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import AdminHeader from '@/components/dashboard/AdminHeader';
import KelasForm, {
  KATEGORI_REMAJA_PRA_NIKAH,
  KOLOM_KELAS,
  type Guru,
  type KategoriKbm,
  type KelasRow,
} from '@/components/kelas/KelasForm';

type SantriRingkas = { id: number; nama: string; nis: string | null; kelas_id: number | null };

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

export default function KelasKelpMobile() {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;

  const [kategoriList, setKategoriList] = useState<KategoriKbm[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [kelasList, setKelasList] = useState<KelasRow[]>([]);
  const [santriList, setSantriList] = useState<SantriRingkas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cari, setCari] = useState('');

  const [formTerbuka, setFormTerbuka] = useState(false);
  const [kelasDiubah, setKelasDiubah] = useState<KelasRow | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  /* Penempatan Santri massal */
  const [penempatanTerbuka, setPenempatanTerbuka] = useState(false);
  const [terpilih, setTerpilih] = useState<Set<number>>(new Set());
  const [kelasTujuan, setKelasTujuan] = useState('');
  const [saringPenempatan, setSaringPenempatan] = useState<'belum' | 'semua'>('belum');
  const [sibukPenempatan, setSibukPenempatan] = useState(false);

  const muat = useCallback(async () => {
    if (!kelompokId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: dKat }, { data: dGuru, error: eGuru }, { data: dKelas, error: eKelas }, { data: dSantri, error: eSantri }] =
        await Promise.all([
          supabase.from('kategori_kbm').select('id, nama'),
          supabase
            .from('guru')
            .select('id, nama, kategori')
            .eq('kelompok_id', kelompokId)
            .is('deleted_at', null)
            .order('nama'),
          supabase
            .from('kelas')
            .select(KOLOM_KELAS)
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
      if (eGuru) throw new Error(eGuru.message);
      if (eKelas) throw new Error(eKelas.message);
      if (eSantri) throw new Error(eSantri.message);
      setKategoriList((dKat ?? []) as unknown as KategoriKbm[]);
      setGuruList((dGuru ?? []) as unknown as Guru[]);
      setKelasList((dKelas ?? []) as unknown as KelasRow[]);
      setSantriList((dSantri ?? []) as unknown as SantriRingkas[]);
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
    return (id: number | null) => (id != null ? (peta.get(id) ?? '-') : null);
  }, [guruList]);

  const namaKategori = useMemo(() => {
    const peta = new Map(kategoriList.map((k) => [k.id, k.nama]));
    return (id: number) => peta.get(id) ?? '-';
  }, [kategoriList]);

  const kelasTersaring = useMemo(() => {
    const term = cari.trim().toLowerCase();
    if (!term) return kelasList;
    return kelasList.filter(
      (k) => k.nama.toLowerCase().includes(term) || (namaGuru(k.guru_id) ?? '').toLowerCase().includes(term),
    );
  }, [kelasList, cari, namaGuru]);

  const belumDitempatkan = useMemo(() => santriList.filter((s) => s.kelas_id == null).length, [santriList]);
  const santriTampilPenempatan = useMemo(
    () => (saringPenempatan === 'belum' ? santriList.filter((s) => s.kelas_id == null) : santriList),
    [santriList, saringPenempatan],
  );

  function toggleTerpilih(id: number) {
    setTerpilih((s) => {
      const baru = new Set(s);
      if (baru.has(id)) baru.delete(id);
      else baru.add(id);
      return baru;
    });
  }

  async function tempatkan() {
    if (terpilih.size === 0) return;
    setSibukPenempatan(true);
    setError(null);
    try {
      const tujuan = kelasTujuan ? Number(kelasTujuan) : null;
      const { error: err } = await supabase.from('santri').update({ kelas_id: tujuan }).in('id', [...terpilih]);
      if (err) throw new Error(err.message);
      const jumlah = terpilih.size;
      await muat();
      setPesan(
        tujuan
          ? `${jumlah} santri ditempatkan ke ${kelasList.find((k) => k.id === tujuan)?.nama ?? '-'}.`
          : `${jumlah} santri dikeluarkan dari kelasnya.`,
      );
      setTimeout(() => setPesan(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menempatkan santri.');
    } finally {
      setSibukPenempatan(false);
    }
  }

  function bukaTambah() {
    setKelasDiubah(null);
    setFormTerbuka(true);
  }
  function bukaUbah(k: KelasRow) {
    setKelasDiubah(k);
    setFormTerbuka(true);
  }
  async function simpanKelas(isi: Record<string, unknown>) {
    if (!kelompokId) return;
    const { error: err } = kelasDiubah
      ? await supabase.from('kelas').update(isi).eq('id', kelasDiubah.id)
      : await supabase.from('kelas').insert({
          ...isi,
          kelompok_id: kelompokId,
          santri_count: 0,
          created_by: profile?.id ?? null,
        });
    if (err) throw new Error(err.message);
    const baru = kelasDiubah === null;
    setFormTerbuka(false);
    setKelasDiubah(null);
    await muat();
    setPesan(baru ? 'Kelas baru tersimpan.' : 'Perubahan tersimpan.');
    setTimeout(() => setPesan(null), 4000);
  }

  return (
    <main className="min-h-screen bg-bg">
      <AdminHeader judul="Data Kelas" />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-4 pb-10">
        {pesan && (
          <div className="mb-4 rounded-[var(--radius-lg)] border border-indigo bg-[#EEF2FF] px-4 py-3 text-[13px] font-semibold text-indigo">
            {pesan}
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[17px] font-extrabold text-text">Data Kelas ({kelasList.length})</div>
          <button
            type="button"
            aria-label="Tambah Kelas"
            onClick={bukaTambah}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-brass text-white shadow-[0_4px_12px_rgba(217,119,6,0.28)] active:scale-[0.92]"
          >
            <CalendarPlus size={19} strokeWidth={2} />
          </button>
        </div>

        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama kelas atau guru..."
          className="mb-4 w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none"
        />

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}
        {loading && <p className="mb-4 text-[13px] text-text-dim">Memuat...</p>}

        {!loading && kelasTersaring.length === 0 && (
          <p className="text-[13px] text-text-dim">
            {cari.trim() ? 'Tidak ada yang cocok.' : 'Kelompok ini belum punya kelas.'}
          </p>
        )}

        <div className="flex flex-col gap-2.5">
          {kelasTersaring.map((k) => {
            const guru = namaGuru(k.guru_id);
            const remajaPraNikah = namaKategori(k.kategori_kbm_id) === KATEGORI_REMAJA_PRA_NIKAH;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => bukaUbah(k)}
                className="flex items-center justify-between gap-3 rounded-card border border-border bg-panel p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-bold text-text">{k.nama}</div>
                  <div className="mt-0.5 text-[11.5px] text-text-faint">
                    {namaKategori(k.kategori_kbm_id)} · {k.ruangan} · {k.jam_mulai?.slice(0, 5)}–
                    {k.jam_selesai?.slice(0, 5)}
                  </div>
                  <div className="mt-1 text-[11.5px] font-semibold">
                    {remajaPraNikah ? (
                      <span className="text-indigo">
                        {k.hari_ngaji && k.hari_ngaji.length > 0 ? k.hari_ngaji.join(', ') : 'Hari ngaji belum dipilih'}
                        {' · Ketua Muda-i: '}
                        {guru ?? 'belum ditentukan'}
                      </span>
                    ) : guru ? (
                      <span className="text-sage">{guru}</span>
                    ) : (
                      <span className="text-brass">Belum ada guru pengampu</span>
                    )}
                  </div>
                </div>
                {k.status !== 'aktif' && (
                  <span className="shrink-0 rounded-full bg-panel-2 px-2.5 py-1 text-[10.5px] font-bold text-text-dim">
                    Tidak Aktif
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!loading && kelasList.length > 0 && (
          <div className="mt-4 rounded-card border border-border bg-panel shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
            <button
              type="button"
              onClick={() => setPenempatanTerbuka((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 border-none bg-transparent p-4 text-left"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[13px] font-bold text-text">
                  Penempatan Santri
                  {belumDitempatkan > 0 && (
                    <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#FEF3C7] px-[6px] text-[11px] font-bold text-[#92400E]">
                      {belumDitempatkan}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-[11px] text-text-faint">
                  {belumDitempatkan} dari {santriList.length} santri belum punya kelas
                </span>
              </span>
              <ChevronDown
                size={16}
                className={`shrink-0 text-text-faint transition-transform duration-200 ${penempatanTerbuka ? 'rotate-180' : ''}`}
              />
            </button>

            {penempatanTerbuka && (
              <div className="border-t border-border p-4 pt-3.5">
                <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <div>
                    <label className={KELAS_LABEL}>Tempatkan ke</label>
                    <select className={KELAS_INPUT} value={kelasTujuan} onChange={(e) => setKelasTujuan(e.target.value)}>
                      <option value="">-- Keluarkan dari kelas --</option>
                      {kelasList.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nama}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {santriTampilPenempatan.length === 0 ? (
                  <p className="text-[12.5px] text-sage">Semua santri sudah punya kelas.</p>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setTerpilih((s) =>
                          s.size === santriTampilPenempatan.length
                            ? new Set()
                            : new Set(santriTampilPenempatan.map((x) => x.id)),
                        )
                      }
                      className="mb-2.5 cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-3 py-1.5 text-[12px] font-semibold text-text active:scale-[0.97]"
                    >
                      {terpilih.size === santriTampilPenempatan.length ? 'Batalkan semua' : 'Pilih semua yang tampil'}
                    </button>
                    <div className="mb-3 max-h-[300px] overflow-y-auto rounded-[var(--radius)] border border-border">
                      {santriTampilPenempatan.map((s) => (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 text-[13px] text-text last:border-b-0 active:bg-panel-2"
                        >
                          <input
                            type="checkbox"
                            checked={terpilih.has(s.id)}
                            onChange={() => toggleTerpilih(s.id)}
                            className="shrink-0"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {s.nama}
                            {s.nis ? <span className="ml-2 text-[11px] text-text-faint">{s.nis}</span> : null}
                          </span>
                          <span className="shrink-0 text-[11px] text-text-dim">
                            {s.kelas_id != null ? (kelasList.find((k) => k.id === s.kelas_id)?.nama ?? '-') : 'belum ada kelas'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={tempatkan}
                  disabled={terpilih.size === 0 || sibukPenempatan}
                  className="w-full cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
                >
                  {sibukPenempatan ? 'Menerapkan...' : `Terapkan ke ${terpilih.size} santri`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {formTerbuka && (
        <KelasForm
          awal={kelasDiubah}
          kategoriList={kategoriList}
          guruList={guruList}
          onBatal={() => setFormTerbuka(false)}
          onSimpan={simpanKelas}
        />
      )}
    </main>
  );
}
