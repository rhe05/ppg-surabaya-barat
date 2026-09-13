'use client';

/* Laporan Perkembangan Santri (admin desktop) — ditulis ulang total (20
   Agt, diminta owner): "cek app lama, minimal samakan, maksimal lebih
   premium, jangan norak/AI-slop". Versi SEBELUMNYA (git history) cuma
   pemilih 1 santri + tabel absensi mentah, tidak menyerupai fitur app
   lama sama sekali.

   Bentuk & rumus disalin dari tab desktop app lama (Markup_Screens.html
   ~3332-3369, Script_Main.html:6600-6797 window.loadLaporanPerkembangan-
   SantriHtml_/lpsBuildBodyHtml_/LPS_STATUS_WARNA_HEX_):
   - Toolbar: pilih Guru -> Kelas -> Bulan -> Tahun -> "Buat Laporan".
   - Hasil: judul+periode tengah, blok info Guru/Kelas/Jadwal/Ruangan
     2-kolom, 5 kartu metrik (Hari Aktif/Kehadiran/Izin/Alpa/Sakit), tabel
     detail per santri.
   - Klasifikasi & rumus SAMA PERSIS dgn components/laporan/GuruLaporanView.tsx
     (padanan guru mobile utk fitur yang sama) -- >=80% hadir -> 'Hadir',
     lalu izin -> 'Izin', lalu alpa -> 'Alpa', sisanya 'Sakit'.

   BEDA sengaja dari app lama: visual kartu metrik & tabel dibuat ulang
   memakai bahasa desain app baru (rounded-card/border-border/bg-panel,
   pola KartuRingkas yang sudah dipakai di SantriList.tsx/RingkasanKpi.tsx)
   -- BUKAN meniru border-top-3px flat app lama. Warna metrik dipetakan ke
   token app baru yang paling dekat maknanya: Hari Aktif=indigo (app lama
   jg indigo #4F46E5, kebetulan sama persis), Kehadiran=sage, Izin=brass,
   Alpa=red, Sakit=teal (app lama biru #3987e5, tidak ada di palet app
   baru -- teal dipilih krn belum dipakai metrik lain di kartu ini, bukan
   warna baru yang ditebak sembarangan). Sumber data kelas/santri pakai
   kelas.guru_id + santri.kelas_id (FK app baru), bukan jadwal_kbm teks

   PUTARAN KEDUA (20 Agt, diminta owner): "Unduh PDF" DIGANTI TOTAL dari
   jsPDF/autoTable (dokumen dibangun manual, tata letaknya beda dari yang
   tampil di layar) ke window.print() + CSS #laporan-cetak (app/globals.
   css) -- PERSIS teknik app lama (window.print(), lihat komentar "Print-
   to-PDF Laporan Perkembangan Santri" di Style_Main.html). Hasilnya
   render BROWSER ASLI dari markup yang SAMA PERSIS yang sudah tampil di
   layar (bukan dibangun ulang terpisah spt jsPDF) -- 100% sama persis
   tampilan web, klien murni (tanpa panggilan Supabase tambahan sama
   sekali saat unduh, datanya sudah ada di state dari "Buat Laporan"),
   tanpa backend baru, tanpa render server, instan, gratis.

   PUTARAN KETIGA (20 Agt, diminta owner): dua aturan tambahan, sama
   persis dgn GuruLaporanView.tsx --
   1. Laporan WAJIB per kelas -- opsi "Semua Kelas" DIHAPUS. Guru dgn 1
      kelas otomatis terpilih (bukan pilihan, cuma satu kemungkinan);
      guru dgn >1 kelas wajib pilih manual sebelum "Buat Laporan" aktif.
   2. "Unduh PDF" dikunci H-1 (cekEligible, sama rumus dgn
      iaLaporanCekEligible_) -- sebelumnya cuma dipasang di guru mobile,
      sekarang berlaku jg di desktop admin. "Buat Laporan" (preview)
      TETAP boleh kapan saja, cuma tombol cetaknya yang dikunci.
      ⚠️ DICABUT LAGI 2026-09-13 (diminta owner: "aktifkan, ini khusus
      utk admin aplikasi saja") -- admin desktop TIDAK terkunci H-1 lagi
      (cekEligible & tombol dibuka), GuruLaporanView.tsx (guru mobile)
      TETAP terkunci H-1 spt semula, tidak disentuh.
   bebas spt app lama. Data guru/kelas SUDAH scoped RLS (pola sama dgn
   GuruList.tsx/GuruForm.tsx -- select tanpa filter scope manual).

   PUTARAN KEEMPAT (20 Agt, diminta owner): tampilan blok cetak
   (id="laporan-cetak") DIPINDAH ke components/laporan/
   LaporanPerkembanganCetak.tsx, dipakai bareng dgn GuruLaporanView.tsx --
   sebelumnya dua berkas ini menulis markup blok cetak sendiri-sendiri dan
   diam-diam ngedrift (versi guru sempat kehilangan kartu Sakit & baris
   Jadwal KBM/Ruangan). Satu komponen = tidak bisa ngedrift lagi. */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  muatOverrideKelompok,
  saringAbsensiHariKerja,
  type PetaOverride,
} from '@/lib/kalenderKelompok';
import { terapkanGabunganAktif } from '@/lib/kelasGabungGilir';
import LaporanPerkembanganCetak, {
  type LaporanPerkembangan,
} from '@/components/laporan/LaporanPerkembanganCetak';
import {
  muatPengulanganKelas,
  muatPengulanganKelasDoa,
  muatProtaKelompok,
  namaKategori,
} from '@/lib/dataGuru';
import {
  targetAsmaulHusnaDari,
  ringkasPengulanganDoa,
  uraikanTargetDoa,
  adalahAsmaulHusna,
  kelasKurikulumSampai,
  muatHafalanDoaKelas,
} from '@/lib/materiHafalanDoa';
import { suratDariTargetProta, normalisasiNamaSurat, muatHafalanSuratKelas } from '@/lib/hafalanSurat';
import { hitungMateriNgaji } from '@/lib/tilawati';
import { pisahTilawatiAlquran, gradeRuangDari, KELAS_KURIKULUM_URUT } from '@/lib/kelasKurikulum';
import { targetKategoriBulanan } from '@/lib/targetAlquranKurikulum';

