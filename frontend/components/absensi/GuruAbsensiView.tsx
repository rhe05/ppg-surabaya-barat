'use client';

/* Layar Input Absen khusus guru mobile — menyalin app lama sedekat mungkin:
   header hero hijau (nama, "Kelas X · Ruangan · N Santri", jam+durasi,
   tanggal), baris chip kelas kalau guru mengampu >1, kartu Ringkasan
   Kehadiran 4-warna, daftar santri (avatar inisial + nama + toggle status),
   tombol Simpan Kehadiran melayang di bawah.

   Sumber: Markup_Screens.html:194-225 (header), :445-469 (ringkasan+list+
   bottom bar), Style_Main.html:4859-5024 (header), :5688-5860 (ringkasan,
   kartu santri, toggle status, tombol simpan).

   Semua STATE dan LOGIKA (muat santri, simpan, penanganan tabrakan versi)
   tetap di app/absensi/page.tsx — komponen ini murni presentasi + popup
   pilih kelas, supaya jalur simpan yang sudah diuji (RPC simpan_absensi_
   kelas, penanganan 40001) tidak diduplikasi/berisiko menyimpang. */

import { useEffect, useState } from 'react';
import KelasGate, { KelasGateItem } from '@/components/absensi/KelasGate';

export type KelasDetail = {
  id: number;
  nama: string;
  ruangan: string | null;
  jam_mulai: string | null;
  jam_selesai: string | null;
  santri_count: number;
  kategori_kbm: { nama: string } | { nama: string }[] | null;
};

type Status = 'hadir' | 'izin' | 'sakit' | 'alpa';

const STATUS_URUT: { kunci: Status; label: string }[] = [
  { kunci: 'hadir', label: 'Hadir' },
  { kunci: 'izin', label: 'Izin' },
  { kunci: 'sakit', label: 'Sakit' },
  { kunci: 'alpa', label: 'Alpa' },
];

// .ia-status-btn.active[data-status="..."] — Style_Main.html:5821-5824.
// Sengaja BUKAN 4 warna yang sama dgn kartu Ringkasan di bawahnya (yang
// pakai --indigo utk Izin & --brass utk Sakit) — ini quirk app lama yang
// dipertahankan, bukan salah ketik.
const WARNA_TOGGLE_AKTIF: Record<Status, { bg: string; teks: string }> = {
  hadir: { bg: 'var(--sage)', teks: '#fff' },
  izin: { bg: 'var(--volt)', teks: '#78350F' },
  sakit: { bg: 'var(--indigo)', teks: '#fff' },
  alpa: { bg: 'var(--red)', teks: '#fff' },
};

function namaDariKategori(nilai: KelasDetail['kategori_kbm']) {
  if (!nilai) return null;
  const baris = Array.isArray(nilai) ? nilai[0] : nilai;
  return baris?.nama ?? null;
}

function jam(nilai: string | null) {
  return nilai ? nilai.slice(0, 5) : null;
}

function durasiMenit(mulai: string | null, selesai: string | null) {
  const a = jam(mulai);
  const b = jam(selesai);
  if (!a || !b) return null;
  const [ha, ma] = a.split(':').map(Number);
  const [hb, mb] = b.split(':').map(Number);
  if ([ha, ma, hb, mb].some((n) => Number.isNaN(n))) return null;
  const selisih = hb * 60 + mb - (ha * 60 + ma);
  return selisih > 0 ? selisih : null;
}

function inisial(nama: string) {
  const kata = nama.trim().split(/\s+/);
  const dua = (kata[0]?.[0] ?? '') + (kata[1]?.[0] ?? '');
  return dua.toUpperCase() || '?';
}

