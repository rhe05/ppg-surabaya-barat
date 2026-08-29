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

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import TanggalPicker, { PosisiPicker } from '@/components/ui/TanggalPicker';
import { WILAYAH_SURABAYA, type WilayahSurabaya } from '@/lib/wilayahSurabaya';

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

/* Riwayat keluarga -- santri lain di kelompok yang sama, dipakai buat
   saran ketik (nama/nama panggilan/nama ayah/nama ibu) + autofill data
   keluarga (2026-08-29, diminta owner: "system canggih seperti search
   engine google"). Cuma field yang relevan buat saran & autofill. */
type RiwayatKeluarga = {
  id: number;
  nama: string | null;
  nama_panggilan: string | null;
  nama_ayah: string | null;
  nama_ibu: string | null;
  nomor_wa_ayah: string | null;
  nomor_wa_ibu: string | null;
  alamat: string | null;
  rt: string | null;
  rw: string | null;
  kelurahan: string | null;
  kecamatan: string | null;
  kabupaten_kota: string | null;
  provinsi: string | null;
  kode_pos: string | null;
};

/* Generik supaya satu bentuk saran dipakai ulang utk dua sumber beda:
   riwayat santri lain (RiwayatKeluarga, dari DB) & daftar wilayah
   Surabaya statis (WilayahSurabaya, dari lib/wilayahSurabaya.ts). */
type SaranItem<T = unknown> = { teks: string; rec?: T };

/* Daftar nilai unik (case-insensitive) dari satu kolom riwayat, urutan
   terbaru dulu (riwayat sudah di-order id desc) -- dipakai utk Nama &
   Nama Panggilan yang cuma butuh saran teks, tanpa autofill lanjutan. */
function saranTeksUnik(daftar: (string | null)[]): SaranItem[] {
  const dilihat = new Set<string>();
  const hasil: SaranItem[] = [];
  for (const v of daftar) {
    const t = (v ?? '').trim();
    if (!t || dilihat.has(t.toLowerCase())) continue;
    dilihat.add(t.toLowerCase());
    hasil.push({ teks: t });
  }
  return hasil;
}

/* Sama seperti saranTeksUnik, tapi tiap saran membawa baris riwayat
   sumbernya (rec) -- dipakai utk Nama Ayah & Nama Ibu supaya klik satu
   saran bisa langsung menarik seluruh data keluarga yang menyertainya. */
function saranKeluargaUnik(
  daftar: RiwayatKeluarga[],
  ambil: (r: RiwayatKeluarga) => string | null,
): SaranItem<RiwayatKeluarga>[] {
  const dilihat = new Set<string>();
  const hasil: SaranItem<RiwayatKeluarga>[] = [];
  for (const r of daftar) {
    const t = (ambil(r) ?? '').trim();
    if (!t || dilihat.has(t.toLowerCase())) continue;
    dilihat.add(t.toLowerCase());
    hasil.push({ teks: t, rec: r });
  }
  return hasil;
}

/* Hanya angka -- dipakai RT/RW supaya tidak bisa diisi huruf, sama pola
   dgn formatNomorWa (non-angka dibuang tiap ketikan). */
function formatAngka(v: string): string {
  return v.replace(/\D/g, '');
}

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

const NAMA_BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];
/* 'YYYY-MM-DD' -> "21 Agu 2026", buat ditampilkan di tombol pemicu
   TanggalPicker (menggantikan <input type="date"> bawaan browser). */
function formatTanggalTampil(v: string): string {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  return `${String(d).padStart(2, '0')} ${NAMA_BULAN_SINGKAT[m - 1] ?? ''} ${y}`;
}

/* Nomor WA: hanya angka, digroup 4-4-4 dgn strip -- diketik apa pun,
   karakter non-angka dibuang lalu diformat ulang dari nol setiap kali. */
