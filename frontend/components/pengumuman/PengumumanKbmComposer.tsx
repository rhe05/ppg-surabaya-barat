'use client';

/* Komposer "Pengumuman Jadwal KBM" -- porting SETIA dari generator app lama
   (Script_Main.html:8092-8365, generatePengumumanKBMText_): guru pilih
   tanggal, jadwal_kbm hari itu dirangkai otomatis jadi teks siap-tempel WA
   (format persis contoh owner -- salam, judul tebal, tiap sesi bernomor
   emoji, ikon 📍⏰🏠, catatan bernomor tebal di akhir), lalu bisa disalin
   atau disimpan sbg baris `pengumuman` (migrasi 20260823110000 baru
   membuka INSERT utk peran guru, scoped ke kelompoknya sendiri).

   Kategori "Cabe Rawit" dikelompokkan PER GURU (satu guru bisa py
   beberapa sesi/kelas sekaligus, app lama menyebutnya blok "Pengajar
   <nama>") -- kategori jenjang lain (Pra Remaja SMP/Remaja SMA/Muda-Mudi)
   satu blok PER SESI, urutan mengikuti KATEGORI_JENJANG (lib/kategori.ts,
   sama persis KATEGORI_JADWAL_UI_ app lama).

   Status Hadir/Diganti/Libur per sesi HANYA memengaruhi TEKS yang
   dihasilkan (persis pkbmOverrides_ app lama -- state sesi React, bukan
   ditulis ke jadwal_kbm) -- jadwal aslinya tidak tersentuh, guru yang mau
   membetulkan jadwal beneran tetap lewat layar /jadwal. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { KATEGORI_JENJANG } from '@/lib/kategori';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';

type Jadwal = {
  id: number;
  kategori: string;
  kelas: string;
  guru_id: number | null;
  jam_mulai: string;
  jam_selesai: string;
  ruangan: string | null;
  keterangan: string | null;
};
type Guru = { id: number; nama: string };
type StatusSesi = 'hadir' | 'diganti' | 'libur';
type Override = { status: StatusSesi; penggantiId?: number };

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const EMOJI_ANGKA = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const CATATAN_DEFAULT = [
  'Datang tepat waktu, jangan terlambat',
  'Memakai seragam Muslim/Muslimah',
  'Jangan lupa membawa uang untuk shodaqoh & kas',
].join('\n');

function angkaEmoji(n: number) {
  return n <= EMOJI_ANGKA.length ? EMOJI_ANGKA[n - 1] : `${n}.`;
}
function formatJam(j: string) {
  return (j || '').slice(0, 5).replace(':', '.');
}
function hariIni() {
  const d = new Date();
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}

const KELAS_LABEL = 'mb-1.5 block text-[12px] font-semibold text-text-dim';
const KELAS_SELECT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-2.5 py-1.5 text-[12.5px] ' +
  'text-text focus:border-brass focus:outline-none';
const KELAS_TOMBOL_UTAMA =
  'flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] border border-brass ' +
  'bg-brass px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:opacity-50';
const KELAS_TOMBOL_SEKUNDER =
  'flex cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border ' +
  'bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:opacity-50';

export default function PengumumanKbmComposer({
  kelompokId,
  namaKelompok,
  onTersimpan,
}: {
  kelompokId: number;
  namaKelompok: string;
  onTersimpan?: () => void;
}) {
  const [tanggal, setTanggal] = useState(hariIni());
  const [pickerTerbuka, setPickerTerbuka] = useState(false);
  const [posisiPicker, setPosisiPicker] = useState<PosisiPicker | null>(null);

  const [jadwalList, setJadwalList] = useState<Jadwal[]>([]);
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [catatan, setCatatan] = useState(CATATAN_DEFAULT);

  const [loading, setLoading] = useState(false);
  const [menyimpan, setMenyimpan] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('guru')
      .select('id, nama')
      .eq('kelompok_id', kelompokId)
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => setGuruList(data ?? []));
  }, [kelompokId]);

  const muat = useCallback(async () => {
    if (!tanggal) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('jadwal_kbm')
        .select('id, kategori, kelas, guru_id, jam_mulai, jam_selesai, ruangan, keterangan')
        .eq('kelompok_id', kelompokId)
        .eq('tanggal', tanggal)
        .order('jam_mulai');
      if (err) throw new Error(err.message);
      setJadwalList((data ?? []) as Jadwal[]);
      setOverrides({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat jadwal.');
    } finally {
      setLoading(false);
    }
  }, [kelompokId, tanggal]);

  useEffect(() => {
    muat();
  }, [muat]);

  const namaGuru = useCallback(
    (id: number | null) => guruList.find((g) => g.id === id)?.nama ?? '-',
    [guruList]
  );

  function setStatus(id: number, status: StatusSesi) {
    setOverrides((prev) => ({
      ...prev,
      [id]: { status, penggantiId: status === 'diganti' ? prev[id]?.penggantiId : undefined },
    }));
  }
  function setPengganti(id: number, penggantiId: number) {
    setOverrides((prev) => ({ ...prev, [id]: { status: 'diganti', penggantiId } }));
  }

  const jadwalUrut = useMemo(
    () =>
      [...jadwalList].sort((a, b) => {
        const ia = KATEGORI_JENJANG.indexOf(a.kategori);
        const ib = KATEGORI_JENJANG.indexOf(b.kategori);
        if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        return a.jam_mulai.localeCompare(b.jam_mulai);
      }),
    [jadwalList]
  );

  const tanggalObj = tanggal ? new Date(tanggal + 'T00:00:00') : null;
  const tanggalLabel = tanggalObj
    ? `${NAMA_HARI[tanggalObj.getDay()]}, ${tanggalObj.getDate()} ${NAMA_BULAN[tanggalObj.getMonth()]} ${tanggalObj.getFullYear()}`
    : '(pilih tanggal)';

  const teks = useMemo(() => {
    type Efektif = Jadwal & { penggantiDari?: string };
    const efektif: Efektif[] = [];
    for (const j of jadwalUrut) {
      const ov = overrides[j.id];
      if (ov?.status === 'libur') continue;
      if (ov?.status === 'diganti' && ov.penggantiId) {
        efektif.push({ ...j, guru_id: ov.penggantiId, penggantiDari: namaGuru(j.guru_id) });
      } else {
        efektif.push(j);
      }
    }

    const baris: string[] = [];
    baris.push('Assalamualaikum Wr. Wb. 🙏');
    baris.push('');
    baris.push(`*Pengumuman Jadwal KBM Generus ${namaKelompok}*`);
    baris.push('');
    baris.push(`📌 *${tanggalLabel}*`);

    let nomor = 0;

    const cabeRawit = efektif.filter((j) => j.kategori === 'Cabe Rawit');
    const perGuru: { guruId: number | null; guruNama: string; sesi: Efektif[] }[] = [];
    for (const j of cabeRawit) {
      let g = perGuru.find((x) => x.guruId === j.guru_id);
      if (!g) {
        g = { guruId: j.guru_id, guruNama: namaGuru(j.guru_id), sesi: [] };
        perGuru.push(g);
      }
      g.sesi.push(j);
    }
    for (const g of perGuru) {
      nomor += 1;
      baris.push('');
      baris.push(`${angkaEmoji(nomor)} *Pengajar ${g.guruNama}*`);
      g.sesi.forEach((j, i) => {
        if (i > 0) baris.push('');
        baris.push(
          `📍 *Sesi ${i + 1} : Kelas ${j.kelas}*${j.penggantiDari ? ` _(menggantikan ${j.penggantiDari})_` : ''}`
        );
        baris.push(
          `⏰ Jam : ${formatJam(j.jam_mulai)} - ${formatJam(j.jam_selesai)} WIB${j.keterangan ? ' (' + j.keterangan + ')' : ''}`
        );
        baris.push(`🏠 *Tempat : ${j.ruangan ?? '-'}*`);
      });
    }

    for (const kat of KATEGORI_JENJANG.filter((k) => k !== 'Cabe Rawit')) {
      for (const j of efektif.filter((x) => x.kategori === kat)) {
        nomor += 1;
        baris.push('');
        baris.push(`${angkaEmoji(nomor)} *Kelas ${kat}*`);
        baris.push(
          `Pengajar : *${namaGuru(j.guru_id)}*${j.penggantiDari ? ` _(menggantikan ${j.penggantiDari})_` : ''}`
        );
        baris.push(
          `⏰ Jam : ${formatJam(j.jam_mulai)} - ${formatJam(j.jam_selesai)} WIB${j.keterangan ? ' (' + j.keterangan + ')' : ''}`
        );
        baris.push(`🏠 *Tempat : ${j.ruangan ?? '-'}*`);
      }
    }

    if (nomor === 0) {
      baris.push('');
      baris.push('_(Belum ada Jadwal KBM di tanggal ini)_');
    }

    const catatanBaris = catatan
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (catatanBaris.length > 0) {
      baris.push('');
      baris.push('*Note :*');
      catatanBaris.forEach((n, i) => baris.push(`*${i + 1}. ${n}*`));
    }

    baris.push('');
    baris.push('Alhamdulillahi jaza kumullohu khoiro 🙏');
    baris.push('');
    baris.push('Wassalamualaikum Wr. Wb.');

    return baris.join('\n');
  }, [jadwalUrut, overrides, namaGuru, namaKelompok, tanggalLabel, catatan]);

  async function salin() {
    try {
      await navigator.clipboard.writeText(teks);
      setTersalin(true);
      setTimeout(() => setTersalin(false), 2000);
    } catch {
      setError('Gagal menyalin otomatis -- salin manual dari kotak pratinjau di bawah.');
    }
  }

  async function simpan() {
    setMenyimpan(true);
    setError(null);
    setPesan(null);
    try {
      const { error: err } = await supabase.from('pengumuman').insert({
        kelompok_id: kelompokId,
        judul: `Jadwal KBM ${tanggalLabel}`,
        isi: teks,
        tanggal,
      });
      if (err) throw new Error(err.message);
      setPesan('Pengumuman tersimpan.');
      onTersimpan?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className={KELAS_LABEL}>Tanggal KBM</label>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setPosisiPicker({ top: r.bottom + 6, right: window.innerWidth - r.right });
            setPickerTerbuka(true);
          }}
          className="flex w-full cursor-pointer items-center justify-between rounded-[var(--radius)] border border-border bg-panel px-3.5 py-2.5 text-[13px] text-text"
        >
          <span>{tanggalLabel}</span>
          <Calendar size={16} className="text-text-dim" />
        </button>
        <TanggalPicker
          terbuka={pickerTerbuka}
          posisi={posisiPicker}
          nilai={tanggal}
          onPilih={setTanggal}
          onTutup={() => setPickerTerbuka(false)}
        />
      </div>

      {loading && <p className="text-[13px] text-text-dim">Memuat jadwal...</p>}

      {!loading && jadwalUrut.length === 0 && (
        <p className="rounded-[var(--radius)] border border-border bg-panel-2 px-3.5 py-3 text-[12.5px] text-text-dim">
          Belum ada Jadwal KBM di tanggal ini.
        </p>
      )}

      {!loading && jadwalUrut.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {jadwalUrut.map((j) => {
            const ov = overrides[j.id];
            const status = ov?.status ?? 'hadir';
            return (
              <div key={j.id} className="rounded-[var(--radius)] border border-border bg-panel p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[13px] font-bold text-text">
                      {j.kategori === 'Cabe Rawit' ? `Kelas ${j.kelas}` : `Kelas ${j.kategori}`}
                    </div>
                    <div className="text-[12px] text-text-dim">
                      {namaGuru(j.guru_id)} &middot; {formatJam(j.jam_mulai)}-{formatJam(j.jam_selesai)} &middot;{' '}
                      {j.ruangan ?? '-'}
                    </div>
                  </div>
                  <select
                    className={KELAS_SELECT + ' w-auto shrink-0'}
                    value={status}
                    onChange={(e) => setStatus(j.id, e.target.value as StatusSesi)}
                  >
                    <option value="hadir">Hadir</option>
                    <option value="diganti">Izin - Diganti</option>
                    <option value="libur">Libur</option>
                  </select>
                </div>
                {status === 'diganti' && (
                  <select
                    className={KELAS_SELECT}
                    value={ov?.penggantiId ?? ''}
                    onChange={(e) => setPengganti(j.id, Number(e.target.value))}
                  >
                    <option value="">-- Digantikan oleh --</option>
                    {guruList
                      .filter((g) => g.id !== j.guru_id)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nama}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div>
        <label className={KELAS_LABEL}>Catatan (baris terpisah, otomatis diberi nomor)</label>
        <textarea
          rows={3}
          className={KELAS_SELECT + ' py-2.5'}
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
        />
      </div>

      <div>
        <label className={KELAS_LABEL}>Pratinjau</label>
        <pre className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-[var(--radius)] border border-border bg-panel-2 p-3.5 font-sans text-[12.5px] leading-relaxed text-text">
          {teks}
        </pre>
      </div>

      {pesan && <p className="text-[13px] text-sage">{pesan}</p>}
      {error && <p className="text-[13px] text-red">{error}</p>}

      <div className="flex gap-2.5">
        <button type="button" onClick={salin} className={KELAS_TOMBOL_SEKUNDER + ' flex-1'}>
          {tersalin ? <Check size={15} /> : <Copy size={15} />}
          {tersalin ? 'Tersalin' : 'Salin Teks'}
        </button>
        <button type="button" onClick={simpan} disabled={menyimpan} className={KELAS_TOMBOL_UTAMA + ' flex-1'}>
          {menyimpan ? 'Menyimpan...' : 'Simpan Pengumuman'}
        </button>
      </div>
    </div>
  );
}
