'use client';

/* Form tambah/ubah guru — 17 field, meniru modalGuruKelp app lama
   (Markup_Screens.html:1805-1935 + saveGuruKelp di Script_Main.html:5468-5487),
   BUKAN modalGuru lama yang cuma 2 field (nama + kategori).
   Daftar field & nilai opsi diambil persis dari sana + serverAddGuru
   (Modul_MaintainGuru.gs:60-120), tidak ada yang ditebak.

   Beda yang disengaja dari app lama:
   - Tidak ada RPC penambah seperti tambah_santri: guru tidak punya NIS
     yang harus dibuat atomik, jadi tambah ditulis lewat .insert() biasa.
     Penahan scope-nya adalah policy guru_insert_admin (migrasi
     20260818090000), bukan fungsi.
   - String kosong disimpan NULL, bukan '' seperti di Sheets.
   - Hapus untuk admin_desa/admin_kelompok bersifat halus (deleted_at),
     sama seperti santri — app lama menghapus permanen. */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { KATEGORI_GURU, labelKategoriGuru } from '@/lib/kategoriGuru';

export type GuruRow = {
  id: number;
  kelompok_id: number | null;
  nama: string;
  kategori: string | null;
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  jenis_kelamin: string | null;
  mulai_mengajar: string | null;
  alamat: string | null;
  nomor_wa: string | null;
  pendidikan: string | null;
  rt: string | null;
  rw: string | null;
  kelurahan: string | null;
  kode_pos: string | null;
  kabupaten_kota: string | null;
  provinsi: string | null;
  kecamatan: string | null;
  lama_mengajar: string | null;
};

export const KOLOM_GURU =
  'id, kelompok_id, nama, kategori, tempat_lahir, tanggal_lahir, jenis_kelamin, ' +
  'mulai_mengajar, alamat, nomor_wa, pendidikan, rt, rw, kelurahan, kode_pos, ' +
  'kabupaten_kota, provinsi, kecamatan, lama_mengajar';

/* "Guru Mutu" dihapus dari pilihan (2026-08-26, diminta owner). Baris
   produksi yang masih berkategori itu tidak dipaksa ganti — cuma tidak
   bisa dipilih ulang lewat dropdown ini sampai penggunanya ganti manual.

   "Ketua Muda-i" ditambahkan (2026-08-26, putaran kedua) -- koordinator
   Remaja Pra Nikah, diminta owner: TETAP kategori guru biasa (bukan
   role baru), jadi otomatis numpang seluruh alur guru yang sudah ada
   (registrasi/klaim akun via registrasi-guru & onboarding, dashboard
   mobile GuruDashboard.tsx, laporan) -- tidak ada kode baru dibutuhkan
   utk itu. Satu-satunya tempat lain yang menyebut kategori ini:
   components/kelas/KelasForm.tsx (dropdown "Ketua Muda-i" pengganti
   "Guru Pengampu" utk kelas kategori Remaja Pra Nikah, cuma
   menampilkan guru berkategori ini). */
const KATEGORI = KATEGORI_GURU;
const PENDIDIKAN = [
  'SD/Sederajat',
  'SMP/Sederajat',
  'SMA/SMK/Sederajat',
  'Pondok Pesantren',
  'D3',
  'S1',
  'S2',
  'S3',
  'Lainnya',
];

type Kelompok = { id: number; nama: string };

const KOSONG = {
  kelompok_id: '',
  nama: '',
  kategori: '',
  jenis_kelamin: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  mulai_mengajar: '',
  pendidikan: '',
  nomor_wa: '',
  alamat: '',
  rt: '',
  rw: '',
  kode_pos: '',
  kelurahan: '',
  kecamatan: '',
  kabupaten_kota: '',
  provinsi: '',
};

type Isian = typeof KOSONG;

