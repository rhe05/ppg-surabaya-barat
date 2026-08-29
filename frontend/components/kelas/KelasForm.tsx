'use client';

/* Form tambah/ubah kelas — dipindah dari app/kelas/page.tsx (2026-08-26)
   supaya bisa dipakai ulang di KelasKelpMobile.tsx (kartu Data Kelas
   admin_kelompok mobile, dibuka dari /data-master), sama pola dgn
   components/guru/GuruForm.tsx & components/santri/SantriForm.tsx --
   satu form dipakai desktop (/kelas, tabel) & mobile (kartu). Tidak ada
   perubahan perilaku dari versi lama di app/kelas/page.tsx, murni
   dipindah + diekspor. */

import { useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import JamPicker, { type PosisiJam } from '@/components/ui/JamPicker';
import { JADWAL_KHUSUS_REMAJA_PRA_NIKAH, KATEGORI_JENJANG } from '@/lib/kategori';

export type KategoriKbm = { id: number; nama: string };
export type Guru = { id: number; nama: string; kategori: string | null };
export type KelasRow = {
  id: number;
  kelompok_id: number;
  nama: string;
  kategori_kbm_id: number;
  guru_id: number | null;
  guru_id_2: number | null;
  pola_gilir_guru: string | null;
  gilir_mulai: string | null;
  gilir_minggu: number | null;
  jam_mulai: string;
  jam_selesai: string;
  ruangan: string;
  keterangan: string | null;
  santri_count: number;
  status: string;
  hari_ngaji: string[] | null;
};

export const KOLOM_KELAS =
  'id, kelompok_id, nama, kategori_kbm_id, guru_id, guru_id_2, pola_gilir_guru, gilir_mulai, gilir_minggu, jam_mulai, jam_selesai, ruangan, keterangan, santri_count, status, hari_ngaji';

export const STATUS_KELAS = ['aktif', 'tidak_aktif'];

/* Kategori "Remaja Pra Nikah" (2026-08-26, diminta owner, migrasi
   20260826150000_kategori_remaja_pra_nikah.sql) py sifat khusus yang
   TIDAK berlaku kategori lain:
   1. Jadwal mingguannya TETAP Selasa/Rabu/Kamis/Jumat -- checklist di
      bawah Ruangan (kolom kelas.hari_ngaji), bukan cuma satu jam tetap.
   2. TIDAK py "Guru Pengampu" harian tetap (gurunya gilir beda2 tiap
      hari ngaji) -- diganti dropdown "Ketua Muda-i" (2026-08-26,
      putaran kedua): koordinator kelas ini, BUKAN guru harian. Field
      ini masih guru_id yang SAMA di tabel `kelas` (cuma labelnya beda +
      pilihannya disaring ke guru berkategori "Ketua Muda-i" saja --
      lihat KATEGORI di components/guru/GuruForm.tsx), jadi guru dgn
      kategori itu otomatis dapat akses GuruDashboard.tsx mobile utk
      kelas ini begitu ditetapkan, tanpa kode dashboard baru.
   3. Jadwal khusus bulanan (Ngaji Daerahan dkk, lib/kategori.ts::
      JADWAL_KHUSUS_REMAJA_PRA_NIKAH) ditampilkan sbg INFO read-only di
      bawah checklist Hari Ngaji -- daftar TETAP, bukan per-kelas, dan
      SENGAJA belum dihitung jadi tanggal sungguhan/isi absensi (diminta
      owner: "info jadwal saja dulu"). */
export const KATEGORI_REMAJA_PRA_NIKAH = 'Remaja Pra Nikah';
const KATEGORI_KETUA_MUDAI = 'Ketua Muda-i';
const HARI_NGAJI_OPSI = ['Selasa', 'Rabu', 'Kamis', 'Jumat'];

const keJam = (v: string | null) => (v ? v.slice(0, 5) : '');

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

export default function KelasForm({
  awal,
  kategoriList,
  guruList,
  onBatal,
  onSimpan,
}: {
  awal: KelasRow | null;
  kategoriList: KategoriKbm[];
  guruList: Guru[];
  onBatal: () => void;
  onSimpan: (isi: Record<string, unknown>) => Promise<void>;
}) {
  const [nama, setNama] = useState(awal?.nama ?? '');
  const [kategoriId, setKategoriId] = useState(awal ? String(awal.kategori_kbm_id) : '');
  const [guruId, setGuruId] = useState(awal?.guru_id != null ? String(awal.guru_id) : '');
  const [guruId2, setGuruId2] = useState(awal?.guru_id_2 != null ? String(awal.guru_id_2) : '');
  const [polaGilir, setPolaGilir] = useState(awal?.pola_gilir_guru ?? '');
  const [gilirMulai, setGilirMulai] = useState(awal?.gilir_mulai ?? '');
  const [gilirMinggu, setGilirMinggu] = useState(String(awal?.gilir_minggu ?? 2));
  const [mulai, setMulai] = useState(keJam(awal?.jam_mulai ?? null) || '15:45');
  const [selesai, setSelesai] = useState(keJam(awal?.jam_selesai ?? null) || '16:30');
  const [ruangan, setRuangan] = useState(awal?.ruangan ?? '');
  const [keterangan, setKeterangan] = useState(awal?.keterangan ?? '');
  const [status, setStatus] = useState(awal?.status ?? 'aktif');
  const [hariNgaji, setHariNgaji] = useState<string[]>(awal?.hari_ngaji ?? []);
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Jam mulai/selesai pakai JamPicker melayang, bukan <input type="time">
     bawaan browser -- tampilannya beda-beda tiap perangkat (2026-08-29,
     diminta owner). Pola pemicu+posisi menyalin GabungKelasModal.tsx. */
  const [jamAktif, setJamAktif] = useState<'mulai' | 'selesai' | null>(null);
  const [posJam, setPosJam] = useState<PosisiJam | null>(null);
  const refJamMulai = useRef<HTMLButtonElement>(null);
  const refJamSelesai = useRef<HTMLButtonElement>(null);

  function bukaJam(f: 'mulai' | 'selesai', ref: React.RefObject<HTMLButtonElement | null>) {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPosJam({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setJamAktif(f);
  }

  /* Dropdown kategori dibatasi kategori JENJANG. Sisi lain dari tabel
     kategori_kbm berisi mata pelajaran kurikulum yang tidak berlaku di
     sini — lihat lib/kategori.ts. */
  const kategoriJenjang = kategoriList.filter((k) => KATEGORI_JENJANG.includes(k.nama));
  const namaKategoriTerpilih = kategoriList.find((k) => String(k.id) === kategoriId)?.nama;
  const isRemajaPraNikah = namaKategoriTerpilih === KATEGORI_REMAJA_PRA_NIKAH;
  const guruKetuaMudai = guruList.filter((g) => g.kategori === KATEGORI_KETUA_MUDAI);

  function ubahKategori(idBaru: string) {
    setKategoriId(idBaru);
    /* Ganti kategori = daftar guru yang relevan berubah (Guru Pengampu
       biasa <-> Ketua Muda-i) -- guru_id lama dikosongkan supaya tidak
       diam-diam ikut tersimpan sbg kategori yang salah. */
    setGuruId('');
    setGuruId2('');
    setPolaGilir('');
  }

  function toggleHari(hari: string) {
    setHariNgaji((s) => (s.includes(hari) ? s.filter((h) => h !== hari) : [...s, hari]));
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nama.trim()) return setError('Nama kelas wajib diisi.');
    if (!kategoriId) return setError('Kategori wajib dipilih.');
    if (!mulai || !selesai) return setError('Jam mulai dan selesai wajib diisi.');
    if (!ruangan.trim()) return setError('Ruangan wajib diisi.');
    if (isRemajaPraNikah && hariNgaji.length === 0) return setError('Pilih minimal satu hari ngaji.');
    if (!isRemajaPraNikah && guruId2 && guruId2 === guruId)
      return setError('Guru Pengampu 2 tidak boleh sama dengan Guru Pengampu.');

    setMenyimpan(true);
    try {
      await onSimpan({
        nama: nama.trim(),
        kategori_kbm_id: Number(kategoriId),
        guru_id: guruId ? Number(guruId) : null,
        guru_id_2: !isRemajaPraNikah && guruId2 ? Number(guruId2) : null,
        pola_gilir_guru: !isRemajaPraNikah && guruId2 ? polaGilir.trim() || null : null,
        gilir_mulai: !isRemajaPraNikah && guruId2 && gilirMulai ? gilirMulai : null,
        gilir_minggu: !isRemajaPraNikah && guruId2 && gilirMulai ? Number(gilirMinggu) : null,
        jam_mulai: mulai,
        jam_selesai: selesai,
        ruangan: ruangan.trim(),
        keterangan: keterangan.trim() || null,
        status,
        hari_ngaji: isRemajaPraNikah ? hariNgaji : null,
      });
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <JamPicker
        terbuka={jamAktif !== null}
        posisi={posJam}
        nilai={jamAktif === 'selesai' ? selesai : mulai}
        onPilih={(v) => (jamAktif === 'mulai' ? setMulai(v) : setSelesai(v))}
        onTutup={() => setJamAktif(null)}
      />
      <form
        onSubmit={simpan}
        className="my-8 w-full max-w-2xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]"
      >
        <h2 className="mb-6 text-[20px] font-bold text-text">{awal ? 'Ubah Kelas' : 'Tambah Kelas'}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={KELAS_LABEL}>Nama Kelas *</label>
            <input
              className={KELAS_INPUT}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Misal: 1A, 2 & 3A, PAUD/TK B"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kategori *</label>
            <select
              className={KELAS_INPUT}
              value={kategoriId}
              onChange={(e) => ubahKategori(e.target.value)}
            >
              <option value="">-- Pilih Kategori --</option>
              {kategoriJenjang.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
          {isRemajaPraNikah ? (
            <div>
              <label className={KELAS_LABEL}>Ketua Muda-i</label>
              <select className={KELAS_INPUT} value={guruId} onChange={(e) => setGuruId(e.target.value)}>
                <option value="">-- Belum ditentukan --</option>
                {guruKetuaMudai.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nama}
                  </option>
                ))}
              </select>
              {guruKetuaMudai.length === 0 && (
                <p className="mt-1.5 text-[11.5px] text-text-faint">
                  Belum ada guru berkategori "Ketua Muda-i" di kelompok ini. Tambahkan lewat Data Guru
                  dulu.
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className={KELAS_LABEL}>Guru Pengampu</label>
                <select className={KELAS_INPUT} value={guruId} onChange={(e) => setGuruId(e.target.value)}>
                  <option value="">-- Belum ditentukan --</option>
                  {guruList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nama}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={KELAS_LABEL}>Guru Pengampu 2 (gilir)</label>
                <select
                  className={KELAS_INPUT}
                  value={guruId2}
                  onChange={(e) => setGuruId2(e.target.value)}
                >
                  <option value="">-- Tidak ada (satu guru saja) --</option>
                  {guruList
                    .filter((g) => String(g.id) !== guruId)
                    .map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nama}
                      </option>
                    ))}
                </select>
              </div>
              {guruId2 && (
                <>
                  <div>
                    <label className={KELAS_LABEL}>Giliran Berganti Tiap</label>
                    <select
                      className={KELAS_INPUT}
                      value={gilirMinggu}
                      onChange={(e) => setGilirMinggu(e.target.value)}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} minggu
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={KELAS_LABEL}>Mulai Giliran Guru Pertama *</label>
                    <input
                      type="date"
                      className={KELAS_INPUT}
                      value={gilirMulai}
                      onChange={(e) => setGilirMulai(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    {/* Tanpa tanggal acuan, mustahil tahu "minggu siapa" --
                        karena itu perhitungan otomatisnya baru menyala kalau
                        tanggal ini diisi (diminta owner 2026-08-28, mengganti
                        pendekatan "info saja" 27 Agt). */}
                    <p className="mb-3 rounded-[var(--radius)] bg-[rgba(5,150,105,0.08)] px-3 py-2 text-[11.5px] leading-snug text-sage">
                      {gilirMulai
                        ? 'Pengumuman Jadwal KBM akan otomatis menampilkan guru yang benar-benar giliran pada tanggal tersebut.'
                        : 'Isi tanggal mulai giliran supaya sistem bisa menghitung sendiri siapa yang mengajar. Dikosongkan = tetap memakai guru pertama.'}
                    </p>
                    <label className={KELAS_LABEL}>Catatan Pola Gilir</label>
                    <input
                      className={KELAS_INPUT}
                      value={polaGilir}
                      onChange={(e) => setPolaGilir(e.target.value)}
                      placeholder="Misal: kalau tanggal merah digeser minggu berikutnya"
                    />
                  </div>
                </>
              )}
            </>
          )}
          <div>
            <label className={KELAS_LABEL}>Ruangan *</label>
            <input
              className={KELAS_INPUT}
              value={ruangan}
              onChange={(e) => setRuangan(e.target.value)}
              placeholder="Misal: Masjid Lt 1"
            />
          </div>
          {isRemajaPraNikah && (
            <div className="sm:col-span-2">
              <label className={KELAS_LABEL}>Hari Ngaji *</label>
              <p className="mb-2 text-[11.5px] text-text-faint">
                Remaja Pra Nikah tidak punya satu guru harian tetap -- gurunya gilir tiap hari, jadi
                dipilih berdasarkan hari ngajinya, bukan satu guru.
              </p>
              <div className="flex flex-wrap gap-2">
                {HARI_NGAJI_OPSI.map((h) => {
                  const dipilih = hariNgaji.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => toggleHari(h)}
                      className={`cursor-pointer rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 text-[13px] font-bold transition-all duration-150 active:scale-[0.96] ${
                        dipilih ? 'border-indigo bg-[#EEF2FF] text-indigo' : 'border-border bg-panel text-text'
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-card border border-border bg-panel-2 p-3.5">
                <div className="mb-2 text-[12px] font-bold text-text-dim uppercase">
                  Jadwal Khusus Bulanan
                </div>
                <div className="flex flex-col gap-1.5">
                  {JADWAL_KHUSUS_REMAJA_PRA_NIKAH.map((j) => (
                    <div key={j.nama} className="flex items-center justify-between gap-3 text-[12.5px]">
                      <span className="font-semibold text-text">{j.nama}</span>
                      <span className="text-text-dim">
                        {j.hari} minggu ke-{j.mingguKe}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-text-faint">
                  Info jadwal saja -- tanggal sungguhannya beda tiap bulan, belum bisa diisi absensi
                  dari sini.
                </p>
              </div>
            </div>
          )}
          <div>
            <label className={KELAS_LABEL}>Jam Mulai *</label>
            <button
              type="button"
              ref={refJamMulai}
              onClick={() => bukaJam('mulai', refJamMulai)}
              className={`${KELAS_INPUT} flex items-center justify-between text-left tabular-nums`}
            >
              {mulai || <span className="text-text-faint">Pilih jam</span>}
              <Clock size={14} className="shrink-0 text-text-faint" />
            </button>
          </div>
          <div>
            <label className={KELAS_LABEL}>Jam Selesai *</label>
            <button
              type="button"
              ref={refJamSelesai}
              onClick={() => bukaJam('selesai', refJamSelesai)}
              className={`${KELAS_INPUT} flex items-center justify-between text-left tabular-nums`}
            >
              {selesai || <span className="text-text-faint">Pilih jam</span>}
              <Clock size={14} className="shrink-0 text-text-faint" />
            </button>
          </div>
          <div>
            <label className={KELAS_LABEL}>Status</label>
            <select className={KELAS_INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_KELAS.map((s) => (
                <option key={s} value={s}>
                  {s === 'aktif' ? 'Aktif' : 'Tidak Aktif'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Keterangan</label>
            <input
              className={KELAS_INPUT}
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-[13px] text-red">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onBatal} className={KELAS_TOMBOL_SEKUNDER + ' px-4 py-2.5 text-[13px]'}>
            Batal
          </button>
          <button type="submit" disabled={menyimpan} className={KELAS_TOMBOL_UTAMA}>
            {menyimpan ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}