function formatNomorWa(v: string): string {
  const digit = v.replace(/\D/g, '');
  return digit.replace(/(\d{4})(?=\d)/g, '$1-');
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

/* Input teks + dropdown saran ketik (nama/nama panggilan/nama ayah/nama
   ibu) -- menyaring `saran` terhadap apa yang sudah diketik, mirip kotak
   pencarian: dibuka saat fokus, disaring tiap ketikan, klik = terpilih.
   `onPilih` opsional dipanggil dgn item terpilih (bawa `.rec` kalau ada)
   -- Nama Ayah/Ibu memakainya utk menarik seluruh data keluarga
   (lihat isiDariKeluarga di bawah), Nama/Nama Panggilan tidak perlu. */
function FieldSaran<T = unknown>({
  label,
  wajib,
  value,
  onChange,
  onPilih,
  saran,
  placeholder,
  colSpan,
}: {
  label: string;
  wajib?: boolean;
  value: string;
  onChange: (v: string) => void;
  onPilih?: (item: SaranItem<T>) => void;
  saran: SaranItem<T>[];
  placeholder?: string;
  colSpan?: boolean;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const q = value.trim().toLowerCase();
  const cocok = (q ? saran.filter((s) => s.teks.toLowerCase().includes(q)) : saran).slice(0, 8);

  return (
    <div className={colSpan ? 'relative sm:col-span-2' : 'relative'}>
      <label className={KELAS_LABEL}>
        {label}
        {wajib ? ' *' : ''}
      </label>
      <input
        className={KELAS_INPUT}
        value={value}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setTerbuka(true)}
        onBlur={() => setTimeout(() => setTerbuka(false), 150)}
        placeholder={placeholder}
      />
      {terbuka && cocok.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-[var(--radius)] border border-border bg-panel shadow-[0_10px_25px_-8px_rgba(15,23,42,0.35)]">
          {cocok.map((item, i) => (
            <button
              key={`${item.teks}-${i}`}
              type="button"
              /* mousedown+preventDefault supaya klik terdaftar SEBELUM
                 onBlur input menutup dropdown -- kalau tidak, blur
                 keburu menutup dropdown & klik jatuh ke tempat kosong. */
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(item.teks);
                onPilih?.(item);
                setTerbuka(false);
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left text-[13px] text-text hover:bg-panel-2"
            >
              {item.teks}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SantriForm({
  santri,
  kelasNgajiTerkunci,
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
  /* `diajukan` true kalau pemanggil ini guru DAN sedang menambah santri
     baru -- artinya BUKAN tersimpan langsung, cuma diajukan ke Admin Kelp
     (lihat cabang `role === 'guru'` di simpan() bawah) -- pemanggil bisa
     memakainya utk menampilkan pesan yang berbeda ("menunggu persetujuan"
     vs "tersimpan"). Admin (SantriList.tsx) tidak perlu peduli parameter
     ini, panggilannya tetap `onSelesai={load}` tanpa argumen. */
  onSelesai: (diajukan?: boolean) => void;
  onBatal: () => void;
}) {
  const { profile } = useAuth();
  const modeUbah = santri !== null;

  const [isian, setIsian] = useState<Isian>(santri ? dariBaris(santri) : KOSONG);
  const [kelompok, setKelompok] = useState<Kelompok[]>([]);
  const [kelasList, setKelasList] = useState<KelasNgaji[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Kalender custom (TanggalPicker), sama persis yang dipakai layar Input
     Kehadiran -- gantikan <input type="date"> bawaan browser yg tampilannya
     beda-beda tiap perangkat. Satu instance dipakai bergantian utk kedua
     field tanggal (tglAktif menandai field mana yang sedang dibuka). */
  const [tglAktif, setTglAktif] = useState<'tanggal_lahir' | 'mulai_ngaji' | null>(null);
  const [posisiTgl, setPosisiTgl] = useState<PosisiPicker | null>(null);
  const tglLahirRef = useRef<HTMLButtonElement>(null);
  const mulaiNgajiRef = useRef<HTMLButtonElement>(null);

  function bukaTgl(field: 'tanggal_lahir' | 'mulai_ngaji', ref: React.RefObject<HTMLButtonElement | null>) {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setPosisiTgl({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setTglAktif(field);
  }

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

  /* Riwayat santri lain di kelompok yang sama -- sumber saran ketik &
     autofill keluarga. Dimuat ulang tiap kelompok berganti (relevan buat
     admin_desa/admin_ppg yang bisa pindah kelompok di dropdown). */
  const [riwayatKeluarga, setRiwayatKeluarga] = useState<RiwayatKeluarga[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!isian.kelompok_id) {
        setRiwayatKeluarga([]);
        return;
      }
      const { data } = await supabase
        .from('santri')
        .select(
          'id, nama, nama_panggilan, nama_ayah, nama_ibu, nomor_wa_ayah, nomor_wa_ibu, alamat, rt, rw, kelurahan, kecamatan, kabupaten_kota, provinsi, kode_pos',
        )
        .eq('kelompok_id', Number(isian.kelompok_id))
        .is('deleted_at', null)
        .order('id', { ascending: false })
        .limit(500);
      if (cancelled) return;
      /* Baris santri yang sedang diubah dikeluarkan -- kalau tidak, form
         menyarankan namanya sendiri sbg "riwayat". */
      setRiwayatKeluarga(
        ((data ?? []) as RiwayatKeluarga[]).filter((r) => !modeUbah || r.id !== santri?.id),
      );
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isian.kelompok_id]);

  const saranNama = useMemo(
    () => saranTeksUnik(riwayatKeluarga.map((r) => r.nama)),
    [riwayatKeluarga],
  );
  const saranPanggilan = useMemo(
    () => saranTeksUnik(riwayatKeluarga.map((r) => r.nama_panggilan)),
    [riwayatKeluarga],
  );
  const saranAyah = useMemo(
    () => saranKeluargaUnik(riwayatKeluarga, (r) => r.nama_ayah),
    [riwayatKeluarga],
  );
  const saranIbu = useMemo(
    () => saranKeluargaUnik(riwayatKeluarga, (r) => r.nama_ibu),
    [riwayatKeluarga],
  );

  /* Diklik dari saran Nama Ayah ATAU Nama Ibu -- keduanya menarik SELURUH
     data keluarga yang menyertai baris riwayat itu (adik/kakak kandung di
     kelompok yang sama biasanya satu keluarga, satu alamat), supaya admin
     tidak perlu mengetik ulang utk tiap anak. Field yang diisi menimpa
     nilai yang sudah ada di form -- itu maksud "otomatis muncul", bukan
     cuma mengisi yang kosong. */
  function isiDariKeluarga(rec: RiwayatKeluarga | undefined) {
    if (!rec) return;
    setIsian((s) => ({
      ...s,
      nama_ayah: rec.nama_ayah ?? s.nama_ayah,
      nomor_wa_ayah: rec.nomor_wa_ayah ?? s.nomor_wa_ayah,
      nama_ibu: rec.nama_ibu ?? s.nama_ibu,
      nomor_wa_ibu: rec.nomor_wa_ibu ?? s.nomor_wa_ibu,
      alamat: rec.alamat ?? s.alamat,
      rt: rec.rt ?? s.rt,
      rw: rec.rw ?? s.rw,
      kelurahan: rec.kelurahan ?? s.kelurahan,
      kecamatan: rec.kecamatan ?? s.kecamatan,
      kabupaten_kota: rec.kabupaten_kota ?? s.kabupaten_kota,
      provinsi: rec.provinsi ?? s.provinsi,
      kode_pos: rec.kode_pos ?? s.kode_pos,
    }));
  }

  /* Saran ketik Kelurahan: daftar statis 153 kelurahan Kota Surabaya
     (lib/wilayahSurabaya.ts), BUKAN dari riwayat DB -- lebih lengkap &
     tidak tergantung apa yang kebetulan pernah diketik admin lain. */
  const saranKelurahan = useMemo<SaranItem<WilayahSurabaya>[]>(
    () => WILAYAH_SURABAYA.map((w) => ({ teks: w.kelurahan, rec: w })),
    [],
  );

  /* Diklik dari saran Kelurahan -- menebak Kecamatan/Kabupaten-Kota/
     Provinsi/Kode Pos dari kelurahan yang dipilih (diminta owner
     2026-08-29, sumber pemerintahan.surabaya.go.id). Tetap MENIMPA field
     terkait, sama alasannya dgn isiDariKeluarga -- tapi hasilnya cuma
     tebakan awal, admin/guru tetap bebas mengetik ulang manual kalau
     keluarganya tidak tinggal di Surabaya atau datanya meleset. */
  function isiDariWilayah(rec: WilayahSurabaya | undefined) {
    if (!rec) return;
    setIsian((s) => ({
      ...s,
      kelurahan: rec.kelurahan,
      kecamatan: rec.kecamatan,
      kabupaten_kota: rec.kabupaten_kota,
      provinsi: rec.provinsi,
      kode_pos: rec.kode_pos,
    }));
  }

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

  function ubahWa(field: 'nomor_wa' | 'nomor_wa_ayah' | 'nomor_wa_ibu', nilaiMentah: string) {
    ubah(field, formatNomorWa(nilaiMentah));
  }

  function ubahAngka(field: 'rt' | 'rw', nilaiMentah: string) {
    ubah(field, formatAngka(nilaiMentah));
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
        const dataSantri = {
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
        };

        if (profile?.role === 'guru') {
          /* Guru TIDAK bisa lagi menambah santri langsung (migrasi
             20260821180000) -- wajib lewat ajukan_permintaan_generus(),
             ditahan pending sampai Admin Kelp menyetujui. */
          const { error: err } = await supabase.rpc('ajukan_permintaan_generus', {
            p: { jenis: 'tambah', payload: dataSantri },
          });
          if (err) throw new Error(err.message);
          onSelesai(true);
          return;
        }

        /* Tambah WAJIB lewat RPC, bukan .insert() langsung: NIS harus
           dibuat dan ditulis dalam SATU transaksi, kalau tidak dua admin
           yang menyimpan bersamaan dapat NIS sama (dibuktikan di uji
           konkurensi migrasi 20260817100000). */
        const { error: err } = await supabase.rpc('tambah_santri', { p: dataSantri });
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
          {modeUbah ? 'Ubah Generus' : 'Tambah Generus'}
        </h2>

        <TanggalPicker
          terbuka={tglAktif !== null}
          posisi={posisiTgl}
          nilai={tglAktif ? isian[tglAktif] : ''}
          onPilih={(v) => {
            if (tglAktif) ubah(tglAktif, v);
          }}
          onTutup={() => setTglAktif(null)}
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
            <label className={KELAS_LABEL}>NIS</label>
            <input
              className={KELAS_INPUT + ' opacity-60'}
              value={modeUbah ? (santri.nis ?? '-') : 'Dibuat otomatis saat disimpan'}
              disabled
              readOnly
            />
          </div>
          <FieldSaran
            label="Nama"
            wajib
            value={isian.nama}
            onChange={(v) => ubah('nama', v)}
            saran={saranNama}
            placeholder="Nama lengkap"
          />
          <FieldSaran
            label="Nama Panggilan"
            value={isian.nama_panggilan}
            onChange={(v) => ubah('nama_panggilan', v)}
            saran={saranPanggilan}
            placeholder="Misal: Budi"
          />
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
            <button
              type="button"
              ref={tglLahirRef}
              onClick={() => bukaTgl('tanggal_lahir', tglLahirRef)}
              className={`${KELAS_INPUT} text-left ${isian.tanggal_lahir ? '' : 'text-text-faint'}`}
            >
              {isian.tanggal_lahir ? formatTanggalTampil(isian.tanggal_lahir) : 'Pilih tanggal'}
            </button>
          </div>
        </Bagian>

        <Bagian judul="Pendidikan & Ngaji">
          <div>
            <label className={KELAS_LABEL}>Pendidikan Formal</label>
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
            <button
              type="button"
              ref={mulaiNgajiRef}
              onClick={() => bukaTgl('mulai_ngaji', mulaiNgajiRef)}
              className={`${KELAS_INPUT} text-left ${isian.mulai_ngaji ? '' : 'text-text-faint'}`}
            >
              {isian.mulai_ngaji ? formatTanggalTampil(isian.mulai_ngaji) : 'Pilih tanggal'}
            </button>
          </div>
          {/* Status Kesiapan (nikah) cuma relevan utk jenjang paling atas --
              "remaja pra nikah", di atas Remaja SMA. Jenjang lebih muda
              tidak pernah butuh field ini. */}
          {isian.jenjang_saat_ini === 'Remaja' && (
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
          )}
        </Bagian>

        <Bagian judul="Orang Tua & Kontak">
          <FieldSaran
            label="Nama Ayah"
            value={isian.nama_ayah}
            onChange={(v) => ubah('nama_ayah', v)}
            onPilih={(item) => isiDariKeluarga(item.rec)}
            saran={saranAyah}
          />
          <div>
            <label className={KELAS_LABEL}>Nomor WA Ayah</label>
            <input
              className={KELAS_INPUT}
              inputMode="numeric"
              value={isian.nomor_wa_ayah}
              onChange={(e) => ubahWa('nomor_wa_ayah', e.target.value)}
              placeholder="0812-3456-7890"
            />
          </div>
          <FieldSaran
            label="Nama Ibu"
            value={isian.nama_ibu}
            onChange={(v) => ubah('nama_ibu', v)}
            onPilih={(item) => isiDariKeluarga(item.rec)}
            saran={saranIbu}
          />
          <div>
            <label className={KELAS_LABEL}>Nomor WA Ibu</label>
            <input
              className={KELAS_INPUT}
              inputMode="numeric"
              value={isian.nomor_wa_ibu}
              onChange={(e) => ubahWa('nomor_wa_ibu', e.target.value)}
              placeholder="0812-3456-7890"
            />
          </div>
          {/* Nomor WA Santri: opsional, cuma muncul mulai jenjang Pra Remaja
              ke atas -- santri PAUD/TK & Cabe Rawit belum wajar punya nomor
              sendiri. */}
          {isian.jenjang_saat_ini &&
            !['PAUD/TK', 'Cabe Rawit'].includes(isian.jenjang_saat_ini) && (
              <div>
                <label className={KELAS_LABEL}>Nomor WA Santri</label>
                <input
                  className={KELAS_INPUT}
                  inputMode="numeric"
                  value={isian.nomor_wa}
                  onChange={(e) => ubahWa('nomor_wa', e.target.value)}
                  placeholder="0812-3456-7890"
                />
              </div>
            )}
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
              inputMode="numeric"
              value={isian.rt}
              onChange={(e) => ubahAngka('rt', e.target.value)}
            />
          </div>
          <div>
            <label className={KELAS_LABEL}>RW</label>
            <input
              className={KELAS_INPUT}
              inputMode="numeric"
              value={isian.rw}
              onChange={(e) => ubahAngka('rw', e.target.value)}
            />
          </div>
          <FieldSaran
            label="Kelurahan"
            value={isian.kelurahan}
            onChange={(v) => ubah('kelurahan', v)}
            onPilih={(item) => isiDariWilayah(item.rec)}
            saran={saranKelurahan}
          />
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