function dariBaris(g: GuruRow): Isian {
  return {
    kelompok_id: g.kelompok_id != null ? String(g.kelompok_id) : '',
    nama: g.nama ?? '',
    kategori: g.kategori ?? '',
    jenis_kelamin: g.jenis_kelamin ?? '',
    tempat_lahir: g.tempat_lahir ?? '',
    tanggal_lahir: g.tanggal_lahir ?? '',
    mulai_mengajar: g.mulai_mengajar ?? '',
    pendidikan: g.pendidikan ?? '',
    /* Baris lama bisa menyimpan format apa pun (+62, spasi, tanpa strip)
       -- dirapikan saat dibuka supaya tampilannya seragam. */
    nomor_wa: formatNomorWa(g.nomor_wa ?? ''),
    alamat: g.alamat ?? '',
    rt: g.rt ?? '',
    rw: g.rw ?? '',
    kode_pos: g.kode_pos ?? '',
    kelurahan: g.kelurahan ?? '',
    kecamatan: g.kecamatan ?? '',
    kabupaten_kota: g.kabupaten_kota ?? '',
    provinsi: g.provinsi ?? '',
  };
}

function kosongJadiNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

/* Salinan window.calcDurasiDetail_ (Script_Main.html:5968-5989). Kolom
   lama_mengajar disimpan sbg teks hasil hitung saat baris guru disimpan;
   `tanggalAkhir` opsional (default hari ini) dipakai utk menghitung durasi
   sampai TANGGAL PERISTIWA di Riwayat Guru (guru sudah purna/pindah, tidak
   masuk akal terus bertambah sampai hari ini). */
export function hitungDurasi(tanggalMulai: string, tanggalAkhir?: string): string | null {
  if (!tanggalMulai) return null;
  const mulai = new Date(tanggalMulai);
  if (Number.isNaN(mulai.getTime())) return null;
  const kini = tanggalAkhir ? new Date(tanggalAkhir) : new Date();
  if (Number.isNaN(kini.getTime())) return null;
  if (mulai > kini) return '0 hari';

  let t = kini.getFullYear() - mulai.getFullYear();
  let b = kini.getMonth() - mulai.getMonth();
  let h = kini.getDate() - mulai.getDate();

  if (h < 0) {
    b -= 1;
    h += new Date(kini.getFullYear(), kini.getMonth(), 0).getDate();
  }
  if (b < 0) {
    t -= 1;
    b += 12;
  }

  const bagian: string[] = [];
  if (t > 0) bagian.push(`${t} tahun`);
  if (b > 0) bagian.push(`${b} bulan`);
  if (h > 0 || bagian.length === 0) bagian.push(`${h} hari`);
  return bagian.join(' ');
}

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

/* Nomor WA: hanya angka, digroup 4-4-4 dgn strip -- diketik apa pun,
   karakter non-angka dibuang lalu diformat ulang dari nol setiap kali.
   Sama persis dgn components/santri/SantriForm.tsx. */
function formatNomorWa(v: string): string {
  const digit = v.replace(/\D/g, '');
  return digit.replace(/(\d{4})(?=\d)/g, '$1-');
}

const NAMA_BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];
/* 'YYYY-MM-DD' -> "21 Agu 2026", buat ditampilkan di tombol pemicu
   TanggalPicker (menggantikan <input type="date"> bawaan browser) --
   sama persis dgn components/santri/SantriForm.tsx. */
