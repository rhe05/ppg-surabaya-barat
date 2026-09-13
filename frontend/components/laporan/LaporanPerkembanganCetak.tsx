'use client';

/* Blok laporan siap-cetak "Laporan Perkembangan Santri" -- SATU sumber
   dipakai admin desktop (SantriProgressReport.tsx) & guru mobile
   (GuruLaporanView.tsx), diminta owner (20 Agt): "tampilan di mobile app
   dengan di print preview desktop tidak sama, samakan". Sebelumnya
   masing-masing menulis markup sendiri-sendiri dan diam-diam ngedrift --
   versi guru bahkan kehilangan kartu Sakit & baris Jadwal KBM/Ruangan yang
   ada di versi admin. Dengan satu komponen ini, hasil cetak (id=
   "laporan-cetak", CSS print di app/globals.css) DIJAMIN identik strukturnya
   apa pun jalur pembuatnya -- perbaikan cukup di satu tempat, tidak bisa
   ngedrift lagi.

   PUTARAN KELIMA (2026-09-02, diminta owner, admin desktop SAJA):
   section "Materi Klasikal" di paling bawah laporan. Field
   `materiKlasikal` SENGAJA opsional & section-nya HANYA dirender kalau
   field itu ADA -- SantriProgressReport.tsx (admin) mengisinya dari
   RPC `jurnal_pengulangan_kelas` yang sudah ada (lib/dataGuru.ts,
   fitur Monitoring guru), GuruLaporanView.tsx (mobile) SENGAJA TIDAK
   diubah/tidak mengisinya, jadi tampilan guru mobile 100% tidak
   berubah.

   PUTARAN KEENAM (2026-09-02, diminta owner): "Haf Surat" bukan lagi
   satu angka total, tapi RINCIAN per surat (nama + berapa kali
   diulang) -- pola SAMA PERSIS daftar "Per Kelas" di Monitoring guru
   (components/monitoring/PencapaianMateriView.tsx), krn RPC-nya SATU-
   SATUNYA sumber & memang sudah mengembalikan per-surat. Rincian ini
   OTOMATIS cuma milik kelas yang dipilih di laporan (RPC-nya menerima
   `p_kelas_id`) -- kelas 1 hanya menampilkan surat yang PERNAH benar2
   diulang klasikal di kelas 1 pada periode itu, bukan daftar baku
   kurikulum kelas 1.

   PUTARAN KETUJUH (2026-09-02, diminta owner): "Haf Do'a" bukan lagi
   placeholder kosong -- owner sudah mengisi Prota kategori "Hafalan
   Do'a-Do'a Harian" (target Semester 1 + target2 Semester 2), jadi
   sekarang menampilkan RINCIAN materi tahunan kelas itu (gabungan 2
   semester, lib/materiHafalanDoa.ts -- Asmaul Husna digabung jadi satu
   rentang, mis. "1 sampai 20" + "21 sampai 40" -> "1 sampai 40", TIDAK
   ditampilkan dua kali per semester). BEDA sifatnya dari Haf Surat:
   ini daftar TARGET KURIKULUM (rencana materi kelas itu SEPANJANG
   TAHUN AJARAN), BUKAN hitungan berapa kali benar2 diulang klasikal --
   krn data pengulangan Hafalan Do'a memang belum ada (fase 1 fitur
   Pengulangan cuma Hafalan Surat). Makanya tidak ada angka "N×" di
   baris Haf Do'a spt Haf Surat.

   PUTARAN KEDELAPAN (2026-09-02, diminta owner: "atur agar tampilannya
   horizontal saja" + "font nya jangan terlalu besar, cukup horizontal
   cukup utk satu baris saja"): rincian Hafalan Surat & Hafalan Do'a
   yang tadinya kartu bertumpuk VERTIKAL (satu baris per surat/do'a,
   selebar penuh) diganti CHIP/PIL horizontal ber-`flex-wrap` -- tiap
   surat/do'a jadi satu pil pendek (`whitespace-nowrap`, teksnya SATU
   baris, tidak pernah membungkus ke baris kedua di dalam pil itu
   sendiri), berjajar ke samping, baru turun ke baris berikutnya kalau
   lebarnya sudah penuh. Ukuran font diturunkan ke 11px (dari 12.5-13px)
   -- padat tanpa terasa sesak, krn tiap pil sudah punya jarak (gap)
   sendiri dari pil sebelahnya.

   PUTARAN KESEMBILAN (2026-09-02, diminta owner): baris "Menerampilkan
   hafalan do'a pada jenjang sebelumnya" -- SATU-SATUNYA baris yang
   bukan materi baru (ia cuma instruksi "ulangi materi jenjang
   sebelumnya", selalu muncul di kedua semester, lihat lib/
   materiHafalanDoa.ts) -- ditarik KELUAR dari daftar pil & ditaruh
   sbg teks polos TANPA bungkus pil, tepat di bawah label "Hafalan
   Do'a", SEBELUM pil-pil rincian materi (diminta owner: "tanpa di
   beri bungkus scope setelah itu baru rincian hafalan doanya"). Beda
   perlakuannya krn ia bukan satu materi spesifik spt "Asmaul Husna"
   atau "Doa dan dzikir setelah sholat" -- lebih tepat dibaca sbg
   catatan pengantar drpd item dlm daftar.

   PUTARAN KESEPULUH (2026-09-02, diminta owner, ada gambar contoh):
   owner menunjukkan mockup tabel kaku (kotak persegi bergaris,
   angka "1x" di tiap item Do'a) minta "yang lebih elegan, tidak
   terlalu kaku ... mungkin bagian ujungnya ada lekukan". DITANYAKAN
   dulu soal angka "1x" (krn Hafalan Do'a memang tidak py hitungan
   pengulangan sungguhan) -- owner pilih TANPA angka utk Do'a, hanya
   nama materinya. Bentuknya: bukan pil terpisah-pisah (renggang) &
   bukan tabel bergaris kaku -- SATU kartu tergabung per bagian
   (`divide-x divide-y divide-border`), `rounded-xl` + `overflow-hidden`
   di kartu pembungkusnya SAJA (bukan tiap item) -- garis antar-item
   lurus/kaku spt tabel, tapi UJUNG kartunya (4 sudut luar) melengkung.
   Hafalan Surat TETAP py angka "N×" (realisasi pengulangan sungguhan,
   beda sifat dgn Do'a).

   PUTARAN KESEBELAS (2026-09-02, diminta owner): dasarnya masih `flex
   flex-wrap` (2026-09-02 putaran ke-8/10) -- baris ke-2 dst TIDAK
   sejajar kolomnya dgn baris pertama krn lebar tiap item beda-beda
   (mengikuti panjang teksnya sendiri). Owner: "buat yang rapi seperti
   contoh yang saya kirim tapi tidak kaku antara kolom atas dan kolom
   bawah, mungkin terdiri dari 5 kolom" -- diganti `grid grid-cols-2
   sm:grid-cols-5` (persis pola 5 kartu metrik kehadiran di atasnya)
   supaya kolom ATAS & BAWAH benar2 sejajar (lebar tiap kolom otomatis
   seragam, isinya bisa membungkus ke baris kedua DI DALAM selnya
   sendiri kalau teksnya panjang -- `whitespace-nowrap` dicabut,
   pengulangan owner: "1x [di gambar] itu contoh, nanti kalau sudah
   jalan kemungkinan ada data pengulangan sungguhan spt Hafalan Surat"
   -- artinya STRUKTUR field-nya (bukan cuma tampilan) sudah harus siap
   menampung angka kalau `hafDoa` suatu saat berubah py hitungan;
   `MateriKlasikal.hafDoa: string[]` TIDAK diubah dulu krn belum ada
   data modelnya -- kalau nanti ada, tinggal ganti tipe & tambah
   kolom angka spt Hafalan Surat, bukan rombak ulang tata letaknya).

   PUTARAN KEDUA BELAS (2026-09-02, diminta owner): predikat "Menerampilkan
   hafalan do'a pada jenjang sebelumnya" DIPINDAH ke lib/materiHafalanDoa.ts
   (`adalahMenerampilkanJenjangSebelumnya`) supaya dipakai bareng dgn
   RencanaPembelajaranView.tsx (Tambah Materi Klasikal) TANPA menyalin
   regex-nya dua kali -- kedua tempat sekarang butuh predikat yg SAMA
   PERSIS (di sini utk menariknya jadi teks pengantar terpisah, di sana
   utk MEMBUANGNYA dari daftar cek-list sepenuhnya, diminta owner
   "cukup hapus di fitur ini saja jangan hapus ... yang di laporan
   perkembangan santri" -- makanya laporan ini TETAP menampilkannya,
   cuma bedanya sekarang predikatnya dari satu sumber). */


