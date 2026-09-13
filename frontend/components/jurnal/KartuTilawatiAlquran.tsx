'use client';

/* Kartu "Tilawati" / "Al-Qur'an" (Pelaksanaan Pembelajaran, guru mobile)
   -- DIPISAH dari PelaksanaanPembelajaranView.tsx (2026-09-13, diminta
   owner): kelas GABUNGAN (Gabung Kelas "tanpa batas waktu") bisa memuat
   DUA grade sekaligus (mis. kelas 3 + Pra Remaja SMP) -- santri kelas 3
   masih Tilawati (Jilid/Halaman), santri kelas 4+ sudah Al-Qur'an (Juz/
   Surat/Ayat). Dulu SATU kartu dgn SATU `pakaiAlquran` polos per kelas
   (grade tertinggi menang, salah utk anggota grade rendah). Komponen ini
   dipanggil SEKALI kalau kelasnya tidak lintas-grade (perilaku identik
   sebelumnya), atau DUA KALI (satu per grade) kalau lintas-grade --
   lihat pisahTilawatiAlquran() (lib/kelasKurikulum.ts) & pemanggilnya di
   PelaksanaanPembelajaranView.tsx.

   Isi & mekanik SALINAN PERSIS kartu lama: per santri Buku Jilid/Halaman
   (atau Juz/Surat/Ayat utk Al-Qur'an) + sakelar Naik/Tetap, simpan
   otomatis (auto-save 700ms), prefill dari catatan terakhir
   (lanjutkanTilawati utk Tilawati, apa adanya utk Al-Qur'an). Catatan
   TETAP diatribusikan ke kelas_id ASLI tiap santri (2026-09-13,
   "sesuaikan dengan kelasnya"), bukan kelasId gabungan/induk -- fallback
   ke `kelasIdFallback` kalau petanya belum sempat termuat. */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, Equal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Skeleton from '@/components/ui/Skeleton';
import SelectKustom from '@/components/ui/SelectKustom';
import TanggalPicker, { type PosisiPicker } from '@/components/ui/TanggalPicker';
import { useToast } from '@/components/ui/useToast';
import { jumlahAyatSurat } from '@/lib/suratAlQuran';
import {
  TILAWATI_MAKS_HALAMAN,
  OPSI_BUKU_JILID,
  OPSI_JUZ_ALQURAN,
  OPSI_SURAT_ALQURAN,
  jepitTilawati,
  uraikanHalaman,
  gabungHalaman,
  lanjutkanTilawati,
} from '@/lib/tilawati';

