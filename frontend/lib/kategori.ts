/* Tabel `kategori_kbm` di Supabase MENCAMPUR dua namespace yang tidak boleh
   tertukar:

   1. Mata pelajaran KBM — "Bacaan Al-Qur'an", "Tajwid", "Akhlaq", dst.
      Dipakai oleh kurikulum_prota.kategori_kbm_id (11 nilai).
   2. Kategori JENJANG — keempat nilai di bawah. Dipakai oleh
      jadwal_kategori_hari.kategori_kbm_id, dan disalin sebagai TEKS ke
      jadwal_kbm.kategori.

   Tidak ada kolom pembeda di tabelnya, jadi pemisahan hanya bisa lewat
   daftar kanonik ini — sama seperti KATEGORI_JADWAL_ di app lama
   (Modul_MaintainJadwalKBM.gs:26). Dibuktikan di produksi: keempat nilai
   ini dipakai 0 baris kurikulum_prota, sedangkan 11 sisanya dipakai 0 baris
   jadwal_kategori_hari. */
export const KATEGORI_JENJANG = ['Cabe Rawit', 'Pra Remaja SMP', 'Remaja SMA', 'Muda-Mudi'];

/** Urutan hari baku (Senin dulu) — HARI_URUTAN_JKH_ di app lama. */
export const HARI_URUTAN = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

/* Nama kategori KBM di DB TETAP "Bacaan Al-Qur'an" utk semua kelas --
   ini murni ganti tampilan, bukan rename data, jadi Tambah Materi/
   filter/dst tidak perlu ikut berubah. Kelas PAUD/TK s.d. 3 menampilkan
   "Baca Huruf Al-Qur'an" (nama asli kategori sengaja dipakai sbg kunci
   pencocokan, BUKAN label yang sudah diganti -- supaya konsisten dgn
   fitur target2/deskripsi2 di kurikulum/page.tsx yang jg mengecek nama
   ASLI). Dipindah ke sini dari kurikulum/page.tsx (2026-08-23) supaya
   RencanaPembelajaranView.tsx bisa pakai label yang SAMA PERSIS saat
   menyusun daftar saran "Materi Ngaji" dari Kurikulum, bukan menduplikasi
   logikanya dan berisiko drift. */
export const KATEGORI_BACAAN_ALQURAN = "Bacaan Al-Qur'an";
export const KELAS_LABEL_BACA_HURUF = ['PAUD-TK', '1', '2', '3'];
export function namaMateriTampil(namaAsli: string, kelas: string | null) {
  if (namaAsli === KATEGORI_BACAAN_ALQURAN && KELAS_LABEL_BACA_HURUF.includes(kelas ?? '')) {
    return 'Baca Huruf Al-Qur\'an';
  }
  return namaAsli;
}
