'use client';

/* Form tambah/edit Data Jamaah (Penerobos Kelp). Pola full-screen modal
   sama SantriForm/GuruForm, tapi lebih ringkas — jamaah = dewasa, tanpa
   jenjang/kelas ngaji. kelompok_id dikunci ke scope penerobos.

   Tanggal Lahir pakai kalender custom (TanggalPicker), BUKAN <input
   type="date"> bawaan browser — tampilannya seragam di semua perangkat,
   pola sama GuruForm/SantriForm (diminta owner 2026-09-10).

   Nama Lengkap punya saran ketik "seperti Google" dari data GENERUS
   sekelompok (nama generus + nama ayah + nama ibu). Klik satu saran =
   autofill alamat/RT-RW/wilayah/WA keluarganya + tebak gender & status
   keluarga (diminta owner 2026-09-10). Sumber baca `santri` butuh RLS
   penerobos — migrasi 20260910160000. */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Layers } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import FieldTanggal from '@/components/ui/FieldTanggal';
import { FieldSaran } from '@/components/ui/FieldSaran';
import { saranTeksUnik, type SaranItem } from '@/lib/saran';
import { KOTA_INDONESIA } from '@/lib/kotaIndonesia';
import { WILAYAH_SURABAYA, type WilayahSurabaya } from '@/lib/wilayahSurabaya';
import {
  KOLOM_JAMAAH,
  STATUS_KELUARGA,
  STATUS_MS,
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

/* Satu baris generus sekelompok — sumber saran & autofill di field Nama. */
type RiwayatGenerus = {
  nama: string;
  gender: string | null;
  nama_ayah: string | null;
  nama_ibu: string | null;
  nomor_wa: string | null;
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

const KOLOM_RIWAYAT_GENERUS =
  'nama, gender, nama_ayah, nama_ibu, nomor_wa, nomor_wa_ayah, nomor_wa_ibu, ' +
  'alamat, rt, rw, kelurahan, kecamatan, kabupaten_kota, provinsi, kode_pos';

/* peran = posisi orang ini dalam keluarga generus -> menentukan field WA
   mana yang dipakai + tebakan gender/status. */
type PilihanNama = { generus: RiwayatGenerus; peran: 'generus' | 'ayah' | 'ibu' };

/* Bangun daftar saran gabungan: nama generus + nama ayah + nama ibu, unik
   case-insensitive (generus didahulukan bila namanya sama). */
function saranNamaGabungan(daftar: RiwayatGenerus[]): SaranItem<PilihanNama>[] {
  const dilihat = new Set<string>();
  const hasil: SaranItem<PilihanNama>[] = [];
  const tambah = (teks: string | null, generus: RiwayatGenerus, peran: PilihanNama['peran']) => {
    const t = (teks ?? '').trim();
    if (!t || dilihat.has(t.toLowerCase())) return;
    dilihat.add(t.toLowerCase());
    hasil.push({ teks: t, rec: { generus, peran } });
  };
  for (const r of daftar) tambah(r.nama, r, 'generus');
  for (const r of daftar) tambah(r.nama_ayah, r, 'ayah');
  for (const r of daftar) tambah(r.nama_ibu, r, 'ibu');
  return hasil;
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

/* Hanya angka — RT/RW tak boleh diisi huruf. Pola sama SantriForm. */
const formatAngka = (v: string) => v.replace(/\D/g, '');

/* Nomor WA: non-angka dibuang lalu digroup 4-4-4 ("0812-3456-7890").
   Pola sama SantriForm. */
const formatNomorWa = (v: string) => v.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1-');

export default function JamaahForm({
  jamaah,
  jamaahList,
  subKelpList,
  subKelpWajib = false,
  onSelesai,
  onBatal,
}: {
  jamaah: JamaahRow | null;
  /* Semua jamaah sekelompok yg sudah dimuat JamaahList — sumber saran ketik
     Nama Lengkap + Nama Panggilan (nol query tambahan). */
  jamaahList: JamaahRow[];
  subKelpList: SubKelp[];
  /* Dari jamaah_konfig: kalau true, Sub Kelp wajib dipilih. */
  subKelpWajib?: boolean;
  onSelesai: () => void;
  onBatal: () => void;
}) {
  const router = useRouter();
  const { profile } = useAuth();
  const kelompokId = profile?.scope_kelompok_id ?? null;
  const [isian, setIsian] = useState<Isian>(jamaah ? dariBaris(jamaah) : KOSONG);
  const [menyimpan, setMenyimpan] = useState(false);
  const [hapusKonfirmasi, setHapusKonfirmasi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riwayatGenerus, setRiwayatGenerus] = useState<RiwayatGenerus[]>([]);

  useEffect(() => {
    setIsian(jamaah ? dariBaris(jamaah) : KOSONG);
  }, [jamaah]);

  /* Data generus sekelompok — sumber saran ketik & autofill di field Nama.
     Kalau RLS penerobos belum aktif (migrasi 20260910160000), query balik
     kosong tanpa error -> fitur saran cuma tak muncul, form tetap jalan. */
  useEffect(() => {
    if (!kelompokId) return;
    let batal = false;
    (async () => {
      const { data } = await supabase
        .from('santri')
        .select(KOLOM_RIWAYAT_GENERUS)
        .eq('kelompok_id', kelompokId)
        .is('deleted_at', null)
        .order('id', { ascending: false })
        .limit(500);
      if (!batal) setRiwayatGenerus((data ?? []) as unknown as RiwayatGenerus[]);
    })();
    return () => {
      batal = true;
    };
  }, [kelompokId]);

  /* Saran Nama Lengkap: nama jamaah yang SUDAH pernah diinput (dari
     jamaahList, nol query) didahulukan, lalu nama keluarga generus
     sekelompok. Unik case-insensitive. */
  const saranNama = useMemo(() => {
    const dariGenerus = saranNamaGabungan(riwayatGenerus);
    const dilihat = new Set(dariGenerus.map((s) => s.teks.toLowerCase()));
    const dariJamaah: SaranItem<PilihanNama>[] = [];
    for (const j of jamaahList) {
      const t = (j.nama ?? '').trim();
      if (!t || j.id === jamaah?.id || dilihat.has(t.toLowerCase())) continue;
      dilihat.add(t.toLowerCase());
      dariJamaah.push({ teks: t });
    }
    return [...dariJamaah, ...dariGenerus];
  }, [riwayatGenerus, jamaahList, jamaah?.id]);
  const saranKota = useMemo(() => KOTA_INDONESIA.map((k) => ({ teks: k })), []);
  const saranKelurahan = useMemo<SaranItem<WilayahSurabaya>[]>(
    () => WILAYAH_SURABAYA.map((w) => ({ teks: w.kelurahan, rec: w })),
    [],
  );
  const saranPanggilan = useMemo(
    () =>
      saranTeksUnik(
        jamaahList.filter((j) => j.id !== jamaah?.id).map((j) => j.nama_panggilan),
      ),
    [jamaahList, jamaah?.id],
  );

  const ubah = <K extends keyof Isian>(k: K, v: Isian[K]) => setIsian((s) => ({ ...s, [k]: v }));

  /* Klik saran Kelurahan -> isi Kecamatan/Kab-Kota/Provinsi/Kode Pos dari
     lib/wilayahSurabaya.ts. MENIMPA field terkait (itu maksud "otomatis
     terisi"); tetap editable kalau datanya meleset / bukan Surabaya.
     Sama persis SantriForm. */
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

  /* Klik saran nama -> tarik data keluarga generus yang menyertainya.
     Field yang ADA isinya di baris generus MENIMPA nilai di form (itu
     maksud "otomatis masuk"); yang kosong di generus dibiarkan apa adanya
     supaya penerobos tinggal isi sisanya. */
  function isiDariGenerus({ generus: g, peran }: PilihanNama) {
    const wa =
      peran === 'ayah' ? g.nomor_wa_ayah : peran === 'ibu' ? g.nomor_wa_ibu : g.nomor_wa;
    setIsian((s) => ({
      ...s,
      gender: peran === 'ayah' ? 'L' : peran === 'ibu' ? 'P' : (g.gender as Isian['gender']) || s.gender,
      status_keluarga:
        peran === 'ayah' ? 'Kepala Keluarga' : peran === 'ibu' ? 'Istri' : s.status_keluarga,
      no_wa: wa ?? s.no_wa,
      alamat: g.alamat ?? s.alamat,
      rt: g.rt ?? s.rt,
      rw: g.rw ?? s.rw,
      kelurahan: g.kelurahan ?? s.kelurahan,
      kecamatan: g.kecamatan ?? s.kecamatan,
      kabupaten_kota: g.kabupaten_kota ?? s.kabupaten_kota,
      provinsi: g.provinsi ?? s.provinsi,
      kode_pos: g.kode_pos ?? s.kode_pos,
    }));
  }

  /* Sub Kelp wajib TAPI kelompok belum punya Sub Kelp sama sekali —
     form mengarahkan buat Sub Kelp dulu, tidak bisa menyimpan. */
  const perluBuatSubKelp = subKelpWajib && subKelpList.length === 0;

  async function simpan() {
    if (!kelompokId) {
      setError('Akun Anda belum terhubung ke kelompok.');
      return;
    }
    if (!isian.nama.trim()) {
      setError('Nama wajib diisi.');
      return;
    }
    if (subKelpWajib && subKelpList.length > 0 && !isian.sub_kelp_id) {
      setError('Sub Kelp wajib dipilih.');
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

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {perluBuatSubKelp ? (
            <div className="rounded-card border border-navy-lembut-2 bg-navy-lembut p-3.5">
              <div className="flex items-start gap-2.5">
                <Layers size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-navy" />
                <div className="min-w-0">
                  <div className="text-[12.5px] font-bold text-navy-tua">
                    Sub Kelp wajib diisi, tapi kelompok Anda belum punya Sub Kelp.
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-text-dim">
                    Buat minimal satu Sub Kelp dulu, lalu tambahkan jamaah.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onBatal();
                  router.push('/jamaah/sub-kelp');
                }}
                className="mt-3 w-full rounded-[var(--radius-button)] border-none bg-navy px-4 py-2.5 text-[13px] font-extrabold text-white active:scale-[0.98]"
              >
                Buat Sub Kelp dulu
              </button>
            </div>
          ) : (
            <div>
              <label className={LABEL}>Sub Kelp{subKelpWajib ? ' *' : ''}</label>
              <select
                className={INPUT}
                value={isian.sub_kelp_id}
                onChange={(e) => ubah('sub_kelp_id', e.target.value)}
              >
                <option value="">{subKelpWajib ? '— pilih Sub Kelp —' : '— Belum ditentukan —'}</option>
                {subKelpList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>
          )}

          <FieldSaran
            inputClass={INPUT}
            labelClass={LABEL}
            label="Nama Lengkap"
            wajib
            value={isian.nama}
            onChange={(v) => ubah('nama', v)}
            onPilih={(item) => item.rec && isiDariGenerus(item.rec)}
            saran={saranNama}
            placeholder="Ketik nama — saran dari jamaah & data generus"
          />

          <div className="grid grid-cols-2 gap-3">
            <FieldSaran
              inputClass={INPUT}
              labelClass={LABEL}
              label="Nama Panggilan"
              value={isian.nama_panggilan}
              onChange={(v) => ubah('nama_panggilan', v)}
              saran={saranPanggilan}
            />
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
            <FieldSaran
              inputClass={INPUT}
              labelClass={LABEL}
              label="Tempat Lahir"
              value={isian.tempat_lahir}
              onChange={(v) => ubah('tempat_lahir', v)}
              saran={saranKota}
              placeholder="Ketik nama kota / kabupaten"
            />
            <div>
              <label className={LABEL}>Tanggal Lahir</label>
              <FieldTanggal
                nilai={isian.tanggal_lahir}
                onPilih={(v) => ubah('tanggal_lahir', v)}
                className={INPUT}
              />
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
                    {s === STATUS_MS ? 'Muballigh/ot Setempat (MS)' : s}
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
                onChange={(e) => ubah('no_wa', formatNomorWa(e.target.value))}
                placeholder="0812-3456-7890"
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
                onChange={(e) => ubah('rt', formatAngka(e.target.value))}
              />
            </div>
            <div>
              <label className={LABEL}>RW</label>
              <input
                className={INPUT}
                inputMode="numeric"
                value={isian.rw}
                onChange={(e) => ubah('rw', formatAngka(e.target.value))}
              />
            </div>
            <div className="col-span-2">
              <FieldSaran
                inputClass={INPUT}
                labelClass={LABEL}
                label="Kelurahan"
                value={isian.kelurahan}
                onChange={(v) => ubah('kelurahan', v)}
                onPilih={(item) => isiDariWilayah(item.rec)}
                saran={saranKelurahan}
                placeholder="Ketik kelurahan (Surabaya) — kecamatan dst. ikut terisi"
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
            disabled={menyimpan || perluBuatSubKelp}
            className="w-full rounded-[var(--radius-button)] border-none bg-navy px-5 py-3.5 text-[14px] font-extrabold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {menyimpan ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </div>
  );
}