export type LaporanBaris = {
  nama: string;
  /* Jumlah sesi yang tercatat utk santri ini. TIDAK lagi jadi kolom tabel
     (diminta owner 2026-08-28) -- tetap disimpan karena `persen` dihitung
     darinya dan berguna kalau nanti dibutuhkan lagi. */
  hariAktif: number;
  hadir: number;
  izin: number;
  alpa: number;
  sakit: number;
  persen: number | null;
};

/* Satu surat + berapa kali diulang klasikal pada periode laporan --
   langsung dari RPC jurnal_pengulangan_kelas (sudah terurut jumlah
   desc lalu nama, lihat migrasi 20260902150000). */
export type PengulanganSuratBaris = { namaSurat: string; jumlah: number };

/* `hafSurat` & `hafDoa` sama sifatnya sejak 2026-09-03 (diminta owner:
   "materi klasikal hafalan doa munculkan seperti hafalan surat sudah
   pengulangan berapa kali"): RINCIAN per materi + berapa kali BENAR2
   diulang klasikal pada periode laporan (RPC jurnal_pengulangan_kelas /
   jurnal_pengulangan_kelas_doa). Asmaul Husna sudah diringkas jadi satu
   baris di sisi pemanggil (lib/materiHafalanDoa ringkasPengulanganDoa).
   Kosong = belum ada yang disampaikan pada periode itu, BUKAN error. */
