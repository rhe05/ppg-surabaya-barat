'use client';

/* Form tambah/ubah santri — 25 field, meniru form Generus app lama
   (Markup_Screens.html:~2210+), BUKAN modalSantri yang cuma 5 field.
   Daftar field & nilai opsi diambil persis dari sana + serverAddSantri
   (Modul_MaintainSantri.gs:86-172), tidak ada yang ditebak.

   Dua hal yang sengaja berbeda dari app lama:
   - NIS dibuat otomatis oleh RPC tambah_santri (atomik, lihat migrasi
     20260817100000) dan TIDAK bisa diubah, sedangkan app lama
     membiarkannya diketik bebas dan bisa diedit.
   - Kelas Ngaji dipilih dari daftar kelas milik kelompok, bukan diketik
     bebas seperti app lama. Form ini tetap mengirim NAMA kelas (kolom
     kelas_ngaji); kelas_id-nya diturunkan trigger sinkron_santri_kelas
     (migrasi 20260819110000), jadi RPC tambah_santri tidak perlu diubah. */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';

export type SantriRow = {
  id: number;
  kelompok_id: number | null;
  nama: string;
  nama_panggilan: string | null;
  nis: string | null;
  gender: string | null;
  tempat_lahir: string | null;
  tanggal_lahir: string | null;
  jenjang_saat_ini: string | null;
  pendidikan: string | null;
  kelas_sekolah: string | null;
  kelas_ngaji: string | null;
  status_nikah: string | null;
  mulai_ngaji: string | null;
  alamat: string | null;
  rt: string | null;
  rw: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  kabupaten_kota: string | null;
  provinsi: string | null;
  kode_pos: string | null;
  nama_ayah: string | null;
  nama_ibu: string | null;
  nomor_wa: string | null;
  nomor_wa_ayah: string | null;
  nomor_wa_ibu: string | null;
};

/* Kolom yang di-SELECT untuk daftar & form. deleted_at ikut supaya
   pemanggil bisa menyaring baris ter-soft-delete. */
export const KOLOM_SANTRI =
  'id, kelompok_id, nama, nama_panggilan, nis, gender, tempat_lahir, tanggal_lahir, ' +
  'jenjang_saat_ini, pendidikan, kelas_sekolah, kelas_ngaji, status_nikah, mulai_ngaji, ' +
  'alamat, rt, rw, kelurahan, kecamatan, kabupaten_kota, provinsi, kode_pos, ' +
  'nama_ayah, nama_ibu, nomor_wa, nomor_wa_ayah, nomor_wa_ibu';

/* Nilai opsi diambil apa adanya dari Markup_Screens.html. JENJANG harus
   cocok persis dgn enum santri_jenjang, GENDER dgn enum gender_type —
   nilai di luar daftar ini ditolak Postgres. */
const JENJANG = ['PAUD/TK', 'Cabe Rawit', 'Pra Remaja', 'Remaja SMA', 'Remaja'];
const PENDIDIKAN = ['Belum Sekolah', 'PAUD', 'TK', 'SD', 'SMP', 'SMA/SMK', 'Kuliah', 'Lainnya'];
const STATUS_NIKAH = ['Siap Nikah', 'Belum Siap'];

type Kelompok = { id: number; nama: string };
type KelasNgaji = { id: number; nama: string; kelompok_id: number };

const KOSONG = {
  kelompok_id: '',
  nama: '',
  nama_panggilan: '',
  gender: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  jenjang_saat_ini: '',
  pendidikan: '',
  kelas_sekolah: '',
  kelas_ngaji: '',
  status_nikah: '',
  mulai_ngaji: '',
  alamat: '',
  rt: '',
  rw: '',
  kelurahan: '',
  kecamatan: '',
  kabupaten_kota: '',
  provinsi: '',
  kode_pos: '',
  nama_ayah: '',
  nama_ibu: '',
  nomor_wa: '',
  nomor_wa_ayah: '',
  nomor_wa_ibu: '',
};

type Isian = typeof KOSONG;

