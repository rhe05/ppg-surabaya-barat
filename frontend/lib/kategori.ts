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
