/* Dipakai bersama Pelaksanaan & Riwayat Pembelajaran (dipindah ke lib/
   2026-09-02 saat Riwayat ikut memakai susunan judul bertingkat yang
   sama -- menyalinnya ke dua tempat pasti melenceng cepat atau lambat). */

/* Judul materi disusun bertingkat, bukan satu kalimat panjang yang
   membungkus dua baris (2026-09-02, diminta owner). Bentuk yang ditulis
   RencanaPembelajaranView saat guru memilih dari Kurikulum adalah
   "Klasikal — Hafalan Surat: Al-Lahab, An-Nasr, Al-Kafirun": bagian
   sebelum "—" adalah KATEGORI, sebelum ":" judul sesungguhnya, sisanya
   rincian. Judul bebas (materi tambahan yg diketik guru) tidak punya
   pemisah itu dan dikembalikan apa adanya sbg `utama` -- fungsi ini
   tidak boleh memotong apa pun yang tidak dikenalinya. */
export function pecahJudulMateri(judul: string): { kategori: string | null; utama: string; rincian: string | null } {
  let sisa = judul.trim();
  let kategori: string | null = null;
  const pisahKategori = sisa.split(/\s+[—–]\s+/);
  if (pisahKategori.length === 2) {
    kategori = pisahKategori[0].trim();
    sisa = pisahKategori[1].trim();
  }
  const pisahRincian = sisa.indexOf(': ');
  if (pisahRincian > 0) {
    return {
      kategori,
      utama: sisa.slice(0, pisahRincian).trim(),
      rincian: sisa.slice(pisahRincian + 2).trim(),
    };
  }
  return { kategori, utama: sisa, rincian: null };
}