function dariBaris(s: SantriRow): Isian {
  return {
    kelompok_id: s.kelompok_id != null ? String(s.kelompok_id) : '',
    nama: s.nama ?? '',
    nama_panggilan: s.nama_panggilan ?? '',
    gender: s.gender ?? '',
    tempat_lahir: s.tempat_lahir ?? '',
    tanggal_lahir: s.tanggal_lahir ?? '',
    jenjang_saat_ini: s.jenjang_saat_ini ?? '',
    pendidikan: s.pendidikan ?? '',
    kelas_sekolah: s.kelas_sekolah ?? '',
    kelas_ngaji: s.kelas_ngaji ?? '',
    status_nikah: s.status_nikah ?? '',
    mulai_ngaji: s.mulai_ngaji ?? '',
    alamat: s.alamat ?? '',
    rt: s.rt ?? '',
    rw: s.rw ?? '',
    kelurahan: s.kelurahan ?? '',
    kecamatan: s.kecamatan ?? '',
    kabupaten_kota: s.kabupaten_kota ?? '',
    provinsi: s.provinsi ?? '',
    kode_pos: s.kode_pos ?? '',
    nama_ayah: s.nama_ayah ?? '',
    nama_ibu: s.nama_ibu ?? '',
    nomor_wa: s.nomor_wa ?? '',
    nomor_wa_ayah: s.nomor_wa_ayah ?? '',
    nomor_wa_ibu: s.nomor_wa_ibu ?? '',
  };
}

/* String kosong disimpan sbg NULL, bukan '' — beda dari app lama yang
   menulis '' ke Sheets. Di Postgres NULL lebih tepat untuk "tidak diisi". */
function kosongJadiNull(v: string): string | null {
  const t = v.trim();
  return t === '' ? null : t;
}

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] ' +
  'text-text focus:border-brass focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';
const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text';