function formatTanggalTampil(v: string): string {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  return `${String(d).padStart(2, '0')} ${NAMA_BULAN_SINGKAT[m - 1] ?? ''} ${y}`;
}

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-6 rounded-card border border-border bg-panel-2 p-4">
      <legend className="px-2 text-[13px] font-bold text-text">{judul}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function GuruForm({
  guru,
  onSelesai,
  onBatal,
}: {
  guru: GuruRow | null;
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const { profile } = useAuth();
  const modeUbah = guru !== null;

  const [isian, setIsian] = useState<Isian>(guru ? dariBaris(guru) : KOSONG);
  const [kelompok, setKelompok] = useState<Kelompok[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Tanggal Lahir pakai kalender custom (TanggalPicker), bukan
     <input type="date"> bawaan browser yg tampilannya beda-beda tiap
     perangkat (2026-08-29, diminta owner) -- pola sama persis dgn
     components/santri/SantriForm.tsx. */
  const [tglTerbuka, setTglTerbuka] = useState(false);
  const [posisiTgl, setPosisiTgl] = useState<PosisiPicker | null>(null);
  const tglLahirRef = useRef<HTMLButtonElement>(null);

  function bukaTgl() {
    const rect = tglLahirRef.current?.getBoundingClientRect();
    if (rect) setPosisiTgl({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setTglTerbuka(true);
  }

  const kelompokTerkunci = profile?.role === 'admin_kelompok';

  useEffect(() => {
    if (kelompokTerkunci && profile?.scope_kelompok_id != null && !modeUbah) {
      setIsian((s) => ({ ...s, kelompok_id: String(profile.scope_kelompok_id) }));
    }
  }, [kelompokTerkunci, profile?.scope_kelompok_id, modeUbah]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from('kelompok').select('id, nama').order('nama');
      if (!cancelled) setKelompok(data ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function ubah(field: keyof Isian, nilai: string) {
    setIsian((s) => ({ ...s, [field]: nilai }));
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    /* Dua syarat wajib ini persis app lama (Modul_MaintainGuru.gs:73-75):
       nama & kategori. Field lain opsional di sana, jadi opsional di sini. */
    if (!isian.nama.trim()) return setError('Nama wajib diisi.');
    if (!isian.kategori) return setError('Kategori wajib diisi.');
    if (!modeUbah && !isian.kelompok_id) return setError('Kelompok wajib dipilih.');

    const isi = {
      nama: isian.nama.trim(),
      kategori: isian.kategori,
      jenis_kelamin: kosongJadiNull(isian.jenis_kelamin),
      tempat_lahir: kosongJadiNull(isian.tempat_lahir),
      tanggal_lahir: kosongJadiNull(isian.tanggal_lahir),
      mulai_mengajar: kosongJadiNull(isian.mulai_mengajar),
      lama_mengajar: hitungDurasi(isian.mulai_mengajar),
      pendidikan: kosongJadiNull(isian.pendidikan),
      nomor_wa: kosongJadiNull(isian.nomor_wa),
      alamat: kosongJadiNull(isian.alamat),
      rt: kosongJadiNull(isian.rt),
      rw: kosongJadiNull(isian.rw),
      kode_pos: kosongJadiNull(isian.kode_pos),
      kelurahan: kosongJadiNull(isian.kelurahan),
      kecamatan: kosongJadiNull(isian.kecamatan),
      kabupaten_kota: kosongJadiNull(isian.kabupaten_kota),
      provinsi: kosongJadiNull(isian.provinsi),
    };

    setMenyimpan(true);
    try {
      const { error: err } = modeUbah
        ? await supabase.from('guru').update(isi).eq('id', guru.id)
        : await supabase.from('guru').insert({ ...isi, kelompok_id: Number(isian.kelompok_id) });
      if (err) throw new Error(err.message);
      onSelesai();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form
        onSubmit={simpan}
        className="my-8 w-full max-w-3xl rounded-card border border-border bg-panel p-6 shadow-[var(--shadow-card)]"
      >
        <h2 className="mb-6 text-[20px] font-bold text-text">
          {modeUbah ? 'Ubah Guru' : 'Tambah Guru'}
        </h2>

        <TanggalPicker
          terbuka={tglTerbuka}
          posisi={posisiTgl}
          nilai={isian.tanggal_lahir}
          onPilih={(v) => ubah('tanggal_lahir', v)}
          onTutup={() => setTglTerbuka(false)}
        />

        <Bagian judul="Data Pokok">
          <div>
            <label className={KELAS_LABEL}>Kelompok *</label>
            <select
              className={KELAS_INPUT}
              value={isian.kelompok_id}
              disabled={modeUbah || kelompokTerkunci}
              onChange={(e) => ubah('kelompok_id', e.target.value)}
            >
              <option value="">-- Pilih Kelompok --</option>
              {kelompok.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Nama *</label>
            <input
              className={KELAS_INPUT}
              value={isian.nama}
              onChange={(e) => ubah('nama', e.target.value)}
              placeholder="Nama lengkap"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kategori *</label>
            <select
              className={KELAS_INPUT}
              value={isian.kategori}
              onChange={(e) => ubah('kategori', e.target.value)}
            >
              <option value="">-- Pilih Kategori --</option>
              {KATEGORI.map((k) => (
                <option key={k} value={k}>
                  {labelKategoriGuru(k, isian.jenis_kelamin)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Jenis Kelamin</label>
            <select
              className={KELAS_INPUT}
              value={isian.jenis_kelamin}
              onChange={(e) => ubah('jenis_kelamin', e.target.value)}
            >
              <option value="">-- Pilih Jenis Kelamin --</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </div>
          <div>
            <label className={KELAS_LABEL}>Tempat Lahir</label>
            <input
              className={KELAS_INPUT}
              value={isian.tempat_lahir}
              onChange={(e) => ubah('tempat_lahir', e.target.value)}
              placeholder="Misal: Surabaya"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Tanggal Lahir</label>
            <button
              type="button"
              ref={tglLahirRef}
              onClick={bukaTgl}
              className={`${KELAS_INPUT} text-left ${isian.tanggal_lahir ? '' : 'text-text-faint'}`}
            >
              {isian.tanggal_lahir ? formatTanggalTampil(isian.tanggal_lahir) : 'Pilih tanggal'}
            </button>
          </div>
        </Bagian>

        <Bagian judul="Riwayat Mengajar & Pendidikan">
          <div>
            <label className={KELAS_LABEL}>Mulai Mengajar</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={isian.mulai_mengajar}
              onChange={(e) => ubah('mulai_mengajar', e.target.value)}
            />
            {isian.mulai_mengajar && (
              <p className="mt-1.5 text-[12px] text-text-dim">
                Lama mengajar: {hitungDurasi(isian.mulai_mengajar)}
              </p>
            )}
          </div>
          <div>
            <label className={KELAS_LABEL}>Pendidikan</label>
            <select
              className={KELAS_INPUT}
              value={isian.pendidikan}
              onChange={(e) => ubah('pendidikan', e.target.value)}
            >
              <option value="">-- Pilih Pendidikan --</option>
              {PENDIDIKAN.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </Bagian>

        <Bagian judul="Kontak &amp; Alamat">
          <div>
            <label className={KELAS_LABEL}>Nomor WA</label>
            <input
              className={KELAS_INPUT}
              value={isian.nomor_wa}
              onChange={(e) => ubah('nomor_wa', formatNomorWa(e.target.value))}
              placeholder="0812-3456-7890"
              inputMode="numeric"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Alamat</label>
            <input
              className={KELAS_INPUT}
              value={isian.alamat}
              onChange={(e) => ubah('alamat', e.target.value)}
              placeholder="Alamat lengkap domisili saat ini"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>RT</label>
            <input
              className={KELAS_INPUT}
              value={isian.rt}
              onChange={(e) => ubah('rt', e.target.value)}
              placeholder="RT"
              inputMode="numeric"
              maxLength={3}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>RW</label>
            <input
              className={KELAS_INPUT}
              value={isian.rw}
              onChange={(e) => ubah('rw', e.target.value)}
              placeholder="RW"
              inputMode="numeric"
              maxLength={3}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kelurahan</label>
            <input
              className={KELAS_INPUT}
              value={isian.kelurahan}
              onChange={(e) => ubah('kelurahan', e.target.value)}
              placeholder="Nama desa/kelurahan"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kecamatan</label>
            <input
              className={KELAS_INPUT}
              value={isian.kecamatan}
              onChange={(e) => ubah('kecamatan', e.target.value)}
              placeholder="Misal: Sawahan"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kabupaten/Kota</label>
            <input
              className={KELAS_INPUT}
              value={isian.kabupaten_kota}
              onChange={(e) => ubah('kabupaten_kota', e.target.value)}
              placeholder="Misal: Surabaya"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Provinsi</label>
            <input
              className={KELAS_INPUT}
              value={isian.provinsi}
              onChange={(e) => ubah('provinsi', e.target.value)}
              placeholder="Misal: Jawa Timur"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kode Pos</label>
            <input
              className={KELAS_INPUT}
              value={isian.kode_pos}
              onChange={(e) => ubah('kode_pos', e.target.value)}
              placeholder="60123"
              inputMode="numeric"
              maxLength={5}
            />
          </div>
        </Bagian>

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onBatal}
            className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={menyimpan}
            className="cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:opacity-50"
          >
            {menyimpan ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}
