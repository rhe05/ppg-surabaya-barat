'use client';

/* Layar pendaftaran akun baru — muncul untuk akun yang sudah punya sesi tapi
   profilnya masih tanpa peran (role NULL), baik dari Google maupun email.

   Bahasa layar ini sengaja "mengajukan", bukan "memilih": apa pun yang
   ditekan di sini TIDAK memberi akses. Tulisan di kartu tinjauan dan pada
   tombol kirim mengatakan itu apa adanya, supaya orang tidak menunggu
   dashboard yang tidak akan terbuka sendiri. Penegakannya ada di DB
   (migrasi 20260819090000): tabel pendaftaran_akun cuma menyimpan
   permintaan, hak baru berpindah lewat RPC setujui_pendaftaran().

   Rangka visual mengikuti .login-card app lama (kartu putih, logo + judul
   hijau, cincin fokus brass) supaya terasa satu keluarga dengan layar Masuk;
   yang ditambah cuma hal yang memang tidak ada di app lama: indikator
   langkah, kartu pilihan yang bisa ditekan (target sentuh 44px), dan
   ringkasan sebelum kirim. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type Peran = 'guru' | 'admin_kelompok' | 'admin_desa' | 'admin_ppg';

type KelompokTerbuka = {
  id: number;
  nama: string;
  desa_id: number;
  desa: { nama: string } | { nama: string }[] | null;
};

type Pendaftaran = {
  nama_lengkap: string;
  peran_diminta: Peran;
  kelompok_id: number | null;
  desa_id: number | null;
  ppg_id: number | null;
  status: 'menunggu' | 'disetujui' | 'ditolak';
  alasan_tolak: string | null;
  created_at: string;
};

const PERAN: {
  nilai: Peran;
  judul: string;
  ringkas: string;
  lingkup: 'kelompok' | 'desa' | 'ppg';
}[] = [
  {
    nilai: 'guru',
    judul: 'Guru',
    ringkas: 'Mengisi absensi & jurnal KBM kelas yang diampu',
    lingkup: 'kelompok',
  },
  {
    nilai: 'admin_kelompok',
    judul: 'Admin Kelp',
    ringkas: 'Mengelola santri, guru, dan jadwal satu kelompok',
    lingkup: 'kelompok',
  },
  {
    nilai: 'admin_desa',
    judul: 'Admin Desa',
    ringkas: 'Memantau seluruh kelompok dalam satu desa',
    lingkup: 'desa',
  },
  {
    nilai: 'admin_ppg',
    judul: 'Admin Aplikasi',
    ringkas: 'Akses penuh seluruh desa & kelompok se-PPG',
    lingkup: 'ppg',
  },
];

function satuDari<T>(nilai: T | T[] | null): T | null {
  if (!nilai) return null;
  return Array.isArray(nilai) ? (nilai[0] ?? null) : nilai;
}

const KELAS_INPUT =
  'w-full rounded-[var(--radius)] border border-border bg-panel px-3.5 py-3 text-[14px] ' +
  'text-text placeholder:text-text-faint focus:border-brass ' +
  'focus:shadow-[0_0_0_3px_rgba(217,119,6,0.1)] focus:outline-none';

/* Kartu pilihan: tinggi minimum 44px mengikuti aturan target sentuh app lama,
   dan penanda terpilih TIDAK hanya warna — ada cincin + tanda centang, supaya
   tetap terbaca pada layar terang dan bagi yang sulit membedakan warna. */