function Bagian({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-6 rounded-card border border-border bg-panel-2 p-4">
      <legend className="px-2 text-[13px] font-bold text-text">{judul}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function SantriForm({
  santri,
  kelasNgajiTerkunci,
  onHapus,
  onSelesai,
  onBatal,
}: {
  santri: SantriRow | null;
  /* Dipakai layar Data Generus (guru, mobile): guru masuk lewat SATU kelas
     yang sudah dipilih di layar sebelumnya (KelasGate), jadi field Kelas
     Ngaji dikunci ke situ -- bukan dropdown bebas seperti admin. RLS
     (santri_update_guru, tambah_santri cabang guru -- migrasi 20260821120000)
     tetap menolak kalau kelas ini bukan milik guru yang sedang login, jadi
     penguncian di sini kenyamanan, bukan satu-satunya pengaman. */
  kelasNgajiTerkunci?: string;
  /* Tombol "Hapus" di footer -- HANYA muncul kalau prop ini diberikan (jadi
     admin lewat /santri, yang tidak memberi prop ini, tampilannya sama
     sekali tidak berubah). Dipakai Data Generus guru (app/santri-saya):
     bukan hapus langsung, pemanggilnya yang membuka popup pilihan
     Pindah/Tidak Aktif (RPC nonaktifkan_santri) -- form ini sengaja tidak
     tahu-menahu soal siklus_generus, cuma memberi tombolnya. */
  onHapus?: () => void;
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const { profile } = useAuth();
  const modeUbah = santri !== null;

  const [isian, setIsian] = useState<Isian>(santri ? dariBaris(santri) : KOSONG);
  const [kelompok, setKelompok] = useState<Kelompok[]>([]);
  const [kelasList, setKelasList] = useState<KelasNgaji[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* admin_kelompok & guru terkunci ke kelompoknya sendiri; admin_desa/
     admin_ppg memilih bebas. Pilihan di luar scope tetap ditolak RPC
     tambah_santri, jadi dropdown ini kenyamanan, bukan pengaman. */
  const kelompokTerkunci = profile?.role === 'admin_kelompok' || profile?.role === 'guru';

  useEffect(() => {
    if (kelompokTerkunci && profile?.scope_kelompok_id != null && !modeUbah) {
      setIsian((s) => ({ ...s, kelompok_id: String(profile.scope_kelompok_id) }));
    }
  }, [kelompokTerkunci, profile?.scope_kelompok_id, modeUbah]);

  useEffect(() => {
    if (kelasNgajiTerkunci && !modeUbah) {
      setIsian((s) => ({ ...s, kelas_ngaji: kelasNgajiTerkunci }));
    }
  }, [kelasNgajiTerkunci, modeUbah]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [hasilKelompok, hasilKelas] = await Promise.all([
        supabase.from('kelompok').select('id, nama').order('nama'),
        supabase.from('kelas').select('id, nama, kelompok_id').order('nama'),
      ]);
      if (cancelled) return;
      setKelompok(hasilKelompok.data ?? []);
      setKelasList((hasilKelas.data ?? []) as KelasNgaji[]);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const kelasKelompokIni = kelasList.filter(
    (k) => String(k.kelompok_id) === String(isian.kelompok_id),
  );

  function ubah(field: keyof Isian, nilai: string) {
    setIsian((s) => {
      /* Ganti kelompok = kelas lamanya milik kelompok lain. Dikosongkan di
         sini supaya yang terlihat di layar sama dengan yang akan tersimpan:
         trigger DB juga akan melepasnya (kelas tidak cocok kelompok baru). */
      if (field === 'kelompok_id' && nilai !== s.kelompok_id) {
        return { ...s, kelompok_id: nilai, kelas_ngaji: '' };
      }
      return { ...s, [field]: nilai };
    });
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    /* Wajib mengikuti app lama (Modul_MaintainSantri.gs:96-98), walau
       kolom nis/tanggal_lahir di Postgres sendiri nullable. */
    if (!isian.nama.trim()) return setError('Nama wajib diisi.');
    if (!isian.gender) return setError('Gender wajib diisi.');
    if (!isian.tanggal_lahir) return setError('Tanggal lahir wajib diisi.');
    if (!isian.jenjang_saat_ini) return setError('Jenjang wajib diisi.');
    if (!modeUbah && !isian.kelompok_id) return setError('Kelompok wajib dipilih.');

    setMenyimpan(true);
    try {
      if (modeUbah) {
        /* nis TIDAK ikut di-update — nomor identitas permanen. */
        const patch = {
          nama: isian.nama.trim(),
          gender: isian.gender,
          tanggal_lahir: isian.tanggal_lahir,
          jenjang_saat_ini: isian.jenjang_saat_ini,
          nama_panggilan: kosongJadiNull(isian.nama_panggilan),
          tempat_lahir: kosongJadiNull(isian.tempat_lahir),
          pendidikan: kosongJadiNull(isian.pendidikan),
          kelas_sekolah: kosongJadiNull(isian.kelas_sekolah),
          kelas_ngaji: kosongJadiNull(isian.kelas_ngaji),
          status_nikah: kosongJadiNull(isian.status_nikah),
          mulai_ngaji: kosongJadiNull(isian.mulai_ngaji),
          alamat: kosongJadiNull(isian.alamat),
          rt: kosongJadiNull(isian.rt),
          rw: kosongJadiNull(isian.rw),
          kelurahan: kosongJadiNull(isian.kelurahan),
          kecamatan: kosongJadiNull(isian.kecamatan),
          kabupaten_kota: kosongJadiNull(isian.kabupaten_kota),
          provinsi: kosongJadiNull(isian.provinsi),
          kode_pos: kosongJadiNull(isian.kode_pos),
          nama_ayah: kosongJadiNull(isian.nama_ayah),
          nama_ibu: kosongJadiNull(isian.nama_ibu),
          nomor_wa: kosongJadiNull(isian.nomor_wa),
          nomor_wa_ayah: kosongJadiNull(isian.nomor_wa_ayah),
          nomor_wa_ibu: kosongJadiNull(isian.nomor_wa_ibu),
        };
        const { error: err } = await supabase.from('santri').update(patch).eq('id', santri.id);
        if (err) throw new Error(err.message);
      } else {
        /* Tambah WAJIB lewat RPC, bukan .insert() langsung: NIS harus
           dibuat dan ditulis dalam SATU transaksi, kalau tidak dua admin
           yang menyimpan bersamaan dapat NIS sama (dibuktikan di uji
           konkurensi migrasi 20260817100000). */
        const { error: err } = await supabase.rpc('tambah_santri', {
          p: {
            kelompok_id: Number(isian.kelompok_id),
            nama: isian.nama.trim(),
            gender: isian.gender,
            tanggal_lahir: isian.tanggal_lahir,
            jenjang_saat_ini: isian.jenjang_saat_ini,
            nama_panggilan: isian.nama_panggilan,
            tempat_lahir: isian.tempat_lahir,
            pendidikan: isian.pendidikan,
            kelas_sekolah: isian.kelas_sekolah,
            kelas_ngaji: isian.kelas_ngaji,
            status_nikah: isian.status_nikah,
            mulai_ngaji: isian.mulai_ngaji,
            alamat: isian.alamat,
            rt: isian.rt,
            rw: isian.rw,
            kelurahan: isian.kelurahan,
            kecamatan: isian.kecamatan,
            kabupaten_kota: isian.kabupaten_kota,
            provinsi: isian.provinsi,
            kode_pos: isian.kode_pos,
            nama_ayah: isian.nama_ayah,
            nama_ibu: isian.nama_ibu,
            nomor_wa: isian.nomor_wa,
            nomor_wa_ayah: isian.nomor_wa_ayah,
            nomor_wa_ibu: isian.nomor_wa_ibu,
          },
        });
        if (err) throw new Error(err.message);
      }
      onSelesai();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
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
          {modeUbah ? 'Ubah Santri' : 'Tambah Santri'}
        </h2>

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
            <label className={KELAS_LABEL}>NIS</label>
            <input
              className={KELAS_INPUT + ' opacity-60'}
              value={modeUbah ? (santri.nis ?? '-') : 'Dibuat otomatis saat disimpan'}
              disabled
              readOnly
            />
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
            <label className={KELAS_LABEL}>Nama Panggilan</label>
            <input
              className={KELAS_INPUT}
              value={isian.nama_panggilan}
              onChange={(e) => ubah('nama_panggilan', e.target.value)}
              placeholder="Misal: Budi"
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Jenis Kelamin *</label>
            <div className="flex gap-5 pt-1.5 text-[13px] text-text">
              {[
                { v: 'L', t: 'Laki-laki' },
                { v: 'P', t: 'Perempuan' },
              ].map((o) => (
                <label key={o.v} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="gender"
                    value={o.v}
                    checked={isian.gender === o.v}
                    onChange={(e) => ubah('gender', e.target.value)}
                  />
                  {o.t}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={KELAS_LABEL}>Jenjang *</label>
            <select
              className={KELAS_INPUT}
              value={isian.jenjang_saat_ini}
              onChange={(e) => ubah('jenjang_saat_ini', e.target.value)}
            >
              <option value="">-- Pilih Jenjang --</option>
              {JENJANG.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
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
            <label className={KELAS_LABEL}>Tanggal Lahir *</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={isian.tanggal_lahir}
              onChange={(e) => ubah('tanggal_lahir', e.target.value)}
            />
          </div>
        </Bagian>

        <Bagian judul="Pendidikan & Ngaji">
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
          <div>
            <label className={KELAS_LABEL}>Kelas Sekolah</label>
            <input
              className={KELAS_INPUT}
              value={isian.kelas_sekolah}
              onChange={(e) => ubah('kelas_sekolah', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kelas Ngaji</label>
            {/* Dulu kolom teks bebas: apa pun yang diketik tersimpan sebagai
                teks dan TIDAK pernah menjadi kelas_id, sehingga santri baru
                selalu lahir tanpa kelas dan absensinya tidak bisa dihitung
                per kelas. Sekarang pilihannya dikunci ke kelas milik kelompok
                yang dipilih; trigger sinkron_santri_kelas (migrasi
                20260819110000) yang menurunkan kelas_id dari nama itu. */}
            <select
              className={KELAS_INPUT}
              value={isian.kelas_ngaji}
              disabled={!isian.kelompok_id || !!kelasNgajiTerkunci}
              onChange={(e) => ubah('kelas_ngaji', e.target.value)}
            >
              <option value="">
                {isian.kelompok_id ? '— belum ditentukan —' : 'Pilih kelompok dulu'}
              </option>
              {kelasKelompokIni.map((k) => (
                <option key={k.id} value={k.nama}>
                  {k.nama}
                </option>
              ))}
              {/* Nilai lama yang tidak ada di daftar kelas tetap ditampilkan,
                  supaya membuka form santri lama tidak diam-diam menghapus
                  kelasnya saat disimpan ulang. */}
              {isian.kelas_ngaji && !kelasKelompokIni.some((k) => k.nama === isian.kelas_ngaji) && (
                <option value={isian.kelas_ngaji}>{isian.kelas_ngaji} (di luar daftar)</option>
              )}
            </select>
            {isian.kelompok_id && kelasKelompokIni.length === 0 && (
              <p className="mt-1 text-[11.5px] text-text-faint">
                Kelompok ini belum punya kelas. Buat kelasnya dulu di halaman Daftar Kelas.
              </p>
            )}
          </div>
          <div>
            <label className={KELAS_LABEL}>Mulai Ngaji</label>
            <input
              type="date"
              className={KELAS_INPUT}
              value={isian.mulai_ngaji}
              onChange={(e) => ubah('mulai_ngaji', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Status Kesiapan</label>
            <select
              className={KELAS_INPUT}
              value={isian.status_nikah}
              onChange={(e) => ubah('status_nikah', e.target.value)}
            >
              <option value="">-- Pilih Status --</option>
              {STATUS_NIKAH.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </Bagian>

        <Bagian judul="Orang Tua & Kontak">
          <div>
            <label className={KELAS_LABEL}>Nama Ayah</label>
            <input
              className={KELAS_INPUT}
              value={isian.nama_ayah}
              onChange={(e) => ubah('nama_ayah', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Nama Ibu</label>
            <input
              className={KELAS_INPUT}
              value={isian.nama_ibu}
              onChange={(e) => ubah('nama_ibu', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Nomor WA Santri</label>
            <input
              className={KELAS_INPUT}
              value={isian.nomor_wa}
              onChange={(e) => ubah('nomor_wa', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Nomor WA Ayah</label>
            <input
              className={KELAS_INPUT}
              value={isian.nomor_wa_ayah}
              onChange={(e) => ubah('nomor_wa_ayah', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Nomor WA Ibu</label>
            <input
              className={KELAS_INPUT}
              value={isian.nomor_wa_ibu}
              onChange={(e) => ubah('nomor_wa_ibu', e.target.value)}
            />
          </div>
        </Bagian>

        <Bagian judul="Alamat">
          <div className="sm:col-span-2">
            <label className={KELAS_LABEL}>Alamat</label>
            <input
              className={KELAS_INPUT}
              value={isian.alamat}
              onChange={(e) => ubah('alamat', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>RT</label>
            <input
              className={KELAS_INPUT}
              value={isian.rt}
              onChange={(e) => ubah('rt', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>RW</label>
            <input
              className={KELAS_INPUT}
              value={isian.rw}
              onChange={(e) => ubah('rw', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kelurahan</label>
            <input
              className={KELAS_INPUT}
              value={isian.kelurahan}
              onChange={(e) => ubah('kelurahan', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kecamatan</label>
            <input
              className={KELAS_INPUT}
              value={isian.kecamatan}
              onChange={(e) => ubah('kecamatan', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kabupaten/Kota</label>
            <input
              className={KELAS_INPUT}
              value={isian.kabupaten_kota}
              onChange={(e) => ubah('kabupaten_kota', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Provinsi</label>
            <input
              className={KELAS_INPUT}
              value={isian.provinsi}
              onChange={(e) => ubah('provinsi', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>Kode Pos</label>
            <input
              className={KELAS_INPUT}
              value={isian.kode_pos}
              onChange={(e) => ubah('kode_pos', e.target.value)}
            />
          </div>
        </Bagian>

        {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

        <div className="flex items-center justify-end gap-3">
          {modeUbah && onHapus && (
            <button
              type="button"
              onClick={onHapus}
              className="mr-auto cursor-pointer rounded-[var(--radius)] border border-red bg-transparent px-4 py-2.5 text-[13px] font-semibold text-red transition-all duration-200 hover:bg-[rgba(220,38,38,0.06)]"
            >
              Hapus
            </button>
          )}
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
            className="cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:opacity-40"
          >
            {menyimpan ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </form>
    </div>
  );
}