export type PengulanganDoaBaris = { namaDoa: string; jumlah: number };
export type MateriKlasikal = {
  hafSurat: PengulanganSuratBaris[];
  hafDoa: PengulanganDoaBaris[];
};

/* "Materi Ngaji" (2026-09-12, diminta owner, admin-desktop SAJA -- pola
   sama `materiKlasikal`): PER SANTRI (bukan rincian per-materi spt
   Klasikal), sumber "Buku Jilid Tilawati"/"Al-Qur'an" yang SAMA PERSIS
   dgn kartu di Monitoring Pencapaian Materi (lib/tilawati.ts
   `muatBukuJilidKelas` + lib/pedomanTilawati.ts / lib/
   targetAlquranKurikulum.ts utk status BB/MB/BSH/BSB). `judul` = label
   materi sesuai jenjang kelas ("Baca Huruf Al-Qur'an" PAUD-TK s.d. 3,
   "Bacaan Al-Qur'an" kelas 4-9) -- SAMA batas `KELAS_LABEL_BACA_HURUF`
   yg dipakai Pelaksanaan/Riwayat/Monitoring. */
export type MateriNgajiBaris = { nama: string; pencapaian: string; keterangan: string };
export type MateriNgaji = {
  judul: string;
  /* "Target September: Jilid 2 · Hal 10-18 (Total 8 Halaman)" / "Target
     September: Juz 30 · 2 Lbr" -- kotak sama persis dgn Monitoring
     Pencapaian Materi (diminta owner 2026-09-12). null kalau kelas di
     luar pedoman Tilawati & belum ada data Kurikulum Al-Qur'an bulan
     itu. */
  target: string | null;
  baris: MateriNgajiBaris[];
};

/* "Hafalan Surat-Surat Al-Qur'an" per santri (2026-09-13, diminta owner:
   sudah ada di Riwayat/Ringkasan Jurnal/Monitoring, tampilkan jg di sini)
   -- pola tabel SAMA PERSIS MateriNgaji di atas (Nama/Pencapaian/
   Keterangan), sumber beda: lib/hafalanSurat.ts `muatHafalanSuratKelas`
   (tabel hafalan_surat_pelaksanaan, terpisah dari Tilawati/Al-Qur'an). */
export type HafalanSuratLaporanBaris = { nama: string; pencapaian: string; keterangan: string };
export type MateriHafalanSurat = { baris: HafalanSuratLaporanBaris[] };