type Guru = { id: number; nama: string };
/* anggotaId: semua kelas_id FISIK tergabung ke kelas ini (Gabung Kelas
   "tanpa batas waktu", 2026-09-13, diminta owner: "laporannya dijadikan
   satu"). Lihat lib/kelasGabungGilir.ts. */
type Kelas = {
  id: number;
  nama: string;
  jam_mulai: string | null;
  jam_selesai: string | null;
  ruangan: string | null;
  santri_count: number | null;
  anggotaId: number[];
  anggotaDetail: { id: number; nama: string }[];
};
type Santri = { id: number; nama: string; kelas_id: number | null };
type Absensi = { santri_id: number; tanggal: string; status: string; kelompok_id: number | null };

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const SELECT_FILTER =
  'rounded-[var(--radius)] border border-border bg-panel px-3 py-2.5 text-[13px] text-text focus:border-brass focus:outline-none';

/* Kurikulum = data BERSAMA satu kelompok tetap (2026-08-22, lihat
   app/kurikulum/page.tsx KELOMPOK_KURIKULUM_BERSAMA_ID) -- disalin
   nilainya di sini (bukan diimpor, konstanta itu tidak diekspor dari
   halamannya) khusus utk mencocokkan baris Prota Hafalan Do'a. */
const KELOMPOK_KURIKULUM_BERSAMA_ID = 1;

/* Nama ruang ("1A", "PAUD/TK ...", dst) -> kelas Prota ("1", "PAUD-TK").
   SENGAJA satu kelas SAJA (bukan kumulatif spt opsiHafalanSurat di
   RencanaPembelajaranView.tsx) -- diminta owner: "cukup materi sesuai
   kelas tersebut, seumpama kelas 1 maka yang ditampilkan cukup materi
   di kelas 1 saja". Ruang tanpa angka & bukan PAUD (mis. "Remaja") ->
   null, RPC-nya cukup tidak menemukan baris yg cocok (bukan error). */
function kelasProtaDari(namaRuang: string): string | null {
  const n = namaRuang.toLowerCase();
  if (n.includes('paud')) return 'PAUD-TK';
  const angka = [...n.matchAll(/\d+/g)].map((m) => Number(m[0]));
  return angka.length > 0 ? String(Math.max(...angka)) : null;
}