function KartuPilihan({
  terpilih,
  judul,
  ringkas,
  onClick,
}: {
  terpilih: boolean;
  judul: string;
  ringkas?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={terpilih}
      className={`flex min-h-[44px] w-full cursor-pointer items-start gap-3 rounded-[var(--radius)] border p-3.5 text-left transition-colors duration-150 ${
        terpilih
          ? 'border-brass bg-[#FFFBEB] shadow-[0_0_0_3px_rgba(217,119,6,0.1)]'
          : 'border-border bg-panel hover:bg-panel-2'
      }`}
    >
      <span
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
          terpilih ? 'border-brass bg-brass' : 'border-border'
        }`}
      >
        {terpilih && (
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" strokeWidth="4">
            <path d="M4 12l6 6L20 6" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-text">{judul}</span>
        {ringkas && <span className="mt-0.5 block text-[12.5px] text-text-dim">{ringkas}</span>}
      </span>
    </button>
  );
}

function Kartu({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-5">
      <div className="w-full max-w-[520px] rounded-[var(--radius-lg)] bg-panel px-7 py-9 shadow-[var(--shadow-card)] sm:px-9">
        <div className="mb-7 flex flex-col items-center gap-2.5 text-center">
          <Image src="/ruang-ngaji-logo.png" alt="Ruang Ngaji" width={44} height={40} priority />
          <div className="text-[26px] font-bold text-brand-green">Ruang Ngaji</div>
        </div>
        {children}
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  const { session, user, profile, signOut } = useAuth();
  const router = useRouter();

  const [memuat, setMemuat] = useState(true);
  const [kelompokList, setKelompokList] = useState<KelompokTerbuka[]>([]);
  const [pendaftaran, setPendaftaran] = useState<Pendaftaran | null>(null);

  const [langkah, setLangkah] = useState<1 | 2>(1);
  const [nama, setNama] = useState('');
  const [peran, setPeran] = useState<Peran | null>(null);
  const [kelompokId, setKelompokId] = useState<number | null>(null);
  const [desaId, setDesaId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mengirim, setMengirim] = useState(false);

  /* Sudah punya peran = tidak ada yang perlu didaftarkan lagi. */
  useEffect(() => {
    if (profile?.role) router.replace('/dashboard');
  }, [profile, router]);

  const muat = useCallback(async () => {
    if (!user) return;
    setMemuat(true);

    const [hasilKelompok, hasilPendaftaran] = await Promise.all([
      supabase
        .from('kelompok')
        .select('id, nama, desa_id, desa:desa_id(nama)')
        .eq('pendaftaran_terbuka', true)
        .order('nama'),
      supabase
        .from('pendaftaran_akun')
        .select(
          'nama_lengkap, peran_diminta, kelompok_id, desa_id, ppg_id, status, alasan_tolak, created_at',
        )
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    if (hasilKelompok.data) setKelompokList(hasilKelompok.data as KelompokTerbuka[]);
    const p = (hasilPendaftaran.data as Pendaftaran | null) ?? null;
    setPendaftaran(p);

    /* Permintaan yang ditolak dimuat kembali ke form supaya orangnya
       membetulkan, bukan mengetik ulang dari nol. */
    if (p) {
      setNama(p.nama_lengkap);
      setPeran(p.peran_diminta);
      setKelompokId(p.kelompok_id);
      setDesaId(p.desa_id);
    }
    setMemuat(false);
  }, [user]);

  useEffect(() => {
    if (session === null) {
      router.replace('/auth/login');
      return;
    }
    if (user) muat();
  }, [session, user, muat, router]);

  const desaTerbuka = Array.from(
    new Map(
      kelompokList.map((k) => [
        k.desa_id,
        { id: k.desa_id, nama: satuDari(k.desa)?.nama ?? `Desa ${k.desa_id}` },
      ]),
    ).values(),
  );

  const lingkup = PERAN.find((p) => p.nilai === peran)?.lingkup ?? null;
  const scopeTerisi =
    lingkup === 'kelompok'
      ? kelompokId !== null
      : lingkup === 'desa'
        ? desaId !== null
        : lingkup === 'ppg';
  const namaValid = nama.trim().length >= 3;

  function gantiPeran(baru: Peran) {
    setPeran(baru);
    setError(null);
    /* Scope lama dibuang saat peran berganti — chk_pendaftaran_scope di DB
       menolak kombinasi peran+scope yang tidak cocok, jadi sisa pilihan lama
       akan jadi kegagalan yang membingungkan kalau dibiarkan menempel. */
    setKelompokId(null);
    setDesaId(null);
  }

  async function kirim() {
    if (!user || !peran) return;
    setError(null);
    setMengirim(true);
    try {
      const { error: errKirim } = await supabase.from('pendaftaran_akun').upsert(
        {
          id: user.id,
          nama_lengkap: nama.trim(),
          peran_diminta: peran,
          kelompok_id: lingkup === 'kelompok' ? kelompokId : null,
          desa_id: lingkup === 'desa' ? desaId : null,
          ppg_id: lingkup === 'ppg' ? 1 : null,
        },
        { onConflict: 'id' },
      );
      if (errKirim) {
        setError(errKirim.message);
        return;
      }
      await muat();
      setLangkah(1);
    } catch {
      setError('Gagal terhubung ke server — periksa koneksi Anda');
    } finally {
      setMengirim(false);
    }
  }

  async function keluar() {
    await signOut();
    router.push('/auth/login');
  }

  if (memuat) {
    return (
      <Kartu>
        <p className="text-center text-[14px] text-text-dim">Memuat...</p>
      </Kartu>
    );
  }

  /* --- Sudah mengirim & belum ditinjau --- */
  if (pendaftaran?.status === 'menunggu') {
    const namaScope =
      kelompokList.find((k) => k.id === pendaftaran.kelompok_id)?.nama ??
      desaTerbuka.find((d) => d.id === pendaftaran.desa_id)?.nama ??
      'Seluruh PPG';
    return (
      <Kartu>
        <div className="rounded-[var(--radius)] bg-[#FFFBEB] px-4 py-3.5 text-[13px] text-[#92400E]">
          Pendaftaran Anda sudah terkirim dan sedang menunggu persetujuan admin. Data baru bisa
          dibuka setelah disetujui.
        </div>
        <dl className="mt-5 space-y-2.5 text-[13.5px]">
          <Baris label="Nama" nilai={pendaftaran.nama_lengkap} />
          <Baris
            label="Peran diminta"
            nilai={
              PERAN.find((p) => p.nilai === pendaftaran.peran_diminta)?.judul ??
              pendaftaran.peran_diminta
            }
          />
          <Baris label="Lingkup" nilai={namaScope} />
          <Baris label="Akun" nilai={user?.email ?? '-'} />
        </dl>
        <button
          type="button"
          onClick={() => {
            setPendaftaran(null);
            setLangkah(1);
          }}
          className="mt-6 w-full cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel px-4 py-3 text-[13.5px] font-semibold text-text hover:bg-panel-2"
        >
          Ubah pendaftaran
        </button>
        <button
          type="button"
          onClick={keluar}
          className="mt-2.5 w-full cursor-pointer border-none bg-transparent p-2 text-[13px] text-text-dim hover:text-brass hover:underline"
        >
          Keluar
        </button>
      </Kartu>
    );
  }

  /* --- Form: langkah 1 (isi) & langkah 2 (tinjau) --- */
  return (
    <Kartu>
      {pendaftaran?.status === 'ditolak' && (
        <div className="mb-5 rounded-[var(--radius)] bg-[#FEF2F2] px-4 py-3.5 text-[13px] text-red">
          Pendaftaran sebelumnya ditolak
          {pendaftaran.alasan_tolak ? `: ${pendaftaran.alasan_tolak}` : '.'} Anda bisa membetulkan
          data di bawah lalu mengirim lagi.
        </div>
      )}

      {/* Indikator langkah */}
      <div className="mb-6 flex items-center gap-2.5">
        {([1, 2] as const).map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2.5">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                langkah >= n ? 'bg-brass text-white' : 'bg-panel-2 text-text-faint'
              }`}
            >
              {n}
            </span>
            <span
              className={`text-[12.5px] font-medium ${langkah >= n ? 'text-text' : 'text-text-faint'}`}
            >
              {n === 1 ? 'Data & peran' : 'Tinjau'}
            </span>
            {n === 1 && <span className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {langkah === 1 ? (
        <>
          <div className="mb-5">
            <label className="mb-2 block text-[12px] font-medium text-text-dim" htmlFor="nama">
              Nama lengkap
            </label>
            <input
              id="nama"
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Nama sesuai data kelompok"
              autoComplete="off"
              className={KELAS_INPUT}
            />
            <p className="mt-1.5 text-[12px] text-text-faint">
              Nama ini yang muncul di aplikasi dan dilihat admin saat menyetujui.
            </p>
          </div>

          <div className="mb-5">
            <p className="mb-2 text-[12px] font-medium text-text-dim">Peran yang diminta</p>
            <div className="grid gap-2">
              {PERAN.map((p) => (
                <KartuPilihan
                  key={p.nilai}
                  terpilih={peran === p.nilai}
                  judul={p.judul}
                  ringkas={p.ringkas}
                  onClick={() => gantiPeran(p.nilai)}
                />
              ))}
            </div>
          </div>

          {lingkup === 'kelompok' && (
            <div className="mb-5">
              <p className="mb-2 text-[12px] font-medium text-text-dim">Kelompok</p>
              <div className="grid gap-2">
                {kelompokList.map((k) => (
                  <KartuPilihan
                    key={k.id}
                    terpilih={kelompokId === k.id}
                    judul={k.nama}
                    ringkas={`Desa ${satuDari(k.desa)?.nama ?? k.desa_id}`}
                    onClick={() => {
                      setKelompokId(k.id);
                      setError(null);
                    }}
                  />
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-text-faint">
                Kelompok lain menyusul dibuka. Hubungi admin kalau kelompok Anda belum ada di daftar
                ini.
              </p>
            </div>
          )}

          {lingkup === 'desa' && (
            <div className="mb-5">
              <p className="mb-2 text-[12px] font-medium text-text-dim">Desa</p>
              <div className="grid gap-2">
                {desaTerbuka.map((d) => (
                  <KartuPilihan
                    key={d.id}
                    terpilih={desaId === d.id}
                    judul={d.nama}
                    onClick={() => {
                      setDesaId(d.id);
                      setError(null);
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {lingkup === 'ppg' && (
            <p className="mb-5 rounded-[var(--radius)] bg-panel-2 px-4 py-3 text-[12.5px] text-text-dim">
              Peran ini mencakup seluruh desa & kelompok se-PPG Surabaya Barat, jadi tidak perlu
              memilih lingkup. Hanya Admin Aplikasi yang sudah aktif yang dapat menyetujuinya.
            </p>
          )}

          {error && (
            <p className="mb-4 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={!namaValid || !peran || !scopeTerisi}
            onClick={() => setLangkah(2)}
            className="w-full cursor-pointer rounded-[var(--radius-button)] border-none bg-brass px-4 py-[13px] text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Lanjut
          </button>
          <button
            type="button"
            onClick={keluar}
            className="mt-2.5 w-full cursor-pointer border-none bg-transparent p-2 text-[13px] text-text-dim hover:text-brass hover:underline"
          >
            Keluar
          </button>
        </>
      ) : (
        <>
          <dl className="space-y-2.5 text-[13.5px]">
            <Baris label="Nama" nilai={nama.trim()} />
            <Baris
              label="Peran diminta"
              nilai={PERAN.find((p) => p.nilai === peran)?.judul ?? '-'}
            />
            <Baris
              label="Lingkup"
              nilai={
                lingkup === 'kelompok'
                  ? (kelompokList.find((k) => k.id === kelompokId)?.nama ?? '-')
                  : lingkup === 'desa'
                    ? (desaTerbuka.find((d) => d.id === desaId)?.nama ?? '-')
                    : 'Seluruh PPG'
              }
            />
            <Baris label="Akun" nilai={user?.email ?? '-'} />
          </dl>

          <p className="mt-5 rounded-[var(--radius)] bg-panel-2 px-4 py-3 text-[12.5px] text-text-dim">
            Menekan tombol di bawah TIDAK langsung memberi akses. Permintaan dikirim ke admin dulu;
            Anda akan bisa membuka data setelah disetujui.
          </p>

          {error && (
            <p className="mt-4 rounded-[var(--radius)] bg-[#FEF2F2] px-3.5 py-3 text-[13px] text-red">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={mengirim}
            onClick={kirim}
            className="mt-5 w-full cursor-pointer rounded-[var(--radius-button)] border-none bg-brand-green px-4 py-[13px] text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mengirim ? 'Mengirim...' : 'Kirim pendaftaran'}
          </button>
          <button
            type="button"
            disabled={mengirim}
            onClick={() => setLangkah(1)}
            className="mt-2.5 w-full cursor-pointer rounded-[var(--radius-button)] border border-border bg-panel px-4 py-3 text-[13.5px] font-semibold text-text hover:bg-panel-2"
          >
            Kembali
          </button>
        </>
      )}
    </Kartu>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-2.5 last:border-b-0">
      <dt className="shrink-0 text-text-dim">{label}</dt>
      <dd className="m-0 text-right font-semibold text-text">{nilai}</dd>
    </div>
  );
}