const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const NAMA_BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function labelTanggal(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return `${NAMA_HARI[d.getDay()]}, ${d.getDate()} ${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

export default function GuruAbsensiView({
  namaGuru,
  tanggal,
  onTanggalChange,
  kelasDetail,
  kelasId,
  onPilihKelas,
  santri,
  pilihan,
  onUbahStatus,
  loading,
  saving,
  sudahTersimpanSemua,
  error,
  pesan,
  onSimpan,
}: {
  namaGuru: string;
  tanggal: string;
  onTanggalChange: (v: string) => void;
  kelasDetail: KelasDetail[];
  kelasId: number | null;
  onPilihKelas: (id: number) => void;
  santri: { id: number; nama: string }[];
  pilihan: Record<number, Status>;
  onUbahStatus: (santriId: number, status: Status) => void;
  loading: boolean;
  saving: boolean;
  sudahTersimpanSemua: boolean;
  error: string | null;
  pesan: string | null;
  onSimpan: () => void;
}) {
  const [tanggalTerbuka, setTanggalTerbuka] = useState(false);
  const [gateTerbuka, setGateTerbuka] = useState(kelasDetail.length > 1 && kelasId === null);

  /* Gate muncul lagi kalau daftar kelas berubah (mis. baru selesai dimuat)
     dan belum ada pilihan — sekali dipilih, tidak diganggu lagi selama sesi
     ini walau kelasDetail me-refresh. */
  useEffect(() => {
    if (kelasDetail.length > 1 && kelasId === null) setGateTerbuka(true);
  }, [kelasDetail, kelasId]);

  const aktif = kelasDetail.find((k) => k.id === kelasId) ?? null;
  const ringkasan = STATUS_URUT.reduce(
    (acc, s) => {
      acc[s.kunci] = santri.filter((sn) => (pilihan[sn.id] ?? 'hadir') === s.kunci).length;
      return acc;
    },
    { hadir: 0, izin: 0, sakit: 0, alpa: 0 } as Record<Status, number>,
  );

  const gateDaftar: KelasGateItem[] = kelasDetail.map((k) => ({
    id: k.id,
    nama: k.nama,
    badge: namaDariKategori(k.kategori_kbm) === 'Cabe Rawit' ? 'Cabe Rawit' : null,
    info: [
      k.ruangan,
      jam(k.jam_mulai) && jam(k.jam_selesai) ? `${jam(k.jam_mulai)}–${jam(k.jam_selesai)}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    jumlah: k.santri_count,
  }));

  return (
    <main className="relative flex min-h-screen flex-col bg-bg pb-[110px]">
      <KelasGate
        terbuka={gateTerbuka}
        ikon={
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <path d="m9 14 2 2 4-4" />
          </svg>
        }
        judul="Pilih Kelas"
        subjudul="Allhamdulillah, Jenengan mengajar lebih dari satu kelas. Amal Sholih Pilih salah satu untuk mulai input absen."
        daftar={gateDaftar}
        onPilih={(item) => {
          onPilihKelas(item.id);
          setGateTerbuka(false);
        }}
        onBatal={() => setGateTerbuka(false)}
      />

      {/* .ia-header-hero — Style_Main.html:4859-4901 */}
      <div className="shrink-0 overflow-hidden rounded-b-3xl bg-panel shadow-[0_6px_20px_rgba(5,150,105,0.22)]">
        <div
          className="flex items-start justify-between gap-3 px-[18px] pt-4 pb-4 text-white"
          style={{ background: 'linear-gradient(135deg, var(--sage) 0%, var(--brand-green) 100%)' }}
        >
          <div className="min-w-0">
            <div className="text-[15px] font-bold">{namaGuru}</div>
            {aktif && (
              <div className="mt-1 text-[12.5px] font-medium text-white/90">
                Kelas {aktif.nama}
                {aktif.ruangan ? ` · ${aktif.ruangan}` : ''} · {aktif.santri_count} Santri
              </div>
            )}
            {aktif && jam(aktif.jam_mulai) && jam(aktif.jam_selesai) && (
              <div className="mt-0.5 text-[12.5px] font-medium text-white/90">
                {jam(aktif.jam_mulai)}–{jam(aktif.jam_selesai)}
                {durasiMenit(aktif.jam_mulai, aktif.jam_selesai) != null
                  ? ` · Durasi: ${durasiMenit(aktif.jam_mulai, aktif.jam_selesai)} Menit`
                  : ''}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={() => setTanggalTerbuka((v) => !v)}
              aria-label="Pilih tanggal"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-none bg-white/20 text-white active:scale-90"
            >
              <svg
                viewBox="0 0 24 24"
                width="19"
                height="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 2v4" />
                <path d="M16 2v4" />
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M3 10h18" />
              </svg>
            </button>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">
              {labelTanggal(tanggal)}
            </span>
          </div>
        </div>

        {tanggalTerbuka && (
          <div className="border-t border-border px-[18px] py-3">
            <input
              type="date"
              value={tanggal}
              onChange={(e) => {
                onTanggalChange(e.target.value);
                setTanggalTerbuka(false);
              }}
              className="w-full rounded-[var(--radius-lg)] border-[1.5px] border-border bg-panel-2 px-3.5 py-3 text-[14px] font-semibold text-text focus:border-brass focus:outline-none"
            />
          </div>
        )}

        {/* .ia-kelas-row — Style_Main.html:5110-5121 */}
        {kelasDetail.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-[18px] py-3.5">
            {kelasDetail.map((k) => {
              const inii = k.id === kelasId;
              return (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => onPilihKelas(k.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border-[1.5px] px-3.5 py-2 transition-all duration-150 active:scale-[0.96] ${
                    inii ? 'border-sage' : 'border-border bg-panel'
                  }`}
                  style={
                    inii
                      ? { background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' }
                      : undefined
                  }
                >
                  <span className="text-[13.5px] font-bold whitespace-nowrap text-text">
                    {k.nama}
                  </span>
                  {namaDariKategori(k.kategori_kbm) === 'Cabe Rawit' && (
                    <span className="text-[11px] font-semibold whitespace-nowrap text-text-dim">
                      · Cabe Rawit
                    </span>
                  )}
                  <span
                    className={`min-w-[18px] rounded-[var(--radius-button)] px-1.5 py-0.5 text-center text-[10.5px] font-bold ${
                      inii ? 'text-white' : 'bg-panel-2 text-text-dim'
                    }`}
                    style={inii ? { background: 'var(--sage)' } : undefined}
                  >
                    {k.santri_count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 px-[18px] py-4">
        {error && (
          <p className="mb-3 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
            {error}
          </p>
        )}
        {pesan && (
          <p className="mb-3 rounded-[var(--radius)] bg-[#ECFDF5] px-3.5 py-3 text-[13px] text-[#047857]">
            {pesan}
          </p>
        )}

        {loading ? (
          <p className="py-8 text-center text-[13px] text-text-faint">Memuat...</p>
        ) : kelasId === null ? (
          <p className="py-8 text-center text-[13px] text-text-faint">
            Pilih kelas terlebih dahulu.
          </p>
        ) : santri.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-faint">
            Belum ada santri di kelas ini.
          </p>
        ) : (
          <>
            {/* .ia-kehadiran-summary — Style_Main.html:5688-5751 */}
            <div className="mb-3.5 rounded-[var(--radius-lg)] bg-panel p-3.5 shadow-[var(--shadow-subtle)]">
              <div className="mb-2.5 text-[11px] font-bold tracking-[0.05em] text-text-faint uppercase">
                Ringkasan Kehadiran
              </div>
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    { kunci: 'hadir', label: 'Hadir', warna: 'var(--sage)', grad: '5,150,105' },
                    { kunci: 'izin', label: 'Izin', warna: 'var(--indigo)', grad: '79,70,229' },
                    { kunci: 'sakit', label: 'Sakit', warna: 'var(--brass)', grad: '217,119,6' },
                    { kunci: 'alpa', label: 'Alpa', warna: 'var(--red)', grad: '220,38,38' },
                  ] as const
                ).map((s) => (
                  <div
                    key={s.kunci}
                    className="relative overflow-hidden rounded-[10px] border px-1 pt-2.5 pb-[9px] text-center"
                    style={{
                      background: `linear-gradient(160deg, rgba(${s.grad},0.09), rgba(${s.grad},0.02))`,
                      borderColor: `rgba(${s.grad},0.2)`,
                    }}
                  >
                    <div
                      className="absolute top-0 right-0 left-0 h-[3px]"
                      style={{ background: s.warna }}
                    />
                    <div
                      className="text-[20px] leading-[1.2] font-extrabold"
                      style={{ color: s.warna }}
                    >
                      {ringkasan[s.kunci]}
                    </div>
                    <div className="mt-0.5 text-[10.5px] font-semibold text-text-dim">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* .ia-santri-card + .ia-status-toggle — Style_Main.html:5753-5824 */}
            <div>
              {santri.map((s) => {
                const status = pilihan[s.id] ?? 'hadir';
                return (
                  <div
                    key={s.id}
                    className="mb-2.5 flex items-center gap-3 rounded-[var(--radius-lg)] bg-panel p-3 shadow-[var(--shadow-subtle)]"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, var(--indigo), var(--teal))' }}
                    >
                      {inisial(s.nama)}
                    </div>
                    <div className="min-w-0 flex-1 truncate text-[14px] font-semibold text-text">
                      {s.nama}
                    </div>
                    <div className="flex shrink-0 gap-[3px] rounded-[var(--radius-button)] bg-bg p-[3px]">
                      {STATUS_URUT.map((opsi) => {
                        const aktifBtn = status === opsi.kunci;
                        return (
                          <button
                            key={opsi.kunci}
                            type="button"
                            onClick={() => onUbahStatus(s.id, opsi.kunci)}
                            className="cursor-pointer rounded-[var(--radius-button)] border-none px-2 py-1.5 text-[11px] font-bold transition-all duration-150 active:scale-[0.92]"
                            style={
                              aktifBtn
                                ? {
                                    background: WARNA_TOGGLE_AKTIF[opsi.kunci].bg,
                                    color: WARNA_TOGGLE_AKTIF[opsi.kunci].teks,
                                  }
                                : { background: 'transparent', color: 'var(--text-faint)' }
                            }
                          >
                            {opsi.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* .ia-bottom-bar + .ia-save-btn — Style_Main.html:5826-5852 */}
      {kelasId !== null && santri.length > 0 && (
        <div
          className="fixed right-0 bottom-0 left-0 px-[18px] pt-3.5 pb-[calc(14px+env(safe-area-inset-bottom))]"
          style={{ background: 'linear-gradient(180deg, rgba(248,250,252,0) 0%, var(--bg) 30%)' }}
        >
          <button
            type="button"
            onClick={onSimpan}
            disabled={saving || loading}
            className="w-full cursor-pointer rounded-[var(--radius-lg)] border-none py-[15px] text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(5,150,105,0.3)] transition-transform duration-150 active:scale-[0.98] disabled:opacity-60"
            style={{
              background: sudahTersimpanSemua
                ? 'linear-gradient(135deg, #94A3B8, #64748B)'
                : 'linear-gradient(135deg, var(--sage), var(--brand-green))',
              boxShadow: sudahTersimpanSemua
                ? '0 4px 12px rgba(100,116,139,0.25)'
                : '0 6px 16px rgba(5,150,105,0.3)',
            }}
          >
            {saving
              ? 'Menyimpan...'
              : sudahTersimpanSemua
                ? '✓ Absen Tersimpan — Simpan Lagi'
                : 'Simpan Kehadiran'}
          </button>
        </div>
      )}
    </main>
  );
}