function batasBulan(tahun: number, bulan: number) {
  const dua = (n: number) => String(n).padStart(2, '0');
  return {
    awal: `${tahun}-${dua(bulan)}-01`,
    akhir: `${tahun}-${dua(bulan)}-${dua(new Date(tahun, bulan, 0).getDate())}`,
  };
}

function jam(v: string | null) {
  return v ? v.slice(0, 5) : null;
}

function klasifikasi(hadir: number, izin: number, alpa: number, total: number) {
  if (total === 0) return 'Belum Ada Data';
  const persen = Math.round((hadir / total) * 100);
  if (persen >= 80) return 'Hadir';
  if (izin > 0) return 'Izin';
  if (alpa > 0) return 'Alpa';
  return 'Sakit';
}

export default function SantriProgressReport() {
  const [guruList, setGuruList] = useState<Guru[]>([]);
  const [guruId, setGuruId] = useState<number | ''>('');
  const [kelasList, setKelasList] = useState<Kelas[]>([]);
  const [kelasId, setKelasId] = useState<number | ''>('');

  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunPilihan = [sekarang.getFullYear() - 1, sekarang.getFullYear(), sekarang.getFullYear() + 1];

  const [laporan, setLaporan] = useState<LaporanPerkembangan | null>(null);
  const [membuat, setMembuat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('guru')
      .select('id, nama')
      .is('deleted_at', null)
      .order('nama')
      .then(({ data }) => setGuruList((data ?? []) as Guru[]));
  }, []);

  useEffect(() => {
    setKelasId('');
    setLaporan(null);
    if (guruId === '') {
      setKelasList([]);
      return;
    }
    supabase
      .from('kelas')
      .select('id, nama, jam_mulai, jam_selesai, ruangan, santri_count, kelompok_id')
      // guru utama ATAU guru gilir kedua (kelas.guru_id_2)
      .or(`guru_id.eq.${guruId},guru_id_2.eq.${guruId}`)
      .is('deleted_at', null)
      .order('nama')
      .then(async ({ data }) => {
        const mentah = (data ?? []) as (Kelas & { kelompok_id: number })[];
        /* Kelas yang sedang GABUNG AKTIF (2026-09-13, diminta owner:
           "laporannya dijadikan satu") dilipat jadi satu entri gabungan --
           sama pola muatKelasGuru() (lib/dataGuru.ts), tapi dipanggil
           terpisah di sini krn admin memilih guru & kelas bebas (bukan
           guru yang login). */
        const list = mentah.length > 0 ? await terapkanGabunganAktif(mentah, mentah[0].kelompok_id) : [];
        setKelasList(list);
        // Guru pegang 1 kelas -> otomatis terpilih (bukan "pilihan", cuma
        // satu-satunya kemungkinan). Guru pegang >1 kelas -> WAJIB dipilih
        // manual (diminta owner: laporan wajib per kelas, tidak boleh
        // "Semua Kelas" -- lihat komentar di kepala berkas).
        setKelasId(list.length === 1 ? list[0].id : '');
      });
  }, [guruId]);

  const buatLaporan = useCallback(async () => {
    if (guruId === '') {
      setError('Pilih guru terlebih dahulu.');
      return;
    }
    if (kelasId === '') {
      setError(kelasList.length === 0 ? 'Guru ini belum punya kelas.' : 'Pilih kelas terlebih dahulu — laporan wajib per kelas.');
      return;
    }
    setError(null);
    setMembuat(true);
    setLaporan(null);
    try {
      // WAJIB satu kelas (diminta owner) -- tidak ada lagi jalur "gabungan
      // semua kelas guru". `kelasIds` di bawah pakai anggotaId (BUKAN
      // cuma id kelas terpilih) supaya kelas yang sedang Gabung Kelas
      // aktif (2026-09-13) ikut terhitung di laporan.
      const kelasDipakai = kelasList.filter((k) => k.id === kelasId);
      const kelasIds = kelasDipakai.flatMap((k) => k.anggotaId);
      const { awal, akhir } = batasBulan(tahun, bulan);

      /* Santri yang pindah/nonaktif SETELAH bulan ini dimulai tetap ikut --
         deleted_at dipakai sbg "sejak kapan tidak aktif" (migrasi
         20260821130000), jadi laporan bulan yang sudah lewat tetap
         menunjukkan riwayatnya walau sekarang dia sudah tidak aktif. */
      const { data: dSantri, error: eSantri } = await supabase
        .from('santri')
        .select('id, nama, kelas_id')
        .in('kelas_id', kelasIds)
        .or(`deleted_at.is.null,deleted_at.gt.${awal}`)
        .order('nama');
      if (eSantri) throw new Error(eSantri.message);
      const santri = (dSantri ?? []) as Santri[];
      const santriIds = santri.map((s) => s.id);

      const absensi: Absensi[] = [];
      if (santriIds.length > 0) {
        const UKURAN_HALAMAN = 1000;
        for (let dari = 0; ; dari += UKURAN_HALAMAN) {
          const { data, error: eAbsensi } = await supabase
            .from('absensi')
            .select('santri_id, tanggal, status, kelompok_id')
            .in('santri_id', santriIds)
            .gte('tanggal', awal)
            .lte('tanggal', akhir)
            .is('deleted_at', null)
            .order('id', { ascending: true })
            .range(dari, dari + UKURAN_HALAMAN - 1);
          if (eAbsensi) throw new Error(eAbsensi.message);
          const batch = (data ?? []) as Absensi[];
          absensi.push(...batch);
          if (batch.length < UKURAN_HALAMAN) break;
        }
      }

      /* Buang sesi Sabtu/Minggu & tanggal libur kelompok -- "Hari Aktif"
         & persentase kehadiran ikut definisi baru (2026-08-27). */
      const kelompokId = absensi.find((a) => a.kelompok_id != null)?.kelompok_id ?? null;
      const override: PetaOverride = kelompokId
        ? await muatOverrideKelompok(kelompokId)
        : new Map();
      const absensiHariKerja = saringAbsensiHariKerja(absensi, override, kelasId);

      const tanggalAktif = new Set(absensiHariKerja.map((a) => a.tanggal));

      /* Materi Klasikal (2026-09-02, diminta owner, admin desktop) --
         Hafalan Surat: RPC yang sama dgn fitur Monitoring guru
         (lib/dataGuru.ts), periode SAMA PERSIS dgn laporan ini
         (bulan+tahun yg sudah dipilih di atas), kelas SAMA PERSIS jg
         (`p_kelas_id: kelasId`) -- rincian per-surat OTOMATIS cuma
         milik kelas ini, bukan daftar baku kurikulum.

         Hafalan Do'a: BEDA sumber -- bukan RPC pengulangan (belum ada
         data model), tapi kurikulum_prota kategori "Hafalan Do'a-Do'a
         Harian" (diminta owner 2026-09-02: "saya sudah input kurikulum
         materi haf doa di prota, tolong masukan ke perkembangan
         santri"). `muatProtaKelompok` singgahan bersama, dipanggil dgn
         `tahun` yg SAMA PERSIS dgn kalender laporan (kolom `tahun` di
         kurikulum_prota memang cuma tahun kalender polos, dicek
         langsung ke app/kurikulum/page.tsx). Baris Prota dicocokkan ke
         kelasDipakai[0].nama lewat kelasProtaDari() -- "cukup materi
         sesuai kelas tersebut", BUKAN kumulatif spt picker guru.
         Semester 1 (target) + Semester 2 (target2) digabung jadi satu
         daftar tahunan (lib/materiHafalanDoa.ts).

         Kalau salah satu/keduanya gagal, laporan tetap tampil --
         section "Materi Klasikal" cukup dilewati (lihat catatan try/
         catch di bawah), jangan sampai fitur tambahan menggagalkan
         seluruh laporan kehadiran yang sudah jadi kebutuhan utama. */
      let materiKlasikal: LaporanPerkembangan['materiKlasikal'];
      try {
        const [barisKlasikal, barisDoa] = await Promise.all([
          muatPengulanganKelas(kelasIds, awal, akhir),
          muatPengulanganKelasDoa(kelasIds, awal, akhir),
        ]);

        /* Surat: HANYA materi milik grade kelas ini (diminta owner
           2026-09-03, "seumpama ngajinya kelas 3 maka cukup tampilkan
           hasil materi klasikal di kelas 3 saja"). RPC mengembalikan
           realisasi klasikal RUANG ini apa adanya -- bisa memuat surat/
           doa jenjang di bawahnya krn cek-list Klasikal di Rencana
           bersifat kumulatif PAUD-TK s.d. kelas ruang. Saring ke daftar
           target Prota grade kelas itu sendiri (kelasProtaDari -> satu
           grade, BUKAN kumulatif) -- ini AMAN utk Surat krn teks Prota-
           nya sendiri berbentuk RENTANG "s/d" yg sudah mencakup jenjang
           di bawahnya.

           Do'a: BEDA (diubah 2026-09-13, ERROR_LOG #45) -- Prota Do'a
           per-grade cuma daftar do'a BARU semester itu (bukan rentang),
           jadi kalau disaring grade-sendiri-saja spt Surat, do'a jenjang
           sebelumnya yg diulang guru hilang semua dari laporan. Do'a
           dibuat KUMULATIF di bawah (lihat `gradeKumulatif`), Surat
           TETAP grade-sendiri seperti semula. */
        const kelasProta = kelasDipakai.length === 1 ? kelasProtaDari(kelasDipakai[0].nama) : null;
        const prota = kelasProta
          ? await muatProtaKelompok(KELOMPOK_KURIKULUM_BERSAMA_ID, tahun)
          : [];
        const cocokKategori = (p: (typeof prota)[number], bagian: string) =>
          p.kelas === kelasProta && (namaKategori(p.kategori_kbm) ?? '').toLowerCase().includes(bagian);
        const barisSuratProta = prota.find((p) => cocokKategori(p, 'hafalan surat'));
        const barisDoaProta = prota.find(
          (p) => cocokKategori(p, 'hafalan do') && (namaKategori(p.kategori_kbm) ?? '').toLowerCase().includes('harian'),
        );
        const targetAH = barisDoaProta
          ? targetAsmaulHusnaDari(barisDoaProta.target, barisDoaProta.target2)
          : null;

        let barisSuratDipakai = barisKlasikal;
        let barisDoaDipakai = barisDoa;
        if (kelasProta && (barisSuratProta || barisDoaProta)) {
          const suratKelas = new Set(
            [barisSuratProta?.target ?? null, barisSuratProta?.target2 ?? null]
              .flatMap((t) => suratDariTargetProta(t))
              .map(normalisasiNamaSurat),
          );
          barisSuratDipakai = barisKlasikal.filter((b) =>
            suratKelas.has(normalisasiNamaSurat(b.nama_surat)),
          );

          /* Do'a KUMULATIF PAUD-TK s.d. grade kelas ini (diubah
             2026-09-13, diminta owner, ERROR_LOG #45) -- BEDA dari Surat
             di atas yg cukup grade sendiri (teks Prota Surat "s/d" sudah
             otomatis mencakup jenjang di bawahnya). Prota Do'a per-grade
             cuma daftar do'a BARU semester itu (bukan rentang), jadi
             tanpa union lintas-grade, do'a jenjang sebelumnya yang wajar
             diulang guru ("Menerampilkan hafalan do'a pada jenjang
             sebelumnya") hilang semua dari laporan -- persis pola
             opsiHafalanDoa (RencanaPembelajaranView.tsx) yg SUDAH
             kumulatif, kartu ini menyusul. */
          const gradeKumulatif = new Set(kelasKurikulumSampai(kelasDipakai[0].nama));
          const doaKelas = new Set(
            prota
              .filter(
                (p) =>
                  gradeKumulatif.has(p.kelas ?? '') &&
                  (namaKategori(p.kategori_kbm) ?? '').toLowerCase().includes('hafalan do') &&
                  (namaKategori(p.kategori_kbm) ?? '').toLowerCase().includes('harian'),
              )
              .flatMap((p) => [p.target, p.target2])
              .flatMap((t) => uraikanTargetDoa(t))
              .map((s) => s.trim().toLowerCase()),
          );
          barisDoaDipakai = barisDoa.filter(
            (b) => adalahAsmaulHusna(b.nama_doa) || doaKelas.has(b.nama_doa.trim().toLowerCase()),
          );
        }

        materiKlasikal = {
          hafSurat: barisSuratDipakai.map((b) => ({ namaSurat: b.nama_surat, jumlah: b.jumlah })),
          hafDoa: ringkasPengulanganDoa(barisDoaDipakai, targetAH).map((b) => ({
            namaDoa: b.nama_doa,
            jumlah: b.jumlah,
          })),
        };
      } catch {
        materiKlasikal = undefined;
      }

      /* Materi Ngaji (2026-09-12, diminta owner): "di bawah Hafalan
         Do'a" -- PER SANTRI, sumber & rumus SAMA PERSIS dgn kartu
         "Tilawati"/"Al-Qur'an" di Monitoring Pencapaian Materi. Dipindah
         ke fungsi murni lib/tilawati.ts `hitungMateriNgaji` (2026-09-13)
         supaya bisa dipanggil DUA KALI kalau kelasnya sedang Gabung
         Kelas lintas-grade (diminta owner: "sesuaikan dengan kelasnya
         ... laporannya dijadikan satu") -- sekali per grade/anggotaIds
         dari pisahTilawatiAlquran, BUKAN sekali dari grade tertinggi
         seluruh gabungan (salah target/rubrik utk anggota grade rendah).
         Kegagalan TIDAK menggagalkan seluruh laporan (pola sama
         materiKlasikal). */
      /* Anggota fisik kelas (dipakai pisahTilawatiAlquran DAN grade
         tertinggi utk target Hafalan Surat/Do'a di bawah -- SATU sumber,
         jangan hitung ulang beda cara di tiap blok). */
      const detailAnggota =
        kelasDipakai.length === 1
          ? kelasDipakai[0].anggotaDetail
          : kelasDipakai.map((k) => ({ id: k.id, nama: k.nama }));
      /* Grade TERTINGGI di antara anggota (2026-09-14, diminta owner:
         "target hafalan surat dan hafalan do'a bisa ambilkan dari
         kurikulum") -- Hafalan Surat/Do'a TIDAK dipisah per-grade spt
         Tilawati/Al-Qur'an (satu tabel gabungan lintas-grade), jadi
         targetnya diambil dari grade tertinggi kelas ini, pola SAMA
         "tertinggi" yang dipakai pisahTilawatiAlquran utk grade Tilawati/
         Al-Qur'an masing2 bucket. */
      const gradeTertinggiKelas = detailAnggota.reduce((top, d) => {
        const g = gradeRuangDari(d.nama);
        return KELAS_KURIKULUM_URUT.indexOf(g) > KELAS_KURIKULUM_URUT.indexOf(top) ? g : top;
      }, '');

      let materiNgaji: LaporanPerkembangan['materiNgaji'];
      try {
        const { tilawatiIds, alquranIds, tilawatiGrade, alquranGrade } = pisahTilawatiAlquran(detailAnggota);
        const hasil = await Promise.all([
          hitungMateriNgaji(tilawatiIds, tilawatiGrade, tahun, bulan, NAMA_BULAN[bulan - 1], awal, akhir),
          hitungMateriNgaji(alquranIds, alquranGrade, tahun, bulan, NAMA_BULAN[bulan - 1], awal, akhir),
        ]);
        materiNgaji = hasil.filter((h): h is NonNullable<typeof h> => h !== null);
      } catch {
        materiNgaji = undefined;
      }

      /* Hafalan Surat-Surat Al-Qur'an -- PER SANTRI, "di bawah Materi
         Ngaji" (2026-09-13, diminta owner: sudah ada di Riwayat/
         Ringkasan Jurnal/Monitoring, tampilkan jg di sini). Sumber SAMA
         PERSIS ketiga layar itu (lib/hafalanSurat.ts
         muatHafalanSuratKelas, tabel hafalan_surat_pelaksanaan --
         terpisah dari Tilawati/Al-Qur'an di atas). Kegagalan TIDAK
         menggagalkan seluruh laporan (pola sama materiKlasikal/
         materiNgaji). */
      let materiHafalanSurat: LaporanPerkembangan['materiHafalanSurat'];
      try {
        const [hafalanSuratKelas, targetHafalanSurat] = await Promise.all([
          muatHafalanSuratKelas(kelasIds, awal, akhir),
          gradeTertinggiKelas
            ? targetKategoriBulanan("Hafalan Surat-Surat Al-Qur'an", gradeTertinggiKelas, tahun, bulan)
            : Promise.resolve(null),
        ]);
        materiHafalanSurat = {
          target: targetHafalanSurat ? `Target ${NAMA_BULAN[bulan - 1]}: ${targetHafalanSurat}` : null,
          baris: hafalanSuratKelas.map((s) => ({
            nama: s.nama,
            pencapaian: s.adaCatatan
              ? [s.terakhirSurat, s.terakhirAyat ? `Ayat ${s.terakhirAyat}` : null].filter(Boolean).join(' ')
              : '—',
            keterangan: s.adaCatatan
              ? [s.naik > 0 ? `${s.naik}× Naik` : null, s.tetap > 0 ? `${s.tetap}× Tetap` : null]
                  .filter(Boolean)
                  .join(', ') || '—'
              : '—',
          })),
        };
      } catch {
        materiHafalanSurat = undefined;
      }

      /* Hafalan Do'a-Do'a Harian -- PER SANTRI, "di sebelah Hafalan Surat
         Materi Ngaji" (2026-09-14, diminta owner: "tampilkan juga di
         laporan perkembangan santri"). Sumber SAMA pola Hafalan Surat di
         atas, tabel beda: lib/materiHafalanDoa.ts muatHafalanDoaKelas
         (tabel hafalan_doa_pelaksanaan). Kegagalan TIDAK menggagalkan
         seluruh laporan (pola sama materiHafalanSurat). */
      let materiHafalanDoa: LaporanPerkembangan['materiHafalanDoa'];
      try {
        const [hafalanDoaKelas, targetHafalanDoa] = await Promise.all([
          muatHafalanDoaKelas(kelasIds, awal, akhir),
          gradeTertinggiKelas
            ? targetKategoriBulanan("Hafalan Do'a-Do'a Harian", gradeTertinggiKelas, tahun, bulan)
            : Promise.resolve(null),
        ]);
        materiHafalanDoa = {
          target: targetHafalanDoa ? `Target ${NAMA_BULAN[bulan - 1]}: ${targetHafalanDoa}` : null,
          baris: hafalanDoaKelas.map((s) => ({
            nama: s.nama,
            pencapaian: s.adaCatatan ? (s.terakhirDoa ?? '—') : '—',
            keterangan: s.adaCatatan
              ? [s.naik > 0 ? `${s.naik}× Naik` : null, s.tetap > 0 ? `${s.tetap}× Tetap` : null]
                  .filter(Boolean)
                  .join(', ') || '—'
              : '—',
          })),
        };
      } catch {
        materiHafalanDoa = undefined;
      }

      const baris = santri.map((s) => {
        const milik = absensiHariKerja.filter((a) => a.santri_id === s.id);
        const hadir = milik.filter((a) => a.status === 'hadir').length;
        const izin = milik.filter((a) => a.status === 'izin').length;
        const sakit = milik.filter((a) => a.status === 'sakit').length;
        const alpa = milik.filter((a) => a.status === 'alpa').length;
        const total = milik.length;
        return {
          nama: s.nama,
          hariAktif: total,
          hadir,
          izin,
          sakit,
          alpa,
          persen: total > 0 ? Math.round((hadir / total) * 100) : null,
          status: klasifikasi(hadir, izin, alpa, total),
        };
      });

      const totalSantri = santri.length;
      const rataPersen =
        baris.filter((b) => b.persen !== null).length > 0
          ? Math.round(
              baris.reduce((s, b) => s + (b.persen ?? 0), 0) / baris.filter((b) => b.persen !== null).length,
            )
          : 0;

      const kelasLabel = kelasDipakai.length > 0 ? kelasDipakai.map((k) => k.nama).join(', ') : '—';
      const jadwalLabel =
        kelasDipakai.length === 0
          ? '—'
          : kelasDipakai.length === 1
            ? jam(kelasDipakai[0].jam_mulai) && jam(kelasDipakai[0].jam_selesai)
              ? `${jam(kelasDipakai[0].jam_mulai)}–${jam(kelasDipakai[0].jam_selesai)}`
              : '—'
            : kelasDipakai
                .map((k) => `${k.nama}: ${jam(k.jam_mulai) && jam(k.jam_selesai) ? `${jam(k.jam_mulai)}–${jam(k.jam_selesai)}` : '—'}`)
                .join('; ');
      const ruanganLabel =
        kelasDipakai.length === 0
          ? '—'
          : kelasDipakai.length === 1
            ? kelasDipakai[0].ruangan || '—'
            : kelasDipakai.map((k) => `${k.nama}: ${k.ruangan || '—'}`).join('; ');

      setLaporan({
        guruNama: guruList.find((g) => g.id === guruId)?.nama ?? '-',
        periode: `${NAMA_BULAN[bulan - 1]} ${tahun}`,
        kelasLabel,
        jadwalLabel,
        ruanganLabel,
        totalSantri,
        totalHariAktif: tanggalAktif.size,
        hadirPercent: rataPersen,
        totalIzin: baris.filter((b) => b.status === 'Izin').length,
        totalAlpa: baris.filter((b) => b.status === 'Alpa').length,
        totalSakit: baris.filter((b) => b.status === 'Sakit').length,
        baris,
        materiKlasikal,
        materiNgaji,
        materiHafalanSurat,
        materiHafalanDoa,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat laporan.');
    } finally {
      setMembuat(false);
    }
  }, [guruId, kelasId, kelasList, guruList, bulan, tahun]);

  // window.print() + CSS #laporan-cetak (app/globals.css) -- lihat komentar
  // di kepala berkas. Datanya sudah ada di state `laporan` (hasil "Buat
  // Laporan"), jadi unduh PDF TIDAK memanggil Supabase sama sekali.
  function unduhPdf() {
    if (!laporan) return;

    /* Nama berkas PDF diambil peramban dari document.title -- disamakan
       dgn jalur guru (GuruLaporanView.tsx), diminta owner 2026-08-28.
       Karakter terlarang di nama berkas dibuang; nama kelas boleh
       mengandung "/" (mis. "PAUD/TK") yang akan memotong nama berkas. */
    const judulAsli = document.title;
    const aman = (s: string) => s.replace(/[\\/:*?"<>|]/g, '-').trim();
    document.title = `Laporan Perkembangan Santri - ${aman(laporan.guruNama)} - ${aman(laporan.kelasLabel)}`;

    const pulihkan = () => {
      document.title = judulAsli;
      window.removeEventListener('afterprint', pulihkan);
    };
    window.addEventListener('afterprint', pulihkan);

    window.print();
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Guru</label>
          <select
            value={guruId}
            onChange={(e) => setGuruId(e.target.value === '' ? '' : Number(e.target.value))}
            className={`${SELECT_FILTER} min-w-[200px]`}
          >
            <option value="">-- Pilih Guru --</option>
            {guruList.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nama}
              </option>
            ))}
          </select>
        </div>

        {guruId !== '' && (
          <div>
            <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Kelas</label>
            <select
              value={kelasId}
              onChange={(e) => setKelasId(e.target.value === '' ? '' : Number(e.target.value))}
              className={`${SELECT_FILTER} min-w-[160px]`}
            >
              <option value="">-- Pilih Kelas --</option>
              {kelasList.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Bulan</label>
          <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))} className={SELECT_FILTER}>
            {NAMA_BULAN.map((nm, idx) => (
              <option key={nm} value={idx + 1}>
                {nm}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[11.5px] font-semibold text-text-dim">Tahun</label>
          <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))} className={SELECT_FILTER}>
            {tahunPilihan.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          disabled={membuat || guruId === '' || kelasId === ''}
          onClick={buatLaporan}
          className="cursor-pointer rounded-[var(--radius)] border border-brass bg-brass px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {membuat ? 'Membuat...' : 'Buat Laporan'}
        </button>

        <button
          type="button"
          disabled={!laporan}
          onClick={unduhPdf}
          className="cursor-pointer rounded-[var(--radius)] border border-border bg-panel-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-all duration-200 hover:bg-border disabled:cursor-not-allowed disabled:opacity-50"
        >
          Unduh PDF
        </button>
      </div>

      {/* Kunci H-1 (iaLaporanCekEligible_) DICABUT khusus admin desktop
         (2026-09-13, diminta owner: "aktifkan, ini khusus utk admin
         aplikasi saja") -- GuruLaporanView.tsx (guru mobile) TETAP
         terkunci H-1, tidak disentuh. */}
      {laporan && (
        <p className="mb-4 text-[11.5px] text-text-faint print:hidden">
          Membuka dialog cetak browser — pilih tujuan &ldquo;Simpan sebagai PDF&rdquo;.
        </p>
      )}

      {error && <p className="mb-4 text-[13px] text-red">{error}</p>}

      {!laporan && !error && (
        <div className="rounded-card border border-border bg-panel py-16 text-center text-[13px] text-text-faint shadow-[var(--shadow-card)]">
          Pilih guru, kelas, &amp; periode, lalu klik &ldquo;Buat Laporan&rdquo;.
        </div>
      )}

      {laporan && <LaporanPerkembanganCetak laporan={laporan} />}
    </div>
  );
}