export type LaporanPerkembangan = {
  guruNama: string;
  periode: string;
  kelasLabel: string;
  jadwalLabel: string;
  ruanganLabel: string;
  totalSantri: number;
  totalHariAktif: number;
  hadirPercent: number;
  totalIzin: number;
  totalAlpa: number;
  totalSakit: number;
  baris: LaporanBaris[];
  /* Opsional & admin-desktop-only, lihat catatan PUTARAN KELIMA di
     kepala berkas. */
  materiKlasikal?: MateriKlasikal;
  /* Opsional & admin-desktop-only jg, lihat komentar MateriNgaji di atas. */
  materiNgaji?: MateriNgaji;
  /* Opsional & admin-desktop-only jg, lihat komentar MateriHafalanSurat
     di atas. */
  materiHafalanSurat?: MateriHafalanSurat;
};

function KartuMetrik({ label, nilai, warna, catatan }: { label: string; nilai: string; warna: string; catatan: string }) {
  return (
    <div className="rounded-card border border-border bg-panel p-3.5 shadow-[var(--shadow-card)]">
      <div className="text-[10.5px] font-bold tracking-[0.4px] text-text uppercase">{label}</div>
      <div className="mt-1.5 text-[22px] leading-none font-extrabold" style={{ color: warna }}>
        {nilai}
      </div>
      <div className="mt-1.5 text-[8px] leading-tight text-text">{catatan}</div>
    </div>
  );
}