function todayStr() {
  const d = new Date();
  const dua = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`;
}
function tanggalPanjang(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
function tanggalSingkat(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

type BarisTilawati = {
  jilid: string;
  halaman: string;
  surat: string;
  ayat: string;
  status: '' | 'naik' | 'tetap';
};
const BARIS_KOSONG: BarisTilawati = { jilid: '', halaman: '', surat: '', ayat: '', status: '' };

export default function KartuTilawatiAlquran({
  judul,
  pakaiAlquran,
  anggotaIds,
  kelasIdFallback,
  profileId,
  peragaNode,
  jamMulaiKelas,
  jamKini,
}: {
  judul: string;
  pakaiAlquran: boolean;
  /* kelas_id FISIK yang santrinya masuk kartu INI (bukan seluruh
     gabungan -- lihat pisahTilawatiAlquran). */
  anggotaIds: number[];
  kelasIdFallback: number;
  profileId: string | null;
  /* Peraga Tilawati (materi "Baca Huruf Al-Qur'an") -- HANYA relevan
     kartu Tilawati (bukan Al-Qur'an), dirender di sini lewat prop krn
     sumbernya (jurnal_materi) & renderernya (barisMateri) milik
     komponen induk. null/undefined = tidak ditampilkan sama sekali. */
  peragaNode?: ReactNode;
  /* Kunci input -- konsep SAMA dgn Input Kehadiran (diminta owner
     2026-09-03): tanggal yang dipilih baru bisa diisi kalau jam mulai
     KBM-nya sudah lewat (HANYA relevan kalau tanggal = hari ini);
     tanggal lampau bebas, tanggal depan terkunci total. Dihitung DI
     SINI (bukan dari komponen induk) krn `tanggal` sekarang state
     lokal komponen ini sendiri (dulu satu tanggal utk seluruh kelas,
     sekarang bisa beda per kartu kalau lintas-grade). */
  jamMulaiKelas: string | null;
  jamKini: string;
}) {
  const { push } = useToast();
  const [cardTerbuka, setCardTerbuka] = useState(false);
  const [santri, setSantri] = useState<{ id: number; nama: string }[]>([]);
  const kelasAsliSantriRef = useRef<Map<number, number>>(new Map());
  const [tilawati, setTilawati] = useState<Record<number, BarisTilawati>>({});
  const [loading, setLoading] = useState(false);
  const [tanggal, setTanggal] = useState(todayStr());
  const [pickerTerbuka, setPickerTerbuka] = useState(false);
  const [posisiPicker, setPosisiPicker] = useState<PosisiPicker | null>(null);
  const tanggalBtnRef = useRef<HTMLButtonElement>(null);
  const tilawatiRef = useRef<Record<number, BarisTilawati>>({});
  tilawatiRef.current = tilawati;
  const tundaRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const timers = tundaRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const anggotaKey = anggotaIds.join(',');

  const alasanTerkunciTeks: string | null =
    tanggal === todayStr() && jamMulaiKelas && jamKini < jamMulaiKelas
      ? `Sesi ngaji kelas ini baru mulai jam ${jamMulaiKelas.replace(':', '.')}.`
      : tanggal > todayStr()
        ? `Baru bisa diisi ${tanggalPanjang(tanggal)}.`
        : null;

  const muat = useCallback(async () => {
    if (anggotaIds.length === 0) {
      setSantri([]);
      setTilawati({});
      return;
    }
    setLoading(true);
    try {
      const hariIni = tanggal;
      const [sRes, tRes] = await Promise.all([
        supabase.from('santri').select('id, nama, kelas_id').in('kelas_id', anggotaIds).is('deleted_at', null).order('nama'),
        supabase
          .from('tilawati_pelaksanaan')
          .select('santri_id, tanggal, buku_jilid, halaman, surat, ayat, status')
          .in('kelas_id', anggotaIds)
          .lte('tanggal', hariIni)
          .order('tanggal', { ascending: true }),
      ]);
      if (sRes.error) throw new Error(sRes.error.message);
      if (tRes.error) throw new Error(tRes.error.message);
      const santriRows = (sRes.data ?? []) as { id: number; nama: string; kelas_id: number }[];
      setSantri(santriRows.map((s) => ({ id: s.id, nama: s.nama })));
      kelasAsliSantriRef.current = new Map(santriRows.map((s) => [s.id, s.kelas_id]));

      const perSantri = new Map<number, (BarisTilawati & { tanggal: string })[]>();
      for (const r of (tRes.data ?? []) as {
        santri_id: number;
        tanggal: string;
        buku_jilid: string | null;
        halaman: string | null;
        surat: string | null;
        ayat: string | null;
        status: string | null;
      }[]) {
        const arr = perSantri.get(r.santri_id) ?? [];
        arr.push({
          tanggal: r.tanggal,
          jilid: r.buku_jilid ?? '',
          halaman: r.halaman ?? '',
          surat: r.surat ?? '',
          ayat: r.ayat ?? '',
          status: (r.status as '' | 'naik' | 'tetap') || '',
        });
        perSantri.set(r.santri_id, arr);
      }
      const peta: Record<number, BarisTilawati> = {};
      for (const [sid, arr] of perSantri) {
        const todayRow = arr.find((x) => x.tanggal === hariIni);
        const last = [...arr].reverse().find((x) => x.tanggal < hariIni);
        const adaIsiTgl =
          !!todayRow &&
          (todayRow.jilid !== '' || todayRow.halaman !== '' || todayRow.surat !== '' ||
            todayRow.ayat !== '' || todayRow.status !== '');
        if (adaIsiTgl) {
          peta[sid] = {
            jilid: todayRow!.jilid,
            halaman: todayRow!.halaman,
            surat: todayRow!.surat,
            ayat: todayRow!.ayat,
            status: todayRow!.status,
          };
        } else if (last) {
          peta[sid] = pakaiAlquran ? { ...last, status: '' } : lanjutkanTilawati(last);
        }
      }
      setTilawati(peta);
    } catch (e) {
      push(e instanceof Error ? e.message : `Gagal memuat ${judul}.`, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anggotaKey, tanggal, pakaiAlquran]);
  useEffect(() => {
    muat();
  }, [muat]);

  const simpan = useCallback(
    async (santriId: number) => {
      if (anggotaIds.length === 0) return;
      const b = tilawatiRef.current[santriId] ?? BARIS_KOSONG;
      try {
        const { error } = await supabase.from('tilawati_pelaksanaan').upsert(
          {
            kelas_id: kelasAsliSantriRef.current.get(santriId) ?? kelasIdFallback,
            santri_id: santriId,
            tanggal,
            buku_jilid: b.jilid.trim() === '' ? null : b.jilid.trim(),
            halaman: b.halaman.trim() === '' ? null : b.halaman.trim(),
            surat: b.surat.trim() === '' ? null : b.surat.trim(),
            ayat: b.ayat.trim() === '' ? null : b.ayat.trim(),
            status: b.status === '' ? null : b.status,
            dibuat_oleh: profileId,
          },
          { onConflict: 'santri_id,tanggal' },
        );
        if (error) throw new Error(error.message);
      } catch (e) {
        push(e instanceof Error ? e.message : `Gagal menyimpan ${judul}.`, 'error');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anggotaKey, kelasIdFallback, tanggal, profileId, push, judul],
  );

  function ubah(santriId: number, patch: Partial<BarisTilawati>, langsung: boolean) {
    setTilawati((prev) => {
      const cur: BarisTilawati = prev[santriId] ?? BARIS_KOSONG;
      return { ...prev, [santriId]: { ...cur, ...patch } };
    });
    const timers = tundaRef.current;
    const lama = timers.get(santriId);
    if (lama) clearTimeout(lama);
    timers.set(
      santriId,
      setTimeout(
        () => {
          timers.delete(santriId);
          void simpan(santriId);
        },
        langsung ? 0 : 700,
      ),
    );
  }

  return (
    <div className="kartu-premium mb-4 overflow-hidden" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--teal)' }}>
      <div className="flex items-center justify-between gap-2 p-4">
        <button
          type="button"
          onClick={() => setCardTerbuka((v) => !v)}
          className="flex min-w-0 cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
        >
          <span className="text-[15px] font-bold text-text">{judul}</span>
        </button>
        <button
          ref={tanggalBtnRef}
          type="button"
          onClick={() => {
            const rect = tanggalBtnRef.current?.getBoundingClientRect();
            if (rect) setPosisiPicker({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
            setPickerTerbuka((v) => !v);
          }}
          className="shrink-0 text-[11px] font-semibold text-teal active:opacity-70"
        >
          {tanggalSingkat(tanggal)}
        </button>
      </div>
      <TanggalPicker
        terbuka={pickerTerbuka}
        posisi={posisiPicker}
        nilai={tanggal}
        onPilih={(v) => {
          setTanggal(v);
          setPickerTerbuka(false);
        }}
        onTutup={() => setPickerTerbuka(false)}
        tanggalNonaktif={(tglStr) => (tglStr > todayStr() ? { alasan: 'Belum terjadi' } : null)}
      />
      {cardTerbuka && (
        <div className="border-t border-border">
          {!pakaiAlquran && peragaNode}
          <div className="label-mikro border-y border-border bg-panel-2 px-4 py-2">
            {pakaiAlquran ? "Al-Qur'an" : 'Buku Jilid'}
          </div>
          <div className="p-3">
            {loading && santri.length === 0 ? (
              <div className="flex flex-col gap-2.5">
                <Skeleton className="h-[92px] w-full" />
                <Skeleton className="h-[92px] w-full" />
              </div>
            ) : santri.length === 0 ? (
              <p className="text-[13px] text-text-dim">Belum ada santri di kelas ini.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {alasanTerkunciTeks && (
                  <p className="rounded-[var(--radius)] bg-panel-2 px-3 py-2 text-[12px] leading-snug text-text-dim">
                    {alasanTerkunciTeks}
                  </p>
                )}
                {santri.map((s) => {
                  const t = tilawati[s.id] ?? BARIS_KOSONG;
                  const terkunci = alasanTerkunciTeks !== null;
                  const maksAyat = jumlahAyatSurat(t.surat) ?? 300;
                  return (
                    <div key={s.id} className="rounded-[var(--radius)] border border-border bg-panel p-3">
                      <div className="mb-2 text-[13px] font-bold text-text">{s.nama}</div>
                      {pakaiAlquran ? (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="label-mikro mb-1 block">Juz</label>
                              <SelectKustom
                                value={t.jilid}
                                onChange={(v) => ubah(s.id, { jilid: v }, true)}
                                disabled={terkunci}
                                placeholder="Pilih Juz"
                                opsi={OPSI_JUZ_ALQURAN}
                              />
                            </div>
                            <div>
                              <label className="label-mikro mb-1 block">Surat</label>
                              <SelectKustom
                                value={t.surat}
                                onChange={(v) => ubah(s.id, { surat: v, ayat: '' }, true)}
                                disabled={terkunci}
                                placeholder="Pilih Surat"
                                opsi={OPSI_SURAT_ALQURAN}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="label-mikro mb-1 block">
                              Ayat{t.surat ? ` (1–${maksAyat})` : ''}
                            </label>
                            {(() => {
                              const { dari, sampai } = uraikanHalaman(t.ayat);
                              return (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={maksAyat}
                                    disabled={terkunci}
                                    value={dari}
                                    onChange={(e) => {
                                      const baru = jepitTilawati(e.target.value, maksAyat);
                                      ubah(s.id, { ayat: gabungHalaman(baru, sampai) }, false);
                                    }}
                                    className="w-full rounded-[var(--radius)] border border-border bg-panel px-2 py-2 text-center text-[13px] text-text focus:border-brass focus:outline-none disabled:opacity-60"
                                  />
                                  <span className="shrink-0 text-[12px] text-text-faint">s/d</span>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={maksAyat}
                                    disabled={terkunci}
                                    value={sampai}
                                    onChange={(e) => {
                                      const baru = jepitTilawati(e.target.value, maksAyat);
                                      ubah(s.id, { ayat: gabungHalaman(dari, baru) }, false);
                                    }}
                                    className="w-full rounded-[var(--radius)] border border-border bg-panel px-2 py-2 text-center text-[13px] text-text focus:border-brass focus:outline-none disabled:opacity-60"
                                  />
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-[2fr_1fr_1fr] gap-2">
                          <div>
                            <label className="label-mikro mb-1 block">Buku Jilid</label>
                            <SelectKustom
                              value={t.jilid}
                              onChange={(v) => ubah(s.id, { jilid: v }, true)}
                              disabled={terkunci}
                              placeholder="Pilih"
                              opsi={OPSI_BUKU_JILID}
                            />
                          </div>
                          {(() => {
                            const { dari, sampai } = uraikanHalaman(t.halaman);
                            return (
                              <>
                                <div>
                                  <label className="label-mikro mb-1 block">Dari</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={TILAWATI_MAKS_HALAMAN}
                                    disabled={terkunci}
                                    value={dari}
                                    onChange={(e) => {
                                      const baru = jepitTilawati(e.target.value, TILAWATI_MAKS_HALAMAN);
                                      ubah(s.id, { halaman: gabungHalaman(baru, sampai) }, false);
                                    }}
                                    className="w-full rounded-[var(--radius)] border border-border bg-panel px-2 py-2 text-center text-[13px] text-text focus:border-brass focus:outline-none disabled:opacity-60"
                                  />
                                </div>
                                <div>
                                  <label className="label-mikro mb-1 block">Sampai</label>
                                  <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={TILAWATI_MAKS_HALAMAN}
                                    disabled={terkunci}
                                    value={sampai}
                                    onChange={(e) => {
                                      const baru = jepitTilawati(e.target.value, TILAWATI_MAKS_HALAMAN);
                                      ubah(s.id, { halaman: gabungHalaman(dari, baru) }, false);
                                    }}
                                    className="w-full rounded-[var(--radius)] border border-border bg-panel px-2 py-2 text-center text-[13px] text-text focus:border-brass focus:outline-none disabled:opacity-60"
                                  />
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                      <div className="mt-2.5 flex gap-1.5 rounded-full bg-panel-2 p-1">
                        {([
                          { opt: 'naik', label: 'Naik', Ikon: ArrowUp, warna: 'var(--sage)' },
                          { opt: 'tetap', label: 'Tetap', Ikon: Equal, warna: 'var(--indigo)' },
                        ] as const).map(({ opt, label, Ikon, warna }) => {
                          const aktif = t.status === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              disabled={terkunci}
                              onClick={() => ubah(s.id, { status: aktif ? '' : opt }, true)}
                              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[13px] font-bold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${
                                aktif ? 'text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]' : 'bg-transparent text-text-dim'
                              }`}
                              style={aktif ? { background: warna } : undefined}
                            >
                              <Ikon size={15} strokeWidth={2.6} />
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
