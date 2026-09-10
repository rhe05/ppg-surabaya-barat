'use client';

/* Form tambah/edit Data Jamaah (Penerobos Kelp). Pola full-screen modal
   sama SantriForm/GuruForm, tapi lebih ringkas — jamaah = dewasa, tanpa
   jenjang/kelas ngaji. kelompok_id dikunci ke scope penerobos.

   Tanggal Lahir pakai kalender custom (TanggalPicker), BUKAN <input
   type="date"> bawaan browser — tampilannya seragam di semua perangkat,
   pola sama GuruForm/SantriForm (diminta owner 2026-09-10). */

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import {
  KOLOM_JAMAAH,
  STATUS_KELUARGA,
  STATUS_DOMISILI,
  JENIS_HUNIAN,
  STATUS_HUNIAN,
  PENDIDIKAN_TERAKHIR,
  type JamaahRow,
  type SubKelp,
} from '@/lib/jamaah';

const INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text focus:border-navy focus:outline-none';
const LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';

const NAMA_BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];
/* 'YYYY-MM-DD' -> "21 Agu 2026" utk tombol pemicu TanggalPicker. */
function formatTanggalTampil(v: string): string {
  if (!v) return '';
  const [y, m, d] = v.split('-').map(Number);
  if (!y || !m || !d) return v;
  return `${String(d).padStart(2, '0')} ${NAMA_BULAN_SINGKAT[m - 1] ?? ''} ${y}`;
}

type Isian = {
  sub_kelp_id: string;
  nama: string;
  nama_panggilan: string;
  gender: '' | 'L' | 'P';
  tempat_lahir: string;
  tanggal_lahir: string;
  status_keluarga: string;
  status_domisili: string;
  jenis_hunian: string;
  status_hunian: string;
  pekerjaan: string;
  pendidikan_terakhir: string;
  no_wa: string;
  alamat: string;
  rt: string;
  rw: string;
  kelurahan: string;
  kecamatan: string;
  kabupaten_kota: string;
  provinsi: string;
  kode_pos: string;
  catatan: string;
};

const KOSONG: Isian = {
  sub_kelp_id: '',
  nama: '',
  nama_panggilan: '',
  gender: '',
  tempat_lahir: '',
  tanggal_lahir: '',
  status_keluarga: '',
  status_domisili: '',
  jenis_hunian: '',
  status_hunian: '',
  pekerjaan: '',
  pendidikan_terakhir: '',
  no_wa: '',
  alamat: '',
  rt: '',
  rw: '',
  kelurahan: '',
  kecamatan: '',
  kabupaten_kota: '',
  provinsi: '',
  kode_pos: '',
  catatan: '',
};

function dariBaris(j: JamaahRow): Isian {
  return {
    sub_kelp_id: j.sub_kelp_id != null ? String(j.sub_kelp_id) : '',
    nama: j.nama ?? '',
    nama_panggilan: j.nama_panggilan ?? '',
    gender: (j.gender ?? '') as Isian['gender'],
    tempat_lahir: j.tempat_lahir ?? '',
    tanggal_lahir: j.tanggal_lahir ?? '',
    status_keluarga: j.status_keluarga ?? '',
    status_domisili: j.status_domisili ?? '',
    jenis_hunian: j.jenis_hunian ?? '',
    status_hunian: j.status_hunian ?? '',
    pekerjaan: j.pekerjaan ?? '',
    pendidikan_terakhir: j.pendidikan_terakhir ?? '',
    no_wa: j.no_wa ?? '',
    alamat: j.alamat ?? '',
    rt: j.rt ?? '',
    rw: j.rw ?? '',
    kelurahan: j.kelurahan ?? '',
    kecamatan: j.kecamatan ?? '',
    kabupaten_kota: j.kabupaten_kota ?? '',
    provinsi: j.provinsi ?? '',
    kode_pos: j.kode_pos ?? '',
    catatan: j.catatan ?? '',
  };
}

const kosongJadiNull = (v: string) => {
  const t = v.trim();
  return t === '' ? null : t;
};