export default function LaporanPerkembanganCetak({ laporan }: { laporan: LaporanPerkembangan }) {
  const pct = (n: number) => (laporan.totalSantri ? Math.round((n / laporan.totalSantri) * 100) : 0);

  const hafDoa = laporan.materiKlasikal?.hafDoa ?? [];

  return (
    <div id="laporan-cetak" className="rounded-card border border-border bg-panel p-5 shadow-[var(--shadow-card)] sm:p-6">
      {/* Watermark pojok kanan atas (2026-09-13, diminta owner) --
          identitas sumber unduhan, ikut tercetak (bagian dari
          #laporan-cetak, bukan print:hidden). Baris tersendiri di ATAS
          judul (bukan absolute overlay) supaya tidak bertabrakan dgn
          judul yang center-aligned di layar sempit (guru mobile). */}
      <div className="mb-2 text-right text-[9px] font-semibold text-sage sm:text-[10px]">
        Diunduh dari Ruang Ngaji — Platform Manajemen Ngaji
      </div>
      <div className="mb-5 text-center sm:mb-6">
        <div className="text-[17px] font-extrabold text-text sm:text-[19px]">Laporan Perkembangan Santri</div>
        <div className="mt-1 text-[12.5px] text-text sm:text-[13px]">{laporan.periode}</div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] text-text sm:mb-6 sm:grid-cols-2">
        <div>
          <span className="inline-block min-w-[92px] font-bold">Guru</span>: Kak {laporan.guruNama}
        </div>
        <div>
          <span className="inline-block min-w-[92px] font-bold">Jadwal KBM</span>: {laporan.jadwalLabel}
        </div>
        <div>
          <span className="inline-block min-w-[92px] font-bold">Kelas</span>: {laporan.kelasLabel}
        </div>
        <div>
          <span className="inline-block min-w-[92px] font-bold">Ruangan</span>: {laporan.ruanganLabel}
        </div>
      </div>

      <div className="cetak-jaga-utuh mb-5 grid grid-cols-2 gap-2.5 sm:mb-6 sm:grid-cols-5 sm:gap-3">
        <KartuMetrik label="Hari Aktif" nilai={String(laporan.totalHariAktif)} warna="var(--indigo)" catatan="hari efektif bulan ini" />
        <KartuMetrik label="Kehadiran" nilai={`${laporan.hadirPercent}%`} warna="var(--sage)" catatan={`rata2 dari ${laporan.totalSantri} santri`} />
        <KartuMetrik label="Izin" nilai={String(laporan.totalIzin)} warna="var(--brass)" catatan={`${pct(laporan.totalIzin)}% santri`} />
        <KartuMetrik label="Alpa" nilai={String(laporan.totalAlpa)} warna="var(--red)" catatan={`${pct(laporan.totalAlpa)}% santri`} />
        <KartuMetrik label="Sakit" nilai={String(laporan.totalSakit)} warna="var(--teal)" catatan={`${pct(laporan.totalSakit)}% santri`} />
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full border-collapse text-left text-[12px] sm:text-[13px]">
          <thead className="border-b border-border bg-panel-2">
            <tr>
              {['Nama', '%Hadir', 'Hadir', 'Izin', 'Alpa', 'Sakit'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-[10px] font-bold tracking-[0.3px] text-text uppercase sm:px-4 sm:py-3 sm:text-[11px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {laporan.baris.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-faint">
                  Belum ada santri di kelas ini.
                </td>
              </tr>
            ) : (
              laporan.baris.map((b) => (
                <tr key={b.nama}>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.nama}</td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">
                    {b.persen !== null ? `${b.persen}%` : '—'}
                  </td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.hadir}</td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.izin}</td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.alpa}</td>
                  <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.sakit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Materi Klasikal DIPINDAH ke paling bawah (2026-09-02, diminta
          owner: "letakan materi klasikal di bawah kolom nama kehadiran
          santri, letakan paling bawah") -- sebelumnya di antara 5 kartu
          metrik kehadiran & tabel santri. */}
      {laporan.materiKlasikal && (
        <div className="cetak-jaga-utuh mt-5 sm:mt-6">
          <div className="mb-2.5 text-[12px] font-bold tracking-[0.3px] text-text uppercase sm:text-[12.5px]">
            Materi Klasikal
          </div>

          <div className="mb-1.5 text-[11px] font-bold tracking-[0.3px] text-text-dim uppercase">
            Hafalan Surat Klasikal
          </div>
          {laporan.materiKlasikal.hafSurat.length === 0 ? (
            <div className="mb-4 text-[11px] text-text-faint">
              Belum ada Hafalan Surat Klasikal yang disampaikan pada periode ini.
            </div>
          ) : (
            <div className="mb-4 grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border sm:grid-cols-5">
              {laporan.materiKlasikal.hafSurat.map((b) => (
                <span key={b.namaSurat} className="flex items-center justify-between gap-2 bg-panel px-3 py-1.5 text-[11px] text-text">
                  <span className="truncate">{b.namaSurat}</span>
                  <span className="shrink-0 font-extrabold" style={{ color: 'var(--violet)' }}>
                    {b.jumlah}×
                  </span>
                </span>
              ))}
            </div>
          )}

          <div className="mb-1.5 text-[11px] font-bold tracking-[0.3px] text-text-dim uppercase">
            Hafalan Do&rsquo;a
          </div>
          {hafDoa.length === 0 ? (
            <div className="text-[11px] text-text-faint">
              Belum ada materi Klasikal Hafalan Do&rsquo;a yang disampaikan pada periode ini.
            </div>
          ) : (
            <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border sm:grid-cols-5">
              {hafDoa.map((b) => (
                <span
                  key={b.namaDoa}
                  className="flex items-center justify-between gap-2 bg-panel px-3 py-1.5 text-[11px] text-text"
                >
                  <span className="truncate">{b.namaDoa}</span>
                  <span className="shrink-0 font-extrabold" style={{ color: 'var(--violet)' }}>
                    {b.jumlah}×
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Materi Ngaji + Hafalan Surat Materi Ngaji -- SATU tabel (diubah
          2026-09-13, diminta owner: "letakan di sebelah Bacaan Al-Qur'an
          ... namanya ngikut, tidak terlalu banyak kolom [tabel]" --
          sebelumnya dua tabel terpisah tiap-tiap py kolom Nama sendiri,
          jadi nama santri tampil dobel). Digabung per santri lewat Map
          nama -> baris Hafalan Surat (kedua daftar berasal dari roster
          kelas yang sama, tapi dicocokkan by nama, BUKAN by index --
          lebih aman kalau suatu saat sumbernya beda urutan). Kolom
          Hafalan Surat hanya muncul kalau datanya ADA
          (laporan.materiHafalanSurat ada). Section TETAP muncul kalau
          SALAH SATU ada saja -- kelas tanpa grade angka (mis. "Pra
          Remaja SMP") tidak punya materiNgaji (kelasProtaDari -> null)
          tapi tetap bisa punya catatan Hafalan Surat.

          ⚠️ PENAMAAN (2026-09-13, diminta owner, laporan kelas Baban Kelp
          Petemon): "Hafalan Surat" polos dipakai DUA KALI dgn ARTI BEDA
          di laporan yang sama -- sub-judul "Materi Klasikal" di atas
          (aggregat class-wide dari checklist Klasikal, RPC
          jurnal_pengulangan_kelas) vs kolom tabel di sini (PER SANTRI,
          dari kartu "Hafalan Surat-Surat Al-Qur'an" di Pelaksanaan,
          tabel hafalan_surat_pelaksanaan) -- data & sumbernya BEDA TOTAL
          walau namanya kebetulan sama, gampang disalahsangka satu
          fitur/dobel-hitung. Label di sini & di "Materi Klasikal" SELALU
          diberi akhiran "Klasikal"/"Materi Ngaji" spy tidak ambigu lagi
          (pola SAMA dgn Monitoring Pencapaian Materi yg SUDAH benar:
          "Klasikal - Hafalan Surat" vs "Hafalan Surat-Surat Al-Qur'an"). */}
      {(laporan.materiNgaji || laporan.materiHafalanSurat) && (
        <div className="cetak-jaga-utuh mt-5 sm:mt-6">
          <div className="mb-2.5 text-[12px] font-bold tracking-[0.3px] text-text uppercase sm:text-[12.5px]">
            {laporan.materiNgaji ? 'Materi Ngaji' : 'Hafalan Surat Materi Ngaji'}
          </div>
          {laporan.materiNgaji && (
            <div className="mb-1.5 text-[11px] font-bold tracking-[0.3px] text-text-dim uppercase">
              {laporan.materiNgaji.judul}
              {laporan.materiHafalanSurat ? ' & Hafalan Surat Materi Ngaji' : ''}
            </div>
          )}
          {laporan.materiNgaji?.target && (
            <div className="mb-2.5 rounded-[var(--radius)] bg-indigo-lembut px-3 py-2 text-[12px] font-semibold text-indigo">
              {laporan.materiNgaji.target}
            </div>
          )}
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
            <table className="w-full border-collapse text-left text-[12px] sm:text-[13px]">
              <thead className="border-b border-border bg-panel-2">
                <tr>
                  {[
                    'Nama',
                    ...(laporan.materiNgaji ? ['Pencapaian', 'Keterangan'] : []),
                    ...(laporan.materiHafalanSurat ? ['Hafalan Surat (Materi Ngaji)', 'Keterangan'] : []),
                  ].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className="px-3 py-2.5 text-[10px] font-bold tracking-[0.3px] text-text uppercase sm:px-4 sm:py-3 sm:text-[11px]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(laporan.materiNgaji?.baris ?? laporan.materiHafalanSurat?.baris ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={1 + (laporan.materiNgaji ? 2 : 0) + (laporan.materiHafalanSurat ? 2 : 0)}
                      className="px-4 py-8 text-center text-text-faint"
                    >
                      Belum ada santri di kelas ini.
                    </td>
                  </tr>
                ) : (
                  (laporan.materiNgaji?.baris ?? laporan.materiHafalanSurat?.baris ?? []).map((b) => {
                    const hs = laporan.materiHafalanSurat?.baris.find((h) => h.nama === b.nama);
                    return (
                      <tr key={b.nama}>
                        <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">{b.nama}</td>
                        {laporan.materiNgaji && (
                          <>
                            <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">
                              {b.pencapaian}
                            </td>
                            <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">
                              {b.keterangan}
                            </td>
                          </>
                        )}
                        {laporan.materiHafalanSurat && (
                          <>
                            <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">
                              {laporan.materiNgaji ? (hs?.pencapaian ?? '—') : b.pencapaian}
                            </td>
                            <td className="border-b border-border px-3 py-2 text-text sm:px-4 sm:py-2.5">
                              {laporan.materiNgaji
                                ? (hs?.keterangan ?? 'Belum ada catatan bulan ini')
                                : b.keterangan}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