export default function JamaahForm({
  jamaah,
  subKelpList,
  onSelesai,
  onBatal,
}: {
  jamaah: JamaahRow | null;
  subKelpList: SubKelp[];
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;
  const [isian, setIsian] = useState<Isian>(jamaah ? dariBaris(jamaah) : KOSONG);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hapusKonfirmasi, setHapusKonfirmasi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Tanggal Lahir — kalender custom (pola GuruForm). */
  const [tglTerbuka, setTglTerbuka] = useState(false);
  const [posisiTgl, setPosisiTgl] = useState<PosisiPicker | null>(null);
  const tglLahirRef = useRef<HTMLButtonElement>(null);

  function bukaTgl() {
    const rect = tglLahirRef.current?.getBoundingClientRect();
    if (rect) setPosisiTgl({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setTglTerbuka(true);
  }

  useEffect(() => {
    setIsian(jamaah ? dariBaris(jamaah) : KOSONG);
  }, [jamaah]);

  const ubah = <K extends keyof Isian>(k: K, v: Isian[K]) => setIsian((s) => ({ ...s, [k]: v }));

  async function simpan() {
    if (!kelompokId) {
      setError('Akun Anda belum terhubung ke kelompok.');
      return;
    }
    if (!isian.nama.trim()) {
      setError('Nama wajib diisi.');
      return;
    }
    setMenyimpan(true);
    setError(null);

    const payload = {
      kelompok_id: kelompokId,
      sub_kelp_id: isian.sub_kelp_id ? Number(isian.sub_kelp_id) : null,
      nama: isian.nama.trim(),
      nama_panggilan: kosongJadiNull(isian.nama_panggilan),
      gender: isian.gender || null,
      tempat_lahir: kosongJadiNull(isian.tempat_lahir),
      tanggal_lahir: isian.tanggal_lahir || null,
      status_keluarga: kosongJadiNull(isian.status_keluarga),
      status_domisili: kosongJadiNull(isian.status_domisili),
      jenis_hunian: kosongJadiNull(isian.jenis_hunian),
      status_hunian: kosongJadiNull(isian.status_hunian),
      pekerjaan: kosongJadiNull(isian.pekerjaan),
      pendidikan_terakhir: kosongJadiNull(isian.pendidikan_terakhir),
      no_wa: kosongJadiNull(isian.no_wa),
      alamat: kosongJadiNull(isian.alamat),
      rt: kosongJadiNull(isian.rt),
      rw: kosongJadiNull(isian.rw),
      kelurahan: kosongJadiNull(isian.kelurahan),
      kecamatan: kosongJadiNull(isian.kecamatan),
      kabupaten_kota: kosongJadiNull(isian.kabupaten_kota),
      provinsi: kosongJadiNull(isian.provinsi),
      kode_pos: kosongJadiNull(isian.kode_pos),
      catatan: kosongJadiNull(isian.catatan),
    };

    const q = jamaah
      ? supabase.from('jamaah').update(payload).eq('id', jamaah.id).select(KOLOM_JAMAAH).single()
      : supabase.from('jamaah').insert(payload).select(KOLOM_JAMAAH).single();
    const { error: err } = await q;
    setMenyimpan(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSelesai();
  }

  async function hapus() {
    if (!jamaah) return;
    setMenyimpan(true);
    setError(null);
    /* Soft-delete: DELETE keras dikunci admin_ppg (RLS). deleted_at diisi
       lewat UPDATE — pola sama santri. */
    const { error: err } = await supabase
      .from('jamaah')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', jamaah.id);
    setMenyimpan(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSelesai();
  }

  return (
    <div className="fixed inset-0 z-[600] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-[460px] flex-col rounded-t-[26px] border border-border bg-panel shadow-[0_-16px_48px_rgba(0,0,0,0.28)] sm:rounded-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[17px] font-extrabold text-text">
            {jamaah ? 'Ubah Data Jamaah' : 'Tambah Jamaah'}
          </h2>
          <button
            type="button"
            onClick={onBatal}
            aria-label="Tutup"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-panel-2 text-text-dim active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <TanggalPicker
          terbuka={tglTerbuka}
          posisi={posisiTgl}
          nilai={isian.tanggal_lahir}
          onPilih={(v) => ubah('tanggal_lahir', v)}
          onTutup={() => setTglTerbuka(false)}
        />

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className={LABEL}>Sub Kelp</label>
            <select
              className={INPUT}
              value={isian.sub_kelp_id}
              onChange={(e) => ubah('sub_kelp_id', e.target.value)}
            >
              <option value="">— Belum ditentukan —</option>
              {subKelpList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nama}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL}>Nama Lengkap *</label>
            <input className={INPUT} value={isian.nama} onChange={(e) => ubah('nama', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Nama Panggilan</label>
              <input
                className={INPUT}
                value={isian.nama_panggilan}
                onChange={(e) => ubah('nama_panggilan', e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Gender</label>
              <select
                className={INPUT}
                value={isian.gender}
                onChange={(e) => ubah('gender', e.target.value as Isian['gender'])}
              >
                <option value="">—</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Tempat Lahir</label>
              <input
                className={INPUT}
                value={isian.tempat_lahir}
                onChange={(e) => ubah('tempat_lahir', e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Tanggal Lahir</label>
              <button
                type="button"
                ref={tglLahirRef}
                onClick={bukaTgl}
                className={`${INPUT} text-left ${isian.tanggal_lahir ? '' : 'text-text-faint'}`}
              >
                {isian.tanggal_lahir ? formatTanggalTampil(isian.tanggal_lahir) : 'Pilih tanggal'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Status dalam Keluarga</label>
              <select
                className={INPUT}
                value={isian.status_keluarga}
                onChange={(e) => ubah('status_keluarga', e.target.value)}
              >
                <option value="">—</option>
                {STATUS_KELUARGA.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Pendidikan Terakhir</label>
              <select
                className={INPUT}
                value={isian.pendidikan_terakhir}
                onChange={(e) => ubah('pendidikan_terakhir', e.target.value)}
              >
                <option value="">—</option>
                {PENDIDIKAN_TERAKHIR.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL}>Status Domisili</label>
            <select
              className={INPUT}
              value={isian.status_domisili}
              onChange={(e) => ubah('status_domisili', e.target.value)}
            >
              <option value="">—</option>
              {STATUS_DOMISILI.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Jenis Hunian</label>
              <select
                className={INPUT}
                value={isian.jenis_hunian}
                onChange={(e) => ubah('jenis_hunian', e.target.value)}
              >
                <option value="">—</option>
                {JENIS_HUNIAN.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Status Hunian</label>
              <select
                className={INPUT}
                value={isian.status_hunian}
                onChange={(e) => ubah('status_hunian', e.target.value)}
              >
                <option value="">—</option>
                {STATUS_HUNIAN.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Pekerjaan</label>
              <input
                className={INPUT}
                value={isian.pekerjaan}
                onChange={(e) => ubah('pekerjaan', e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Nomor WA</label>
              <input
                className={INPUT}
                inputMode="numeric"
                value={isian.no_wa}
                onChange={(e) => ubah('no_wa', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Alamat</label>
            <input className={INPUT} value={isian.alamat} onChange={(e) => ubah('alamat', e.target.value)} />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className={LABEL}>RT</label>
              <input
                className={INPUT}
                inputMode="numeric"
                value={isian.rt}
                onChange={(e) => ubah('rt', e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>RW</label>
              <input
                className={INPUT}
                inputMode="numeric"
                value={isian.rw}
                onChange={(e) => ubah('rw', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Kelurahan</label>
              <input
                className={INPUT}
                value={isian.kelurahan}
                onChange={(e) => ubah('kelurahan', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Kecamatan</label>
              <input
                className={INPUT}
                value={isian.kecamatan}
                onChange={(e) => ubah('kecamatan', e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Kabupaten/Kota</label>
              <input
                className={INPUT}
                value={isian.kabupaten_kota}
                onChange={(e) => ubah('kabupaten_kota', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Provinsi</label>
              <input
                className={INPUT}
                value={isian.provinsi}
                onChange={(e) => ubah('provinsi', e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL}>Kode Pos</label>
              <input
                className={INPUT}
                inputMode="numeric"
                value={isian.kode_pos}
                onChange={(e) => ubah('kode_pos', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Catatan</label>
            <textarea
              className={`${INPUT} min-h-[72px]`}
              value={isian.catatan}
              onChange={(e) => ubah('catatan', e.target.value)}
            />
          </div>

          {jamaah && (
            <div className="border-t border-border pt-3">
              {hapusKonfirmasi ? (
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] text-text-dim">Yakin nonaktifkan jamaah ini?</span>
                  <button
                    type="button"
                    onClick={hapus}
                    disabled={menyimpan}
                    className="rounded-full bg-red px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    Ya, nonaktifkan
                  </button>
                  <button
                    type="button"
                    onClick={() => setHapusKonfirmasi(false)}
                    className="rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-text-dim"
                  >
                    Batal
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setHapusKonfirmasi(true)}
                  className="text-[12.5px] font-bold text-red"
                >
                  Nonaktifkan jamaah
                </button>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          {error && <p className="mb-2 text-[12.5px] font-semibold text-red">{error}</p>}
          <button
            type="button"
            onClick={simpan}
            disabled={menyimpan}
            className="w-full rounded-[var(--radius-button)] border-none bg-navy px-5 py-3.5 text-[14px] font-extrabold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {menyimpan ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
